import assert from "node:assert/strict";
import test from "node:test";
import { presetConfig } from "../src/config.mjs";
import { assertSchema } from "../src/core/schema.mjs";
import { inspectFullyLocalStudioConfig } from "../studio/local-policy.mjs";
import {
  applyProviderSelections,
  assertApiKeyShape,
  assertEndpointUrl,
  executionLocationFor,
  filterPlannerModels,
  isLoopbackUrl,
  maskKey,
  PROVIDER_CATALOG,
  providerById,
  requiresApiKey,
} from "../desktop/credential-providers.mjs";

test("api key shapes are validated only where a prefix is documented", () => {
  assert.equal(
    assertApiKeyShape("anthropic", "  sk-ant-api03-abc  "),
    "sk-ant-api03-abc",
  );
  assert.throws(() => assertApiKeyShape("anthropic", "sk-proj-abc"), /sk-ant-/);
  assert.throws(() => assertApiKeyShape("openai", ""), /Enter an API key/);
  assert.throws(() => assertApiKeyShape("openai", "sk-a b"), /spaces/);
  // Vendors without a stable documented prefix must accept their real keys
  // rather than be rejected by a guess.
  assert.equal(assertApiKeyShape("groq", "gsk_abc123"), "gsk_abc123");
  assert.equal(assertApiKeyShape("openrouter", "sk-or-v1-abc"), "sk-or-v1-abc");
  assert.equal(assertApiKeyShape("gemini", "AIzaSyAbc123"), "AIzaSyAbc123");
  assert.throws(() => providerById("nope"), /Unknown provider/);
});

test("masking never reveals the middle of a key", () => {
  const masked = maskKey("sk-ant-api03-0123456789abcdef");
  assert.equal(masked, "sk-an…cdef");
  assert.ok(!masked.includes("api03"));
  assert.equal(maskKey("short"), "•••••");
});

test("the catalog covers local, cloud, and custom options coherently", () => {
  const kinds = new Set(PROVIDER_CATALOG.map((provider) => provider.kind));
  assert.deepEqual([...kinds].sort(), ["cloud", "custom", "local"]);
  for (const provider of PROVIDER_CATALOG) {
    assert.ok(provider.label && provider.adapter, provider.id);
    assert.ok(provider.roles.includes("planner"), provider.id);
    if (provider.kind === "local") {
      assert.ok(isLoopbackUrl(provider.baseUrl), provider.id);
      assert.equal(requiresApiKey(provider), false, provider.id);
    }
    if (provider.kind === "cloud") {
      assert.match(provider.apiKeyEnv, /^[A-Z_]+$/, provider.id);
      assert.ok(provider.keyUrl, provider.id);
      // Either a native adapter with its own endpoint, or a base URL.
      assert.ok(provider.baseUrl || provider.modelsUrl, provider.id);
    }
  }
});

test("endpoint URLs are validated and normalized", () => {
  assert.equal(
    assertEndpointUrl("  http://127.0.0.1:1234/v1/  "),
    "http://127.0.0.1:1234/v1",
  );
  assert.throws(() => assertEndpointUrl(""), /Enter the server address/);
  assert.throws(() => assertEndpointUrl("not a url"), /not a valid URL/);
  assert.throws(() => assertEndpointUrl("ftp://host/v1"), /http/);
});

test("execution location is derived from the endpoint, not claimed", () => {
  assert.equal(executionLocationFor(providerById("ollama")), "local");
  assert.equal(executionLocationFor(providerById("openai")), "hosted");
  // A custom endpoint is local only when it really is loopback.
  const custom = providerById("custom");
  assert.equal(executionLocationFor(custom, "http://localhost:9000/v1"), "local");
  assert.equal(executionLocationFor(custom, "https://models.example.edu/v1"), "hosted");
});

test("free mode adds no planner but allowlists Edge TTS narration", async () => {
  const config = applyProviderSelections(presetConfig("generic"), []);
  assert.equal(config.roles.planner, undefined);
  assert.deepEqual(Object.keys(config.providers), ["edge"]);
  // Edge TTS is Microsoft-hosted, so it must be declared to pass the studio
  // gate; claiming free mode is fully local would be inaccurate.
  assert.equal(config.dataPolicy.hostedConsent, true);
  assert.deepEqual(config.dataPolicy.allowedHostedProviders, ["edge"]);
  await assertSchema("config", config);
});

test("a local model server produces a local profile and needs no key", async () => {
  const config = applyProviderSelections(presetConfig("generic"), [
    { id: "ollama", model: "qwen3.8-27b" },
  ]);
  const profile = config.providers["ollama-planning"];
  assert.equal(profile.adapter, "ollama");
  assert.equal(profile.executionLocation, "local");
  assert.equal(profile.apiKeyEnv, undefined);
  assert.equal(profile.baseUrl, "http://127.0.0.1:11434/v1");
  assert.equal(config.roles.planner.primary, "ollama-planning");
  // Only Edge TTS remains hosted, so the local planner is not allowlisted.
  assert.deepEqual(config.dataPolicy.allowedHostedProviders, ["edge"]);
  await assertSchema("config", config);
});

