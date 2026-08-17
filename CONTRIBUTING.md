# Contributing to video-generator-rit

Thanks for your interest! This is an open-source community project of the
RIT AI Club — contributions are welcome from anyone, anywhere.

## Getting started

1. Fork and clone the repository.
2. Install prerequisites: Node.js 22+, FFmpeg/FFprobe (`pdftotext` optional,
   for PDF source packs).
3. `npm ci`
4. `npm test` — all tests use `node --test` and run offline.
5. Try the pipeline: `npm run rit-video -- init --preset generic`, then
   `npm run rit-video -- doctor`.

## Ways to contribute

- Bug reports and reproduction cases (issues welcome)
- Provider adapters and CLI/HTTP bridges
- Visual templates and accessibility improvements
- Studio UI/UX improvements for non-technical users
- Documentation and example course packs
- Desktop packaging (see the roadmap)

## Pull requests

- Keep changes focused; one concern per PR.
- `npm test` must pass; add tests for new behavior.
- `node --check` must pass on every touched `.mjs` file (CI enforces this).
- No binary media, model weights, credentials, or brand assets in the repo.

## Developer Certificate of Origin

By contributing, you certify the [Developer Certificate of Origin
(DCO) 1.1](https://developercertificate.org/): that you wrote the
contribution or otherwise have the right to submit it under the Apache 2.0
license. Sign off your commits with `git commit -s`.

## Questions

Open a GitHub issue or discussion.
