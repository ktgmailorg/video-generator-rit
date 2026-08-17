// Credential and provider storage for the desktop app. API keys are written
// only through Electron's safeStorage (OS keychain / DPAPI / libsecret) and
// never returned to the renderer — the UI sees a masked hint and nothing more.
// Endpoints and model choices are not secret and live in a plain settings file.
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import {
  assertApiKeyShape,
  assertEndpointUrl,
  executionLocationFor,
  filterPlannerModels,
  maskKey,
  providerById,
  PROVIDER_CATALOG,
  requiresApiKey,
} from "./credential-providers.mjs";

const storePath = () => join(app.getPath("userData"), "credentials.enc.json");
const settingsPath = () => join(app.getPath("userData"), "desktop-settings.json");

// Used when the OS has no usable keyring: keys stay in memory for this run
// only. Writing them to disk in plaintext is never an option.
const sessionOnly = new Map();

export function encryptionAvailable() {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return fallback;
  }
}

export async function readSettings() {
  const settings = await readJson(settingsPath(), {});
  return {
    mode: settings.mode === "byok" ? "byok" : "free",
    setupCompleted: settings.setupCompleted === true,
    // { [providerId]: { model, baseUrl } }
    providers:
      settings.providers && typeof settings.providers === "object"
        ? settings.providers
        : {},
  };
}

