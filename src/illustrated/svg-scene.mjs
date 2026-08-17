const WIDTH = 1920;
const HEIGHT = 1080;

const PALETTE = Object.freeze({
  ink: "#07151c",
  surface: "#123249",
  raised: "#2e557d",
  text: "#f7f7ed",
  muted: "#9eb6be",
  mint: "#78e5c5",
  gold: "#ffd86e",
  coral: "#ff7e7a",
});

const clamp = (value) => Math.max(0, Math.min(1, value));
const criticallyDamped = (value, response = 7.5) => {
  const x = clamp(value);
  if (x === 0 || x === 1) return x;
  const current = 1 - (1 + response * x) * Math.exp(-response * x);
  const settled = 1 - (1 + response) * Math.exp(-response);
  return clamp(current / settled);
};
const phase = (time, start, seconds) =>
  criticallyDamped((time - start) / seconds);

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrap(value, width = 38, maximumLines = 2) {
  const words = String(value ?? "").replace(/\s+/g, " ").trim().split(" ");
  const result = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && candidate.length > width) {
      result.push(line);
      if (result.length === maximumLines) break;
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line && result.length < maximumLines) result.push(line);
  return result;
}

function text(value, x, y, size, fill = PALETTE.text, anchor = "middle", weight = 750) {
  return `<text x="${x}" y="${y}" text-anchor="${anchor}" fill="${fill}"
    font-family="Inter,Arial,sans-serif" font-size="${size}" font-weight="${weight}">
    ${escapeXml(value)}</text>`;
}

function character(x, y, expression, reveal) {
  const mouth =
    expression === "alarmed"
      ? `<ellipse cx="0" cy="62" rx="17" ry="28" fill="${PALETTE.ink}"/>`
      : expression === "deadpan"
        ? `<path d="M-28 61 H28" stroke="${PALETTE.ink}" stroke-width="9"
            stroke-linecap="round"/>`
        : `<path d="M-30 54 Q0 90 32 52" fill="none" stroke="${PALETTE.ink}"
            stroke-width="9" stroke-linecap="round"/>`;
  return `<g transform="translate(${x} ${y + (1 - reveal) * 74})" opacity="${reveal}">
    <circle r="112" fill="url(#character-gradient)" stroke="${PALETTE.ink}" stroke-width="14"/>
    <path d="M-96 28 Q-156 -36 -195 -14 M96 28 Q156 -36 195 -14"
      fill="none" stroke="${PALETTE.text}" stroke-width="12" stroke-linecap="round"/>
    <ellipse cx="-42" cy="-22" rx="24" ry="30" fill="${PALETTE.text}"/>
    <ellipse cx="42" cy="-22" rx="24" ry="30" fill="${PALETTE.text}"/>
    <circle cx="-37" cy="-17" r="11" fill="${PALETTE.ink}"/>
    <circle cx="47" cy="-17" r="11" fill="${PALETTE.ink}"/>
    ${mouth}
  </g>`;
}

function mechanismWorld(progress) {
  const nodes = [
    [320, "x", "INPUT", PALETTE.mint],
    [720, "z", "PRE-ACTIVATION", PALETTE.gold],
    [1120, "ŷ", "PREDICTION", PALETTE.mint],
    [1520, "L", "LOSS", PALETTE.coral],
  ];
  return `<g id="mechanism-world" clip-path="url(#world-clip)">
    ${nodes.map(([x, symbol, label, color], index) => {
      const reveal = phase(progress.enter, index * 0.08, 0.76);
      const next = nodes[index + 1];
      return `<g opacity="${reveal}">
        ${next ? `<path d="M${x + 112} 640 H${next[0] - 112}" stroke="${PALETTE.gold}"
          stroke-width="11" marker-end="url(#arrow)" pathLength="1000"
          stroke-dasharray="1000" stroke-dashoffset="${1000 * (1 - reveal)}"/>` : ""}
        <circle cx="${x}" cy="640" r="102" fill="${PALETTE.raised}"
          stroke="${color}" stroke-width="8"/>
        ${text(symbol, x, 656, 48, color)}
        ${text(label, x, 788, 16, PALETTE.muted)}
      </g>`;
    }).join("")}
    <path d="M1520 492 C1240 370 920 380 720 480 C540 570 412 540 320 494"
      fill="none" stroke="${PALETTE.coral}" stroke-width="9"
      marker-end="url(#arrow)" pathLength="1000" stroke-dasharray="1000"
      stroke-dashoffset="${1000 * (1 - progress.resolve)}"/>
    <g transform="translate(960 884)" opacity="${progress.detail}">
      <rect x="-620" y="-48" width="1240" height="96" rx="24" fill="${PALETTE.ink}"
        stroke="${PALETTE.mint}" stroke-width="3"/>
      ${text("z = wᵀx + b  ·  ŷ = σ(z)  ·  ∇wL = (∂L/∂z) x", 0, 11, 28)}
    </g>
  </g>`;
}

