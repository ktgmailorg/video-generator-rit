import {
  access,
  cp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  statfs,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { basename, join, resolve } from "node:path";
import { sha256 } from "../src/core/canonical.mjs";
import { orderedMapLimit, pipelineConcurrency } from "../src/pipeline/concurrency.mjs";
import { hashFile } from "../src/pipeline/tools.mjs";
import { webPreviewBudget } from "../src/course/web-preview.mjs";
import { authoredGenerationProvenance } from "./course-generation-provenance.mjs";

const sourceRoot = resolve(
  option("--source-root") || "courses/long-form-lessons",
);
const manifestRoot = resolve(
  option("--manifest-root") || ".demo-output/long-form-lessons",
);
const exportRoot = option("--export");
const compactAfterExport = process.argv.includes("--compact-after-export");
const fastDraft = process.argv.includes("--fast-draft");
const resume = process.argv.includes("--resume");
const webPreviewMaxBytes = Number.parseInt(
  option("--web-preview-max-bytes") || "0",
  10,
);
const minimumFreeBytes = Number.parseInt(
  option("--min-free-bytes") || "2000000000",
  10,
);
if (compactAfterExport && !exportRoot) {
  throw new Error("--compact-after-export requires --export");
}
if (resume && !exportRoot) {
  throw new Error("--resume requires --export");
}
if (
  option("--web-preview-max-bytes") &&
  (!Number.isInteger(webPreviewMaxBytes) || webPreviewMaxBytes < 1_000_000)
) {
  throw new Error("--web-preview-max-bytes must be at least 1000000");
}
if (!Number.isInteger(minimumFreeBytes) || minimumFreeBytes < 500_000_000) {
  throw new Error("--min-free-bytes must be at least 500000000");
}
const requestedConcurrency = Number.parseInt(option("--concurrency"), 10);
if (
  option("--concurrency") &&
  (!Number.isInteger(requestedConcurrency) ||
    requestedConcurrency < 1 ||
    requestedConcurrency > 3)
) {
  throw new Error("--concurrency must be an integer from 1 to 3");
}
const only = new Set(
  (option("--only") || "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean),
);
const candidates = (await readdir(sourceRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .filter((slug) => only.size === 0 || only.has(slug))
  .sort();
const directories = (
  await Promise.all(
    candidates.map(async (slug) => {
      try {
        await Promise.all(
          ["catalog.json", "storyboard.md", "video.config.json"].map(
            (filename) => access(join(sourceRoot, slug, filename)),
          ),
        );
        return slug;
      } catch {
        return null;
      }
    }),
  )
).filter(Boolean);
if (only.size && directories.length !== only.size) {
  const missing = [...only].filter((slug) => !directories.includes(slug));
  throw new Error(`Unknown long-form lesson: ${missing.join(", ")}`);
}
if (process.argv.includes("--dry-run")) {
  console.log(
    JSON.stringify(
      {
        sourceRoot,
        manifestRoot,
        exportRoot: exportRoot ? resolve(exportRoot) : null,
        compactAfterExport,
        fastDraft,
        resume,
        encoderMode:
          process.env.VIDEO_ENCODER_MODE ||
          (fastDraft && process.platform === "darwin"
            ? "videotoolbox"
            : "software"),
        webPreviewMaxBytes,
        minimumFreeBytes,
        concurrency: option("--concurrency")
          ? requestedConcurrency
          : pipelineConcurrency("LONG_FORM_COURSE_CONCURRENCY", {
              defaultValue: 2,
              maximum: 3,
            }),
        count: directories.length,
        courses: directories,
      },
      null,
      2,
    ),
  );
  process.exit(0);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

function run(args, label) {
  return runCommand(process.execPath, args, label, {
    VIDEO_NARRATION_CONCURRENCY:
      process.env.VIDEO_NARRATION_CONCURRENCY || "8",
    VIDEO_VISUAL_CONCURRENCY:
      process.env.VIDEO_VISUAL_CONCURRENCY || "3",
    VIDEO_RENDER_CONCURRENCY:
      process.env.VIDEO_RENDER_CONCURRENCY || "4",
    VIDEO_SKIP_DRAFT_REVIEW:
      process.env.VIDEO_SKIP_DRAFT_REVIEW || (fastDraft ? "1" : "0"),
    VIDEO_ENCODER_MODE:
      process.env.VIDEO_ENCODER_MODE ||
      (fastDraft && process.platform === "darwin"
        ? "videotoolbox"
        : "software"),
  });
}

function runCommand(command, args, label, environment = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: resolve("."),
      env: {
        ...process.env,
        ...environment,
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    child.stdout.on("data", (chunk) =>
      process.stdout.write(`[${label}] ${chunk}`),
    );
    child.stderr.on("data", (chunk) =>
      process.stderr.write(`[${label}] ${chunk}`),
    );
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`${label} exited with code ${code}`));
    });
  });
}

