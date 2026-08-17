import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { episodeFromStoryboard } from "../src/episode.mjs";
import {
  scriptToStoryboard,
  studioScriptLimits,
} from "../studio/script-to-storyboard.mjs";
import {
  generateStudioTranscriptDraft,
  studioTranscriptSchema,
} from "../studio/transcript-generation.mjs";
import {
  LocalStudioPolicyError,
  assertFullyLocalStudioConfig,
  inspectFullyLocalStudioConfig,
} from "../studio/local-policy.mjs";

test("studio converts a pasted script into a valid multi-beat EpisodeSpec", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rit-studio-test-"));
  try {
    const script = [
      "NARRATOR: A cache stores recently used data close to the processor.",
      "A cache hit avoids a slower access to main memory.",
      "Programs often reuse instructions and data over short periods of time.",
      "That locality makes a small, fast cache useful.",
      "A cache miss still requires data to be fetched from a lower level.",
      "Designers balance capacity, latency, associativity, and cost.",
      "The result is a hierarchy rather than one universal memory technology.",
    ]
      .flatMap((sentence) => Array.from({ length: 5 }, () => sentence))
      .join(" ");
    const markdown = scriptToStoryboard({
      title: "How Cache Memory Reduces Access Time",
      script,
      sourceId: "instructor-source",
    });
    assert.match(markdown, /^# How Cache Memory Reduces Access Time/m);
    assert.match(markdown, /\*\*\[CLAIM instructor-source\]\*\*/);
    assert.doesNotMatch(markdown, /NARRATOR:/);
    const path = join(directory, "storyboard.md");
    await writeFile(path, markdown);
    const episode = await episodeFromStoryboard(path, [
      {
        source: {
          id: "instructor-source",
          title: "Instructor notes",
          type: "note",
          uri: "test:notes",
          sha256: "a".repeat(64),
          verified: false,
        },
        content: script,
      },
    ]);
    assert.ok(episode.beats.length >= 2);
    assert.equal(episode.sources.length, 1);
    assert.ok(episode.claims.every((claim) => claim.sourceIds[0] === "instructor-source"));
    assert.ok(
      episode.beats.every(
        (beat) =>
          beat.narration.length > 0 &&
          beat.accessibility.describedInNarration,
      ),
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("studio rejects an empty or oversized script", () => {
  assert.throws(
    () => scriptToStoryboard({ title: "Example", script: " " }),
    /script or transcript is required/i,
  );
  assert.throws(
    () =>
      scriptToStoryboard({
        title: "Example",
        script: "x".repeat(studioScriptLimits.maximumCharacters + 1),
      }),
    /studio limit/i,
  );
});

test("studio requests a source-grounded AI transcript draft", async () => {
  let capturedRequest;
  const engine = {
    async executeRole(role, request) {
      assert.equal(role, "planner");
      capturedRequest = request;
      return {
        output: {
          json: {
            narration:
              "A cache stores recently used information close to the processor. " +
              "When requested information is present, a cache hit can avoid a slower access to main memory. " +
              "This behavior is useful because programs commonly reuse instructions and data over short periods.",
          },
        },
      };
    },
  };
  const generated = await generateStudioTranscriptDraft({
    engine,
    title: "Cache memory",
    topic: "Explain why a cache can reduce average memory access time.",
    sourceTitle: "Instructor notes",
    sourceNotes:
      "A cache is small, fast storage near a processor. A cache hit avoids a slower main-memory access.",
    targetMinutes: 2,
    dataClassification: "restricted",
  });
  assert.match(generated.narration, /cache hit/i);
  assert.equal(capturedRequest.capability, "text.generate");
  assert.equal(capturedRequest.outputSchema, studioTranscriptSchema);
  assert.equal(capturedRequest.dataClassification, "restricted");
  assert.equal(capturedRequest.seed, 0);
  assert.match(capturedRequest.input.instructions, /Use only factual information/i);
  assert.match(capturedRequest.input.instructions, /approximately 260 words/i);
  assert.match(capturedRequest.input.prompt, /Instructor notes/);
  assert.match(capturedRequest.input.prompt, /A cache is small/);
});

test("studio AI transcript generation requires reviewed source notes", async () => {
  await assert.rejects(
    generateStudioTranscriptDraft({
      engine: { executeRole: async () => assert.fail("should not execute") },
      title: "Example",
      topic: "Explain the concept",
      sourceNotes: "",
    }),
    /requires instructor-approved source notes/i,
  );
});

test("studio accepts only local role routes and loopback endpoints", () => {
  const config = {
    providers: {
      planner: {
        adapter: "openai-compatible",
        executionLocation: "local",
        baseUrl: "http://127.0.0.1:8080/v1",
      },
      narration: {
        adapter: "cli-bridge",
        executionLocation: "local",
      },
    },
    roles: {
      planner: { primary: "planner", fallbacks: [] },
      narration: { primary: "narration", fallbacks: [] },
    },
  };
  assert.equal(assertFullyLocalStudioConfig(config).ok, true);
});

test("studio blocks hosted providers and mislabeled remote endpoints", () => {
  const config = {
    providers: {
      planner: {
        adapter: "openai-compatible",
        executionLocation: "local",
        baseUrl: "https://models.example.edu/v1",
      },
      cloud: {
        adapter: "anthropic",
        executionLocation: "hosted",
      },
    },
    roles: {
      planner: { primary: "planner", fallbacks: ["cloud"] },
    },
  };
  const inspection = inspectFullyLocalStudioConfig(config);
  assert.equal(inspection.ok, false);
  assert.match(inspection.errors.join(" "), /non-local/i);
  assert.match(inspection.errors.join(" "), /hosted/i);
  assert.throws(
    () => assertFullyLocalStudioConfig(config),
    LocalStudioPolicyError,
  );
});

test("studio blocks an unused hosted profile before a dynamic role can select it", () => {
  const config = {
    providers: {
      narration: {
        adapter: "cli-bridge",
        executionLocation: "local",
      },
      optionalVoice: {
        adapter: "edge-tts",
        executionLocation: "hosted",
        voicePreset: "male",
      },
    },
    roles: {
      narration: { primary: "narration", fallbacks: [] },
    },
  };
  assert.throws(
    () => assertFullyLocalStudioConfig(config),
    /optionalVoice.*hosted/i,
  );
});

test("a public project may use an allowlisted hosted provider", () => {
  const config = {
    dataPolicy: {
      classification: "public",
      hostedConsent: true,
      allowedHostedProviders: ["edge"],
    },
    providers: {
      edge: { adapter: "edge-tts", executionLocation: "hosted" },
    },
    roles: { narration: { primary: "edge", fallbacks: [] } },
  };
  const inspection = inspectFullyLocalStudioConfig(config);
  assert.equal(inspection.ok, true, inspection.errors.join("; "));
  assert.equal(inspection.mode, "public");
});

test("a public project still blocks a hosted provider it did not declare", () => {
  const config = {
    dataPolicy: {
      classification: "public",
      hostedConsent: true,
      allowedHostedProviders: ["edge"],
    },
    providers: {
      edge: { adapter: "edge-tts", executionLocation: "hosted" },
      // Present but undeclared: a dynamic role must not be able to reach it.
      sneaky: { adapter: "anthropic", executionLocation: "hosted" },
    },
    roles: { narration: { primary: "edge", fallbacks: [] } },
  };
  assert.throws(
    () => assertFullyLocalStudioConfig(config),
    /sneaky.*allowlist|sneaky.*hosted-only/i,
  );
});

test("internal and restricted projects keep the strict local-only gate", () => {
  for (const classification of ["internal", "restricted"]) {
    const config = {
      dataPolicy: {
        classification,
        // Consent and an allowlist must not buy a way around the boundary
        // when the material is not public.
        hostedConsent: true,
        allowedHostedProviders: ["edge"],
      },
      providers: {
        edge: { adapter: "edge-tts", executionLocation: "hosted" },
      },
      roles: { narration: { primary: "edge", fallbacks: [] } },
    };
    assert.throws(
      () => assertFullyLocalStudioConfig(config),
      LocalStudioPolicyError,
      classification,
    );
  }
});

test("a config that omits its classification is treated as sensitive", () => {
  const config = {
    providers: {
      edge: { adapter: "edge-tts", executionLocation: "hosted" },
    },
    roles: { narration: { primary: "edge", fallbacks: [] } },
  };
  const inspection = inspectFullyLocalStudioConfig(config);
  assert.equal(inspection.ok, false);
  assert.equal(inspection.mode, "local-only");
});
