import assert from "node:assert/strict";
import { access, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { runCli } from "../src/cli.mjs";
import { presetConfig } from "../src/config.mjs";
import { episodeFromStoryboard } from "../src/episode.mjs";
import { writePlanArtifacts } from "../src/pipeline/planning.mjs";
import { produceEpisode } from "../src/pipeline/produce.mjs";

const fixture = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "fixtures/course-provider.mjs",
);

test(
  "recorded provider output replays offline to an identical final master",
  { timeout: 120_000 },
  async (context) => {
    try {
      await access("/opt/homebrew/bin/ffmpeg");
    } catch {
      try {
        const { spawnSync } = await import("node:child_process");
        if (spawnSync("ffmpeg", ["-version"]).status !== 0) {
          context.skip("ffmpeg is not installed");
          return;
        }
      } catch {
        context.skip("ffmpeg is not installed");
        return;
      }
    }

    const temporary = await mkdtemp(join(tmpdir(), "rit-video-e2e-"));
    const storyboard = join(temporary, "storyboard.md");
    const outputRoot = join(temporary, "output");
    const cacheRoot = join(temporary, "cache");
    const configPath = join(temporary, "video.config.json");
    const priorFailureMode = process.env.RIT_FIXTURE_FAIL;
    try {
      await writeFile(
        storyboard,
        [
          "# Deterministic Replay",
          "",
          "## 0:00 - 0:02 — A stable lesson",
          "",
          "**[VISUAL]** Show a labeled input becoming a checked output.",
          "",
          "**[VOICEOVER]**",
          "",
          "A recorded artifact makes replay exact.",
          "",
          "**Delivery:** Clear and direct.",
          "",
        ].join("\n"),
      );
      const config = presetConfig("generic");
      config.workflow.outputRoot = outputRoot;
      config.workflow.cacheRoot = cacheRoot;
      config.providers = {
        fixture: {
          adapter: "cli-bridge",
          executionLocation: "local",
          command: process.execPath,
          args: [fixture],
          capabilities: ["speech.synthesize"],
          model: "fixture-speech-v1",
        },
      };
      config.roles = {
        narration: { primary: "fixture", fallbacks: [] },
      };
      await writeFile(configPath, `${JSON.stringify(config, null, 2)}\n`);

      const episode = await episodeFromStoryboard(storyboard);
      await writePlanArtifacts({ config, episode });
      const recorded = await produceEpisode({ config, mode: "record" });
      assert.equal(recorded.status, "complete");
      assert.equal(recorded.runLock.requests.length, 1);
      assert.equal(recorded.runLock.requests[0].cacheHit, false);
      await access(recorded.package.directory);

      await rm(join(outputRoot, "work"), {
        recursive: true,
        force: true,
      });
      await rm(cacheRoot, { recursive: true, force: true });
      process.env.RIT_FIXTURE_FAIL = "true";
      const replayed = await runCli(
        [
          "replay",
          join(recorded.package.replayBundle, "run.lock.json"),
          "--config",
          configPath,
          "--frozen",
        ],
        { log() {}, error() {} },
      );
      assert.equal(replayed.runLock.requests.length, 1);
      assert.equal(replayed.runLock.requests[0].cacheHit, true);
      assert.equal(replayed.render.sha256, recorded.render.sha256);
    } finally {
      if (priorFailureMode === undefined) {
        delete process.env.RIT_FIXTURE_FAIL;
      } else {
        process.env.RIT_FIXTURE_FAIL = priorFailureMode;
      }
      await rm(temporary, { recursive: true, force: true });
    }
  },
);
