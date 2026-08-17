import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { once } from "node:events";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ArtifactStore } from "../src/core/artifact-store.mjs";
import { ProviderError } from "../src/providers/errors.mjs";
import { ProviderExecutionEngine } from "../src/providers/execution-engine.mjs";
import {
  EDGE_TTS_VOICE_PRESETS,
  edgeTtsProcessError,
  resolveEdgeTtsVoice,
} from "../src/providers/edge-tts.mjs";
import { createOpenAICompatibleAdapter } from "../src/providers/openai-compatible.mjs";
import { ProviderRegistry } from "../src/providers/registry.mjs";

const configFor = (directory, providers, roles, classification = "public") => ({
  schemaVersion: 1,
  preset: "generic",
  project: { id: "test", title: "Test", owner: "Test" },
  dataPolicy: {
    classification,
    hostedConsent: false,
    allowedHostedProviders: [],
  },
  providers,
  roles,
  workflow: {
    groundingMode: "open",
    determinism: "record",
    approvals: [],
    outputRoot: join(directory, "output"),
    cacheRoot: join(directory, "cache"),
    maxCostUsd: null,
    allowUnknownCost: false,
  },
  brandPack: null,
});

const fakeAdapter = ({
  id,
  location = "local",
  capabilities = ["text.generate"],
  execute,
}) => ({
  describe: async () => ({
    id,
    version: "1.0.0",
    executionLocation: location,
    capabilities,
    supportsStructuredOutput: true,
    supportsSeed: true,
    supportsAsyncJobs: false,
    supportsModelDiscovery: false,
  }),
  healthcheck: async () => ({ ok: true }),
  execute,
});

test("Edge TTS provides reproducible female and male narration presets", () => {
  assert.equal(
    resolveEdgeTtsVoice({}, { voicePreset: "female" }),
    EDGE_TTS_VOICE_PRESETS.female,
  );
  assert.equal(
    resolveEdgeTtsVoice(
      { input: { voicePreset: "male" } },
      { voicePreset: "female" },
    ),
    EDGE_TTS_VOICE_PRESETS.male,
  );
  assert.equal(
    resolveEdgeTtsVoice(
      { input: { voice: "en-US-JennyNeural" } },
      { voicePreset: "female" },
    ),
    "en-US-JennyNeural",
  );
  assert.throws(
    () => resolveEdgeTtsVoice({}, { voicePreset: "unknown" }),
    /Unknown Edge TTS voice preset/,
  );
});

test("Edge TTS retries safe no-audio and local cache bootstrap failures", () => {
  const noAudio = edgeTtsProcessError(
    "edge-tts",
    1,
    null,
    "edge_tts.exceptions.NoAudioReceived: No audio was received.",
  );
  assert.equal(noAudio.code, "PROVIDER_UNAVAILABLE");
  assert.equal(noAudio.retryable, true);
  assert.equal(noAudio.details.noAudioReceived, true);

  const cacheRace = edgeTtsProcessError(
    "uvx",
    2,
    null,
    "Failed to write to the client cache: failed to rename file from /tmp/.tmp123 to /Users/test/.cache/uv/simple-v21/pypi/tabulate.rkyv",
  );
  assert.equal(cacheRace.code, "PROVIDER_UNAVAILABLE");
  assert.equal(cacheRace.retryable, true);
  assert.equal(cacheRace.details.localToolCacheFailure, true);

  const rejected = edgeTtsProcessError(
    "edge-tts",
    1,
    null,
    "Invalid voice parameter",
  );
  assert.equal(rejected.code, "PROVIDER_ERROR");
  assert.equal(rejected.retryable, false);
  assert.equal(rejected.details.noAudioReceived, false);
  assert.equal(rejected.details.localToolCacheFailure, false);
});

