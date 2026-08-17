import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { atomicWriteJson } from "../core/canonical.mjs";
import { assertSchema } from "../core/schema.mjs";
import { loadBrandPack } from "../course/brand-pack.mjs";
import {
  scriptApprovalSubject,
  visualApprovalSubject,
} from "../course/subjects.mjs";
import { auditGrounding } from "../grounding/audit.mjs";

const sentencePool = (value) =>
  String(value)
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const deterministicShotLimit = (beat) =>
  /^template:academic-process(?:\s*\||\b)/i.test(
    String(beat.visualDirection || "").trim(),
  )
    ? 3
    : Number.POSITIVE_INFINITY;

export function compileVisualPlan(episode) {
  return {
    schemaVersion: 1,
    episodeId: episode.id,
    beats: episode.beats.map((beat) => {
      const requested = beat.assetRequests || [];
      const phrases = sentencePool(beat.narration);
      const automaticCount = Math.max(
        1,
        Math.min(
          phrases.length,
          Math.ceil(beat.plannedSeconds / 8),
          deterministicShotLimit(beat),
        ),
      );
      const shots = requested.length
        ? requested.map((request, index) => ({
            id: `${beat.id}-shot-${String(index + 1).padStart(3, "0")}`,
            type:
              request.capability === "video.generate" ? "generated-video" : "generated-image",
            prompt: request.prompt,
            capability: request.capability,
            parameters: request.parameters || {},
            phrase: phrases[index % Math.max(1, phrases.length)] || beat.title,
          }))
        : Array.from({ length: automaticCount }, (_, index) => ({
            id: `${beat.id}-shot-${String(index + 1).padStart(3, "0")}`,
            type: "deterministic-svg",
            phrase:
              phrases[
                Math.min(
                  phrases.length - 1,
                  Math.floor((index / automaticCount) * phrases.length),
                )
              ] || beat.title,
          }));
      return { beatId: beat.id, shots };
    }),
  };
}

export async function writePlanArtifacts({ config, episode }) {
  await assertSchema("episode", episode);
  const root = resolve(config.workflow.outputRoot);
  const reviewRoot = join(root, "review");
  await mkdir(reviewRoot, { recursive: true });
  const visualPlan = compileVisualPlan(episode);
  const groundingReport = auditGrounding(episode, {
    groundingMode: config.workflow.groundingMode,
  });
  const brandPack = await loadBrandPack(config.brandPack);
  const scriptSubject = scriptApprovalSubject({
    episode,
    config,
    groundingReport,
  });
  const visualSubject = visualApprovalSubject({
    episode,
    visualPlan,
    brandPack,
    config,
  });
  await Promise.all([
    atomicWriteJson(join(root, "episode.json"), episode),
    atomicWriteJson(join(root, "visual-plan.json"), visualPlan),
    atomicWriteJson(join(root, "grounding-report.json"), groundingReport),
    atomicWriteJson(join(reviewRoot, "script.subject.json"), scriptSubject),
    atomicWriteJson(join(reviewRoot, "visuals.subject.json"), visualSubject),
  ]);
  return {
    root,
    episode,
    visualPlan,
    groundingReport,
    scriptSubject,
    visualSubject,
  };
}

export async function refreshPlanArtifacts(config) {
  const root = resolve(config.workflow.outputRoot);
  const episode = JSON.parse(await readFile(join(root, "episode.json"), "utf8"));
  return writePlanArtifacts({ config, episode });
}
