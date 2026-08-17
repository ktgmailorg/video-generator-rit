import { join } from "node:path";
import sharp from "sharp";
import { atomicWriteJson, sha256 } from "../core/canonical.mjs";
import { assertSchema } from "../core/schema.mjs";
import { listApprovals } from "../core/approvals.mjs";
import { runTool, toolVersion } from "./tools.mjs";

export async function collectToolchain() {
  const [ffmpeg, ffprobe, git, gitStatus, runtimeDiff] = await Promise.all([
    toolVersion(process.env.VIDEO_FFMPEG || "ffmpeg"),
    toolVersion(process.env.VIDEO_FFPROBE || "ffprobe"),
    runTool("git", ["rev-parse", "HEAD"], { capture: true })
      .then((result) => result.stdout.trim())
      .catch(() => "unknown"),
    runTool("git", ["status", "--porcelain", "--untracked-files=no"], {
      capture: true,
    })
      .then((result) => result.stdout)
      .catch(() => ""),
    runTool(
      "git",
      [
        "diff",
        "--binary",
        "HEAD",
        "--",
        "src",
        "bin",
        "scripts",
        "package.json",
        "package-lock.json",
      ],
      { capture: true },
    )
      .then((result) => result.stdout)
      .catch(() => ""),
  ]);
  return {
    node: process.version,
    platform: `${process.platform}-${process.arch}`,
    sharp: sharp.versions,
    ffmpeg,
    ffprobe,
    gitRevision: git,
    gitDirty: gitStatus.trim().length > 0,
    gitStatusSha256: sha256(gitStatus),
    gitChangedPaths: gitStatus
      .split(/\r?\n/)
      .filter((line) => line.trim())
      .map((line) => line.slice(3)),
    runtimeDirty: runtimeDiff.length > 0,
    runtimeDiffSha256: sha256(runtimeDiff),
  };
}

export async function buildRunLock({
  config,
  episode,
  engine,
  root,
  status,
  stages,
  artifacts = [],
  final,
  createdAt,
}) {
  const toolchain = await collectToolchain();
  const approvals = await listApprovals(join(root, "approvals"));
  const runId = `${episode.id}-${sha256({
    episode,
    config,
  }).slice(0, 12)}`;
  const lock = {
    schemaVersion: 1,
    runId,
    status,
    mode: engine.mode,
    createdAt: createdAt || new Date().toISOString(),
    inputSha256: sha256(episode),
    configSha256: sha256(config),
    gitRevision: toolchain.gitRevision,
    toolchain,
    providers: engine.providerManifests,
    requests: engine.records,
    artifacts,
    approvals: approvals.map(({ approval }) => approval),
    stages,
    totalCostUsd: engine.totalCostUsd,
    ...(final ? { final } : {}),
  };
  await assertSchema("runLock", lock);
  await atomicWriteJson(join(root, "run.lock.json"), lock, { mode: 0o600 });
  return lock;
}
