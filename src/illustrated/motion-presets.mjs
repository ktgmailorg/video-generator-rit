const frame = (value) => Math.max(0, Math.round(value));

export const MOTION_PRESETS = Object.freeze({
  soft_enter: { anticipation: 0, travel: 10, overshoot: 0, settle: 6, hold: 10 },
  anticipate_and_land: { anticipation: 4, travel: 9, overshoot: 2, settle: 7, hold: 10 },
  overshoot_settle: { anticipation: 2, travel: 8, overshoot: 4, settle: 8, hold: 10 },
  arc_travel: { anticipation: 3, travel: 14, overshoot: 0, settle: 5, hold: 8 },
  draw_path: { anticipation: 0, travel: 18, overshoot: 0, settle: 3, hold: 10 },
  shape_morph: { anticipation: 3, travel: 14, overshoot: 2, settle: 7, hold: 10 },
  squash_stretch: { anticipation: 3, travel: 7, overshoot: 3, settle: 8, hold: 12 },
  follow_through: { anticipation: 2, travel: 9, overshoot: 4, settle: 10, hold: 9 },
  match_cut: { anticipation: 0, travel: 8, overshoot: 0, settle: 2, hold: 8 },
  foreground_wipe: { anticipation: 2, travel: 11, overshoot: 0, settle: 3, hold: 8 },
  parallax_reveal: { anticipation: 2, travel: 15, overshoot: 2, settle: 8, hold: 12 },
  reaction_hold: { anticipation: 3, travel: 6, overshoot: 2, settle: 5, hold: 18 },
  comic_double_take: { anticipation: 3, travel: 5, overshoot: 3, settle: 5, hold: 18 },
  evidence_stamp: { anticipation: 4, travel: 6, overshoot: 2, settle: 5, hold: 12 },
  collapse_and_rebuild: { anticipation: 4, travel: 18, overshoot: 3, settle: 9, hold: 12 },
});

export function resolveMotionPreset(id, fps = 30, overrides = {}) {
  const preset = MOTION_PRESETS[id];
  if (!preset) throw new Error(`Unknown motion preset: ${id}`);
  const scale = fps / 30;
  const phases = Object.fromEntries(
    Object.entries({ ...preset, ...overrides }).map(([key, value]) => [
      key,
      frame(Number(value) * scale),
    ]),
  );
  return {
    id,
    fps,
    phases,
    totalFrames: Object.values(phases).reduce((total, value) => total + value, 0),
  };
}

export function evaluateSettledMotion(resolved, absoluteFrame) {
  const { anticipation, travel, overshoot, settle } = resolved.phases;
  const start = anticipation;
  const actionEnd = start + travel + overshoot + settle;
  if (absoluteFrame <= start) return 0;
  if (absoluteFrame >= actionEnd) return 1;

  const progress = (absoluteFrame - start) / Math.max(1, actionEnd - start);
  const eased = 1 - (1 - progress) ** 3;
  const overshootAmount = progress > 0.62
    ? Math.sin(((progress - 0.62) / 0.38) * Math.PI) * 0.035
    : 0;
  return Math.min(1.035, eased + overshootAmount);
}