test("local OpenAI-compatible models bind an operator-supplied file digest", async () => {
  const digest = "a".repeat(64);
  const requests = [];
  const server = createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/v1/models") {
      response.setHeader("content-type", "application/json");
      response.end(
        JSON.stringify({ data: [{ id: "Bonsai-27B-Q1_0.gguf" }] }),
      );
      return;
    }
    let body = "";
    for await (const chunk of request) body += chunk;
    requests.push(JSON.parse(body));
    response.setHeader("content-type", "application/json");
    response.end(
      JSON.stringify({
        id: "local-request",
        model: "Bonsai-27B-Q1_0.gguf",
        choices: [
          {
            message: { content: "{\"ok\":true}" },
            finish_reason: "stop",
          },
        ],
      }),
    );
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  process.env.RIT_TEST_BONSAI_DIGEST = digest;
  try {
    const address = server.address();
    const adapter = createOpenAICompatibleAdapter("bonsai", {
      adapter: "openai-compatible",
      executionLocation: "local",
      baseUrl: `http://127.0.0.1:${address.port}/v1`,
      model: "Bonsai-27B-Q1_0.gguf",
      modelDigestEnv: "RIT_TEST_BONSAI_DIGEST",
      requireModelDigest: true,
      supportsStructuredOutput: false,
      supportsSeed: false,
      capabilities: ["text.generate"],
    });
    const manifest = await adapter.describe();
    assert.equal(manifest.modelDigest, digest);
    assert.equal(manifest.supportsStructuredOutput, false);
    assert.equal(manifest.supportsSeed, false);
    assert.deepEqual(await adapter.healthcheck(), {
      ok: true,
      models: ["Bonsai-27B-Q1_0.gguf"],
    });
    const result = await adapter.execute({
      schemaVersion: 1,
      capability: "text.generate",
      model: "Bonsai-27B-Q1_0.gguf",
      input: { prompt: "Return JSON." },
      outputSchema: {
        type: "object",
        properties: { ok: { type: "boolean" } },
      },
      seed: 42,
      parameters: {},
    });
    assert.equal(
      result.modelRevision,
      `Bonsai-27B-Q1_0.gguf@sha256:${digest}`,
    );
    assert.equal("response_format" in requests[0], false);
    assert.equal("seed" in requests[0], false);
  } finally {
    delete process.env.RIT_TEST_BONSAI_DIGEST;
    server.close();
    await once(server, "close");
  }
});

