export const WEB_PREVIEW_AUDIO_KBPS = 96;
export const WEB_PREVIEW_MINIMUM_VIDEO_KBPS = 1100;
export const WEB_PREVIEW_CONTAINER_EFFICIENCY = 0.94;

export function webPreviewBudget({
  durationSeconds,
  maximumBytes,
  audioKbps = WEB_PREVIEW_AUDIO_KBPS,
  minimumVideoKbps = WEB_PREVIEW_MINIMUM_VIDEO_KBPS,
  containerEfficiency = WEB_PREVIEW_CONTAINER_EFFICIENCY,
}) {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    throw new Error("Web preview duration must be a positive number");
  }
  if (!Number.isInteger(maximumBytes) || maximumBytes <= 0) {
    throw new Error("Web preview maximumBytes must be a positive integer");
  }

  const minimumBytes = Math.ceil(
    ((minimumVideoKbps + audioKbps) * 1000 * durationSeconds) /
      (8 * containerEfficiency),
  );
  const videoKbps = Math.floor(
    (maximumBytes * 8 * containerEfficiency) / durationSeconds / 1000 -
      audioKbps,
  );

  if (videoKbps < minimumVideoKbps) {
    throw new Error(
      `${maximumBytes} bytes would force an unacceptable ${videoKbps} kb/s video bitrate; use at least ${minimumBytes} bytes`,
    );
  }

  return {
    audioKbps,
    minimumVideoKbps,
    minimumBytes,
    videoKbps,
  };
}
