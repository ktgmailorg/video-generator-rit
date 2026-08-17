import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { spawn } from "node:child_process";
import { basename } from "node:path";

export function runTool(program, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(program, args, {
      stdio: options.capture
        ? ["ignore", "pipe", "pipe"]
        : ["ignore", "inherit", "inherit"],
      shell: false,
      signal: options.signal,
      cwd: options.cwd,
      env: options.env || process.env,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, processSignal) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else {
        const error = new Error(
          `${basename(program)} exited with ${code ?? processSignal}\n${stderr.slice(-5000)}`,
        );
        error.code = "TOOL_FAILED";
        error.exitCode = code;
        reject(error);
      }
    });
  });
}

export async function probeDuration(path, ffprobe = "ffprobe", signal) {
  const result = await runTool(
    ffprobe,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ],
    { capture: true, signal },
  );
  const duration = Number(result.stdout.trim());
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new Error(`Could not determine media duration: ${path}`);
  }
  return duration;
}

export async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

export async function toolVersion(program, args = ["-version"]) {
  try {
    const result = await runTool(program, args, { capture: true });
    return {
      available: true,
      version: `${result.stdout}\n${result.stderr}`.trim().split(/\r?\n/)[0],
    };
  } catch (error) {
    return { available: false, error: error.message };
  }
}
