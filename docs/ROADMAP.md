# Roadmap

## v0.3.x — Open-source launch (current)

- [x] Apache 2.0 license, DCO-based contributing, code of conduct
- [x] General-audience README and User Guide
- [x] Cross-OS CI (Linux, macOS, Windows)
- [ ] Demo video on the README, made with the tool itself
- [ ] Good-first-issue backlog

## Shipped since v0.3

- [x] Local models (Ollama / LM Studio / llama.cpp, auto-detected), eight cloud
      providers, and custom OpenAI-compatible endpoints in the desktop app
- [x] Policy / international-relations diagram families, so non-STEM courses
      pass the subject-matched-visuals gate — see
      [ADDING_VISUALS.md](ADDING_VISUALS.md)
- [x] Audio-description script in the draft review, bound to release approval
- [x] `rit-video retime`, `**[DESCRIBE]**`, readable caption cues
- [x] Electron 44; desktop dependency tree audited in CI; Dependabot

## v0.4.0 — Desktop app

Goal: a non-technical user downloads one installer and makes a video with
zero terminal use and zero API keys.

- [x] `desktop/` Electron shell that boots `studio/server.mjs` in a utility
      process and loads the existing Studio UI
- [x] Bundled FFmpeg/FFprobe (per-platform static builds)
- [x] Pure-Node Edge TTS path (`uvx` no longer required; kept as fallback)
- [ ] Optional bundled Piper voices for fully-offline narration
- [x] First-run setup screen with three paths — script-only (no setup), a
      local model server (Ollama / LM Studio / llama.cpp, auto-detected), or
      any of eight cloud providers and custom OpenAI-compatible endpoints.
      Keys are encrypted with Electron `safeStorage`, every provider is
      contacted before it is saved, and the planner model is chosen from the
      models that endpoint actually serves
- [ ] `rit-video doctor` surfaced as a setup checklist screen
- [x] Installers: macOS dmg, Windows NSIS, Linux AppImage/deb via
      electron-builder + GitHub Actions release workflow
- [ ] Auto-update via electron-updater
- [x] Studio render test: the real server renders a complete video from a
      desktop-style config, offline (guards the boot-but-never-renders bug)
- [ ] Same render against the packaged app, not the source tree

## Next

- [ ] Diagrams generated from a pasted script's own structure; today most
      beats without an authored direction render a narration-only card

## Later

- macOS notarization and Windows code signing
- Bundled poppler (`pdftotext`) for PDF source packs
- More visual template families and languages
- Localized narration presets

Contributions welcome on any unchecked item — see
[CONTRIBUTING.md](../CONTRIBUTING.md).
