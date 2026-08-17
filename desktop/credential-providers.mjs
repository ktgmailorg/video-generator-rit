// Pure provider-catalog logic: which text providers the app offers, how a
// selection becomes a config profile, and how credentials are validated. No
// Electron imports, so this stays unit-testable under plain `node --test`;
// the encrypted store lives in credentials.mjs.

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "::1", "localhost", "0.0.0.0"]);

/**
 * `kind` drives the setup UI and the generated profile:
 *
 * - `local`  — a model server on this machine. No key, no data leaves.
 * - `cloud`  — a hosted API reached with the user's own key.
 * - `custom` — any OpenAI-compatible endpoint the user names themselves.
 *
 * `authKinds` remains the extension point for OAuth: no vendor currently
 * offers a third-party flow that authorizes a consumer ChatGPT or Claude
 * subscription, so every entry here is key-based or keyless.
 */
export const PROVIDER_CATALOG = Object.freeze(
  [
    {
      id: "ollama",
      kind: "local",
      label: "Ollama",
      hint: "Runs models on this computer. Start it with `ollama serve`.",
      adapter: "ollama",
      baseUrl: "http://127.0.0.1:11434/v1",
      authKinds: ["none"],
      setupUrl: "https://ollama.com/download",
    },
    {
      id: "lmstudio",
      kind: "local",
      label: "LM Studio",
      hint: "Enable the local server in LM Studio's Developer tab.",
      adapter: "openai-compatible",
      baseUrl: "http://127.0.0.1:1234/v1",
      authKinds: ["none"],
      setupUrl: "https://lmstudio.ai",
    },
    {
      id: "llamacpp",
      kind: "local",
      label: "llama.cpp server",
      hint: "Any llama-server started with an OpenAI-compatible endpoint.",
      adapter: "openai-compatible",
      baseUrl: "http://127.0.0.1:8080/v1",
      authKinds: ["none"],
      setupUrl: "https://github.com/ggml-org/llama.cpp",
    },
    {
      id: "anthropic",
      kind: "cloud",
      label: "Anthropic (Claude)",
      adapter: "anthropic",
      apiKeyEnv: "ANTHROPIC_API_KEY",
      modelsUrl: "https://api.anthropic.com/v1/models",
      authStyle: "anthropic",
      keyPrefix: "sk-ant-",
      enforcePrefix: true,
      capabilities: ["text.generate", "research.search"],
      roles: ["planner", "research"],
      keyUrl: "https://console.anthropic.com/settings/keys",
    },
    {
      id: "openai",
      kind: "cloud",
      label: "OpenAI",
      adapter: "openai",
      apiKeyEnv: "OPENAI_API_KEY",
      modelsUrl: "https://api.openai.com/v1/models",
      keyPrefix: "sk-",
      enforcePrefix: true,
      keyUrl: "https://platform.openai.com/api-keys",
    },
    {
      id: "gemini",
      kind: "cloud",
      label: "Google Gemini",
      adapter: "openai-compatible",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      apiKeyEnv: "GEMINI_API_KEY",
      keyUrl: "https://aistudio.google.com/apikey",
    },
    {
      id: "groq",
      kind: "cloud",
      label: "Groq",
      adapter: "openai-compatible",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKeyEnv: "GROQ_API_KEY",
      keyUrl: "https://console.groq.com/keys",
    },
    {
      id: "mistral",
      kind: "cloud",
      label: "Mistral",
      adapter: "openai-compatible",
      baseUrl: "https://api.mistral.ai/v1",
      apiKeyEnv: "MISTRAL_API_KEY",
      keyUrl: "https://console.mistral.ai/api-keys",
    },
    {
      id: "deepseek",
      kind: "cloud",
      label: "DeepSeek",
      adapter: "openai-compatible",
      baseUrl: "https://api.deepseek.com/v1",
      apiKeyEnv: "DEEPSEEK_API_KEY",
      keyUrl: "https://platform.deepseek.com/api_keys",
    },
    {
      id: "openrouter",
      kind: "cloud",
      label: "OpenRouter",
      hint: "One key, many models from different vendors.",
      adapter: "openai-compatible",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKeyEnv: "OPENROUTER_API_KEY",
      keyUrl: "https://openrouter.ai/keys",
    },
    {
      id: "together",
      kind: "cloud",
      label: "Together AI",
      adapter: "openai-compatible",
      baseUrl: "https://api.together.xyz/v1",
      apiKeyEnv: "TOGETHER_API_KEY",
      keyUrl: "https://api.together.ai/settings/api-keys",
    },
    {
      id: "custom",
      kind: "custom",
      label: "Custom OpenAI-compatible endpoint",
      hint: "Any server exposing /models and /chat/completions.",
      adapter: "openai-compatible",
      apiKeyEnv: "CUSTOM_API_KEY",
      authKinds: ["apiKey", "none"],
    },
  ].map((provider) =>
    Object.freeze({
      authKinds: provider.kind === "local" ? ["none"] : ["apiKey"],
      capabilities: ["text.generate"],
      roles: ["planner"],
      ...provider,
    }),
  ),
);

