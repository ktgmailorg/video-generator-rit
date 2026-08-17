# Captioned pilot demo

This source-bound demo is the 83-second video published on the pilot page. It
uses the zero-configuration Edge TTS adapter and deterministic SVG renderer, so
it does not require a text, image, or video model.

The reviewed final master has:

- 1920×1080 H.264 video at 30000/1001 fps
- 48 kHz stereo AAC audio
- Corrected closed captions and transcripts
- No accessibility or production-audit blockers
- Release state `course-draft`
- SHA-256
  `278cf633cd07faf7714e083baf04535bb6c2e85becda3b29f99c679adb667992`

From the repository root:

```bash
npm ci
npm run rit-video -- doctor \
  --config courses/demo/video.config.json
npm run rit-video -- plan \
  --config courses/demo/video.config.json \
  --storyboard courses/demo/storyboard.md \
  --sources courses/demo/sources.json
npm run rit-video -- approve script \
  --config courses/demo/video.config.json \
  --reviewer "Kenju Tomita — pilot demo"
npm run rit-video -- approve visuals \
  --config courses/demo/video.config.json \
  --reviewer "Kenju Tomita — pilot demo"
npm run rit-video -- produce \
  --config courses/demo/video.config.json \
  --mode record \
  --until render
cp courses/demo/captions.reviewed.vtt \
  .demo-output/pilot/review/captions.vtt
npm run rit-video -- produce \
  --config courses/demo/video.config.json \
  --mode record \
  --until render
npm run rit-video -- approve release \
  --config courses/demo/video.config.json \
  --reviewer "Kenju Tomita — pilot demo"
npm run rit-video -- package \
  --config courses/demo/video.config.json \
  --target panopto
```

The package is written to `.demo-output/pilot/panopto-ready/`. Generated
outputs are intentionally ignored; the storyboard, sources, configuration, and
reviewed caption override are versioned.
