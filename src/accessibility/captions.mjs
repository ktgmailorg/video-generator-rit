const timestampPattern =
  /(?:(\d{2}):)?(\d{2}):(\d{2})[.,](\d{3})/;

export function parseTimestamp(value) {
  const match = String(value).match(timestampPattern);
  if (!match) throw new TypeError(`Invalid caption timestamp: ${value}`);
  return (
    Number(match[1] || 0) * 3600 +
    Number(match[2]) * 60 +
    Number(match[3]) +
    Number(match[4]) / 1000
  );
}

export function formatVttTimestamp(seconds) {
  const milliseconds = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(milliseconds / 3_600_000);
  const minutes = Math.floor((milliseconds % 3_600_000) / 60_000);
  const secs = Math.floor((milliseconds % 60_000) / 1000);
  const millis = milliseconds % 1000;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(millis).padStart(3, "0")}`;
}

export function parseVtt(value) {
  const lines = String(value).replace(/^\uFEFF/, "").split(/\r?\n/);
  const cues = [];
  for (let index = 0; index < lines.length; index += 1) {
    const timing = lines[index].match(
      /((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})\s+-->\s+((?:\d{2}:)?\d{2}:\d{2}[.,]\d{3})/,
    );
    if (!timing) continue;
    const text = [];
    index += 1;
    while (index < lines.length && lines[index].trim()) {
      text.push(lines[index].trim());
      index += 1;
    }
    cues.push({
      start: parseTimestamp(timing[1]),
      end: parseTimestamp(timing[2]),
      text: cleanCaptionText(text.join(" ")),
    });
  }
  return cues;
}

const cleanCaptionText = (value) =>
  String(value)
    .replace(/<[^>]+>/g, "")
    .replace(/\s+/g, " ")
    .trim();

export function formatCaptionCues(
  cues,
  { speaker = "NARRATOR", maximumCharacters = 46, maximumLines = 2 } = {},
) {
  const formatted = [];
  for (const cue of cues) {
    const prefixed =
      speaker && !/^[A-Z][A-Z .'-]+:\s/.test(cue.text)
        ? `${speaker}: ${cue.text}`
        : cue.text;
    const words = prefixed.split(/\s+/).filter(Boolean);
    const lines = wrapWords(words, maximumCharacters);
    const groups = [];
    for (let index = 0; index < lines.length; index += maximumLines) {
      groups.push(lines.slice(index, index + maximumLines));
    }
    const duration = Math.max(0.1, cue.end - cue.start);
    const weights = groups.map((group) =>
      group.join(" ").split(/\s+/).filter(Boolean).length,
    );
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = cue.start;
    for (const [index, group] of groups.entries()) {
      const groupDuration =
        index === groups.length - 1
          ? cue.end - cursor
          : duration * (weights[index] / totalWeight);
      formatted.push({
        start: cursor,
        end: index === groups.length - 1 ? cue.end : cursor + groupDuration,
        text: group.join("\n"),
      });
      cursor += groupDuration;
    }
  }
  return formatted;
}

function wrapWords(words, maximumCharacters) {
  const lines = [];
  let current = "";
  for (const rawWord of words) {
    const word =
      rawWord.length > maximumCharacters
        ? `${rawWord.slice(0, maximumCharacters - 1)}…`
        : rawWord;
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > maximumCharacters) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export function offsetCues(cues, seconds) {
  return cues.map((cue) => ({
    ...cue,
    start: cue.start + seconds,
    end: cue.end + seconds,
  }));
}

export function clampCuesToDuration(cues, duration) {
  return cues
    .map((cue) => ({
      ...cue,
      start: Math.max(0, Math.min(duration, cue.start)),
      end: Math.max(0, Math.min(duration, cue.end)),
    }))
    .filter((cue) => cue.end > cue.start);
}

export function cuesToVtt(cues) {
  const body = cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatVttTimestamp(cue.start)} --> ${formatVttTimestamp(cue.end)}\n${cue.text}`,
    )
    .join("\n\n");
  return `WEBVTT\n\n${body}\n`;
}

export function cuesToSrt(cues) {
  return `${cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatVttTimestamp(cue.start).replace(".", ",")} --> ${formatVttTimestamp(cue.end).replace(".", ",")}\n${cue.text}`,
    )
    .join("\n\n")}\n`;
}

export function transcriptText(cues) {
  const lines = [];
  let previous = "";
  for (const cue of cues) {
    const text = cue.text.replace(/\n/g, " ");
    if (text !== previous) lines.push(text);
    previous = text;
  }
  return `${lines.join("\n\n")}\n`;
}

export function transcriptHtml(cues, title = "Video transcript") {
  const rows = [];
  let previous = "";
  for (const cue of cues) {
    const text = cue.text.replace(/\n/g, " ");
    if (text === previous) continue;
    rows.push(
      `<p><time datetime="PT${cue.start.toFixed(3)}S">${formatVttTimestamp(cue.start)}</time> ${escapeHtml(text)}</p>`,
    );
    previous = text;
  }
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(title)}</title></head>
<body><main><h1>${escapeHtml(title)}</h1>${rows.join("")}</main></body>
</html>
`;
}

const escapeHtml = (value) =>
  String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

export function auditCaptions(cues, options = {}) {
  const blockers = [];
  const warnings = [];
  const maximumCharacters = options.maximumCharacters || 46;
  if (!cues.length) blockers.push("No caption cues were produced");
  for (const [index, cue] of cues.entries()) {
    if (cue.end <= cue.start) blockers.push(`Caption ${index + 1} has invalid timing`);
    if (index && cue.start < cues[index - 1].end - 0.01) {
      blockers.push(`Caption ${index + 1} overlaps the previous cue`);
    }
    const lines = cue.text.split("\n");
    if (lines.length > 2) blockers.push(`Caption ${index + 1} exceeds two lines`);
    if (lines.some((line) => line.length > maximumCharacters)) {
      blockers.push(
        `Caption ${index + 1} exceeds ${maximumCharacters} characters per line`,
      );
    }
    const words = cue.text.replace(/\n/g, " ").split(/\s+/).length;
    const wordsPerMinute = words / ((cue.end - cue.start) / 60);
    if (wordsPerMinute > 220) {
      warnings.push(`Caption ${index + 1} may be too fast to read`);
    }
  }
  return { ok: blockers.length === 0, blockers, warnings };
}
