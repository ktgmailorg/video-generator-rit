import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  access,
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { spawn } from "node:child_process";
import sharp from "sharp";
import { readStoryboard } from "../src/storyboard.mjs";
import { shotSvg, thumbnailSvg } from "../src/visuals.mjs";

const [command = "all", inputArg = "examples/storyboard.example.md"] =
  process.argv.slice(2);
const inputPath = resolve(inputArg);
const outputRoot = resolve(process.env.VIDEO_OUTPUT || "output/documentary");
const narrationRoot = join(outputRoot, "narration");
const visualRoot = join(outputRoot, "visuals");
const sectionRoot = join(outputRoot, "sections");
const title = process.env.VIDEO_TITLE || "Technical Documentary";
const brand = process.env.VIDEO_BRAND || "VIDEO LAB";
const voice = process.env.VIDEO_VOICE || "en-US-AndrewMultilingualNeural";
const voiceRate = process.env.VIDEO_VOICE_RATE || "+8%";
const voicePitch = process.env.VIDEO_VOICE_PITCH || "-3Hz";
const voiceConcurrency = Math.max(
  1,
  Math.min(8, Number(process.env.VIDEO_VOICE_CONCURRENCY || "4")),
);
const ffmpeg = process.env.VIDEO_FFMPEG || "ffmpeg";
const ffprobe = process.env.VIDEO_FFPROBE || "ffprobe";
const encoderPreset = process.env.VIDEO_ENCODER_PRESET || "veryfast";
const encoderCrf = process.env.VIDEO_ENCODER_CRF || "20";
const renderConcurrency = Math.max(
  1,
  Math.min(4, Number(process.env.VIDEO_RENDER_CONCURRENCY || "2")),
);
const showOnScreenText = process.env.VIDEO_ONSCREEN_TEXT === "true";
const masterName =
  process.env.VIDEO_MASTER_FILENAME || "documentary-master.mp4";

function run(program, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(program, args, {
      stdio: options.capture ? ["ignore", "pipe", "pipe"] : "inherit",
      ...options,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolvePromise({ stdout, stderr });
      else
        reject(
          new Error(
            `${basename(program)} exited with ${code}\n${stderr.slice(-5000)}`,
          ),
        );
    });
  });
}

async function hashFile(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function probeDuration(path) {
  const result = await run(
    ffprobe,
    [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      path,
    ],
    { capture: true },
  );
  return Number(result.stdout.trim());
}

const textHash = (value) =>
  createHash("sha256").update(value).digest("hex");

async function fileExists(path) {
  return stat(path)
    .then(() => true)
    .catch(() => false);
}

async function matchesSidecar(path, hash) {
  if (!(await fileExists(path))) return false;
  return readFile(`${path}.sha256`, "utf8")
    .then((stored) => stored.trim() === hash)
    .catch(() => false);
}

async function writeSidecar(path, hash) {
  await writeFile(`${path}.sha256`, `${hash}\n`);
}

function sentencePool(value) {
  return value
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).length > 3);
}

async function prepare() {
  const sections = await readStoryboard(inputPath);
  await Promise.all(
    [outputRoot, narrationRoot, visualRoot, sectionRoot].map((path) =>
      mkdir(path, { recursive: true }),
    ),
  );
  for (const section of sections) {
    await writeFile(
      join(narrationRoot, `${section.id}.tts.txt`),
      `${section.narration}\n`,
    );
  }
  const episode = {
    schemaVersion: 1,
    title,
    brand,
    input: basename(inputPath),
    sections,
    wordCount: sections.reduce(
      (sum, section) => sum + section.wordCount,
      0,
    ),
    createdAt: new Date().toISOString(),
  };
  await writeFile(
    join(outputRoot, "episode.json"),
    `${JSON.stringify(episode, null, 2)}\n`,
  );
  process.stdout.write(
    `Prepared ${sections.length} beats and ${episode.wordCount} words.\n`,
  );
}

async function loadEpisode() {
  return JSON.parse(await readFile(join(outputRoot, "episode.json"), "utf8"));
}

async function voicePass() {
  const episode = await loadEpisode();
  let cursor = 0;
  const renderBeat = async (section) => {
    const textPath = join(narrationRoot, `${section.id}.tts.txt`);
    const mediaPath = join(narrationRoot, `${section.id}.mp3`);
    const vttPath = join(narrationRoot, `${section.id}.vtt`);
    const manifestPath = join(narrationRoot, `${section.id}.take.json`);
    const manifest = {
      provider: "edge-tts",
      providerVersion: "7.2.8",
      voice,
      rate: voiceRate,
      pitch: voicePitch,
      textSha256: textHash(section.narration),
    };
    try {
      const [media, captions, stored] = await Promise.all([
        stat(mediaPath),
        stat(vttPath),
        readFile(manifestPath, "utf8").then(JSON.parse),
      ]);
      if (
        media.size > 20_000 &&
        captions.size > 100 &&
        JSON.stringify(stored) === JSON.stringify(manifest)
      ) {
        process.stdout.write(`Reusing ${section.id}\n`);
        return;
      }
    } catch {
      // Render a missing or changed take.
    }
    process.stdout.write(`Narrating ${section.id}: ${section.title}\n`);
    await run("uvx", [
      "--from",
      "edge-tts==7.2.8",
      "edge-tts",
      "--file",
      textPath,
      "--voice",
      voice,
      `--rate=${voiceRate}`,
      `--pitch=${voicePitch}`,
      "--write-media",
      mediaPath,
      "--write-subtitles",
      vttPath,
    ]);
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  };
  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= episode.sections.length) return;
      await renderBeat(episode.sections[index]);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(voiceConcurrency, episode.sections.length) },
      worker,
    ),
  );
}

