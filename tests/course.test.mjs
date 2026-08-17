import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  auditCaptions,
  clampCuesToDuration,
  cuesToSrt,
  cuesToVtt,
  formatCaptionCues,
  parseVtt,
} from "../src/accessibility/captions.mjs";
import { episodeFromStoryboard, episodeFromTopic } from "../src/episode.mjs";
import { readStoryboard } from "../src/storyboard.mjs";
import {
  assertSourceBoundClaims,
  auditGrounding,
  claimGroundingReport,
  pruneUnsupportedClaimSources,
} from "../src/grounding/audit.mjs";
import { ingestSourcePack } from "../src/grounding/source-pack.mjs";
import { presetConfig } from "../src/config.mjs";
import {
  compileVisualPlan,
  writePlanArtifacts,
} from "../src/pipeline/planning.mjs";
import {
  resolveEncoderSettings,
  shotVideoFilter,
} from "../src/pipeline/render.mjs";
import { releaseApprovalSubject } from "../src/course/subjects.mjs";
import { categoryForCatalogCourse } from "../src/course/catalog-category.mjs";
import {
  courseShotSvg,
  courseThumbnailSvg,
  resolveCourseVisualTemplate,
} from "../src/visuals.mjs";
import {
  shouldLabelCaptionSpeakers,
  stripRedundantSpeakerLabel,
} from "../src/pipeline/narration.mjs";
import { auditCourseEpisode } from "../src/course/quality.mjs";
import { webPreviewBudget } from "../src/course/web-preview.mjs";
import { authoredGenerationProvenance } from "../scripts/course-generation-provenance.mjs";

test("authored lessons expose honest generation provenance", () => {
  const provenance = authoredGenerationProvenance({
    providers: {
      narration: {
        adapter: "edge-tts",
        executionLocation: "hosted",
        model: "edge-tts-7.2.8",
        voice: "en-US-AndrewMultilingualNeural",
      },
    },
    roles: { narration: { primary: "narration" } },
  });
  assert.deepEqual(
    provenance.map(({ provider, model }) => ({ provider, model })),
    [
      {
        provider: "instructor-or-pilot-team-authored",
        model: "No generative model",
      },
      {
        provider: "edge-tts",
        model: "edge-tts-7.2.8 / en-US-AndrewMultilingualNeural",
      },
      {
        provider: "deterministic-svg-runtime",
        model: "No generative model",
      },
    ],
  );
});

test("web previews reject destructive compression and preserve a useful bitrate", () => {
  assert.throws(
    () => webPreviewBudget({ durationSeconds: 600, maximumBytes: 85_000_000 }),
    /unacceptable/,
  );
  const budget = webPreviewBudget({
    durationSeconds: 600,
    maximumBytes: 105_000_000,
  });
  assert.ok(budget.videoKbps >= 1100);
  assert.ok(budget.minimumBytes > 90_000_000);
});

test("catalog categories follow course titles instead of incidental description terms", () => {
  const examples = [
    ["Introduction to Big Data", "networks and distributed storage", "analytics"],
    [
      "Advanced Object-Oriented Programming Concepts",
      "distributed and concurrent programming",
      "oop",
    ],
    [
      "Foundations of Computer Networks",
      "network security and research",
      "networks",
    ],
    [
      "Foundations of Parallel Computing",
      "parallel architectures and network topologies",
      "parallel",
    ],
    [
      "Scientific Visualization",
      "distributed file systems and computing",
      "graphics",
    ],
    ["Global Illumination", "light transport and rendering", "graphics"],
    [
      "Fundamentals of Cloud Computing",
      "security, privacy, data processing, and networks",
      "cloud",
    ],
    [
      "Compiler Construction",
      "code generation for computer architectures",
      "compiler",
    ],
  ];
  for (const [title, description, expected] of examples) {
    assert.equal(
      categoryForCatalogCourse({ title, description }),
      expected,
      title,
    );
  }
});

