import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { presetConfig } from "../src/config.mjs";
import { applyProviderSelections } from "../desktop/credential-providers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const fixture = join(root, "tests", "fixtures", "course-provider.mjs");

function freePort() {
  return new Promise((resolvePort) => {
    const probe = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolvePort(port));
    });
  });
}

async function until(check, { timeout, label }) {
  const deadline = Date.now() + timeout;
  let last;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) {
      last = error;
    }
    await new Promise((done) => setTimeout(done, 250));
  }
  throw new Error(`Timed out waiting for ${label}${last ? `: ${last.message}` : ""}`);
}

/**
 * Start the real studio server on a config shaped exactly like the one the
 * desktop app writes — the generic preset plus allowlisted hosted narration —
 * with the hosted Edge TTS profile swapped for an offline fixture so no
 * network is needed. This is the path that once booted fine and then refused
 * every job, which a boot-only smoke test cannot see.
 */
async function withStudio(classification, run) {
  const directory = await mkdtemp(join(tmpdir(), "rit-studio-render-"));
  const config = applyProviderSelections(presetConfig("generic"), []);
  config.dataPolicy.classification = classification;
  config.workflow.cacheRoot = join(directory, "cache");
  config.providers = {
    edge: {
      adapter: "cli-bridge",
      executionLocation: "hosted",
      command: process.execPath,
      args: [fixture],
      capabilities: ["speech.synthesize"],
      model: "fixture-speech-v1",
    },
  };
  config.dataPolicy.allowedHostedProviders = ["edge"];
  const configPath = join(directory, "video.config.json");
  await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);
  const port = await freePort();
  const server = spawn(
    process.execPath,
    [join(root, "studio", "server.mjs"), "--config", configPath, "--port", String(port), "--output", join(directory, "jobs")],
    { cwd: root, stdio: ["ignore", "pipe", "pipe"] },
  );
  let log = "";
  server.stdout.on("data", (chunk) => (log += chunk));
  server.stderr.on("data", (chunk) => (log += chunk));
  const base = `http://127.0.0.1:${port}`;
  try {
    await until(async () => (await fetch(`${base}/api/config`)).ok, {
      timeout: 20_000,
      label: "the studio to start",
    });
    return await run(base);
  } catch (error) {
    error.message += `\n--- studio log ---\n${log}`;
    throw error;
  } finally {
    server.kill();
    await rm(directory, { recursive: true, force: true });
  }
}

const job = {
  title: "Studio render check",
  script: "A stable input maps to a stable output. That is what replay depends on.",
  inputMode: "script",
  voicePreset: "configured",
  visualMode: "deterministic",
  targetMinutes: 2,
  acknowledged: true,
};

const ffmpegMissing = spawnSync("ffmpeg", ["-version"]).status !== 0;

test(
  "a public desktop-style config renders a complete video through the studio",
  { timeout: 150_000, skip: ffmpegMissing && "ffmpeg is not installed" },
  async () => {
    await withStudio("public", async (base) => {
      const summary = await (await fetch(`${base}/api/config`)).json();
      assert.equal(summary.ready, true, JSON.stringify(summary.checks));
      assert.equal(summary.policyOk, true);
      // Hosted narration must be reported as such, never as fully local.
      assert.equal(summary.fullyLocal, false);
      assert.deepEqual(summary.hostedProviders, ["edge"]);

      const created = await fetch(`${base}/api/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(job),
      });
      assert.equal(created.status, 202, await created.clone().text());
      const { id } = await created.json();
      const done = await until(
        async () => {
          const state = await (await fetch(`${base}/api/jobs/${id}`)).json();
          if (state.status === "failed") throw new Error(state.error || "job failed");
          return state.status === "complete" ? state : null;
        },
        { timeout: 120_000, label: "the job to complete" },
      );
      for (const file of ["video", "captions", "transcript"]) {
        const response = await fetch(`${base}/api/jobs/${id}/files/${file}`);
        assert.equal(response.status, 200, file);
        assert.ok((await response.arrayBuffer()).byteLength > 0, file);
      }
      assert.ok(done.id === id);
    });
  },
);

test(
  "an internal-classified project refuses hosted narration at the studio gate",
  { timeout: 60_000 },
  async () => {
    await withStudio("internal", async (base) => {
      const summary = await (await fetch(`${base}/api/config`)).json();
      assert.equal(summary.policyOk, false);
      assert.equal(summary.ready, false);
      // Creating a job must be refused or fail; it must never render.
      const created = await fetch(`${base}/api/jobs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(job),
      });
      if (created.status === 202) {
        const { id } = await created.json();
        const state = await until(
          async () => {
            const current = await (await fetch(`${base}/api/jobs/${id}`)).json();
            return ["failed", "complete"].includes(current.status) ? current : null;
          },
          { timeout: 30_000, label: "the job to settle" },
        );
        assert.equal(state.status, "failed");
        assert.match(state.error || "", /refuses|hosted/i);
      } else {
        assert.ok(created.status >= 400);
      }
    });
  },
);
