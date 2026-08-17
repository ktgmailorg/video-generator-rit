import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
} from "node:fs/promises";
import { basename, join } from "node:path";
import sharp from "sharp";
import { atomicWrite, atomicWriteJson, sha256 } from "../core/canonical.mjs";
import { RIT_VIDEO_TOKENS } from "../course/brand-pack.mjs";
import { orderedMapLimit, pipelineConcurrency } from "./concurrency.mjs";
import { hashFile, probeDuration, runTool } from "./tools.mjs";

const exists = (path) =>
  stat(path)
    .then((details) => details.isFile())
    .catch(() => false);

export async function renderDocumentary({
  config,
  episode,
  narration,
  visuals,
  root,
  signal,
}) {
  const ffmpeg = process.env.VIDEO_FFMPEG || "ffmpeg";
  const ffprobe = process.env.VIDEO_FFPROBE || "ffprobe";
  const directory = join(root, "work", "render");
  const sectionDirectory = join(directory, "sections");
  await mkdir(sectionDirectory, { recursive: true });
  const narrationById = new Map(
    narration.beats.map((beat) => [beat.beatId, beat]),
  );
  const visualById = new Map(
    visuals.beats.map((beat) => [beat.beatId, beat]),
  );
  const sectionReports = await orderedMapLimit(
    episode.beats,
    pipelineConcurrency("VIDEO_RENDER_CONCURRENCY"),
    async (beat) => {
    const narrationBeat = narrationById.get(beat.id);
    const visualBeat = visualById.get(beat.id);
    if (!narrationBeat || !visualBeat) {
      throw new Error(`Missing render inputs for ${beat.id}`);
    }
    return renderSection({
      config,
      beat,
      narrationBeat,
      visualBeat,
      sectionDirectory,
      ffmpeg,
      signal,
    });
    },
  );
  const outputs = sectionReports.map((report) => report.path);
  const concatPath = join(sectionDirectory, "concat.txt");
  await atomicWrite(
    concatPath,
    `${outputs
      .map((path) => `file '${path.replace(/'/g, "'\\''")}'`)
      .join("\n")}\n`,
  );
  const masterPath = join(directory, "documentary-master.core.mp4");
  const partialMaster = join(directory, "documentary-master.partial.mp4");
  const masterManifestPath = join(directory, "documentary-master.render.json");
  const masterSignature = sha256({
    cacheVersion: "rit-course-master/v5",
    sections: sectionReports.map((section) => ({
      beatId: section.beatId,
      sha256: section.sha256,
    })),
  });
  const storedMaster = await readFile(masterManifestPath, "utf8")
    .then(JSON.parse)
    .catch(() => null);
  const masterCacheHit =
    storedMaster?.masterSignature === masterSignature &&
    (await exists(masterPath)) &&
    (await hashFile(masterPath)) === storedMaster.sha256;
  let durationSeconds;
  let masterSha256;
  let audioQuality;
  let audioStartSeconds;
  if (masterCacheHit) {
    durationSeconds = storedMaster.durationSeconds;
    masterSha256 = storedMaster.sha256;
    audioQuality = storedMaster.audioQuality;
    audioStartSeconds = Number.isFinite(storedMaster.audioStartSeconds)
      ? storedMaster.audioStartSeconds
      : await probeAudioStart(masterPath, ffprobe, signal);
  } else {
    await unlink(partialMaster).catch(() => undefined);
    await runTool(
      ffmpeg,
      [
        "-y",
        "-loglevel",
        "warning",
        "-fflags",
        "+genpts",
        "-f",
        "concat",
        "-safe",
        "0",
        "-i",
        concatPath,
        "-map_metadata",
        "-1",
        "-metadata",
        "creation_time=1970-01-01T00:00:00Z",
        "-c:v",
        "copy",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        String(RIT_VIDEO_TOKENS.audioSampleRate),
        "-ac",
        "2",
        "-af",
        `aresample=${RIT_VIDEO_TOKENS.audioSampleRate}:async=1:first_pts=0,loudnorm=I=-16:TP=-1.5:LRA=8,alimiter=limit=.84:level=false`,
        "-avoid_negative_ts",
        "make_zero",
        "-movflags",
        "+faststart",
        partialMaster,
      ],
      { signal },
    );
    await rename(partialMaster, masterPath);
    durationSeconds = await probeDuration(masterPath, ffprobe, signal);
    audioStartSeconds = await probeAudioStart(masterPath, ffprobe, signal);
    masterSha256 = await hashFile(masterPath);
    audioQuality = await probeAudioQuality(masterPath, ffmpeg, signal);
    await atomicWriteJson(masterManifestPath, {
      schemaVersion: 1,
      masterSignature,
      sha256: masterSha256,
      durationSeconds,
      audioQuality,
      audioStartSeconds,
    });
  }
  const skipRedundantDraftEncode =
    process.env.VIDEO_SKIP_DRAFT_REVIEW === "1";
  const draftPath = skipRedundantDraftEncode
    ? masterPath
    : join(directory, "documentary-master.DRAFT.mp4");
  const draft = skipRedundantDraftEncode
    ? { cacheHit: true, sha256: masterSha256, skipped: true }
    : await createDraftReview({
        source: masterPath,
        destination: draftPath,
        sourceSha256: masterSha256,
        ffmpeg,
        frameRate: frameRate(config),
        signal,
      });
  const report = {
    schemaVersion: 1,
    title: episode.title,
    master: basename(masterPath),
    masterPath,
    draftPath,
    sha256: masterSha256,
    durationSeconds,
    width: RIT_VIDEO_TOKENS.width,
    height: RIT_VIDEO_TOKENS.height,
    frameRate: frameRate(config),
    audioSampleRate: RIT_VIDEO_TOKENS.audioSampleRate,
    audioStartSeconds,
    audioQuality,
    encoder: resolveEncoderSettings(config),
    sections: sectionReports,
    cache: {
      sections: sectionReports.filter((section) => section.cacheHit).length,
      sectionCount: sectionReports.length,
      master: masterCacheHit,
      draft: draft.cacheHit,
      draftSkipped: draft.skipped === true,
    },
  };
  await atomicWriteJson(join(directory, "production-report.json"), report);
  return report;
}

async function probeAudioStart(path, ffprobe = "ffprobe", signal) {
  const result = await runTool(
    ffprobe,
    [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=start_time",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ],
    { capture: true, signal },
  );
  const start = Number(result.stdout.trim());
  if (!Number.isFinite(start)) {
    throw new Error(`Could not measure final-master audio start: ${path}`);
  }
  return start;
}

export async function probeAudioQuality(path, ffmpeg = "ffmpeg", signal) {
  const result = await runTool(
    ffmpeg,
    [
      "-hide_banner",
      "-nostats",
      "-i",
      path,
      "-vn",
      "-sn",
      "-dn",
      "-af",
      "loudnorm=I=-16:TP=-1.5:LRA=8:print_format=json",
      "-f",
      "null",
      "-",
    ],
    { capture: true, signal },
  );
  const json = result.stderr.match(/\{\s*"input_i"[\s\S]*?\}/)?.[0];
  if (!json) throw new Error(`Could not measure final-master audio: ${path}`);
  const measurement = JSON.parse(json);
  const integratedLufs = Number(measurement.input_i);
  const truePeakDbtp = Number(measurement.input_tp);
  const loudnessRangeLu = Number(measurement.input_lra);
  return {
    schemaVersion: 1,
    integratedLufs,
    truePeakDbtp,
    loudnessRangeLu,
    targetIntegratedLufs: -16,
    targetTruePeakDbtp: -1.5,
    ok:
      Number.isFinite(integratedLufs) &&
      integratedLufs >= -17 &&
      integratedLufs <= -15 &&
      Number.isFinite(truePeakDbtp) &&
      truePeakDbtp <= -1,
  };
}

async function renderSection({
  config,
  beat,
  narrationBeat,
  visualBeat,
  sectionDirectory,
  ffmpeg,
  signal,
}) {
  const output = join(sectionDirectory, `${beat.id}.mp4`);
  const partial = join(sectionDirectory, `${beat.id}.partial.mp4`);
  const manifestPath = join(sectionDirectory, `${beat.id}.render.json`);
  const renderSignature = sha256({
    cacheVersion: "rit-course-section/v3",
    beatId: beat.id,
    audioSha256: narrationBeat.audioSha256,
    duration: narrationBeat.duration,
    shots: visualBeat.shots.map((shot) => ({
      sha256: shot.sha256,
      duration: shot.duration,
      mimeType: shot.mimeType,
    })),
    frameRate: frameRate(config),
    preset: config.preset,
    encoder: resolveEncoderSettings(config),
  });
  const stored = await readFile(manifestPath, "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (
    stored?.renderSignature === renderSignature &&
    (await exists(output)) &&
    (await hashFile(output)) === stored.sha256
  ) {
    return { ...stored, path: output, cacheHit: true };
  }
  const transitionDuration = Math.min(
    0.18,
    ...visualBeat.shots.map((shot) => shot.duration / 3),
  );
  const inputs = [];
  for (const shot of visualBeat.shots) {
    const mediaDuration = shot.duration + transitionDuration;
    if (shot.mimeType.startsWith("video/")) {
      inputs.push(
        "-stream_loop",
        "-1",
        "-t",
        mediaDuration.toFixed(3),
        "-i",
        shot.path,
      );
    } else {
      inputs.push(
        "-loop",
        "1",
        "-framerate",
        frameRate(config),
        "-t",
        mediaDuration.toFixed(3),
        "-i",
        shot.path,
      );
    }
  }
  const audioIndex = visualBeat.shots.length;
  inputs.push("-i", narrationBeat.audioPath);
  const filters = visualBeat.shots.map((shot, index) =>
    shotVideoFilter({
      config,
      index,
      shot,
      transitionDuration,
    }),
  );
  let current = "[v0]";
  let offset = visualBeat.shots[0].duration;
  for (let index = 1; index < visualBeat.shots.length; index += 1) {
    const next = `[blend${index}]`;
    filters.push(
      `${current}[v${index}]xfade=transition=${transition(config, index)}:duration=${transitionDuration}:offset=${offset.toFixed(3)}${next}`,
    );
    current = next;
    offset += visualBeat.shots[index].duration;
  }
  filters.push(
    `${current}trim=duration=${narrationBeat.duration.toFixed(3)},fade=t=in:st=0:d=0.15,fade=t=out:st=${Math.max(0, narrationBeat.duration - 0.15).toFixed(3)}:d=0.15,format=yuv420p[video]`,
  );
  filters.push(
    `[${audioIndex}:a]aresample=${RIT_VIDEO_TOKENS.audioSampleRate},highpass=f=55,lowpass=f=14000,equalizer=f=180:t=q:w=1:g=.6,deesser=i=.08:m=.3:f=.58,acompressor=threshold=.16:ratio=1.5:attack=20:release=220:makeup=1.05,loudnorm=I=-16:TP=-1.5:LRA=8,alimiter=limit=.88:level=false[audio]`,
  );
  await unlink(partial).catch(() => undefined);
  try {
    await runTool(
      ffmpeg,
      [
        "-y",
        "-loglevel",
        "warning",
        ...inputs,
        "-t",
        narrationBeat.duration.toFixed(3),
        "-filter_complex",
        filters.join(";"),
        "-map",
        "[video]",
        "-map",
        "[audio]",
        "-map_metadata",
        "-1",
        "-metadata",
        "creation_time=1970-01-01T00:00:00Z",
        ...videoEncoderArguments(resolveEncoderSettings(config)),
        "-r",
        frameRate(config),
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        String(RIT_VIDEO_TOKENS.audioSampleRate),
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-shortest",
        partial,
      ],
      { signal },
    );
    await rename(partial, output);
  } catch (error) {
    await unlink(partial).catch(() => undefined);
    throw error;
  }
  const report = {
    schemaVersion: 1,
    beatId: beat.id,
    output: basename(output),
    path: output,
    durationSeconds: narrationBeat.duration,
    renderSignature,
    sha256: await hashFile(output),
    cacheHit: false,
  };
  await atomicWriteJson(manifestPath, report);
  return report;
}

function frameRate(config) {
  return config.preset === "generic" ? "30" : RIT_VIDEO_TOKENS.frameRate;
}

export function shotVideoFilter({
  config,
  index,
  shot,
  transitionDuration,
}) {
  const normalize =
    shot.mimeType?.startsWith("image/")
      ? ""
      : `scale=${RIT_VIDEO_TOKENS.width}:${RIT_VIDEO_TOKENS.height}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${RIT_VIDEO_TOKENS.width}:${RIT_VIDEO_TOKENS.height}:(ow-iw)/2:(oh-ih)/2:color=black,`;
  return `[${index}:v]${normalize}setsar=1,trim=duration=${(shot.duration + transitionDuration).toFixed(3)},setpts=PTS-STARTPTS,fps=${frameRate(config)},format=yuv420p[v${index}]`;
}

function transition(config, index) {
  if (config.preset !== "generic") return index % 2 ? "fade" : "dissolve";
  return ["fade", "smoothleft", "circleopen", "dissolve"][index % 4];
}

export function resolveEncoderSettings(
  _config,
  environment = process.env,
) {
  const mode = environment.VIDEO_ENCODER_MODE || "software";
  if (mode === "videotoolbox") {
    return {
      mode,
      codec: "h264_videotoolbox",
      profile: "high",
      quality: environment.VIDEO_ENCODER_QUALITY || "80",
      realtime: true,
      prioritizeSpeed: false,
    };
  }
  if (mode !== "software") {
    throw new Error(
      `VIDEO_ENCODER_MODE must be software or videotoolbox, received ${mode}`,
    );
  }
  return {
    mode,
    codec: "libx264",
    preset: environment.VIDEO_ENCODER_PRESET || "veryfast",
    crf: environment.VIDEO_ENCODER_CRF || "20",
    threads: "1",
  };
}

function videoEncoderArguments(settings) {
  if (settings.mode === "videotoolbox") {
    return [
      "-c:v",
      settings.codec,
      "-profile:v",
      settings.profile,
      "-q:v",
      settings.quality,
      "-realtime",
      settings.realtime ? "1" : "0",
      "-prio_speed",
      settings.prioritizeSpeed ? "1" : "0",
      "-pix_fmt",
      "yuv420p",
    ];
  }
  return [
    "-c:v",
    settings.codec,
    "-preset",
    settings.preset,
    "-crf",
    settings.crf,
    "-profile:v",
    "high",
    "-pix_fmt",
    "yuv420p",
    "-threads",
    settings.threads,
  ];
}

async function createDraftReview({
  source,
  destination,
  sourceSha256,
  ffmpeg,
  frameRate,
  signal,
}) {
  const partial = `${destination}.partial.mp4`;
  const slatePath = `${destination}.slate.png`;
  const manifestPath = `${destination}.render.json`;
  const renderSignature = sha256({
    cacheVersion: "rit-course-draft/v2",
    sourceSha256,
    frameRate,
    label: "DRAFT — NOT FOR DISTRIBUTION",
    encoder: { codec: "libx264", preset: "veryfast", crf: "20" },
  });
  const cached = await readFile(manifestPath, "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (
    cached?.renderSignature === renderSignature &&
    (await exists(destination)) &&
    (await hashFile(destination)) === cached.sha256
  ) {
    return { cacheHit: true, sha256: cached.sha256 };
  }
  await unlink(partial).catch(() => undefined);
  const slate = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${RIT_VIDEO_TOKENS.width}" height="84" viewBox="0 0 ${RIT_VIDEO_TOKENS.width} 84">
      <rect width="100%" height="100%" fill="#000000" fill-opacity="0.88"/>
      <text x="960" y="55" fill="#ffffff" font-family="Arial, sans-serif" font-size="36" font-weight="700" text-anchor="middle">DRAFT — NOT FOR DISTRIBUTION</text>
    </svg>`,
  );
  await atomicWrite(
    slatePath,
    await sharp(slate)
      .png({ compressionLevel: 9, adaptiveFiltering: false })
      .toBuffer(),
  );
  await runTool(
    ffmpeg,
    [
      "-y",
      "-loglevel",
      "warning",
      "-i",
      source,
      "-loop",
      "1",
      "-i",
      slatePath,
      "-filter_complex",
      "[0:v][1:v]overlay=0:0:eof_action=repeat:shortest=1[video]",
      "-map",
      "[video]",
      "-map",
      "0:a",
      "-map_metadata",
      "-1",
      "-metadata",
      "creation_time=1970-01-01T00:00:00Z",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "20",
      "-r",
      frameRate,
      "-c:a",
      "copy",
      "-movflags",
      "+faststart",
      partial,
    ],
    { signal },
  );
  await rename(partial, destination);
  const outputSha256 = await hashFile(destination);
  await atomicWriteJson(manifestPath, {
    schemaVersion: 1,
    renderSignature,
    sha256: outputSha256,
  });
  return { cacheHit: false, sha256: outputSha256 };
}
