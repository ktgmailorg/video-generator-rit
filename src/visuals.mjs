const palettes = [
  ["#c7ff5b", "#72def5"],
  ["#ffca68", "#ff795d"],
  ["#72def5", "#b9a2ff"],
  ["#f09cff", "#72def5"],
  ["#c7ff5b", "#ffca68"],
  ["#72def5", "#c7ff5b"],
];

const xml = (value) =>
  String(value)
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const wrap = (value, width, maximumLines = 3) => {
  const lines = [];
  let current = "";
  for (const word of String(value).split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (current && next.length > width) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
    if (lines.length === maximumLines) break;
  }
  if (current && lines.length < maximumLines) lines.push(current);
  return lines;
};

function network(accent, secondary, frame) {
  const nodes = Array.from({ length: 34 }, (_, index) => {
    const angle = index * 1.79 + frame * 0.17;
    const radius = 100 + (index % 8) * 46;
    return {
      x: 960 + Math.cos(angle) * radius * 1.55,
      y: 450 + Math.sin(angle) * radius,
    };
  });
  const edges = nodes
    .map((node, index) => {
      const target = nodes[(index * 7 + 5) % nodes.length];
      return `<line x1="${node.x}" y1="${node.y}" x2="${target.x}" y2="${target.y}" stroke="${index % 3 ? secondary : accent}" stroke-opacity=".2" stroke-width="2"/>`;
    })
    .join("");
  const circles = nodes
    .map(
      (node, index) =>
        `<circle cx="${node.x}" cy="${node.y}" r="${index === frame % nodes.length ? 18 : 7}" fill="${index % 3 ? secondary : accent}" fill-opacity="${index === frame % nodes.length ? 1 : 0.58}"/>`,
    )
    .join("");
  return `<g>${edges}${circles}</g>`;
}

function landscape(accent, secondary, frame) {
  const dots = Array.from({ length: 130 }, (_, index) => {
    const x = 350 + ((index * 97 + frame * 19) % 1220);
    const y = 220 + ((index * 53 + frame * 31) % 470);
    return `<circle cx="${x}" cy="${y}" r="${2 + (index % 4)}" fill="${index % 5 ? secondary : accent}" fill-opacity=".35"/>`;
  }).join("");
  return `<g>${dots}<path d="M340 650 C560 160 730 730 980 370 S1360 220 1580 520" fill="none" stroke="${accent}" stroke-width="7" filter="url(#glow)"/><circle cx="${520 + (frame % 5) * 195}" cy="${560 - (frame % 3) * 88}" r="32" fill="${accent}" filter="url(#glow)"/></g>`;
}

function processLoop(accent, secondary, frame) {
  const labels = ["OBSERVE", "PREDICT", "COMPARE", "UPDATE"];
  const points = [
    [960, 270],
    [1240, 470],
    [960, 670],
    [680, 470],
  ];
  return `<g><circle cx="960" cy="470" r="292" fill="none" stroke="${secondary}" stroke-opacity=".35" stroke-width="4" stroke-dasharray="14 14"/>
    ${points
      .map(
        ([x, y], index) =>
          `<g><circle cx="${x}" cy="${y}" r="${index === frame % 4 ? 88 : 72}" fill="${index === frame % 4 ? accent : "#111714"}" stroke="${index === frame % 4 ? accent : secondary}" stroke-width="4" filter="${index === frame % 4 ? "url(#glow)" : ""}"/><text x="${x}" y="${y + 8}" text-anchor="middle" fill="${index === frame % 4 ? "#071008" : secondary}" font-family="monospace" font-size="23" font-weight="700">${labels[index]}</text></g>`,
      )
      .join("")}
    <text x="960" y="480" text-anchor="middle" fill="#f4f7f5" font-family="monospace" font-size="35">STATE → LESS WRONG</text>
  </g>`;
}

function bars(accent, secondary, frame) {
  const values = [28, 51, 73, 89];
  return `<g transform="translate(520 250)">${values
    .map(
      (value, index) =>
        `<g transform="translate(0 ${index * 120})"><rect width="850" height="62" rx="10" fill="#111714"/><rect width="${value * 8.5}" height="62" rx="10" fill="${index === frame % 4 ? accent : secondary}" fill-opacity="${index === frame % 4 ? 1 : 0.45}"/><text x="${value * 8.5 + 20}" y="42" fill="#f4f7f5" font-family="monospace" font-size="28">${value}%</text></g>`,
    )
    .join("")}</g>`;
}

export function shotSvg(section, shotIndex, shotCount, phrase, options = {}) {
  const [accent, secondary] =
    options.palette || palettes[section.index % palettes.length];
  const brand = options.brand || "VIDEO LAB";
  const equationLines = wrap(section.equations?.join("  ·  ") || "", 70, 2);
  const visual = [network, landscape, processLoop, bars][
    section.index % 4
  ](accent, secondary, shotIndex);
  const progress = ((shotIndex + 1) / shotCount) * 1640;
  const credit = 58 + section.index * 7;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#030505"/><stop offset=".55" stop-color="#080c0a"/><stop offset="1" stop-color="#030505"/></linearGradient>
      <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#52605a" stroke-opacity=".10"/></pattern>
      <filter id="glow"><feGaussianBlur stdDeviation="8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="1920" height="1080" fill="url(#bg)"/><rect width="1920" height="1080" fill="url(#grid)"/>
    <text x="96" y="82" fill="${accent}" font-size="25" font-family="monospace" letter-spacing="5">${xml(brand)}</text>
    <text x="1824" y="82" text-anchor="end" fill="#65716b" font-size="20" font-family="monospace">${String(section.index + 1).padStart(2, "0")} / ${section.totalSections}</text>
    <text x="96" y="140" fill="#f4f7f5" font-size="34" font-family="Arial" font-weight="700">${xml(section.title.toUpperCase())}</text>
    ${visual}
    <g transform="translate(96 205)"><rect width="280" height="150" rx="16" fill="#07100c" stroke="${accent}" stroke-opacity=".42"/><text x="20" y="33" fill="${accent}" font-size="13" font-family="monospace">CREDIT ASSIGNMENT</text><text x="20" y="77" fill="#f4f7f5" font-size="30" font-family="monospace">${credit}% TOTAL</text><text x="20" y="119" fill="${credit > 100 ? "#ff795d" : secondary}" font-size="12" font-family="monospace">${credit > 100 ? "ERROR: DOES NOT SUM TO ONE" : "CALIBRATING"}</text></g>
    ${equationLines.length ? `<g transform="translate(430 760)"><rect width="1060" height="${equationLines.length > 1 ? 112 : 82}" rx="14" fill="#060a08" stroke="${accent}" stroke-opacity=".45"/>${equationLines.map((line, index) => `<text x="530" y="${52 + index * 32}" text-anchor="middle" fill="#f4f7f5" font-size="25" font-family="monospace">${xml(line)}</text>`).join("")}</g>` : ""}
    <text x="960" y="900" text-anchor="middle" fill="#dce5e0" font-size="30" font-family="Arial">${xml(wrap(phrase, 88, 1)[0] || section.title)}</text>
    <rect x="96" y="1008" width="1640" height="4" rx="2" fill="#26302b"/><rect x="96" y="1008" width="${progress}" height="4" rx="2" fill="${accent}"/>
  </svg>`;
}

