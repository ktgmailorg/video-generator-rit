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
  if (request?.capability !== "speech.synthesize") {
    throw new TypeError("Piper bridge only supports speech.synthesize");
  }
  if (!request.model) {
    throw new TypeError("Piper request model must be the .onnx model path");
  }
  const directory = await mkdtemp(join(tmpdir(), "rit-piper-"));
  const output = join(directory, "speech.wav");
  try {
    await run(
      process.env.PIPER_BIN || "piper",
      ["--model", request.model, "--output_file", output],
      `${request.input.text}\n`,
      cancellation.signal,
    );
    const bytes = await readFile(output);
    process.stdout.write(
      JSON.stringify({
        schemaVersion: 1,
        output: {},
        artifacts: [
          {
            filename: "speech.wav",
            mimeType: "audio/wav",
            base64: bytes.toString("base64"),
          },
        ],
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

function run(command, args, stdin, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["pipe", "ignore", "pipe"],
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
    child.stdin.end(stdin);
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
