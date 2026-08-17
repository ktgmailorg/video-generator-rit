import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { sha256 } from "../core/canonical.mjs";

export const RIT_VIDEO_TOKENS = Object.freeze({
  orange: "#F76902",
  white: "#FFFFFF",
  black: "#000000",
  grayLight: "#D0D3D4",
  grayMedium: "#7C878E",
  fontSans: "Arial",
  fontSerif: "Georgia",
  width: 1920,
  height: 1080,
  frameRate: "30000/1001",
  audioSampleRate: 48_000,
});

export async function loadBrandPack(path) {
  if (!path) return null;
  const resolved = resolve(path);
  const pack = JSON.parse(await readFile(resolved, "utf8"));
  for (const key of [
    "schemaVersion",
    "id",
    "version",
    "approvedBy",
    "usageScope",
    "provenance",
    "assets",
  ]) {
    if (pack[key] === undefined) {
      throw new TypeError(`Brand pack is missing ${key}`);
    }
  }
  if (
    pack.schemaVersion !== 1 ||
    !Array.isArray(pack.assets) ||
    !Array.isArray(pack.usageScope) ||
    typeof pack.provenance !== "object"
  ) {
    throw new TypeError("Unsupported brand pack schema");
  }
  const assets = [];
  for (const asset of pack.assets) {
    if (
      !asset.role ||
      !asset.path ||
      !/^[a-f0-9]{64}$/.test(asset.sha256 || "") ||
      !Array.isArray(asset.usageScope) ||
      !asset.provenance
    ) {
      throw new TypeError(
        "Brand assets require role, path, SHA-256, usageScope, and provenance",
      );
    }
    const assetPath = resolve(dirname(resolved), asset.path);
    const bytes = await readFile(assetPath);
    const actual = sha256(bytes);
    if (actual !== asset.sha256) {
      throw new Error(
        `Brand asset checksum mismatch for ${asset.path}: expected ${asset.sha256}, received ${actual}`,
      );
    }
    assets.push({ ...asset, path: assetPath });
  }
  return { ...pack, path: resolved, assets };
}

export function brandPackReleaseAudit(pack, preset) {
  const blockers = [];
  const warnings = [];
  if (preset === "rit-media" && !pack) {
    blockers.push("RIT media releases require an approved external brand pack");
  }
  if (pack && !pack.approvedBy?.trim()) {
    blockers.push("Brand pack approval is missing");
  }
  if (
    pack &&
    !pack.usageScope.some((scope) =>
      ["rit-media", "official-release"].includes(scope),
    )
  ) {
    blockers.push("Brand pack usageScope does not permit official releases");
  }
  if (pack && !(pack.assets || []).some((asset) => asset.role === "logo")) {
    warnings.push("Brand pack contains no logo asset");
  }
  return { ok: blockers.length === 0, blockers, warnings };
}