async function renderLesson(slug) {
  if (resume) {
    const completed = await loadVerifiedExport(slug);
    if (completed) {
      console.log(`[${slug}:resume] Reusing checksum-verified accepted export`);
      return completed;
    }
  }
  await ensureDiskHeadroom(`${slug}:start`);
  const started = Date.now();
  const base = join(sourceRoot, slug);
  const configPath = join(base, "video.config.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  await mkdir(resolve(config.workflow.outputRoot), { recursive: true });
  await copyIfPresent(
    join(base, "planning-provider-records.json"),
    join(
      resolve(config.workflow.outputRoot),
      "planning-provider-records.json",
    ),
  );
  const reviewedCaptions = join(base, "captions.override.vtt");
  const reviewDirectory = join(resolve(config.workflow.outputRoot), "review");
  await mkdir(reviewDirectory, { recursive: true });
  await cp(reviewedCaptions, join(reviewDirectory, "captions.vtt")).catch(
    (error) => {
      if (error.code !== "ENOENT") throw error;
    },
  );
  await run(
    [
      "bin/rit-video.mjs",
      "plan",
      "--config",
      configPath,
      "--storyboard",
      join(base, "storyboard.md"),
      "--sources",
      join(base, "sources.json"),
    ],
    `${slug}:plan`,
  );
  await run(
    [
      "bin/rit-video.mjs",
      "approve",
      "script",
      "--config",
      configPath,
      "--reviewer",
      "Automated source-pack verification (draft)",
      "--role",
      "automation",
      "--notes",
      "Verifies declared source bindings for draft rendering; instructor and release approval remain required.",
    ],
    `${slug}:source-check`,
  );
  await run(
    [
      "bin/rit-video.mjs",
      "produce",
      "--config",
      configPath,
      "--mode",
      "record",
      "--until",
      "render",
    ],
    `${slug}:produce`,
  );
  const outputRoot = resolve(config.workflow.outputRoot);
  const report = JSON.parse(
    await readFile(join(outputRoot, "work/render/production-report.json"), "utf8"),
  );
  const quality = JSON.parse(
    await readFile(join(outputRoot, "quality-report.json"), "utf8"),
  );
  const result = {
    slug,
    title: report.title,
    durationSeconds: report.durationSeconds,
    sha256: report.sha256,
    elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(2)),
    cache: report.cache,
    quality: {
      ok: quality.ok,
      blockers: quality.blockers,
      warnings: quality.warnings,
    },
    outputRoot,
  };
  if (exportRoot) {
    await ensureDiskHeadroom(`${slug}:export`);
    await exportLesson(result);
    if (compactAfterExport) await compactLessonOutput(result);
  }
  return result;
}

