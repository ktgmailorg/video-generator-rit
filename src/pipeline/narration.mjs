import { mkdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { atomicWrite, atomicWriteJson } from "../core/canonical.mjs";
import {
  auditCaptions,
  clampCuesToDuration,
  cuesToSrt,
  cuesToVtt,
  formatCaptionCues,
  offsetCues,
  parseVtt,
  transcriptHtml,
  transcriptText,
} from "../accessibility/captions.mjs";
import { orderedMapLimit, pipelineConcurrency } from "./concurrency.mjs";
import { probeDuration } from "./tools.mjs";

export async function generateNarration({
  episode,
  engine,
  root,
  ffprobe = "ffprobe",
  signal,
}) {
  const directory = join(root, "work", "narration");
  await mkdir(directory, { recursive: true });
  const labelSpeakers = shouldLabelCaptionSpeakers(episode.beats);
  const singleSpeaker = labelSpeakers
    ? ""
    : episode.beats
        .map((beat) => String(beat.captionSpeaker || "").trim())
        .find(Boolean) || "";
  const localBeats = await orderedMapLimit(
    episode.beats,
    pipelineConcurrency("VIDEO_NARRATION_CONCURRENCY", {
      defaultValue: 3,
      maximum: 8,
    }),
    async (beat) => {
    const result = await engine.executeRole(
      "narration",
      {
        schemaVersion: 1,
        capability: "speech.synthesize",
        input: {
          text: beat.narration,
          instructions: beat.delivery,
        },
        parameters: {},
        expectedOutput: {
          mimeTypes: [
            "audio/mpeg",
            "audio/wav",
            "audio/ogg",
            "audio/webm",
            "text/vtt",
          ],
          maximumBytes: 100_000_000,
        },
      },
      { signal },
    );
    const audioReference = result.artifacts.find((artifact) =>
      artifact.mimeType.startsWith("audio/"),
    );
    if (!audioReference) {
      throw new Error(`Narration provider returned no audio for ${beat.id}`);
    }
    const audioExtension =
      audioReference.extension ||
      extname(audioReference.filename || "") ||
      ".mp3";
    const audioPath = join(directory, `${beat.id}${audioExtension}`);
    await engine.artifactStore.materialize(audioReference, audioPath);
    const duration = await probeDuration(audioPath, ffprobe, signal);
    const captionsReference = result.artifacts.find(
      (artifact) =>
        artifact.mimeType === "text/vtt" ||
        artifact.filename?.toLowerCase().endsWith(".vtt"),
    );
    let cues;
    let timingSource;
    if (captionsReference) {
      const captionsPath = join(directory, `${beat.id}.provider.vtt`);
      await engine.artifactStore.materialize(captionsReference, captionsPath);
      cues = parseVtt(await readFile(captionsPath, "utf8"));
      timingSource = "provider";
    } else if (engine.config.roles.transcription) {
      const transcription = await engine.executeRole(
        "transcription",
        {
          schemaVersion: 1,
          capability: "speech.transcribe",
          input: {
            path: audioPath,
            filename: `${beat.id}${audioExtension}`,
            sha256: audioReference.sha256,
          },
          parameters: { responseFormat: "verbose_json" },
        },
        { signal },
      );
      cues = cuesFromTranscription(transcription.output, duration);
      timingSource = "transcription";
    } else {
      cues = [{ start: 0, end: duration, text: beat.narration }];
      timingSource = "estimated";
    }
    if (!labelSpeakers) {
      cues = cues.map((cue) => ({
        ...cue,
        text: stripRedundantSpeakerLabel(cue.text, beat.captionSpeaker),
      }));
    }
    cues = clampCuesToDuration(
      formatCaptionCues(cues, {
        speaker: labelSpeakers ? beat.captionSpeaker : "",
      }),
      duration,
    );
    return {
      beatId: beat.id,
      audioPath,
      audioSha256: audioReference.sha256,
      duration,
      timingSource,
      cues,
    };
    },
  );
  const beats = [];
  const allCues = [];
  let offset = 0;
  let estimatedTiming = false;
  for (const beat of localBeats) {
    const globalCues = offsetCues(beat.cues, offset);
    beats.push({ ...beat, cues: globalCues });
    allCues.push(...globalCues);
    if (beat.timingSource === "estimated") estimatedTiming = true;
    offset += beat.duration;
  }
  const overridePath = join(root, "review", "captions.vtt");
  const override = await readFile(overridePath, "utf8").catch((error) => {
    if (error.code === "ENOENT") return null;
    throw error;
  });
  let finalCues = allCues;
  let manualOverride = false;
  if (override) {
    const overrideCues = parseVtt(override).map((cue) => ({
      ...cue,
      text: labelSpeakers
        ? cue.text
        : stripRedundantSpeakerLabel(cue.text, singleSpeaker),
    }));
    finalCues = formatCaptionCues(overrideCues, { speaker: "" });
    manualOverride = true;
    estimatedTiming = false;
    if (finalCues.at(-1)?.end > offset + 0.25) {
      throw new Error(
        "Reviewed caption override extends beyond the final narration",
      );
    }
  }
  const captionAudit = auditCaptions(finalCues);
  const captions = {
    schemaVersion: 1,
    estimatedTiming,
    manualOverride,
    durationSeconds: offset,
    cues: finalCues,
    audit: captionAudit,
  };
  await Promise.all([
    atomicWrite(join(directory, "captions.vtt"), cuesToVtt(finalCues)),
    atomicWrite(join(directory, "captions.srt"), cuesToSrt(finalCues)),
    atomicWrite(
      join(directory, "transcript.txt"),
      transcriptText(finalCues),
    ),
    atomicWrite(
      join(directory, "transcript.html"),
      transcriptHtml(finalCues, `${episode.title} transcript`),
    ),
    atomicWriteJson(join(directory, "captions.json"), captions),
  ]);
  return {
    directory,
    beats,
    captions,
    files: {
      vtt: join(directory, "captions.vtt"),
      srt: join(directory, "captions.srt"),
      transcriptText: join(directory, "transcript.txt"),
      transcriptHtml: join(directory, "transcript.html"),
    },
  };
}

export function shouldLabelCaptionSpeakers(beats) {
  return (
    new Set(
      beats
        .map((beat) => String(beat.captionSpeaker || "").trim())
        .filter(Boolean),
    ).size > 1
  );
}

export function stripRedundantSpeakerLabel(text, speaker) {
  const label = String(speaker || "").trim();
  if (!label) return String(text);
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return String(text).replace(new RegExp(`\\b${escaped}\\s*:\\s*`, "gi"), "");
}

function cuesFromTranscription(output, duration) {
  if (output.segments?.length) {
    return output.segments.map((segment) => ({
      start: Number(segment.start),
      end: Number(segment.end),
      text: segment.text,
    }));
  }
  if (output.words?.length) {
    const cues = [];
    let group = [];
    for (const word of output.words) {
      group.push(word);
      const text = word.word || word.text || "";
      if (/[.!?]["']?$/.test(text) || group.length >= 12) {
        cues.push(wordGroupToCue(group));
        group = [];
      }
    }
    if (group.length) cues.push(wordGroupToCue(group));
    return cues;
  }
  return [{ start: 0, end: duration, text: output.text || "" }];
}

function wordGroupToCue(words) {
  return {
    start: Number(words[0].start),
    end: Number(words.at(-1).end),
    text: words
      .map((word) => word.word || word.text || "")
      .join(" ")
      .replace(/\s+([,.;!?])/g, "$1"),
  };
}
