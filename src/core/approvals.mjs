import { mkdir, readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { atomicWriteJson, sha256 } from "./canonical.mjs";

export const APPROVAL_STAGES = Object.freeze(["script", "visuals", "release"]);

export function approvalDigest(stage, subject) {
  if (!APPROVAL_STAGES.includes(stage)) {
    throw new TypeError(`Unknown approval stage: ${stage}`);
  }
  return sha256({ schemaVersion: 1, stage, subject });
}

export async function writeApproval({
  root,
  stage,
  subject,
  reviewer,
  role = "reviewer",
  notes = "",
  approvedAt = new Date().toISOString(),
}) {
  if (!reviewer?.trim()) throw new TypeError("Reviewer is required");
  const directory = resolve(root);
  await mkdir(directory, { recursive: true });
  const approval = {
    schemaVersion: 1,
    stage,
    subjectSha256: approvalDigest(stage, subject),
    reviewer: reviewer.trim(),
    role,
    notes,
    approvedAt,
  };
  await atomicWriteJson(join(directory, `${stage}.approval.json`), approval);
  return approval;
}

export async function readApproval(root, stage) {
  return JSON.parse(
    await readFile(
      join(resolve(root), `${stage}.approval.json`),
      "utf8",
    ),
  );
}

export async function verifyApproval({ root, stage, subject }) {
  try {
    const approval = await readApproval(root, stage);
    const expected = approvalDigest(stage, subject);
    return approval.subjectSha256 === expected
      ? { ok: true, approval }
      : {
          ok: false,
          reason: "subject-changed",
          expected,
          actual: approval.subjectSha256,
          approval,
        };
  } catch (error) {
    if (error.code === "ENOENT") return { ok: false, reason: "missing" };
    throw error;
  }
}

export async function listApprovals(root) {
  const directory = resolve(root);
  const entries = await readdir(directory).catch((error) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  return Promise.all(
    entries
      .filter((entry) => entry.endsWith(".approval.json"))
      .sort()
      .map(async (entry) => ({
        path: join(directory, entry),
        approval: JSON.parse(await readFile(join(directory, entry), "utf8")),
      })),
  );
}
