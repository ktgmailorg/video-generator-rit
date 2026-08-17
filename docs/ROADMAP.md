# Roadmap

## v0.3.x — Open-source launch (current)

- [x] Apache 2.0 license, DCO-based contributing, code of conduct
- [x] General-audience README and User Guide
- [x] Cross-OS CI (Linux, macOS, Windows)
- [ ] Demo video on the README, made with the tool itself
- [ ] Good-first-issue backlog

## v0.4.0 — Desktop app

Goal: a non-technical user downloads one installer and makes a video with
zero terminal use and zero API keys.

- [x] `desktop/` Electron shell that boots `studio/server.mjs` in a utility
      process and loads the existing Studio UI
- [x] Bundled FFmpeg/FFprobe (per-platform static builds)
- [x] Pure-Node Edge TTS path (`uvx` no longer required; kept as fallback)
- [ ] Optional bundled Piper voices for fully-offline narration
- [x] First-run setup screen: Free mode (no keys) vs. bring-your-own keys,
      encrypted with Electron `safeStorage`, key verified against the
      provider before saving and the planner model chosen from the account's
      own model list
- [ ] `rit-video doctor` surfaced as a setup checklist screen
- [x] Installers: macOS dmg, Windows NSIS, Linux AppImage/deb via
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
