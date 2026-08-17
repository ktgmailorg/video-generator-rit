# RIT Video Studio — desktop app

An Electron shell around the [local studio](../studio/) so non-technical
users can make course videos with one download: no terminal, no API keys
required, FFmpeg bundled.

## What it does

- Boots `studio/server.mjs` in a background utility process on a free
  localhost port and opens the studio UI in an app window
- Shows a first-run setup screen: **Free mode** (no keys at all) or
  **bring your own key** for Anthropic/OpenAI text planning
- Generates the studio config from that choice — the zero-key **generic
  preset** (Edge TTS narration + deterministic SVG visuals), plus a hosted
  planner profile per configured key — stored in the per-user app data
  directory alongside all output
- Ships static FFmpeg/FFprobe binaries and wires them via
  `VIDEO_FFMPEG`/`VIDEO_FFPROBE`; a system install is used as fallback in
  development
- Power users can drop a hand-edited `video.config.json` into the app data
  directory to route any provider profile

## Develop

```bash
cd desktop
npm install
npm start          # launch the app against the repo checkout
npm run smoke      # headless boot check: starts the server, prints SMOKE OK
```

## Build installers

```bash
npm run dist       # dmg/zip (macOS), nsis (Windows), AppImage/deb (Linux)
```

Installers for all three platforms are built by the `release` GitHub Actions
workflow when a `v*` tag is pushed.

## Model sources

The setup screen offers three paths, defined by `PROVIDER_CATALOG` in
`credential-providers.mjs` (pure, unit-tested) and stored by
`credentials.mjs`:

| Kind | Providers | Credential |
| --- | --- | --- |
| `local` | Ollama, LM Studio, llama.cpp server | none |
| `cloud` | Anthropic, OpenAI, Google Gemini, Groq, Mistral, DeepSeek, OpenRouter, Together | your own API key |
| `custom` | any OpenAI-compatible endpoint | optional API key |

Adding a provider is a data change: append an entry to `PROVIDER_CATALOG`.
Anything OpenAI-compatible needs only `baseUrl` and `apiKeyEnv`.

- **Local servers are auto-detected.** The setup screen probes each local
  endpoint and shows what is already running, with its model list.
- **Nothing is guessed.** A provider is contacted before it is saved, and the
  planner model is chosen from the models that endpoint actually serves.
- **Execution location is derived, not claimed:** a custom endpoint on
  loopback yields `executionLocation: "local"`; anything else is `hosted` and
  must be allowlisted in `dataPolicy.allowedHostedProviders` for the studio
  gate to accept it. Choosing a local model therefore keeps planning entirely
  on the machine.
- **Key storage** is Electron `safeStorage` (macOS Keychain, Windows DPAPI,
  libsecret) at `userData/credentials.enc.json`, mode `0600`. Where no keyring
  is available a key is held in memory for that session only; plaintext keys
  are never written to disk.
- Keys are injected as environment variables into the studio server process
  only. No IPC channel returns a stored key to any renderer — the setup
  window sees a masked hint such as `sk-an…cdef`.
- Saving or removing a provider rewrites the config and restarts the server.

**On "sign in with ChatGPT / Claude":** neither vendor offers a third-party
OAuth flow that lets an app act on a consumer ChatGPT or Claude subscription;
their OAuth is reserved for their own first-party clients. API keys — or a
local model, which needs no credential at all — are the supported paths.
`PROVIDER_CATALOG[].authKinds` is the extension point if that changes.

## Known gaps (see [docs/ROADMAP.md](../docs/ROADMAP.md))

- Unsigned builds: macOS Gatekeeper and Windows SmartScreen will warn
- Optional bundled Piper voices for fully-offline narration
- No packaged end-to-end render test yet (the smoke test covers boot only)
