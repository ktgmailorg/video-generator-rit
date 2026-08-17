# Roadmap

## v0.3.x — Open-source launch (current)

- [x] Apache 2.0 license, DCO-based contributing, code of conduct
- [x] General-audience README and User Guide
- [ ] Cross-OS CI (Linux, macOS, Windows)
- [ ] Demo video on the README, made with the tool itself
- [ ] Good-first-issue backlog

## v0.4.0 — Desktop app

Goal: a non-technical user downloads one installer and makes a video with
zero terminal use and zero API keys.

- [ ] `desktop/` Electron shell that boots `studio/server.mjs` in-process
      and loads the existing Studio UI
- [ ] Bundled FFmpeg/FFprobe (per-platform static builds)
- [ ] Pure-Node Edge TTS path (drop the `uvx` requirement); optional bundled
      Piper voices for fully-offline narration
- [ ] First-run wizard: Free mode (no keys) vs. bring-your-own keys
      (stored with Electron `safeStorage`)
- [ ] `rit-video doctor` surfaced as a setup checklist screen
- [ ] Installers: macOS dmg, Windows NSIS, Linux AppImage/deb via
      electron-builder + GitHub Actions release workflow
- [ ] Auto-update via electron-updater
- [ ] Packaged-app smoke test (launch → frozen-mode render → assert output)

## Later

- macOS notarization and Windows code signing
- Bundled poppler (`pdftotext`) for PDF source packs
- More visual template families and languages
- Localized narration presets

Contributions welcome on any unchecked item — see
[CONTRIBUTING.md](../CONTRIBUTING.md).
