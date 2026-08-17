import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { sha256 } from "../src/core/canonical.mjs";
import { authoredGenerationProvenance } from "./course-generation-provenance.mjs";

const slugs = [
  "engineering-resonance",
  "engineering-technology-pid",
  "science-spectroscopy",
  "art-design-hierarchy",
  "business-contribution-margin",
  "liberal-arts-primary-sources",
  "health-oxygen-transport",
  "ntid-accessible-captions",
  "sustainability-lca",
  "individualized-study-question",
  "mathematics-local-derivative",
  "cybersecurity-phishing-check",
  "photography-exposure-triangle",
  "psychology-correlation-causation",
  "mis-business-process-decisions",
];
const exportRoot = option("--export");
const onlyIndex = process.argv.indexOf("--only");
const selected =
  onlyIndex >= 0
    ? process.argv[onlyIndex + 1]
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
    : slugs;

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}
for (const slug of selected) {
  if (!slugs.includes(slug)) {
    throw new Error(`Unknown subject showcase slug: ${slug}`);
  }
}

function runNode(args, label) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, args, {
      cwd: resolve("."),
      env: {
        ...process.env,
        VIDEO_RENDER_CONCURRENCY: process.env.VIDEO_RENDER_CONCURRENCY || "2",
      },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      process.stdout.write(`[${label}] ${chunk}`);
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
      process.stderr.write(`[${label}] ${chunk}`);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolvePromise({ stdout, stderr });
      } else {
        reject(
          new Error(
            `${label} failed with exit code ${code}: ${stderr.slice(-2000)}`,
          ),
        );
      }
    });
  });
}

async function renderLesson(slug) {
  const base = `courses/subject-showcase/${slug}`;
  const config = `${base}/video.config.json`;
  await runNode(
    [
      "bin/rit-video.mjs",
      "plan",
      "--config",
      config,
      "--storyboard",
      `${base}/storyboard.md`,
      "--sources",
      `${base}/sources.json`,
    ],
    `${slug}:plan`,
  );
  await runNode(
    [
      "bin/rit-video.mjs",
      "approve",
      "script",
      "--config",
      config,
      "--reviewer",
      "Automated source-pack verification (draft)",
      "--role",
      "automation",
      "--notes",
      "Verifies declared claim-to-source bindings for draft rendering only; this is not instructor or release approval.",
    ],
    `${slug}:source-check`,
  );
  await runNode(
    [
      "bin/rit-video.mjs",
      "produce",
      "--config",
      config,
      "--mode",
      "record",
      "--until",
      "render",
    ],
    `${slug}:render`,
  );
  const outputRoot = resolve(`.demo-output/subject-showcase/${slug}`);
  const productionReport = JSON.parse(
    await readFile(`${outputRoot}/work/render/production-report.json`, "utf8"),
  );
  const qualityReport = JSON.parse(
    await readFile(`${outputRoot}/quality-report.json`, "utf8"),
  );
  const result = {
    slug,
    title: productionReport.title,
    durationSeconds: productionReport.durationSeconds,
    sha256: productionReport.sha256,
    masterPath: productionReport.masterPath,
    draftPath: productionReport.draftPath,
    quality: {
      ok: qualityReport.ok,
      blockers: qualityReport.blockers,
      warnings: qualityReport.warnings,
    },
    captionsVtt: `${outputRoot}/work/narration/captions.vtt`,
    transcriptText: `${outputRoot}/work/narration/transcript.txt`,
  };
  if (exportRoot) await exportLesson(result);
  return result;
}

