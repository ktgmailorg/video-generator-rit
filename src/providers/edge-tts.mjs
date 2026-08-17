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

async function loadNodeEdgeTts() {
  try {
    return await import("msedge-tts");
  } catch {
    return null;
  }
}

const TICKS_PER_SECOND = 10_000_000;

function formatVttTimestamp(ticks) {
  const total = Math.max(0, Math.round(ticks / (TICKS_PER_SECOND / 1000)));
  const hours = Math.floor(total / 3_600_000);
  const minutes = Math.floor((total % 3_600_000) / 60_000);
  const seconds = Math.floor((total % 60_000) / 1000);
  const milliseconds = total % 1000;
  const pad = (value, width = 2) => String(value).padStart(width, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}.${pad(milliseconds, 3)}`;
}

export function buildVttFromWordBoundaries(events, options = {}) {
  const maxWordsPerCue = options.maxWordsPerCue || 8;
  const maxGapTicks = (options.maxGapSeconds || 0.8) * TICKS_PER_SECOND;
  const words = [];
  for (const event of events) {
    for (const entry of event?.Metadata || []) {
      if (entry.Type !== "WordBoundary") continue;
      const data = entry.Data || {};
      words.push({
        text: data.text?.Text ?? "",
        offset: data.Offset ?? 0,
        duration: data.Duration ?? 0,
      });
    }
  }
  const cues = [];
  let current = null;
  for (const word of words) {
    const gap = current ? word.offset - current.end : 0;
    if (!current || current.words.length >= maxWordsPerCue || gap > maxGapTicks) {
      current = { words: [], start: word.offset, end: word.offset };
      cues.push(current);
    }
    current.words.push(word.text);
    current.end = word.offset + word.duration;
  }
  const lines = ["WEBVTT", ""];
  for (const cue of cues) {
    lines.push(
      `${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(cue.end)}`,
      cue.words.join(" "),
      "",
    );
  }
  return `${lines.join("\n")}\n`;
}

async function synthesizeWithNode(edgeTtsModule, request, profile, voice, signal) {
  const { MsEdgeTTS, OUTPUT_FORMAT } = edgeTtsModule;
  const tts = new MsEdgeTTS();
  // Same default format as the Python edge-tts CLI for output parity.
  await tts.setMetadata(
    voice,
    OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3,
    { wordBoundaryEnabled: true },
  );
  const prosody = {
    rate: request.parameters?.rate || profile.rate || "+0%",
    pitch: request.parameters?.pitch || profile.pitch || "+0Hz",
  };
  const { audioStream, metadataStream } = await tts.toStream(
    request.input.text,
    prosody,
  );
  return await new Promise((resolve, reject) => {
    const chunks = [];
    const events = [];
    const onAbort = () => {
      reject(signal?.reason || new DOMException("Aborted", "AbortError"));
      tts.close?.();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
    metadataStream?.on("data", (chunk) => {
      try {
        events.push(JSON.parse(chunk.toString()));
      } catch {
        // Ignore unparseable metadata frames; captions degrade gracefully.
      }
    });
    audioStream.on("data", (chunk) => chunks.push(chunk));
    audioStream.on("error", (error) => {
      signal?.removeEventListener("abort", onAbort);
      reject(error);
    });
    audioStream.on("end", () => {
      signal?.removeEventListener("abort", onAbort);
      const bytes = Buffer.concat(chunks);
      if (bytes.length === 0) {
        reject(
          new ProviderError("Edge TTS returned no audio", {
            code: "PROVIDER_UNAVAILABLE",
            retryable: true,
            details: { noAudioReceived: true },
          }),
        );
        return;
      }
      resolve({ bytes, vtt: buildVttFromWordBoundaries(events) });
    });
  });
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
      if (await loadNodeEdgeTts()) {
        return { ok: true, version: "7.2.8", engine: "node" };
      }
      await run(
        "uvx",
        ["--from", "edge-tts==7.2.8", "edge-tts", "--version"],
        signal,
        30_000,
      );
      return { ok: true, version: "7.2.8", engine: "uvx" };
    },
    async estimate() {
      return { known: true, costUsd: 0 };
    },
    async execute(request, { signal } = {}) {
      if (request.capability !== "speech.synthesize") {
        throw new TypeError(`Edge TTS does not implement ${request.capability}`);
      }
      const voice = resolveEdgeTtsVoice(request, profile);
      // Preferred path: the pure-Node Edge TTS client. No Python or uvx
      // required, which is what lets the desktop app run without local tools.
      const nodeEdgeTts = await loadNodeEdgeTts();
      if (nodeEdgeTts && profile.engine !== "uvx") {
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            const { bytes, vtt } = await synthesizeWithNode(
              nodeEdgeTts,
              request,
              profile,
              voice,
              signal,
            );
            return {
              output: {},
              artifacts: [
                { bytes, mimeType: "audio/mpeg", filename: "speech.mp3" },
                {
                  bytes: Buffer.from(vtt),
                  mimeType: "text/vtt",
                  filename: "speech.vtt",
                },
              ],
              usage: {},
              modelRevision: "edge-tts-7.2.8",
              finishReason: "stop",
              raw: {
                providerVersion: "7.2.8",
                engine: "node",
                voice,
                voicePreset:
                  request.input?.voicePreset || profile.voicePreset || null,
              },
            };
          } catch (error) {
            if (signal?.aborted) throw error;
            lastError = error;
            // Backoff long enough to ride out short service throttles.
            if (attempt < 3) await abortableDelay(attempt * 2_000, signal);
          }
        }
        if (profile.engine === "node") throw lastError;
        // Otherwise fall through to the uvx compatibility path below.
      }
      const directory = await mkdtemp(join(tmpdir(), "rit-edge-tts-"));
      const textPath = join(directory, "input.txt");
      const mediaPath = join(directory, "speech.mp3");
      const captionsPath = join(directory, "speech.vtt");
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
            engine: "uvx",
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
