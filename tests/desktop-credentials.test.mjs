import assert from "node:assert/strict";
import test from "node:test";
import { presetConfig } from "../src/config.mjs";
import { assertSchema } from "../src/core/schema.mjs";
import {
  applyCredentialProviders,
  assertApiKeyShape,
  CREDENTIAL_PROVIDERS,
  credentialProvider,
  filterPlannerModels,
  maskKey,
} from "../desktop/credential-providers.mjs";

test("api key shapes are validated per provider", () => {
  assert.equal(
    assertApiKeyShape("anthropic", "  sk-ant-api03-abc  "),
    "sk-ant-api03-abc",
  );
  assert.equal(assertApiKeyShape("openai", "sk-proj-abc"), "sk-proj-abc");
  assert.throws(() => assertApiKeyShape("anthropic", "sk-proj-abc"), /sk-ant-/);
  assert.throws(() => assertApiKeyShape("openai", ""), /Enter an API key/);
  assert.throws(() => assertApiKeyShape("openai", "sk-a b"), /spaces/);
  assert.throws(() => credentialProvider("gemini"), /Unknown credential/);
});

test("masking never reveals the middle of a key", () => {
  const masked = maskKey("sk-ant-api03-0123456789abcdef");
  assert.equal(masked, "sk-an…cdef");
  assert.ok(!masked.includes("api03"));
  assert.equal(maskKey("short"), "•••••");
});

test("every provider declares an api-key auth kind", () => {
  for (const provider of CREDENTIAL_PROVIDERS) {
    assert.ok(provider.authKinds.includes("apiKey"), provider.id);
    assert.match(provider.apiKeyEnv, /^[A-Z_]+$/);
  }
});

test("free mode leaves the zero-key generic preset untouched", async () => {
  const base = presetConfig("generic");
  const config = applyCredentialProviders(base, []);
  assert.deepEqual(config, base);
  assert.equal(config.dataPolicy.hostedConsent, false);
  assert.equal(config.roles.planner, undefined);
  await assertSchema("config", config);
});

test("a configured provider adds a hosted planner and keeps Edge narration", async () => {
  const config = applyCredentialProviders(presetConfig("generic"), [
    { id: "anthropic", model: "claude-sonnet-5" },
  ]);
  assert.deepEqual(config.providers["anthropic-planning"], {
    adapter: "anthropic",
    executionLocation: "hosted",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    model: "claude-sonnet-5",
    capabilities: ["text.generate", "research.search"],
  });
  assert.equal(config.roles.planner.primary, "anthropic-planning");
  assert.equal(config.roles.research.primary, "anthropic-planning");
  // Narration must stay on the free Edge TTS profile.
  assert.equal(config.roles.narration.primary, "edge");
  assert.equal(config.dataPolicy.hostedConsent, true);
  // Every hosted profile, Edge TTS included, has to be allow-listed.
  assert.deepEqual(
    [...config.dataPolicy.allowedHostedProviders].sort(),
    ["anthropic-planning", "edge"],
  );
  await assertSchema("config", config);
});

test("the first configured provider wins contested roles", async () => {
  const config = applyCredentialProviders(presetConfig("generic"), [
    { id: "openai", model: "gpt-4.1" },
    { id: "anthropic", model: "claude-sonnet-5" },
  ]);
  assert.equal(config.roles.planner.primary, "openai-planning");
  // Anthropic still serves the role OpenAI did not claim.
  assert.equal(config.roles.research.primary, "anthropic-planning");
  assert.ok(config.providers["openai-planning"]);
  assert.ok(config.providers["anthropic-planning"]);
  await assertSchema("config", config);
});

test("incomplete selections are ignored rather than written as partial profiles", () => {
  const config = applyCredentialProviders(presetConfig("generic"), [
    { id: "anthropic" },
    { model: "gpt-4.1" },
  ]);
  assert.equal(config.providers["anthropic-planning"], undefined);
  assert.equal(config.dataPolicy.hostedConsent, false);
});

test("planner model lists keep text models and stay stable", () => {
  assert.deepEqual(
    filterPlannerModels("openai", ["dall-e-3", "gpt-4.1", "o4-mini", "gpt-4.1"]),
    ["gpt-4.1", "o4-mini"],
  );
  assert.deepEqual(
    filterPlannerModels("anthropic", ["claude-opus-5", "claude-sonnet-5"]),
    ["claude-opus-5", "claude-sonnet-5"],
  );
  // With nothing recognizable, show everything rather than an empty picker.
  assert.deepEqual(filterPlannerModels("openai", ["custom-model"]), [
    "custom-model",
  ]);
});
