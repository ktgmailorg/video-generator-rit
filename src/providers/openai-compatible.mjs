import { credentialFor } from "../config.mjs";
import { requestJson } from "./http.mjs";
import { parseStructuredText, textFromOpenAIResponse } from "./result.mjs";

export function createOpenAICompatibleAdapter(profileName, profile, options = {}) {
  const providerId = options.providerId || "openai-compatible";
  const baseUrl = profile.baseUrl || "http://127.0.0.1:8000/v1";
  const apiStyle = profile.apiStyle || "chat-completions";
  const supportsStructuredOutput = profile.supportsStructuredOutput !== false;
  const supportsSeed = profile.supportsSeed !== false;
  const capabilities = profile.capabilities || [
    "text.generate",
    "embedding.create",
  ];
  const headers = () => {
    const credential = profile.apiKeyEnv ? credentialFor(profile) : undefined;
    return credential ? { authorization: `Bearer ${credential}` } : {};
  };

  return {
    async describe() {
      return {
        id: providerId,
        profileName,
        version: "1.0.0",
        executionLocation: profile.executionLocation,
        capabilities,
        mimeTypes: {
          "text.generate": ["text/plain", "application/json"],
          "embedding.create": ["application/json"],
          ...(profile.mimeTypes || {}),
        },
        supportsStructuredOutput,
        supportsSeed,
        supportsAsyncJobs: false,
        supportsModelDiscovery: true,
        baseUrl,
        ...(configuredModelDigest(profile)
          ? { modelDigest: configuredModelDigest(profile) }
          : {}),
      };
    },
    async healthcheck({ signal } = {}) {
      const response = await requestJson({
        providerId,
        baseUrl,
        path: "/models",
        method: "GET",
        headers: headers(),
        signal,
        timeoutMs: profile.timeoutMs || 15_000,
      });
      const models = (response.data || response.models || []).map(
        (model) => model.id || model.name || model,
      );
      const configuredModelAvailable =
        !profile.model ||
        profile.allowUnlistedModel ||
        models.includes(profile.model);
      const requiredDigestAvailable =
        !profile.requireModelDigest || Boolean(configuredModelDigest(profile));
      return {
        ok: Boolean(configuredModelAvailable && requiredDigestAvailable),
        models,
        ...(!configuredModelAvailable
          ? { error: `Configured model is not listed: ${profile.model}` }
          : !requiredDigestAvailable
            ? {
                error:
                  `Set ${profile.modelDigestEnv || "provider.modelDigest"} ` +
                  "to the SHA-256 of the local model file",
              }
            : {}),
      };
    },
    async estimate(request) {
      if (profile.estimatedCostUsd !== undefined) {
        const value =
          typeof profile.estimatedCostUsd === "object"
            ? profile.estimatedCostUsd[request.capability]
            : profile.estimatedCostUsd;
        if (value !== undefined) {
          return { known: true, costUsd: Number(value) };
        }
      }
      return profile.executionLocation === "local"
        ? { known: true, costUsd: 0 }
        : { known: false, costUsd: null };
    },
    async execute(request, { signal } = {}) {
      if (request.capability === "embedding.create") {
        const raw = await requestJson({
          providerId,
          baseUrl,
          path: "/embeddings",
          headers: headers(),
          body: {
            model: request.model,
            input: request.input.texts || request.input.text,
            ...request.parameters,
          },
          signal,
          timeoutMs: profile.timeoutMs,
        });
        return {
          output: {
            embeddings: (raw.data || []).map((item) => item.embedding),
          },
          artifacts: [],
          usage: raw.usage || {},
          requestId: raw.id,
          modelRevision: resolvedModelRevision(profile, raw, request),
          finishReason: "stop",
          raw,
        };
      }
      if (request.capability !== "text.generate") {
        throw new TypeError(`${providerId} does not implement ${request.capability}`);
      }
      if (apiStyle === "responses") {
        const raw = await requestJson({
          providerId,
          baseUrl,
          path: "/responses",
          headers: headers(),
          body: {
            model: request.model,
            input: request.input.messages || request.input.prompt,
            instructions: request.input.instructions,
            ...(profile.requestParameters || {}),
            ...(request.outputSchema && supportsStructuredOutput
              ? {
                  text: {
                    format: {
                      type: "json_schema",
                      name: request.schemaName || "response",
                      schema: request.outputSchema,
                      strict: true,
                    },
                  },
                }
              : {}),
            ...request.parameters,
            ...(request.seed === undefined || !supportsSeed
              ? {}
              : { seed: request.seed }),
          },
          signal,
          timeoutMs: profile.timeoutMs,
        });
        const text = textFromOpenAIResponse(raw);
        return {
          output: parseStructuredText(text, request.outputSchema),
          artifacts: [],
          usage: raw.usage || {},
          requestId: raw.id,
          modelRevision: resolvedModelRevision(profile, raw, request),
          finishReason: raw.status || "stop",
          raw,
        };
      }
      const raw = await requestJson({
        providerId,
        baseUrl,
        path: "/chat/completions",
        headers: headers(),
        body: {
          model: request.model,
          messages:
            request.input.messages ||
            [
              ...(request.input.instructions
                ? [{ role: "system", content: request.input.instructions }]
                : []),
              { role: "user", content: request.input.prompt },
            ],
          ...(profile.requestParameters || {}),
          ...(request.outputSchema && supportsStructuredOutput
            ? {
                response_format: {
                  type: "json_schema",
                  json_schema: {
                    name: request.schemaName || "response",
                    strict: true,
                    schema: request.outputSchema,
                  },
                },
              }
            : {}),
          ...request.parameters,
          ...(request.seed === undefined || !supportsSeed
            ? {}
            : { seed: request.seed }),
        },
        signal,
        timeoutMs: profile.timeoutMs,
      });
      const text = raw.choices?.[0]?.message?.content || "";
      const refused = Boolean(raw.choices?.[0]?.message?.refusal);
      return {
        output: parseStructuredText(text, request.outputSchema),
        artifacts: [],
        usage: raw.usage || {},
        requestId: raw.id,
        modelRevision: resolvedModelRevision(profile, raw, request),
        finishReason: refused
          ? "refusal"
          : raw.choices?.[0]?.finish_reason || "stop",
        raw,
      };
    },
  };
}

