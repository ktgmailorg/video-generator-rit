import { access, readFile } from "node:fs/promises";
import { parseArgs } from "node:util";
import { dirname, join, resolve } from "node:path";
import { atomicWriteJson, sha256 } from "./core/canonical.mjs";
import { writeApproval } from "./core/approvals.mjs";
import { ArtifactStore } from "./core/artifact-store.mjs";
import { assertDataRoute } from "./core/data-policy.mjs";
import {
  loadConfig,
  mergeConfig,
  writePresetConfig,
} from "./config.mjs";
import { episodeFromStoryboard, episodeFromTopic } from "./episode.mjs";
import { ingestSourcePack } from "./grounding/source-pack.mjs";
import { verifySourceUrls } from "./grounding/verify.mjs";
import { ProviderExecutionEngine } from "./providers/execution-engine.mjs";
import { ProviderRegistry } from "./providers/registry.mjs";
import {
  refreshPlanArtifacts,
  writePlanArtifacts,
} from "./pipeline/planning.mjs";
import { produceEpisode } from "./pipeline/produce.mjs";
import { collectToolchain } from "./pipeline/run-lock.mjs";
import { toolVersion } from "./pipeline/tools.mjs";
import { loadBrandPack } from "./course/brand-pack.mjs";

const commonOptions = {
  config: { type: "string", short: "c", default: "video.config.json" },
  json: { type: "boolean", default: false },
};

export async function runCli(argv = process.argv.slice(2), io = console) {
  const [command = "help", ...rest] = argv;
  switch (command) {
    case "help":
    case "--help":
    case "-h":
      io.log(helpText);
      return { status: "help" };
    case "init":
      return initCommand(rest, io);
    case "doctor":
      return doctorCommand(rest, io);
    case "providers":
      return providersCommand(rest, io);
    case "plan":
      return planCommand(rest, io);
    case "approve":
      return approveCommand(rest, io);
    case "produce":
      return produceCommand(rest, io);
    case "replay":
      return replayCommand(rest, io);
    case "package":
      return packageCommand(rest, io);
    case "inspect":
      return inspectCommand(rest, io);
    default:
      throw new TypeError(`Unknown command: ${command}\n\n${helpText}`);
  }
}

