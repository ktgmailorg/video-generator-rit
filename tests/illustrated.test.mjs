import test from "node:test";
import assert from "node:assert/strict";
import {
  evaluateSettledMotion,
  resolveMotionPreset,
} from "../src/illustrated/motion-presets.mjs";
import {
  checksumAsset,
  validateAssetProvenance,
} from "../src/illustrated/asset-provenance.mjs";
import { compileVisualStory } from "../src/illustrated/visual-compiler.mjs";
import {
  VisualRuntime,
  assertRendererAdapter,
} from "../src/illustrated/visual-runtime.mjs";
import {
  assertSafeSvg,
  renderSvgScene,
  svgFrameKey,
} from "../src/illustrated/svg-scene.mjs";

test("motion is absolute-time deterministic and settles", () => {
  const motion = resolveMotionPreset("overshoot_settle");
  assert.equal(evaluateSettledMotion(motion, 0), 0);
  assert.equal(evaluateSettledMotion(motion, motion.totalFrames + 20), 1);
  assert.equal(evaluateSettledMotion(motion, 12), evaluateSettledMotion(motion, 12));
});

test("commercial provenance policy blocks incomplete assets", () => {
  const bytes = Buffer.from("fictional fixture");
  const valid = {
    provider: "fixture",
    sourceUrl: "https://example.test/asset",
    creator: "Example Artist",
    license: "CC-BY-4.0",
    checksum: checksumAsset(bytes),
    retrievedAt: "2026-01-01T00:00:00.000Z",
    attributionText: "Example Asset by Example Artist, CC BY 4.0",
  };
  assert.equal(validateAssetProvenance(valid).ok, true);
  assert.equal(validateAssetProvenance({ ...valid, license: "CC-NC-4.0" }).ok, false);
});

test("compiler preserves anchors, continuity, and seriousness", () => {
  const result = compileVisualStory({
    protectedClaimIds: ["claim-safe"],
    beats: [
      {
        beatId: "beat-a",
        informationGoal: "Introduce a fictional mechanism",
        protagonist: "shape-a",
        action: "appears",
        setting: "test stage",
        visualHook: "clean silhouette",
        seriousness: "normal",
        claimIds: [],
        jokeId: "joke-a",
        tokenAnchors: ["a0", "a1"],
      },
      {
        beatId: "beat-b",
        informationGoal: "Explain the limitation",
        protagonist: "shape-a",
        action: "holds",
        setting: "test stage",
        visualHook: "evidence label",
        seriousness: "normal",
        claimIds: ["claim-safe"],
        jokeId: "must-not-render",
        tokenAnchors: ["b0", "b1"],
      },
    ],
  });
  assert.equal(result.shots[0].startAnchorId, "a0");
  assert.equal(result.shots[0].renderer, "svg");
  assert.equal(result.shots[1].composition.continuationOf, "shot-001");
  assert.deepEqual(result.shots[1].motionPresetIds, ["soft_enter", "evidence_stamp"]);
});

test("SVG scenes are full-frame, semantic, safe, and bounded", () => {
  const svg = renderSvgScene(
    {
      kind: "equation",
      title: "Experience changes internal state",
      equation: "next_state = rule(state, input, feedback)",
    },
    8,
    10,
  );
  assert.match(svg, /id="equation-world"/);
  assert.match(svg, /id="world-clip"/);
  assert.match(svg, /SYMBOLS TO CAUSAL RELATIONSHIP/);
  assert.doesNotMatch(svg, /<script|foreignObject|javascript:/i);
  assert.equal(svgFrameKey(4, 10), svgFrameKey(4.1, 10));
  assert.throws(
    () => assertSafeSvg('<svg><script>alert(1)</script></svg>'),
    /Active SVG/,
  );
});

test("math-first primitives connect geometry to equations", () => {
  const convolution = renderSvgScene(
    { kind: "convolution", title: "Convolution as shared local structure" },
    7,
    10,
  );
  assert.match(convolution, /id="convolution-world"/);
  assert.match(convolution, /SHARED WEIGHTS/);
  assert.match(convolution, /y\[i,j\]/);

  const scaling = renderSvgScene(
    { kind: "scaling", title: "Scaling laws" },
    7,
    10,
  );
  assert.match(scaling, /id="scaling-world"/);
  assert.match(scaling, /LOWER IS BETTER/);
  assert.match(scaling, /POWER LAW/);
  assert.doesNotMatch(scaling, /pathLength="1"|stroke-dasharray="1"/);
});

test("runtime seeks before every render and disposes adapters", async () => {
  const calls = [];
  const adapter = assertRendererAdapter({
    prepare: async () => calls.push("prepare"),
    seek: async (time) => calls.push(`seek:${time}`),
    render: async () => calls.push("render"),
    snapshot: async () => ({ fixture: true }),
    dispose: () => calls.push("dispose"),
  });
  const runtime = new VisualRuntime({ pixi: adapter });
  const bundle = { id: "bundle-a", renderer: "pixi" };
  await runtime.prepare(bundle);
  await runtime.renderAt(bundle, {}, 4.5);
  runtime.dispose();
  assert.deepEqual(calls, ["prepare", "seek:4.5", "render", "dispose"]);
});
