import { copyFile, mkdir, readdir } from "node:fs/promises";
import { basename, join } from "node:path";
import { atomicWrite, atomicWriteJson } from "../core/canonical.mjs";
import {
  bibliographyMarkdown,
  claimCoverageReport,
} from "../grounding/audit.mjs";
import { hashFile } from "../pipeline/tools.mjs";
import { aiDisclosureMarkdown } from "./disclosure.mjs";

export async function packageForPanopto({
  config,
  episode,
  root,
  render,
  narration,
  visuals,
  disclosure,
  qualityReport,
  runLock,
  brandPack,
}) {
  const directory = join(root, "panopto-ready");
  await mkdir(directory, { recursive: true });
  const replayBundle = await createReplayBundle({
    config,
    episode,
    root,
    runLock,
  });
  const slug = episode.id.replace(/[^a-z0-9-]+/gi, "-");
  const files = [
    [render.masterPath, `${slug}.mp4`],
    [narration.files.vtt, `${slug}.vtt`],
    [narration.files.srt, `${slug}.srt`],
    [narration.files.transcriptText, `${slug}-transcript.txt`],
    [narration.files.transcriptHtml, `${slug}-transcript.html`],
    [visuals.thumbnailPath, `${slug}-thumbnail.png`],
    [
      join(root, "work", "render", "production-report.json"),
      "production-report.json",
    ],
    [join(root, "run.lock.json"), "run.lock.json"],
  ];
  for (const [source, destination] of files) {
    await copyFile(source, join(directory, destination));
  }
  const chapters = [];
  let cursor = 0;
  for (const beat of narration.beats) {
    const episodeBeat = episode.beats.find((item) => item.id === beat.beatId);
    chapters.push({
      timeSeconds: cursor,
      title: episodeBeat?.title || beat.beatId,
    });
    cursor += beat.duration;
  }
  const audioDescription = episode.beats
    .filter((beat) => beat.accessibility.audioDescriptionCue)
    .map(
      (beat) =>
        `## ${beat.title}\n\n${beat.accessibility.audioDescriptionCue}\n`,
    )
    .join("\n");
  const credits = {
    schemaVersion: 1,
    brandPack: brandPack
      ? {
          id: brandPack.id,
          version: brandPack.version,
          approvedBy: brandPack.approvedBy,
          usageScope: brandPack.usageScope,
          provenance: brandPack.provenance,
          assets: brandPack.assets.map((asset) => ({
            role: asset.role,
            sha256: asset.sha256,
            usageScope: asset.usageScope,
            provenance: asset.provenance,
          })),
        }
      : null,
    generatedAssets: runLock.requests
      .filter((record) =>
        ["image.generate", "video.generate", "speech.synthesize"].includes(
          record.capability,
        ),
      )
      .map((record) => ({
        capability: record.capability,
        providerProfile: record.profileName,
        model: record.result.modelRevision || record.model,
        requestSha256: record.requestSha256,
        artifactSha256: (record.result.artifacts || []).map(
          (artifact) => artifact.sha256,
        ),
        licenseReview:
          "AI-generated asset; provider terms and intended use require human review",
      })),
  };
  const costAndLatency = {
    schemaVersion: 1,
    totalCostUsd: runLock.totalCostUsd,
    requests: runLock.requests.map((record) => ({
      capability: record.capability,
      providerProfile: record.profileName,
      model: record.result.modelRevision || record.model,
      durationMs: record.durationMs,
      costUsd: record.result.costUsd,
      cacheHit: record.cacheHit,
    })),
  };
  await Promise.all([
    atomicWriteJson(join(directory, "chapters.json"), chapters),
    atomicWrite(
      join(directory, "bibliography.md"),
      bibliographyMarkdown(episode),
    ),
    atomicWriteJson(
      join(directory, "claim-source-report.json"),
      claimCoverageReport(episode),
    ),
    atomicWriteJson(join(directory, "asset-credits.json"), credits),
    atomicWriteJson(
      join(directory, "cost-latency-report.json"),
      costAndLatency,
    ),
    atomicWriteJson(join(directory, "ai-disclosure.json"), disclosure),
    atomicWrite(
      join(directory, "AI_DISCLOSURE.md"),
      aiDisclosureMarkdown(disclosure),
    ),
    atomicWriteJson(join(directory, "quality-report.json"), qualityReport),
    atomicWrite(
      join(directory, "audio-description-script.md"),
      audioDescription || "# Audio Description\n\nNo separate cues were required.\n",
    ),
  ]);
  if (config.preset === "rit-student") {
    await atomicWriteJson(
      join(directory, "ai-prompt-output-transcript.json"),
      {
        schemaVersion: 1,
        requests: runLock.requests.map((record) => ({
          capability: record.capability,
          providerProfile: record.profileName,
          model: record.result.modelRevision || record.model,
          request: record.request,
          output: record.result.output,
          requestSha256: record.requestSha256,
        })),
      },
      { mode: 0o600 },
    );
  }
  if (config.project.aiPolicyFile) {
    await copyFile(
      config.project.aiPolicyFile,
      join(directory, basename(config.project.aiPolicyFile)),
    );
  }
  const manifestFiles = [];
  for (const name of (await readdir(directory)).sort()) {
    if (name === "package-manifest.json") continue;
    const path = join(directory, name);
    manifestFiles.push({
      name,
      sha256: await hashFile(path),
    });
  }
  const manifest = {
    schemaVersion: 1,
    target: "panopto",
    episodeId: episode.id,
    masterSha256: render.sha256,
    runLockSha256: await hashFile(join(directory, "run.lock.json")),
    files: manifestFiles,
  };
  await atomicWriteJson(join(directory, "package-manifest.json"), manifest);
  return { directory, manifest, replayBundle };
}

