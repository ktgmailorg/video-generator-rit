import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { credentialFor } from "../config.mjs";
import { requestJson } from "./http.mjs";
import { ProviderError } from "./errors.mjs";
import { normalizeBridgeResult } from "./result.mjs";

export function createHttpBridgeAdapter(profileName, profile) {
  const providerId = "http-bridge";
  return {
    async describe() {
      return {
        id: providerId,
        profileName,
        version: "1.0.0",
        executionLocation: profile.executionLocation,
        capabilities: profile.capabilities || [],
        mimeTypes: profile.mimeTypes || {},
        supportsStructuredOutput: Boolean(profile.supportsStructuredOutput),
        supportsSeed: Boolean(profile.supportsSeed),
        supportsAsyncJobs: Boolean(profile.supportsAsyncJobs),
        supportsModelDiscovery: false,
        baseUrl: profile.baseUrl,
      };
    },
    async healthcheck({ signal } = {}) {
      if (!profile.healthPath) return { ok: true, skipped: true };
      await requestJson({
        providerId,
        baseUrl: profile.baseUrl,
        path: profile.healthPath,
        method: "GET",
        headers: bridgeHeaders(profile),
        signal,
        timeoutMs: profile.timeoutMs || 15_000,
      });
      return { ok: true };
    },
    async estimate(request) {
      return bridgeEstimate(profile, request);
    },
    async execute(request, { signal } = {}) {
      const response = await requestJson({
        providerId,
        baseUrl: profile.baseUrl,
        path: profile.path || "/v1/generate",
        headers: bridgeHeaders(profile),
        body: {
          schemaVersion: 1,
          request,
        },
        signal,
        timeoutMs: profile.timeoutMs,
      });
      return normalizeBridgeResult(response);
    },
  };
}

function bridgeEstimate(profile, request) {
  const value =
    typeof profile.estimatedCostUsd === "object"
      ? profile.estimatedCostUsd[request.capability]
      : profile.estimatedCostUsd;
  return value === undefined
    ? { known: false, costUsd: null }
    : { known: true, costUsd: Number(value) };
}

function bridgeHeaders(profile) {
  if (!profile.apiKeyEnv) return {};
  return { authorization: `Bearer ${credentialFor(profile)}` };
}

export function createCliBridgeAdapter(profileName, profile) {
  const providerId = "cli-bridge";
  if (!profile.command) {
    throw new TypeError(`CLI bridge ${profileName} requires command`);
  }
  return {
    async describe() {
      return {
        id: providerId,
        profileName,
        version: "1.0.0",
        executionLocation: "local",
        capabilities: profile.capabilities || [],
        mimeTypes: profile.mimeTypes || {},
        supportsStructuredOutput: Boolean(profile.supportsStructuredOutput),
        supportsSeed: Boolean(profile.supportsSeed),
        supportsAsyncJobs: false,
        supportsModelDiscovery: false,
        command: profile.command,
      };
    },
    async healthcheck({ signal } = {}) {
      for (const path of profile.requiredFiles || []) {
        await access(path);
      }
      if (!profile.healthArgs && !profile.healthCommand) {
        return {
          ok: true,
          skipped: true,
          requiredFiles: profile.requiredFiles || [],
        };
      }
      await runBridgeProcess(
        profile.healthCommand || profile.command,
        profile.healthArgs || [],
        "",
        signal,
        profile.timeoutMs || 15_000,
      );
      return {
        ok: true,
        requiredFiles: profile.requiredFiles || [],
      };
    },
    async estimate(request) {
      return bridgeEstimate(profile, request);
    },
    async execute(request, { signal } = {}) {
      const stdout = await runBridgeProcess(
        profile.command,
        profile.args || [],
        `${JSON.stringify({ schemaVersion: 1, request })}\n`,
        signal,
        profile.timeoutMs || 600_000,
      );
      let response;
      try {
        response = JSON.parse(stdout);
      } catch (error) {
        throw new ProviderError("CLI bridge returned invalid JSON", {
          code: "INVALID_PROVIDER_RESPONSE",
          cause: error,
          details: { stdout: stdout.slice(0, 1000) },
        });
      }
      return normalizeBridgeResult(response);
    },
  };
}

function runBridgeProcess(command, args, stdin, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "pipe", "pipe"],
      shell: false,
      signal,
      env: { ...process.env },
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGTERM");
    }, timeoutMs);
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(
        new ProviderError(`Could not start CLI bridge ${command}`, {
          code: "PROVIDER_UNAVAILABLE",
          retryable: true,
          cause: error,
        }),
      );
    });
    child.on("close", (code, processSignal) => {
      clearTimeout(timeout);
      if (code === 0) resolve(stdout);
      else {
        reject(
          new ProviderError(
            `CLI bridge ${command} exited with ${code ?? processSignal}`,
            {
              code: "PROVIDER_ERROR",
              details: { stderr: stderr.slice(-2000) },
            },
          ),
        );
      }
    });
    child.stdin.end(stdin);
  });
}
