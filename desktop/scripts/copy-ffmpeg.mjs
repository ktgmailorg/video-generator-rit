// electron-builder beforePack hook: stage the ffmpeg-static / ffprobe-static
// binaries for the current build platform into desktop-bin/ so extraResources
// can ship them outside the app package.
import { copyFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const desktopRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export default async function copyFfmpeg() {
  const suffix = process.platform === "win32" ? ".exe" : "";
  const destination = join(desktopRoot, "desktop-bin");
  await mkdir(destination, { recursive: true });
  const ffmpegPath = require("ffmpeg-static");
  const ffprobePath = require("ffprobe-static").path;
  for (const [name, source] of [
    ["ffmpeg", ffmpegPath],
    ["ffprobe", ffprobePath],
  ]) {
    if (!source || !existsSync(source)) {
      throw new Error(`${name} static binary not found at ${source}`);
    }
    await copyFile(source, join(destination, `${name}${suffix}`));
  }
  console.log(`Staged ffmpeg + ffprobe into ${destination}`);
}
