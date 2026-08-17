import { createAnthropicAdapter } from "./anthropic.mjs";
import { createCliBridgeAdapter, createHttpBridgeAdapter } from "./bridges.mjs";
import { createComfyUiAdapter } from "./comfyui.mjs";
import { createEdgeTtsAdapter } from "./edge-tts.mjs";
import { createOpenAIAdapter } from "./openai.mjs";
import {
  createOllamaAdapter,
  createOpenAICompatibleAdapter,
} from "./openai-compatible.mjs";
import { assertProviderManifest } from "./capabilities.mjs";

export function createBuiltInAdapter(profileName, profile) {
  switch (profile.adapter) {
    case "anthropic":
      return createAnthropicAdapter(profileName, profile);
    case "openai":
      return createOpenAIAdapter(profileName, profile);
    case "openai-compatible":
      return createOpenAICompatibleAdapter(profileName, profile);
    case "ollama":
      return createOllamaAdapter(profileName, profile);
    case "comfyui":
      return createComfyUiAdapter(profileName, profile);
    case "edge-tts":
      return createEdgeTtsAdapter(profileName, profile);
    case "http-bridge":
      return createHttpBridgeAdapter(profileName, profile);
    case "cli-bridge":
      return createCliBridgeAdapter(profileName, profile);
    default:
      throw new TypeError(
        `Unknown provider adapter ${profile.adapter} for ${profileName}`,
      );
  }
}

export class ProviderRegistry {
  #adapters = new Map();
  #manifests = new Map();

  static fromConfig(config) {
    const registry = new ProviderRegistry();
    for (const [profileName, profile] of Object.entries(config.providers || {})) {
      registry.register(profileName, createBuiltInAdapter(profileName, profile));
    }
    return registry;
  }

  register(profileName, adapter) {
    if (!profileName || this.#adapters.has(profileName)) {
      throw new TypeError(`Duplicate or empty provider profile: ${profileName}`);
    }
    for (const method of ["describe", "healthcheck", "execute"]) {
      if (typeof adapter?.[method] !== "function") {
        throw new TypeError(
          `Provider adapter ${profileName} is missing ${method}()`,
        );
      }
    }
    this.#adapters.set(profileName, adapter);
    return this;
  }

  get(profileName) {
    const adapter = this.#adapters.get(profileName);
    if (!adapter) throw new TypeError(`Unknown provider profile: ${profileName}`);
    return adapter;
  }

  async manifest(profileName) {
    if (this.#manifests.has(profileName)) {
      return this.#manifests.get(profileName);
    }
    const manifest = assertProviderManifest(
      await this.get(profileName).describe(),
    );
    this.#manifests.set(profileName, manifest);
    return manifest;
  }

  async list() {
    return Promise.all(
      [...this.#adapters.keys()].sort().map(async (profileName) => ({
        profileName,
        ...(await this.manifest(profileName)),
      })),
    );
  }

  async probe(profileName, options = {}) {
    const adapter = this.get(profileName);
    const manifest = await this.manifest(profileName);
    const health = await adapter.healthcheck(options);
    return { profileName, manifest, health };
  }
}