function configuredModelDigest(profile) {
  const value =
    profile.modelDigest ||
    (profile.modelDigestEnv ? process.env[profile.modelDigestEnv] : undefined);
  if (!value) return null;
  const digest = String(value).replace(/^sha256:/i, "").toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(digest)) {
    throw new TypeError(
      `${profile.modelDigestEnv || "provider.modelDigest"} must be a ` +
        "64-character SHA-256 digest",
    );
  }
  return digest;
}

function resolvedModelRevision(profile, raw, request) {
  const modelId = raw.model || request.model;
  if (/@sha256:[a-f0-9]{64}$/i.test(modelId || "")) return modelId;
  const providerDigest = raw.model_digest
    ? String(raw.model_digest).replace(/^sha256:/i, "").toLowerCase()
    : null;
  const digest = configuredModelDigest(profile) || providerDigest;
  if (profile.requireModelDigest && !digest) {
    throw new TypeError(
      `Set ${profile.modelDigestEnv || "provider.modelDigest"} to the ` +
        "SHA-256 of the local model file",
    );
  }
  if (digest && !/^[a-f0-9]{64}$/.test(digest)) {
    throw new TypeError("Provider model digest must be a SHA-256 digest");
  }
  return digest
    ? `${modelId || "local-model"}@sha256:${digest}`
    : modelId;
}

export function createOllamaAdapter(profileName, profile) {
  const adapter = createOpenAICompatibleAdapter(
    profileName,
    {
      apiStyle: "responses",
      baseUrl: "http://127.0.0.1:11434/v1",
      capabilities: ["text.generate", "embedding.create"],
      ...profile,
      executionLocation: "local",
    },
    { providerId: "ollama" },
  );
  const nativeBaseUrl =
    profile.ollamaBaseUrl ||
    profile.baseUrl?.replace(/\/v1\/?$/, "") ||
    "http://127.0.0.1:11434";
  return {
    ...adapter,
    async healthcheck({ signal } = {}) {
      const response = await requestJson({
        providerId: "ollama",
        baseUrl: nativeBaseUrl,
        path: "/api/tags",
        method: "GET",
        signal,
        timeoutMs: profile.timeoutMs || 15_000,
      });
      const models = (response.models || []).map((model) => ({
        id: model.name || model.model,
        digest: model.digest,
      }));
      const configured = models.find(
        (model) => model.id === profile.model,
      );
      const digestMatches =
        !profile.modelDigest ||
        configured?.digest === profile.modelDigest;
      const ok =
        Boolean(configured || profile.allowUnlistedModel) &&
        digestMatches;
      return {
        ok,
        models,
        ...(ok
          ? {}
          : {
              error: !configured
                ? `Configured Ollama model is not installed: ${profile.model}`
                : `Configured Ollama digest does not match ${profile.modelDigest}`,
            }),
      };
    },
  };
}
