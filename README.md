# RIT Course Video Generator

Turn a script — or just a topic plus source notes — into a finished,
captioned, accessible course video. Runs on your own computer, free by
default, with any AI model you choose (or none at all).

## Download the app (beta)

No Git, no command line, no account. FFmpeg is bundled.

| [Windows](https://github.com/ktgmailorg/video-generator-rit/releases/latest/download/RIT-Video-Studio-Setup.exe) | [macOS](https://github.com/ktgmailorg/video-generator-rit/releases/latest/download/RIT-Video-Studio.dmg) | [Linux](https://github.com/ktgmailorg/video-generator-rit/releases/latest/download/RIT-Video-Studio.AppImage) |
| --- | --- | --- |
| `.exe` installer | `.dmg` (Apple silicon) | `.AppImage` · [`.deb`](https://github.com/ktgmailorg/video-generator-rit/releases/latest/download/RIT-Video-Studio.deb) |

Beta builds are unsigned, so Windows SmartScreen and macOS Gatekeeper ask for
confirmation on first launch. See [all releases](https://github.com/ktgmailorg/video-generator-rit/releases)
and the [desktop notes](desktop/README.md).

## What it is

A provider-agnostic, reproducible Node.js 22 pipeline for authored or
AI-assisted course videos: Edge TTS and deterministic SVG visuals out of the
box, plus local/hosted model routing, recorded replay, source-grounded
planning, accessibility gates, instructor approvals, production checks, and
LMS-ready packaging. A local web studio (`npm run studio:launch`) gives
non-technical users the same interface in a browser.

**Free mode, no accounts:** the default preset uses Edge TTS narration and
deterministic educational diagrams — no API keys, no model downloads. Note
that Edge TTS is Microsoft's hosted service, so narration text is sent there
to be synthesized; visuals, captions, and rendering stay on your machine, and
a local Piper voice keeps narration on-machine too.
**Bring your own models:** the desktop app can plan with a model running on
your own machine (Ollama, LM Studio, llama.cpp — auto-detected, no key, no
data leaves), with a cloud provider you hold a key for (Anthropic, OpenAI,
Google Gemini, Groq, Mistral, DeepSeek, OpenRouter, Together), or with any
custom OpenAI-compatible endpoint. The CLI additionally routes ComfyUI,
Piper, and whisper.cpp through explicit provider profiles.

Overview and captioned demo:
[ktgmailorg.github.io/one-click-ai-video-pilot](https://ktgmailorg.github.io/one-click-ai-video-pilot/).

> This is an open-source community project of the
> [RIT AI Club](https://campusgroups.rit.edu/), licensed Apache 2.0. It is
> not an official product of, and is not endorsed by, the Rochester
> Institute of Technology. The repository ships no RIT logos, licensed
> fonts, model weights, or credentials. An output becomes `official-rit`
> only through the `rit-media` workflow with a checksummed, externally
> supplied brand pack and all approval gates.

## What is implemented

- Capabilities: `text.generate`, `image.generate`, `video.generate`,
  `speech.synthesize`, `speech.transcribe`, `embedding.create`,
  `moderation.classify`, and `research.search`.
- Built-in adapters: Anthropic, OpenAI, OpenAI-compatible servers, Ollama,
  ComfyUI, Edge TTS, HTTP bridges, and shell-free CLI bridges.
- Ready-to-configure CLI bridges for Piper and whisper.cpp.
- Validated [hosted](examples/video.config.hosted.json) and
  [fully local](examples/video.config.local.json) project configurations,
  including a versioned [ComfyUI image workflow](examples/comfyui-workflow.image.json).
- A local-first main pilot profile using PrismML's binary 1-bit Bonsai 27B
  through a local llama.cpp server, with the exact model-file digest included
  in cache and provenance records.
- `fresh`, `record`, and network-free `frozen` execution modes.
- Content-addressed artifacts, canonical request hashes, resolved model
  revisions, retained raw-response hashes, cache quarantine, cost limits, and
  resumable async jobs.
- EpisodeSpec v2, authored storyboard migration, source-pack and researched
  grounding, deterministic retrieval, optional embeddings for large packs,
  claim/source reports, and AI disclosures.
- Faculty, student, central-media, and generic presets.
- Checksum-bound script, visual, and release approvals.
- 1080p 30000/1001 course rendering, 48 kHz stereo audio, restrained
  transitions, title-safe academic templates, closed captions, transcripts,
  audio-description scripts, and visible draft review copies.
- Panopto-ready media plus a private replay bundle that can reconstruct a
  missing provider cache.

“Any model” means a model available through a built-in adapter or the
documented HTTP/CLI bridge envelope. A provider must explicitly advertise each
capability; the router does not assume that an OpenAI-like server implements
every OpenAI endpoint.

## Requirements

- Node.js 22 or newer
- FFmpeg and FFprobe
- `pdftotext` for PDF source packs
- `uvx` only when using the zero-configuration Edge TTS adapter
- Provider-specific servers, binaries, workflows, and model weights installed
  separately

```bash
npm ci
npm run rit-video -- --help
```

## First run

The generic preset preserves the low-configuration Edge TTS path:

```bash
npm run rit-video -- init --preset generic
npm run rit-video -- doctor
npm run rit-video -- plan \
  --storyboard examples/storyboard.example.md
npm run rit-video -- produce
```

The Edge TTS compatibility path includes named narration presets. The existing
male voice remains the default; select the professional female preset for a run
with:

```bash
npm run rit-video -- produce --narration-voice female
```

The female preset currently resolves to
`en-US-EmmaMultilingualNeural`. Set `voicePreset` to `female` or `male` on an
Edge TTS provider profile to make the choice persistent, or pass an explicit
provider voice ID to `--narration-voice`. The resolved voice is included in the
recorded provider response and the provider profile participates in the request
hash, so changing voices creates a distinct reproducible artifact.

## Local one-click studio

The studio is the recommended interface for non-technical users. It runs as a
local companion service and presents a browser form at `http://127.0.0.1:4173`.
Users can paste or load a corrected script/transcript, or ask the
configured planner to generate a draft transcript from instructor-approved
source notes. They choose a narration voice and visual route, then select
**Create draft video**. The companion runs transcript drafting when requested,
planning, speech, visuals, captions, transcripts, QA, rendering, and run-lock
recording end to end.

New users should begin with the [User Guide](docs/USER_GUIDE.md). It covers
first launch, normal browser operation, data handling, human review,
troubleshooting, and the local model setup boundary.

The [Educational Visual Quality Standard](docs/VISUAL_QUALITY_STANDARD.md)
defines the subject-match gate, instructor review questions, and concrete
acceptance examples for anatomy, MIS, algorithms, and community-program
lessons.

Moving from a supervised AI Club pilot to an RIT-supported campus application
requires a separate institutional process. The
[RIT Institutional Application Roadmap](docs/RIT_INSTITUTIONAL_APP_ROADMAP.md)
includes the sponsor, ITS intake, IAPQ, accessibility, hosting, Shibboleth SSO,
pilot, and ready-to-submit project-request materials.

```bash
npm ci
npm run studio:launch
```

The default missing-config behavior uses the legacy generic Edge TTS and
deterministic SVG path. To use a configured local provider stack:

```bash
npm run rit-video -- doctor --config video.config.local.json
npm run studio:launch -- --config video.config.local.json
```

For the supplied studio-specific Bonsai/ComfyUI/Piper/whisper.cpp example, copy
`examples/video.config.studio-bonsai.json` to the ignored
`video.config.local.json`, replace every placeholder, set
`BONSAI_27B_SHA256` to the exact model-file checksum, and start the configured
local services before launching the studio. The Bonsai profile expects an
OpenAI-compatible llama.cpp endpoint on `http://127.0.0.1:8080/v1`. The studio
uses Bonsai to create concise beat titles and inspectable visual directions
without rewriting the instructor's narration. The template includes separate
female and male Piper profiles, local whisper.cpp alignment, and an optional
ComfyUI image role.

The browser exposes two starting modes:

- **Use my approved script or transcript** preserves the supplied narration.
- **Generate a draft transcript with configured AI** requires reviewed source
  notes and a configured planner role. It asks the planner—Bonsai in the local
  example—for source-grounded narration, records the request and response in
  the run provenance, and adds an explicit instructor script/evidence blocker.

AI transcript generation is drafting, not approval. The resulting transcript
must pass instructor review before classroom release.

The service binds to localhost and refuses a public network bind. Script and
source input is written with owner-only permissions. Provider routing still
enforces the configured data policy before any request executes. Selecting
AI-generated visuals requires an explicitly configured image role; otherwise
the studio uses deterministic educational diagrams. RIT course QA records the
resolved diagram family for every shot and blocks a generic text-card fallback;
for example, an oxygen-transport lesson must render its anatomy scene rather
than display the words “show the lungs.” The output is intentionally a
reviewable draft. Instructor, accessibility, and release approval remain
separate checksum-bound decisions.

For a supervised classroom deployment, a technical operator can complete the
one-time installation and verification on a managed machine. Production is
then automatic from the browser: add reviewed material, choose options, and
select **Create draft video**.

## Full-course batch production

The long-form course runner turns every selected source-grounded storyboard
into a complete draft package and can export website-ready media in the same
operation:

```bash
npm run courses:create
npm run courses:create-cs
npm run courses:generate-bonsai
npm run courses:render -- \
  --only operating-systems-processes-memory,computer-networks-tcp-routing,compiler-design-front-end,distributed-systems-consensus,analog-circuits-rc-filters,signals-sampling-fourier,fluid-mechanics-continuity-bernoulli,solid-mechanics-stress-strain \
  --export /absolute/path/to/learning-site
```

The expanded catalog includes full lessons in computer architecture, calculus,
PID control, spectroscopy, phishing defense, oxygen transport, programming
foundations, algorithm analysis, relational data management, and artificial
intelligence search. The Bonsai batch adds operating systems, networks,
compilers, distributed systems, circuits, signals, fluid mechanics, and solid
mechanics. Each lesson contains ten instructional beats and exports a complete
video, captions, transcript, poster, and verified source pack into the same
unified learning catalog.

Narration, deterministic visual generation, and section rendering use bounded
parallel work while preserving input order. Configure the limits with
`VIDEO_NARRATION_CONCURRENCY`, `VIDEO_VISUAL_CONCURRENCY`, and
`VIDEO_RENDER_CONCURRENCY`; the batch runner also supports
`LONG_FORM_COURSE_CONCURRENCY`. Exact request records, visual signatures,
section hashes, master hashes, and review-render hashes are checked before
reuse. An unchanged batch therefore avoids provider calls, image generation,
section encoding, master concatenation, and draft re-encoding.

On the M4 Pro reference machine, three fresh 9.5-minute lessons produced
28 minutes 49 seconds of finished media in 20 minutes 31 seconds of wall time,
or 1.41× real-time media throughput. An immediate unchanged rerender of one
9 minute 32 second lesson completed in 0.65 seconds with every provider and
render artifact served from verified cache entries, approximately 621× faster
than its fresh run.

A separate four-course reference batch produced 34 minutes 36 seconds of
media; its immediate unchanged rerun completed in 1.23 seconds with all 40
sections, four masters, and four review copies served from verified cache
entries. These are configuration-specific measurements, not guaranteed service
levels. See [the benchmark methodology and complete results](docs/speed-benchmarks.md).

For an RIT faculty workflow:

```bash
npm run rit-video -- init --preset rit-course
# Configure explicit provider profiles and roles in video.config.json.
npm run rit-video -- doctor
npm run rit-video -- plan \
  --storyboard examples/storyboard.course.md \
  --sources examples/sources.course.json
npm run rit-video -- approve script --reviewer "Instructor Name"
npm run rit-video -- approve visuals --reviewer "Instructor Name"
npm run rit-video -- produce --until render
npm run rit-video -- approve release --reviewer "Instructor Name"
npm run rit-video -- package --target panopto
```

`approve script` is the script-and-evidence gate: it marks the exact sources
and claims in the current EpisodeSpec as instructor verified, refreshes the
approval subject, and signs its checksum. Any subsequent covered change
invalidates the approval.

Topic planning produces the same EpisodeSpec:

```bash
npm run rit-video -- plan \
  --topic "Why canonical serialization matters" \
  --sources examples/sources.course.json
```

The main pilot uses the local
[1-bit Bonsai 27B setup](docs/bonsai-27b.md) for topic planning. Model weights
and the llama.cpp runtime are installed separately; the repository never
downloads multi-gigabyte models without an explicit operator action. Authored
storyboards remain usable when no text model is installed.

Use `workflow.groundingMode: "researched"` plus `planner` and `research` roles
to retain researched URLs, excerpts, retrieval times, and hashes. Official
release still requires instructor verification.

## CLI

```text
rit-video init --preset rit-course|rit-student|rit-media|generic
rit-video doctor [--offline] [--check-sources]
rit-video providers list
rit-video providers probe PROFILE
rit-video plan (--topic TEXT | --storyboard FILE) [--sources FILE,URL]
rit-video approve script|visuals|release --reviewer NAME
rit-video produce [--until narration|visuals|render|package]
                  [--mode fresh|record|frozen]
                  [--max-cost-usd N] [--allow-unknown-cost]
rit-video replay path/to/run.lock.json --frozen
rit-video package --target panopto
rit-video inspect path/to/run.lock.json
```

Every planning and production command supports `--dry-run`; production dry
runs show the stage boundary, selected providers, execution locations,
capabilities, approvals, and cost policy without calling a model.

Configuration precedence is CLI overrides, `video.config.json`, then legacy
`VIDEO_*` variables. Credentials are referenced only by environment-variable
name, for example `"apiKeyEnv": "OPENAI_API_KEY"`. Inline secret-looking
provider fields are rejected.

See the ready-to-edit
[hosted configuration](examples/video.config.hosted.json) and
[fully local configuration](examples/video.config.local.json).

## Reproducibility model

- `fresh` always executes the selected provider and records a new result.
- `record` is the default. It reuses an exact request hit or executes and
  freezes the returned bytes.
- `frozen` prohibits provider and network calls. Missing or corrupt artifacts
  are hard failures.

The lookup key includes the adapter manifest, provider profile, workflow hash,
model configuration, canonical prompt and inputs, output schema, parameters,
seed, data policy, and input hashes. The final canonical request hash also
includes the provider-reported model revision or local model digest. Seeds are
recorded when supported, but exactness comes from recorded bytes rather than a
promise that hosted generation will repeat.

A successful package creates:

- `output/documentary/panopto-ready/` for deliberate manual Panopto import.
- `output/documentary/replay-bundle/` with owner-only provider records and
  content-addressed artifacts. Point `rit-video replay` at the lock inside this
  directory to restore a deleted cache before frozen rendering.

The release image is pinned in [Dockerfile.release](Dockerfile.release).
Frozen release replay checks Node, FFmpeg, FFprobe, platform, and libvips
versions unless `--accept-toolchain-drift` is explicitly supplied.

## Course and data policy

| Preset | Intended owner | Default controls | Release state |
|---|---|---|---|
| `generic` | General author | Open grounding, no approval gates | `generic-release` |
| `rit-course` | Faculty/course staff | Source pack and all three gates | `course-draft` without official brand authority |
| `rit-student` | Student assignment | Restricted/local data, AI policy, disclosure, no brand pack | `student-project` |
| `rit-media` | Central media | Source pack, all gates, approved external brand pack | `official-rit` |

`restricted` data can use local adapters only. `internal` data defaults local;
a hosted route requires both recorded consent and an allowlisted provider
profile. Fallbacks are considered only for rate limits or provider
unavailability, never for refusals, invalid evidence/content, policy failures,
or ambiguous media-job timeouts.

Student work defaults to restricted data and requires
`project.aiPolicyFile`. The package includes a prompt/output transcript for
the assignment record.

## Storyboards and evidence

Each beat uses a timed level-two heading. Planned time is editorial guidance;
generated narration duration is the rendering authority.

```markdown
## 0:00 - 0:30 — Stable inputs

**[VISUAL]** Show a labeled input, canonicalization step, and hash.
**[EQUATION]** h = SHA-256(canonical(request))
**[CLAIM source-id]** Canonical key ordering makes equivalent objects hash alike.

**[VOICEOVER]**

The canonical form removes irrelevant object-key ordering before hashing.

**Delivery:** Clear, calm, and direct.
```

Every factual claim in RIT source-pack mode must cite an ingested source ID.
The package exports a bibliography and machine-readable claim/source coverage
report. `doctor --check-sources` reports unreachable or changed URL sources.

## Accessibility and package contents

RIT presets require provider or transcription timing; guessed proportional
caption timing blocks release. Caption output is VTT and SRT with one or two
lines, a 46-character line limit, speaker labels, timing checks, a text
transcript, and an accessible HTML transcript.

Every beat must be described in narration or provide an audio-description
cue. Missing descriptions block release. The Panopto-ready directory contains
the MP4, captions, transcripts, chapters, thumbnail, audio-description script,
bibliography, claim coverage, asset/license report, AI disclosure, production
report, accessibility/quality report, cost/latency report, and immutable run
lock. Upload remains a deliberate manual action in v1.

## Provider SDK and bridges

Adapters implement:

```js
{
  describe(),
  healthcheck({ signal }),
  execute(request, { signal, onProgress, resumeJob }),
  estimate?.(request)
}
```

The public exports are available from `video-generator-rit` and
`video-generator-rit/providers`. JSON Schemas live in `src/schemas/`.
The stable bridge envelope and complete response example are documented in
[docs/bridge-protocol.md](docs/bridge-protocol.md).

## Legacy commands

The original pipeline remains available and retains its v1 cache namespace:

```bash
npm run video:prepare -- path/to/storyboard.md
npm run video:voice
npm run video:render
npm run produce -- path/to/storyboard.md
npm run illustrated:demo
```

Version-1 caches are not trusted as v2 provider-cache entries.

## Development

```bash
npm test
npm run test:determinism
npm audit
```

Tests cover the illustrated runtime, schemas, canonical hashing, data policy,
approval invalidation, source grounding, captions, provider replay and
fallback behavior, structured repair, async-job resumption, cache corruption,
and a real FFmpeg record/frozen replay with an identical master SHA-256.

Before an institutional production declaration, run the planned faculty,
student, and central-media pilots and complete manual Panopto import review.
RIT policy and brand references are collected in
[docs/rit-production.md](docs/rit-production.md).
