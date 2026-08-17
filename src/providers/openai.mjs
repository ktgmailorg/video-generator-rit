import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { credentialFor } from "../config.mjs";
import {
  fetchWithTimeout,
  joinUrl,
  requestBytes,
  requestJson,
} from "./http.mjs";
import { providerHttpError, ProviderError } from "./errors.mjs";
import { parseStructuredText, textFromOpenAIResponse } from "./result.mjs";

const sleep = (milliseconds, signal) =>
  new Promise((resolve, reject) => {
    const timeout = setTimeout(resolve, milliseconds);
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timeout);
        reject(signal.reason);
      },
      { once: true },
    );
  });

export function createOpenAIAdapter(profileName, profile) {
  const providerId = "openai";
  const baseUrl = profile.baseUrl || "https://api.openai.com/v1";
  const headers = () => ({
    authorization: `Bearer ${credentialFor(profile)}`,
  });
  const capabilities = profile.capabilities || [
    "text.generate",
    "image.generate",
    "video.generate",
    "speech.synthesize",
    "speech.transcribe",
    "embedding.create",
    "moderation.classify",
    "research.search",
  ];

  return {
    async describe() {
      return {
        id: providerId,
        profileName,
        version: "1.0.0",
        executionLocation: profile.executionLocation,
        capabilities,
        mimeTypes: {
          "text.generate": ["text/plain", "application/json"],
          "image.generate": ["image/png", "image/jpeg", "image/webp"],
          "video.generate": ["video/mp4"],
          "speech.synthesize": ["audio/mpeg", "audio/wav", "audio/ogg"],
          "speech.transcribe": ["application/json", "text/plain"],
          "embedding.create": ["application/json"],
          "moderation.classify": ["application/json"],
          "research.search": ["text/plain", "application/json"],
          ...(profile.mimeTypes || {}),
        },
        supportsStructuredOutput: true,
        supportsSeed: false,
        supportsAsyncJobs: true,
        supportsModelDiscovery: true,
        baseUrl,
      };
    },
    async healthcheck({ signal } = {}) {
      const response = await requestJson({
        providerId,
        baseUrl,
        path: "/models",
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
      const price = profile.pricing?.[request.model]?.[request.capability];
      return price === undefined
        ? { known: false, costUsd: null }
        : { known: true, costUsd: Number(price) };
    },
    async execute(request, { signal, onProgress, resumeJob } = {}) {
      if (request.capability === "text.generate") {
        return executeText(request, {
          providerId,
          baseUrl,
          headers: headers(),
          signal,
          profile,
          research: false,
        });
      }
      if (request.capability === "research.search") {
        return executeText(request, {
          providerId,
          baseUrl,
          headers: headers(),
          signal,
          profile,
          research: true,
        });
      }
      if (request.capability === "image.generate") {
        return executeImage(request, {
          providerId,
          baseUrl,
          headers: headers(),
          signal,
          profile,
        });
      }
      if (request.capability === "video.generate") {
        return executeVideo(request, {
          providerId,
          baseUrl,
          headers: headers(),
          signal,
          profile,
          onProgress,
          resumeJob,
        });
      }
      if (request.capability === "speech.synthesize") {
        const {
          format = "mp3",
          ...speechParameters
        } = {
          ...(profile.speechParameters || {}),
          ...(request.parameters || {}),
        };
        const result = await requestBytes({
          providerId,
          baseUrl,
          path: "/audio/speech",
          method: "POST",
          headers: {
            ...headers(),
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: request.model,
            input: request.input.text,
            voice: request.input.voice || profile.voice,
            response_format: format,
            ...(request.input.instructions
              ? { instructions: request.input.instructions }
              : {}),
            ...speechParameters,
          }),
          signal,
          timeoutMs: profile.timeoutMs,
        });
        return {
          output: {},
          artifacts: [
            {
              bytes: result.bytes,
              mimeType: result.mimeType,
              filename: `speech.${format}`,
            },
          ],
          usage: {},
          modelRevision: request.model,
          finishReason: "stop",
          raw: { responseSha256Only: true },
        };
      }
      if (request.capability === "speech.transcribe") {
        return executeTranscription(request, {
          providerId,
          baseUrl,
          headers: headers(),
          signal,
          profile,
        });
      }
      if (request.capability === "embedding.create") {
        const raw = await requestJson({
          providerId,
          baseUrl,
          path: "/embeddings",
          headers: headers(),
          body: {
            model: request.model,
            input: request.input.texts || request.input.text,
            ...request.parameters,
          },
          signal,
          timeoutMs: profile.timeoutMs,
        });
        return {
          output: {
            embeddings: (raw.data || []).map((item) => item.embedding),
          },
          artifacts: [],
          usage: raw.usage || {},
          requestId: raw.id,
          modelRevision: raw.model || request.model,
          finishReason: "stop",
          raw,
        };
      }
      if (request.capability === "moderation.classify") {
        const raw = await requestJson({
          providerId,
          baseUrl,
          path: "/moderations",
          headers: headers(),
          body: {
            model: request.model,
            input: request.input.content || request.input.text,
          },
          signal,
          timeoutMs: profile.timeoutMs,
        });
        return {
          output: { results: raw.results || [] },
          artifacts: [],
          usage: raw.usage || {},
          requestId: raw.id,
          modelRevision: raw.model || request.model,
          finishReason: "stop",
          raw,
        };
      }
      throw new TypeError(`OpenAI does not implement ${request.capability}`);
    },
  };
}

async function executeText(
  request,
  { providerId, baseUrl, headers, signal, profile, research },
) {
  const raw = await requestJson({
    providerId,
    baseUrl,
    path: "/responses",
    headers,
    body: {
      model: request.model,
      input: request.input.messages || request.input.prompt,
      instructions: request.input.instructions,
      ...(request.outputSchema
        ? {
            text: {
              format: {
                type: "json_schema",
                name: request.schemaName || "response",
                schema: request.outputSchema,
                strict: true,
              },
            },
          }
        : {}),
      ...(research ? { tools: [{ type: "web_search" }] } : {}),
      ...request.parameters,
    },
    signal,
    timeoutMs: profile.timeoutMs,
  });
  const text = textFromOpenAIResponse(raw);
  const refused = (raw.output || []).some((item) =>
    (item.content || []).some(
      (content) => content.type === "refusal" || content.refusal,
    ),
  );
  return {
    output: parseStructuredText(text, request.outputSchema),
    artifacts: [],
    usage: raw.usage || {},
    requestId: raw.id,
    modelRevision: raw.model || request.model,
    finishReason: refused ? "refusal" : raw.status || "stop",
    raw,
  };
}

async function executeImage(
  request,
  { providerId, baseUrl, headers, signal, profile },
) {
  const raw = await requestJson({
    providerId,
    baseUrl,
    path: "/images/generations",
    headers,
    body: {
      model: request.model,
      prompt: request.input.prompt,
      n: request.parameters?.n || 1,
      size: request.parameters?.size || "1536x1024",
      quality: request.parameters?.quality,
      ...(profile.imageParameters || {}),
      ...request.parameters,
    },
    signal,
    timeoutMs: profile.timeoutMs,
  });
  const artifacts = [];
  for (const [index, image] of (raw.data || []).entries()) {
    if (image.b64_json) {
      artifacts.push({
        bytes: Buffer.from(image.b64_json, "base64"),
        mimeType: image.mime_type || "image/png",
        filename: `image-${index + 1}.png`,
      });
    } else if (image.url) {
      const response = await fetchWithTimeout(
        image.url,
        { signal },
        profile.timeoutMs,
      );
      if (!response.ok) {
        throw providerHttpError(providerId, response.status, await response.text());
      }
      artifacts.push({
        bytes: Buffer.from(await response.arrayBuffer()),
        mimeType: response.headers.get("content-type") || "image/png",
        filename: `image-${index + 1}.png`,
      });
    }
  }
  return {
    output: { revisedPrompt: raw.data?.[0]?.revised_prompt },
    artifacts,
    usage: raw.usage || {},
    requestId: raw.id,
    modelRevision: raw.model || request.model,
    finishReason: "stop",
    raw: { ...raw, data: raw.data?.map(({ b64_json, ...item }) => item) },
  };
}

async function executeVideo(
  request,
  {
    providerId,
    baseUrl,
    headers,
    signal,
    profile,
    onProgress,
    resumeJob,
  },
) {
  let created;
  if (resumeJob?.jobId) {
    created = { id: resumeJob.jobId, status: resumeJob.status || "queued" };
  } else {
    const form = new FormData();
    form.set("model", request.model);
    form.set("prompt", request.input.prompt);
    for (const [key, value] of Object.entries(request.parameters || {})) {
      if (value !== undefined && value !== null) form.set(key, String(value));
    }
    const createResponse = await fetchWithTimeout(
      joinUrl(baseUrl, "/videos"),
      { method: "POST", headers, body: form, signal },
      profile.timeoutMs,
    );
    const createText = await createResponse.text();
    if (!createResponse.ok) {
      throw providerHttpError(providerId, createResponse.status, createText);
    }
    created = JSON.parse(createText);
    await onProgress?.({ jobId: created.id, status: created.status || "queued" });
  }
  const deadline = Date.now() + (profile.videoTimeoutMs || 20 * 60_000);
  let job = created;
  while (!["completed", "failed", "cancelled"].includes(job.status)) {
    if (Date.now() >= deadline) {
      throw new ProviderError(`Video job ${job.id} did not complete in time`, {
        code: "ASYNC_JOB_INCOMPLETE",
        retryable: false,
        details: { jobId: job.id },
      });
    }
    await sleep(profile.pollIntervalMs || 5_000, signal);
    job = await requestJson({
      providerId,
      baseUrl,
      path: `/videos/${encodeURIComponent(created.id)}`,
      method: "GET",
      headers,
      signal,
      timeoutMs: profile.timeoutMs,
    });
    await onProgress?.({
      jobId: job.id,
      status: job.status,
      progress: job.progress,
    });
  }
  if (job.status !== "completed") {
    throw new ProviderError(`Video job ${job.id} ended as ${job.status}`, {
      code: "PROVIDER_ERROR",
      details: { job },
    });
  }
  const media = await requestBytes({
    providerId,
    baseUrl,
    path: `/videos/${encodeURIComponent(job.id)}/content`,
    headers,
    signal,
    timeoutMs: profile.timeoutMs,
  });
  return {
    output: { jobId: job.id },
    artifacts: [
      {
        bytes: media.bytes,
        mimeType: media.mimeType || "video/mp4",
        filename: "video.mp4",
      },
    ],
    usage: job.usage || {},
    costUsd: job.cost_usd ?? null,
    requestId: job.id,
    modelRevision: job.model || request.model,
    finishReason: "stop",
    raw: job,
  };
}

async function executeTranscription(
  request,
  { providerId, baseUrl, headers, signal, profile },
) {
  const bytes = request.input.path
    ? await readFile(request.input.path)
    : Buffer.from(request.input.bytes || "", request.input.encoding || "base64");
  const filename = request.input.filename || basename(request.input.path || "audio.wav");
  const form = new FormData();
  form.set("file", new Blob([bytes]), filename);
  form.set("model", request.model);
  const {
    responseFormat = "verbose_json",
    timestampGranularities,
    ...transcriptionParameters
  } = {
    ...(profile.transcriptionParameters || {}),
    ...(request.parameters || {}),
  };
  form.set("response_format", responseFormat);
  for (const granularity of timestampGranularities || []) {
    form.append("timestamp_granularities[]", String(granularity));
  }
  for (const [key, value] of Object.entries(transcriptionParameters)) {
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) form.append(`${key}[]`, String(item));
    } else {
      form.set(key, String(value));
    }
  }
  if (request.input.language) form.set("language", request.input.language);
  const response = await fetchWithTimeout(
    joinUrl(baseUrl, "/audio/transcriptions"),
    { method: "POST", headers, body: form, signal },
    profile.timeoutMs,
  );
  const text = await response.text();
  if (!response.ok) throw providerHttpError(providerId, response.status, text);
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    raw = { text };
  }
  return {
    output: {
      text: raw.text || "",
      words: raw.words || [],
      segments: raw.segments || [],
    },
    artifacts: [],
    usage: raw.usage || {},
    requestId: raw.id,
    modelRevision: raw.model || request.model,
    finishReason: "stop",
    raw,
  };
}