function equationWorld(scene, progress) {
  const equation = escapeXml(scene.equation ?? "next_state = rule(state, input, feedback)");
  return `<g id="equation-world" clip-path="url(#world-clip)">
    <g transform="translate(420 680)" opacity="${progress.enter}">
      <rect x="-250" y="-105" width="190" height="210" rx="42" fill="${PALETTE.mint}"
        stroke="${PALETTE.ink}" stroke-width="12"/>
      <rect x="60" y="-105" width="190" height="210" rx="42" fill="${PALETTE.coral}"
        stroke="${PALETTE.ink}" stroke-width="12"/>
      ${text("STATE", -155, 15, 24, PALETTE.ink)}
      ${text("NEXT", 155, 15, 24, PALETTE.ink)}
      <path d="M-40 0 H45" stroke="${PALETTE.gold}" stroke-width="16"
        marker-end="url(#arrow)"/>
    </g>
    <g transform="translate(1320 680)" opacity="${progress.detail}">
      <rect x="-430" y="-215" width="860" height="430" rx="48" fill="${PALETTE.raised}"
        stroke="${PALETTE.mint}" stroke-width="7"/>
      ${text("SIMPLIFIED MODEL", -378, -162, 18, PALETTE.coral, "start", 850)}
      ${text(equation, 0, -38, equation.length > 48 ? 40 : 48)}
      ${["STATE", "EXPERIENCE", "FEEDBACK"].map((label, index) => {
        const x = -250 + index * 250;
        return `<rect x="${x - 102}" y="42" width="204" height="58" rx="29"
          fill="${PALETTE.ink}" stroke="${index === 1 ? PALETTE.gold : PALETTE.mint}"
          stroke-width="3"/>${text(label, x, 80, 17)}`;
      }).join("")}
      <path d="M-320 142 H${-320 + 640 * progress.resolve}" stroke="url(#accent-gradient)"
        stroke-width="11" stroke-linecap="round"/>
      ${text("SYMBOLS TO CAUSAL RELATIONSHIP", 0, 184, 19, PALETTE.muted)}
    </g>
  </g>`;
}

function convolutionWorld(progress) {
  const input = Array.from({ length: 35 }, (_, index) => {
    const column = index % 7;
    const row = Math.floor(index / 7);
    const active = column === 1 || (row === 3 && column < 5);
    return `<rect x="${column * 58}" y="${row * 58}" width="48" height="48" rx="9"
      fill="${active ? PALETTE.gold : PALETTE.raised}" stroke="${PALETTE.ink}"
      stroke-width="5"/>`;
  }).join("");
  return `<g id="convolution-world" clip-path="url(#world-clip)">
    <g transform="translate(250 492)" opacity="${progress.enter}">
      ${input}
      <rect x="${-14 + progress.detail * 174}" y="${44 + progress.detail * 116}"
        width="184" height="184" rx="24" fill="${PALETTE.gold}" fill-opacity=".12"
        stroke="${PALETTE.gold}" stroke-width="12"/>
      ${text("INPUT TENSOR", 174, 336, 20)}
    </g>
    <path d="M700 642 H850" stroke="${PALETTE.gold}" stroke-width="11"
      marker-end="url(#arrow)" pathLength="1000" stroke-dasharray="1000"
      stroke-dashoffset="${1000 * (1 - progress.detail)}"/>
    <g transform="translate(915 548)" opacity="${progress.detail}">
      ${Array.from({ length: 15 }, (_, index) => {
        const column = index % 5;
        const row = Math.floor(index / 5);
        return `<rect x="${column * 58}" y="${row * 58}" width="48" height="48" rx="9"
          fill="${column === 1 || row === 2 ? PALETTE.mint : PALETTE.raised}"
          stroke="${PALETTE.ink}" stroke-width="5"/>`;
      }).join("")}
      ${text("FEATURE MAP", 116, 218, 20)}
    </g>
    <g transform="translate(1510 650)" opacity="${progress.resolve}">
      <rect x="-250" y="-188" width="500" height="376" rx="34" fill="${PALETTE.raised}"
        stroke="${PALETTE.mint}" stroke-width="8"/>
      ${text("DISCRETE CONVOLUTION", 0, -132, 18, PALETTE.mint)}
      ${text("y[i,j] = σ(Σ K[u,v] x[i+u,j+v] + b)", 0, -40, 27)}
      ${text("KERNEL 3×3 · STRIDE 1 · SHARED WEIGHTS", 0, 34, 15, PALETTE.muted)}
      <path d="M-176 88 H176" stroke="${PALETTE.muted}" stroke-width="3"/>
      ${text("ONE LOCAL DETECTOR, REUSED EVERYWHERE", 0, 138, 16)}
    </g>
  </g>`;
}