async function initCommand(args, io) {
  const { values } = parseArgs({
    args,
    options: {
      ...commonOptions,
      preset: { type: "string", default: "rit-course" },
      force: { type: "boolean", default: false },
    },
  });
  const path = resolve(values.config);
  if (!values.force) {
    await access(path).then(() => {
      const error = new Error(
        `${path} already exists; use --force to replace it`,
      );
      error.code = "CONFIG_EXISTS";
      throw error;
    }).catch((error) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
  const config = await writePresetConfig(path, values.preset);
  print(io, values.json, { path, config }, `Created ${path} (${values.preset})`);
  return { status: "created", path, config };
}

async function doctorCommand(args, io) {
  const { values } = parseArgs({
    args,
    options: {
      ...commonOptions,
      offline: { type: "boolean", default: false },
      "check-sources": { type: "boolean", default: false },
    },
  });
  const { config, path } = await loadConfig(values.config);
  const registry = ProviderRegistry.fromConfig(config);
  const checks = [];
  const [ffmpeg, ffprobe] = await Promise.all([
    toolVersion(process.env.VIDEO_FFMPEG || "ffmpeg"),
    toolVersion(process.env.VIDEO_FFPROBE || "ffprobe"),
  ]);
  checks.push({ name: "ffmpeg", ...ffmpeg });
  checks.push({ name: "ffprobe", ...ffprobe });
  for (const roleName of requiredRoles(config)) {
    if (!config.roles[roleName]) {
      checks.push({
        name: `role:${roleName}`,
        available: false,
        error: `No provider role configured for ${roleName}`,
      });
    }
  }
  for (const roleName of optionalRoles(config)) {
    if (!config.roles[roleName]) {
      checks.push({
        name: `role:${roleName}`,
        available: true,
        warning: `${roleName} features are unavailable until a provider role is configured`,
      });
    }
  }
  for (const provider of await registry.list()) {
    try {
      assertDataRoute({
        classification: config.dataPolicy.classification,
        profileName: provider.profileName,
        provider,
        ...config.dataPolicy,
      });
      checks.push({
        name: `route:${provider.profileName}`,
        available: true,
        executionLocation: provider.executionLocation,
      });
    } catch (error) {
      checks.push({
        name: `route:${provider.profileName}`,
        available: false,
        error: error.message,
      });
    }
    if (values.offline && provider.executionLocation === "hosted") {
      checks.push({
        name: `provider:${provider.profileName}`,
        available: true,
        skipped: "offline",
      });
      continue;
    }
    try {
      const probe = await registry.probe(provider.profileName);
      checks.push({
        name: `provider:${provider.profileName}`,
        available: Boolean(probe.health.ok),
        health: probe.health,
        ...(probe.health.ok
          ? {}
          : {
              error:
                probe.health.error ||
                "Provider health check did not pass",
            }),
      });
    } catch (error) {
      checks.push({
        name: `provider:${provider.profileName}`,
        available: false,
        error: error.message,
      });
    }
  }
  if (config.brandPack) {
    try {
      const pack = await loadBrandPack(config.brandPack);
      checks.push({
        name: "brand-pack",
        available: true,
        id: pack.id,
        version: pack.version,
      });
    } catch (error) {
      checks.push({ name: "brand-pack", available: false, error: error.message });
    }
  }
  if (values["check-sources"]) {
    const episodePath = join(resolve(config.workflow.outputRoot), "episode.json");
    try {
      const episode = JSON.parse(await readFile(episodePath, "utf8"));
      const sourceReport = await verifySourceUrls(episode);
      for (const source of sourceReport.results) {
        checks.push({
          name: `source:${source.sourceId}`,
          available: true,
          reachable: source.reachable,
          changed: source.changed,
          warning: source.warning,
        });
      }
    } catch (error) {
      checks.push({
        name: "source-check",
        available: false,
        error: error.message,
      });
    }
  }
  const ok = checks.every((check) => check.available);
  const report = { ok, configPath: path, preset: config.preset, checks };
  print(
    io,
    values.json,
    report,
    checks
      .map(
        (check) =>
          `${check.available ? "PASS" : "FAIL"} ${check.name}${check.error ? ` — ${check.error}` : check.warning ? ` — WARNING: ${check.warning}` : ""}`,
      )
      .join("\n"),
  );
  if (!ok) process.exitCode = 1;
  return report;
}

async function providersCommand(args, io) {
  const { values, positionals } = parseArgs({
    args,
    options: commonOptions,
    allowPositionals: true,
  });
  const action = positionals[0] || "list";
  const { config } = await loadConfig(values.config);
  const registry = ProviderRegistry.fromConfig(config);
  if (action === "list") {
    const providers = await registry.list();
    print(
      io,
      values.json,
      providers,
      providers
        .map(
          (provider) =>
            `${provider.profileName}: ${provider.id} (${provider.executionLocation}) — ${provider.capabilities.join(", ")}`,
        )
        .join("\n") || "No providers configured.",
    );
    return providers;
  }
  if (action === "probe") {
    const profileName = positionals[1];
    if (!profileName) throw new TypeError("providers probe requires a profile name");
    const result = await registry.probe(profileName);
    print(io, values.json, result, JSON.stringify(result, null, 2));
    return result;
  }
  throw new TypeError(`Unknown providers action: ${action}`);
}

async function planCommand(args, io) {
  const { values } = parseArgs({
    args,
    options: {
      ...commonOptions,
      topic: { type: "string" },
      storyboard: { type: "string" },
      sources: { type: "string", multiple: true, default: [] },
      mode: { type: "string" },
      "lesson-profile": { type: "string", default: "concise" },
      "dry-run": { type: "boolean", default: false },
      "allow-network": { type: "boolean", default: false },
    },
  });
  if (Boolean(values.topic) === Boolean(values.storyboard)) {
    throw new TypeError("Plan requires exactly one of --topic or --storyboard");
  }
  if (
    !["concise", "full-lesson", "fast-full-lesson"].includes(
      values["lesson-profile"],
    )
  ) {
    throw new TypeError(
      "--lesson-profile must be concise, full-lesson, or fast-full-lesson",
    );
  }
  const { config: loadedConfig } = await loadConfig(values.config);
  if (
    values.mode &&
    !["fresh", "record", "frozen"].includes(values.mode)
  ) {
    throw new TypeError("--mode must be fresh, record, or frozen");
  }
  const config = values.mode
    ? mergeConfig(loadedConfig, {
        workflow: { determinism: values.mode },
      })
    : loadedConfig;
  const sourceInputs = splitSources(values.sources);
  if (values["dry-run"]) {
    const report = {
      action: "plan",
      input: values.topic ? "topic" : "storyboard",
      sourceInputs,
      groundingMode: config.workflow.groundingMode,
      lessonProfile: values["lesson-profile"],
      planner: config.roles.planner?.primary || null,
      network:
        Boolean(values.topic && config.providers[config.roles.planner?.primary]?.executionLocation === "hosted") ||
        sourceInputs.some((value) => /^https?:\/\//i.test(value)),
    };
    print(io, values.json, report, JSON.stringify(report, null, 2));
    return report;
  }
  const sourceEntries = await ingestSourcePack(sourceInputs, {
    allowNetwork:
      values["allow-network"] ||
      sourceInputs.some((value) => /^https?:\/\//i.test(value)),
  });
  let episode;
  let planningRun;
  if (values.storyboard) {
    episode = await episodeFromStoryboard(values.storyboard, sourceEntries);
  } else {
    const engine = new ProviderExecutionEngine({
      config,
      mode: config.workflow.determinism,
      onEvent: (event) => io.error?.(formatEvent(event)),
    });
    const result = await episodeFromTopic({
      topic: values.topic,
      sourceEntries,
      engine,
      dataClassification: config.dataPolicy.classification,
      groundingMode: config.workflow.groundingMode,
      lessonProfile: values["lesson-profile"],
    });
    episode = result.episode;
    planningRun = {
      schemaVersion: 1,
      provenance: result.provenance,
      records: engine.records,
      providers: engine.providerManifests,
      totalCostUsd: engine.totalCostUsd,
    };
  }
  const plan = await writePlanArtifacts({ config, episode });
  if (planningRun) {
    await atomicWriteJson(
      join(plan.root, "planning-provider-records.json"),
      planningRun,
      { mode: 0o600 },
    );
  }
  const report = {
    episodePath: join(plan.root, "episode.json"),
    visualPlanPath: join(plan.root, "visual-plan.json"),
    groundingReport: plan.groundingReport,
    requiredApprovals: config.workflow.approvals,
  };
  print(
    io,
    values.json,
    report,
    `Planned ${episode.beats.length} beats at ${report.episodePath}`,
  );
  return report;
}

async function approveCommand(args, io) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      ...commonOptions,
      reviewer: { type: "string", short: "r" },
      role: { type: "string", default: "reviewer" },
      notes: { type: "string", default: "" },
    },
    allowPositionals: true,
  });
  const stage = positionals[0];
  if (!["script", "visuals", "release"].includes(stage)) {
    throw new TypeError("approve requires script, visuals, or release");
  }
  if (!values.reviewer) throw new TypeError("approve requires --reviewer");
  const { config } = await loadConfig(values.config);
  const root = resolve(config.workflow.outputRoot);
  if (stage === "script") {
    const episodePath = join(root, "episode.json");
    const episode = JSON.parse(await readFile(episodePath, "utf8"));
    episode.sources = (episode.sources || []).map((source) => ({
      ...source,
      verified: true,
    }));
    episode.claims = (episode.claims || []).map((claim) => ({
      ...claim,
      verified: true,
    }));
    await atomicWriteJson(episodePath, episode);
  }
  if (stage !== "release") await refreshPlanArtifacts(config);
  const subjectPath = join(root, "review", `${stage}.subject.json`);
  const subject = JSON.parse(await readFile(subjectPath, "utf8"));
  if (stage === "release" && subject.qualityReport?.ok === false) {
    throw new Error(
      `Release cannot be approved while QA blockers remain: ${subject.qualityReport.blockers.join("; ")}`,
    );
  }
  const approval = await writeApproval({
    root: join(root, "approvals"),
    stage,
    subject,
    reviewer: values.reviewer,
    role: values.role,
    notes: values.notes,
  });
  print(
    io,
    values.json,
    approval,
    `Approved ${stage} as ${values.reviewer}`,
  );
  return approval;
}

