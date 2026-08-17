#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const cancellation = new AbortController();
process.once("SIGINT", () => cancellation.abort(new Error("Interrupted")));
process.once("SIGTERM", () => cancellation.abort(new Error("Terminated")));

try {
  const envelope = JSON.parse(await readStdin());
  const request = envelope.request;
  if (request?.capability !== "speech.transcribe") {
    throw new TypeError("whisper.cpp bridge only supports speech.transcribe");
  }
  if (!request.model || !request.input.path) {
    throw new TypeError(
      "whisper.cpp requires a model path and input audio path",
    );
  }
  const directory = await mkdtemp(join(tmpdir(), "rit-whispercpp-"));
  const outputPrefix = join(directory, "transcript");
  try {
    await run(process.env.WHISPER_CPP_BIN || "whisper-cli", [
      "-m",
      request.model,
      "-f",
      request.input.path,
      "-oj",
      "-of",
      outputPrefix,
    ], cancellation.signal);
    const raw = JSON.parse(await readFile(`${outputPrefix}.json`, "utf8"));
    const segments = (raw.transcription || raw.segments || []).map((segment) => ({
      start: timeValue(segment.timestamps?.from ?? segment.start),
      end: timeValue(segment.timestamps?.to ?? segment.end),
      text: segment.text?.trim() || "",
    }));
    process.stdout.write(
      JSON.stringify({
        schemaVersion: 1,
        output: {
          text: segments.map((segment) => segment.text).join(" "),
          segments,
        },
        artifacts: [],
        modelRevision: `${request.model}@sha256:${await digestFile(request.model)}`,
        finishReason: "stop",
      }),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}

const timeValue = (value) => {
  if (typeof value === "number") return value;
  const parts = String(value || "0").split(":").map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
};

function readStdin() {
  return new Promise((resolve) => {
    let value = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      value += chunk;
    });
    process.stdin.on("end", () => resolve(value));
  });
}

function run(command, args, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "ignore", "pipe"],
      shell: false,
      signal,
    });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${command} failed: ${stderr.slice(-1000)}`)),
    );
  });
}

function digestFile(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