function shotPlan(section, duration) {
  const sentences = sentencePool(section.narration);
  const count = Math.max(
    1,
    Math.min(sentences.length, Math.ceil(duration / 6)),
  );
  return Array.from({ length: count }, (_, index) => ({
    phrase:
      sentences[Math.min(sentences.length - 1, Math.floor((index / count) * sentences.length))] ||
      section.title,
    duration: duration / count,
  }));
}

async function makeVisuals(episode, durations) {
  const contactInputs = [];
  for (const [sectionIndex, section] of episode.sections.entries()) {
    const plan = shotPlan(section, durations[sectionIndex]);
    const directory = join(visualRoot, section.id);
    await mkdir(directory, { recursive: true });
    section.shots = [];
    for (const [shotIndex, shot] of plan.entries()) {
      const path = join(
        directory,
        `shot-${String(shotIndex + 1).padStart(3, "0")}.png`,
      );
      const svg = shotSvg(
        section,
        shotIndex,
        plan.length,
        showOnScreenText ? shot.phrase : section.title,
        { brand },
      );
      const visualHash = textHash(svg);
      if (await matchesSidecar(path, visualHash)) {
        process.stdout.write(`Reusing ${section.id} shot ${shotIndex + 1}\n`);
      } else {
        await sharp(Buffer.from(svg))
          .png({ compressionLevel: 8 })
          .toFile(path);
        await writeSidecar(path, visualHash);
      }
      section.shots.push({ ...shot, path, visualHash });
      if (contactInputs.length < 12 && shotIndex === 0) contactInputs.push(path);
    }
  }
  const thumbnailPath = join(outputRoot, "thumbnail.png");
  const thumbnail = thumbnailSvg({ title, brand });
  const thumbnailHash = textHash(thumbnail);
  if (!(await matchesSidecar(thumbnailPath, thumbnailHash))) {
    await sharp(Buffer.from(thumbnail)).png().toFile(thumbnailPath);
    await writeSidecar(thumbnailPath, thumbnailHash);
  }
  const tiles = await Promise.all(
    contactInputs.map((path) =>
      sharp(path).resize(480, 270).jpeg({ quality: 82 }).toBuffer(),
    ),
  );
  await sharp({
    create: {
      width: 1920,
      height: 810,
      channels: 3,
      background: "#050707",
    },
  })
    .composite(
      tiles.map((input, index) => ({
        input,
        left: (index % 4) * 480,
        top: Math.floor(index / 4) * 270,
      })),
    )
    .jpeg({ quality: 88 })
    .toFile(join(outputRoot, "contact-sheet.jpg"));
}

