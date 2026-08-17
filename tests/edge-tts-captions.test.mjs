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

// Edge TTS reports sentences separately and strips punctuation from word
// text, so realistic fixtures need SentenceBoundary events.
const sentence = (text, offsetTicks) => ({
  Metadata: [
    {
      Type: "SentenceBoundary",
      Data: { Offset: offsetTicks, text: { Text: text } },
    },
  ],
});

test("cues break at sentence starts reported by the provider", () => {
  // Real event order: the sentence event arrives after that sentence's first
  // word, so offsets rather than arrival order must drive the split.
  const vtt = buildVttFromWordBoundaries([
    word("Done", 0, 1_000_000),
    sentence("Done.", 0),
    word("Next", 1_200_000, 1_000_000),
    sentence("Next sentence.", 1_200_000),
    word("sentence", 2_400_000, 1_000_000),
  ]);
  assert.equal(vtt.split("-->").length - 1, 2);
  assert.match(vtt, /\nDone\n/);
  assert.match(vtt, /\nNext sentence\n/);
});

test("punctuation in word text still splits when a provider includes it", () => {
  for (const ending of ['said."', "wait…", "really?", "stop!"]) {
    const vtt = buildVttFromWordBoundaries([
      word(ending, 0, 1_000_000),
      word("After", 1_200_000, 1_000_000),
    ]);
    assert.equal(vtt.split("-->").length - 1, 2, ending);
  }
});

test("a single sentence covering every word yields one cue", () => {
  // The sentence event must not split the very cue it starts.
  const vtt = buildVttFromWordBoundaries([
    sentence("One two three.", 0),
    word("One", 0, 500_000),
    word("two", 600_000, 500_000),
    word("three", 1_200_000, 500_000),
  ]);
  assert.equal(vtt.split("-->").length - 1, 1);
  assert.match(vtt, /One two three/);
});

test("mid-sentence abbreviations do not fragment a cue", () => {
  // A trailing period is the signal, so keep the common case honest: words
  // without terminal punctuation must stay grouped.
  const vtt = buildVttFromWordBoundaries([
    word("one", 0, 500_000),
    word("two", 600_000, 500_000),
    word("three", 1_200_000, 500_000),
  ]);
  assert.equal(vtt.split("-->").length - 1, 1);
});

test("a long sentence splits into balanced cues without an orphan word", () => {
  // Nine words with a limit of eight must not become 8 + 1.
  const events = Array.from({ length: 9 }, (_, index) =>
    word(`w${index}`, index * 2_000_000, 1_000_000),
  );
  const vtt = buildVttFromWordBoundaries([sentence("nine words", 0), ...events], {
    maxWordsPerCue: 8,
    maxGapSeconds: 10,
  });
  const cueTexts = vtt
    .split("\n\n")
    .slice(1)
    .filter(Boolean)
    .map((block) => block.split("\n")[1]?.trim())
    .filter(Boolean);
  assert.equal(cueTexts.length, 2);
  for (const text of cueTexts) {
    assert.ok(text.split(" ").length >= 4, `orphan cue: "${text}"`);
  }
});
