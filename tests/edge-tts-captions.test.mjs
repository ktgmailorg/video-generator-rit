import assert from "node:assert/strict";
import test from "node:test";
import { buildVttFromWordBoundaries } from "../src/providers/edge-tts.mjs";

const word = (text, offsetTicks, durationTicks) => ({
  Metadata: [
    {
      Type: "WordBoundary",
      Data: {
        Offset: offsetTicks,
        Duration: durationTicks,
        text: { Text: text, Length: text.length, BoundaryType: "WordBoundary" },
      },
    },
  ],
});

test("word boundaries become well-formed VTT cues", () => {
  const vtt = buildVttFromWordBoundaries([
    word("Hello", 1_000_000, 2_875_000),
    word("world", 4_000_000, 3_000_000),
  ]);
  assert.ok(vtt.startsWith("WEBVTT\n"));
  assert.match(vtt, /00:00:00\.100 --> 00:00:00\.700/);
  assert.match(vtt, /Hello world/);
});

test("long pauses split cues", () => {
  const vtt = buildVttFromWordBoundaries([
    word("First", 0, 2_000_000),
    // 1.5 second gap exceeds the 0.8 second default.
    word("Second", 17_000_000, 2_000_000),
  ]);
  const cueCount = (vtt.match(/-->/g) || []).length;
  assert.equal(cueCount, 2);
});

test("cues cap at the configured word count", () => {
  const events = Array.from({ length: 20 }, (_, index) =>
    word(`w${index}`, index * 3_000_000, 2_000_000),
  );
  const vtt = buildVttFromWordBoundaries(events, { maxWordsPerCue: 5, maxGapSeconds: 10 });
  const cueCount = (vtt.match(/-->/g) || []).length;
  assert.equal(cueCount, 4);
});

test("non-word metadata and empty input degrade gracefully", () => {
  const vtt = buildVttFromWordBoundaries([
    { Metadata: [{ Type: "SessionEnd", Data: {} }] },
  ]);
  assert.equal(vtt, "WEBVTT\n\n");
});