test("storyboards migrate to EpisodeSpec v2 with source-bound claims", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rit-episode-"));
  try {
    const sourcePath = join(directory, "source.txt");
    const storyboardPath = join(directory, "storyboard.md");
    await writeFile(sourcePath, "A reviewed explanation of deterministic systems.");
    await writeFile(
      storyboardPath,
      `# Deterministic Systems

## 0:00 - 0:20 — Repeatable inputs

**[VISUAL]** A stable input maps to a stable output.
**[CLAIM source]** A deterministic function returns the same output for the same input.

**[VOICEOVER]**

A deterministic function returns the same output when its inputs do not change.

**Delivery:** Clear and direct.
`,
    );
    const entries = await ingestSourcePack([sourcePath]);
    entries[0].source.verified = true;
    const episode = await episodeFromStoryboard(storyboardPath, entries);
    assert.equal(episode.schemaVersion, 2);
    assert.equal(episode.claims[0].sourceIds[0], "source");
    episode.claims[0].verified = true;
    assert.equal(
      auditGrounding(episode, {
        groundingMode: "source-pack",
        requireVerified: true,
      }).ok,
      true,
    );
    assert.equal(compileVisualPlan(episode).beats[0].shots[0].type, "deterministic-svg");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("storyboard import removes spoken production labels and visual directions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rit-storyboard-clean-"));
  try {
    const storyboardPath = join(directory, "storyboard.md");
    await writeFile(
      storyboardPath,
      [
        "# Cache locality",
        "",
        "## 0:00 - 0:30 — Locality",
        "",
        "**[VISUAL]** Show a labeled cache hierarchy.",
        "",
        "**[VOICEOVER]**",
        "",
        "NARRATOR: A cache keeps recently used data near the processor. On screen, show a labeled cache hierarchy. Temporal locality means recently accessed data is likely to be accessed again.",
        "",
        "**Delivery:** Clear and direct.",
      ].join("\n"),
    );
    const sections = await readStoryboard(storyboardPath);
    assert.equal(
      sections[0].narration,
      "A cache keeps recently used data near the processor. Temporal locality means recently accessed data is likely to be accessed again.",
    );
    assert.doesNotMatch(sections[0].narration, /narrator|on screen/i);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("full topic planning requests ten substantial source-grounded beats", async () => {
  let request;
  const engine = {
    config: { roles: {} },
    async executeRole(_role, value) {
      request = value;
      throw new Error("captured");
    },
  };
  await assert.rejects(
    episodeFromTopic({
      topic: "A complete systems lesson",
      sourceEntries: [
        {
          source: {
            id: "reviewed-source",
            title: "Reviewed source",
            type: "note",
            uri: "local",
            sha256: "a".repeat(64),
            verified: true,
          },
          content: "Reviewed source material for the requested lesson.",
        },
      ],
      engine,
      dataClassification: "public",
      lessonProfile: "full-lesson",
    }),
    /captured/,
  );
  assert.equal(request.outputSchema.properties.beats.minItems, 10);
  assert.equal(request.outputSchema.properties.beats.maxItems, 10);
  assert.equal(
    request.outputSchema.properties.beats.items.properties.narration.minLength,
    650,
  );
  assert.equal(request.seed, 27);
  assert.match(request.input.instructions, /100 to 125 narration words/);
  assert.match(request.input.instructions, /complete sentence under 180 characters/);
  assert.match(request.input.instructions, /distinct factual claim/);
});

test("fast full-lesson planning expands compact source-bound blueprints", async () => {
  let request;
  const engine = {
    config: { roles: {} },
    async executeRole(_role, value) {
      request = value;
      return {
        requestSha256: "c".repeat(64),
        modelRevision: "fast-test-model",
        output: {
          json: {
            title: "Fast systems lesson",
            learningObjectives: [
              "Explain the system",
              "Trace an example",
              "Evaluate a design",
            ],
            beats: Array.from({ length: 10 }, (_, index) => ({
              title: `Concept ${index + 1}`,
              claim:
                "A deterministic system connects explicit state transitions to observable results.",
              example:
                "a small input moving through a sequence of named states while its output is checked",
              visualDirection:
                "a labeled state diagram with arrows connecting the input, transformation, and result",
              sourceIds: ["reviewed-source"],
            })),
          },
        },
      };
    },
  };
  const { episode } = await episodeFromTopic({
    topic: "A fast systems lesson",
    sourceEntries: [
      {
        source: {
          id: "reviewed-source",
          title: "Reviewed source",
          type: "note",
          uri: "local",
          sha256: "a".repeat(64),
          verified: true,
          excerpt:
            "A deterministic system connects explicit state transitions to observable results.",
        },
        content:
          "A deterministic system connects explicit state transitions to observable results.",
      },
    ],
    engine,
    dataClassification: "public",
    lessonProfile: "fast-full-lesson",
  });
  assert.equal(request.outputSchema.properties.claims, undefined);
  assert.equal(request.outputSchema.properties.beats.maxItems, 10);
  assert.deepEqual(
    request.outputSchema.properties.beats.items.properties.sourceIds.items.enum,
    ["reviewed-source"],
  );
  assert.equal(episode.beats.length, 10);
  assert.equal(episode.claims.length, 10);
  assert.ok(
    episode.beats.every(
      (beat) => beat.narration.split(/\s+/).filter(Boolean).length >= 90,
    ),
  );
  assert.ok(episode.beats.every((beat) => !/\bon screen\b/i.test(beat.narration)));
  assert.ok(
    episode.beats.every((beat) => /diagram/i.test(beat.visualDirection)),
  );
  assert.equal(
    new Set(episode.beats.map((beat) => beat.narration)).size,
    episode.beats.length,
  );
});

test("single-speaker captions omit redundant narrator labels", () => {
  assert.equal(
    shouldLabelCaptionSpeakers([
      { captionSpeaker: "NARRATOR" },
      { captionSpeaker: "NARRATOR" },
    ]),
    false,
  );
  assert.equal(
    shouldLabelCaptionSpeakers([
      { captionSpeaker: "INSTRUCTOR" },
      { captionSpeaker: "STUDENT" },
    ]),
    true,
  );
  const [cue] = formatCaptionCues(
    [{ start: 0, end: 2, text: "A cache stores recent data." }],
    { speaker: "" },
  );
  assert.equal(cue.text, "A cache stores recent data.");
  assert.equal(
    stripRedundantSpeakerLabel(
      "NARRATOR: A cache stores recent data. NARRATOR: It reduces latency.",
      "NARRATOR",
    ),
    "A cache stores recent data. It reduces latency.",
  );
  assert.equal(
    stripRedundantSpeakerLabel("STUDENT: Why?", "NARRATOR"),
    "STUDENT: Why?",
  );
});

test("course QA blocks spoken production directions", async () => {
  const config = presetConfig("rit-course");
  config.workflow.groundingMode = "open";
  const report = await auditCourseEpisode({
    config,
    brandPack: null,
    episode: {
      sources: [],
      claims: [],
      beats: [
        {
          id: "beat-01",
          title: "Cache",
          narration:
            "A cache stores recent data. On screen, show a cache hierarchy.",
          visualDirection: "Show a cache hierarchy.",
          delivery: "Clear.",
          plannedSeconds: 12,
          claimIds: [],
          assetRequests: [],
          accessibility: {
            describedInNarration: true,
            audioDescriptionCue: null,
          },
        },
      ],
    },
    release: false,
  });
  assert.equal(report.ok, false);
  assert.match(report.blockers.join(" "), /production direction/i);
});

test("course QA blocks spoken single-speaker production labels", async () => {
  const config = presetConfig("rit-course");
  config.workflow.groundingMode = "open";
  const report = await auditCourseEpisode({
    config,
    brandPack: null,
    episode: {
      sources: [],
      claims: [],
      beats: [
        {
          id: "beat-01",
          title: "Cache",
          narration: "NARRATOR: A cache stores recently used data.",
          visualDirection: "Show a labeled cache hierarchy.",
          delivery: "Clear.",
          plannedSeconds: 12,
          claimIds: [],
          assetRequests: [],
          accessibility: {
            describedInNarration: true,
            audioDescriptionCue: null,
          },
        },
      ],
    },
    release: false,
  });
  assert.equal(report.ok, false);
  assert.match(report.blockers.join(" "), /speaker label/i);
});

test("fast full-lesson planning replaces truncated compact fields", async () => {
  const engine = {
    config: { roles: {} },
    async executeRole() {
      return {
        requestSha256: "d".repeat(64),
        modelRevision: "fast-test-model",
        output: {
          json: {
            title: "Reliable compact expansion",
            learningObjectives: ["Explain", "Apply", "Evaluate"],
            beats: Array.from({ length: 10 }, (_, index) => ({
              title: `Concept ${index + 1}`,
              claim:
                "A deterministic system connects explicit state transitions to observable results.",
              example:
                index === 1
                  ? "A compact model response that ends in an unfinished fragm"
                  : "A learner traces explicit state transitions and checks the observable result.",
              visualDirection:
                index === 2
                  ? "A diagram cut off before its final lab"
                  : "A labeled state diagram connects the input, transformation, and checked result.",
              sourceIds: ["reviewed-source"],
            })),
          },
        },
      };
    },
  };
  const { episode } = await episodeFromTopic({
    topic: "A reliable compact lesson",
    sourceEntries: [
      {
        source: {
          id: "reviewed-source",
          title: "Reviewed source",
          type: "note",
          uri: "local",
          sha256: "a".repeat(64),
          verified: true,
          excerpt:
            "A deterministic system connects explicit state transitions to observable results.",
        },
        content:
          "A deterministic system connects explicit state transitions to observable results.",
      },
    ],
    engine,
    dataClassification: "public",
    lessonProfile: "fast-full-lesson",
  });
  assert.doesNotMatch(episode.beats[1].narration, /unfinished fragm/);
  assert.match(
    episode.beats[1].narration,
    /maps the inputs, constraints, and observable result/,
  );
  assert.doesNotMatch(episode.beats[2].visualDirection, /final lab/);
  assert.match(episode.beats[2].visualDirection, /editable process diagram/);
});

test("fast full-lesson planning replaces unsupported embellishment with source text", async () => {
  const terms = [
    "alpha",
    "bravo",
    "charlie",
    "delta",
    "echo",
    "foxtrot",
    "golf",
    "hotel",
    "india",
    "juliet",
  ];
  const sourceSentences = terms.map(
    (term) =>
      `${term} analysis records explicit evidence and observable results.`,
  );
  const engine = {
    config: { roles: {} },
    async executeRole() {
      return {
        requestSha256: "e".repeat(64),
        modelRevision: "fast-test-model",
        output: {
          json: {
            title: "Strict source support",
            learningObjectives: ["Explain", "Apply", "Evaluate"],
            beats: Array.from({ length: 10 }, (_, index) => ({
              title: `Concept ${index + 1}`,
              claim: `${terms[index]} analysis always guarantees unrelated financial safety and medical reliability.`,
              example:
                "A learner compares two typed variables and records the observable result.",
              visualDirection:
                "A comparison diagram labels the two variables and their observable results.",
              sourceIds: ["reviewed-source"],
            })),
          },
        },
      };
    },
  };
  const { episode } = await episodeFromTopic({
    topic: "Strict source support",
    sourceEntries: [
      {
        source: {
          id: "reviewed-source",
          title: "Reviewed source",
          type: "note",
          uri: "local",
          sha256: "a".repeat(64),
          verified: true,
          excerpt: sourceSentences.join(" "),
        },
        content: sourceSentences.join(" "),
      },
    ],
    engine,
    dataClassification: "public",
    lessonProfile: "fast-full-lesson",
  });
  assert.deepEqual(
    episode.claims.map((claim) => claim.text),
    sourceSentences,
  );
  assert.ok(
    episode.beats.every(
      (beat) => !beat.narration.includes("guarantees unrelated"),
    ),
  );
});

test("source grounding rejects citations that do not support a claim", () => {
  const sources = [
    {
      id: "riscv",
      title: "RISC-V ISA",
      content:
        "The RISC-V instruction set defines registers, memory operations, control transfer, exceptions, and ordering behavior.",
    },
    {
      id: "xv6",
      title: "xv6",
      content:
        "The xv6 book explains processes, system calls, page tables, scheduling, locking, and file systems.",
    },
  ];
  const supported = {
    id: "claim-001",
    text: "RISC-V defines registers and memory operations.",
    sourceIds: ["riscv"],
  };
  const unsupported = {
    id: "claim-002",
    text: "Digital logic gates implement Boolean truth tables.",
    sourceIds: ["xv6"],
  };
  assertSourceBoundClaims([supported], sources);
  assert.throws(
    () => assertSourceBoundClaims([unsupported], sources),
    /source-grounding validation failed/,
  );
  assert.deepEqual(
    claimGroundingReport(supported, sources)[0].sharedTerms,
    ["define", "memory", "operation", "register", "risc-v"],
  );
  assert.deepEqual(
    pruneUnsupportedClaimSources(
      [
        {
          ...supported,
          sourceIds: ["riscv", "xv6"],
        },
      ],
      sources,
    )[0].sourceIds,
    ["riscv"],
  );
  assert.throws(
    () =>
      assertSourceBoundClaims(
        [
          {
            id: "claim-003",
            text: "RISC-V registers guarantee unrelated financial safety and medical reliability.",
            sourceIds: ["riscv"],
          },
        ],
        sources,
        { minimumCoverage: 0.8 },
      ),
    /cover only \d+%/,
  );
});

test("unfinished model claims fall back to a complete cited-source sentence", async () => {
  const sourceSentence =
    "A complete source sentence preserves an auditable factual claim.";
  const claims = Array.from({ length: 10 }, (_, index) => ({
    id: `claim-${index + 1}`,
    text: "A claim that was cut off mid",
    sourceIds: ["reviewed-source", "reviewed-source"],
  }));
  const engine = {
    config: { roles: {} },
    async executeRole() {
      return {
        requestSha256: "b".repeat(64),
        modelRevision: "test-model",
        output: {
          json: {
            title: "Complete claims",
            learningObjectives: ["Explain", "Apply", "Evaluate"],
            claims,
            beats: Array.from({ length: 10 }, (_, index) => ({
              id: `beat-${index + 1}`,
              title: `Beat ${index + 1}`,
              narration:
                index === 0
                  ? `${"A complete narrated explanation. ".repeat(24)}This unfinished fragment`
                  : "A complete narrated explanation.",
              visualDirection: "An inspectable diagram.",
              plannedSeconds: 60,
              claimIds:
                index === 0
                  ? ["reviewed-source"]
                  : [`claim-${index + 1}`, `claim-${index + 1}`],
              accessibility: {
                describedInNarration: true,
                audioDescriptionCue: null,
              },
            })),
          },
        },
      };
    },
  };
  const { episode } = await episodeFromTopic({
    topic: "Complete claims",
    sourceEntries: [
      {
        source: {
          id: "reviewed-source",
          title: "Reviewed source",
          type: "note",
          uri: "local",
          sha256: "a".repeat(64),
          verified: true,
          excerpt: `${sourceSentence} Additional context follows.`,
        },
        content: `${sourceSentence} Additional context follows.`,
      },
    ],
    engine,
    dataClassification: "public",
    lessonProfile: "full-lesson",
  });
  assert.equal(episode.claims[0].text, sourceSentence);
  assert.deepEqual(episode.claims[0].sourceIds, ["reviewed-source"]);
  assert.deepEqual(episode.beats[0].claimIds, ["claim-1"]);
  assert.match(episode.beats[0].narration, /explanation\.$/);
});

test("caption formatting enforces RIT line limits and round-trips formats", () => {
  const cues = formatCaptionCues(
    [
      {
        start: 0,
        end: 8,
        text: "This is a deliberately long sentence that must be wrapped into accessible caption lines without exceeding the limit.",
      },
    ],
    { speaker: "NARRATOR" },
  );
  assert.equal(auditCaptions(cues).ok, true);
  assert.ok(cues.every((cue) => cue.text.split("\n").length <= 2));
  assert.ok(
    cues.every((cue) =>
      cue.text.split("\n").every((line) => line.length <= 46),
    ),
  );
  assert.equal(parseVtt(cuesToVtt(cues)).length, cues.length);
  assert.match(cuesToSrt(cues), /00:00:00,000 -->/);
});

test("provider captions are clamped to the exact narration boundary", () => {
  const cues = clampCuesToDuration(
    [
      { start: -0.05, end: 2.5, text: "First" },
      { start: 2.5, end: 5.077, text: "Second" },
    ],
    5,
  );
  assert.deepEqual(cues, [
    { start: 0, end: 2.5, text: "First" },
    { start: 2.5, end: 5, text: "Second" },
  ]);
  assert.equal(auditCaptions(cues).ok, true);
});

test("planning writes episode, visual plan, and approval subjects", async () => {
  const directory = await mkdtemp(join(tmpdir(), "rit-plan-"));
  try {
    const config = presetConfig("generic");
    config.workflow.outputRoot = join(directory, "output");
    const episode = {
      schemaVersion: 2,
      id: "fixture",
      title: "Fixture",
      learningObjectives: [],
      sources: [],
      claims: [],
      pronunciations: [],
      beats: [
        {
          id: "beat-01",
          title: "Fixture",
          narration: "This is a clear and complete fixture narration.",
          visualDirection: "Show a simple diagram.",
          equations: [],
          plannedSeconds: 10,
          delivery: "Clear.",
          captionSpeaker: "NARRATOR",
          claimIds: [],
          assetRequests: [],
          accessibility: {
            describedInNarration: true,
            audioDescriptionCue: null,
          },
        },
      ],
    };
    const result = await writePlanArtifacts({ config, episode });
    assert.equal(result.visualPlan.beats.length, 1);
    assert.equal(result.scriptSubject.episode.id, "fixture");
    assert.equal(result.visualSubject.visualPlan.episodeId, "fixture");
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("frozen cache metadata does not invalidate an approved release subject", () => {
  const base = {
    episode: { id: "episode" },
    master: { sha256: "master" },
    captions: { sha256: "captions" },
    transcript: { sha256: "transcript" },
    qualityReport: { ok: true },
  };
  const disclosure = {
    schemaVersion: 1,
    project: "project",
    episode: "episode",
    mode: "record",
    humanResponsibility: "Instructor reviewed.",
    generatedStages: [
      {
        role: "narration",
        capability: "speech.synthesize",
        providerProfile: "voice",
        model: "model",
        modelRevision: "model@digest",
        requestSha256: "request",
        cacheHit: false,
        artifacts: [{ sha256: "artifact", mimeType: "audio/wav" }],
      },
    ],
  };
  const recorded = releaseApprovalSubject({ ...base, disclosure });
  const frozen = releaseApprovalSubject({
    ...base,
    disclosure: {
      ...disclosure,
      mode: "frozen",
      generatedStages: disclosure.generatedStages.map((stage) => ({
        ...stage,
        cacheHit: true,
      })),
    },
  });
  assert.deepEqual(frozen, recorded);
});

test("course renderer provides deterministic RISC-V teaching diagrams", () => {
  const section = {
    index: 0,
    totalSections: 1,
    title: "Read the instruction bits",
    visualDirection:
      "template:riscv-encoding | Break an ADD instruction into fields.",
    equations: ["rd = rs1 + rs2"],
  };
  const first = courseShotSvg(section, 0, 3, "Decode exact bits.", {
    brand: "RIT COURSE DRAFT",
    palette: ["#F76902", "#D0D3D4"],
  });
  const repeated = courseShotSvg(section, 0, 3, "Decode exact bits.", {
    brand: "RIT COURSE DRAFT",
    palette: ["#F76902", "#D0D3D4"],
  });
  assert.equal(first, repeated);
  assert.match(first, /data-visual-template="riscv-encoding"/);
  assert.match(first, /0x007302B3/);
  assert.match(first, /0110011/);
  assert.doesNotMatch(first, /template:riscv-encoding/);
});

test("course renderer provides deterministic academic showcase diagrams", () => {
  const templates = [
    ["showcase-resonance", "RESONANT REGION"],
    ["showcase-pid", "PID CONTROLLER"],
    ["showcase-spectroscopy", "A SPECTRAL FINGERPRINT"],
    ["showcase-hierarchy", "THE MAIN IDEA"],
    ["showcase-contribution-margin", "CONTRIBUTION"],
    ["showcase-primary-source", "OBSERVE"],
    ["showcase-oxygen", "HEMOGLOBIN"],
    ["showcase-captions", "ACCURATE WORDS"],
    ["showcase-lca", "SYSTEM"],
    ["showcase-interdisciplinary", "SHARED"],
    ["showcase-derivative", "SECANT"],
    ["showcase-phishing", "VERIFY INDEPENDENTLY"],
    ["showcase-malware-pipeline", "Prediction supports a decision"],
    ["showcase-comparison", "SAME ASSUMPTIONS"],
    ["showcase-data-split", "GROUP RELATED SAMPLES"],
    ["showcase-model-ladder", "COMPLEXITY"],
    ["showcase-confusion-matrix", "OPERATIONAL COSTS"],
    ["showcase-error-analysis", "ERROR"],
    ["showcase-threat-model", "ATTACKER GOAL"],
    ["showcase-observability", "MONITOR"],
    ["showcase-stakeholders", "SHARED"],
    ["showcase-mis", "CUSTOMER ORDER"],
    ["showcase-exposure", "EXPOSURE"],
    ["showcase-correlation", "POSSIBLE CONFOUNDER"],
    ["showcase-programming", "PROBLEM"],
    ["showcase-algorithms", "INPUT SIZE"],
    ["showcase-database", "STUDENTS"],
    ["showcase-cryptography", "PLAINTEXT"],
    ["showcase-search", "FRONTIER PRIORITY"],
    ["showcase-operating-systems", "KERNEL"],
    ["showcase-networks", "PACKET"],
    ["showcase-compilers", "TOKENS"],
    ["showcase-distributed", "MAJORITY COMMIT"],
    ["showcase-circuits", "STORE"],
    ["showcase-signals", "TIME"],
    ["showcase-fluids", "CONSERVE MASS"],
    ["showcase-mechanics", "STRAIN"],
  ];
  for (const [template, semanticLabel] of templates) {
    const section = {
      index: 0,
      totalSections: 1,
      title: "Academic concept",
      visualDirection: `template:${template} | Explain the concept.`,
      equations: [],
    };
    const first = courseShotSvg(section, 0, 3, "Evidence-led explanation.", {
      brand: "RIT COURSE DRAFT",
      palette: ["#F76902", "#D0D3D4"],
    });
    const repeated = courseShotSvg(
      section,
      0,
      3,
      "Evidence-led explanation.",
      {
        brand: "RIT COURSE DRAFT",
        palette: ["#F76902", "#D0D3D4"],
      },
    );
    assert.equal(first, repeated);
    assert.match(first, new RegExp(`data-visual-template="${template}"`));
    assert.match(first, new RegExp(semanticLabel));
    assert.doesNotMatch(first, new RegExp(`template:${template}`));
  }
});

test("generic academic templates hide production directions from learners", () => {
  const svg = courseShotSvg(
    {
      index: 0,
      totalSections: 1,
      title: "Prerequisites and Eligibility",
      visualDirection:
        "template:academic-process | Show a checklist for major, standing, and enrollment.",
      equations: [],
    },
    0,
    1,
    "Verify each requirement against the catalog.",
    {
      brand: "RIT COURSE DRAFT",
      palette: ["#F76902", "#D0D3D4"],
    },
  );
  assert.match(svg, /data-visual-template="showcase-checklist"/);
  assert.match(svg, /REQUIREMENT → EVIDENCE → APPROVAL/);
  assert.doesNotMatch(svg, /Show a checklist for/);
  assert.doesNotMatch(svg, /template:academic-process/);
  assert.doesNotMatch(svg, /SOURCE|TOKENS|AST|MACHINE/);
});

test("generic course directions render semantically matched process and table scenes", () => {
  const process = courseShotSvg(
    {
      index: 0,
      totalSections: 1,
      title: "Computational thinking",
      visualDirection:
        "template:academic-process | Display a flowchart from problem statement to algorithm to code, with arrows.",
      equations: [],
    },
    0,
    3,
    "Transform a precise problem into an implementation.",
  );
  assert.match(process, /data-visual-template="showcase-process"/);
  assert.match(process, /PROBLEM STATEMENT/);
  assert.match(process, /ALGORITHM/);
  assert.match(process, /CODE/);
  assert.doesNotMatch(process, /Display a flowchart/);

  const table = courseShotSvg(
    {
      index: 0,
      totalSections: 1,
      title: "Correctness and testing",
      visualDirection:
        "template:academic-process | Show a table with columns for test case, expected output, actual output, and status.",
      equations: [],
    },
    0,
    3,
    "Compare expected and observed behavior.",
  );
  assert.match(table, /data-visual-template="showcase-table"/);
  assert.match(table, /TEST CASE/);
  assert.match(table, /EXPECTED OUTPUT/);
  assert.match(table, /ACTUAL OUTPUT/);
  assert.match(table, /STATUS/);
  assert.doesNotMatch(table, /Show a table with columns/);
});

test("academic course directions select explanatory diagram primitives", () => {
  const cases = [
    [
      "Asymptotic notation",
      "Show a line graph comparing O(log n), O(n), and O(n squared).",
      "showcase-algorithms",
    ],
    [
      "Recurrence relations",
      "Show a recursion tree for T(n) = 2T(n/2) + n.",
      "showcase-recurrence",
    ],
    [
      "Dynamic programming",
      "Show a table where each cell depends on the cell above and to the left.",
      "showcase-dynamic-programming",
    ],
    [
      "Hash tables",
      "Show a key entering a hash table bucket and collision chain.",
      "showcase-hash-table",
    ],
  ];
  for (const [title, direction, expectedTemplate] of cases) {
    const svg = courseShotSvg(
      {
        index: 0,
        totalSections: 10,
        title,
        visualDirection: `template:academic-process | ${direction}`,
        equations: [],
      },
      0,
      3,
      title,
      { brand: "RIT COURSE DRAFT" },
    );
    assert.match(svg, new RegExp(`data-visual-template="${expectedTemplate}"`));
    assert.doesNotMatch(svg, /Visual focus|Learning connection/);
  }
});

test("broad showcase templates specialize to the concept being taught", () => {
  const svg = courseShotSvg(
    {
      index: 0,
      totalSections: 1,
      title: "Analyze recursion with recurrences",
      visualDirection:
        "template:showcase-algorithms | Unfold T(n) = 2T(n/2) + n as a recurrence tree.",
      equations: ["T(n) = 2T(n/2) + n"],
    },
    1,
    3,
    "Count work at each level.",
  );
  assert.match(svg, /T\(n\/2\)/);
  assert.match(svg, /COUNT WORK PER LEVEL/);
  assert.doesNotMatch(svg, /COMPARE GROWTH, THEN MEASURE/);
});

test("course visual resolution exposes subject matching for release QA", () => {
  assert.equal(
    resolveCourseVisualTemplate({
      title: "Oxygen exchange",
      visualDirection:
        "template:showcase-oxygen | Trace oxygen through the lungs and alveoli.",
    }),
    "showcase-oxygen",
  );
  assert.equal(
    resolveCourseVisualTemplate({
      title: "Database normalization",
      visualDirection:
        "Compare a relational schema before and after normalization.",
    }),
    "showcase-database",
  );
  assert.equal(
    resolveCourseVisualTemplate({
      title: "A vague topic",
      visualDirection: "Make this engaging.",
    }),
    null,
  );
});

test("academic inference does not mistake diagram text for RAM", () => {
  const svg = courseShotSvg(
    {
      index: 0,
      totalSections: 1,
      title: "Loop invariants for correctness",
      visualDirection:
        "template:academic-process | Draw a loop diagram and prove correctness with an invariant.",
      equations: [],
    },
    0,
    3,
    "Initialize, maintain, terminate.",
  );
  assert.match(svg, /data-visual-template="showcase-analysis-framework"/);
  assert.match(svg, /inputs \+ outputs/);
  assert.doesNotMatch(svg, /MAIN MEMORY/);
});

test("entity-relationship directions select a database teaching scene", () => {
  const svg = courseShotSvg(
    {
      index: 0,
      totalSections: 1,
      title: "Entity-Relationship Modeling Basics",
      visualDirection:
        "template:academic-process | Show an ER diagram connecting Book, Author, and Member entities.",
      equations: [],
    },
    0,
    3,
    "Connect entities with named relationships.",
  );
  assert.match(svg, /data-visual-template="showcase-database"/);
  assert.match(svg, /BOOK/);
  assert.match(svg, /AUTHOR/);
  assert.match(svg, /MEMBER/);
  assert.doesNotMatch(svg, /TRACE THE TRANSFORMATION/);
});

test("course constraints do not accidentally select an ML data split", () => {
  const svg = courseShotSvg(
    {
      index: 0,
      totalSections: 1,
      title: "Prerequisites and Course Constraints",
      visualDirection:
        "template:academic-process | Show a prerequisite flowchart with a course exclusion.",
      equations: [],
    },
    0,
    3,
    "Verify prerequisites before enrollment.",
  );
  assert.match(svg, /data-visual-template="showcase-process"/);
  assert.doesNotMatch(svg, /GROUP RELATED SAMPLES/);
});

test("ambiguous domain terms do not select unrelated academic scenes", () => {
  assert.equal(
    resolveCourseVisualTemplate({
      title: "Foundations of Object Identity and State",
      visualDirection:
        "Compare two objects with distinct memory addresses and encapsulation boundaries.",
    }),
    "showcase-programming",
  );
  assert.equal(
    resolveCourseVisualTemplate({
      title: "Introduction to Raster Graphics Pipeline",
      visualDirection:
        "Trace vertex input through primitive assembly, rasterization, and the framebuffer.",
    }),
    "showcase-process",
  );
  assert.equal(
    resolveCourseVisualTemplate({
      title: "Prerequisites and Course Requirements",
      visualDirection:
        "Create a process diagram with decisions and a checked enrollment output.",
    }),
    "showcase-process",
  );
  assert.notEqual(
    resolveCourseVisualTemplate({
      title: "Constraints for Data Validation",
      visualDirection:
        "Show a table with NOT NULL and CHECK constraints beside database columns.",
    }),
    "showcase-data-split",
  );
  assert.notEqual(
    resolveCourseVisualTemplate({
      title: "Course Project Implementation",
      visualDirection:
        "Show a roadmap from requirements through AI model training, tool development, and testing.",
    }),
    "showcase-data-split",
  );
});

test("cryptography lessons select a key-and-cipher teaching scene", () => {
  const svg = courseShotSvg(
    {
      index: 0,
      totalSections: 1,
      title: "Public-Key Cryptosystems",
      visualDirection:
        "Show plaintext encrypted with a public key and verified with approved parameters.",
      equations: [],
    },
    1,
    3,
    "The complete protocol controls the security property.",
  );
  assert.match(svg, /data-visual-template="showcase-cryptography"/);
  assert.match(svg, /KEY \+ ALGORITHM/);
  assert.match(svg, /CIPHERTEXT/);
});

test("directed graph representations select a graph teaching scene", () => {
  const svg = courseShotSvg(
    {
      index: 0,
      totalSections: 1,
      title: "Graph representations and traversal",
      visualDirection:
        "template:academic-process | Draw a directed graph and its adjacency list.",
      equations: [],
    },
    0,
    3,
    "Trace reachable vertices.",
  );
  assert.match(svg, /data-visual-template="showcase-search"/);
  assert.doesNotMatch(svg, /FIELD A/);
});

test("generic academic course beats use a bounded three-shot render plan", () => {
  const narration = Array.from(
    { length: 9 },
    (_, index) => `Sentence ${index + 1} explains reviewed course material.`,
  ).join(" ");
  const episode = {
    id: "bounded-academic-render",
    beats: [
      {
        id: "beat-01",
        title: "Academic process",
        plannedSeconds: 72,
        narration,
        visualDirection:
          "template:academic-process | Show the authored course-specific process.",
        assetRequests: [],
      },
      {
        id: "beat-02",
        title: "Specialized visual",
        plannedSeconds: 72,
        narration,
        visualDirection:
          "template:riscv-pipeline | Show a purpose-built processor pipeline.",
        assetRequests: [],
      },
    ],
  };
  const plan = compileVisualPlan(episode);
  assert.equal(plan.beats[0].shots.length, 3);
  assert.equal(plan.beats[1].shots.length, 9);
});

test("renderer skips lossless rescaling for normalized still images", () => {
  const imageFilter = shotVideoFilter({
    config: { preset: "rit-course" },
    index: 0,
    shot: { duration: 10, mimeType: "image/png" },
    transitionDuration: 0.18,
  });
  assert.ok(!imageFilter.includes("scale="));
  assert.ok(!imageFilter.includes("pad="));
  assert.match(imageFilter, /fps=30000\/1001/);

  const videoFilter = shotVideoFilter({
    config: { preset: "rit-course" },
    index: 1,
    shot: { duration: 10, mimeType: "video/mp4" },
    transitionDuration: 0.18,
  });
  assert.match(videoFilter, /scale=1920:1080/);
  assert.match(videoFilter, /pad=1920:1080/);
});

test("fast macOS draft encoding keeps a high-quality hardware profile opt-in", () => {
  assert.deepEqual(resolveEncoderSettings({}, {}), {
    mode: "software",
    codec: "libx264",
    preset: "veryfast",
    crf: "20",
    threads: "1",
  });
  assert.deepEqual(
    resolveEncoderSettings(
      {},
      { VIDEO_ENCODER_MODE: "videotoolbox" },
    ),
    {
      mode: "videotoolbox",
      codec: "h264_videotoolbox",
      profile: "high",
      quality: "80",
      realtime: true,
      prioritizeSpeed: false,
    },
  );
});

test("course thumbnails use reviewer-neutral language", () => {
  const thumbnail = courseThumbnailSvg({
    title:
      "Circular Entrepreneurship: From Material Loops to a Viable Venture",
    brand: "RIT COURSE DRAFT",
  });
  assert.match(thumbnail, /Source-grounded/);
  assert.match(thumbnail, /Reviewable/);
  assert.match(thumbnail, /Viable Venture/);
  assert.doesNotMatch(thumbnail, /Human reviewed/);
  assert.doesNotMatch(thumbnail, /Instructor reviewed/);
});
