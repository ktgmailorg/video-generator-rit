import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { assertSchema } from "./core/schema.mjs";
import { atomicWriteJson } from "./core/canonical.mjs";

const approvalSet = Object.freeze(["script", "visuals", "release"]);

const common = (preset) => ({
  schemaVersion: 1,
  preset,
  project: {
    id: "course-video",
    title: "Course Video",
    owner: "RIT course team",
    courseCode: "",
    department: "",
    audience: "students",
  },
  dataPolicy: {
    classification: preset === "rit-student" ? "restricted" : "internal",
    hostedConsent: false,
    allowedHostedProviders: [],
  },
  providers: {},
  roles: {},
  workflow: {
    groundingMode: preset === "generic" ? "open" : "source-pack",
    determinism: "record",
    approvals: preset === "generic" ? [] : [...approvalSet],
    outputRoot: "output/documentary",
    cacheRoot: ".video-cache",
    maxCostUsd: null,
    allowUnknownCost: false,
  },
  brandPack: null,
});

export function presetConfig(preset = "rit-course") {
  if (!["generic", "rit-course", "rit-student", "rit-media"].includes(preset)) {
    throw new TypeError(`Unknown preset: ${preset}`);
  }
  const config = common(preset);
  if (preset === "generic") {
    config.dataPolicy = {
      classification: "public",
      hostedConsent: false,
      allowedHostedProviders: [],
    };
    config.providers.edge = {
      adapter: "edge-tts",
      executionLocation: "hosted",
      model: "edge-tts-7.2.8",
      voicePreset: "male",
    };
    config.roles.narration = { primary: "edge", fallbacks: [] };
  }
  if (preset === "rit-student") {
    config.project.aiPolicyFile = "AI_POLICY.md";
  }
  return config;
}

export async function writePresetConfig(path, preset, overrides = {}) {
  const config = {
    ...presetConfig(preset),
    ...overrides,
  };
  await assertSchema("config", config);
  await atomicWriteJson(resolve(path), config);
  return config;
}

export async function loadConfig(path = "video.config.json", overrides = {}) {
  const resolved = resolve(path);
  let config;
  let missing = false;
  try {
    config = JSON.parse(await readFile(resolved, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    missing = true;
    config = presetConfig("generic");
  }
  config = applyLegacyEnvironment(config, missing);
  config = mergeConfig(config, overrides);
  assertNoInlineSecrets(config);
  await assertSchema("config", config);
  return { config, path: resolved, implicit: basename(resolved) === "video.config.json" };
}

export function mergeConfig(base, overrides = {}) {
  return {
    ...base,
    ...overrides,
    project: { ...base.project, ...overrides.project },
    dataPolicy: { ...base.dataPolicy, ...overrides.dataPolicy },
    providers: { ...base.providers, ...overrides.providers },
    roles: { ...base.roles, ...overrides.roles },
    workflow: { ...base.workflow, ...overrides.workflow },
  };
}

export function credentialFor(profile) {
  if (!profile.apiKeyEnv) return undefined;
  const value = process.env[profile.apiKeyEnv];
  if (!value) {
    const error = new Error(
      `Missing credential environment variable ${profile.apiKeyEnv}`,
    );
    error.code = "MISSING_CREDENTIAL";
    throw error;
  }
  return value;
}

function applyLegacyEnvironment(config, replacePresetDefaults) {
  const next = structuredClone(config);
  if (
    process.env.VIDEO_TITLE &&
    (replacePresetDefaults || !next.project.title)
  ) {
    next.project.title = process.env.VIDEO_TITLE;
  }
  if (
    process.env.VIDEO_OUTPUT &&
    (replacePresetDefaults || !next.workflow.outputRoot)
  ) {
    next.workflow.outputRoot = process.env.VIDEO_OUTPUT;
  }
  for (const profile of Object.values(next.providers || {})) {
    if (profile.adapter !== "edge-tts") continue;
    if (process.env.VIDEO_VOICE && !profile.voice) {
      profile.voice = process.env.VIDEO_VOICE;
    }
    if (process.env.VIDEO_VOICE_RATE && !profile.rate) {
      profile.rate = process.env.VIDEO_VOICE_RATE;
    }
    if (process.env.VIDEO_VOICE_PITCH && !profile.pitch) {
      profile.pitch = process.env.VIDEO_VOICE_PITCH;
    }
  }
  return next;
}

function assertNoInlineSecrets(config) {
  for (const [profileName, profile] of Object.entries(
    config.providers || {},
  )) {
    for (const key of secretLikeKeys(profile)) {
      if (
        /(api.?key|access.?token|secret|password|authorization|cookie)/i.test(
          key,
        ) &&
        !/env$/i.test(key)
      ) {
        throw new TypeError(
          `Provider ${profileName} must reference ${key} through an environment-variable name`,
        );
      }
    }
  }
}

function secretLikeKeys(value, prefix = "") {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value).flatMap(([key, nested]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return [path, ...secretLikeKeys(nested, path)];
  });
}
