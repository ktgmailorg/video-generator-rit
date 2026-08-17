import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { atomicWriteJson } from "../core/canonical.mjs";
import { verifyApproval } from "../core/approvals.mjs";
import { loadBrandPack } from "../course/brand-pack.mjs";
import { buildAiDisclosure } from "../course/disclosure.mjs";
import { packageForPanopto } from "../course/package.mjs";
import { auditCourseEpisode } from "../course/quality.mjs";
import { releaseApprovalSubject } from "../course/subjects.mjs";
import { ProviderExecutionEngine } from "../providers/execution-engine.mjs";
import { refreshPlanArtifacts } from "./planning.mjs";
import { generateNarration } from "./narration.mjs";
import { renderDocumentary } from "./render.mjs";
import { buildRunLock } from "./run-lock.mjs";
import { generateVisualAssets } from "./visual-generation.mjs";
import { hashFile } from "./tools.mjs";

export class ApprovalRequiredError extends Error {
  constructor(stage, subjectPath) {
    super(`Approval required for ${stage}; review ${subjectPath}`);
    this.name = "ApprovalRequiredError";
    this.code = "APPROVAL_REQUIRED";
    this.stage = stage;
    this.subjectPath = subjectPath;
  }
}

export async function produceEpisode({
  config,
  mode = config.workflow.determinism,
  until = "package",
  allowDraftQualityBlockers = false,
  signal,
  onEvent,
}) {
  const root = resolve(config.workflow.outputRoot);
  await mkdir(root, { recursive: true });
  const plan = await refreshPlanArtifacts(config);
  const brandPack = await loadBrandPack(config.brandPack);
  const draftAudit = await auditCourseEpisode({
    config,
    episode: plan.episode,
    brandPack,
    release: false,
  });
  if (!draftAudit.ok) {
    const error = new Error(
      `Course quality preflight failed: ${draftAudit.blockers.join("; ")}`,
    );
    error.code = "QUALITY_GATE_FAILED";
    error.report = draftAudit;
    throw error;
  }
  await requireApprovalIfConfigured(
    config,
    root,
    "script",
    plan.scriptSubject,
  );
  await requireApprovalIfConfigured(
    config,
    root,
    "visuals",
    plan.visualSubject,
  );
  const events = [];
  const engine = new ProviderExecutionEngine({
    config,
    mode,
    onEvent: (event) => {
      events.push(event);
      onEvent?.(event);
    },
  });
  const planningRecords = await readFile(
    join(root, "planning-provider-records.json"),
    "utf8",
  )
    .then(JSON.parse)
    .catch((error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    });
  if (planningRecords) {
    engine.records.push(...(planningRecords.records || []));
    Object.assign(
      engine.providerManifests,
      planningRecords.providers || {},
    );
    engine.totalCostUsd += Number(planningRecords.totalCostUsd || 0);
  }
  const stages = [
    { name: "plan", status: "complete" },
    { name: "script-approval", status: "complete" },
    { name: "visual-approval", status: "complete" },
  ];
  if (config.roles.moderation) {
    const moderation = await engine.executeRole(
      "moderation",
      {
        schemaVersion: 1,
        capability: "moderation.classify",
        input: {
          content: [
            ...plan.episode.beats.map((beat) => beat.narration),
            ...plan.visualPlan.beats.flatMap((beat) =>
              beat.shots.map((shot) => shot.prompt).filter(Boolean),
            ),
          ].join("\n\n"),
        },
        parameters: {},
      },
      { signal },
    );
    const moderationResults =
      moderation.output.results || [moderation.output];
    if (moderationResults.some((result) => result?.flagged === true)) {
      const error = new Error(
        "Configured moderation provider flagged the approved course content",
      );
      error.code = "SAFETY_REFUSAL";
      throw error;
    }
    stages.push({ name: "moderation", status: "complete" });
  }
  const narration = await generateNarration({
    episode: plan.episode,
    engine,
    root,
    ffprobe: process.env.VIDEO_FFPROBE || "ffprobe",
    signal,
  });
  stages.push({ name: "narration", status: "complete" });
  if (until === "narration") {
    const lock = await buildRunLock({
      config,
      episode: plan.episode,
      engine,
      root,
      status: "planned",
      stages,
    });
    return { root, narration, runLock: lock, status: "planned" };
  }
  const visuals = await generateVisualAssets({
    config,
    episode: plan.episode,
    visualPlan: plan.visualPlan,
    narration,
    engine,
    root,
    brandPack,
    signal,
  });
  stages.push({ name: "visual-generation", status: "complete" });
  if (until === "visuals") {
    const lock = await buildRunLock({
      config,
      episode: plan.episode,
      engine,
      root,
      status: "planned",
      stages,
    });
    return { root, narration, visuals, runLock: lock, status: "planned" };
  }
  const render = await renderDocumentary({
    config,
    episode: plan.episode,
    narration,
    visuals,
    root,
    signal,
  });
  stages.push({ name: "render", status: "complete" });
  const disclosure = buildAiDisclosure({
    config,
    engine,
    episode: plan.episode,
    mode,
  });
  const releaseAudit = await auditCourseEpisode({
    config,
    episode: plan.episode,
    brandPack,
    release: true,
  });
  if (config.preset !== "generic") {
    const firstCaptionStart = narration.captions.cues?.[0]?.start ?? null;
    const startOffset =
      Number.isFinite(firstCaptionStart) &&
      Number.isFinite(render.audioStartSeconds)
        ? Math.abs(firstCaptionStart - render.audioStartSeconds)
        : null;
    releaseAudit.checks.push(
      {
        name: "final-master-loudness",
        ok: render.audioQuality?.ok === true,
        value: render.audioQuality || null,
      },
      {
        name: "caption-audio-start-sync",
        ok: startOffset !== null && startOffset <= 0.25,
        value: {
          audioStartSeconds: render.audioStartSeconds ?? null,
          captionStartSeconds: firstCaptionStart,
          offsetSeconds:
            startOffset === null ? null : Number(startOffset.toFixed(3)),
          maximumOffsetSeconds: 0.25,
        },
      },
    );
    if (render.audioQuality?.ok !== true) {
      releaseAudit.blockers.push(
        "Final narration does not meet the -16 LUFS / true-peak audio target",
      );
    }
    if (startOffset === null || startOffset > 0.25) {
      releaseAudit.blockers.push(
        "Final narration and captions do not begin within the 250 ms synchronization limit",
      );
    }
  }
  if (
    config.preset !== "generic" &&
    narration.captions.estimatedTiming
  ) {
    releaseAudit.blockers.push(
      "RIT release captions require provider or transcription timing",
    );
    releaseAudit.ok = false;
  }
  if (config.preset !== "generic") {
    const genericVisuals = visuals.beats.flatMap((beat) =>
      beat.shots
        .filter((shot) => shot.visualTemplate === "course-cards")
        .map((shot) => shot.id),
    );
    releaseAudit.checks.push({
      name: "subject-matched-visuals",
      ok: genericVisuals.length === 0,
      value: {
        genericShotIds: genericVisuals,
        resolvedTemplates: [
          ...new Set(
            visuals.beats.flatMap((beat) =>
              beat.shots.map((shot) => shot.visualTemplate || "unknown"),
            ),
          ),
        ].sort(),
      },
    });
    if (genericVisuals.length > 0) {
      releaseAudit.blockers.push(
        `Subject-matched educational visuals are required; generic course cards remain in ${genericVisuals.join(", ")}`,
      );
    }
    for (const beat of visuals.beats) {
      for (const shot of beat.shots) {
        if (shot.duration < 2) {
          releaseAudit.blockers.push(
            `${shot.id} is visible for less than the two-second course minimum`,
          );
        }
      }
    }
  }
  releaseAudit.blockers.push(...narration.captions.audit.blockers);
  releaseAudit.warnings.push(...narration.captions.audit.warnings);
  releaseAudit.ok = releaseAudit.blockers.length === 0;
  const releaseSubject = releaseApprovalSubject({
    episode: plan.episode,
    master: {
      sha256: render.sha256,
      durationSeconds: render.durationSeconds,
    },
    captions: {
      vttSha256: await hashFile(narration.files.vtt),
      srtSha256: await hashFile(narration.files.srt),
      audit: narration.captions.audit,
    },
    transcript: {
      textSha256: await hashFile(narration.files.transcriptText),
      htmlSha256: await hashFile(narration.files.transcriptHtml),
    },
    qualityReport: releaseAudit,
    disclosure,
  });
  await Promise.all([
    atomicWriteJson(
      join(root, "review", "release.subject.json"),
      releaseSubject,
    ),
    atomicWriteJson(join(root, "quality-report.json"), releaseAudit),
    atomicWriteJson(join(root, "events.json"), events),
  ]);
  const artifacts = [
    { role: "master", path: render.masterPath, sha256: render.sha256 },
    {
      role: "captions-vtt",
      path: narration.files.vtt,
      sha256: await hashFile(narration.files.vtt),
    },
    {
      role: "captions-srt",
      path: narration.files.srt,
      sha256: await hashFile(narration.files.srt),
    },
    {
      role: "transcript-text",
      path: narration.files.transcriptText,
      sha256: await hashFile(narration.files.transcriptText),
    },
    {
      role: "transcript-html",
      path: narration.files.transcriptHtml,
      sha256: await hashFile(narration.files.transcriptHtml),
    },
    {
      role: "thumbnail",
      path: visuals.thumbnailPath,
      sha256: await hashFile(visuals.thumbnailPath),
    },
    ...visuals.beats.flatMap((beat) =>
      beat.shots.map((shot) => ({
        role: "shot",
        beatId: beat.beatId,
        shotId: shot.id,
        path: shot.path,
        sha256: shot.sha256,
        mimeType: shot.mimeType,
      })),
    ),
  ];
  if (!releaseAudit.ok) {
    stages.push({ name: "release-qa", status: "failed" });
    const lock = await buildRunLock({
      config,
      episode: plan.episode,
      engine,
      root,
      status:
        until === "render" && allowDraftQualityBlockers
          ? "awaiting-approval"
          : "failed",
      stages,
      artifacts,
      final: { render, releaseAudit },
    });
    if (until === "render" && allowDraftQualityBlockers) {
      return {
        root,
        status: "awaiting-approval",
        episode: plan.episode,
        narration,
        visuals,
        render,
        disclosure,
        qualityReport: releaseAudit,
        runLock: lock,
        package: null,
      };
    }
    const error = new Error(
      `Release QA failed: ${releaseAudit.blockers.join("; ")}`,
    );
    error.code = "QUALITY_GATE_FAILED";
    error.report = releaseAudit;
    error.runLock = lock;
    throw error;
  }
  stages.push({ name: "release-qa", status: "complete" });
  if (until === "render") {
    stages.push({ name: "release-approval", status: "waiting" });
    const lock = await buildRunLock({
      config,
      episode: plan.episode,
      engine,
      root,
      status: "awaiting-approval",
      stages,
      artifacts,
      final: { render, releaseAudit },
    });
    return {
      root,
      status: "awaiting-approval",
      episode: plan.episode,
      narration,
      visuals,
      render,
      disclosure,
      qualityReport: releaseAudit,
      runLock: lock,
      package: null,
    };
  }
  try {
    await requireApprovalIfConfigured(
      config,
      root,
      "release",
      releaseSubject,
    );
  } catch (error) {
    if (error.code !== "APPROVAL_REQUIRED") throw error;
    stages.push({ name: "release-approval", status: "waiting" });
    const lock = await buildRunLock({
      config,
      episode: plan.episode,
      engine,
      root,
      status: "awaiting-approval",
      stages,
      artifacts,
      final: { render, releaseAudit },
    });
    error.runLock = lock;
    error.draftPath = render.draftPath;
    throw error;
  }
  stages.push({ name: "release-approval", status: "complete" });
  const lock = await buildRunLock({
    config,
    episode: plan.episode,
    engine,
    root,
    status: "complete",
    stages: [...stages, { name: "package", status: "complete" }],
    artifacts,
    final: { render, releaseAudit },
  });
  const packageResult = await packageForPanopto({
    config,
    episode: plan.episode,
    root,
    render,
    narration,
    visuals,
    disclosure,
    qualityReport: releaseAudit,
    runLock: lock,
    brandPack,
  });
  return {
    root,
    status: "complete",
    episode: plan.episode,
    narration,
    visuals,
    render,
    disclosure,
    qualityReport: releaseAudit,
    runLock: lock,
    package: packageResult,
  };
}

async function requireApprovalIfConfigured(
  config,
  root,
  stage,
  subject,
) {
  if (!config.workflow.approvals.includes(stage)) return;
  const verification = await verifyApproval({
    root: join(root, "approvals"),
    stage,
    subject,
  });
  if (!verification.ok) {
    throw new ApprovalRequiredError(
      stage,
      join(root, "review", `${stage}.subject.json`),
    );
  }
}
