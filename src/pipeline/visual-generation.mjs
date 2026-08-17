import { mkdir, readFile, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import sharp from "sharp";
import { atomicWrite, atomicWriteJson, sha256 } from "../core/canonical.mjs";
import { RIT_VIDEO_TOKENS } from "../course/brand-pack.mjs";
import {
  courseShotSvg,
  courseThumbnailSvg,
  resolveCourseVisualTemplate,
} from "../visuals.mjs";
import { orderedMapLimit, pipelineConcurrency } from "./concurrency.mjs";
import { hashFile } from "./tools.mjs";

const imageMime = (mimeType) => String(mimeType).startsWith("image/");
const videoMime = (mimeType) => String(mimeType).startsWith("video/");
// These PNGs are lossless render inputs. Level 4 decodes to the exact same
// pixels as level 9 while avoiding level 9's disproportionate CPU cost.
const LOSSLESS_PNG_OPTIONS = { compressionLevel: 4 };

export async function generateVisualAssets({
  config,
  episode,
  visualPlan,
  narration,
  engine,
  root,
  brandPack,
  signal,
}) {
  const directory = join(root, "work", "visuals");
  await mkdir(directory, { recursive: true });
  const manifestPath = join(directory, "visual-assets.json");
  const inputSignature = sha256({
    cacheVersion: "rit-course-visuals/v7-mis-decision-scenes",
    preset: config.preset,
    episode,
    visualPlan,
    narration: narration.beats.map((beat) => ({
      beatId: beat.beatId,
      duration: beat.duration,
    })),
    brandPack,
  });
  const cached = await readFile(manifestPath, "utf8")
    .then(JSON.parse)
    .catch(() => null);
  if (
    cached?.inputSignature === inputSignature &&
    cached?.thumbnailSha256 &&
    (await visualManifestIsValid(cached))
  ) {
    return { ...cached, cacheHit: true };
  }
  const beatById = new Map(episode.beats.map((beat, index) => [beat.id, { beat, index }]));
  const narrationById = new Map(
    narration.beats.map((beat) => [beat.beatId, beat]),
  );
  const beats = await orderedMapLimit(
    visualPlan.beats,
    pipelineConcurrency("VIDEO_VISUAL_CONCURRENCY", {
      defaultValue: 3,
      maximum: 8,
    }),
    async (beatPlan) => {
    const located = beatById.get(beatPlan.beatId);
    if (!located) throw new Error(`Visual plan references missing beat ${beatPlan.beatId}`);
    const duration = narrationById.get(beatPlan.beatId)?.duration;
    if (!duration) throw new Error(`No narration duration for ${beatPlan.beatId}`);
    const shotDuration = duration / beatPlan.shots.length;
    const beatDirectory = join(directory, beatPlan.beatId);
    await mkdir(beatDirectory, { recursive: true });
    const shots = [];
    for (const [shotIndex, shot] of beatPlan.shots.entries()) {
      if (shot.type === "deterministic-svg") {
        const section = {
          ...located.beat,
          index: located.index,
          totalSections: episode.beats.length,
        };
        const svg = courseShotSvg(
          section,
          shotIndex,
          beatPlan.shots.length,
          shot.phrase,
          {
            brand: brandLabel(config),
            ...(config.preset === "generic"
              ? {}
              : {
                  palette: [
                    RIT_VIDEO_TOKENS.orange,
                    RIT_VIDEO_TOKENS.grayLight,
                  ],
                }),
          },
        );
        const path = join(beatDirectory, `${shot.id}.png`);
        await sharp(Buffer.from(svg))
          .resize(1920, 1080, { fit: "fill" })
          .png(LOSSLESS_PNG_OPTIONS)
          .toFile(path);
        await applyApprovedLogo(path, brandPack, "shot");
        const reference = await engine.artifactStore.putFile(path, {
          filename: `${shot.id}.png`,
          mimeType: "image/png",
        });
        shots.push({
          ...shot,
          duration: shotDuration,
          path,
          mimeType: "image/png",
          sha256: reference.sha256,
          source: "deterministic-svg",
          visualTemplate:
            resolveCourseVisualTemplate(section) || "course-cards",
        });
        continue;
      }
      const roleName =
        shot.capability === "video.generate" ? "video" : "image";
      const result = await engine.executeRole(
        roleName,
        {
          schemaVersion: 1,
          capability: shot.capability,
          input: { prompt: shot.prompt },
          parameters: shot.parameters || {},
          seed: Number.parseInt(sha256({ visualPlan, shot: shot.id }).slice(0, 8), 16),
          expectedOutput: {
            mimeTypes:
              shot.capability === "video.generate"
                ? [
                    "video/mp4",
                    "video/webm",
                    "image/gif",
                    "image/webp",
                    "image/png",
                    "image/jpeg",
                  ]
                : ["image/png", "image/jpeg", "image/webp"],
            maximumBytes:
              shot.capability === "video.generate"
                ? 2_000_000_000
                : 100_000_000,
          },
        },
        { signal },
      );
      const mediaReference = result.artifacts.find((artifact) =>
        shot.capability === "video.generate"
          ? videoMime(artifact.mimeType)
          : imageMime(artifact.mimeType),
      );
      if (!mediaReference) {
        throw new Error(`Provider returned no usable media for ${shot.id}`);
      }
      const extension =
        mediaReference.extension ||
        extname(mediaReference.filename || "") ||
        (shot.capability === "video.generate" ? ".mp4" : ".png");
      const originalPath = join(beatDirectory, `${shot.id}.original${extension}`);
      await engine.artifactStore.materialize(mediaReference, originalPath);
      let path = originalPath;
      let mimeType = mediaReference.mimeType;
      if (imageMime(mediaReference.mimeType)) {
        path = join(beatDirectory, `${shot.id}.png`);
        await sharp(originalPath)
          .resize(1920, 1080, {
            fit: "contain",
            background: RIT_VIDEO_TOKENS.black,
            withoutEnlargement: false,
          })
          .png(LOSSLESS_PNG_OPTIONS)
          .toFile(path);
        await applyApprovedLogo(path, brandPack, "shot");
        mimeType = "image/png";
      }
      const normalizedReference = await engine.artifactStore.putFile(path, {
        filename: `${shot.id}${extname(path)}`,
        mimeType,
      });
      shots.push({
        ...shot,
        duration: shotDuration,
        path,
        mimeType,
        sha256: normalizedReference.sha256,
        source: roleName,
        visualTemplate: "provider-generated",
        providerRequestSha256: result.requestSha256,
      });
    }
    return { beatId: beatPlan.beatId, duration, shots };
    },
  );
  const thumbnailPath = join(directory, "thumbnail.png");
  await sharp(
    Buffer.from(
      courseThumbnailSvg({
        title: episode.title,
        brand: brandLabel(config),
        ...(config.preset === "generic"
          ? {}
          : {
              accent: RIT_VIDEO_TOKENS.orange,
              secondary: RIT_VIDEO_TOKENS.grayLight,
            }),
      }),
    ),
  )
    .png(LOSSLESS_PNG_OPTIONS)
    .toFile(thumbnailPath);
  await applyApprovedLogo(thumbnailPath, brandPack, "thumbnail");
  const manifest = {
    schemaVersion: 1,
    episodeId: episode.id,
    inputSignature,
    cacheHit: false,
    beats,
    thumbnailPath,
    thumbnailSha256: await hashFile(thumbnailPath),
  };
  await atomicWriteJson(manifestPath, manifest);
  return manifest;
}

async function visualManifestIsValid(manifest) {
  const files = [
    { path: manifest.thumbnailPath, sha256: manifest.thumbnailSha256 },
    ...(manifest.beats || []).flatMap((beat) =>
      (beat.shots || []).map((shot) => ({
        path: shot.path,
        sha256: shot.sha256,
      })),
    ),
  ];
  for (const file of files) {
    const details = await stat(file.path).catch(() => null);
    if (!details?.isFile() || details.size === 0) return false;
    if (file.sha256 && (await hashFile(file.path)) !== file.sha256) return false;
  }
  return true;
}

function brandLabel(config) {
  if (config.preset === "generic") {
    return process.env.VIDEO_BRAND || "VIDEO LAB";
  }
  if (config.preset === "rit-student") return "STUDENT PROJECT";
  if (config.preset === "rit-course") return "RIT COURSE DRAFT";
  return "RIT COURSE MEDIA";
}

async function applyApprovedLogo(path, brandPack, target) {
  const logo = brandPack?.assets.find(
    (asset) =>
      asset.role === "logo" &&
      (!asset.applyTo ||
        asset.applyTo.includes("all") ||
        asset.applyTo.includes(target)),
  );
  if (!logo) return;
  const canvas = await sharp(path).metadata();
  const rendered = await sharp(logo.path)
    .resize({
      width: logo.maximumWidth || 220,
      height: logo.maximumHeight || 100,
      fit: "inside",
      withoutEnlargement: true,
    })
    .png()
    .toBuffer({ resolveWithObject: true });
  const margin = Math.max(32, logo.clearSpace || 56);
  const output = await sharp(path)
    .composite([
      {
        input: rendered.data,
        top: margin,
        left: canvas.width - rendered.info.width - margin,
      },
    ])
    .png(LOSSLESS_PNG_OPTIONS)
    .toBuffer();
  await atomicWrite(path, output);
}
