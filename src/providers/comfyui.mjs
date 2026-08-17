import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { sha256 } from "../core/canonical.mjs";
import { fetchWithTimeout, joinUrl, requestJson } from "./http.mjs";
import { providerHttpError, ProviderError } from "./errors.mjs";

const clone = (value) => structuredClone(value);
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

async function loadWorkflow(profile) {
  if (profile.workflow) return clone(profile.workflow);
  if (!profile.workflowFile) {
    throw new TypeError("ComfyUI provider requires workflow or workflowFile");
  }
  return JSON.parse(await readFile(profile.workflowFile, "utf8"));
}

function setWorkflowInput(workflow, binding, value) {
  if (!binding || value === undefined || value === null) return;
  const node = workflow[String(binding.nodeId)];
  if (!node?.inputs) {
    throw new TypeError(`ComfyUI workflow has no node ${binding.nodeId}`);
  }
  node.inputs[binding.input || "text"] = value;
}

export function createComfyUiAdapter(profileName, profile) {
  const providerId = "comfyui";
  const baseUrl = profile.baseUrl || "http://127.0.0.1:8188";
  return {
    async describe() {
      const workflowSha256 = await loadWorkflow(profile)
        .then((workflow) => sha256(workflow))
        .catch(() => null);
      return {
        id: providerId,
        profileName,
        version: "1.0.0",
        executionLocation: "local",
        capabilities: profile.capabilities || [
          "image.generate",
          "video.generate",
        ],
        mimeTypes: {
          "image.generate": ["image/png", "image/jpeg", "image/webp"],
          "video.generate": ["video/mp4", "image/gif", "image/webp"],
          ...(profile.mimeTypes || {}),
        },
        supportsStructuredOutput: false,
        supportsSeed: true,
        supportsAsyncJobs: true,
        supportsModelDiscovery: true,
        baseUrl,
        workflowSha256,
        workflowRevision: profile.workflowRevision || null,
      };
    },
    async healthcheck({ signal } = {}) {
      const workflow = await loadWorkflow(profile);
      const [stats, features, objectInfo] = await Promise.all([
        requestJson({
          providerId,
          baseUrl,
          path: "/system_stats",
          method: "GET",
          signal,
          timeoutMs: profile.timeoutMs || 15_000,
        }),
        requestJson({
          providerId,
          baseUrl,
          path: "/features",
          method: "GET",
          signal,
          timeoutMs: profile.timeoutMs || 15_000,
        }).catch(() => ({})),
        profile.requiredModelIdentifiers?.length
          ? requestJson({
              providerId,
              baseUrl,
              path: "/object_info",
              method: "GET",
              signal,
              timeoutMs: profile.timeoutMs || 15_000,
            })
          : Promise.resolve(null),
      ]);
      const serializedObjectInfo = objectInfo
        ? JSON.stringify(objectInfo)
        : "";
      const missingModels = (
        profile.requiredModelIdentifiers || []
      ).filter((identifier) => !serializedObjectInfo.includes(identifier));
      return {
        ok: missingModels.length === 0,
        stats,
        features,
        workflowSha256: sha256(workflow),
        missingModels,
        ...(missingModels.length
          ? {
              error: `ComfyUI is missing configured model identifiers: ${missingModels.join(", ")}`,
            }
          : {}),
      };
    },
    async estimate() {
      return { known: true, costUsd: 0 };
    },
    async execute(request, { signal, onProgress, resumeJob } = {}) {
      if (!["image.generate", "video.generate"].includes(request.capability)) {
        throw new TypeError(`ComfyUI does not implement ${request.capability}`);
      }
      const workflow = await loadWorkflow(profile);
      const bindings = profile.bindings || {};
      setWorkflowInput(workflow, bindings.prompt, request.input.prompt);
      setWorkflowInput(workflow, bindings.negativePrompt, request.input.negativePrompt || "");
      setWorkflowInput(workflow, bindings.seed, request.seed ?? request.parameters?.seed ?? 0);
      setWorkflowInput(workflow, bindings.width, request.parameters?.width);
      setWorkflowInput(workflow, bindings.height, request.parameters?.height);
      setWorkflowInput(workflow, bindings.frames, request.parameters?.frames);
      const clientId = randomUUID();
      const queued = resumeJob?.jobId
        ? { prompt_id: resumeJob.jobId }
        : await requestJson({
            providerId,
            baseUrl,
            path: "/prompt",
            body: { prompt: workflow, client_id: clientId },
            signal,
            timeoutMs: profile.timeoutMs,
          });
      if (!queued.prompt_id) {
        throw new ProviderError("ComfyUI did not return prompt_id", {
          code: "INVALID_PROVIDER_RESPONSE",
          details: { response: queued },
        });
      }
      await onProgress?.({
        jobId: queued.prompt_id,
        status: resumeJob?.jobId ? "resuming" : "queued",
      });
      const deadline = Date.now() + (profile.jobTimeoutMs || 20 * 60_000);
      let history;
      while (!history) {
        if (Date.now() >= deadline) {
          throw new ProviderError(
            `ComfyUI job ${queued.prompt_id} did not complete in time`,
            {
              code: "ASYNC_JOB_INCOMPLETE",
              retryable: false,
              details: { jobId: queued.prompt_id },
            },
          );
        }
        await sleep(profile.pollIntervalMs || 1_000, signal);
        const response = await requestJson({
          providerId,
          baseUrl,
          path: `/history/${encodeURIComponent(queued.prompt_id)}`,
          method: "GET",
          signal,
          timeoutMs: profile.timeoutMs,
        });
        history = response[queued.prompt_id];
        await onProgress?.({
          jobId: queued.prompt_id,
          status: history ? "completed" : "running",
        });
      }
      if (history.status?.status_str === "error") {
        throw new ProviderError(`ComfyUI job ${queued.prompt_id} failed`, {
          code: "PROVIDER_ERROR",
          details: { status: history.status },
        });
      }
      const artifacts = [];
      for (const output of Object.values(history.outputs || {})) {
        for (const media of [
          ...(output.images || []),
          ...(output.gifs || []),
          ...(output.videos || []),
        ]) {
          const query = new URLSearchParams({
            filename: media.filename,
            subfolder: media.subfolder || "",
            type: media.type || "output",
          });
          const response = await fetchWithTimeout(
            joinUrl(baseUrl, `/view?${query}`),
            { signal },
            profile.timeoutMs,
          );
          if (!response.ok) {
            throw providerHttpError(
              providerId,
              response.status,
              await response.text(),
            );
          }
          artifacts.push({
            bytes: Buffer.from(await response.arrayBuffer()),
            mimeType:
              response.headers.get("content-type") ||
              (request.capability === "video.generate"
                ? "video/mp4"
                : "image/png"),
            filename: media.filename,
          });
        }
      }
      if (!artifacts.length) {
        throw new ProviderError(`ComfyUI job ${queued.prompt_id} produced no media`, {
          code: "INVALID_PROVIDER_RESPONSE",
          details: { outputs: Object.keys(history.outputs || {}) },
        });
      }
      return {
        output: { jobId: queued.prompt_id },
        artifacts,
        usage: {},
        requestId: queued.prompt_id,
        modelRevision: request.model,
        finishReason: "stop",
        raw: {
          promptId: queued.prompt_id,
          status: history.status,
          outputNodes: Object.keys(history.outputs || {}),
        },
      };
    },
  };
}