async function loadVerifiedExport(slug) {
  const base = join(sourceRoot, slug);
  const metadata = JSON.parse(await readFile(join(base, "catalog.json"), "utf8"));
  const config = JSON.parse(
    await readFile(join(base, "video.config.json"), "utf8"),
  );
  const destination = resolve(exportRoot, "examples", metadata.id);
  try {
    const [release, quality, production] = await Promise.all([
      readFile(join(destination, "release-artifacts.json"), "utf8").then(
        JSON.parse,
      ),
      readFile(join(destination, "quality-report.json"), "utf8").then(
        JSON.parse,
      ),
      readFile(join(destination, "production-report.json"), "utf8").then(
        JSON.parse,
      ),
    ]);
    const currentSourceInputSha256 = await hashSourceInputs(slug);
    const expectedPreviewBudget = webPreviewMaxBytes || null;
    const requiredArtifacts = [
      webPreviewMaxBytes ? "master.mp4" : "video.mp4",
      "video.mp4",
      "captions.vtt",
      "transcript.txt",
      "poster.png",
      "sources.json",
      "catalog.json",
      "episode.json",
      "visual-plan.json",
      "run.lock.json",
      "quality-report.json",
      "grounding-report.json",
      "production-report.json",
    ];
    if (
      release.schemaVersion !== 1 ||
      release.courseId !== metadata.id ||
      release.webPreviewMaxBytes !== expectedPreviewBudget ||
      !quality.ok ||
      !requiredArtifacts.every((filename) => release.artifacts?.[filename])
    ) {
      return null;
    }
    if (
      release.sourceInputSha256 &&
      release.sourceInputSha256 !== currentSourceInputSha256
    ) {
      return null;
    }
    if (!release.sourceInputSha256) {
      for (const filename of ["catalog.json", "sources.json", "generation.json"]) {
        const expected = release.artifacts?.[filename];
        if (!expected) continue;
        const current = await readFile(join(base, filename));
        if (sha256(current) !== expected.sha256) return null;
      }
    }
    for (const [filename, expected] of Object.entries(release.artifacts)) {
      if (
        basename(filename) !== filename ||
        !expected ||
        !Number.isInteger(expected.size) ||
        typeof expected.sha256 !== "string"
      ) {
        return null;
      }
      const path = join(destination, filename);
      const file = await stat(path);
      if (
        file.size !== expected.size ||
        (await hashFile(path)) !== expected.sha256
      ) {
        return null;
      }
    }
    const masterName = webPreviewMaxBytes ? "master.mp4" : "video.mp4";
    const master = release.artifacts[masterName];
    if (
      master.sha256 !== release.masterSha256 ||
      production.sha256 !== release.masterSha256 ||
      !Number.isFinite(production.durationSeconds) ||
      production.durationSeconds <= 0
    ) {
      return null;
    }
    return {
      slug,
      title: production.title,
      durationSeconds: production.durationSeconds,
      sha256: release.masterSha256,
      elapsedSeconds: 0,
      cache: production.cache,
      quality: {
        ok: quality.ok,
        blockers: quality.blockers,
        warnings: quality.warnings,
      },
      outputRoot: resolve(config.workflow.outputRoot),
      resumed: true,
    };
  } catch (error) {
    if (error.code === "ENOENT" || error instanceof SyntaxError) return null;
    throw error;
  }
}

async function ensureDiskHeadroom(label) {
  const filesystem = await statfs(resolve("."));
  const availableBytes = Number(filesystem.bavail) * Number(filesystem.bsize);
  if (availableBytes < minimumFreeBytes) {
    throw new Error(
      `${label}: ${availableBytes} free bytes is below the ${minimumFreeBytes}-byte safety floor`,
    );
  }
}

