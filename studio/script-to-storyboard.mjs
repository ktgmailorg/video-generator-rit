const MAX_SCRIPT_CHARACTERS = 120_000;
const TARGET_WORDS_PER_BEAT = 85;

const clean = (value) =>
  String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/\b(?:narrator|speaker\s*\d*|voiceover)\s*:\s*/gi, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const words = (value) => value.split(/\s+/).filter(Boolean);

const sentenceParts = (value) =>
  value
    .replace(/\n+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

const clock = (seconds) => {
  const rounded = Math.max(0, Math.round(seconds));
  return `${Math.floor(rounded / 60)}:${String(rounded % 60).padStart(2, "0")}`;
};

const beatTitle = (sentences, index) => {
  const first = sentences[0] || `Section ${index + 1}`;
  const titleWords = words(first.replace(/[.!?]+$/g, "")).slice(0, 9);
  const title = titleWords.join(" ");
  return title.length > 72 ? `${title.slice(0, 69)}…` : title;
};

function groupSentences(sentences) {
  const groups = [];
  let current = [];
  let count = 0;
  for (const sentence of sentences) {
    const sentenceWords = words(sentence).length;
    if (current.length && count + sentenceWords > TARGET_WORDS_PER_BEAT) {
      groups.push(current);
      current = [];
      count = 0;
    }
    current.push(sentence);
    count += sentenceWords;
  }
  if (current.length) groups.push(current);
  return groups;
}

export function scriptToStoryboard({
  title,
  script,
  sourceId = null,
  delivery = "Professional, clear, and paced for an introductory course audience.",
}) {
  const normalizedTitle = clean(title);
  const normalizedScript = clean(script);
  if (!normalizedTitle) throw new TypeError("A video title is required");
  if (!normalizedScript) throw new TypeError("A script or transcript is required");
  if (normalizedScript.length > MAX_SCRIPT_CHARACTERS) {
    throw new TypeError(
      `Script exceeds the ${MAX_SCRIPT_CHARACTERS.toLocaleString()} character studio limit`,
    );
  }
  const sentences = sentenceParts(normalizedScript);
  if (!sentences.length) throw new TypeError("The script contains no readable sentences");
  const groups = groupSentences(sentences);
  let cursor = 0;
  const sections = groups.map((group, index) => {
    const narration = group.join(" ");
    const duration = Math.max(12, (words(narration).length / 145) * 60);
    const start = cursor;
    cursor += duration;
    const claim = sourceId
      ? `\n**[CLAIM ${sourceId}]** ${group[0]}\n`
      : "";
    return [
      `## ${clock(start)} - ${clock(cursor)} — ${beatTitle(group, index)}`,
      "",
      `**[VISUAL]** Build an academic concept diagram for section ${index + 1} of ${groups.length}. Use the narration to choose labels, relationships, and emphasis; do not add unsupported facts.`,
      claim,
      "**[VOICEOVER]**",
      "",
      narration,
      "",
      `**Delivery:** ${clean(delivery)}`,
    ].join("\n");
  });
  return [`# ${normalizedTitle}`, "", ...sections].join("\n\n").trim() + "\n";
}

export const studioScriptLimits = Object.freeze({
  maximumCharacters: MAX_SCRIPT_CHARACTERS,
  targetWordsPerBeat: TARGET_WORDS_PER_BEAT,
});
