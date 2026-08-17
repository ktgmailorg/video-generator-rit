export function auditGrounding(episode, options = {}) {
  const blockers = [];
  const warnings = [];
  const sourceIds = new Set();
  const claimIds = new Set();

  for (const source of episode.sources || []) {
    if (sourceIds.has(source.id)) blockers.push(`Duplicate source ID: ${source.id}`);
    sourceIds.add(source.id);
    if (!source.verified) warnings.push(`Source not verified: ${source.id}`);
  }
  for (const claim of episode.claims || []) {
    if (claimIds.has(claim.id)) blockers.push(`Duplicate claim ID: ${claim.id}`);
    claimIds.add(claim.id);
    if (!claim.sourceIds.length) {
      blockers.push(`Claim has no source: ${claim.id}`);
    }
    for (const sourceId of claim.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        blockers.push(`Claim ${claim.id} references missing source ${sourceId}`);
      }
    }
    if (!claim.verified) warnings.push(`Claim not verified: ${claim.id}`);
  }
  for (const beat of episode.beats || []) {
    for (const claimId of beat.claimIds || []) {
      if (!claimIds.has(claimId)) {
        blockers.push(`Beat ${beat.id} references missing claim ${claimId}`);
      }
    }
  }
  if (
    ["source-pack", "researched"].includes(options.groundingMode) &&
    !(episode.sources || []).length
  ) {
    blockers.push(`${options.groundingMode} mode requires at least one source`);
  }
  if (
    ["source-pack", "researched"].includes(options.groundingMode) &&
    !(episode.claims || []).length
  ) {
    warnings.push(
      "No factual claims were declared; the script reviewer must confirm this is intentional",
    );
  }
  if (options.requireVerified) {
    for (const source of episode.sources || []) {
      if (!source.verified) blockers.push(`Release source is unverified: ${source.id}`);
    }
    for (const claim of episode.claims || []) {
      if (!claim.verified) blockers.push(`Release claim is unverified: ${claim.id}`);
    }
  }
  return { ok: blockers.length === 0, blockers, warnings };
}

const sourceOverlapStopWords = new Set([
  "about",
  "after",
  "again",
  "against",
  "also",
  "among",
  "because",
  "before",
  "being",
  "between",
  "both",
  "computer",
  "course",
  "could",
  "each",
  "from",
  "have",
  "into",
  "itself",
  "lesson",
  "level",
  "more",
  "most",
  "other",
  "program",
  "same",
  "should",
  "student",
  "system",
  "than",
  "that",
  "their",
  "there",
  "these",
  "they",
  "this",
  "through",
  "under",
  "using",
  "while",
  "with",
  "would",
]);

export function meaningfulTerms(value) {
  return new Set(
    String(value || "")
      .toLowerCase()
      .match(/[a-z0-9]+(?:-[a-z0-9]+)*/g)
      ?.map(stemTerm)
      .filter(
        (term) =>
          term.length >= 4 && !sourceOverlapStopWords.has(term),
      ) || [],
  );
}

export function claimGroundingReport(claim, sources) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const claimTerms = meaningfulTerms(claim.text);
  return (claim.sourceIds || []).map((sourceId) => {
    const source = byId.get(sourceId);
    const sourceTerms = meaningfulTerms(
      [source?.title, source?.content, source?.excerpt]
        .filter(Boolean)
        .join(" "),
    );
    return {
      sourceId,
      exists: Boolean(source),
      sharedTerms: [...claimTerms]
        .filter((term) => sourceTerms.has(term))
        .sort(),
    };
  });
}

export function assertSourceBoundClaims(
  claims,
  sources,
  {
    minimumSharedTerms = 2,
    minimumCoverage = 0,
    label = "episode",
  } = {},
) {
  const failures = [];
  for (const claim of claims) {
    const report = claimGroundingReport(claim, sources);
    const claimTerms = meaningfulTerms(claim.text);
    const supportedTerms = new Set();
    if (!report.length) {
      failures.push(`${claim.id}: no source IDs`);
      continue;
    }
    for (const citation of report) {
      for (const term of citation.sharedTerms) supportedTerms.add(term);
      if (!citation.exists) {
        failures.push(`${claim.id}: unknown source ${citation.sourceId}`);
      } else if (citation.sharedTerms.length < minimumSharedTerms) {
        failures.push(
          `${claim.id}: ${citation.sourceId} shares only ${
            citation.sharedTerms.length
          } meaningful term${citation.sharedTerms.length === 1 ? "" : "s"}`,
        );
      }
    }
    const coverage =
      claimTerms.size > 0 ? supportedTerms.size / claimTerms.size : 0;
    if (coverage < minimumCoverage) {
      failures.push(
        `${claim.id}: cited sources cover only ${Math.round(
          coverage * 100,
        )}% of meaningful claim terms`,
      );
    }
  }
  if (failures.length) {
    throw new Error(
      `${label}: source-grounding validation failed (${failures.join("; ")})`,
    );
  }
}

export function pruneUnsupportedClaimSources(
  claims,
  sources,
  { minimumSharedTerms = 2 } = {},
) {
  return claims.map((claim) => {
    const supported = claimGroundingReport(claim, sources)
      .filter(
        (citation) =>
          citation.exists &&
          citation.sharedTerms.length >= minimumSharedTerms,
      )
      .map((citation) => citation.sourceId);
    return {
      ...claim,
      sourceIds: supported.length ? supported : claim.sourceIds,
    };
  });
}

export function claimCoverageReport(episode) {
  const sourceById = new Map(
    (episode.sources || []).map((source) => [source.id, source]),
  );
  return {
    schemaVersion: 1,
    claims: (episode.claims || []).map((claim) => ({
      id: claim.id,
      text: claim.text,
      verified: claim.verified,
      sources: claim.sourceIds.map((sourceId) => ({
        id: sourceId,
        title: sourceById.get(sourceId)?.title || null,
        uri: sourceById.get(sourceId)?.uri || null,
        found: sourceById.has(sourceId),
      })),
    })),
  };
}

export function bibliographyMarkdown(episode) {
  const lines = ["# Sources", ""];
  for (const source of episode.sources || []) {
    const author = source.author ? `${source.author}. ` : "";
    const verification = source.verified ? "" : " *(pending verification)*";
    lines.push(
      `- **${source.id}:** ${author}${source.title}. ${source.uri}${verification}`,
    );
  }
  if (!(episode.sources || []).length) lines.push("- No sources supplied.");
  return `${lines.join("\n")}\n`;
}

function stemTerm(term) {
  if (term.endsWith("ies") && term.length > 5) {
    return `${term.slice(0, -3)}y`;
  }
  if (
    /(?:sses|ches|shes|xes|zes)$/.test(term) &&
    term.length > 6
  ) {
    return term.slice(0, -2);
  }
  if (term.endsWith("s") && !term.endsWith("ss") && term.length > 5) {
    return term.slice(0, -1);
  }
  return term;
}