async function exportLesson(result) {
  const destination = resolve(exportRoot, "examples", result.slug);
  const outputRoot = resolve(`.demo-output/subject-showcase/${result.slug}`);
  const sourceRoot = resolve(`courses/subject-showcase/${result.slug}`);
  await mkdir(destination, { recursive: true });
  const files = {
    "video.mp4": result.masterPath,
    "captions.vtt": result.captionsVtt,
    "transcript.txt": result.transcriptText,
    "poster.png": join(outputRoot, "work/visuals/thumbnail.png"),
    "sources.json": join(sourceRoot, "sources.json"),
    "episode.json": join(outputRoot, "episode.json"),
    "visual-plan.json": join(outputRoot, "visual-plan.json"),
    "run.lock.json": join(outputRoot, "run.lock.json"),
    "quality-report.json": join(outputRoot, "quality-report.json"),
    "grounding-report.json": join(outputRoot, "grounding-report.json"),
    "production-report.json": join(
      outputRoot,
      "work/render/production-report.json",
    ),
  };
  const artifacts = {};
  for (const [filename, source] of Object.entries(files)) {
    const destinationPath = join(destination, filename);
    await cp(source, destinationPath);
    const bytes = await readFile(destinationPath);
    artifacts[filename] = { sha256: sha256(bytes), size: bytes.length };
  }
  if (artifacts["video.mp4"].sha256 !== result.sha256) {
    throw new Error(`${result.slug}: exported master checksum mismatch`);
  }
  await writeFile(
    join(destination, "release-artifacts.json"),
    `${JSON.stringify(
      {
        schemaVersion: 1,
        courseId: result.slug,
        masterSha256: result.sha256,
        artifacts,
      },
      null,
      2,
    )}\n`,
  );
}

const concurrency = Math.max(
  1,
  Math.min(3, Number.parseInt(process.env.SHOWCASE_CONCURRENCY || "2", 10)),
);
const results = new Array(selected.length);
let next = 0;
async function worker() {
  while (next < selected.length) {
    const index = next;
    next += 1;
    results[index] = await renderLesson(selected[index]);
  }
}
await Promise.all(
  Array.from({ length: Math.min(concurrency, selected.length) }, () => worker()),
);

const manifestPath = resolve(
  ".demo-output/subject-showcase/subject-showcase-manifest.json",
);
const generatedAt = new Date().toISOString();
const manifest = {
  schemaVersion: 1,
  generatedAt,
  count: results.length,
  lessons: results,
};
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
if (exportRoot) await updatePublicCatalog(results);
if (selected.length === slugs.length) {
  const referenceManifestPath = resolve(
    "courses/subject-showcase/reference-manifest.json",
  );
  const referenceManifest = {
    schemaVersion: 1,
    generatedAt,
    status: "course-draft",
    approvalStatus:
      "Automated claim/source binding check only; instructor and release approval remain required.",
    count: results.length,
    totalDurationSeconds: results.reduce(
      (sum, lesson) => sum + lesson.durationSeconds,
      0,
    ),
    lessons: results.map((lesson) => ({
      slug: lesson.slug,
      title: lesson.title,
      durationSeconds: lesson.durationSeconds,
      sha256: lesson.sha256,
      quality: lesson.quality,
      outputRoot: `.demo-output/subject-showcase/${lesson.slug}`,
    })),
  };
  await writeFile(
    referenceManifestPath,
    `${JSON.stringify(referenceManifest, null, 2)}\n`,
  );
}
console.log(JSON.stringify({ manifestPath, results }, null, 2));

async function updatePublicCatalog(rendered) {
  const catalogPath = resolve(exportRoot, "course-catalog.json");
  const catalog = JSON.parse(await readFile(catalogPath, "utf8"));
  const byId = new Map(catalog.courses.map((course) => [course.id, course]));
  for (const result of rendered) {
    const course = byId.get(result.slug);
    if (!course) {
      throw new Error(`${result.slug}: public catalog entry is missing`);
    }
    const durationSeconds = Math.round(result.durationSeconds);
    const projectConfig = JSON.parse(
      await readFile(
        resolve(
          `courses/subject-showcase/${result.slug}/video.config.json`,
        ),
        "utf8",
      ),
    );
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = String(durationSeconds % 60).padStart(2, "0");
    Object.assign(course, {
      duration: `${minutes}:${seconds}`,
      durationSeconds,
      poster: `./examples/${result.slug}/poster.png`,
      video: `./examples/${result.slug}/video.mp4`,
      captions: `./examples/${result.slug}/captions.vtt`,
      transcript: `./examples/${result.slug}/transcript.txt`,
      sources: `./examples/${result.slug}/sources.json`,
      releaseManifest: `./examples/${result.slug}/release-artifacts.json`,
      qualityReport: `./examples/${result.slug}/quality-report.json`,
      groundingReport: `./examples/${result.slug}/grounding-report.json`,
      generationProvenance:
        Array.isArray(course.generationProvenance) &&
        course.generationProvenance.length
          ? course.generationProvenance
          : authoredGenerationProvenance(projectConfig),
    });
  }
  catalog.updated = new Date().toISOString().slice(0, 10);
  await writeFile(catalogPath, `${JSON.stringify(catalog, null, 2)}\n`);
}
