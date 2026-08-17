import { credentialFor } from "../config.mjs";
import { requestJson } from "./http.mjs";
import { parseStructuredText } from "./result.mjs";

export function createAnthropicAdapter(profileName, profile) {
  const providerId = "anthropic";
  const baseUrl = profile.baseUrl || "https://api.anthropic.com/v1";
  const headers = () => ({
    "x-api-key": credentialFor(profile),
    "anthropic-version": profile.apiVersion || "2023-06-01",
  });
  return {
    async describe() {
      return {
        id: providerId,
        profileName,
        version: "1.0.0",
        executionLocation: profile.executionLocation,
        capabilities: profile.capabilities || [
          "text.generate",
          "research.search",
        ],
        mimeTypes: {
          "text.generate": ["text/plain", "application/json"],
          "research.search": ["text/plain", "application/json"],
        },
        supportsStructuredOutput: true,
        supportsSeed: false,
        supportsAsyncJobs: false,
        supportsModelDiscovery: true,
        baseUrl,
      };
    },
    async healthcheck({ signal } = {}) {
      const response = await requestJson({
        providerId,
        baseUrl,
        path: "/models?limit=100",
        method: "GET",
        headers: headers(),
        signal,
        timeoutMs: profile.timeoutMs || 15_000,
      });
      const models = (response.data || []).map((model) => model.id);
      const configuredModelAvailable =
        !profile.model ||
        profile.allowUnlistedModel ||
        models.includes(profile.model);
      return {
        ok: Boolean(configuredModelAvailable),
        models,
        ...(configuredModelAvailable
          ? {}
          : { error: `Configured model is not listed: ${profile.model}` }),
      };
    },
    async estimate(request) {
      const value =
        typeof profile.estimatedCostUsd === "object"
          ? profile.estimatedCostUsd[request.capability]
          : profile.estimatedCostUsd;
      return value === undefined
        ? { known: false, costUsd: null }
        : { known: true, costUsd: Number(value) };
    },
    async execute(request, { signal } = {}) {
      if (!["text.generate", "research.search"].includes(request.capability)) {
        throw new TypeError(`Anthropic does not implement ${request.capability}`);
      }
      const research = request.capability === "research.search";
      const raw = await requestJson({
        providerId,
        baseUrl,
        path: "/messages",
        headers: headers(),
        body: {
          model: request.model,
          max_tokens: request.parameters?.maxTokens || 4096,
          system: request.input.instructions,
          messages:
            request.input.messages ||
            [{ role: "user", content: request.input.prompt }],
          ...(request.outputSchema
            ? {
                output_config: {
                  format: {
                    type: "json_schema",
                    schema: request.outputSchema,
                  },
                },
              }
            : {}),
          ...(research
            ? {
                tools: [
                  {
                    type:
                      profile.researchToolType || "web_search_20250305",
                    name: "web_search",
                    max_uses: request.parameters?.maxUses || 5,
                  },
                ],
              }
            : {}),
          ...Object.fromEntries(
            Object.entries(request.parameters || {}).filter(
              ([key]) => !["maxTokens", "maxUses"].includes(key),
            ),
          ),
        },
        signal,
        timeoutMs: profile.timeoutMs,
      });
      const text = (raw.content || [])
        .filter((item) => item.type === "text")
        .map((item) => item.text)
        .join("\n");
      return {
        output: parseStructuredText(text, request.outputSchema),
        artifacts: [],
        usage: raw.usage || {},
        requestId: raw.id,
        modelRevision: raw.model || request.model,
        finishReason: raw.stop_reason || "stop",
        raw,
      };
    },
  };
}
