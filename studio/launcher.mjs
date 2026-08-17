#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const options = parseArguments(process.argv.slice(2));
const port = options.port || process.env.RIT_STUDIO_PORT || "4173";
const studioUrl = `http://127.0.0.1:${port}`;
const configPath = resolve(
  projectRoot,
  options.config ||
    process.env.RIT_STUDIO_CONFIG ||
    (existsSync(resolve(projectRoot, "video.config.local.json"))
      ? "video.config.local.json"
      : "examples/video.config.studio-bonsai.json"),
);
const children = new Set();
let stopping = false;

if (!existsSync(configPath)) {
  throw new Error(`Studio configuration not found: ${configPath}`);
}

const childEnvironment = { ...process.env };

try {
  await startBonsaiWhenConfigured(childEnvironment);
  const studio = trackedSpawn(
    process.execPath,
    [
      resolve(projectRoot, "studio/server.mjs"),
      "--config",
      configPath,
      "--port",
      port,
    ],
    {
      cwd: projectRoot,
      env: childEnvironment,
      stdio: "inherit",
    },
  );

  const configuration = await waitForJson(`${studioUrl}/api/config`, 90_000);
  console.log(
    configuration.ready
      ? "Local production stack ready."
      : "Studio opened, but local setup still needs attention.",
  );
  if (!options.noOpen) openBrowser(studioUrl);
  console.log(`Use the browser studio at ${studioUrl}`);
  console.log("Close this window when you are finished.");

  const exit = await waitForExit(studio);
  if (!stopping && exit.code && exit.code !== 0) {
    process.exitCode = exit.code;
  }
} finally {
  stopChildren();
}

async function startBonsaiWhenConfigured(environment) {
  const modelPath = environment.BONSAI_MODEL_PATH;
  if (!modelPath) {
    console.log(
      "BONSAI_MODEL_PATH is not configured; the studio will use the providers declared in the selected configuration.",
    );
    return;
  }
  if (!existsSync(modelPath)) {
    throw new Error(`Configured Bonsai model was not found: ${modelPath}`);
  }
  if (!environment.BONSAI_27B_SHA256) {
    console.log("Recording the Bonsai model checksum for reproducible requests…");
    environment.BONSAI_27B_SHA256 = await digestFile(modelPath);
  }
  const endpoint = environment.BONSAI_BASE_URL || "http://127.0.0.1:8080/v1";
  if (await endpointResponds(`${endpoint}/models`)) {
    console.log(`Using the Bonsai server already running at ${endpoint}`);
    return;
  }
  const executable = environment.LLAMA_SERVER_BIN || "llama-server";
  console.log("Starting the configured local Bonsai planner…");
  trackedSpawn(
    executable,
    [
      "--model",
      modelPath,
      "--host",
      "127.0.0.1",
      "--port",
      new URL(endpoint).port || "8080",
    ],
    {
      cwd: projectRoot,
      env: environment,
      stdio: "inherit",
    },
  );
  await waitForJson(`${endpoint}/models`, 120_000);
  console.log("Local Bonsai planner ready.");
}

function trackedSpawn(command, args, spawnOptions) {
  const child = spawn(command, args, {
    shell: false,
    ...spawnOptions,
  });
  children.add(child);
  child.once("exit", () => children.delete(child));
  child.once("error", (error) => {
    if (!stopping) console.error(`${command} could not start: ${error.message}`);
  });
  return child;
}

function stopChildren() {
  if (stopping) return;
  stopping = true;
  for (const child of children) {
    if (!child.killed) child.kill("SIGTERM");
  }
}

function openBrowser(url) {
  const platformCommands = {
    darwin: ["open", [url]],
    win32: ["cmd.exe", ["/d", "/s", "/c", "start", "", url]],
    linux: ["xdg-open", [url]],
  };
  const [command, args] = platformCommands[process.platform] || [
    "xdg-open",
    [url],
  ];
  const opener = spawn(command, args, {
    detached: true,
    shell: false,
    stdio: "ignore",
  });
  opener.unref();
}

function waitForExit(child) {
  return new Promise((resolvePromise, reject) => {
    child.once("error", reject);
    child.once("exit", (code, signal) => resolvePromise({ code, signal }));
  });
}

async function endpointResponds(url) {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(1_500),
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForJson(url, timeoutMilliseconds) {
  const startedAt = Date.now();
  let lastError = null;
  while (Date.now() - startedAt < timeoutMilliseconds) {
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(5_000),
        cache: "no-store",
      });
      if (response.ok) return await response.json();
      lastError = new Error(`${url} returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolvePromise) => setTimeout(resolvePromise, 1_000));
  }
  throw new Error(
    `Local service did not become available at ${url}: ${lastError?.message || "timed out"}`,
  );
}

function digestFile(path) {
  return new Promise((resolvePromise, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(path);
    stream.on("error", reject);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolvePromise(hash.digest("hex")));
  });
}

function parseArguments(args) {
  const parsed = { config: null, port: null, noOpen: false };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (value === "--config") parsed.config = args[++index];
    else if (value === "--port") parsed.port = args[++index];
    else if (value === "--no-open") parsed.noOpen = true;
    else throw new TypeError(`Unknown launcher option: ${value}`);
  }
  return parsed;
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.once(signal, () => {
    stopChildren();
    process.exitCode = 0;
  });
}