function scalingWorld(progress) {
  return `<g id="scaling-world" clip-path="url(#world-clip)">
    <g transform="translate(250 860)" opacity="${progress.enter}">
      <path d="M0 0 V-470 M0 0 H1030" stroke="${PALETTE.muted}" stroke-width="4"/>
      ${text("LOG COMPUTE C", 515, 64, 17, PALETTE.muted)}
      <g transform="translate(-54 -236) rotate(-90)">
        ${text("LOSS L · LOWER IS BETTER", 0, 0, 16, PALETTE.muted)}
      </g>
      <path d="M44 -410 C210 -360 320 -280 472 -230 C642 -176 770 -140 1000 -104"
        fill="none" stroke="${PALETTE.mint}" stroke-width="12" pathLength="1000"
        stroke-dasharray="1000" stroke-dashoffset="${1000 * (1 - progress.detail)}"/>
      ${Array.from({ length: 8 }, (_, index) => {
        const x = 80 + index * 124;
        const y = -400 + Math.log1p(index * 1.8) * 126;
        return `<circle cx="${x}" cy="${y}" r="18" fill="${
          index < 3 ? PALETTE.mint : index < 6 ? PALETTE.gold : PALETTE.coral
        }" stroke="${PALETTE.ink}" stroke-width="6"/>`;
      }).join("")}
    </g>
    <g transform="translate(1510 646)" opacity="${progress.resolve}">
      <rect x="-250" y="-188" width="500" height="376" rx="34" fill="${PALETTE.raised}"
        stroke="${PALETTE.mint}" stroke-width="8"/>
      ${text("EMPIRICAL SCALING LAW", 0, -132, 18, PALETTE.mint)}
      ${text("L(C) = L∞ + A C^(−α)", 0, -42, 34)}
      <path d="M-176 16 H176" stroke="${PALETTE.muted}" stroke-width="3"/>
      ${text("A POWER LAW CONNECTS", 0, 72, 17)}
      ${text("COMPUTE TO EXPECTED ERROR", 0, 110, 17)}
    </g>
  </g>`;
}

function comedyWorld(progress) {
  return `<g id="comedy-world" clip-path="url(#world-clip)">
    <path d="M120 928 Q480 564 830 838 T1800 610 V1040 H120Z" fill="#153d46"
      stroke="${PALETTE.mint}" stroke-width="7"/>
    ${character(460, 690, "alarmed", progress.enter)}
    <g transform="translate(1270 680)" opacity="${progress.detail}">
      <rect x="-330" y="-210" width="660" height="420" rx="54" fill="${PALETTE.raised}"
        stroke="${PALETTE.mint}" stroke-width="8"/>
      <path d="M-230 68 L-90 -42 L34 16 L142 -112 L240 -38" fill="none"
        stroke="${PALETTE.gold}" stroke-width="17" stroke-linejoin="round"/>
      ${text("ASSUMPTION: NOT FOUND", 0, 154, 25, PALETTE.coral)}
    </g>
  </g>`;
}

function progressFor(timeSeconds, durationSeconds) {
  const detailStart = Math.min(2.5, durationSeconds * 0.3);
  const resolveStart = Math.min(5.2, durationSeconds * 0.62);
  return {
    enter: phase(timeSeconds, 0, Math.min(1.18, durationSeconds * 0.22)),
    detail: phase(timeSeconds, detailStart, 1.08),
    resolve: phase(timeSeconds, resolveStart, 1.16),
  };
}

export function svgFrameKey(timeSeconds, durationSeconds, fps = 30) {
  const detailStart = Math.min(2.5, durationSeconds * 0.3);
  const resolveStart = Math.min(5.2, durationSeconds * 0.62);
  const windows = [[0, Math.min(1.18, durationSeconds * 0.22)], [detailStart, detailStart + 1.08],
    [resolveStart, resolveStart + 1.16]];
  const active = windows.findIndex(([start, end]) => timeSeconds >= start && timeSeconds <= end);
  if (active < 0) return `hold:${windows.filter(([, end]) => timeSeconds > end).length}`;
  return `motion:${active}:${Math.floor(timeSeconds * fps)}`;
}

export function assertSafeSvg(svg) {
  if (/<(?:script|foreignObject|iframe)\b/i.test(svg)) {
    throw new Error("Active SVG content is not allowed");
  }
  if (/\b(?:href|src)\s*=\s*["'](?:https?:|data:|javascript:)/i.test(svg)) {
    throw new Error("External or executable SVG references are not allowed");
  }
  return svg;
}

export function renderSvgScene(scene, timeSeconds, durationSeconds = 10) {
  const progress = progressFor(Math.max(0, timeSeconds), Math.max(0.1, durationSeconds));
  const titleLines = wrap(scene.title ?? scene.informationGoal ?? "Illustrated scene", 42, 2);
  const world =
    scene.kind === "equation"
      ? equationWorld(scene, progress)
      : scene.kind === "convolution"
        ? convolutionWorld(progress)
        : scene.kind === "scaling"
          ? scalingWorld(progress)
      : scene.kind === "comedy"
        ? comedyWorld(progress)
        : mechanismWorld(progress);
  return assertSafeSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}"
    viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="${escapeXml(titleLines.join(" "))}">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stop-color="${PALETTE.ink}"/><stop offset="1" stop-color="#252456"/>
      </linearGradient>
      <linearGradient id="accent-gradient" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" stop-color="${PALETTE.mint}"/><stop offset=".55"
          stop-color="${PALETTE.gold}"/><stop offset="1" stop-color="${PALETTE.coral}"/>
      </linearGradient>
      <radialGradient id="character-gradient" cx=".35" cy=".25">
        <stop offset="0" stop-color="#fff4a8"/><stop offset=".35" stop-color="${PALETTE.gold}"/>
        <stop offset="1" stop-color="#df9442"/>
      </radialGradient>
      <marker id="arrow" markerWidth="28" markerHeight="28" refX="23" refY="12"
        orient="auto" markerUnits="userSpaceOnUse">
        <path d="M0 0 L24 12 L0 24Z" fill="${PALETTE.gold}"/>
      </marker>
      <pattern id="technical-grid" width="72" height="72" patternUnits="userSpaceOnUse">
        <path d="M72 0 H0 V72" fill="none" stroke="${PALETTE.muted}"
          stroke-width="1" opacity=".16"/>
        <circle r="2.2" fill="${PALETTE.mint}" opacity=".26"/>
      </pattern>
      <clipPath id="world-clip"><rect x="86" y="300" width="1748" height="690" rx="64"/></clipPath>
    </defs>
    <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#sky)"/>
    <circle cx="1510" cy="570" r="510" fill="${PALETTE.mint}" opacity=".035"/>
    <rect x="86" y="300" width="1748" height="690" rx="64" fill="${PALETTE.ink}"
      stroke="${PALETTE.raised}" stroke-width="3"/>
    <rect x="86" y="300" width="1748" height="690" rx="64"
      fill="url(#technical-grid)" opacity=".72"/>
    ${world}
    <g>${titleLines.map((line, index) => text(line.toUpperCase(), 146,
      132 + index * 64, titleLines.join(" ").length > 58 ? 55 : 64, PALETTE.text,
      "start", 900)).join("")}
      <rect x="146" y="${164 + titleLines.length * 58}" width="210" height="8" rx="4"
        fill="url(#accent-gradient)"/>
    </g>
    ${text((scene.kind ?? "mechanism").toUpperCase(), 150, 1022, 18,
      PALETTE.muted, "start", 700)}
  </svg>`);
}

export function createSvgSceneAdapter({ rasterize }) {
  let bundle;
  let timeSeconds = 0;
  let raster;
  let key;
  return {
    async prepare(nextBundle) {
      bundle = nextBundle;
      key = undefined;
    },
    async seek(nextTime) {
      timeSeconds = Math.max(0, nextTime);
    },
    async render(target) {
      if (!bundle) throw new Error("SVG scene is not prepared");
      const duration = bundle.durationSeconds ?? 10;
      const nextKey = svgFrameKey(timeSeconds, duration);
      if (nextKey !== key) {
        raster = await rasterize(renderSvgScene(bundle.scene, timeSeconds, duration), target);
        key = nextKey;
      }
      target.draw(raster);
    },
    async snapshot(nextTime) {
      await this.seek(nextTime);
      return raster;
    },
    dispose() {
      raster?.close?.();
      raster = undefined;
      bundle = undefined;
    },
  };
}
