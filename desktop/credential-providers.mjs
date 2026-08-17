// Pure credential-provider logic: the registry, config patching, and key
// shape checks. No Electron imports so this stays unit-testable under plain
// `node --test`; the encrypted store lives in credentials.mjs.

// `authKinds` is the extension point. Today both vendors only support API
// keys for third-party applications: their OAuth flows are reserved for their
// own first-party clients and cannot authorize a consumer ChatGPT or Claude
// subscription for API use. If either publishes a third-party OAuth flow,
// add "oauth" here plus an `oauth` descriptor and the wizard picks it up.
export const CREDENTIAL_PROVIDERS = Object.freeze([
  Object.freeze({
    id: "anthropic",
    label: "Anthropic (Claude)",
    adapter: "anthropic",
    profileName: "anthropic-planning",
    apiKeyEnv: "ANTHROPIC_API_KEY",
    authKinds: Object.freeze(["apiKey"]),
    keyPrefix: "sk-ant-",
    keyUrl: "https://console.anthropic.com/settings/keys",
    modelsUrl: "https://api.anthropic.com/v1/models",
    capabilities: Object.freeze(["text.generate", "research.search"]),
    roles: Object.freeze(["planner", "research"]),
  }),
  Object.freeze({
    id: "openai",
    label: "OpenAI (ChatGPT models)",
    adapter: "openai",
    profileName: "openai-planning",
    apiKeyEnv: "OPENAI_API_KEY",
    authKinds: Object.freeze(["apiKey"]),
    keyPrefix: "sk-",
    keyUrl: "https://platform.openai.com/api-keys",
    modelsUrl: "https://api.openai.com/v1/models",
    capabilities: Object.freeze(["text.generate"]),
    roles: Object.freeze(["planner"]),
  }),
]);

export function credentialProvider(id) {
  const provider = CREDENTIAL_PROVIDERS.find((entry) => entry.id === id);
  if (!provider) throw new TypeError(`Unknown credential provider: ${id}`);
  return provider;
}

export function assertApiKeyShape(id, key) {
  const provider = credentialProvider(id);
  const value = String(key ?? "").trim();
  if (!value) throw new TypeError(`Enter an API key for ${provider.label}.`);
  if (/\s/.test(value)) {
    throw new TypeError("API keys do not contain spaces or line breaks.");
  }
  if (!value.startsWith(provider.keyPrefix)) {
    throw new TypeError(
      `${provider.label} keys start with "${provider.keyPrefix}".`,
    );
  }
  return value;
}

// Shown in the UI so a saved key is recognizable without ever returning it.
export function maskKey(key) {
  const value = String(key ?? "");
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 5)}…${value.slice(-4)}`;
}

function hostedProviderNames(providers = {}) {
  return Object.entries(providers)
    .filter(([, profile]) => profile?.executionLocation === "hosted")
    .map(([name]) => name);
}

/**
 * Add a hosted text planner for each configured credential provider so the
 * studio's "generate a draft transcript with AI" mode becomes available.
 * Narration stays on the zero-key Edge TTS profile from the generic preset.
 *
 * @param {object} config a config object (typically presetConfig("generic"))
 * @param {Array<{id: string, model: string}>} selections configured providers
 */
export function applyCredentialProviders(config, selections = []) {
  const next = structuredClone(config);
  next.providers = { ...(next.providers || {}) };
  next.roles = { ...(next.roles || {}) };
  const configured = selections.filter((entry) => entry?.id && entry?.model);

  for (const { id, model } of configured) {
    const provider = credentialProvider(id);
    next.providers[provider.profileName] = {
      adapter: provider.adapter,
      executionLocation: "hosted",
      apiKeyEnv: provider.apiKeyEnv,
      model,
      capabilities: [...provider.capabilities],
    };
  }
  // First configured provider wins each role it can serve; a later provider
  // only fills roles still unassigned.
  for (const { id } of configured) {
    const provider = credentialProvider(id);
    for (const role of provider.roles) {
      if (!next.roles[role]) {
        next.roles[role] = { primary: provider.profileName, fallbacks: [] };
      }
    }
  }
  // Every hosted profile must be allowlisted for the studio to accept the
  // config, including the Edge TTS narration profile from the generic preset:
  // Edge TTS is Microsoft's hosted service, so narration text does leave the
  // machine even in free mode. Recording that honestly here is what lets the
  // studio's public-mode gate open.
  const hosted = hostedProviderNames(next.providers);
  next.dataPolicy = {
    ...next.dataPolicy,
    hostedConsent: hosted.length > 0,
    allowedHostedProviders: hosted,
  };
  return next;
}

// Model lists are long and noisy; keep plausible text-generation ids.
export function filterPlannerModels(id, ids = []) {
  const unique = [...new Set(ids.filter((value) => typeof value === "string"))];
  const usable =
    id === "openai"
      ? unique.filter((value) => /^(gpt|o[0-9])/i.test(value))
      : unique.filter((value) => /^claude/i.test(value));
  return (usable.length > 0 ? usable : unique).sort();
}
