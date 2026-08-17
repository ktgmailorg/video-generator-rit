import { mkdir, readFile, rename } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname, extname, join, resolve } from "node:path";
import { ArtifactStore } from "../core/artifact-store.mjs";
import {
  atomicWriteJson,
  sha256,
  stableStringify,
} from "../core/canonical.mjs";
import { assertDataRoute } from "../core/data-policy.mjs";
import { validateInlineSchema } from "../core/schema.mjs";
import { assertGenerationRequest } from "./capabilities.mjs";
import { ProviderError, isFallbackEligible } from "./errors.mjs";
import { ProviderRegistry } from "./registry.mjs";

const sleep = (milliseconds) =>
  new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));

export class ProviderExecutionEngine {
  constructor({
    config,
    registry = ProviderRegistry.fromConfig(config),
    artifactStore = new ArtifactStore(
      config.workflow.cacheRoot || ".video-cache",
    ),
    mode = config.workflow.determinism,
    onEvent,
  }) {
    this.config = config;
    this.registry = registry;
    this.artifactStore = artifactStore;
    this.mode = mode;
    this.onEvent = onEvent;
    this.records = [];
    this.providerManifests = {};
    this.totalCostUsd = 0;
  }

  async executeRole(roleName, request, context = {}) {
    const role = this.config.roles[roleName];
    if (!role) throw new TypeError(`No provider is configured for role ${roleName}`);
    const profiles =
      this.mode === "frozen"
        ? [role.primary]
        : [role.primary, ...(role.fallbacks || [])];
    let lastError;
    for (const [index, profileName] of profiles.entries()) {
      try {
        const result = await this.executeProfile(
          profileName,
          {
            ...request,
            dataClassification:
              request.dataClassification ||
              this.config.dataPolicy.classification,
          },
          { ...context, roleName },
        );
        return await this.#ensureStructuredOutput(
          roleName,
          profileName,
          request,
          result,
          context,
        );
      } catch (error) {
        lastError = error;
        const fallback =
          index < profiles.length - 1 && isFallbackEligible(error);
        this.#event({
          type: "provider-error",
          roleName,
          profileName,
          code: error.code,
          message: error.message,
          fallback,
        });
        if (!fallback) throw error;
      }
    }
    throw lastError;
  }

  async previewRole(roleName, requestValue) {
    const role = this.config.roles[roleName];
    if (!role) {
      return {
        roleName,
        configured: false,
        error: `No provider is configured for role ${roleName}`,
      };
    }
    const profileName = role.primary;
    const profile = this.config.providers[profileName];
    const adapter = this.registry.get(profileName);
    const manifest = await this.registry.manifest(profileName);
    const request = assertGenerationRequest({
      ...requestValue,
      dataClassification:
        requestValue.dataClassification ||
        this.config.dataPolicy.classification,
      model: requestValue.model || profile.model,
    });
    assertDataRoute({
      classification: request.dataClassification,
      profileName,
      provider: manifest,
      ...this.config.dataPolicy,
    });
    const lookupSha256 = sha256({
      schemaVersion: 1,
      profileName,
      adapter: manifest,
      profile: redactProfile(profile),
      request,
    });
    const cached = await this.#readCache(lookupSha256);
    const estimate =
      typeof adapter.estimate === "function"
        ? await adapter.estimate(request)
        : { known: false, costUsd: null };
    return {
      roleName,
      configured: true,
      profileName,
      capability: request.capability,
      model: request.model,
      executionLocation: manifest.executionLocation,
      lookupSha256,
      cacheHit: Boolean(cached),
      estimatedCost: estimate,
    };
  }

  async executeProfile(profileName, requestValue, context = {}) {
    const profile = this.config.providers[profileName];
    if (!profile) throw new TypeError(`Unknown provider profile: ${profileName}`);
    const adapter = this.registry.get(profileName);
    const manifest = await this.registry.manifest(profileName);
    this.providerManifests[profileName] = manifest;
    const request = assertGenerationRequest({
      ...requestValue,
      model: requestValue.model || profile.model,
    });
    if (!manifest.capabilities.includes(request.capability)) {
      throw new TypeError(
        `${profileName} does not advertise ${request.capability}`,
      );
    }
    assertDataRoute({
      classification: request.dataClassification || "public",
      profileName,
      provider: manifest,
      ...this.config.dataPolicy,
    });
    const requestKey = {
      schemaVersion: 1,
      profileName,
      adapter: manifest,
      profile: redactProfile(profile),
      request,
    };
    const lookupSha256 = sha256(requestKey);
    let cached = await this.#readCache(lookupSha256);
    if (this.mode !== "fresh" && cached) {
      try {
        await this.#verifyCachedArtifacts(cached);
        const record = {
          ...cached,
          cacheHit: true,
          roleName: context.roleName,
        };
        this.records.push(record);
        this.#event({
          type: "provider-cache-hit",
          roleName: context.roleName,
          profileName,
          requestSha256: cached.requestSha256,
          lookupSha256,
        });
        return {
          ...cached.result,
          requestSha256: cached.requestSha256,
          lookupSha256,
          cacheHit: true,
        };
      } catch (error) {
        if (this.mode === "frozen") throw error;
        await this.#quarantineCache(lookupSha256, cached);
        cached = null;
        this.#event({
          type: "provider-cache-quarantined",
          roleName: context.roleName,
          profileName,
          lookupSha256,
          message: error.message,
        });
      }
    }
    if (this.mode === "frozen") {
      const error = new ProviderError(
        `Frozen replay cache miss for ${profileName}:${request.capability}`,
        {
          code: "FROZEN_CACHE_MISS",
          details: { lookupSha256 },
        },
      );
      throw error;
    }
    await this.#enforceBudget(adapter, request);
    const startedAt = new Date().toISOString();
    const started = performance.now();
    this.#event({
      type: "provider-start",
      roleName: context.roleName,
      profileName,
      capability: request.capability,
      lookupSha256,
    });
    const priorJob =
      this.mode === "record"
        ? await this.#readJob(lookupSha256)
        : null;
    const response = await this.#executeWithRetry(adapter, request, {
      ...context,
      resumeJob: priorJob,
      onProgress: async (progress) => {
        await this.#writeJob(lookupSha256, {
          schemaVersion: 1,
          profileName,
          capability: request.capability,
          lookupSha256,
          ...progress,
        });
        this.#event({
          type: "provider-job",
          roleName: context.roleName,
          profileName,
          capability: request.capability,
          lookupSha256,
          ...progress,
        });
        await context.onProgress?.(progress);
      },
    });
    validateResponseConstraints(request, response);
    const artifacts = [];
    for (const artifact of response.artifacts || []) {
      artifacts.push(
        await this.artifactStore.putBytes(artifact.bytes, {
          filename: artifact.filename,
          mimeType: artifact.mimeType,
          extension: extname(artifact.filename || ""),
        }),
      );
    }
    const rawArtifact = await this.artifactStore.putBytes(
      `${stableStringify(response.raw || {}, 2)}\n`,
      {
        filename: "provider-response.json",
        extension: ".json",
        mimeType: "application/json",
      },
    );
    const costUsd =
      response.costUsd === undefined || response.costUsd === null
        ? null
        : Number(response.costUsd);
    if (costUsd !== null && Number.isFinite(costUsd)) {
      this.totalCostUsd += costUsd;
      this.#checkSpentBudget();
    }
    const resolvedModelRevision =
      response.modelRevision ||
      request.model ||
      `${manifest.id}@${manifest.version}`;
    const requestSha256 = sha256({
      ...requestKey,
      resolvedModelRevision,
    });
    const result = {
      schemaVersion: 1,
      output: response.output || {},
      artifacts,
      rawResponse: rawArtifact,
      usage: response.usage || {},
      costUsd,
      requestId: response.requestId,
      modelRevision: resolvedModelRevision,
      finishReason: response.finishReason || "stop",
    };
    const record = {
      schemaVersion: 1,
      requestSha256,
      lookupSha256,
      profileName,
      roleName: context.roleName,
      capability: request.capability,
      model: request.model,
      request,
      startedAt,
      durationMs: Math.round(performance.now() - started),
      cacheHit: false,
      result,
    };
    await this.#writeCache(lookupSha256, record);
    this.records.push(record);
    this.#event({
      type: "provider-complete",
      roleName: context.roleName,
      profileName,
      capability: request.capability,
      requestSha256,
      lookupSha256,
      durationMs: record.durationMs,
      costUsd,
    });
    return { ...result, requestSha256, lookupSha256, cacheHit: false };
  }

  async #ensureStructuredOutput(
    roleName,
    profileName,
    request,
    result,
    context,
  ) {
    if (!request.outputSchema) return result;
    const finish = String(result.finishReason || "").toLowerCase();
    if (finish.includes("refusal")) {
      throw new ProviderError("Provider refused the structured request", {
        code: "SAFETY_REFUSAL",
      });
    }
    if (
      finish.includes("max") ||
      finish.includes("incomplete") ||
      finish.includes("failed")
    ) {
      throw new ProviderError(
        `Structured output ended with ${result.finishReason}`,
        { code: "INVALID_STRUCTURED_OUTPUT" },
      );
    }
    const validation = result.output.invalidJson
      ? {
          valid: false,
          errors: [{ path: "/", message: "response was not valid JSON" }],
        }
      : validateInlineSchema(request.outputSchema, result.output.json);
    if (validation.valid) return result;
    if (context.repairAttempt) {
      throw new ProviderError("Structured output failed validation after repair", {
        code: "INVALID_STRUCTURED_OUTPUT",
        details: { errors: validation.errors },
      });
    }
    const repairRequest = {
      schemaVersion: 1,
      capability: "text.generate",
      model: request.model,
      dataClassification:
        request.dataClassification || this.config.dataPolicy.classification,
      schemaName: request.schemaName,
      outputSchema: request.outputSchema,
      input: {
        instructions:
          "Repair the supplied output. Return only JSON matching the schema. Do not add facts.",
        prompt: [
          "Invalid output:",
          result.output.text || stableStringify(result.output),
          "Validation issues:",
          stableStringify(validation.errors),
        ].join("\n\n"),
      },
      parameters: request.repairParameters || {},
      metadata: {
        purpose: "structured-output-repair",
        originalRequestSha256: result.requestSha256,
      },
    };
    this.#event({
      type: "structured-output-repair",
      roleName,
      profileName,
      originalRequestSha256: result.requestSha256,
    });
    const repaired = await this.executeProfile(profileName, repairRequest, {
      ...context,
      roleName,
      repairAttempt: true,
    });
    return this.#ensureStructuredOutput(
      roleName,
      profileName,
      repairRequest,
      repaired,
      { ...context, repairAttempt: true },
    );
  }

  async #executeWithRetry(adapter, request, context) {
    const attempts = request.capability === "text.generate" ? 3 : 1;
    let lastError;
    for (let attempt = 1; attempt <= attempts; attempt += 1) {
      try {
        return await adapter.execute(request, context);
      } catch (error) {
        lastError = error;
        if (!error.retryable || attempt === attempts) throw error;
        await sleep(250 * 2 ** (attempt - 1));
      }
    }
    throw lastError;
  }

  async #enforceBudget(adapter, request) {
    const maximum = this.config.workflow.maxCostUsd;
    if (maximum === null || maximum === undefined) return;
    const estimate =
      typeof adapter.estimate === "function"
        ? await adapter.estimate(request)
        : { known: false, costUsd: null };
    if (!estimate.known && !this.config.workflow.allowUnknownCost) {
      throw new ProviderError(
        `Cost is unknown for ${request.capability}; set allowUnknownCost to proceed`,
        { code: "UNKNOWN_COST" },
      );
    }
    if (
      estimate.known &&
      this.totalCostUsd + Number(estimate.costUsd) > maximum
    ) {
      throw new ProviderError(
        `Estimated cost would exceed the ${maximum} USD run budget`,
        { code: "COST_BUDGET_EXCEEDED" },
      );
    }
  }

  #checkSpentBudget() {
    const maximum = this.config.workflow.maxCostUsd;
    if (maximum !== null && maximum !== undefined && this.totalCostUsd > maximum) {
      throw new ProviderError(
        `Reported cost exceeded the ${maximum} USD run budget`,
        { code: "COST_BUDGET_EXCEEDED" },
      );
    }
  }

  #cachePath(requestSha256) {
    return join(
      resolve(this.artifactStore.root),
      "requests",
      requestSha256.slice(0, 2),
      `${requestSha256}.json`,
    );
  }

  async #readCache(requestSha256) {
    try {
      return JSON.parse(await readFile(this.#cachePath(requestSha256), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async #writeCache(lookupSha256, record) {
    const path = this.#cachePath(lookupSha256);
    await mkdir(dirname(path), { recursive: true });
    await atomicWriteJson(path, record, { mode: 0o600 });
  }

  #jobPath(lookupSha256) {
    return join(
      resolve(this.artifactStore.root),
      "jobs",
      lookupSha256.slice(0, 2),
      `${lookupSha256}.json`,
    );
  }

  async #readJob(lookupSha256) {
    try {
      return JSON.parse(await readFile(this.#jobPath(lookupSha256), "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
  }

  async #writeJob(lookupSha256, job) {
    const path = this.#jobPath(lookupSha256);
    await mkdir(dirname(path), { recursive: true });
    await atomicWriteJson(path, job, { mode: 0o600 });
  }

  async #verifyCachedArtifacts(record) {
    for (const reference of [
      ...(record.result?.artifacts || []),
      ...(record.result?.rawResponse ? [record.result.rawResponse] : []),
    ]) {
      const verification = await this.artifactStore.verify(reference);
      if (!verification.ok) {
        throw new ProviderError(
          `Cached artifact ${reference.sha256} is ${verification.reason}`,
          {
            code: "CORRUPT_CACHE_ENTRY",
            details: { reference, verification },
          },
        );
      }
    }
  }

  async #quarantineCache(lookupSha256, record) {
    const quarantineRoot = join(
      resolve(this.artifactStore.root),
      "quarantine",
      `${lookupSha256}-${randomUUID()}`,
    );
    await mkdir(quarantineRoot, { recursive: true });
    await rename(
      this.#cachePath(lookupSha256),
      join(quarantineRoot, "request.json"),
    ).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
    for (const reference of [
      ...(record.result?.artifacts || []),
      ...(record.result?.rawResponse ? [record.result.rawResponse] : []),
    ]) {
      const verification = await this.artifactStore.verify(reference);
      if (verification.ok || verification.reason === "missing") continue;
      await rename(
        verification.path,
        join(quarantineRoot, `artifact-${reference.sha256}${reference.extension || ""}`),
      ).catch((error) => {
        if (error.code !== "ENOENT") throw error;
      });
    }
  }

  #event(event) {
    this.onEvent?.({ at: new Date().toISOString(), ...event });
  }
}

