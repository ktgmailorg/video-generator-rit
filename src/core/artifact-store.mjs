import { copyFile, mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { sha256 } from "./canonical.mjs";

const cleanExtension = (value) => {
  const extension = String(value || "").toLowerCase();
  return /^\.[a-z0-9]{1,10}$/.test(extension) ? extension : "";
};

export class ArtifactStore {
  constructor(root = ".video-cache") {
    this.root = resolve(root);
  }

  pathFor(checksum, extension = "") {
    if (!/^[a-f0-9]{64}$/.test(checksum)) {
      throw new TypeError("Artifact checksum must be a SHA-256 hex digest");
    }
    return join(
      this.root,
      "sha256",
      checksum.slice(0, 2),
      `${checksum}${cleanExtension(extension)}`,
    );
  }

  async putBytes(bytes, metadata = {}) {
    const buffer = Buffer.from(bytes);
    const checksum = sha256(buffer);
    const extension = cleanExtension(
      metadata.extension || extname(metadata.filename || ""),
    );
    const path = this.pathFor(checksum, extension);
    await mkdir(dirname(path), { recursive: true });
    try {
      const existing = await readFile(path);
      if (sha256(existing) !== checksum) {
        throw new Error(`Artifact collision or corruption at ${path}`);
      }
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      const temporary = `${path}.${randomUUID()}.partial`;
      await writeFile(temporary, buffer, { mode: 0o600 });
      await rename(temporary, path).catch(async (renameError) => {
        await unlink(temporary).catch(() => undefined);
        if (renameError.code !== "EEXIST") throw renameError;
      });
    }
    return {
      sha256: checksum,
      size: buffer.length,
      mimeType: metadata.mimeType || "application/octet-stream",
      filename: metadata.filename || basename(path),
      extension,
      path,
    };
  }

  async putFile(path, metadata = {}) {
    return this.putBytes(await readFile(path), {
      filename: basename(path),
      ...metadata,
    });
  }

  async verify(reference) {
    const path =
      reference.path ||
      this.pathFor(reference.sha256, reference.extension || "");
    try {
      const details = await stat(path);
      if (!details.isFile()) return { ok: false, reason: "not-a-file", path };
      const actual = sha256(await readFile(path));
      return actual === reference.sha256
        ? { ok: true, path, size: details.size }
        : {
            ok: false,
            reason: "checksum-mismatch",
            path,
            expected: reference.sha256,
            actual,
          };
    } catch (error) {
      if (error.code === "ENOENT") return { ok: false, reason: "missing", path };
      throw error;
    }
  }

  async materialize(reference, destination) {
    const verification = await this.verify(reference);
    if (!verification.ok) {
      throw new Error(
        `Cannot materialize artifact ${reference.sha256}: ${verification.reason}`,
      );
    }
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(verification.path, destination);
    return { ...reference, path: destination };
  }
}
