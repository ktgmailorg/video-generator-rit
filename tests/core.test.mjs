import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ArtifactStore } from "../src/core/artifact-store.mjs";
import { canonicalize, sha256, stableStringify } from "../src/core/canonical.mjs";
import {
  DataPolicyError,
  assertDataRoute,
} from "../src/core/data-policy.mjs";
import {
  approvalDigest,
  verifyApproval,
  writeApproval,
} from "../src/core/approvals.mjs";
import { loadConfig, presetConfig } from "../src/config.mjs";
import { assertSchema } from "../src/core/schema.mjs";
import { ProviderRegistry } from "../src/providers/registry.mjs";

test("canonical hashing is order independent and content sensitive", () => {
  const left = { z: 1, a: { y: 2, x: 3 } };
  const right = { a: { x: 3, y: 2 }, z: 1 };
  assert.equal(stableStringify(left), stableStringify(right));
  assert.equal(sha256(left), sha256(right));
  assert.notEqual(sha256(left), sha256({ ...right, z: 2 }));
  assert.deepEqual(canonicalize({ value: undefined }), {});
});

test("artifact store verifies and materializes content-addressed bytes", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rit-artifacts-"));
  try {
    const store = new ArtifactStore(join(directory, "cache"));
    const reference = await store.putBytes(Buffer.from("fixture"), {
      filename: "fixture.txt",
      mimeType: "text/plain",
    });
    assert.equal(reference.sha256, sha256("fixture"));
    assert.equal((await store.verify(reference)).ok, true);
    const destination = join(directory, "release", "fixture.txt");
    await store.materialize(reference, destination);
    assert.equal(await readFile(destination, "utf8"), "fixture");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("data policy prevents restricted and unapproved internal hosted routes", () => {
  const hosted = { executionLocation: "hosted" };
  assert.equal(
    assertDataRoute({
      classification: "public",
      profileName: "cloud",
      provider: hosted,
    }),
    true,
  );
  assert.throws(
    () =>
      assertDataRoute({
        classification: "restricted",
        profileName: "cloud",
        provider: hosted,
      }),
    DataPolicyError,
  );
  assert.equal(
    assertDataRoute({
      classification: "internal",
      profileName: "cloud",
      provider: hosted,
      hostedConsent: true,
      allowedHostedProviders: ["cloud"],
    }),
    true,
  );
});

test("approvals are bound to exact stage subjects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rit-approvals-"));
  try {
    const subject = { episode: "a", claims: [1, 2] };
    const approval = await writeApproval({
      root: directory,
      stage: "script",
      subject,
      reviewer: "Instructor Example",
      approvedAt: "2026-01-01T00:00:00.000Z",
    });
    assert.equal(approval.subjectSha256, approvalDigest("script", subject));
    assert.equal(
      (await verifyApproval({ root: directory, stage: "script", subject })).ok,
      true,
    );
    assert.equal(
      (
        await verifyApproval({
          root: directory,
          stage: "script",
          subject: { ...subject, claims: [1, 3] },
        })
      ).reason,
      "subject-changed",
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("all built-in presets satisfy the public configuration schema", async () => {
  for (const preset of ["generic", "rit-course", "rit-student", "rit-media"]) {
    await assert.doesNotReject(assertSchema("config", presetConfig(preset)));
  }
});

test("hosted and fully local example configurations are valid", async () => {
  await loadConfig("examples/video.config.hosted.json");
  const { config } = await loadConfig("examples/video.config.local.json");
  const providers = await ProviderRegistry.fromConfig(config).list();
  const comfyUi = providers.find(
    (provider) => provider.profileName === "comfyui-image",
  );
  assert.equal(comfyUi.workflowRevision, "rit-sdxl-image-v1");
  assert.match(comfyUi.workflowSha256, /^[a-f0-9]{64}$/);
  assert.ok(
    providers.every((provider) => provider.executionLocation === "local"),
  );
});
