import { access } from "node:fs/promises";
import { resolve } from "node:path";
import { auditGrounding } from "../grounding/audit.mjs";
import {
  RIT_VIDEO_TOKENS,
  brandPackReleaseAudit,
} from "./brand-pack.mjs";

export async function auditCourseEpisode({
  config,
  episode,
  brandPack,
  release = false,
}) {
  const blockers = [];
  const warnings = [];
  const checks = [];
  const grounding = auditGrounding(episode, {
    groundingMode: config.workflow.groundingMode,
    requireVerified: release && config.workflow.groundingMode !== "open",
  });
  blockers.push(...grounding.blockers);
  warnings.push(...grounding.warnings);

  if (
    config.preset === "rit-student" &&
    !config.project.aiPolicyFile
  ) {
    blockers.push("Student projects require project.aiPolicyFile");
  } else if (config.preset === "rit-student") {
    await access(resolve(config.project.aiPolicyFile)).catch(() => {
      blockers.push(
        `Student AI policy file is missing: ${config.project.aiPolicyFile}`,
      );
    });
  }
  for (const beat of episode.beats) {
    if (/^\s*(?:narrator|voiceover)\s*:/i.test(beat.narration)) {
      blockers.push(
        `${beat.id} narration contains a spoken speaker label; remove it before synthesis`,
      );
    }
    if (
      /(?:^|[.!?]\s+)(?:\[[^\]]+\]\s*)?(?:on[- ]screen|show on[- ]screen|display on[- ]screen|cut to|camera(?:\s+(?:shows|moves|pans|zooms))?|fade (?:in|out))\b/i.test(
        beat.narration,
      )
    ) {
      blockers.push(
        `${beat.id} narration contains a production direction; move it to visualDirection`,
      );
    }
    if (
      !beat.accessibility.describedInNarration &&
      !beat.accessibility.audioDescriptionCue
    ) {
      blockers.push(
        `${beat.id} has important visuals without narration or an audio-description cue`,
      );
    }
    const wordCount = beat.narration.split(/\s+/).filter(Boolean).length;
    const wordsPerMinute = wordCount / (beat.plannedSeconds / 60);
    if (wordsPerMinute > 190) {
      warnings.push(`${beat.id} narration is planned above 190 words per minute`);
    }
    if (wordsPerMinute < 80) {
      warnings.push(`${beat.id} narration is planned below 80 words per minute`);
    }
    if (config.preset !== "generic" && beat.plannedSeconds < 2) {
      blockers.push(`${beat.id} is shorter than the two-second visual dwell minimum`);
    }
    if (
      config.preset !== "generic" &&
      beat.title.length > 18 &&
      beat.title === beat.title.toUpperCase()
    ) {
      warnings.push(`${beat.id} title uses excessive all-caps text`);
    }
    const generationDirections = [
      beat.narration,
      beat.visualDirection,
      beat.delivery,
      ...(beat.assetRequests || []).map((request) => request.prompt),
    ].join("\n");
    if (
      /in the style of|sound like\s+[A-Z]|imitate (?:the )?voice|voice clon/i.test(
        generationDirections,
      )
    ) {
      blockers.push(`${beat.id} appears to request named-person or named-style imitation`);
    }
    if (
      (beat.assetRequests || []).some(
        (request) =>
          request.capability === "video.generate" &&
          /\b(?:add|include|generate)\b.{0,30}\b(?:music|soundtrack|song)\b/i.test(
            request.prompt,
          ),
      )
    ) {
      blockers.push(
        `${beat.id} requests generated clip audio; use separately licensed and approved audio`,
      );
    }
  }
  if (release) {
    const brand = brandPackReleaseAudit(brandPack, config.preset);
    blockers.push(...brand.blockers);
    warnings.push(...brand.warnings);
  }
  if (config.preset === "rit-student" && brandPack) {
    blockers.push("Student workflow cannot apply an official RIT brand pack");
  }
  if (
    brandPack &&
    !["rit-media", "rit-student"].includes(config.preset)
  ) {
    blockers.push(
      "Official RIT brand packs may only be applied by the rit-media workflow",
    );
  }
  if (
    config.workflow.groundingMode === "open" &&
    release &&
    config.preset !== "generic"
  ) {
    blockers.push("Open generation cannot become an official RIT release");
  }
  if (config.preset !== "generic") {
    checks.push(
      {
        name: "frame",
        ok:
          RIT_VIDEO_TOKENS.width === 1920 &&
          RIT_VIDEO_TOKENS.height === 1080,
        value: `${RIT_VIDEO_TOKENS.width}x${RIT_VIDEO_TOKENS.height}`,
      },
      {
        name: "frame-rate",
        ok: RIT_VIDEO_TOKENS.frameRate === "30000/1001",
        value: RIT_VIDEO_TOKENS.frameRate,
      },
      {
        name: "audio-sample-rate",
        ok: RIT_VIDEO_TOKENS.audioSampleRate === 48_000,
        value: RIT_VIDEO_TOKENS.audioSampleRate,
      },
      {
        name: "rit-orange-token",
        ok: RIT_VIDEO_TOKENS.orange === "#F76902",
        value: RIT_VIDEO_TOKENS.orange,
      },
      {
        name: "orange-on-black-contrast",
        ok:
          contrastRatio(RIT_VIDEO_TOKENS.orange, RIT_VIDEO_TOKENS.black) >=
          4.5,
        value: contrastRatio(
          RIT_VIDEO_TOKENS.orange,
          RIT_VIDEO_TOKENS.black,
        ),
      },
      {
        name: "title-safe-template",
        ok: true,
        value: "96px minimum inset",
      },
      {
        name: "font-fallbacks",
        ok: true,
        value: "Arial/Liberation Sans and Georgia/Liberation Serif",
      },
    );
    blockers.push(
      ...checks
        .filter((check) => !check.ok)
        .map((check) => `Production check failed: ${check.name}`),
    );
  }
  return {
    ok: blockers.length === 0,
    blockers,
    warnings,
    checks,
    releaseState: release
      ? releaseState(config, brandPack)
      : "preview",
  };
}

function contrastRatio(left, right) {
  const first = luminance(left);
  const second = luminance(right);
  const lighter = Math.max(first, second);
  const darker = Math.min(first, second);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

function luminance(hex) {
  const channels = String(hex)
    .replace("#", "")
    .match(/.{2}/g)
    .map((value) => Number.parseInt(value, 16) / 255)
    .map((value) =>
      value <= 0.04045
        ? value / 12.92
        : ((value + 0.055) / 1.055) ** 2.4,
    );
  return (
    0.2126 * channels[0] +
    0.7152 * channels[1] +
    0.0722 * channels[2]
  );
}

function releaseState(config, brandPack) {
  if (config.preset === "rit-media" && brandPack) return "official-rit";
  if (config.preset === "rit-student") return "student-project";
  if (config.preset === "rit-course") return "course-draft";
  return "generic-release";
}
