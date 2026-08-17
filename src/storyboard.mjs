import { readFile } from "node:fs/promises";

const clockSeconds = (value) => {
  const parts = value.split(":").map(Number);
  return parts.length === 3
    ? parts[0] * 3600 + parts[1] * 60 + parts[2]
    : parts[0] * 60 + parts[1];
};

const cleanText = (value) =>
  value
    .replace(/\*\*/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();

const SPOKEN_PRODUCTION_DIRECTION =
  /^(?:\[[^\]]+\]\s*)?(?:on[- ]screen|show on[- ]screen|display on[- ]screen|cut to|camera(?:\s+(?:shows|moves|pans|zooms))?|fade (?:in|out))\b/i;

export function cleanNarration(value) {
  const normalized = cleanText(value)
    .replace(/^(?:narrator|voiceover)\s*:\s*/gim, "")
    .trim();
  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [];
  return sentences
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !SPOKEN_PRODUCTION_DIRECTION.test(sentence))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function readStoryboard(path) {
  const markdown = await readFile(path, "utf8");
  const lines = markdown.split(/\r?\n/);
  const sections = [];
  let current;

  for (const line of lines) {
    const heading = line.match(
      /^##\s+(\d+:\d+(?::\d+)?)\s*[–-]\s*(\d+:\d+(?::\d+)?)\s+—\s+(.+)$/,
    );
    if (heading) {
      if (current) sections.push(current);
      current = {
        index: sections.length,
        start: clockSeconds(heading[1]),
        plannedEnd: clockSeconds(heading[2]),
        title: cleanText(heading[3]),
        narrationLines: [],
        equations: [],
        claims: [],
        visualDirection: "",
        delivery: "",
        inVoiceover: false,
      };
      continue;
    }
    if (!current) continue;

    if (/^\*\*\[VOICEOVER\]\*\*$/.test(line.trim())) {
      current.inVoiceover = true;
      continue;
    }
    const equation = line.match(/^\*\*\[EQUATION\]\*\*\s*(.+)$/);
    if (equation) {
      current.equations.push(cleanText(equation[1]));
      continue;
    }
    const visual = line.match(/^\*\*\[VISUAL\]\*\*\s*(.+)$/);
    if (visual) {
      current.visualDirection = cleanText(visual[1]);
      continue;
    }
    const claim = line.match(
      /^\*\*\[CLAIM(?:\s+([^\]]+))?\]\*\*\s*(.+)$/,
    );
    if (claim) {
      current.claims.push({
        text: cleanText(claim[2]),
        sourceIds: (claim[1] || "")
          .split(",")
          .map((value) => cleanText(value))
          .filter(Boolean),
      });
      continue;
    }
    const delivery = line.match(/^\*\*Delivery:\*\*\s*(.+)$/i);
    if (delivery) {
      current.delivery = cleanText(delivery[1]);
      current.inVoiceover = false;
      continue;
    }
    if (
      current.inVoiceover &&
      !/^\*\*\[[A-Z ]+\]\*\*/.test(line.trim())
    ) {
      current.narrationLines.push(line);
    }
  }
  if (current) sections.push(current);

  const parsed = sections.map((section) => {
    const narration = cleanNarration(
      section.narrationLines.join("\n").replace(/\n{3,}/g, "\n\n"),
    );
    return {
      id: `beat-${String(section.index + 1).padStart(2, "0")}`,
      index: section.index,
      title: section.title,
      narration,
      equations: section.equations,
      claims: section.claims,
      visualDirection: section.visualDirection,
      delivery: section.delivery,
      plannedSeconds: section.plannedEnd - section.start,
      wordCount: narration.split(/\s+/).filter(Boolean).length,
    };
  });

  if (!parsed.length || parsed.some((section) => !section.narration)) {
    throw new Error(
      "The storyboard must contain timed level-two headings and non-empty [VOICEOVER] blocks.",
    );
  }
  return parsed.map((section) => ({
    ...section,
    totalSections: parsed.length,
  }));
}