export async function writeSettings(patch) {
  const next = { ...(await readSettings()), ...patch };
  await writeFile(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  return next;
}

async function readStore() {
  return await readJson(storePath(), {});
}

async function decryptKey(encoded) {
  try {
    return safeStorage.decryptString(Buffer.from(encoded, "base64"));
  } catch {
    // A key encrypted under a different OS profile cannot be recovered.
    return null;
  }
}

/** Decrypted keys, for injecting into the studio server environment only. */
export async function credentialEnv() {
  const environment = {};
  const store = await readStore();
  for (const [id, encoded] of Object.entries(store)) {
    let provider;
    try {
      provider = providerById(id);
    } catch {
      continue; // Ignore entries from a newer or older app version.
    }
    const value = await decryptKey(encoded);
    if (value) environment[provider.apiKeyEnv] = value;
  }
  for (const [id, value] of sessionOnly) {
    try {
      environment[providerById(id).apiKeyEnv] = value;
    } catch {
      continue;
    }
  }
  return environment;
}

async function storedKeyFor(id) {
  if (sessionOnly.has(id)) return sessionOnly.get(id);
  const store = await readStore();
  return store[id] ? await decryptKey(store[id]) : null;
}

/**
 * Providers the app is currently configured to use, with a masked key hint.
 * A provider counts as configured once it has a chosen model — and, for cloud
 * providers, a usable key.
 */
export async function configuredProviders() {
  const settings = await readSettings();
  const configured = [];
  for (const [id, entry] of Object.entries(settings.providers)) {
    let provider;
    try {
      provider = providerById(id);
    } catch {
      continue;
    }
    if (!entry?.model) continue;
    const key = provider.apiKeyEnv ? await storedKeyFor(id) : null;
    if (requiresApiKey(provider) && !key) continue;
    const baseUrl = entry.baseUrl || provider.baseUrl;
    configured.push({
      id,
      label: provider.label,
      kind: provider.kind,
      model: entry.model,
      baseUrl,
      hasKey: Boolean(key),
      hint: key ? maskKey(key) : null,
      executionLocation: executionLocationFor(provider, baseUrl),
    });
  }
  return configured;
}

function authHeaders(provider, key) {
  if (!key) return {};
  return provider.authStyle === "anthropic"
    ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
    : { authorization: `Bearer ${key}` };
}

/**
 * Confirm a provider is reachable and usable, and return the models it can
 * actually serve, so the app never guesses a model name.
 */
export async function verifyProvider({ id, key, baseUrl }) {
  const provider = providerById(id);
  const endpoint = baseUrl
    ? assertEndpointUrl(baseUrl)
    : provider.baseUrl || null;
  const credential = requiresApiKey(provider)
    ? assertApiKeyShape(id, key)
    : key
      ? assertApiKeyShape(id, key)
      : null;
  const modelsUrl = provider.modelsUrl || `${endpoint}/models`;
  if (!modelsUrl) throw new TypeError(`${provider.label} needs a server address.`);

  let response;
  try {
    response = await fetch(modelsUrl, {
      headers: authHeaders(provider, credential),
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      provider.kind === "local"
        ? `No server responded at ${endpoint}. Start ${provider.label} and try again.`
        : `Could not reach ${provider.label} (${error.message}).`,
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      credential
        ? `${provider.label} rejected that key. Confirm you copied the whole key.`
        : `${provider.label} requires an API key.`,
    );
  }
  if (!response.ok) {
    throw new Error(`${provider.label} returned HTTP ${response.status}.`);
  }
  const payload = await response.json().catch(() => ({}));
  const ids = (payload.data || payload.models || [])
    .map((entry) => entry?.id || entry?.name || entry)
    .filter((entry) => typeof entry === "string");
  if (ids.length === 0) {
    throw new Error(
      `${provider.label} responded but listed no models. Load a model first.`,
    );
  }
  return {
    models: filterPlannerModels(provider.id, ids),
    executionLocation: executionLocationFor(provider, endpoint),
  };
}

/** Probe the local servers so the setup screen can offer what is running. */
export async function discoverLocalProviders() {
  const locals = PROVIDER_CATALOG.filter((provider) => provider.kind === "local");
  return await Promise.all(
    locals.map(async (provider) => {
      try {
        const response = await fetch(`${provider.baseUrl}/models`, {
          signal: AbortSignal.timeout(2_500),
          cache: "no-store",
        });
        if (!response.ok) throw new Error(String(response.status));
        const payload = await response.json();
        const models = filterPlannerModels(
          provider.id,
          (payload.data || payload.models || [])
            .map((entry) => entry?.id || entry?.name || entry)
            .filter((entry) => typeof entry === "string"),
        );
        return { id: provider.id, running: models.length > 0, models };
      } catch {
        return { id: provider.id, running: false, models: [] };
      }
    }),
  );
}

export async function saveProvider({ id, key, model, baseUrl }) {
  const provider = providerById(id);
  if (!model) throw new TypeError("Choose a model first.");
  const endpoint = baseUrl ? assertEndpointUrl(baseUrl) : provider.baseUrl;
  if (key) {
    const value = assertApiKeyShape(id, key);
    if (encryptionAvailable()) {
      const store = await readStore();
      store[id] = safeStorage.encryptString(value).toString("base64");
      await writeFile(storePath(), `${JSON.stringify(store, null, 2)}\n`, {
        mode: 0o600,
      });
    } else {
      sessionOnly.set(id, value);
    }
  } else if (requiresApiKey(provider) && !(await storedKeyFor(id))) {
    throw new TypeError(`${provider.label} needs an API key.`);
  }
  const settings = await readSettings();
  await writeSettings({
    mode: "byok",
    providers: {
      ...settings.providers,
      [id]: { model, ...(endpoint ? { baseUrl: endpoint } : {}) },
    },
  });
  return { id, hint: key ? maskKey(key) : null };
}

export async function forgetProvider(id) {
  const provider = providerById(id);
  sessionOnly.delete(provider.id);
  const store = await readStore();
  if (provider.id in store) {
    delete store[provider.id];
    if (Object.keys(store).length === 0) {
      await rm(storePath(), { force: true });
    } else {
      await writeFile(storePath(), `${JSON.stringify(store, null, 2)}\n`, {
        mode: 0o600,
      });
    }
  }
  const settings = await readSettings();
  delete settings.providers[provider.id];
  const remaining = Object.keys(settings.providers).length;
  await writeSettings({
    providers: settings.providers,
    mode: remaining > 0 ? "byok" : "free",
  });
}
