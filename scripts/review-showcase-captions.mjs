import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  auditCaptions,
  cuesToVtt,
  formatCaptionCues,
  parseVtt,
} from "../src/accessibility/captions.mjs";

const reviews = {
  "engineering-technology-pid": [
    [2, 3],
    [5, 6],
  ],
  "art-design-hierarchy": [[11, 13]],
  "liberal-arts-primary-sources": [[8, 9]],
  "individualized-study-question": [[3, 6]],
};

function mergeRanges(cues, ranges) {
  const byStart = new Map(ranges.map(([start, end]) => [start, end]));
  const merged = [];
  for (let index = 1; index <= cues.length; index += 1) {
    const end = byStart.get(index);
    if (!end) {
      if (!ranges.some(([start, finish]) => index > start && index <= finish)) {
        merged.push(cues[index - 1]);
      }
      continue;
    }
    const group = cues.slice(index - 1, end);
    merged.push({
      start: group[0].start,
      end: group.at(-1).end,
      text: group
        .map((cue) => cue.text.replace(/\n/g, " "))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    });
    index = end;
  }
  return merged;
}

const results = [];
for (const [slug, ranges] of Object.entries(reviews)) {
  const outputRoot = resolve(`.demo-output/subject-showcase/${slug}`);
  const automaticPath = `${outputRoot}/work/narration/captions.vtt`;
  const cues = parseVtt(await readFile(automaticPath, "utf8"));
  const reviewed = formatCaptionCues(mergeRanges(cues, ranges), {
    speaker: "",
  });
  const audit = auditCaptions(reviewed);
  if (!audit.ok || audit.warnings.length) {
    throw new Error(
      `${slug} reviewed captions did not pass: ${JSON.stringify(audit)}`,
    );
  }
  const versionedPath = resolve(
    `courses/subject-showcase/${slug}/captions.reviewed.vtt`,
  );
  const overridePath = `${outputRoot}/review/captions.vtt`;
  await mkdir(`${outputRoot}/review`, { recursive: true });
  const vtt = cuesToVtt(reviewed);
  await Promise.all([
    writeFile(versionedPath, vtt),
    writeFile(overridePath, vtt),
  ]);
  results.push({
    slug,
    cueCountBefore: cues.length,
    cueCountAfter: reviewed.length,
    audit,
    versionedPath,
    overridePath,
  });
}

console.log(JSON.stringify({ reviewed: results.length, results }, null, 2));
