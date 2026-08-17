export function buildAiDisclosure({ config, engine, episode, mode }) {
  const records = engine.records.map((record) => ({
    role: record.roleName || null,
    capability: record.capability,
    providerProfile: record.profileName,
    model: record.model,
    modelRevision: record.result.modelRevision,
    requestSha256: record.requestSha256,
    cacheHit: record.cacheHit,
    artifacts: (record.result.artifacts || []).map((artifact) => ({
      sha256: artifact.sha256,
      mimeType: artifact.mimeType,
      filename: artifact.filename,
    })),
  }));
  return {
    schemaVersion: 1,
    project: config.project.id,
    episode: episode.id,
    mode,
    generatedStages: records,
    humanResponsibility:
      "The named reviewers remain responsible for factual accuracy, accessibility, licensing, and instructional suitability.",
  };
}

export function aiDisclosureMarkdown(disclosure) {
  const lines = [
    "# Generative AI Disclosure",
    "",
    `Project: ${disclosure.project}`,
    `Episode: ${disclosure.episode}`,
    `Execution mode: ${disclosure.mode}`,
    "",
    disclosure.humanResponsibility,
    "",
    "## Generated stages",
    "",
  ];
  if (!disclosure.generatedStages.length) {
    lines.push("- No model-provider stages were recorded.");
  }
  for (const stage of disclosure.generatedStages) {
    lines.push(
      `- ${stage.role || stage.capability}: ${stage.providerProfile} / ${stage.modelRevision || stage.model || "provider default"}; request \`${stage.requestSha256}\`${stage.cacheHit ? " (replayed from cache)" : ""}`,
    );
  }
  return `${lines.join("\n")}\n`;
}
