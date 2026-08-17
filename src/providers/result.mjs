import { sha256, stableStringify } from "../core/canonical.mjs";
import { ProviderError } from "./errors.mjs";

export function textFromOpenAIResponse(response) {
  if (typeof response.output_text === "string") return response.output_text;
  const parts = [];
  for (const item of response.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") parts.push(content.text);
      else if (typeof content.output_text === "string") {
        parts.push(content.output_text);
      }
    }
  }
  return parts.join("\n");
}

export function parseStructuredText(text, schemaRequested) {
  if (!schemaRequested) return { text };
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return {
      text,
      invalidJson: true,
      outputSha256: sha256(text),
    };
  }
}

export function normalizeBridgeResult(value) {
  if (!value || value.schemaVersion !== 1) {
    throw new ProviderError("Bridge returned an unsupported response envelope", {
      code: "INVALID_PROVIDER_RESPONSE",
    });
  }
  const artifacts = (value.artifacts || []).map((artifact) => {
    if (!artifact.base64) {
      throw new ProviderError("Bridge artifacts must contain base64 bytes", {
        code: "INVALID_PROVIDER_RESPONSE",
      });
    }
    return {
      bytes: Buffer.from(artifact.base64, "base64"),
      mimeType: artifact.mimeType || "application/octet-stream",
      filename: artifact.filename,
    };
  });
  return {
    output: value.output || {},
    artifacts,
    usage: value.usage || {},
    costUsd: value.costUsd ?? null,
    requestId: value.requestId,
    modelRevision: value.modelRevision,
    finishReason: value.finishReason || "stop",
    raw: value.raw || value,
  };
}

export function rawResponseHash(raw) {
  return sha256(stableStringify(raw));
}
