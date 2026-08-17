const TEMPLATES = Object.freeze({
  analogy: ["physical-analogy", "character-gag"],
  mechanism: ["causal-machine", "flow-diagram"],
  equation: ["semantic-equation"],
  comparison: ["split-comparison"],
  timeline: ["editorial-timeline"],
  evidence: ["archival-evidence"],
  chart: ["data-stage"],
  hero: ["depth-hero"],
});

function chooseTemplate(kind, index) {
  const choices = TEMPLATES[kind] ?? TEMPLATES.mechanism;
  return choices[index % choices.length];
}

function assertAnchors(beat) {
  if (!beat.tokenAnchors?.length) {
    throw new Error(`Story beat ${beat.beatId} has no narration anchors`);
  }
}

export function compileVisualStory({ beats, protectedClaimIds = [] }) {
  const protectedClaims = new Set(protectedClaimIds);
  const storyBeats = [];
  const shots = [];
  const continuity = new Map();

  for (const [index, beat] of beats.entries()) {
    assertAnchors(beat);
    const protectedBeat =
      beat.seriousness === "protected" ||
      (beat.claimIds ?? []).some((claimId) => protectedClaims.has(claimId));
    const kind = beat.kind ?? (beat.analogy ? "analogy" : "mechanism");
    const protagonist = beat.protagonist ?? "narrator-proxy";
    const prior = continuity.get(protagonist);
    const templateId = chooseTemplate(kind, index);

    storyBeats.push({ ...beat, seriousness: protectedBeat ? "protected" : "normal" });
    shots.push({
      id: `shot-${String(index + 1).padStart(3, "0")}`,
      storyBeatId: beat.beatId,
      renderer: kind === "hero" ? "composite" : "svg",
      templateId,
      assetRefs: prior?.assetRefs ?? [],
      startAnchorId: beat.tokenAnchors[0],
      endAnchorId: beat.tokenAnchors.at(-1),
      motionPresetIds: protectedBeat
        ? ["soft_enter", "evidence_stamp"]
        : beat.jokeId
          ? ["anticipate_and_land", "reaction_hold"]
          : ["soft_enter"],
      composition: {
        informationGoal: beat.informationGoal,
        setting: beat.setting,
        action: beat.action,
        visualHook: beat.visualHook,
        protagonist,
        continuationOf: prior?.shotId ?? null,
      },
    });
    continuity.set(protagonist, { shotId: shots.at(-1).id, assetRefs: shots.at(-1).assetRefs });
  }

  return { schemaVersion: 1, storyBeats, shots };
}