export function providerById(id) {
  const provider = PROVIDER_CATALOG.find((entry) => entry.id === id);
  if (!provider) throw new TypeError(`Unknown provider: ${id}`);
  return provider;
}

export function requiresApiKey(provider) {
  return provider.kind === "cloud";
}

export function isLoopbackUrl(value) {
  try {
    return LOOPBACK_HOSTS.has(new URL(value).hostname);
  } catch {
    return false;
  }
}

/** Where a selection actually executes, derived rather than trusted. */
export function executionLocationFor(provider, baseUrl) {
  if (provider.kind === "local") return "local";
  const url = baseUrl || provider.baseUrl;
  return url && isLoopbackUrl(url) ? "local" : "hosted";
}

export function assertEndpointUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) throw new TypeError("Enter the server address.");
  let url;
  try {
    url = new URL(text);
  } catch {
    throw new TypeError(`"${text}" is not a valid URL.`);
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new TypeError("The address must start with http:// or https://.");
  }
  return text.replace(/\/+$/, "");
}

export function assertApiKeyShape(id, key) {
  const provider = providerById(id);
  const value = String(key ?? "").trim();
  if (!value) throw new TypeError(`Enter an API key for ${provider.label}.`);
  if (/\s/.test(value)) {
    throw new TypeError("API keys do not contain spaces or line breaks.");
  }
  // Only vendors with a documented, stable prefix are enforced; guessing at
  // the others would reject valid keys.
  if (provider.enforcePrefix && !value.startsWith(provider.keyPrefix)) {
    throw new TypeError(
      `${provider.label} keys start with "${provider.keyPrefix}".`,
    );
  }
  return value;
}

/** Shown in the UI so a saved key is recognizable without ever returning it. */
export function maskKey(key) {
  const value = String(key ?? "");
  if (value.length <= 8) return "•".repeat(value.length);
  return `${value.slice(0, 5)}…${value.slice(-4)}`;
}

function profileNameFor(provider) {
  return `${provider.id}-planning`;
}

function hostedProviderNames(providers = {}) {
  return Object.entries(providers)
    .filter(([, profile]) => profile?.executionLocation === "hosted")
    .map(([name]) => name);
}

/**
 * Turn saved selections into provider profiles and planner roles. Narration
 * stays on whatever the base config already uses.
 *
 * @param {object} config a config object (typically presetConfig("generic"))
 * @param {Array<{id: string, model: string, baseUrl?: string}>} selections
 */
export function applyProviderSelections(config, selections = []) {
  const next = structuredClone(config);
  next.providers = { ...(next.providers || {}) };
  next.roles = { ...(next.roles || {}) };
  const configured = selections.filter((entry) => entry?.id && entry?.model);

  for (const entry of configured) {
    const provider = providerById(entry.id);
    const baseUrl = entry.baseUrl || provider.baseUrl;
    const executionLocation = executionLocationFor(provider, baseUrl);
    const profile = {
      adapter: provider.adapter,
      executionLocation,
      model: entry.model,
      capabilities: [...provider.capabilities],
    };
    if (baseUrl) profile.baseUrl = baseUrl;
    // A custom endpoint may or may not need a key; only record the variable
    // when one is actually stored for it.
    if (requiresApiKey(provider) || (provider.kind === "custom" && entry.hasKey)) {
      profile.apiKeyEnv = provider.apiKeyEnv;
    }
    next.providers[profileNameFor(provider)] = profile;
  }

  // First configured provider wins each role it can serve; later ones only
  // fill roles still unassigned.
  for (const entry of configured) {
    const provider = providerById(entry.id);
    for (const role of provider.roles) {
      if (!next.roles[role]) {
        next.roles[role] = {
          primary: profileNameFor(provider),
          fallbacks: [],
        };
      }
    }
  }

  // Every hosted profile must be allowlisted for the studio to accept the
  // config, including the Edge TTS narration profile from the generic preset:
  // Edge TTS is Microsoft's hosted service, so narration text does leave the
  // machine even in free mode. Recording that honestly is what lets the
  // studio's public-mode gate open.
  const hosted = hostedProviderNames(next.providers);
  next.dataPolicy = {
    ...next.dataPolicy,
    hostedConsent: hosted.length > 0,
    allowedHostedProviders: hosted,
  };
  return next;
}

// Model lists are long and noisy; keep plausible text-generation ids and
// leave everything alone when nothing is recognizable.
export function filterPlannerModels(id, ids = []) {
  const unique = [...new Set(ids.filter((value) => typeof value === "string"))];
  const patterns = {
    openai: /^(gpt|o[0-9]|chatgpt)/i,
    anthropic: /^claude/i,
  };
  const pattern = patterns[id];
  const matched = pattern ? unique.filter((value) => pattern.test(value)) : [];
  // Never narrow to nothing: an unrecognized catalog is better shown whole
  // than presented as an empty picker.
  const usable = matched.length > 0 ? matched : unique;
  // Embedding, audio, and image models cannot plan a script.
  const textOnly = usable.filter(
    (value) => !/(embed|whisper|tts|dall-e|moderation|rerank|image)/i.test(value),
  );
  return (textOnly.length > 0 ? textOnly : usable).sort();
}
