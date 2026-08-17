# RIT production controls

This preset encodes public RIT guidance into local, reviewable workflow rules.
It does not grant brand authority or publish content.

- [RIT videography guidelines](https://www.rit.edu/brandportal/videography)
- [RIT color palette](https://www.rit.edu/brandportal/colors)
- [RIT logo guidance](https://www.rit.edu/brandportal/logos)
- [RIT accessibility: prerecorded video](https://www.rit.edu/brandportal/principle-1-perceivable)
- [RIT captioning service](https://www.rit.edu/teaching/captioning)
- [RIT Academic Integrity Policy](https://www.rit.edu/policies/d080)
- [RIT teaching guidance for AI expectations](https://www.rit.edu/teaching/ai-set-expectations)

The renderer uses 1920×1080, 30000/1001 fps, 48 kHz centered stereo,
restrained fades, safe title insets, closed captions, and accessible
transcripts. The no-logo token is the public digital RIT Orange `#F76902`.
Arial/Georgia are requested when available, with Liberation Sans/Serif as the
release-container fallback.

Official logos and licensed fonts must remain outside this repository. Central
media supplies `brand-pack.json` with a version, approval authority, usage
scope, provenance, and a checksum for every asset. Only `rit-media` may apply
that pack. The final approval binds the master, captions, transcript, QA, and
disclosure checksums.

The first institutional release should still complete three human-reviewed
pilots: a short faculty lesson, a student assignment, and a central-media
package imported into an RIT Panopto test folder.