async function createReplayBundle({
  config,
  episode,
  root,
  runLock,
}) {
  const directory = join(root, "replay-bundle");
  const cache = join(directory, "cache");
  await mkdir(cache, { recursive: true, mode: 0o700 });
  const references = new Map();
  for (const record of runLock.requests) {
    for (const reference of [
      ...(record.result?.artifacts || []),
      ...(record.result?.rawResponse ? [record.result.rawResponse] : []),
    ]) {
      references.set(
        `${reference.sha256}${reference.extension || ""}`,
        reference,
      );
    }
    const lookupSha256 = record.lookupSha256 || record.requestSha256;
    await atomicWriteJson(
      join(
        cache,
        "requests",
        lookupSha256.slice(0, 2),
        `${lookupSha256}.json`,
      ),
      record,
      { mode: 0o600 },
    );
  }
  for (const reference of references.values()) {
    const destination = join(
      cache,
      "sha256",
      reference.sha256.slice(0, 2),
      `${reference.sha256}${reference.extension || ""}`,
    );
    await mkdir(join(cache, "sha256", reference.sha256.slice(0, 2)), {
      recursive: true,
      mode: 0o700,
    });
    await copyFile(reference.path, destination);
  }
  await Promise.all([
    atomicWriteJson(join(directory, "video.config.snapshot.json"), config, {
      mode: 0o600,
    }),
    atomicWriteJson(join(directory, "episode.json"), episode, {
      mode: 0o600,
    }),
    copyFile(join(root, "run.lock.json"), join(directory, "run.lock.json")),
    atomicWriteJson(
      join(directory, "bundle-manifest.json"),
      {
        schemaVersion: 1,
        runId: runLock.runId,
        inputSha256: runLock.inputSha256,
        configSha256: runLock.configSha256,
        requestCount: runLock.requests.length,
        artifactSha256: [...references.values()]
          .map((reference) => reference.sha256)
          .sort(),
      },
      { mode: 0o600 },
    ),
  ]);
  return directory;
}
