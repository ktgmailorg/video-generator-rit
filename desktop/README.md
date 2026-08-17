# RIT Video Studio — desktop app

An Electron shell around the [local studio](../studio/) so non-technical
users can make course videos with one download: no terminal, no API keys
required, FFmpeg bundled.

## What it does

- Boots `studio/server.mjs` in a background utility process on a free
  localhost port and opens the studio UI in an app window
- Generates the zero-key **generic preset** config (Edge TTS narration +
  deterministic SVG visuals) on first run, stored in the per-user app data
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

## Known gaps (see [docs/ROADMAP.md](../docs/ROADMAP.md))

- Edge TTS still shells out to `uvx`; a pure-Node client is planned so free
  mode needs no Python at all
- No first-run wizard yet for entering hosted API keys (`safeStorage`)
- Unsigned builds: macOS Gatekeeper and Windows SmartScreen will warn
