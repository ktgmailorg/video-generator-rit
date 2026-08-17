import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ProviderError } from "./errors.mjs";

export const EDGE_TTS_VOICE_PRESETS = Object.freeze({
  male: "en-US-AndrewMultilingualNeural",
  female: "en-US-EmmaMultilingualNeural",
});

export function resolveEdgeTtsVoice(request = {}, profile = {}) {
  const explicitVoice = request.input?.voice || profile.voice;
  if (explicitVoice) return explicitVoice;
  const preset = request.input?.voicePreset || profile.voicePreset || "male";
  const voice = EDGE_TTS_VOICE_PRESETS[preset];
  if (!voice) {
    throw new TypeError(
      `Unknown Edge TTS voice preset: ${preset}. Use female, male, or an explicit voice ID.`,
    );
  }
  return voice;
}

export function createEdgeTtsAdapter(profileName, profile) {
  return {
    async describe() {
      return {
        id: "edge-tts",
        profileName,
        version: "7.2.8",
        executionLocation: "hosted",
        capabilities: ["speech.synthesize"],
        mimeTypes: {
          "speech.synthesize": ["audio/mpeg", "text/vtt"],
        },
        supportsStructuredOutput: false,
        supportsSeed: false,
        supportsAsyncJobs: false,
        supportsModelDiscovery: false,
        voicePresets: EDGE_TTS_VOICE_PRESETS,
      };
    },
    async healthcheck({ signal } = {}) {
      await run(
        "uvx",
        ["--from", "edge-tts==7.2.8", "edge-tts", "--version"],
        signal,
        30_000,
      );
      return { ok: true, version: "7.2.8" };
    },
    async estimate() {
      return { known: true, costUsd: 0 };
    },
    async execute(request, { signal } = {}) {
      if (request.capability !== "speech.synthesize") {
        throw new TypeError(`Edge TTS does not implement ${request.capability}`);
      }
      const directory = await mkdtemp(join(tmpdir(), "rit-edge-tts-"));
      const textPath = join(directory, "input.txt");
      const mediaPath = join(directory, "speech.mp3");
      const captionsPath = join(directory, "speech.vtt");
      const voice = resolveEdgeTtsVoice(request, profile);
      try {
        await writeFile(textPath, `${request.input.text}\n`, { mode: 0o600 });
        const args = [
          "--from",
          "edge-tts==7.2.8",
          "edge-tts",
          "--file",
          textPath,
          "--voice",
          voice,
          `--rate=${request.parameters?.rate || profile.rate || "+0%"}`,
          `--pitch=${request.parameters?.pitch || profile.pitch || "+0Hz"}`,
          "--write-media",
          mediaPath,
          "--write-subtitles",
          captionsPath,
        ];
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            await run(
              "uvx",
              args,
              signal,
              profile.timeoutMs || 300_000,
            );
            break;
          } catch (error) {
            if (
              (!error.details?.noAudioReceived &&
                !error.details?.localToolCacheFailure) ||
              attempt === 3
            ) {
              throw error;
            }
            await abortableDelay(500, signal);
          }
        }
        return {
          output: {},
          artifacts: [
            {
              bytes: await readFile(mediaPath),
              mimeType: "audio/mpeg",
              filename: "speech.mp3",
            },
            {
              bytes: await readFile(captionsPath),
              mimeType: "text/vtt",
              filename: "speech.vtt",
            },
          ],
          usage: {},
          modelRevision: "edge-tts-7.2.8",
          finishReason: "stop",
          raw: {
            providerVersion: "7.2.8",
            voice,
            voicePreset:
              request.input?.voicePreset || profile.voicePreset || null,
          },
        };
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  };
}

export function edgeTtsProcessError(
  command,
  code,
  processSignal,
  stderr = "",
) {
  const noAudioReceived =
    /NoAudioReceived|No audio was received/i.test(stderr);
  const localToolCacheFailure =
    /Failed to write to the client cache|failed to rename file.*(?:\.cache\/uv|uv\/simple)/is.test(
      stderr,
    );
  return new ProviderError(
    `${command} exited with ${code ?? processSignal}: ${stderr.slice(-2000)}`,
    {
      code:
        noAudioReceived || localToolCacheFailure
          ? "PROVIDER_UNAVAILABLE"
          : "PROVIDER_ERROR",
      retryable: noAudioReceived || localToolCacheFailure,
      details: { noAudioReceived, localToolCacheFailure },
    },
  );
}

function run(command, args, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
      signal,
    });
    let stderr = "";
    const timeout = setTimeout(() => child.kill("SIGTERM"), timeoutMs);
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(
        new ProviderError(`Could not start ${command}`, {
          code: "PROVIDER_UNAVAILABLE",
          retryable: true,
          cause: error,
        }),
      );
    });
    child.on("close", (code, processSignal) => {
      clearTimeout(timeout);
      if (code === 0) resolve();
      else {
        reject(edgeTtsProcessError(command, code, processSignal, stderr));
      }
    });
  });
}

function abortableDelay(milliseconds, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
      return;
    }
    const onAbort = () => {
      clearTimeout(timeout);
      reject(signal.reason || new DOMException("Aborted", "AbortError"));
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, milliseconds);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
