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
  // The cue starts exactly on the first word. Its end is the last word plus the
  // readability hold, so the text does not vanish the instant speech stops.
  assert.match(vtt, /00:00:00\.100 --> 00:00:01\.900/);
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
  // Nine words with a limit of eight must not become 8 + 1. Spaced at a
  // realistic speaking rate so both halves clear the minimum cue duration.
  const events = Array.from({ length: 9 }, (_, index) =>
    word(`w${index}`, index * 4_000_000, 3_500_000),
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
  // The invariant is what matters, not the exact split: a trailing word must
  // never be stranded in a cue of its own, whether by balancing or by merging.
  assert.ok(cueTexts.length >= 1);
  for (const text of cueTexts) {
    assert.ok(text.split(" ").length >= 4, `orphan cue: "${text}"`);
  }
});

test("cues are held into the following pause without overlapping", () => {
  // Two sentences with a long silence between them: the first cue should be
  // extended into that silence rather than vanishing on its last word.
  const vtt = buildVttFromWordBoundaries([
    sentence("First.", 0),
    word("First", 0, 5_000_000),
    sentence("Second.", 50_000_000),
    word("Second", 50_000_000, 5_000_000),
  ]);
  const times = [...vtt.matchAll(/(\d+):(\d+):([\d.]+) --> (\d+):(\d+):([\d.]+)/g)].map(
    (match) => match.slice(1).map(Number),
  );
  const seconds = ([h, m, s]) => h * 3600 + m * 60 + s;
  const first = { start: seconds(times[0].slice(0, 3)), end: seconds(times[0].slice(3)) };
  const second = { start: seconds(times[1].slice(0, 3)), end: seconds(times[1].slice(3)) };
  // Held past the 0.5s of speech, capped by the default 1.2s hold.
  assert.ok(first.end > 0.5, `expected a hold, got ${first.end}`);
  assert.ok(first.end <= 1.75, `hold should be capped, got ${first.end}`);
  // And it must stop before the next cue begins.
  assert.ok(first.end < second.start, "cues must not overlap");
});

test("a hold never runs past the next cue when speech is continuous", () => {
  const events = Array.from({ length: 6 }, (_, index) =>
    word(`w${index}`, index * 4_000_000, 3_500_000),
  );
  const vtt = buildVttFromWordBoundaries([sentence("six words", 0), ...events], {
    maxWordsPerCue: 2,
    maxGapSeconds: 10,
  });
  const times = [...vtt.matchAll(/(\d+):(\d+):([\d.]+) --> (\d+):(\d+):([\d.]+)/g)].map(
    (match) => match.slice(1).map(Number),
  );
  const seconds = ([h, m, s]) => h * 3600 + m * 60 + s;
  for (let index = 0; index < times.length - 1; index += 1) {
    const end = seconds(times[index].slice(3));
    const nextStart = seconds(times[index + 1].slice(0, 3));
    assert.ok(end <= nextStart, `cue ${index + 1} overlaps the next`);
  }
});

test("a sentence is not split into cues that flash by", () => {
  // Six fast monosyllables spanning 0.9s: splitting at the word cap would give
  // two sub-second cues, so they must stay as one legible cue instead.
  const events = Array.from({ length: 6 }, (_, index) =>
    word(`w${index}`, index * 1_500_000, 1_400_000),
  );
  const vtt = buildVttFromWordBoundaries([sentence("six fast words", 0), ...events], {
    maxWordsPerCue: 3,
    maxGapSeconds: 10,
  });
  assert.equal(vtt.split("-->").length - 1, 1, "should not split a 0.9s span");
});

test("a long sentence still splits once chunks clear the minimum duration", () => {
  // Same word cap, but each word now takes a full second, so splitting keeps
  // every cue comfortably above the minimum.
  const events = Array.from({ length: 6 }, (_, index) =>
    word(`w${index}`, index * 10_000_000, 9_000_000),
  );
  const vtt = buildVttFromWordBoundaries([sentence("six slow words", 0), ...events], {
    maxWordsPerCue: 3,
    maxGapSeconds: 10,
  });
  assert.equal(vtt.split("-->").length - 1, 2);
});