export function thumbnailSvg(options = {}) {
  const title = options.title || "HOW DOES IT LEARN?";
  const accent = options.accent || "#c7ff5b";
  const secondary = options.secondary || "#72def5";
  const [line1, line2 = ""] = wrap(title.toUpperCase(), 19, 2);
  const rings = Array.from(
    { length: 5 },
    (_, index) =>
      `<ellipse rx="${95 + index * 43}" ry="${68 + index * 31}" fill="none" stroke="${index % 2 ? secondary : accent}" stroke-width="${8 - index}" stroke-opacity="${0.82 - index * 0.11}" transform="rotate(${index * 23})"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#020303"/><stop offset="1" stop-color="#111a14"/></linearGradient><filter id="glow"><feGaussianBlur stdDeviation="10" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs><rect width="1280" height="720" fill="url(#bg)"/><text x="70" y="75" fill="${accent}" font-size="22" font-family="monospace" letter-spacing="4">${xml(options.brand || "VIDEO LAB")}</text><text x="70" y="250" fill="#f6f8f7" font-size="82" font-family="Arial" font-weight="900">${xml(line1)}</text><text x="70" y="350" fill="#f6f8f7" font-size="82" font-family="Arial" font-weight="900">${xml(line2)}</text><rect x="70" y="400" width="700" height="92" rx="12" fill="${accent}"/><text x="100" y="465" fill="#061008" font-size="54" font-family="Arial" font-weight="900">EXPLAINED VISUALLY</text><g transform="translate(1010 365)" filter="url(#glow)">${rings}<circle r="68" fill="${accent}"/><text y="20" text-anchor="middle" fill="#061008" font-size="64" font-family="monospace" font-weight="900">?</text></g></svg>`;
}

export function courseShotSvg(
  section,
  shotIndex,
  shotCount,
  phrase,
  options = {},
) {
  const [accent, secondary] =
    options.palette || palettes[section.index % palettes.length];
  const template = String(section.visualDirection || "").match(
    /^template:([a-z0-9-]+)\s*\|\s*(.*)$/i,
  );
  if (template) {
    section = {
      ...section,
      visualDirection: template[2],
    };
  }
  const resolvedTemplate = resolveCourseVisualTemplate({
    ...section,
    visualDirection: template
      ? `template:${template[1]} | ${section.visualDirection}`
      : section.visualDirection,
  });
  if (resolvedTemplate?.startsWith("showcase-")) {
    return showcaseCourseShotSvg(
      section,
      shotIndex,
      shotCount,
      phrase,
      {
        ...options,
        palette: [accent, secondary],
        template: resolvedTemplate,
      },
    );
  }
  if (resolvedTemplate?.startsWith("riscv-")) {
    return riscvCourseShotSvg(
      section,
      shotIndex,
      shotCount,
      phrase,
      {
        ...options,
        palette: [accent, secondary],
        template: resolvedTemplate,
      },
    );
  }
  const titleLines = wrap(section.title, 58, 2);
  const directionLines = wrap(
    section.visualDirection || "Instructor-authored visual direction",
    30,
    5,
  );
  const phraseLines = wrap(phrase || section.title, 30, 5);
  const equationLines = wrap(section.equations?.join(" · ") || "", 34, 3);
  const progress = ((shotIndex + 1) / shotCount) * 1640;
  const active = shotIndex % 3;
  const cards = [
    { label: "Visual focus", lines: directionLines, x: 96 },
    { label: "Key idea", lines: phraseLines, x: 656 },
    {
      label: equationLines.length ? "Equation" : "Learning connection",
      lines: equationLines.length
        ? equationLines
        : ["Connect this idea to", "the narrated explanation."],
      x: 1216,
    },
  ];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
    <defs>
      <linearGradient id="course-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#080808"/><stop offset="1" stop-color="#171717"/></linearGradient>
      <pattern id="course-grid" width="64" height="64" patternUnits="userSpaceOnUse"><path d="M64 0H0V64" fill="none" stroke="#ffffff" stroke-opacity=".035"/></pattern>
    </defs>
    <rect width="1920" height="1080" fill="url(#course-bg)"/>
    <rect width="1920" height="1080" fill="url(#course-grid)"/>
    <rect x="0" y="0" width="18" height="1080" fill="${accent}"/>
    <text x="96" y="78" fill="${accent}" font-size="22" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(options.brand || "COURSE VIDEO")}</text>
    <text x="1824" y="78" text-anchor="end" fill="#b8b8b8" font-size="20" font-family="Arial, Liberation Sans, sans-serif">Section ${section.index + 1} of ${section.totalSections}</text>
    ${titleLines.map((line, index) => `<text x="96" y="${158 + index * 58}" fill="#ffffff" font-size="48" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(line)}</text>`).join("")}
    <line x1="96" y1="280" x2="1824" y2="280" stroke="#ffffff" stroke-opacity=".16"/>
    ${cards.map((card, index) => `<g transform="translate(${card.x} 350)">
      <rect width="512" height="430" rx="18" fill="${index === active ? accent : "#202020"}" fill-opacity="${index === active ? ".14" : "1"}" stroke="${index === active ? accent : secondary}" stroke-opacity="${index === active ? "1" : ".42"}" stroke-width="${index === active ? "5" : "2"}"/>
      <text x="36" y="60" fill="${index === active ? accent : secondary}" font-size="20" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(card.label)}</text>
      ${card.lines.map((line, lineIndex) => `<text x="36" y="${135 + lineIndex * 54}" fill="#ffffff" font-size="${index === 2 && equationLines.length ? "25" : "28"}" font-family="${index === 2 && equationLines.length ? "Georgia, Liberation Serif, serif" : "Arial, Liberation Sans, sans-serif"}">${xml(line)}</text>`).join("")}
    </g>`).join("")}
    <path d="M608 565h32m-12-12 12 12-12 12M1168 565h32m-12-12 12 12-12 12" fill="none" stroke="${accent}" stroke-width="4"/>
    <text x="96" y="900" fill="#d8d8d8" font-size="26" font-family="Arial, Liberation Sans, sans-serif">Narration-aligned visual ${shotIndex + 1} of ${shotCount}</text>
    <rect x="96" y="980" width="1640" height="6" rx="3" fill="#3a3a3a"/><rect x="96" y="980" width="${progress}" height="6" rx="3" fill="${accent}"/>
  </svg>`;
}

const broadShowcaseTemplates = new Set([
  "showcase-algorithms",
  "showcase-interdisciplinary",
  "showcase-programming",
  "showcase-systems",
]);

export function resolveCourseVisualTemplate(section) {
  const direction = String(section.visualDirection || "");
  const declared = direction.match(
    /^template:([a-z0-9-]+)\s*\|\s*(.*)$/i,
  );
  const semanticSection = declared
    ? { ...section, visualDirection: declared[2] }
    : section;
  const inferred = inferAcademicTemplate(semanticSection);
  if (declared?.[1]?.startsWith("showcase-")) {
    return broadShowcaseTemplates.has(declared[1])
      ? inferred || declared[1]
      : declared[1];
  }
  if (declared?.[1]?.startsWith("riscv-")) return declared[1];
  if (declared?.[1] === "academic-process") {
    return inferred || "showcase-process";
  }
  return inferred;
}

function inferAcademicTemplate(section) {
  const text = `${section.title || ""} ${section.visualDirection || ""}`
    .toLowerCase()
    .replace(/^template:academic-process\s*\|\s*/i, "");
  const rules = [
    [/(?:loop invariant|prove correctness|correctness argument|analysis checklist|define i\/o|precondition|postcondition)/, "showcase-analysis-framework"],
    [/(?:recurrence|recursive|recursion tree|divide.and.conquer|master theorem)/, "showcase-recurrence"],
    [/(?:dynamic programming|table filling|memoization|tabulation|cell depends)/, "showcase-dynamic-programming"],
    [/(?:hash table|hashing|bucket|collision|chaining)/, "showcase-hash-table"],
    [/(?:breadth.first|depth.first|bfs|dfs|shortest path|graph (?:traversal|representation)|directed graph|adjacency (?:list|matrix)|search tree|frontier)/, "showcase-search"],
    [/(?:array|linked list|binary tree|heap|stack|queue|data structure|sparse list)/, "showcase-data-structures"],
    [/(?:asymptotic|big.o|complexity|growth rate|sorting algorithm|algorithm analysis)/, "showcase-algorithms"],
    [/(?:sql|database|relational|schema|entity.relationship|er diagram|primary key|foreign key|transaction|b.tree|query|normalization)/, "showcase-database"],
    [/(?:compiler|lexer|lexical|parser|grammar|syntax tree|semantic analysis|intermediate representation|llvm|bytecode)/, "showcase-compilers"],
    [/(?:cryptograph|cipher|encrypt|decrypt|aes|rsa|public.key|private.key|symmetric key|asymmetric key|quantum.resistant)/, "showcase-cryptography"],
    [/(?:object identity|object.oriented|namespace|scope|encapsulation|class hierarchy)/, "showcase-programming"],
    [/(?:packet|router|routing|tcp|udp|network layer|network protocol|packet encapsulat|network encapsulat)/, "showcase-networks"],
    [/(?:operating system|kernel|scheduler|process (?:state|scheduling|control block)|threads?|system call|virtual memory|page replacement)/, "showcase-operating-systems"],
    [/(?:distributed|consensus|replication|leader|follower|quorum|cloud computing)/, "showcase-distributed"],
    [/\b(?:cache|memory hierarchy|register file|ram|storage hierarchy|locality)\b/, "showcase-memory-hierarchy"],
    [/(?:raster|vertex shader|fragment shader|framebuffer|graphics pipeline|rendering pipeline)/, "showcase-process"],
    [/(?:instruction set|processor pipeline|cpu pipeline|processor|cpu|assembly language|microarchitecture)/, "showcase-circuits"],
    [/(?:finite state|state machine|automata|transition system)/, "showcase-state-machine"],
    [/(?:confusion matrix|precision|recall|true positive|false positive)/, "showcase-confusion-matrix"],
    [/(?:\b(?:test split|leakage|cross.validation|k.fold)\b|\btrain(?:ing)?\b.{0,90}\b(?:validation|test|split|fold)\b|\bvalidation\b.{0,90}\b(?:training|test|split|fold)\b)/, "showcase-data-split"],
    [/(?:machine learning|neural network|classification|regression|model selection)/, "showcase-model-ladder"],
    [/(?:threat model|attack surface|security boundary|adversary)/, "showcase-threat-model"],
    [/(?:phishing|credential theft|suspicious email)/, "showcase-phishing"],
    [/(?:malware|payload|sandbox|detection pipeline)/, "showcase-malware-pipeline"],
    [/(?:stakeholder|residents|community organizations|shared authority|decision makers)/, "showcase-stakeholders"],
    [/(?:fourier|frequency|signal|sampling|waveform|spectrum)/, "showcase-signals"],
    [/(?:derivative|slope|calculus|rate of change|gradient)/, "showcase-derivative"],
    [/(?:circuit|logic gate|voltage|current|resistor|capacitor)/, "showcase-circuits"],
    [/(?:function|variable|control flow|programming|debugging|object.oriented)/, "showcase-programming"],
    [/(?:hierarchy|taxonomy|tree diagram|levels)/, "showcase-hierarchy"],
    [/(?:flowchart|process diagram|sequence of steps|workflow|from .+? to .+? to|pipeline of steps)/, "showcase-process"],
    [/(?:table with columns|columns (?:for|labeled)|expected output|actual output|row and column|tabular)/, "showcase-table"],
    [/(?:checklist|requirements? list|verify each|eligibility|acceptance criteria)/, "showcase-checklist"],
    [/(?:timeline|chronolog|over time|life cycle|lifecycle|milestones?)/, "showcase-timeline"],
    [/(?:compare|comparison|contrast|versus|side.by.side|trade.?off)/, "showcase-comparison"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] || null;
}

function academicSceneLabel(template) {
  return (
    {
      "showcase-process": "Process model · follow each transformation",
      "showcase-table": "Evidence table · compare expected and observed results",
      "showcase-checklist": "Review checklist · verify each requirement",
      "showcase-timeline": "Evidence timeline · connect change and consequence",
      "showcase-comparison": "Structured comparison · distinguish trade-offs",
      "showcase-recurrence": "Recurrence model · expand and sum the work",
      "showcase-dynamic-programming": "Dependency model · reuse solved subproblems",
      "showcase-search": "Graph model · trace the frontier",
      "showcase-analysis-framework": "Analysis framework · claim, reason, and verify",
      "showcase-stakeholders": "Stakeholder map · connect roles, evidence, and authority",
      "showcase-oxygen": "Anatomy model · trace ventilation, diffusion, and transport",
      "showcase-mis": "Business system model · trace an order into a decision",
      "showcase-cryptography": "Cryptographic model · trace data, keys, and verification",
    }[template] || "Concept model · connect structure, evidence, and application"
  );
}

function academicDiagramLabels(section, limit, fallback) {
  const direction = String(section.visualDirection || "")
    .replace(/^template:[a-z0-9-]+\s*\|\s*/i, "")
    .replace(/[“”]/g, '"');
  const candidates = [];
  const fromChain = direction.match(/\bfrom\s+(.+?)(?:,|\.|;|$)/i)?.[1];
  if (fromChain && /\s+to\s+/i.test(fromChain)) {
    candidates.push(...fromChain.split(/\s+to\s+/i));
  }
  const columns = direction.match(
    /\bcolumns?\s+(?:for|labeled)\s+(.+?)(?:,?\s+(?:illustrating|showing|with)\b|\.|;|$)/i,
  )?.[1];
  if (columns) {
    candidates.push(...columns.split(/\s*,\s*|\s+and\s+/i));
  }
  const quoted = [...direction.matchAll(/["']([^"']{2,32})["']/g)].map(
    (match) => match[1],
  );
  if (candidates.length < 2 && quoted.length >= 2) candidates.push(...quoted);
  const parentheticalList = direction.match(/\(([^)]*,[^)]*)\)/)?.[1];
  if (candidates.length < 2 && parentheticalList) {
    candidates.push(...parentheticalList.split(/\s*,\s*|\s+and\s+/i));
  }
  if (candidates.length < 2) {
    const listed = direction
      .replace(
        /^(?:connect|show|present|organize|compare|trace|follow|build|place|arrange|move|map)\s+/i,
        "",
      )
      .split(/\b(?:in|around|through|with|as|while|before|then)\b|[.;]/i)[0];
    if ((listed.match(/,/g) || []).length >= 2 || /,?\s+and\s+/i.test(listed)) {
      candidates.push(...listed.split(/\s*,\s*|,?\s+and\s+/i));
    }
  }
  const labels = candidates
    .map((value) =>
      value
        .replace(/^(?:the|a|an|and|or)\s+/i, "")
        .replace(/\b(?:with|using|that|where)\b.*$/i, "")
        .replace(/[^a-z0-9+/# -]/gi, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 28)
        .toUpperCase(),
    )
    .filter((value, index, values) => value && values.indexOf(value) === index)
    .slice(0, limit);
  while (labels.length < Math.min(limit, fallback.length)) {
    const next = fallback[labels.length];
    if (!labels.includes(next)) labels.push(next);
    else break;
  }
  return labels;
}

function showcaseCourseShotSvg(
  section,
  shotIndex,
  shotCount,
  phrase,
  options,
) {
  const [accent, secondary] = options.palette;
  const progress = ((shotIndex + 1) / shotCount) * 1640;
  const phraseLine =
    wrap(phrase || section.title, 102, 1)[0] || section.title;
  const body = showcaseVisualBody(options.template, {
    accent,
    secondary,
    shotIndex,
    section,
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" data-visual-template="${xml(options.template)}">
    <defs>
      <linearGradient id="showcase-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#050505"/><stop offset=".6" stop-color="#141414"/><stop offset="1" stop-color="#080808"/></linearGradient>
      <pattern id="showcase-grid" width="56" height="56" patternUnits="userSpaceOnUse"><path d="M56 0H0V56" fill="none" stroke="#ffffff" stroke-opacity=".035"/></pattern>
      <marker id="showcase-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0 12 6 0 12z" fill="${accent}"/></marker>
      <filter id="showcase-glow"><feGaussianBlur stdDeviation="7" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    </defs>
    <rect width="1920" height="1080" fill="url(#showcase-bg)"/>
    <rect width="1920" height="1080" fill="url(#showcase-grid)"/>
    <rect width="18" height="1080" fill="${accent}"/>
    <text x="96" y="72" fill="${accent}" font-size="21" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(options.brand || "RIT COURSE DRAFT")}</text>
    <text x="1824" y="72" text-anchor="end" fill="${secondary}" font-size="19" font-family="Arial, Liberation Sans, sans-serif">Academic showcase · Section ${section.index + 1} of ${section.totalSections}</text>
    <text x="96" y="145" fill="#ffffff" font-size="49" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(section.title)}</text>
    <text x="96" y="202" fill="#cfd2d3" font-size="22" font-family="Arial, Liberation Sans, sans-serif">${xml(academicSceneLabel(options.template))}</text>
    <line x1="96" y1="248" x2="1824" y2="248" stroke="#ffffff" stroke-opacity=".15"/>
    ${body}
    <rect x="96" y="850" width="1728" height="72" rx="14" fill="#050505" stroke="${accent}" stroke-opacity=".38"/>
    <text x="960" y="896" text-anchor="middle" fill="#ffffff" font-size="28" font-family="Arial, Liberation Sans, sans-serif">${xml(phraseLine)}</text>
    <text x="96" y="956" fill="#bfc3c4" font-size="20" font-family="Arial, Liberation Sans, sans-serif">Narration-aligned visual ${shotIndex + 1} of ${shotCount}</text>
    <rect x="96" y="994" width="1640" height="6" rx="3" fill="#3a3a3a"/><rect x="96" y="994" width="${progress}" height="6" rx="3" fill="${accent}"/>
  </svg>`;
}