async function renderSections(episode, durations) {
  const outputs = new Array(episode.sections.length);
  const transitions = ["fade", "smoothleft", "circleopen", "dissolve"];
  const renderSection = async (sectionIndex) => {
    const section = episode.sections[sectionIndex];
    const duration = durations[sectionIndex];
    const output = join(sectionRoot, `${section.id}.mp4`);
    const partialOutput = join(sectionRoot, `${section.id}.partial.mp4`);
    const manifestPath = join(sectionRoot, `${section.id}.render.json`);
    const narrationManifest = await readFile(
      join(narrationRoot, `${section.id}.take.json`),
      "utf8",
    ).catch(() => "");
    const renderSignature = textHash(
      JSON.stringify({
        cacheVersion: "rit-documentary-section/v2",
        sectionId: section.id,
        duration,
        narrationManifest,
        shots: section.shots.map((shot) => ({
          duration: shot.duration,
          visualHash: shot.visualHash,
        })),
        encoderPreset,
        encoderCrf,
      }),
    );
    const storedManifest = await readFile(manifestPath, "utf8")
      .then(JSON.parse)
      .catch(() => null);
    if (
      storedManifest?.renderSignature === renderSignature &&
      (await fileExists(output))
    ) {
      process.stdout.write(`Reusing ${section.id} chapter encode\n`);
      outputs[sectionIndex] = output;
      return;
    }
    const transitionDuration = 0.18;
    const inputs = [];
    for (const shot of section.shots) {
      inputs.push(
        "-loop",
        "1",
        "-framerate",
        "30",
        "-t",
        (shot.duration + transitionDuration).toFixed(3),
        "-i",
        shot.path,
      );
    }
    const audioIndex = section.shots.length;
    inputs.push("-i", join(narrationRoot, `${section.id}.mp3`));
    const filters = section.shots.map(
      (_, index) =>
        `[${index}:v]scale=1920:1080:flags=lanczos,setsar=1,format=yuv420p[v${index}]`,
    );
    let current = "[v0]";
    let offset = section.shots[0].duration;
    for (let index = 1; index < section.shots.length; index += 1) {
      const next = `[blend${index}]`;
      filters.push(
        `${current}[v${index}]xfade=transition=${transitions[(sectionIndex + index) % transitions.length]}:duration=${transitionDuration}:offset=${offset.toFixed(3)}${next}`,
      );
      current = next;
      offset += section.shots[index].duration;
    }
    filters.push(
      `${current}fps=30,fade=t=in:st=0:d=.2,fade=t=out:st=${Math.max(0, duration - 0.2).toFixed(3)}:d=.2,format=yuv420p[video]`,
    );
    filters.push(
      `[${audioIndex}:a]aresample=48000,highpass=f=55,lowpass=f=14000,equalizer=f=180:t=q:w=1:g=.6,deesser=i=.08:m=.3:f=.58,acompressor=threshold=.16:ratio=1.5:attack=20:release=220:makeup=1.05,loudnorm=I=-16:TP=-1.5:LRA=8,alimiter=limit=.88[audio]`,
    );
    process.stdout.write(
      `Rendering ${section.id} (${duration.toFixed(1)}s, ${section.shots.length} shots)\n`,
    );
    await unlink(partialOutput).catch(() => undefined);
    try {
      await run(ffmpeg, [
        "-y",
        "-loglevel",
        "warning",
        ...inputs,
        "-t",
        duration.toFixed(3),
        "-filter_complex",
        filters.join(";"),
        "-map",
        "[video]",
        "-map",
        "[audio]",
        "-c:v",
        "libx264",
        "-preset",
        encoderPreset,
        "-crf",
        encoderCrf,
        "-profile:v",
        "high",
        "-pix_fmt",
        "yuv420p",
        "-r",
        "30",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "48000",
        "-ac",
        "2",
        "-movflags",
        "+faststart",
        "-shortest",
        partialOutput,
      ]);
      await rename(partialOutput, output);
    } catch (error) {
      await unlink(partialOutput).catch(() => undefined);
      throw error;
    }
    await writeFile(
      manifestPath,
      `${JSON.stringify(
        {
          schemaVersion: 1,
          renderSignature,
          output: basename(output),
          durationSeconds: duration,
          completedAt: new Date().toISOString(),
        },
        null,
        2,
      )}\n`,
    );
    outputs[sectionIndex] = output;
  };
  let cursor = 0;
  const worker = async () => {
    while (true) {
      const sectionIndex = cursor++;
      if (sectionIndex >= episode.sections.length) return;
      await renderSection(sectionIndex);
    }
  };
  await Promise.all(
    Array.from(
      { length: Math.min(renderConcurrency, episode.sections.length) },
      worker,
    ),
  );

  const concatPath = join(sectionRoot, "concat.txt");
  await writeFile(
    concatPath,
    `${outputs
      .map((path) => `file '${path.replace(/'/g, "'\\''")}'`)
      .join("\n")}\n`,
  );
  const master = join(outputRoot, masterName);
  await run(ffmpeg, [
    "-y",
    "-loglevel",
    "warning",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatPath,
    "-c",
    "copy",
    "-movflags",
    "+faststart",
    master,
  ]);
  return master;
}

async function renderPass() {
  await Promise.all([access(ffmpeg), access(ffprobe)]).catch(() => undefined);
  const episode = await loadEpisode();
  const durations = await Promise.all(
    episode.sections.map((section) =>
      probeDuration(join(narrationRoot, `${section.id}.mp3`)),
    ),
  );
  await makeVisuals(episode, durations);
  const master = await renderSections(episode, durations);
  const durationSeconds = await probeDuration(master);
  const report = {
    title,
    master: basename(master),
    durationSeconds,
    width: 1920,
    height: 1080,
    frameRate: 30,
    narrationVoice: voice,
    narrationRate: voiceRate,
    captionsBurnedIn: false,
    sha256: await hashFile(master),
    generatedAt: new Date().toISOString(),
  };
  await writeFile(
    join(outputRoot, "production-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await writeFile(
    join(outputRoot, "episode.json"),
    `${JSON.stringify({ ...episode, durations }, null, 2)}\n`,
  );
  process.stdout.write(
    `Complete: ${(durationSeconds / 60).toFixed(2)} minutes at ${master}\n`,
  );
}

if (command === "prepare") await prepare();
else if (command === "voice") await voicePass();
else if (command === "render") await renderPass();
else if (command === "all") {
  await prepare();
  await voicePass();
  await renderPass();
} else {
  throw new Error(`Unknown command: ${command}`);
}
