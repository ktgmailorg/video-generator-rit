// Encrypted credential storage for the desktop app. Keys are written only
// through Electron's safeStorage (OS keychain / DPAPI / libsecret) and never
// returned to the renderer — the UI sees a masked hint and nothing more.
import { readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { app, safeStorage } from "electron";
import {
  assertApiKeyShape,
  CREDENTIAL_PROVIDERS,
  credentialProvider,
  filterPlannerModels,
  maskKey,
} from "./credential-providers.mjs";

function storePath() {
  return join(app.getPath("userData"), "credentials.enc.json");
}

function settingsPath() {
  return join(app.getPath("userData"), "desktop-settings.json");
}

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

async function readStore() {
  return await readJson(storePath(), {});
}

export async function readSettings() {
  const settings = await readJson(settingsPath(), {});
  return {
    mode: settings.mode === "byok" ? "byok" : "free",
    setupCompleted: settings.setupCompleted === true,
    models: settings.models && typeof settings.models === "object" ? settings.models : {},
  };
}

export async function writeSettings(patch) {
  const next = { ...(await readSettings()), ...patch };
  await writeFile(settingsPath(), `${JSON.stringify(next, null, 2)}\n`, {
    mode: 0o600,
  });
  return next;
}

/** Decrypted keys, for injecting into the studio server environment only. */
export async function credentialEnv() {
  const environment = {};
  const store = await readStore();
  for (const [id, encoded] of Object.entries(store)) {
    let provider;
    try {
      provider = credentialProvider(id);
    } catch {
      continue; // Ignore entries from a newer or older app version.
    }
    try {
      environment[provider.apiKeyEnv] = safeStorage.decryptString(
        Buffer.from(encoded, "base64"),
      );
    } catch {
      // A key encrypted under a different OS profile cannot be recovered.
    }
  }
  for (const [id, value] of sessionOnly) {
    try {
      environment[credentialProvider(id).apiKeyEnv] = value;
    } catch {
      continue;
    }
  }
  return environment;
}

/** Which providers have a usable key, with a masked hint and chosen model. */
export async function configuredCredentials() {
  const environment = await credentialEnv();
  const settings = await readSettings();
  return CREDENTIAL_PROVIDERS.filter(
    (provider) => environment[provider.apiKeyEnv],
  ).map((provider) => ({
    id: provider.id,
    model: settings.models[provider.id],
    hint: maskKey(environment[provider.apiKeyEnv]),
  }));
}

export async function saveCredential(id, key) {
  const provider = credentialProvider(id);
  const value = assertApiKeyShape(id, key);
  if (encryptionAvailable()) {
    const store = await readStore();
    store[provider.id] = safeStorage.encryptString(value).toString("base64");
    await writeFile(storePath(), `${JSON.stringify(store, null, 2)}\n`, {
      mode: 0o600,
    });
  } else {
    sessionOnly.set(provider.id, value);
  }
  return { id: provider.id, hint: maskKey(value) };
}

export async function deleteCredential(id) {
  const provider = credentialProvider(id);
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
  delete settings.models[provider.id];
  await writeSettings({ models: settings.models });
}

/**
 * Confirm a key works before it is stored, and return the model ids the
 * account can actually use so the app never guesses a model name.
 */
export async function verifyCredential(id, key) {
  const provider = credentialProvider(id);
  const value = assertApiKeyShape(id, key);
  const headers =
    provider.id === "anthropic"
      ? { "x-api-key": value, "anthropic-version": "2023-06-01" }
      : { authorization: `Bearer ${value}` };
  let response;
  try {
    response = await fetch(provider.modelsUrl, {
      headers,
      signal: AbortSignal.timeout(20_000),
      cache: "no-store",
    });
  } catch (error) {
    throw new Error(
      `Could not reach ${provider.label}. Check your internet connection. (${error.message})`,
    );
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `${provider.label} rejected that key. Confirm you copied the whole key.`,
    );
  }
  if (!response.ok) {
    throw new Error(`${provider.label} returned HTTP ${response.status}.`);
  }
  const payload = await response.json().catch(() => ({}));
  const ids = (payload.data || []).map((entry) => entry?.id).filter(Boolean);
  return { models: filterPlannerModels(provider.id, ids) };
}