test("a cloud provider records its key variable, endpoint, and model", async () => {
  const config = applyProviderSelections(presetConfig("generic"), [
    { id: "groq", model: "llama-3.3-70b" },
  ]);
  assert.deepEqual(config.providers["groq-planning"], {
    adapter: "openai-compatible",
    executionLocation: "hosted",
    model: "llama-3.3-70b",
    capabilities: ["text.generate"],
    baseUrl: "https://api.groq.com/openai/v1",
    apiKeyEnv: "GROQ_API_KEY",
  });
  assert.deepEqual(
    [...config.dataPolicy.allowedHostedProviders].sort(),
    ["edge", "groq-planning"],
  );
  await assertSchema("config", config);
});

test("a custom endpoint is honored, with a key only when one was stored", async () => {
  const withKey = applyProviderSelections(presetConfig("generic"), [
    { id: "custom", model: "my-model", baseUrl: "https://ai.example.edu/v1", hasKey: true },
  ]);
  assert.equal(withKey.providers["custom-planning"].apiKeyEnv, "CUSTOM_API_KEY");
  assert.equal(withKey.providers["custom-planning"].executionLocation, "hosted");

  const keyless = applyProviderSelections(presetConfig("generic"), [
    { id: "custom", model: "my-model", baseUrl: "http://127.0.0.1:9000/v1" },
  ]);
  assert.equal(keyless.providers["custom-planning"].apiKeyEnv, undefined);
  assert.equal(keyless.providers["custom-planning"].executionLocation, "local");
  await assertSchema("config", keyless);
});

test("anthropic claims research as well as planning; others only plan", async () => {
  const config = applyProviderSelections(presetConfig("generic"), [
    { id: "anthropic", model: "claude-sonnet-5" },
  ]);
  assert.equal(config.roles.planner.primary, "anthropic-planning");
  assert.equal(config.roles.research.primary, "anthropic-planning");
  const groq = applyProviderSelections(presetConfig("generic"), [
    { id: "groq", model: "llama-3.3-70b" },
  ]);
  assert.equal(groq.roles.research, undefined);
});

test("the first configured provider wins contested roles", () => {
  const config = applyProviderSelections(presetConfig("generic"), [
    { id: "ollama", model: "local-model" },
    { id: "anthropic", model: "claude-sonnet-5" },
  ]);
  assert.equal(config.roles.planner.primary, "ollama-planning");
  // Anthropic still serves the role the local model did not claim.
  assert.equal(config.roles.research.primary, "anthropic-planning");
});

test("incomplete selections are ignored rather than written as partial profiles", () => {
  const config = applyProviderSelections(presetConfig("generic"), [
    { id: "anthropic" },
    { model: "gpt-4.1" },
  ]);
  assert.equal(config.providers["anthropic-planning"], undefined);
  assert.deepEqual(config.dataPolicy.allowedHostedProviders, ["edge"]);
});

test("every combination the app can generate passes the studio gate", async () => {
  const options = [
    [],
    [{ id: "ollama", model: "local-model" }],
    [{ id: "lmstudio", model: "local-model" }],
    [{ id: "anthropic", model: "claude-sonnet-5" }],
    [{ id: "openai", model: "gpt-4.1" }],
    [{ id: "gemini", model: "gemini-2.5-pro" }],
    [{ id: "openrouter", model: "vendor/model" }],
    [{ id: "custom", model: "m", baseUrl: "https://ai.example.edu/v1", hasKey: true }],
    [{ id: "custom", model: "m", baseUrl: "http://127.0.0.1:9000/v1" }],
    [
      { id: "ollama", model: "local-model" },
      { id: "anthropic", model: "claude-sonnet-5" },
    ],
  ];
  for (const selections of options) {
    const config = applyProviderSelections(presetConfig("generic"), selections);
    await assertSchema("config", config);
    const inspection = inspectFullyLocalStudioConfig(config);
    assert.equal(
      inspection.ok,
      true,
      `${JSON.stringify(selections)}: ${inspection.errors.join("; ")}`,
    );
  }
});

test("planner model lists drop non-text models and stay stable", () => {
  assert.deepEqual(
    filterPlannerModels("openai", ["dall-e-3", "gpt-4.1", "o4-mini", "gpt-4.1"]),
    ["gpt-4.1", "o4-mini"],
  );
  assert.deepEqual(
    filterPlannerModels("ollama", [
      "qwen3:8b",
      "nomic-embed-text:latest",
      "llama3.2:3b",
    ]),
    ["llama3.2:3b", "qwen3:8b"],
  );
  // With nothing recognizable, show everything rather than an empty picker.
  assert.deepEqual(filterPlannerModels("openai", ["custom-model"]), [
    "custom-model",
  ]);
});
