export function authoredGenerationProvenance(config = {}) {
  const narrationProfileName = config.roles?.narration?.primary;
  const narration = config.providers?.[narrationProfileName] || {};
  const narrationModel =
    [narration.model, narration.voice].filter(Boolean).join(" / ") ||
    "Configured narration model";

  return [
    {
      stage: "Script and evidence",
      provider: "instructor-or-pilot-team-authored",
      model: "No generative model",
      executionLocation: "local",
      mode: "source-grounded",
      humanReviewRequired: true,
    },
    {
      stage: "Narration voice and timestamps",
      provider:
        narration.adapter || narrationProfileName || "configured-speech-provider",
      model: narrationModel,
      executionLocation: narration.executionLocation || "hosted",
      mode: "recorded",
      humanReviewRequired: true,
    },
    {
      stage: "Educational diagrams and composition",
      provider: "deterministic-svg-runtime",
      model: "No generative model",
      executionLocation: "local",
      mode: "deterministic",
      humanReviewRequired: true,
    },
  ];
}