async function produceCommand(args, io) {
  const { values } = parseArgs({
    args,
    options: {
      ...commonOptions,
      mode: { type: "string" },
      until: { type: "string", default: "package" },
      "dry-run": { type: "boolean", default: false },
      "max-cost-usd": { type: "string" },
      "allow-unknown-cost": { type: "boolean", default: false },
      "accept-toolchain-drift": { type: "boolean", default: false },
      "narration-voice": { type: "string" },
    },
  });
  const { config: loadedConfig } = await loadConfig(values.config);
  if (!["narration", "visuals", "render", "package"].includes(values.until)) {
    throw new TypeError(
      "--until must be narration, visuals, render, or package",
    );
  }
  if (
    values.mode &&
    !["fresh", "record", "frozen"].includes(values.mode)
  ) {
    throw new TypeError("--mode must be fresh, record, or frozen");
  }
  const maximumCost =
    values["max-cost-usd"] === undefined
      ? undefined
      : Number(values["max-cost-usd"]);
  if (
    maximumCost !== undefined &&
    (!Number.isFinite(maximumCost) || maximumCost < 0)
  ) {
    throw new TypeError("--max-cost-usd must be a non-negative number");
  }
  const narrationVoice = values["narration-voice"]?.trim();
  const providerOverrides = {};
  if (narrationVoice) {
    const profileName = loadedConfig.roles.narration?.primary;
    const profile = loadedConfig.providers[profileName];
    if (!profileName || !profile) {
      throw new TypeError(
        "--narration-voice requires a configured primary narration provider",
      );
    }
    const nextProfile = { ...profile };
    if (["female", "male"].includes(narrationVoice)) {
      if (profile.adapter !== "edge-tts") {
        throw new TypeError(
          "--narration-voice female|male is currently available for Edge TTS; use an explicit provider voice ID for other adapters",
        );
      }
      delete nextProfile.voice;
      nextProfile.voicePreset = narrationVoice;
    } else {
      delete nextProfile.voicePreset;
      nextProfile.voice = narrationVoice;
    }
    providerOverrides[profileName] = nextProfile;
  }
  const config = mergeConfig(loadedConfig, {
    providers: providerOverrides,
    workflow: {
      ...(values["max-cost-usd"] !== undefined
        ? { maxCostUsd: maximumCost }
        : {}),
      ...(values["allow-unknown-cost"] ? { allowUnknownCost: true } : {}),
    },
  });
  const effectiveMode = values.mode || config.workflow.determinism;
  if (values["dry-run"]) {
    const report = await dryRunProduction(
      config,
      values.until,
      effectiveMode,
    );
    print(io, values.json, report, JSON.stringify(report, null, 2));
    return report;
  }
  if (
    effectiveMode === "frozen" &&
    !values["accept-toolchain-drift"]
  ) {
    const prior = await readFile(
      join(resolve(config.workflow.outputRoot), "run.lock.json"),
      "utf8",
    )
      .then(JSON.parse)
      .catch((error) => {
        if (error.code === "ENOENT") {
          throw new Error(
            "Frozen production requires an existing run.lock.json",
          );
        }
        throw error;
      });
    const differences = compareToolchain(
      prior.toolchain,
      await collectToolchain(),
    );
    if (differences.length) {
      throw new Error(
        `Frozen production toolchain mismatch: ${differences.join(", ")}`,
      );
    }
  }
  const result = await produceEpisode({
    config,
    mode: effectiveMode,
    until: values.until,
    onEvent: (event) => io.error?.(formatEvent(event)),
  });
  print(
    io,
    values.json,
    summarizeProduction(result),
    result.package
      ? `Complete: ${result.package.directory}`
      : `Complete through ${values.until}: ${result.root}`,
  );
  return result;
}

