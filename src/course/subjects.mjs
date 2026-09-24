import { sha256 } from "../core/canonical.mjs";

export function scriptApprovalSubject({ episode, config, groundingReport }) {
  return {
    schemaVersion: 1,
    episode,
    groundingReport,
    project: config.project,
    groundingMode: config.workflow.groundingMode,
    dataClassification: config.dataPolicy.classification,
  };
}

export function visualApprovalSubject({
  episode,
  visualPlan,
  brandPack,
  config,
}) {
  return {
    schemaVersion: 1,
    episodeSha256: sha256(episode),
    visualPlan,
    preset: config.preset,
    brandPack: brandPack
      ? {
          id: brandPack.id,
          version: brandPack.version,
          approvedBy: brandPack.approvedBy,
          assets: brandPack.assets.map((asset) => ({
            role: asset.role,
            sha256: asset.sha256,
          })),
        }
      : null,
  };
}

export function releaseApprovalSubject({
  episode,
  master,
  captions,
  transcript,
  qualityReport,
  disclosure,
  audioDescription = null,
}) {
  return {
    schemaVersion: 1,
    episodeSha256: sha256(episode),
    master,
    captions,
    transcript,
    qualityReport,
    // Accessibility review covers the description track, so approving a
    // release must bind it; editing a cue afterwards invalidates approval.
    ...(audioDescription === null
      ? {}
      : { audioDescriptionSha256: sha256(audioDescription) }),
    disclosureSha256: sha256({
      schemaVersion: disclosure.schemaVersion,
      project: disclosure.project,
      episode: disclosure.episode,
      humanResponsibility: disclosure.humanResponsibility,
      generatedStages: disclosure.generatedStages.map((stage) => ({
        role: stage.role,
        capability: stage.capability,
        providerProfile: stage.providerProfile,
        model: stage.model,
        modelRevision: stage.modelRevision,
        requestSha256: stage.requestSha256,
        artifacts: stage.artifacts,
      })),
    }),
  };
}
