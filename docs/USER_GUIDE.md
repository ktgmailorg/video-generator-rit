# User Guide: One-Click AI Video Studio

This guide is for instructors, creators, and anyone who wants to turn a
script into a finished course video without touching the command line. The
studio is a local web app — everything runs on your own computer.

## What the studio does

The studio turns a script or transcript into a reviewable course-video
package containing:

- A 1920×1080 draft video
- Narration with a configured female or male voice
- Closed captions in VTT and SRT formats
- A corrected plain-text and HTML transcript
- A thumbnail and chapter metadata
- Source, accessibility, and automated quality reports
- A reproducibility record identifying the models and artifacts used

If you don't have narration yet, the studio can ask a configured AI planner
to generate a draft transcript from your source notes and a learning
objective. The draft is retained and receives an explicit script/evidence
review blocker so it is never released unreviewed.

The system assists with production. You remain responsible for subject
accuracy, source approval, accessibility review, and the decision to release
the video.

## Start the studio

### macOS

Double-click `start-studio.command` in the project folder. If macOS asks for
confirmation, choose **Open**. The launcher prepares dependencies on first
use, starts a configured local model when available, starts the local
companion, and opens the studio in your default browser.

### Windows

Double-click `start-studio.bat`. Keep the companion window open while
producing the video.

### Linux / command line

```bash
npm run studio:launch
```

### Studio address

The browser interface is `http://127.0.0.1:4173`. The address works only on
the computer running the companion. The companion binds to the loopback
interface and is never exposed to your network.

## Create a video

1. Confirm that the studio reports **Ready**. If it does not, run
   `npm run rit-video -- doctor` to see what's missing.
2. Enter a descriptive video title.
3. Choose **Use my approved script or transcript** and paste/load a `.txt`,
   `.md`, `.vtt`, or `.srt` file; or choose **Generate a draft transcript
   with configured AI** and enter the topic or learning objective.
4. Add the title and relevant text of your approved source material. Source
   notes are mandatory when the AI drafts the transcript.
5. Choose the configured voice, female voice, or male voice.
6. Choose **Deterministic educational visuals** unless you have configured a
   reviewed ComfyUI image workflow. The renderer selects a subject-matched
   teaching diagram — such as anatomy, a graph, a circuit, a process, a
   database, or a timeline — and changes its highlighted state with the
   narration.
7. Confirm that the material is approved for the displayed data route.
8. Select **Create draft video** and leave the companion window open.
9. Download the video, captions, transcript, thumbnail, and run record.

The studio preserves your supplied narration. In AI transcript mode, the
configured planner creates a separate recorded draft using only the supplied
source notes.

## What stays on the local machine

The local browser interface talks to the local companion, which may use:

- A local text model through a `llama.cpp` server or Ollama
- Deterministic SVG course diagrams or local ComfyUI
- Local Piper voices
- Local whisper.cpp alignment
- Local FFmpeg and Sharp composition

When a fully local profile is selected, the studio enforces that boundary
before enabling production: every configured provider — including optional
voices and fallbacks — must declare local execution, and HTTP-based local
providers must use a loopback address (`127.0.0.1`, `localhost`, or `::1`).
Hosted adapters such as Anthropic, OpenAI, and Edge TTS are rejected by the
local-only studio profile even if a profile is mislabeled.

Sensitive or personally identifying information should only be used with
local provider profiles. Do not paste private records into a hosted
configuration.

## Review before publishing

Four human review areas are built into the workflow:

1. **Script and evidence:** Verify learning objectives, claims, sources,
   pronunciations, equations, and AI disclosure.
2. **Visuals:** Check that each diagram actually represents the subject being
   taught, along with generated-asset licensing, readable text, contrast, and
   visual descriptions.
3. **Accessibility:** Correct captions and transcript; confirm meaningful
   visuals are described in narration or an audio-description script.
4. **Release:** Watch the final master and approve the exact video checksum
   and accompanying package.

Automated QA is assistance, not approval. Drafts with unresolved source or
accessibility warnings should not be presented as official releases.

## Local model setup (optional)

Copy the supplied template and fill in your model paths:

```bash
cp examples/video.config.local.json video.config.local.json
```

The local template expects:

- A text model server at `http://127.0.0.1:8080/v1` (llama.cpp) or Ollama
- Optional ComfyUI at `http://127.0.0.1:8188`
- Female and male Piper `.onnx` voice models
- A whisper.cpp alignment model
- FFmpeg and FFprobe on the local path

Verify the complete route:

```bash
npm ci
npm run rit-video -- doctor --config video.config.local.json
npm run studio:launch -- --config video.config.local.json
```

No local models? The zero-configuration generic preset uses Edge TTS and
deterministic visuals instead:

```bash
npm run rit-video -- init --preset generic
```

Be aware of what that means for your data: **Edge TTS is Microsoft's hosted
service**, so the narration text is sent there to be synthesized. Everything
else — visuals, captions, rendering — happens on your machine. The generic
preset is therefore classified `public`, and the studio refuses it for a
project classified `internal` or `restricted`. For narration that never
leaves the machine, configure a local Piper voice.

## Troubleshooting

### The studio page does not open

Confirm the launcher window is still open, then visit
`http://127.0.0.1:4173`. If it remains unavailable, stop the launcher and
start it again.

### The Create button is disabled

One or more required providers failed their health check. Read the readiness
message or run `npm run rit-video -- doctor`. Do not bypass the check.

### AI-generated visuals are unavailable

Use deterministic educational visuals, or start and verify your ComfyUI
workflow.

### The output has source or accessibility blockers

This is expected for an incomplete draft. Correct the source metadata,
captions, descriptions, or script, generate a new draft, and repeat review.

## Getting help

Open an issue on the GitHub repository. Include:

- Your operating system
- The studio readiness message
- The stage at which the problem occurred

Do not attach private course material, student records, or credentials to
public issues.
