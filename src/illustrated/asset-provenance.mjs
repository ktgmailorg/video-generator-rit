import { createHash } from "node:crypto";

const COMMERCIAL_LICENSES = new Set([
  "CC0", "PUBLIC-DOMAIN", "MIT", "ISC", "APACHE-2.0", "BSD-2-CLAUSE",
  "BSD-3-CLAUSE", "OFL-1.1", "CC-BY-4.0", "CC-BY-SA-4.0",
]);

export function checksumAsset(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

export function validateAssetProvenance(asset, { monetized = true, modified = true } = {}) {
  const blockers = [];
  const warnings = [];
  const license = String(asset.license ?? "").toUpperCase();

  for (const key of ["provider", "sourceUrl", "creator", "license", "checksum", "retrievedAt"]) {
    if (!asset[key]) blockers.push(`Missing provenance field: ${key}`);
  }
  if (!/^[a-f0-9]{64}$/i.test(asset.checksum ?? "")) blockers.push("Invalid SHA-256 checksum");
  if (!COMMERCIAL_LICENSES.has(license)) blockers.push(`License requires review: ${license || "unknown"}`);
  if (monetized && license.includes("NC")) blockers.push("Non-commercial asset cannot enter a monetized release");
  if (modified && license.includes("ND")) blockers.push("No-derivatives asset cannot be modified");
  if (license.startsWith("CC-BY") && !asset.attributionText) {
    blockers.push("Attribution text is required");
  }
  if (license === "CC-BY-SA-4.0" && !asset.shareAlikePackage) {
    warnings.push("ShareAlike derivative package must accompany publication");
  }

  return { ok: blockers.length === 0, blockers, warnings };
}

export function generateCredits(assets) {
  return assets
    .filter((asset) => String(asset.license).toUpperCase().startsWith("CC-BY"))
    .map((asset) => asset.attributionText)
    .filter(Boolean)
    .sort();
}