async function replayCommand(args, io) {
  const { values, positionals } = parseArgs({
    args,
    options: {
      ...commonOptions,
      frozen: { type: "boolean", default: true },
      "accept-toolchain-drift": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });
  const lockPath = positionals[0];
  if (!lockPath) throw new TypeError("replay requires a run.lock.json path");
  const resolvedLockPath = resolve(lockPath);
  const prior = JSON.parse(await readFile(resolvedLockPath, "utf8"));
  const { config } = await loadConfig(values.config);
  await hydrateReplayBundle(resolvedLockPath, prior, config);
  const episode = JSON.parse(
    await readFile(join(resolve(config.workflow.outputRoot), "episode.json"), "utf8"),
  );
  if (sha256(config) !== prior.configSha256 || sha256(episode) !== prior.inputSha256) {
    throw new Error("Current configuration or episode does not match the run lock");
  }
  if (!values["accept-toolchain-drift"]) {
    const current = await collectToolchain();
    const differences = compareToolchain(prior.toolchain, current);
    if (differences.length) {
      throw new Error(
        `Frozen replay toolchain mismatch: ${differences.join(", ")}`,
      );
    }
  }
  return produceCommand(
    [
      "--config",
      values.config,
      "--mode",
      values.frozen ? "frozen" : prior.mode,
      ...(values["accept-toolchain-drift"]
        ? ["--accept-toolchain-drift"]
        : []),
      ...(values.json ? ["--json"] : []),
    ],
    io,
  );
}

async function hydrateReplayBundle(lockPath, lock, config) {
  const sourceCache = join(dirname(lockPath), "cache");
  try {
    await access(sourceCache);
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
  const store = new ArtifactStore(config.workflow.cacheRoot);
  for (const record of lock.requests || []) {
    const cachedRecord = structuredClone(record);
    const references = [
      ...(cachedRecord.result?.artifacts || []),
      ...(cachedRecord.result?.rawResponse
        ? [cachedRecord.result.rawResponse]
        : []),
    ];
    for (const reference of references) {
      const source = join(
        sourceCache,
        "sha256",
        reference.sha256.slice(0, 2),
        `${reference.sha256}${reference.extension || ""}`,
      );
      const stored = await store.putBytes(await readFile(source), {
        filename: reference.filename,
        mimeType: reference.mimeType,
        extension: reference.extension,
      });
      reference.path = stored.path;
    }
    const lookupSha256 =
      cachedRecord.lookupSha256 || cachedRecord.requestSha256;
    const destination = join(
      resolve(config.workflow.cacheRoot),
      "requests",
      lookupSha256.slice(0, 2),
      `${lookupSha256}.json`,
    );
    await access(destination).catch(async (error) => {
      if (error.code !== "ENOENT") throw error;
      await atomicWriteJson(destination, cachedRecord, { mode: 0o600 });
    });
  }
  return true;
}

async function packageCommand(args, io) {
  const { values } = parseArgs({
    args,
    options: {
      ...commonOptions,
      target: { type: "string", default: "panopto" },
    },
  });
  if (values.target !== "panopto") {
    throw new TypeError("Only --target panopto is supported in v1");
  }
  return produceCommand(
    ["--config", values.config, "--mode", "frozen", ...(values.json ? ["--json"] : [])],
    io,
  );
}

async function inspectCommand(args, io) {
  const { values, positionals } = parseArgs({
    args,
    options: commonOptions,
    allowPositionals: true,
  });
  const path = resolve(positionals[0] || "run.lock.json");
  const lock = JSON.parse(await readFile(path, "utf8"));
  const summary = {
    runId: lock.runId,
    status: lock.status,
    mode: lock.mode,
    requests: lock.requests.length,
    cacheHits: lock.requests.filter((record) => record.cacheHit).length,
    totalCostUsd: lock.totalCostUsd,
    approvals: lock.approvals.map((approval) => approval.stage),
    final: lock.final,
  };
  print(io, values.json, summary, JSON.stringify(summary, null, 2));
  return summary;
}

async function dryRunProduction(
  config,
  until,
  mode = config.workflow.determinism,
) {
  const root = resolve(config.workflow.outputRoot);
  const episode = JSON.parse(await readFile(join(root, "episode.json"), "utf8"));
  const registry = ProviderRegistry.fromConfig(config);
  const engine = new ProviderExecutionEngine({
    config,
    registry,
    mode,
  });
  const providers = await registry.list();
  const plannedRequests = [];
  const visualPlan = await readFile(join(root, "visual-plan.json"), "utf8")
    .then(JSON.parse)
    .catch(() => null);
  for (const beat of episode.beats) {
    plannedRequests.push(
      await engine.previewRole("narration", {
        schemaVersion: 1,
        capability: "speech.synthesize",
        input: {
          text: beat.narration,
          instructions: beat.delivery,
        },
        parameters: {},
        expectedOutput: {
          mimeTypes: [
            "audio/mpeg",
            "audio/wav",
            "audio/ogg",
            "audio/webm",
            "text/vtt",
          ],
          maximumBytes: 100_000_000,
        },
      }),
    );
  }
  if (config.roles.moderation) {
    plannedRequests.push(
      await engine.previewRole("moderation", {
        schemaVersion: 1,
        capability: "moderation.classify",
        input: {
          content: [
            ...episode.beats.map((beat) => beat.narration),
            ...(visualPlan?.beats || []).flatMap((beat) =>
              beat.shots.map((shot) => shot.prompt).filter(Boolean),
            ),
          ].join("\n\n"),
        },
        parameters: {},
      }),
    );
  }
  for (const shot of visualPlan?.beats.flatMap((beat) => beat.shots) || []) {
    if (!shot.capability) continue;
    plannedRequests.push(
      await engine.previewRole(
        shot.capability === "video.generate" ? "video" : "image",
        {
          schemaVersion: 1,
          capability: shot.capability,
          input: { prompt: shot.prompt },
          parameters: shot.parameters || {},
          seed: Number.parseInt(
            sha256({ visualPlan, shot: shot.id }).slice(0, 8),
            16,
          ),
          expectedOutput: {
            mimeTypes:
              shot.capability === "video.generate"
                ? [
                    "video/mp4",
                    "video/webm",
                    "image/gif",
                    "image/webp",
                    "image/png",
                    "image/jpeg",
                  ]
                : ["image/png", "image/jpeg", "image/webp"],
            maximumBytes:
              shot.capability === "video.generate"
                ? 2_000_000_000
                : 100_000_000,
          },
        },
      ),
    );
  }
  const knownCostUsd = plannedRequests
    .filter(
      (request) =>
        !request.cacheHit && request.estimatedCost?.known,
    )
    .reduce(
      (total, request) =>
        total + Number(request.estimatedCost.costUsd || 0),
      0,
    );
  return {
    action: "produce",
    until,
    mode,
    episode: { id: episode.id, beats: episode.beats.length },
    approvals: config.workflow.approvals,
    providers: providers.map((provider) => ({
      profileName: provider.profileName,
      executionLocation: provider.executionLocation,
      capabilities: provider.capabilities,
    })),
    networkBoundaries: providers.map((provider) => ({
      profileName: provider.profileName,
      boundary:
        provider.executionLocation === "hosted"
          ? "leaves-local-machine"
          : "local-only",
    })),
    requests: plannedRequests,
    expectedCacheHits: plannedRequests.filter((request) => request.cacheHit)
      .length,
    estimatedCostUsd: {
      knownSubtotal: knownCostUsd,
      unknownRequests: plannedRequests.filter(
        (request) =>
          !request.cacheHit && !request.estimatedCost?.known,
      ).length,
    },
    unresolvedStages: [
      ...(config.roles.transcription
        ? ["transcription cache key depends on final narration bytes"]
        : []),
    ],
    maxCostUsd: config.workflow.maxCostUsd,
    allowUnknownCost: config.workflow.allowUnknownCost,
  };
}

function requiredRoles(config) {
  return ["narration"];
}

function optionalRoles(config) {
  return [
    "planner",
    ...(config.workflow.groundingMode === "researched"
      ? ["research"]
      : []),
  ];
}

function splitSources(values) {
  return values
    .flatMap((value) => value.split(","))
    .map((value) => value.trim())
    .filter(Boolean);
}

function compareToolchain(prior, current) {
  const differences = [];
  for (const key of ["node", "platform"]) {
    if (prior?.[key] !== current?.[key]) differences.push(key);
  }
  if (prior?.ffmpeg?.version !== current?.ffmpeg?.version) differences.push("ffmpeg");
  if (prior?.ffprobe?.version !== current?.ffprobe?.version) differences.push("ffprobe");
  if (prior?.sharp?.vips !== current?.sharp?.vips) differences.push("libvips");
  return differences;
}

function summarizeProduction(result) {
  return {
    status: result.status,
    root: result.root,
    master: result.render?.masterPath,
    masterSha256: result.render?.sha256,
    package: result.package?.directory,
    runId: result.runLock?.runId,
  };
}

function formatEvent(event) {
  return `[${event.type}] ${event.profileName || ""} ${event.capability || ""}`.trim();
}

function print(io, json, value, text) {
  io.log(json ? JSON.stringify(value, null, 2) : text);
}

const helpText = `RIT Video Generator

Usage:
  rit-video init --preset rit-course|rit-student|rit-media|generic
  rit-video doctor [--offline] [--check-sources]
  rit-video providers list
  rit-video providers probe PROFILE
  rit-video plan (--topic TEXT | --storyboard FILE) [--sources FILE,URL] [--lesson-profile concise|full-lesson|fast-full-lesson]
  rit-video approve script|visuals|release --reviewer NAME
  rit-video produce [--mode fresh|record|frozen] [--until narration|visuals|render|package]
                    [--dry-run] [--max-cost-usd N] [--allow-unknown-cost]
                    [--narration-voice female|male|PROVIDER_VOICE_ID]
  rit-video replay RUN_LOCK [--frozen]
  rit-video package --target panopto
  rit-video inspect RUN_LOCK

Common:
  --config, -c FILE     Configuration file (default video.config.json)
  --json                Machine-readable output
`;
