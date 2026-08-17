# Computer architecture competency example

This source-grounded RIT course draft traces `add x5, x6, x7` through an
RV32I five-stage teaching processor. It deliberately distinguishes the RISC-V
ISA contract from one microarchitecture and ends with throughput and hazard
caveats.

The lesson uses:

- The ratified RISC-V Unprivileged ISA specification
- UC Berkeley CS61C five-stage pipeline, performance, and hazard notes
- Deterministic SVG instruction, datapath, timing, and hazard diagrams
- Edge TTS narration with provider timing
- Reviewed closed captions and all three approval gates

To reproduce it from the repository root:

```bash
npm ci
npm run rit-video -- doctor \
  --config courses/computer-architecture/video.config.json
npm run rit-video -- plan \
  --config courses/computer-architecture/video.config.json \
  --storyboard courses/computer-architecture/storyboard.md \
  --sources courses/computer-architecture/sources.json
npm run rit-video -- approve script \
  --config courses/computer-architecture/video.config.json \
  --reviewer "Course reviewer"
npm run rit-video -- approve visuals \
  --config courses/computer-architecture/video.config.json \
  --reviewer "Course reviewer"
npm run rit-video -- produce \
  --config courses/computer-architecture/video.config.json \
  --mode record \
  --until render
cp courses/computer-architecture/captions.reviewed.vtt \
  .demo-output/computer-architecture/review/captions.vtt
npm run rit-video -- produce \
  --config courses/computer-architecture/video.config.json \
  --mode record \
  --until render
npm run rit-video -- approve release \
  --config courses/computer-architecture/video.config.json \
  --reviewer "Course reviewer"
npm run rit-video -- package \
  --config courses/computer-architecture/video.config.json \
  --target panopto
```

Generated media remains ignored. The reviewed storyboard, sources,
configuration, caption correction, and deterministic diagram implementation
are versioned.

The reviewed reference master is 2 minutes 48.8 seconds long. It is 1920×1080
H.264 at 30000/1001 fps with 48 kHz stereo AAC, and its SHA-256 is
`dde1854c6609e917c1eafa2a36d945143f99f32f7be5e2503eb71569463c179e`.
The final quality report has no blockers or warnings, and frozen replay reused
all seven narration records without a provider call.

The main pilot's AI-assisted topic path uses the separately installed
[binary 1-bit Bonsai 27B planner](../../docs/bonsai-27b.md). This reference
master uses the reviewed authored storyboard so it remains exactly
reproducible without downloading a model.