test("record mode caches provider bytes and frozen mode never re-executes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rit-provider-cache-"));
  let calls = 0;
  try {
    const config = configFor(
      directory,
      {
        local: {
          adapter: "fixture",
          executionLocation: "local",
          model: "fixture-model",
        },
      },
      { planner: { primary: "local", fallbacks: [] } },
    );
    const registry = new ProviderRegistry().register(
      "local",
      fakeAdapter({
        id: "fixture",
        execute: async () => {
          calls += 1;
          return {
            output: { text: "result" },
            artifacts: [
              {
                bytes: Buffer.from("binary"),
                filename: "result.bin",
                mimeType: "application/octet-stream",
              },
            ],
            raw: { fixture: true },
            modelRevision: "fixture-model@sha256:abc",
          };
        },
      }),
    );
    const store = new ArtifactStore(config.workflow.cacheRoot);
    const request = {
      schemaVersion: 1,
      capability: "text.generate",
      model: "fixture-model",
      input: { prompt: "test" },
    };
    const recorded = await new ProviderExecutionEngine({
      config,
      registry,
      artifactStore: store,
      mode: "record",
    }).executeRole("planner", request);
    assert.equal(calls, 1);
    assert.equal(recorded.cacheHit, false);
    const frozen = await new ProviderExecutionEngine({
      config,
      registry,
      artifactStore: store,
      mode: "frozen",
    }).executeRole("planner", request);
    assert.equal(calls, 1);
    assert.equal(frozen.cacheHit, true);
    assert.equal((await store.verify(frozen.artifacts[0])).ok, true);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("fallbacks only handle eligible availability failures", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rit-provider-fallback-"));
  try {
    const config = configFor(
      directory,
      {
        primary: { adapter: "fixture", executionLocation: "local", model: "a" },
        secondary: { adapter: "fixture", executionLocation: "local", model: "b" },
      },
      { planner: { primary: "primary", fallbacks: ["secondary"] } },
    );
    const registry = new ProviderRegistry()
      .register(
        "primary",
        fakeAdapter({
          id: "primary",
          execute: async () => {
            throw new ProviderError("busy", {
              code: "RATE_LIMITED",
              retryable: false,
            });
          },
        }),
      )
      .register(
        "secondary",
        fakeAdapter({
          id: "secondary",
          execute: async () => ({
            output: { text: "fallback" },
            artifacts: [],
            raw: {},
          }),
        }),
      );
    const result = await new ProviderExecutionEngine({
      config,
      registry,
      mode: "record",
    }).executeRole("planner", {
      schemaVersion: 1,
      capability: "text.generate",
      input: { prompt: "test" },
    });
    assert.equal(result.output.text, "fallback");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("restricted data is blocked before a hosted adapter executes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rit-provider-policy-"));
  let executed = false;
  try {
    const config = configFor(
      directory,
      {
        cloud: {
          adapter: "fixture",
          executionLocation: "hosted",
          model: "cloud-model",
        },
      },
      { planner: { primary: "cloud", fallbacks: [] } },
      "restricted",
    );
    const registry = new ProviderRegistry().register(
      "cloud",
      fakeAdapter({
        id: "cloud",
        location: "hosted",
        execute: async () => {
          executed = true;
          return { output: {}, artifacts: [], raw: {} };
        },
      }),
    );
    await assert.rejects(
      new ProviderExecutionEngine({ config, registry }).executeRole("planner", {
        schemaVersion: 1,
        capability: "text.generate",
        input: { prompt: "private" },
      }),
      { code: "DATA_POLICY_DENIED" },
    );
    assert.equal(executed, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("invalid structured output receives one recorded repair", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rit-provider-repair-"));
  let calls = 0;
  try {
    const config = configFor(
      directory,
      {
        local: {
          adapter: "fixture",
          executionLocation: "local",
          model: "fixture-model",
        },
      },
      { planner: { primary: "local", fallbacks: [] } },
    );
    const registry = new ProviderRegistry().register(
      "local",
      fakeAdapter({
        id: "fixture",
        execute: async () => {
          calls += 1;
          return {
            output:
              calls === 1
                ? { text: "{bad", invalidJson: true }
                : { text: "{\"ok\":true}", json: { ok: true } },
            artifacts: [],
            raw: { call: calls },
            finishReason: "stop",
          };
        },
      }),
    );
    const result = await new ProviderExecutionEngine({
      config,
      registry,
      mode: "record",
    }).executeRole("planner", {
      schemaVersion: 1,
      capability: "text.generate",
      input: { prompt: "return json" },
      outputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["ok"],
        properties: { ok: { const: true } },
      },
    });
    assert.equal(calls, 2);
    assert.deepEqual(result.output.json, { ok: true });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("interrupted async jobs persist an ID and resume without resubmission", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rit-provider-job-"));
  let submissions = 0;
  try {
    const config = configFor(
      directory,
      {
        media: {
          adapter: "fixture",
          executionLocation: "local",
          model: "fixture-video",
        },
      },
      { video: { primary: "media", fallbacks: [] } },
    );
    const registry = new ProviderRegistry().register(
      "media",
      fakeAdapter({
        id: "fixture-media",
        capabilities: ["video.generate"],
        execute: async (_request, context) => {
          if (!context.resumeJob) {
            submissions += 1;
            await context.onProgress({
              jobId: "job-123",
              status: "queued",
            });
            throw new ProviderError("job is still running", {
              code: "ASYNC_JOB_INCOMPLETE",
            });
          }
          assert.equal(context.resumeJob.jobId, "job-123");
          return {
            output: { jobId: "job-123" },
            artifacts: [
              {
                bytes: Buffer.from("video"),
                filename: "video.mp4",
                mimeType: "video/mp4",
              },
            ],
            raw: { jobId: "job-123", status: "completed" },
          };
        },
      }),
    );
    const first = new ProviderExecutionEngine({
      config,
      registry,
      mode: "record",
    });
    const request = {
      schemaVersion: 1,
      capability: "video.generate",
      input: { prompt: "A labeled diagram" },
    };
    await assert.rejects(first.executeRole("video", request), {
      code: "ASYNC_JOB_INCOMPLETE",
    });
    const resumed = await new ProviderExecutionEngine({
      config,
      registry,
      mode: "record",
    }).executeRole("video", request);
    assert.equal(submissions, 1);
    assert.equal(resumed.output.jobId, "job-123");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("corrupt recorded artifacts fail frozen replay and are quarantined in record mode", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rit-provider-corrupt-"));
  let calls = 0;
  try {
    const config = configFor(
      directory,
      {
        local: {
          adapter: "fixture",
          executionLocation: "local",
          model: "fixture-model",
        },
      },
      { planner: { primary: "local", fallbacks: [] } },
    );
    const registry = new ProviderRegistry().register(
      "local",
      fakeAdapter({
        id: "fixture-corrupt",
        execute: async () => {
          calls += 1;
          return {
            output: { text: "ok" },
            artifacts: [
              {
                bytes: Buffer.from("valid"),
                filename: "asset.bin",
                mimeType: "application/octet-stream",
              },
            ],
            raw: {},
          };
        },
      }),
    );
    const request = {
      schemaVersion: 1,
      capability: "text.generate",
      input: { prompt: "test" },
    };
    const recorded = await new ProviderExecutionEngine({
      config,
      registry,
      mode: "record",
    }).executeRole("planner", request);
    await writeFile(recorded.artifacts[0].path, "corrupt");
    await assert.rejects(
      new ProviderExecutionEngine({
        config,
        registry,
        mode: "frozen",
      }).executeRole("planner", request),
      { code: "CORRUPT_CACHE_ENTRY" },
    );
    const recovered = await new ProviderExecutionEngine({
      config,
      registry,
      mode: "record",
    }).executeRole("planner", request);
    assert.equal(calls, 2);
    assert.equal(recovered.cacheHit, false);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