async function exportLesson(result) {
  const metadata = JSON.parse(
    await readFile(join(sourceRoot, result.slug, "catalog.json"), "utf8"),
  );
  const destination = resolve(exportRoot, "examples", metadata.id);
  await mkdir(destination, { recursive: true });
  const narration = join(result.outputRoot, "work", "narration");
  const visuals = join(result.outputRoot, "work", "visuals");
  const render = join(result.outputRoot, "work", "render");
  const source = join(sourceRoot, result.slug);
  const masterPath = join(render, "documentary-master.core.mp4");
  const exportedMaster = webPreviewMaxBytes
    ? join(destination, "master.mp4")
    : join(destination, "video.mp4");
  await Promise.all([
    cp(masterPath, exportedMaster),
    cp(join(narration, "captions.vtt"), join(destination, "captions.vtt")),
    cp(join(narration, "transcript.txt"), join(destination, "transcript.txt")),
    cp(join(visuals, "thumbnail.png"), join(destination, "poster.png")),
    cp(join(source, "sources.json"), join(destination, "sources.json")),
    cp(join(source, "catalog.json"), join(destination, "catalog.json")),
    cp(join(result.outputRoot, "episode.json"), join(destination, "episode.json")),
    cp(
      join(result.outputRoot, "visual-plan.json"),
      join(destination, "visual-plan.json"),
    ),
    cp(
      join(result.outputRoot, "run.lock.json"),
      join(destination, "run.lock.json"),
    ),
    cp(
      join(result.outputRoot, "quality-report.json"),
      join(destination, "quality-report.json"),
    ),
    cp(
      join(result.outputRoot, "grounding-report.json"),
      join(destination, "grounding-report.json"),
    ),
    cp(
      join(render, "production-report.json"),
      join(destination, "production-report.json"),
    ),
  ]);
  let webPreviewEncoding = null;
  if (webPreviewMaxBytes) {
    webPreviewEncoding = await encodeWebPreview({
      source: masterPath,
      destination: join(destination, "video.mp4"),
      durationSeconds: result.durationSeconds,
      maximumBytes: webPreviewMaxBytes,
      label: `${result.slug}:web-preview`,
      hardwareDecode: fastDraft && process.platform === "darwin",
    });
    if (
      webPreviewEncoding.videoKbps < 1100 ||
      webPreviewEncoding.audioKbps < 96 ||
      webPreviewEncoding.width < 1280 ||
      webPreviewEncoding.height < 720
    ) {
      throw new Error(
        `${result.slug}: web preview is below the remaster quality floor`,
      );
    }
  }
  await assertCleanReleasedSpeech(destination, result.slug);
  const generationCopied = await copyIfPresent(
    join(source, "generation.json"),
    join(destination, "generation.json"),
  );
  const releaseFiles = [
    "video.mp4",
    "captions.vtt",
    "transcript.txt",
    "poster.png",
    "sources.json",
    "catalog.json",
    "episode.json",
    "visual-plan.json",
    "run.lock.json",
    "quality-report.json",
    "grounding-report.json",
    "production-report.json",
  ];
  if (webPreviewMaxBytes) releaseFiles.push("master.mp4");
  if (generationCopied) releaseFiles.push("generation.json");
  const artifacts = {};
  for (const filename of releaseFiles) {
    const bytes = await readFile(join(destination, filename));
    artifacts[filename] = {
      sha256: sha256(bytes),
      size: bytes.length,
    };
  }
  const masterArtifact = webPreviewMaxBytes
    ? artifacts["master.mp4"]
    : artifacts["video.mp4"];
  if (masterArtifact.sha256 !== result.sha256) {
    throw new Error(
      `${result.slug}: exported master checksum does not match production report`,
    );
  }
  await writeFile(
    join(destination, "release-artifacts.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        courseId: metadata.id,
        masterSha256: result.sha256,
        sourceInputSha256: await hashSourceInputs(result.slug),
        webPreviewMaxBytes: webPreviewMaxBytes || null,
        webPreviewEncoding,
        artifacts,
      },
      null,
      2,
    )}\n`,
  );
}

async function assertCleanReleasedSpeech(destination, slug) {
  const [transcript, captions] = await Promise.all([
    readFile(join(destination, "transcript.txt"), "utf8"),
    readFile(join(destination, "captions.vtt"), "utf8"),
  ]);
  const combined = `${transcript}\n${captions}`;
  if (/\b(?:NARRATOR|VOICEOVER)\s*:/i.test(combined)) {
    throw new Error(`${slug}: released speech contains a redundant speaker label`);
  }
  if (
    /(?:^|[.!?]\s+)(?:\[[^\]]+\]\s*)?(?:on[- ]screen|show on[- ]screen|display on[- ]screen|cut to|camera(?:\s+(?:shows|moves|pans|zooms))?|fade (?:in|out))\b/im.test(
      combined,
    )
  ) {
    throw new Error(`${slug}: released speech contains a production direction`);
  }
}

async function hashSourceInputs(slug) {
  const base = join(sourceRoot, slug);
  const files = {};
  for (const filename of [
    "catalog.json",
    "storyboard.md",
    "video.config.json",
    "sources.json",
  ]) {
    files[filename] = sha256(await readFile(join(base, filename)));
  }
  for (const filename of ["generation.json", "captions.override.vtt"]) {
    try {
      files[filename] = sha256(await readFile(join(base, filename)));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return sha256({
    schemaVersion: 1,
    files,
  });
}

async function encodeWebPreview({
  source,
  destination,
  durationSeconds,
  maximumBytes,
  label,
  hardwareDecode = false,
}) {
  const { audioKbps, minimumVideoKbps, videoKbps: initialVideoKbps } =
    webPreviewBudget({ durationSeconds, maximumBytes });
  const preset = "veryfast";
  let videoKbps = initialVideoKbps;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await runCommand(
      "ffmpeg",
      [
        "-y",
        "-hide_banner",
        "-loglevel",
        "warning",
        "-nostats",
        ...(hardwareDecode ? ["-hwaccel", "videotoolbox"] : []),
        "-i",
        source,
        "-map_metadata",
        "-1",
        "-vf",
        "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,fps=24",
        "-c:v",
        "libx264",
        "-preset",
        preset,
        "-b:v",
        `${videoKbps}k`,
        "-maxrate",
        `${Math.ceil(videoKbps * 1.15)}k`,
        "-bufsize",
        `${videoKbps * 2}k`,
        "-pix_fmt",
        "yuv420p",
        "-threads",
        "2",
        "-c:a",
        "aac",
        "-b:a",
        `${audioKbps}k`,
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        destination,
      ],
      `${label}:${attempt}`,
    );
    const size = (await stat(destination)).size;
    if (size <= maximumBytes) {
      return {
        schemaVersion: 1,
        codec: "libx264",
        preset,
        videoKbps,
        audioKbps,
        width: 1280,
        height: 720,
        frameRate: 24,
        attempts: attempt,
        size,
      };
    }
    videoKbps = Math.max(
      minimumVideoKbps,
      Math.floor(videoKbps * (maximumBytes / size) * 0.92),
    );
  }

  const size = (await stat(destination)).size;
  throw new Error(
    `${label}: ${size} bytes exceeds the ${maximumBytes}-byte budget`,
  );
}

async function copyIfPresent(source, destination) {
  try {
    await cp(source, destination);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function compactLessonOutput(result) {
  const render = join(result.outputRoot, "work", "render");
  await Promise.all([
    rm(join(result.outputRoot, "work", "narration"), {
      recursive: true,
      force: true,
    }),
    rm(join(result.outputRoot, "work", "visuals"), {
      recursive: true,
      force: true,
    }),
    rm(join(render, "sections"), { recursive: true, force: true }),
    rm(join(render, "documentary-master.core.mp4"), { force: true }),
    rm(join(render, "documentary-master.DRAFT.mp4"), { force: true }),
    rm(join(render, "documentary-master.DRAFT.mp4.slate.png"), {
      force: true,
    }),
  ]);
}

const results = await orderedMapLimit(
  directories,
  option("--concurrency")
    ? requestedConcurrency
    : pipelineConcurrency("LONG_FORM_COURSE_CONCURRENCY", {
        defaultValue: 2,
        maximum: 3,
      }),
  renderLesson,
);
const manifest = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  count: results.length,
  resumedCount: results.filter((lesson) => lesson.resumed).length,
  totalDurationSeconds: results.reduce(
    (sum, lesson) => sum + lesson.durationSeconds,
    0,
  ),
  totalElapsedSeconds: Number(
    results.reduce((sum, lesson) => sum + lesson.elapsedSeconds, 0).toFixed(2),
  ),
  lessons: results,
};
const manifestPath = join(manifestRoot, "long-form-manifest.json");
await mkdir(manifestRoot, { recursive: true });
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (exportRoot) await updatePublicCatalog(results);
console.log(JSON.stringify({ manifestPath, ...manifest }, null, 2));

async function updatePublicCatalog(rendered) {
  const catalogPath = resolve(exportRoot, "course-catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const byId = new Map(catalog.courses.map((course) => [course.id, course]));
  for (const result of rendered) {
    const metadata = JSON.parse(
      await readFile(join(sourceRoot, result.slug, "catalog.json"), "utf8"),
    );
    const projectConfig = JSON.parse(
      await readFile(join(sourceRoot, result.slug, "video.config.json"), "utf8"),
    );
    const durationSeconds = Math.round(result.durationSeconds);
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = String(durationSeconds % 60).padStart(2, "0");
    byId.set(metadata.id, {
      ...metadata,
      generationProvenance:
        Array.isArray(metadata.generationProvenance) &&
        metadata.generationProvenance.length
          ? metadata.generationProvenance
          : authoredGenerationProvenance(projectConfig),
      duration: `${minutes}:${seconds}`,
      durationSeconds,
      poster: `./examples/${metadata.id}/poster.png`,
      video: `./examples/${metadata.id}/video.mp4`,
      captions: `./examples/${metadata.id}/captions.vtt`,
      transcript: `./examples/${metadata.id}/transcript.txt`,
      sources: `./examples/${metadata.id}/sources.json`,
      releaseManifest: `./examples/${metadata.id}/release-artifacts.json`,
      qualityReport: `./examples/${metadata.id}/quality-report.json`,
      groundingReport: `./examples/${metadata.id}/grounding-report.json`,
    });
  }
  const rank = { "Full lesson": 0, "Core lesson": 1, "Micro-lesson": 2 };
  catalog.updated = new Date().toISOString().slice(0, 10);
  catalog.courses = [...byId.values()].sort(
    (left, right) =>
      rank[left.format] - rank[right.format] ||
      left.area.localeCompare(right.area) ||
      left.title.localeCompare(right.title),
  );
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
}