function showcaseVisualBody(
  template,
  { accent, secondary, shotIndex, section = {} },
) {
  const active = shotIndex % 4;
  const label = (x, y, value, size = 24, color = "#ffffff") =>
    `<text x="${x}" y="${y}" text-anchor="middle" fill="${color}" font-size="${size}" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(value)}</text>`;
  const box = (x, y, width, height, value, index = 0) =>
    `<g><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="18" fill="${index === active ? accent : "#202020"}" fill-opacity="${index === active ? ".18" : "1"}" stroke="${index === active ? accent : secondary}" stroke-width="${index === active ? 5 : 2}" stroke-opacity="${index === active ? 1 : .5}"/>${label(x + width / 2, y + height / 2 + 9, value, 25, index === active ? accent : "#ffffff")}</g>`;

  if (template === "showcase-mis") {
    if (section.index === 0) {
      const stages = ["CUSTOMER ORDER", "SALES REVIEW", "ORDER RECORD", "FULFILLMENT"];
      const systemParts = ["PEOPLE", "PROCESS", "DATA", "TECHNOLOGY"];
      return `<g>
        ${label(960, 315, "ONE BUSINESS EVENT, COORDINATED ACROSS THE ORGANIZATION", 25, accent)}
        ${stages.map((stage, index) => {
          const x = 118 + index * 445;
          return `${box(x, 390, 330, 150, stage, index)}${index < stages.length - 1 ? `<path d="M${x + 330} 465h95" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>` : ""}`;
        }).join("")}
        ${systemParts.map((part, index) => `<g opacity="${index === active ? 1 : .58}"><rect x="${190 + index * 390}" y="650" width="330" height="82" rx="41" fill="${index === active ? accent : "#202020"}" fill-opacity="${index === active ? .2 : 1}" stroke="${index === active ? accent : secondary}" stroke-width="${index === active ? 5 : 2}"/>${label(355 + index * 390, 702, part, 20, index === active ? accent : "#ffffff")}</g>`).join("")}
        ${label(960, 795, "People execute a process; data and technology keep every handoff visible", 21, secondary)}
      </g>`;
    }
    if (section.index === 1) {
      const fields = [
        ["order_id", "ORD-1042"],
        ["customer", "Monroe Cafe"],
        ["items", "12 units"],
        ["status", "Ready"],
      ];
      const consumers = ["INVENTORY", "BILLING", "FULFILLMENT"];
      return `<g>
        <rect x="145" y="305" width="600" height="475" rx="22" fill="#f4f4f1"/>
        <rect x="145" y="305" width="600" height="82" rx="22" fill="${accent}"/>
        ${label(445, 356, "TRUSTWORTHY ORDER RECORD", 23, "#111111")}
        ${fields.map(([name, value], index) => `<g><text x="190" y="${435 + index * 73}" fill="#3b3b3b" font-size="20" font-family="Arial, Liberation Sans, sans-serif">${xml(name)}</text><text x="410" y="${435 + index * 73}" fill="#111111" font-size="21" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(value)}</text><circle cx="690" cy="${427 + index * 73}" r="18" fill="#177245"/><path d="M681 ${427 + index * 73}l7 8 13-17" fill="none" stroke="#ffffff" stroke-width="4"/></g>`).join("")}
        <path d="M745 540h180" stroke="${accent}" stroke-width="8" marker-end="url(#showcase-arrow)"/>
        <rect x="955" y="405" width="285" height="270" rx="140" fill="${accent}" fill-opacity=".13" stroke="${accent}" stroke-width="6"/>
        ${label(1098, 500, "VALIDATE", 26, accent)}
        ${label(1098, 550, "CONNECT", 23, "#ffffff")}
        ${label(1098, 600, "PROTECT", 23, secondary)}
        <path d="M1240 540h130" stroke="${accent}" stroke-width="8" marker-end="url(#showcase-arrow)"/>
        ${consumers.map((name, index) => box(1415, 325 + index * 155, 330, 105, name, index)).join("")}
        ${label(960, 815, "One reliable record supports every team without conflicting versions", 22, secondary)}
      </g>`;
    }
    const metrics = [
      ["ON-TIME", "92%"],
      ["IN STOCK", "87%"],
      ["EXCEPTIONS", "14"],
      ["SATISFACTION", "4.6 / 5"],
    ];
    const bars = [150, 245, 205, 315, 270, 350];
    return `<g>
      ${metrics.map(([name, value], index) => `<g><rect x="${120 + index * 430}" y="300" width="370" height="135" rx="18" fill="${index === active ? accent : "#202020"}" fill-opacity="${index === active ? .18 : 1}" stroke="${index === active ? accent : secondary}" stroke-width="${index === active ? 6 : 2}"/><text x="${150 + index * 430}" y="345" fill="${secondary}" font-size="18" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(name)}</text><text x="${150 + index * 430}" y="402" fill="${index === active ? accent : "#ffffff"}" font-size="38" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(value)}</text></g>`).join("")}
      <rect x="120" y="485" width="960" height="280" rx="20" fill="#171717" stroke="${secondary}" stroke-opacity=".5"/>
      ${bars.map((height, index) => `<rect x="${190 + index * 135}" y="${730 - height * .62}" width="78" height="${height * .62}" rx="8" fill="${index === active % bars.length ? accent : secondary}" fill-opacity="${index === active % bars.length ? 1 : .48}"/>`).join("")}
      ${label(600, 800, "FULFILLMENT TREND", 20, secondary)}
      <rect x="1190" y="500" width="555" height="190" rx="24" fill="${accent}" fill-opacity=".13" stroke="${accent}" stroke-width="6"/>
      ${label(1468, 560, "MANAGERIAL DECISION", 24, accent)}
      ${label(1468, 615, "Adjust staffing or inventory rules", 20, "#ffffff")}
      <path d="M1468 690v88H960" fill="none" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>
      ${label(1395, 810, "FEEDBACK IMPROVES THE PROCESS", 21, secondary)}
    </g>`;
  }

  if (template === "showcase-process") {
    const stages = academicDiagramLabels(section, 4, [
      "QUESTION",
      "REPRESENT",
      "REASON",
      "VERIFY",
    ]);
    return `<g>
      ${stages.map((stage, index) => {
        const x = 120 + index * 445;
        return `${box(x, 420, 330, 170, stage, index)}${
          index < stages.length - 1
            ? `<path d="M${x + 330} 505h95" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>`
            : ""
        }`;
      }).join("")}
      ${label(960, 330, "TRACE THE TRANSFORMATION", 27, accent)}
      ${label(960, 745, "Each arrow carries a result that the next step can inspect", 22, secondary)}
    </g>`;
  }
  if (template === "showcase-stakeholders") {
    const stakeholders = academicDiagramLabels(section, 4, [
      "LEARNERS",
      "FACULTY",
      "STAFF",
      "PARTNERS",
    ]);
    const positions = [
      [370, 395],
      [370, 650],
      [1370, 395],
      [1370, 650],
    ];
    return `<g>
      ${positions.map(([x, y], index) => `${box(x - 190, y - 72, 380, 144, stakeholders[index], index)}<path d="M${x < 960 ? x + 200 : x - 200} ${y}L${x < 960 ? 780 : 1140} ${y < 520 ? 480 : 570}" stroke="${index === active ? accent : secondary}" stroke-width="${index === active ? 7 : 4}" marker-end="url(#showcase-arrow)"/>`).join("")}
      <circle cx="960" cy="525" r="166" fill="${accent}" fill-opacity=".13" stroke="${accent}" stroke-width="7"/>
      ${label(960, 505, "SHARED", 28, accent)}
      ${label(960, 548, "DECISION", 28, "#ffffff")}
      ${label(960, 720, "PEOPLE + EVIDENCE + AUTHORITY", 23, accent)}
    </g>`;
  }
  if (template === "showcase-table") {
    const headers = academicDiagramLabels(section, 4, [
      "CASE",
      "EXPECTED",
      "OBSERVED",
      "STATUS",
    ]);
    const x = 150;
    const y = 330;
    const width = 405;
    const rowHeight = 112;
    return `<g>
      ${headers.map((header, index) => `<g>
        <rect x="${x + index * width}" y="${y}" width="${width - 10}" height="${rowHeight}" rx="12" fill="${index === active % 4 ? accent : "#202020"}" fill-opacity="${index === active % 4 ? .2 : 1}" stroke="${index === active % 4 ? accent : secondary}" stroke-width="${index === active % 4 ? 6 : 3}"/>
        ${label(x + index * width + (width - 10) / 2, y + 68, header, 20, index === active % 4 ? accent : "#ffffff")}
      </g>`).join("")}
      ${[1, 2, 3].map((row) => headers.map((_, column) => {
        const values = ["TEST " + row, row === 2 ? "EDGE CASE" : "DEFINED", row === 3 ? "REVIEW" : "MATCH", row === 3 ? "CHECK" : "PASS"];
        return `<rect x="${x + column * width}" y="${y + row * rowHeight}" width="${width - 10}" height="${rowHeight - 10}" rx="10" fill="#151515" stroke="#ffffff" stroke-opacity=".18"/>${label(x + column * width + (width - 10) / 2, y + row * rowHeight + 62, values[column], 18, column === 3 ? accent : secondary)}`;
      }).join("")).join("")}
      ${label(960, 790, "COMPARE THE CLAIM WITH OBSERVABLE EVIDENCE", 23, accent)}
    </g>`;
  }
  if (template === "showcase-checklist") {
    const items = academicDiagramLabels(section, 3, [
      "REQUIREMENT",
      "EVIDENCE",
      "REVIEW",
    ]);
    return `<g>
      ${items.map((item, index) => {
        const y = 340 + index * 145;
        const selected = index === active % items.length;
        return `<rect x="330" y="${y}" width="1260" height="112" rx="18" fill="${selected ? accent : "#202020"}" fill-opacity="${selected ? .18 : 1}" stroke="${selected ? accent : secondary}" stroke-width="${selected ? 6 : 3}"/><circle cx="405" cy="${y + 56}" r="27" fill="none" stroke="${selected ? accent : secondary}" stroke-width="5"/><path d="M390 ${y + 55}l12 14 25-31" fill="none" stroke="${selected ? accent : secondary}" stroke-width="6"/>${label(960, y + 65, item, 24, selected ? accent : "#ffffff")}`;
      }).join("")}
      ${label(960, 800, "REQUIREMENT → EVIDENCE → APPROVAL", 24, accent)}
    </g>`;
  }
  if (template === "showcase-timeline") {
    const milestones = academicDiagramLabels(section, 4, [
      "CONTEXT",
      "CHANGE",
      "EVIDENCE",
      "IMPACT",
    ]);
    return `<g>
      <line x1="250" y1="540" x2="1670" y2="540" stroke="${secondary}" stroke-width="6"/>
      ${milestones.map((milestone, index) => {
        const x = 300 + index * 450;
        const selected = index === active % milestones.length;
        return `<circle cx="${x}" cy="540" r="${selected ? 54 : 39}" fill="${selected ? accent : "#202020"}" fill-opacity="${selected ? .25 : 1}" stroke="${selected ? accent : secondary}" stroke-width="${selected ? 8 : 4}"/>${label(x, index % 2 ? 685 : 405, milestone, 22, selected ? accent : "#ffffff")}`;
      }).join("")}
      ${label(960, 800, "CONNECT EVENTS TO EVIDENCE AND CONSEQUENCES", 23, accent)}
    </g>`;
  }

  if (template === "showcase-resonance") {
    const points = Array.from({ length: 55 }, (_, index) => {
      const x = 250 + index * 25;
      const ratio = index / 54;
      const y = 670 - 320 * Math.exp(-((ratio - 0.62) ** 2) / 0.012);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return `<g>
      <line x1="250" y1="700" x2="1650" y2="700" stroke="#ffffff" stroke-opacity=".45" stroke-width="3"/>
      <line x1="250" y1="700" x2="250" y2="330" stroke="#ffffff" stroke-opacity=".45" stroke-width="3"/>
      <polyline points="${points}" fill="none" stroke="${accent}" stroke-width="9" filter="url(#showcase-glow)"/>
      <line x1="1118" y1="330" x2="1118" y2="700" stroke="${secondary}" stroke-width="4" stroke-dasharray="14 12"/>
      ${label(1118, 306, "RESONANT REGION", 23, secondary)}
      ${label(950, 770, "DRIVING FREQUENCY", 22, "#cfd2d3")}
      <text x="185" y="535" transform="rotate(-90 185 535)" text-anchor="middle" fill="#cfd2d3" font-size="22" font-family="Arial">RESPONSE AMPLITUDE</text>
    </g>`;
  }
  if (template === "showcase-pid") {
    return `<g>
      ${box(180, 455, 250, 120, "SETPOINT", 0)}
      ${box(620, 415, 330, 200, "PID CONTROLLER", 1)}
      ${box(1140, 455, 260, 120, "SYSTEM", 2)}
      ${box(1530, 455, 210, 120, "OUTPUT", 3)}
      <path d="M430 515h170M950 515h170M1400 515h110" stroke="${accent}" stroke-width="7" fill="none" marker-end="url(#showcase-arrow)"/>
      <path d="M1635 575v190H525V575" stroke="${secondary}" stroke-width="5" fill="none" marker-end="url(#showcase-arrow)"/>
      ${label(1080, 805, "MEASURE → COMPARE → CORRECT", 24, secondary)}
      <text x="785" y="485" text-anchor="middle" fill="#ffffff" font-size="24" font-family="Georgia">Kₚe + Kᵢ∫e dt + K_d de/dt</text>
    </g>`;
  }
  if (template === "showcase-spectroscopy") {
    const lines = [
      [400, "#ff4d4d"],
      [545, "#ffca68"],
      [705, "#c7ff5b"],
      [920, "#72def5"],
      [1110, "#6699ff"],
      [1380, "#b06cff"],
      [1510, "#f09cff"],
    ];
    return `<g>
      <rect x="250" y="350" width="1400" height="360" rx="22" fill="#020202" stroke="${secondary}" stroke-opacity=".45"/>
      ${lines.map(([x, color], index) => `<rect x="${x}" y="${385 + (index % 2) * 30}" width="${index === active ? 14 : 8}" height="${270 - (index % 2) * 55}" fill="${color}" filter="${index === active ? "url(#showcase-glow)" : ""}"/>`).join("")}
      ${label(950, 785, "WAVELENGTH →", 22, "#cfd2d3")}
      ${label(950, 320, "A SPECTRAL FINGERPRINT", 28, accent)}
    </g>`;
  }
  if (template === "showcase-hierarchy") {
    return `<g>
      <rect x="270" y="320" width="1380" height="450" rx="24" fill="#f7f7f4"/>
      <text x="350" y="440" fill="#111111" font-size="78" font-family="Arial" font-weight="900">THE MAIN IDEA</text>
      <text x="350" y="525" fill="#333333" font-size="38" font-family="Arial" font-weight="700">Supporting context establishes meaning</text>
      <text x="350" y="600" fill="#555555" font-size="25" font-family="Arial">Body copy carries the details at a comfortable reading size.</text>
      <rect x="350" y="650" width="300" height="64" rx="9" fill="${accent}"/>
      ${label(500, 692, "NEXT ACTION", 21, "#111111")}
      <path d="M1490 390h90v250h-90" fill="none" stroke="${secondary}" stroke-width="5"/>
      ${label(1535, 690, "SCALE + CONTRAST + POSITION", 18, secondary)}
    </g>`;
  }
  if (template === "showcase-contribution-margin") {
    const sales = 1000;
    const variable = 600;
    const contribution = sales - variable;
    return `<g>
      ${box(220, 365, 330, 150, "SALES  $1,000", 0)}
      <path d="M570 440h135" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>
      ${box(725, 365, 360, 150, "VARIABLE  $600", 1)}
      <path d="M1105 440h135" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>
      ${box(1260, 365, 420, 150, "CONTRIBUTION  $400", 2)}
      <rect x="390" y="650" width="1140" height="80" rx="14" fill="#202020"/>
      <rect x="390" y="650" width="${1140 * (variable / sales)}" height="80" rx="14" fill="${secondary}" fill-opacity=".55"/>
      <rect x="${390 + 1140 * (variable / sales)}" y="650" width="${1140 * (contribution / sales)}" height="80" rx="14" fill="${accent}"/>
      ${label(730, 780, "VARIABLE COSTS", 20, secondary)}
      ${label(1300, 780, "FIXED COSTS, THEN PROFIT", 20, accent)}
    </g>`;
  }
  if (template === "showcase-primary-source") {
    return `<g>
      <rect x="220" y="330" width="520" height="440" rx="16" fill="#f3efe5" transform="rotate(-2 480 550)"/>
      <path d="M300 420h350M300 470h300M300 520h330M300 570h270M300 620h340" stroke="#5a5145" stroke-width="12" stroke-linecap="round" opacity=".65"/>
      ${box(930, 330, 300, 125, "OBSERVE", 0)}
      ${box(1325, 330, 300, 125, "REFLECT", 1)}
      ${box(930, 570, 300, 125, "QUESTION", 2)}
      ${box(1325, 570, 300, 125, "INVESTIGATE", 3)}
      <path d="M740 550h150M1230 392h75M1230 632h75" stroke="${accent}" stroke-width="6" marker-end="url(#showcase-arrow)"/>
    </g>`;
  }
  if (template === "showcase-derivative") {
    const curve = Array.from({ length: 61 }, (_, index) => {
      const x = 300 + index * 22;
      const y = 700 - 0.00092 * (x - 960) ** 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    const ax = 820;
    const ay = 700 - 0.00092 * (ax - 960) ** 2;
    const bx = [1420, 1190, 1010, 890][active];
    const by = 700 - 0.00092 * (bx - 960) ** 2;
    const slope = (by - ay) / (bx - ax);
    const lineY1 = ay + slope * (260 - ax);
    const lineY2 = ay + slope * (1640 - ax);
    return `<g>
      <line x1="260" y1="730" x2="1640" y2="730" stroke="#ffffff" stroke-opacity=".42" stroke-width="3"/>
      <line x1="960" y1="315" x2="960" y2="770" stroke="#ffffff" stroke-opacity=".22" stroke-width="3"/>
      <polyline points="${curve}" fill="none" stroke="${secondary}" stroke-width="8"/>
      <line x1="260" y1="${lineY1.toFixed(1)}" x2="1640" y2="${lineY2.toFixed(1)}" stroke="${accent}" stroke-width="7" filter="url(#showcase-glow)"/>
      <circle cx="${ax}" cy="${ay.toFixed(1)}" r="16" fill="${accent}"/>
      <circle cx="${bx}" cy="${by.toFixed(1)}" r="16" fill="${accent}"/>
      <path d="M${ax} 760H${bx}" stroke="${accent}" stroke-width="4" stroke-dasharray="12 10"/>
      ${label((ax + bx) / 2, 805, active >= 2 ? "h → 0" : "INTERVAL h", 23, accent)}
      ${label(960, 305, active >= 2 ? "TANGENT: INSTANTANEOUS SLOPE" : "SECANT: AVERAGE SLOPE", 25, "#ffffff")}
    </g>`;
  }
  if (template === "showcase-phishing") {
    return `<g>
      <rect x="210" y="315" width="900" height="470" rx="24" fill="#f7f7f4"/>
      <rect x="210" y="315" width="900" height="74" rx="24" fill="#e9ecef"/>
      <circle cx="260" cy="352" r="10" fill="#e15241"/><circle cx="294" cy="352" r="10" fill="#e0a126"/><circle cx="328" cy="352" r="10" fill="#5ca65c"/>
      <text x="270" y="445" fill="#1d1d1d" font-size="27" font-family="Arial" font-weight="700">From: account-alert@rit-support.example</text>
      <text x="270" y="500" fill="#8d1f14" font-size="34" font-family="Arial" font-weight="900">URGENT: VERIFY NOW</text>
      <text x="270" y="555" fill="#333333" font-size="25" font-family="Arial">Your access expires today. Confirm your password.</text>
      <rect x="270" y="615" width="310" height="78" rx="12" fill="#b42318"/>
      ${label(425, 664, "OPEN SECURE LINK", 22, "#ffffff")}
      <text x="270" y="744" fill="#555555" font-size="22" font-family="Arial">Unexpected request · look-alike sender · pressure</text>
      ${box(1230, 330, 440, 105, "1  PAUSE", 0)}
      ${box(1230, 465, 440, 105, "2  VERIFY INDEPENDENTLY", 1)}
      ${box(1230, 600, 440, 105, "3  REPORT + REMOVE", 2)}
      <path d="M1110 550h90" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>
    </g>`;
  }
  if (template === "showcase-malware-pipeline") {
    const stages = ["SAMPLE", "ARTIFACTS", "FEATURES", "MODEL", "ACTION"];
    return `<g>
      ${stages
        .map((stage, index) => {
          const x = 105 + index * 350;
          return `${box(x, 420, 265, 150, stage, index)}${
            index < stages.length - 1
              ? `<path d="M${x + 265} 495h65" stroke="${accent}" stroke-width="6" marker-end="url(#showcase-arrow)"/>`
              : ""
          }`;
        })
        .join("")}
      ${label(960, 330, "OBSERVE → REPRESENT → SCORE → DECIDE", 27, accent)}
      ${label(960, 665, "Version evidence, extraction, model, threshold, and response", 22, secondary)}
      <rect x="390" y="710" width="1140" height="72" rx="14" fill="#202020" stroke="${secondary}" stroke-width="3"/>
      ${label(960, 756, "Prediction supports a decision; it does not replace policy", 22, "#ffffff")}
    </g>`;
  }
  if (template === "showcase-comparison") {
    const names = academicDiagramLabels(section, 3, [
      "OPTION A",
      "OPTION B",
      "DECISION",
    ]);
    const columns = names.map((name, index) => [
      name,
      ["DEFINITION", "EVIDENCE", "TRADE-OFF"][index] || "EVIDENCE",
      ["WHEN IT FITS", "LIMITS", "SELECTION RULE"][index] || "LIMITS",
    ]);
    return `<g>
      ${columns
        .map(([name, evidence, strength], index) => {
          const x = 170 + index * 550;
          const selected = index === active % 3;
          return `<g>
            <rect x="${x}" y="320" width="470" height="420" rx="22" fill="${selected ? accent : "#202020"}" fill-opacity="${selected ? ".16" : "1"}" stroke="${selected ? accent : secondary}" stroke-width="${selected ? 6 : 3}"/>
            ${label(x + 235, 390, name, 27, selected ? accent : "#ffffff")}
            ${label(x + 235, 485, evidence.toUpperCase(), 21, secondary)}
            <line x1="${x + 70}" y1="530" x2="${x + 400}" y2="530" stroke="#ffffff" stroke-opacity=".18"/>
            ${label(x + 235, 605, strength.toUpperCase(), 19, "#ffffff")}
            ${label(x + 235, 685, "LIMITS REMAIN", 18, selected ? accent : "#aeb3b5")}
          </g>`;
        })
        .join("")}
      ${label(960, 805, "COMPARE UNDER THE SAME ASSUMPTIONS AND EVIDENCE", 23, accent)}
    </g>`;
  }
  if (template === "showcase-data-split") {
    const groups = [
      ["TRAIN", "fit parameters", 170, 760],
      ["VALIDATE", "select + tune", 860, 430],
      ["TEST", "one final estimate", 1340, 360],
    ];
    return `<g>
      ${groups
        .map(([name, purpose, x, width], index) => `<g>
          <rect x="${x}" y="390" width="${width}" height="230" rx="22" fill="${index === active % 3 ? accent : "#202020"}" fill-opacity="${index === active % 3 ? ".18" : "1"}" stroke="${index === active % 3 ? accent : secondary}" stroke-width="${index === active % 3 ? 6 : 3}"/>
          ${label(Number(x) + Number(width) / 2, 475, name, 28, index === active % 3 ? accent : "#ffffff")}
          ${label(Number(x) + Number(width) / 2, 545, purpose.toUpperCase(), 19, secondary)}
        </g>`)
        .join("")}
      ${label(960, 320, "GROUP RELATED SAMPLES BEFORE SPLITTING", 27, accent)}
      ${label(960, 700, "No duplicate families, future information, or fitted preprocessing crosses the boundary", 21, "#ffffff")}
      <path d="M950 650v100M1310 650v100" stroke="${accent}" stroke-width="5" stroke-dasharray="12 10"/>
    </g>`;
  }
  if (template === "showcase-model-ladder") {
    const models = ["MAJORITY", "SIMPLE RULE", "LINEAR MODEL", "SVM / TREES", "NEURAL MODEL"];
    return `<g>
      ${models
        .map((model, index) => {
          const width = 500 + index * 235;
          const x = 960 - width / 2;
          const y = 710 - index * 88;
          const selected = index === active;
          return `<rect x="${x}" y="${y}" width="${width}" height="66" rx="12" fill="${selected ? accent : "#202020"}" fill-opacity="${selected ? ".22" : "1"}" stroke="${selected ? accent : secondary}" stroke-width="${selected ? 6 : 2}"/>${label(960, y + 43, model, 20, selected ? accent : "#ffffff")}`;
        })
        .join("")}
      ${label(960, 300, "JUSTIFY EACH STEP UP IN COMPLEXITY", 27, accent)}
      ${label(960, 805, "Compare under the same data split, features, threshold rule, and costs", 21, secondary)}
    </g>`;
  }
  if (template === "showcase-confusion-matrix") {
    const cells = [
      ["TRUE POSITIVE", "malware → alert", 430, 385, 0],
      ["FALSE NEGATIVE", "malware → missed", 970, 385, 1],
      ["FALSE POSITIVE", "benign → alert", 430, 600, 2],
      ["TRUE NEGATIVE", "benign → clear", 970, 600, 3],
    ];
    return `<g>
      ${cells.map(([name, detail, x, y, index]) => `<g>
        <rect x="${x}" y="${y}" width="510" height="175" rx="18" fill="${index === active ? accent : "#202020"}" fill-opacity="${index === active ? ".18" : "1"}" stroke="${index === active ? accent : secondary}" stroke-width="${index === active ? 6 : 3}"/>
        ${label(Number(x) + 255, Number(y) + 67, name, 23, index === active ? accent : "#ffffff")}
        ${label(Number(x) + 255, Number(y) + 119, detail.toUpperCase(), 18, secondary)}
      </g>`).join("")}
      ${label(960, 320, "PREDICTION OUTCOMES HAVE OPERATIONAL COSTS", 27, accent)}
      ${label(960, 820, "Choose the threshold with prevalence, analyst capacity, and error cost in view", 21, "#ffffff")}
    </g>`;
  }
  if (template === "showcase-error-analysis") {
    return `<g>
      <rect x="230" y="330" width="900" height="430" rx="22" fill="#202020" stroke="${secondary}" stroke-width="3"/>
      ${["FAMILY", "ENVIRONMENT", "ARTIFACT", "TIME"].map((name, index) => `${box(290 + (index % 2) * 400, 390 + Math.floor(index / 2) * 170, 330, 110, name, index)}`).join("")}
      <circle cx="1410" cy="505" r="145" fill="${accent}" fill-opacity=".1" stroke="${accent}" stroke-width="8"/>
      <path d="M1515 610l185 155" stroke="${accent}" stroke-width="22" stroke-linecap="round"/>
      ${label(1410, 495, "ERROR", 27, "#ffffff")}
      ${label(1410, 535, "REVIEW", 27, accent)}
      ${label(960, 810, "Find recurring failure modes, shortcuts, missing evidence, and label errors", 22, secondary)}
    </g>`;
  }
  if (template === "showcase-threat-model") {
    return `<g>
      <rect x="715" y="405" width="490" height="230" rx="28" fill="#202020" stroke="${accent}" stroke-width="7"/>
      ${label(960, 500, "ML SYSTEM", 31, "#ffffff")}
      ${label(960, 555, "DATA → MODEL → SCORE", 21, accent)}
      ${box(170, 350, 360, 130, "POISONING", 0)}
      ${box(170, 610, 360, 130, "PRIVACY", 1)}
      ${box(1390, 350, 360, 130, "EVASION", 2)}
      ${box(1390, 610, 360, 130, "EXTRACTION", 3)}
      <path d="M530 415h165M530 675h165M1390 415h-165M1390 675h-165" stroke="${accent}" stroke-width="6" marker-end="url(#showcase-arrow)"/>
      ${label(960, 780, "ATTACKER GOAL • KNOWLEDGE • CAPABILITY • LIFE-CYCLE STAGE", 22, secondary)}
    </g>`;
  }
  if (template === "showcase-observability") {
    const records = ["EXTRACTOR", "MODEL DIGEST", "THRESHOLD", "OUTCOME"];
    return `<g>
      ${records.map((record, index) => `${box(155 + index * 425, 390, 335, 140, record, index)}${index < records.length - 1 ? `<path d="M${490 + index * 425} 460h70" stroke="${accent}" stroke-width="6" marker-end="url(#showcase-arrow)"/>` : ""}`).join("")}
      <polyline points="210,700 400,650 580,690 760,580 940,625 1120,555 1300,610 1490,520 1700,550" fill="none" stroke="${accent}" stroke-width="7"/>
      <line x1="210" y1="730" x2="1700" y2="730" stroke="#ffffff" stroke-opacity=".35" stroke-width="3"/>
      ${label(960, 325, "TRACE EVERY DECISION; MONITOR HOW DATA CHANGES", 27, accent)}
      ${label(960, 805, "A drift signal triggers investigation, not silent retraining", 22, secondary)}
    </g>`;
  }
  if (template === "showcase-exposure") {
    const corners = [
      [960, 330, "APERTURE", "DEPTH OF FIELD"],
      [520, 720, "SHUTTER", "MOTION"],
      [1400, 720, "ISO", "NOISE"],
    ];
    return `<g>
      <path d="M960 350L555 700H1365Z" fill="${accent}" fill-opacity=".06" stroke="${secondary}" stroke-width="6"/>
      ${corners.map(([x, y, title, effect], index) => `<g>
        <circle cx="${x}" cy="${y}" r="${index === active % 3 ? 112 : 96}" fill="${index === active % 3 ? accent : "#202020"}" fill-opacity="${index === active % 3 ? ".2" : "1"}" stroke="${index === active % 3 ? accent : secondary}" stroke-width="${index === active % 3 ? 7 : 3}"/>
        ${label(x, y - 8, title, 25, index === active % 3 ? accent : "#ffffff")}
        ${label(x, y + 30, effect, 18, "#cfd2d3")}
      </g>`).join("")}
      <circle cx="960" cy="570" r="120" fill="#050505" stroke="${accent}" stroke-width="5"/>
      ${label(960, 560, "EXPOSURE", 28, "#ffffff")}
      ${label(960, 598, "BALANCE", 24, accent)}
      <path d="M858 510L700 430M1062 510l158-80M885 650l-160 80M1035 650l160 80" stroke="${accent}" stroke-width="4" stroke-dasharray="12 10"/>
    </g>`;
  }
  if (template === "showcase-correlation") {
    const dots = [
      [320, 700], [405, 650], [470, 675], [545, 590], [620, 610],
      [690, 525], [760, 545], [830, 450], [890, 480],
    ];
    return `<g>
      <rect x="220" y="330" width="760" height="440" rx="20" fill="#151515" stroke="${secondary}" stroke-width="3"/>
      <line x1="300" y1="710" x2="900" y2="710" stroke="#ffffff" stroke-opacity=".45" stroke-width="3"/>
      <line x1="300" y1="710" x2="300" y2="390" stroke="#ffffff" stroke-opacity=".45" stroke-width="3"/>
      ${dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="13" fill="${accent}"/>`).join("")}
      <path d="M320 700L900 430" stroke="${accent}" stroke-width="5" stroke-dasharray="14 10"/>
      ${label(600, 815, "RELATIONSHIP ≠ CAUSAL ARROW", 22, accent)}
      ${box(1240, 330, 420, 110, "TEMPERATURE", 0)}
      ${box(1080, 650, 350, 110, "ICE-CREAM SALES", 1)}
      ${box(1470, 650, 300, 110, "REPORTED CRIME", 2)}
      <path d="M1370 440l-120 185M1510 440l100 185" stroke="${accent}" stroke-width="6" marker-end="url(#showcase-arrow)"/>
      ${label(1450, 550, "POSSIBLE CONFOUNDER", 21, secondary)}
    </g>`;
  }
  if (template === "showcase-oxygen") {
    const phase = active % 3;
    const cells = [1110, 1240, 1370, 1500, 1630];
    const alveoli = [
      [1260, 430],
      [1325, 390],
      [1390, 430],
      [1295, 495],
      [1360, 505],
      [1425, 495],
    ];
    return `<g>
      <path d="M610 270v175M610 390C560 430 520 455 470 500M610 390c50 40 90 65 140 110" fill="none" stroke="${phase === 0 ? accent : secondary}" stroke-width="28" stroke-linecap="round"/>
      <path d="M570 388C420 350 275 420 235 575c-30 118 20 215 130 230 125 17 205-90 205-230z" fill="${accent}" fill-opacity="${phase === 0 ? .24 : .11}" stroke="${phase === 0 ? accent : secondary}" stroke-width="7"/>
      <path d="M650 388c150-38 295 32 335 187 30 118-20 215-130 230-125 17-205-90-205-230z" fill="${accent}" fill-opacity="${phase === 0 ? .24 : .11}" stroke="${phase === 0 ? accent : secondary}" stroke-width="7"/>
      <path d="M470 500l-95 90m95-90-25 170m305-170 95 90m-95-90 25 170" fill="none" stroke="${secondary}" stroke-width="12" stroke-linecap="round"/>
      ${label(420, 315, "TRACHEA + BRONCHI", 19, secondary)}
      <path d="M520 322h58" stroke="${secondary}" stroke-width="3"/>
      ${label(610, 820, "VENTILATION BRINGS AIR TO THE LUNGS", 24, phase === 0 ? accent : "#ffffff")}

      <path d="M985 560C1080 530 1125 485 1210 450" fill="none" stroke="${accent}" stroke-width="7" stroke-dasharray="14 10" marker-end="url(#showcase-arrow)"/>
      <circle cx="1360" cy="455" r="205" fill="#101719" stroke="${phase === 1 ? accent : secondary}" stroke-width="${phase === 1 ? 8 : 5}"/>
      ${alveoli.map(([x, y], index) => `<circle cx="${x}" cy="${y}" r="52" fill="${secondary}" fill-opacity="${phase === 1 ? .22 : .11}" stroke="${index === phase * 2 ? accent : secondary}" stroke-width="${index === phase * 2 ? 7 : 3}"/>`).join("")}
      ${label(1360, 285, "ALVEOLI + CAPILLARIES", 22, phase === 1 ? accent : secondary)}
      <path d="M1215 590c105 55 235 55 320 0" fill="none" stroke="#8f1d2c" stroke-width="30" stroke-linecap="round"/>
      <path d="M1325 545v65m70-65v65" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>
      ${label(1360, 675, "O₂ DIFFUSES INTO BLOOD", 21, phase === 1 ? accent : "#ffffff")}

      <path d="M1030 740h680" stroke="#8f1d2c" stroke-width="92" stroke-linecap="round" opacity=".8"/>
      ${cells.map((x, index) => `<ellipse cx="${x}" cy="740" rx="43" ry="28" fill="${phase === 2 && index <= shotIndex % cells.length ? "#ff7b82" : "#d94b58"}" stroke="#ffc2c8" stroke-width="${phase === 2 && index === shotIndex % cells.length ? 7 : 2}"/><circle cx="${x}" cy="740" r="8" fill="${phase === 2 ? accent : "#ffc2c8"}"/>`).join("")}
      ${label(1370, 815, "HEMOGLOBIN TRANSPORTS OXYGEN TO TISSUES", 22, phase === 2 ? accent : "#ffc2c8")}
    </g>`;
  }
  if (template === "showcase-captions") {
    return `<g>
      <rect x="210" y="330" width="660" height="430" rx="24" fill="#202020" stroke="${secondary}" stroke-width="3"/>
      <circle cx="540" cy="485" r="88" fill="${secondary}" fill-opacity=".2" stroke="${secondary}" stroke-width="5"/>
      ${label(540, 495, "VIDEO", 28, secondary)}
      <rect x="285" y="625" width="510" height="82" rx="10" fill="#050505"/>
      ${label(540, 660, "[NARRATOR] Captions carry speech", 20, "#ffffff")}
      ${label(540, 688, "and meaningful sound.", 20, "#ffffff")}
      <path d="M920 545h150" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>
      ${box(1100, 355, 560, 135, "ACCURATE WORDS", 0)}
      ${box(1100, 540, 560, 135, "SPEAKER + SOUND CUES", 1)}
      ${label(1380, 750, "REVIEW TIMING AND ERRORS", 23, accent)}
    </g>`;
  }
  if (template === "showcase-lca") {
    const stages = [
      [960, 330, "MATERIALS"],
      [1350, 500, "MAKE"],
      [1230, 735, "USE"],
      [690, 735, "END OF LIFE"],
      [570, 500, "TRANSPORT"],
    ];
    return `<g>
      <circle cx="960" cy="545" r="285" fill="none" stroke="${secondary}" stroke-width="6" stroke-dasharray="18 14"/>
      ${stages.map(([x, y, value], index) => `<g><circle cx="${x}" cy="${y}" r="${index === active ? 94 : 80}" fill="${index === active ? accent : "#202020"}" fill-opacity="${index === active ? ".2" : "1"}" stroke="${index === active ? accent : secondary}" stroke-width="${index === active ? 6 : 3}"/>${label(x, y + 8, value, 20, index === active ? accent : "#ffffff")}</g>`).join("")}
      ${label(960, 552, "SYSTEM", 30, "#ffffff")}
      ${label(960, 590, "BOUNDARY", 30, accent)}
    </g>`;
  }
  if (template === "showcase-programming") {
    return `<g>
      ${box(180, 395, 300, 150, "INPUT", 0)}
      ${box(625, 350, 420, 240, "FUNCTION", 1)}
      ${box(1190, 395, 300, 150, "OUTPUT", 2)}
      <path d="M480 470h125M1045 470h125" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>
      <rect x="655" y="625" width="360" height="120" rx="16" fill="#202020" stroke="${secondary}" stroke-width="3"/>
      ${label(835, 670, "STATE + CONTROL", 22, secondary)}
      ${label(835, 710, "TEST → REVISE", 22, accent)}
      <path d="M835 625V590" stroke="${secondary}" stroke-width="5" marker-end="url(#showcase-arrow)"/>
      ${label(960, 820, "PROBLEM → REPRESENTATION → BEHAVIOR", 24, "#ffffff")}
    </g>`;
  }
  if (template === "showcase-algorithms") {
    const curves = [
      { color: secondary, path: "M300 700C650 660 1080 610 1600 560", label: "log n" },
      { color: "#ffffff", path: "M300 700L1600 430", label: "n" },
      { color: accent, path: "M300 700C850 680 1200 560 1600 300", label: "n²" },
    ];
    return `<g>
      <line x1="260" y1="720" x2="1660" y2="720" stroke="#ffffff" stroke-opacity=".45" stroke-width="3"/>
      <line x1="260" y1="720" x2="260" y2="300" stroke="#ffffff" stroke-opacity=".45" stroke-width="3"/>
      ${curves.map((curve, index) => `<path d="${curve.path}" fill="none" stroke="${curve.color}" stroke-width="${index === active % 3 ? 10 : 6}" opacity="${index === active % 3 ? 1 : .65}"/>${label(1640, [550, 420, 290][index], curve.label, 22, curve.color)}`).join("")}
      ${label(960, 790, "INPUT SIZE n", 22, "#cfd2d3")}
      <text x="190" y="520" transform="rotate(-90 190 520)" text-anchor="middle" fill="#cfd2d3" font-size="22" font-family="Arial">COST</text>
      ${label(960, 325, "COMPARE GROWTH, THEN MEASURE", 26, accent)}
    </g>`;
  }
  if (template === "showcase-analysis-framework") {
    const stages = [
      [150, 415, 330, 170, "DEFINE", "inputs + outputs"],
      [575, 415, 330, 170, "PROVE", "invariant + cases"],
      [1000, 415, 330, 170, "ANALYZE", "time + space"],
      [1425, 415, 330, 170, "VERIFY", "tests + evidence"],
    ];
    return `<g>
      ${stages.map(([x, y, width, height, title, detail], index) => `<g opacity="${index <= active % 4 ? 1 : .35}"><rect x="${x}" y="${y}" width="${width}" height="${height}" rx="20" fill="${index === active % 4 ? accent : "#202020"}" fill-opacity="${index === active % 4 ? .2 : 1}" stroke="${index === active % 4 ? accent : secondary}" stroke-width="${index === active % 4 ? 7 : 3}"/>${label(x + width / 2, y + 70, title, 25, index === active % 4 ? accent : "#ffffff")}${label(x + width / 2, y + 115, detail, 19, secondary)}${index < stages.length - 1 ? `<path d="M${x + width + 18} ${y + height / 2}h72" stroke="${accent}" stroke-width="6" marker-end="url(#showcase-arrow)"/>` : ""}</g>`).join("")}
      ${label(960, 300, "A DISCIPLINED ANALYSIS LEAVES AN AUDIT TRAIL", 27, accent)}
      ${label(960, 745, "CLAIM → REASONING → RESOURCE BOUND → CHECK", 24, "#ffffff")}
    </g>`;
  }
  if (template === "showcase-recurrence") {
    const levels = [
      [[960, 345, "T(n)"]],
      [[650, 500, "T(n/2)"], [1270, 500, "T(n/2)"]],
      [[470, 665, "T(n/4)"], [760, 665, "T(n/4)"], [1160, 665, "T(n/4)"], [1450, 665, "T(n/4)"]],
    ];
    const visibleLevel = Math.min(2, active % 3);
    return `<g>
      ${label(960, 260, "T(n) = 2T(n/2) + n", 34, accent)}
      <path d="M960 390L650 455M960 390l310 65M650 545L470 620M650 545l110 75M1270 545l-110 75M1270 545l180 75" fill="none" stroke="${secondary}" stroke-width="5" stroke-opacity=".7"/>
      ${levels.flatMap((level, levelIndex) => level.map(([x, y, value]) => `<g opacity="${levelIndex <= visibleLevel ? 1 : .22}"><circle cx="${x}" cy="${y}" r="${levelIndex === visibleLevel ? 70 : 58}" fill="#202020" stroke="${levelIndex === visibleLevel ? accent : secondary}" stroke-width="${levelIndex === visibleLevel ? 7 : 3}"/>${label(x, y + 8, value, 20, levelIndex === visibleLevel ? accent : "#ffffff")}</g>`)).join("")}
      ${label(960, 805, ["EXPAND ONE LEVEL", "COUNT WORK PER LEVEL", "SUM ACROSS log n LEVELS"][visibleLevel], 24, accent)}
    </g>`;
  }
  if (template === "showcase-dynamic-programming") {
    const rows = 5;
    const columns = 8;
    const cell = 82;
    const originX = 520;
    const originY = 330;
    const activeRow = 1 + (active % 3);
    const activeColumn = 3 + (active % 3);
    return `<g>
      ${Array.from({ length: rows * columns }, (_, index) => {
        const row = Math.floor(index / columns);
        const column = index % columns;
        const selected = row === activeRow && column === activeColumn;
        const dependency =
          (row === activeRow - 1 && column === activeColumn) ||
          (row === activeRow && column === activeColumn - 1);
        return `<rect x="${originX + column * cell}" y="${originY + row * cell}" width="72" height="72" rx="10" fill="${selected ? accent : dependency ? secondary : "#202020"}" fill-opacity="${selected ? .28 : dependency ? .2 : 1}" stroke="${selected ? accent : dependency ? secondary : "#555555"}" stroke-width="${selected ? 7 : dependency ? 5 : 2}"/>`;
      }).join("")}
      <path d="M${originX + activeColumn * cell + 36} ${originY + (activeRow - 1) * cell + 72}v10M${originX + (activeColumn - 1) * cell + 72} ${originY + activeRow * cell + 36}h10" stroke="${accent}" stroke-width="8" marker-end="url(#showcase-arrow)"/>
      ${label(960, 265, "STATE → RECURRENCE → TABLE", 28, accent)}
      ${label(960, 810, "Each cell reuses solved subproblems", 24, "#ffffff")}
    </g>`;
  }
  if (template === "showcase-data-structures") {
    const structures = [
      [320, 390, "ARRAY", `<g>${Array.from({ length: 5 }, (_, index) => `<rect x="${185 + index * 70}" y="455" width="62" height="62" rx="8" fill="#202020" stroke="${secondary}" stroke-width="3"/>${label(216 + index * 70, 495, String(index), 18, "#ffffff")}`).join("")}</g>`],
      [960, 390, "LINKED NODES", `<g>${[760, 900, 1040].map((x, index) => `<circle cx="${x}" cy="486" r="43" fill="#202020" stroke="${secondary}" stroke-width="3"/>${label(x, 494, String.fromCharCode(65 + index), 20, "#ffffff")}${index < 2 ? `<path d="M${x + 48} 486h72" stroke="${accent}" stroke-width="5" marker-end="url(#showcase-arrow)"/>` : ""}`).join("")}</g>`],
      [1590, 390, "TREE", `<g><circle cx="1590" cy="455" r="40" fill="#202020" stroke="${secondary}" stroke-width="3"/><path d="M1570 492l-95 95M1610 492l95 95" stroke="${accent}" stroke-width="5"/><circle cx="1465" cy="620" r="38" fill="#202020" stroke="${secondary}" stroke-width="3"/><circle cx="1715" cy="620" r="38" fill="#202020" stroke="${secondary}" stroke-width="3"/></g>`],
    ];
    return `<g>${structures.map(([x, , title, drawing], index) => `<g opacity="${index === active % 3 ? 1 : .42}">${label(x, 350, title, 22, index === active % 3 ? accent : secondary)}${drawing}</g>`).join("")}${label(960, 790, ["CONTIGUOUS ACCESS", "POINTER-BASED UPDATES", "HIERARCHICAL SEARCH"][active % 3], 25, accent)}</g>`;
  }
  if (template === "showcase-hash-table") {
    const bucketY = [350, 455, 560, 665];
    const selected = active % bucketY.length;
    return `<g>
      ${box(170, 440, 330, 150, "KEY", 0)}
      <path d="M500 515h220" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>
      <circle cx="830" cy="515" r="100" fill="#202020" stroke="${accent}" stroke-width="6"/>
      ${label(830, 500, "HASH", 25, accent)}${label(830, 540, "h(key)", 22, "#ffffff")}
      <path d="M930 515h190" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>
      ${bucketY.map((y, index) => `<rect x="1160" y="${y}" width="360" height="78" rx="12" fill="${index === selected ? accent : "#202020"}" fill-opacity="${index === selected ? .22 : 1}" stroke="${index === selected ? accent : secondary}" stroke-width="${index === selected ? 6 : 3}"/>${label(1200, y + 48, String(index), 19, secondary)}${index === selected ? `${label(1350, y + 48, "KEY → VALUE", 20, "#ffffff")}<path d="M1520 ${y + 39}h130" stroke="${accent}" stroke-width="5" marker-end="url(#showcase-arrow)"/>${box(1660, y - 5, 180, 88, "CHAIN", 1)}` : ""}`).join("")}
      ${label(960, 810, "HASH → BUCKET → COLLISION POLICY", 24, accent)}
    </g>`;
  }
  if (template === "showcase-state-machine") {
    const states = [[420, 500, "S₀"], [960, 330, "S₁"], [1500, 500, "S₂"], [960, 710, "S₃"]];
    return `<g>
      <path d="M485 475L880 350M1040 350l395 125M1435 535l-395 150M880 685L485 535" fill="none" stroke="${secondary}" stroke-width="6" marker-end="url(#showcase-arrow)"/>
      ${states.map(([x, y, name], index) => `<circle cx="${x}" cy="${y}" r="${index === active % 4 ? 92 : 72}" fill="${index === active % 4 ? accent : "#202020"}" fill-opacity="${index === active % 4 ? .24 : 1}" stroke="${index === active % 4 ? accent : secondary}" stroke-width="${index === active % 4 ? 8 : 4}"/>${label(x, y + 10, name, 30, index === active % 4 ? accent : "#ffffff")}`).join("")}
      ${label(960, 830, "INPUT + CURRENT STATE → NEXT STATE", 25, accent)}
    </g>`;
  }
  if (template === "showcase-memory-hierarchy") {
    const levels = [
      [760, 315, 400, 85, "REGISTERS", "1 cycle"],
      [650, 430, 620, 90, "CACHE", "~4–40 cycles"],
      [520, 550, 880, 95, "MAIN MEMORY", "~100 ns"],
      [380, 680, 1160, 100, "STORAGE", "µs–ms"],
    ];
    return `<g>
      ${levels.map(([x, y, width, height, name, latency], index) => `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="14" fill="${index === active % 4 ? accent : "#202020"}" fill-opacity="${index === active % 4 ? .22 : 1}" stroke="${index === active % 4 ? accent : secondary}" stroke-width="${index === active % 4 ? 7 : 3}"/>${label(960, y + 38, name, 22, index === active % 4 ? accent : "#ffffff")}${label(960, y + 69, latency, 17, secondary)}`).join("")}
      ${label(300, 420, "FASTER", 20, accent)}${label(300, 735, "LARGER", 20, secondary)}
      <path d="M300 455v230" stroke="${accent}" stroke-width="5" marker-end="url(#showcase-arrow)"/>
    </g>`;
  }
  if (template === "showcase-database") {
    const entities = academicDiagramLabels(section, 3, [
      "STUDENTS",
      "ENROLLMENTS",
      "COURSES",
    ]);
    return `<g>
      ${entities.map((entity, index) => {
        const x = 145 + index * 585;
        const selected = index === active % 3;
        return `<g>
          <rect x="${x}" y="350" width="430" height="330" rx="20" fill="#f7f7f4" stroke="${selected ? accent : secondary}" stroke-width="${selected ? 7 : 3}"/>
          <rect x="${x}" y="350" width="430" height="78" rx="20" fill="${selected ? accent : secondary}"/>
          ${label(x + 215, 400, entity, entity.length > 18 ? 19 : 23, "#111111")}
          <text x="${x + 34}" y="480" fill="#222222" font-size="20" font-family="Arial, Liberation Sans, sans-serif">id</text>
          <text x="${x + 160}" y="480" fill="#555555" font-size="18" font-family="Arial, Liberation Sans, sans-serif">PRIMARY KEY</text>
          <path d="M${x + 28} 515h374M${x + 28} 575h374" stroke="#777777" stroke-width="2"/>
          <text x="${x + 34}" y="555" fill="#222222" font-size="19" font-family="Arial, Liberation Sans, sans-serif">attributes</text>
          <text x="${x + 34}" y="620" fill="#222222" font-size="19" font-family="Arial, Liberation Sans, sans-serif">relationships</text>
          ${index < entities.length - 1 ? `<path d="M${x + 430} 515h135" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>${label(x + 498, 495, "RELATES", 16, accent)}` : ""}
        </g>`;
      }).join("")}
      ${label(960, 790, "ENTITIES + KEYS + RELATIONSHIPS PRESERVE MEANING", 23, accent)}
    </g>`;
  }
  if (template === "showcase-cryptography") {
    const stages = [
      [150, "PLAINTEXT", "reviewed input"],
      [590, "KEY + ALGORITHM", "approved parameters"],
      [1070, "CIPHERTEXT", "protected representation"],
      [1510, "VERIFY", "expected property"],
    ];
    return `<g>
      ${stages.map(([x, title, detail], index) => `${box(x, 390, index === 1 ? 390 : 300, 165, title, index)}${label(x + (index === 1 ? 195 : 150), 590, detail.toUpperCase(), 16, secondary)}${index < stages.length - 1 ? `<path d="M${x + (index === 1 ? 390 : 300)} 472h${index === 1 ? 90 : 140}" stroke="${accent}" stroke-width="7" marker-end="url(#showcase-arrow)"/>` : ""}`).join("")}
      <path d="M785 650v100h435V650" fill="none" stroke="${secondary}" stroke-width="5" stroke-dasharray="12 10"/>
      ${label(1000, 795, "CONFIDENTIALITY AND INTEGRITY DEPEND ON THE COMPLETE PROTOCOL", 22, accent)}
    </g>`;
  }
  if (template === "showcase-search") {
    const nodes = [
      [320, 520, "S"], [650, 360, "A"], [650, 680, "B"],
      [1030, 330, "C"], [1030, 540, "D"], [1030, 735, "E"],
      [1450, 500, "G"],
    ];
    return `<g>
      <path d="M370 500L600 380M370 545L600 660M700 360L980 330M700 385L980 520M700 665L980 555M700 695L980 720M1080 350L1400 475M1080 540L1400 500M1080 720L1400 525" fill="none" stroke="${secondary}" stroke-width="5" stroke-opacity=".65"/>
      ${nodes.map(([x, y, value], index) => `<g><circle cx="${x}" cy="${y}" r="${index === active || value === "G" ? 58 : 45}" fill="${value === "G" ? accent : "#202020"}" fill-opacity="${value === "G" ? ".25" : "1"}" stroke="${index === active || value === "G" ? accent : secondary}" stroke-width="${index === active || value === "G" ? 7 : 3}"/>${label(x, y + 9, value, 27, index === active || value === "G" ? accent : "#ffffff")}</g>`).join("")}
      ${label(960, 815, "FRONTIER PRIORITY: DEPTH, COST, OR g + h", 24, accent)}
      ${label(1450, 405, "GOAL", 20, accent)}
    </g>`;
  }
  if (template === "showcase-operating-systems") {
    return `<g>
      ${box(170, 330, 330, 125, "PROCESS A", 0)}
      ${box(170, 535, 330, 125, "PROCESS B", 1)}
      <rect x="690" y="285" width="470" height="440" rx="24" fill="#202020" stroke="${accent}" stroke-width="6"/>
      ${label(925, 350, "KERNEL", 30, accent)}
      ${label(925, 435, "SYSTEM CALLS", 21, "#ffffff")}
      ${label(925, 515, "SCHEDULER", 21, secondary)}
      ${label(925, 595, "VIRTUAL MEMORY", 21, "#ffffff")}
      ${label(925, 675, "DEVICES + FILES", 21, secondary)}
      ${box(1350, 330, 360, 125, "CPU", 2)}
      ${box(1350, 535, 360, 125, "PHYSICAL MEMORY", 3)}
      <path d="M500 395h170M500 600h170M1160 395h170M1160 600h170" stroke="${accent}" stroke-width="6" marker-end="url(#showcase-arrow)"/>
      ${label(960, 820, "ISOLATE → SHARE → CONTROL", 25, accent)}
    </g>`;
  }
  if (template === "showcase-networks") {
    const layers = [
      ["APPLICATION", accent],
      ["TRANSPORT", secondary],
      ["NETWORK", "#ffffff"],
      ["LINK", accent],
    ];
    return `<g>
      ${layers.map(([name, color], index) => `<rect x="260" y="${300 + index * 115}" width="430" height="82" rx="14" fill="#202020" stroke="${color}" stroke-width="${index === active % 4 ? 7 : 3}"/>${label(475, 352 + index * 115, name, 23, color)}`).join("")}
      <path d="M735 500h400" stroke="${accent}" stroke-width="8" stroke-dasharray="22 14" marker-end="url(#showcase-arrow)"/>
      ${label(935, 455, "PACKET", 22, accent)}
      ${box(1190, 315, 440, 130, "ROUTER", 1)}
      ${box(1190, 560, 440, 130, "DESTINATION", 2)}
      <path d="M1410 445v95" stroke="${secondary}" stroke-width="7" marker-end="url(#showcase-arrow)"/>
      ${label(960, 820, "ENCAPSULATE → FORWARD → ACKNOWLEDGE", 24, accent)}
    </g>`;
  }
  if (template === "showcase-compilers") {
    const stages = ["SOURCE", "TOKENS", "AST", "IR", "MACHINE"];
    return `<g>
      ${stages.map((name, index) => `${box(110 + index * 355, 420, 265, 150, name, index)}${index < stages.length - 1 ? `<path d="M375 ${495}h70" stroke="${accent}" stroke-width="6" marker-end="url(#showcase-arrow)"/>` : ""}`).join("")}
      <rect x="450" y="670" width="1020" height="95" rx="16" fill="#202020" stroke="${secondary}" stroke-width="3"/>
      ${label(960, 730, "ANALYZE • TRANSFORM • VERIFY", 25, secondary)}
      ${label(960, 330, "MEANING IS PRESERVED ACROSS REPRESENTATIONS", 25, accent)}
    </g>`;
  }
  if (template === "showcase-distributed") {
    const servers = [
      [360, 400, "FOLLOWER"],
      [960, 315, "LEADER"],
      [1560, 400, "FOLLOWER"],
    ];
    return `<g>
      ${servers.map(([x, y, name], index) => `<rect x="${x - 190}" y="${y - 95}" width="380" height="190" rx="22" fill="#202020" stroke="${index === 1 ? accent : secondary}" stroke-width="${index === active % 3 ? 8 : 4}"/>${label(x, y - 25, name, 25, index === 1 ? accent : "#ffffff")}${label(x, y + 42, "LOG  1 2 3 4", 19, secondary)}`).join("")}
      <path d="M760 365L570 400M1160 365l210 35M570 455l190 45M1370 455l-210 45" stroke="${accent}" stroke-width="6" marker-end="url(#showcase-arrow)"/>
      <rect x="640" y="650" width="640" height="105" rx="18" fill="${accent}" fill-opacity=".14" stroke="${accent}" stroke-width="4"/>
      ${label(960, 715, "MAJORITY COMMIT", 27, accent)}
      ${label(960, 825, "FAILURES CHANGE TIMING, NOT SAFETY", 24, "#ffffff")}
    </g>`;
  }
  if (template === "showcase-circuits") {
    return `<g>
      <path d="M240 500h180M420 410v180M420 410h240M660 410v180M660 500h190" fill="none" stroke="#ffffff" stroke-width="7"/>
      <path d="M510 410v180M570 410v180" stroke="${accent}" stroke-width="9"/>
      ${label(540, 640, "C", 26, accent)}
      <path d="M850 500h170l35-70 70 140 70-140 70 140 35-70h130" fill="none" stroke="${secondary}" stroke-width="7"/>
      ${label(1150, 640, "R", 26, secondary)}
      <line x1="260" y1="780" x2="1660" y2="780" stroke="#ffffff" stroke-opacity=".35" stroke-width="3"/>
      <path d="M300 760C520 420 890 470 1150 650C1330 755 1490 770 1640 772" fill="none" stroke="${accent}" stroke-width="9"/>
      ${label(1450, 705, "e⁻ᵗ⁄ᴿᶜ", 24, accent)}
      ${label(960, 310, "STORE + DISSIPATE ENERGY", 26, accent)}
    </g>`;
  }
  if (template === "showcase-signals") {
    const samples = Array.from({ length: 13 }, (_, index) => {
      const x = 270 + index * 105;
      const y = 505 - Math.sin(index * 0.95) * 150;
      return `<line x1="${x}" y1="620" x2="${x}" y2="${y.toFixed(1)}" stroke="${secondary}" stroke-width="4"/><circle cx="${x}" cy="${y.toFixed(1)}" r="10" fill="${accent}"/>`;
    }).join("");
    return `<g>
      <path d="M250 505C350 300 455 300 560 505S770 710 875 505S1085 300 1190 505S1400 710 1505 505S1640 360 1680 420" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="5"/>
      ${samples}
      <line x1="230" y1="620" x2="1700" y2="620" stroke="#ffffff" stroke-width="3"/>
      ${label(960, 300, "CONTINUOUS SIGNAL → SAMPLES", 26, accent)}
      ${label(960, 735, "SAMPLE RATE SETS WHAT CAN BE RECOVERED", 23, secondary)}
      ${label(960, 820, "TIME ↔ FREQUENCY", 27, "#ffffff")}
    </g>`;
  }
  if (template === "showcase-fluids") {
    return `<g>
      <path d="M180 325C650 325 650 430 960 430S1270 325 1740 325M180 725C650 725 650 620 960 620S1270 725 1740 725" fill="none" stroke="#ffffff" stroke-width="7"/>
      ${[300, 520, 760, 980, 1210, 1450].map((x, index) => `<path d="M${x} 525h${index > 1 && index < 4 ? 135 : 85}" stroke="${index > 1 && index < 4 ? accent : secondary}" stroke-width="${index > 1 && index < 4 ? 10 : 6}" marker-end="url(#showcase-arrow)"/>`).join("")}
      ${label(420, 420, "A₁", 25, secondary)}
      ${label(960, 385, "A₂", 25, accent)}
      ${label(1500, 420, "A₃", 25, secondary)}
      ${label(960, 780, "ṁ = ρ A V", 30, accent)}
      ${label(960, 845, "CONSERVE MASS • TRACK ENERGY • STATE ASSUMPTIONS", 22, "#ffffff")}
    </g>`;
  }
  if (template === "showcase-mechanics") {
    return `<g>
      <rect x="230" y="330" width="300" height="350" rx="22" fill="#202020" stroke="${secondary}" stroke-width="5"/>
      <path d="M380 275v110M350 305l30-30 30 30M380 735V625M350 705l30 30 30-30" stroke="${accent}" stroke-width="8"/>
      ${label(380, 515, "SPECIMEN", 24, "#ffffff")}
      ${label(380, 575, "F / A", 26, accent)}
      <line x1="720" y1="735" x2="1680" y2="735" stroke="#ffffff" stroke-opacity=".45" stroke-width="3"/>
      <line x1="720" y1="735" x2="720" y2="285" stroke="#ffffff" stroke-opacity=".45" stroke-width="3"/>
      <path d="M720 735L1120 390C1260 285 1430 350 1480 470C1525 580 1580 610 1660 640" fill="none" stroke="${accent}" stroke-width="9"/>
      ${label(1030, 515, "ELASTIC", 22, secondary)}
      ${label(1450, 420, "PLASTIC", 22, accent)}
      ${label(1200, 820, "STRAIN = ΔL / L₀", 25, "#ffffff")}
    </g>`;
  }
  if (template === "showcase-interdisciplinary") {
    return `<g>
      <circle cx="780" cy="525" r="250" fill="${accent}" fill-opacity=".16" stroke="${accent}" stroke-width="5"/>
      <circle cx="1140" cy="525" r="250" fill="${secondary}" fill-opacity=".16" stroke="${secondary}" stroke-width="5"/>
      ${label(700, 445, "FIELD A", 28, accent)}
      ${label(1220, 445, "FIELD B", 28, secondary)}
      ${label(960, 525, "SHARED", 27, "#ffffff")}
      ${label(960, 565, "QUESTION", 27, "#ffffff")}
      <rect x="690" y="745" width="540" height="78" rx="14" fill="#202020" stroke="${accent}" stroke-width="3"/>
      ${label(960, 795, "GOALS → COURSES → PROJECT", 23, accent)}
    </g>`;
  }
  return `<g>${box(350, 410, 360, 180, "CONCEPT", 0)}${box(780, 410, 360, 180, "EVIDENCE", 1)}${box(1210, 410, 360, 180, "APPLICATION", 2)}<path d="M710 500h50M1140 500h50" stroke="${accent}" stroke-width="6" marker-end="url(#showcase-arrow)"/></g>`;
}

function riscvCourseShotSvg(
  section,
  shotIndex,
  shotCount,
  phrase,
  options,
) {
  const [accent, secondary] = options.palette;
  const progress = ((shotIndex + 1) / shotCount) * 1640;
  const body = riscvVisualBody(options.template, {
    accent,
    secondary,
    shotIndex,
  });
  const direction = wrap(section.visualDirection, 104, 2);
  const phraseLine = wrap(phrase || section.title, 102, 1)[0] || section.title;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080" data-visual-template="${xml(options.template)}">
    <defs>
      <linearGradient id="riscv-bg" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#060606"/><stop offset=".58" stop-color="#111111"/><stop offset="1" stop-color="#070707"/></linearGradient>
      <pattern id="riscv-grid" width="48" height="48" patternUnits="userSpaceOnUse"><path d="M48 0H0V48" fill="none" stroke="#ffffff" stroke-opacity=".035"/></pattern>
      <marker id="riscv-arrow" markerWidth="12" markerHeight="12" refX="10" refY="6" orient="auto"><path d="M0 0 12 6 0 12z" fill="${accent}"/></marker>
    </defs>
    <rect width="1920" height="1080" fill="url(#riscv-bg)"/>
    <rect width="1920" height="1080" fill="url(#riscv-grid)"/>
    <rect width="18" height="1080" fill="${accent}"/>
    <text x="96" y="72" fill="${accent}" font-size="21" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(options.brand || "RIT COURSE DRAFT")}</text>
    <text x="1824" y="72" text-anchor="end" fill="${secondary}" font-size="19" font-family="Arial, Liberation Sans, sans-serif">RV32I teaching model · Section ${section.index + 1} of ${section.totalSections}</text>
    <text x="96" y="145" fill="#ffffff" font-size="49" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(section.title)}</text>
    ${direction.map((line, index) => `<text x="96" y="${196 + index * 30}" fill="#cfd2d3" font-size="22" font-family="Arial, Liberation Sans, sans-serif">${xml(line)}</text>`).join("")}
    <line x1="96" y1="248" x2="1824" y2="248" stroke="#ffffff" stroke-opacity=".15"/>
    ${body}
    <rect x="96" y="880" width="1728" height="66" rx="12" fill="#1d1d1d" stroke="${secondary}" stroke-opacity=".45"/>
    <text x="960" y="922" text-anchor="middle" fill="#ffffff" font-size="26" font-family="Arial, Liberation Sans, sans-serif">${xml(phraseLine)}</text>
    <text x="96" y="1006" fill="#bfc3c5" font-size="20" font-family="Arial, Liberation Sans, sans-serif">Narration-aligned diagram ${shotIndex + 1} of ${shotCount}</text>
    <rect x="96" y="1032" width="1640" height="6" rx="3" fill="#3a3a3a"/><rect x="96" y="1032" width="${progress}" height="6" rx="3" fill="${accent}"/>
  </svg>`;
}

function riscvVisualBody(template, { accent, secondary, shotIndex }) {
  const stageNames = ["IF", "ID", "EX", "MEM", "WB"];
  const stageBoxes = (active = -1, y = 510) =>
    stageNames
      .map((stage, index) => {
        const x = 164 + index * 332;
        const selected = index === active;
        return `<g transform="translate(${x} ${y})">
          <rect width="250" height="116" rx="15" fill="${selected ? accent : "#202020"}" fill-opacity="${selected ? ".22" : "1"}" stroke="${selected ? accent : secondary}" stroke-width="${selected ? "5" : "2"}" stroke-opacity="${selected ? "1" : ".5"}"/>
          <text x="125" y="49" text-anchor="middle" fill="${selected ? accent : "#ffffff"}" font-size="30" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${stage}</text>
          <text x="125" y="82" text-anchor="middle" fill="#c8ccce" font-size="16" font-family="Arial, Liberation Sans, sans-serif">${["fetch", "decode", "execute", "memory", "write back"][index]}</text>
        </g>`;
      })
      .join("");

  if (template === "riscv-architecture") {
    return `<g>
      <rect x="120" y="330" width="560" height="390" rx="20" fill="#181818" stroke="${accent}" stroke-width="3"/>
      <text x="160" y="385" fill="${accent}" font-size="22" font-family="Arial" font-weight="700">ISA CONTRACT</text>
      <text x="160" y="455" fill="#ffffff" font-size="30" font-family="Arial">ADD reads rs1 and rs2</text>
      <text x="160" y="510" fill="#ffffff" font-size="30" font-family="Arial">and writes rd.</text>
      <text x="160" y="585" fill="${secondary}" font-size="22" font-family="Arial">Defines visible behavior</text>
      <text x="160" y="625" fill="${secondary}" font-size="22" font-family="Arial">and instruction encoding.</text>
      <path d="M710 525h170" stroke="${accent}" stroke-width="7" marker-end="url(#riscv-arrow)"/>
      <rect x="930" y="330" width="870" height="390" rx="20" fill="#181818" stroke="${secondary}" stroke-width="3"/>
      <text x="970" y="385" fill="${secondary}" font-size="22" font-family="Arial" font-weight="700">ONE MICROARCHITECTURE</text>
      ${stageNames.map((stage, index) => {
        const selected = index === shotIndex % 5;
        return `<g transform="translate(${970 + index * 158} 470)">
          <rect width="138" height="128" rx="13" fill="${selected ? accent : "#242424"}" fill-opacity="${selected ? ".24" : "1"}" stroke="${selected ? accent : secondary}" stroke-width="${selected ? "5" : "2"}"/>
          <text x="69" y="52" text-anchor="middle" fill="${selected ? accent : "#ffffff"}" font-size="27" font-family="Arial" font-weight="700">${stage}</text>
          <text x="69" y="88" text-anchor="middle" fill="#c8ccce" font-size="14" font-family="Arial">${["fetch", "decode", "execute", "memory", "write back"][index]}</text>
        </g>`;
      }).join("")}
      <text x="970" y="670" fill="#ffffff" font-size="22" font-family="Arial">A five-stage pipeline is one way to implement that contract.</text>
    </g>`;
  }

  if (template === "riscv-encoding") {
    const fields = [
      ["funct7", "0000000", 7],
      ["rs2", "00111", 5],
      ["rs1", "00110", 5],
      ["funct3", "000", 3],
      ["rd", "00101", 5],
      ["opcode", "0110011", 7],
    ];
    let x = 120;
    const totalWidth = 1680;
    const blocks = fields
      .map(([label, value, bits], index) => {
        const width = (bits / 32) * totalWidth;
        const selected = index === shotIndex % fields.length;
        const block = `<g transform="translate(${x} 390)">
          <rect width="${width}" height="180" fill="${selected ? accent : "#202020"}" fill-opacity="${selected ? ".28" : "1"}" stroke="${selected ? accent : secondary}" stroke-width="${selected ? "5" : "2"}"/>
          <text x="${width / 2}" y="53" text-anchor="middle" fill="${selected ? accent : secondary}" font-size="19" font-family="Arial" font-weight="700">${label}</text>
          <text x="${width / 2}" y="108" text-anchor="middle" fill="#ffffff" font-size="${bits === 3 ? 23 : 26}" font-family="monospace">${value}</text>
          <text x="${width / 2}" y="151" text-anchor="middle" fill="#aeb3b5" font-size="16" font-family="Arial">${bits} bits</text>
        </g>`;
        x += width;
        return block;
      })
      .join("");
    return `<g>${blocks}
      <text x="120" y="330" fill="#ffffff" font-size="26" font-family="monospace">add x5, x6, x7</text>
      <text x="1800" y="330" text-anchor="end" fill="${accent}" font-size="26" font-family="monospace">0x007302B3</text>
      <path d="M120 640h1680" stroke="${secondary}" stroke-opacity=".45"/>
      <text x="960" y="705" text-anchor="middle" fill="#ffffff" font-size="28" font-family="Arial">The fields identify two sources, one destination, and the ADD operation.</text>
    </g>`;
  }

  if (template === "riscv-fetch-decode") {
    const active = shotIndex % 3;
    const nodes = [
      [120, "PC", "0x00001000", 300],
      [630, "INSTRUCTION MEMORY", "0x007302B3", 420],
      [1260, "DECODE + REGISTER FILE", "rs1=x6 · rs2=x7 · rd=x5", 540],
    ];
    return `<g>
      ${nodes.map(([x, label, value, width], index) => `<g transform="translate(${x} 400)">
        <rect width="${width}" height="200" rx="18" fill="${index === active ? accent : "#202020"}" fill-opacity="${index === active ? ".22" : "1"}" stroke="${index === active ? accent : secondary}" stroke-width="${index === active ? "5" : "2"}"/>
        <text x="${width / 2}" y="58" text-anchor="middle" fill="${index === active ? accent : secondary}" font-size="19" font-family="Arial" font-weight="700">${label}</text>
        <text x="${width / 2}" y="125" text-anchor="middle" fill="#ffffff" font-size="${index === 2 ? "22" : "29"}" font-family="monospace">${value}</text>
        <text x="${width / 2}" y="166" text-anchor="middle" fill="#bfc3c5" font-size="17" font-family="Arial">${["select address", "fetch 32 bits", "name operands"][index]}</text>
      </g>`).join("")}
      <path d="M440 500h150M1070 500h150" stroke="${accent}" stroke-width="6" marker-end="url(#riscv-arrow)"/>
      <path d="M270 635v70h300" fill="none" stroke="${secondary}" stroke-width="3"/>
      <text x="420" y="738" text-anchor="middle" fill="${secondary}" font-size="23" font-family="monospace">next sequential PC = 0x00001004</text>
    </g>`;
  }

  if (template === "riscv-execute") {
    return `<g>
      <rect x="130" y="355" width="420" height="390" rx="20" fill="#202020" stroke="${secondary}" stroke-width="3"/>
      <text x="170" y="410" fill="${secondary}" font-size="21" font-family="Arial" font-weight="700">REGISTER FILE READ</text>
      <text x="170" y="500" fill="#ffffff" font-size="34" font-family="monospace">x6 = 19</text>
      <text x="170" y="580" fill="#ffffff" font-size="34" font-family="monospace">x7 = 23</text>
      <path d="M560 485h210M560 575h210" stroke="${accent}" stroke-width="6" marker-end="url(#riscv-arrow)"/>
      <circle cx="955" cy="530" r="${shotIndex % 2 ? 145 : 130}" fill="${accent}" fill-opacity=".18" stroke="${accent}" stroke-width="6"/>
      <text x="955" y="505" text-anchor="middle" fill="${accent}" font-size="24" font-family="Arial" font-weight="700">ALU · ADD</text>
      <text x="955" y="570" text-anchor="middle" fill="#ffffff" font-size="42" font-family="monospace">19 + 23</text>
      <path d="M1110 530h220" stroke="${accent}" stroke-width="7" marker-end="url(#riscv-arrow)"/>
      <rect x="1380" y="415" width="390" height="230" rx="20" fill="#202020" stroke="${accent}" stroke-width="4"/>
      <text x="1575" y="485" text-anchor="middle" fill="${accent}" font-size="21" font-family="Arial" font-weight="700">ALU RESULT</text>
      <text x="1575" y="575" text-anchor="middle" fill="#ffffff" font-size="58" font-family="monospace">42</text>
      <text x="960" y="785" text-anchor="middle" fill="${secondary}" font-size="24" font-family="Arial">RV32I keeps the low 32 bits; arithmetic overflow does not trap.</text>
    </g>`;
  }

  if (template === "riscv-writeback") {
    return `<g>
      ${stageBoxes(Math.min(4, 2 + (shotIndex % 3)), 345)}
      <path d="M289 475h1535" stroke="${accent}" stroke-width="5" stroke-opacity=".45" marker-end="url(#riscv-arrow)"/>
      <rect x="515" y="665" width="350" height="126" rx="15" fill="#202020" stroke="${secondary}" stroke-width="3"/>
      <text x="690" y="710" text-anchor="middle" fill="${secondary}" font-size="19" font-family="Arial" font-weight="700">DATA MEMORY</text>
      <text x="690" y="755" text-anchor="middle" fill="#ffffff" font-size="22" font-family="Arial">not read or written by ADD</text>
      <path d="M880 728h210" stroke="${accent}" stroke-width="6" marker-end="url(#riscv-arrow)"/>
      <rect x="1120" y="640" width="600" height="176" rx="18" fill="${accent}" fill-opacity=".15" stroke="${accent}" stroke-width="4"/>
      <text x="1420" y="700" text-anchor="middle" fill="${accent}" font-size="20" font-family="Arial" font-weight="700">MEM/WB → REGISTER FILE</text>
      <text x="1420" y="765" text-anchor="middle" fill="#ffffff" font-size="38" font-family="monospace">x5 ← 42</text>
    </g>`;
  }

  if (template === "riscv-timing") {
    const instructions = ["add x5,x6,x7", "xor x8,x9,x10", "and x11,x12,x13"];
    const stages = ["IF", "ID", "EX", "MEM", "WB"];
    return `<g>
      <text x="120" y="315" fill="${secondary}" font-size="20" font-family="Arial" font-weight="700">IDEALIZED INDEPENDENT INSTRUCTIONS</text>
      ${Array.from({ length: 7 }, (_, cycle) => `<text x="${650 + cycle * 150}" y="350" text-anchor="middle" fill="${cycle === shotIndex % 7 ? accent : "#bfc3c5"}" font-size="19" font-family="monospace">C${cycle + 1}</text>`).join("")}
      ${instructions.map((instruction, row) => `<g>
        <text x="120" y="${425 + row * 130}" fill="#ffffff" font-size="24" font-family="monospace">${instruction}</text>
        ${Array.from({ length: 7 }, (_, cycle) => {
          const stage = cycle - row;
          const occupied = stage >= 0 && stage < stages.length;
          return `<g transform="translate(${575 + cycle * 150} ${380 + row * 130})">
            <rect width="136" height="84" rx="10" fill="${occupied ? (stage === shotIndex % 5 ? accent : "#252525") : "#111111"}" fill-opacity="${occupied && stage === shotIndex % 5 ? ".35" : "1"}" stroke="${occupied ? (stage === shotIndex % 5 ? accent : secondary) : "#333333"}" stroke-width="${occupied && stage === shotIndex % 5 ? "4" : "1"}"/>
            <text x="68" y="53" text-anchor="middle" fill="${occupied ? "#ffffff" : "#555555"}" font-size="22" font-family="monospace">${occupied ? stages[stage] : "—"}</text>
          </g>`;
        }).join("")}
      </g>`).join("")}
      <text x="960" y="820" text-anchor="middle" fill="${accent}" font-size="26" font-family="Arial" font-weight="700">After filling, an ideal pipeline can complete one instruction each cycle.</text>
    </g>`;
  }

  return `<g>
    <rect x="120" y="340" width="560" height="410" rx="20" fill="#202020" stroke="${accent}" stroke-width="3"/>
    <text x="160" y="400" fill="${accent}" font-size="22" font-family="Arial" font-weight="700">DEPENDENCY</text>
    <text x="160" y="485" fill="#ffffff" font-size="29" font-family="monospace">add x5, x6, x7</text>
    <text x="160" y="555" fill="#ffffff" font-size="29" font-family="monospace">sub x8, x5, x9</text>
    <path d="M365 505v33" stroke="${accent}" stroke-width="5" marker-end="url(#riscv-arrow)"/>
    <text x="160" y="640" fill="${secondary}" font-size="22" font-family="Arial">RAW hazard on x5</text>
    <rect x="760" y="340" width="450" height="410" rx="20" fill="#202020" stroke="${secondary}" stroke-width="3"/>
    <text x="800" y="400" fill="${secondary}" font-size="22" font-family="Arial" font-weight="700">DATA-HAZARD TOOLS</text>
    <text x="800" y="490" fill="#ffffff" font-size="30" font-family="Arial">Forward a ready result</text>
    <text x="800" y="565" fill="#ffffff" font-size="30" font-family="Arial">or insert a bubble</text>
    <text x="800" y="650" fill="${accent}" font-size="22" font-family="Arial">correctness comes first</text>
    <rect x="1290" y="340" width="510" height="410" rx="20" fill="#202020" stroke="${accent}" stroke-width="3"/>
    <text x="1330" y="400" fill="${accent}" font-size="22" font-family="Arial" font-weight="700">CONTROL HAZARD</text>
    <text x="1330" y="490" fill="#ffffff" font-size="30" font-family="Arial">A taken branch may</text>
    <text x="1330" y="540" fill="#ffffff" font-size="30" font-family="Arial">invalidate fetched work.</text>
    <text x="1330" y="640" fill="${secondary}" font-size="22" font-family="Arial">stall, predict, or flush</text>
  </g>`;
}

export function courseThumbnailSvg(options = {}) {
  const accent = options.accent || "#F76902";
  const secondary = options.secondary || "#D0D3D4";
  const titleLines = wrap(options.title || "Course video", 27, 4);
  const titleSize = titleLines.length > 3 ? 50 : 58;
  const titleStep = titleLines.length > 3 ? 64 : 76;
  const titleStart = titleLines.length > 3 ? 215 : 235;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <rect width="1280" height="720" fill="#0b0b0b"/>
    <rect width="22" height="720" fill="${accent}"/>
    <path d="M840 0h440v720H680z" fill="${accent}" fill-opacity=".10"/>
    <circle cx="1040" cy="360" r="180" fill="none" stroke="${accent}" stroke-width="24" stroke-opacity=".85"/>
    <circle cx="1040" cy="360" r="104" fill="${accent}" fill-opacity=".18" stroke="${secondary}" stroke-width="4"/>
    <path d="m1008 298 104 62-104 62z" fill="${accent}"/>
    <text x="78" y="92" fill="${accent}" font-size="22" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(options.brand || "COURSE VIDEO")}</text>
    ${titleLines.map((line, index) => `<text x="78" y="${titleStart + index * titleStep}" fill="#ffffff" font-size="${titleSize}" font-family="Arial, Liberation Sans, sans-serif" font-weight="700">${xml(line)}</text>`).join("")}
    <text x="78" y="646" fill="#d0d3d4" font-size="26" font-family="Arial, Liberation Sans, sans-serif">Source-grounded • Captioned • Reviewable</text>
  </svg>`;
}