function redactProfile(profile) {
  return Object.fromEntries(
    Object.entries(profile).filter(([key]) => {
      const lower = key.toLowerCase();
      return !lower.includes("secret") && !lower.includes("apikeyvalue");
    }),
  );
}

function validateResponseConstraints(request, response) {
  const artifacts = response.artifacts || [];
  const allowedMimeTypes = request.expectedOutput?.mimeTypes;
  const maximumBytes = request.expectedOutput?.maximumBytes;
  let totalBytes = 0;
  for (const artifact of artifacts) {
    if (!artifact.bytes) {
      throw new ProviderError("Provider artifact is missing bytes", {
        code: "INVALID_PROVIDER_RESPONSE",
      });
    }
    totalBytes += Buffer.byteLength(artifact.bytes);
    if (
      allowedMimeTypes?.length &&
      !allowedMimeTypes.includes(
        String(artifact.mimeType || "").split(";")[0],
      )
    ) {
      throw new ProviderError(
        `Provider returned unexpected MIME type ${artifact.mimeType}`,
        { code: "INVALID_PROVIDER_RESPONSE" },
      );
    }
  }
  if (maximumBytes && totalBytes > maximumBytes) {
    throw new ProviderError(
      `Provider artifacts exceed the ${maximumBytes}-byte output limit`,
      { code: "INVALID_PROVIDER_RESPONSE" },
    );
  }
}
