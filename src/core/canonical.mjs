import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export function canonicalize(value) {
  if (value === undefined) return null;
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new TypeError("Canonical JSON cannot contain non-finite numbers");
    }
    return value;
  }
  if (Buffer.isBuffer(value) || value instanceof Uint8Array) {
    return { $bytesBase64: Buffer.from(value).toString("base64") };
  }
  if (Array.isArray(value)) return value.map(canonicalize);
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .filter((key) => value[key] !== undefined)
      .map((key) => [key, canonicalize(value[key])]),
  );
}

export function stableStringify(value, space = 0) {
  return JSON.stringify(canonicalize(value), null, space);
}

export function sha256(value) {
  const bytes =
    typeof value === "string" || Buffer.isBuffer(value)
      ? value
      : stableStringify(value);
  return createHash("sha256").update(bytes).digest("hex");
}

export async function atomicWrite(path, bytes, options = {}) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = join(
    dirname(path),
    `.${randomUUID()}.${path.split("/").at(-1)}.partial`,
  );
  try {
    await writeFile(temporary, bytes, options);
    await rename(temporary, path);
  } catch (error) {
    const { unlink } = await import("node:fs/promises");
    await unlink(temporary).catch(() => undefined);
    throw error;
  }
}

export async function atomicWriteJson(path, value, options = {}) {
  await atomicWrite(path, `${stableStringify(value, 2)}\n`, options);
}
