# Speed Benchmarks

These measurements describe observed development runs, not guaranteed service
levels. Planning, fresh media production, and frozen or cached replay are
different workloads and are reported separately.

## Reference machine and production profile

- Apple MacBook Pro with M4 Pro (12 CPU cores) and 24 GB memory
- Node.js pipeline with deterministic SVG visuals
- Edge TTS narration
- H.264/AAC release media at 1920×1080, 30000/1001 fps, and 48 kHz stereo
- `LONG_FORM_COURSE_CONCURRENCY=1`
- Current fast catalog profile: up to eight narration requests, three visual
  beats, and four chapter encodes may run concurrently inside one course
- macOS VideoToolbox 1080p teaching master plus a 720p H.264/AAC web preview

Provider latency, model context length, source-pack size, thermal state,
filesystem performance, and cache state can all change the result.

## Fresh full-lesson production

The following July 2026 runs started from completed, reviewed ten-beat lesson
specifications and include narration, deterministic visual generation, section
encoding, master assembly, captions, transcript, and package export. They do
not include faculty review time or local-model planning time.

| Lesson | Finished media | Wall time | Media produced per wall second |
| --- | ---: | ---: | ---: |
| Circular Entrepreneurship | 9:32 | 6:43.59 | 1.42× real time |
| Behavioral Malware Detection with Machine Learning | 9:36 | 7:09.86 | 1.34× real time |
| Community Nutrition Programs | 9:42 | 6:37.66 | 1.46× real time |
| **Three-lesson aggregate** | **28:49** | **20:31.11** | **1.41× real time** |

The mean fresh wall time was 6:50.37 per lesson, with a 6:37.66–7:09.86
range. In this sample, a completed minute of 1080p lesson media required about
42.7 seconds of wall time.

## Optimized current catalog render

On July 31, 2026, the current renderer rebuilt CSCI-141 after a visual-template
code change. Narration was served from exact verified cache entries; all
subject-matched SVG shots, ten encoded chapters, the 1080p master, loudness
analysis, and the 720p web preview were newly produced.

| Lesson | Finished media | Wall time | Media produced per wall second |
| --- | ---: | ---: | ---: |
| CSCI-141 Computer Science I | 10:02 | 2:10.03 | 4.63× real time |

The release QA reported 1920×1080 at 30000/1001 fps, 48 kHz stereo,
−16.02 LUFS integrated loudness, −1.51 dBTP true peak, no blockers, and no
warnings. The prior renderer took 16:16 for the same class of lesson, so this
measured rendering pass was 7.51× faster. It is not described as wholly fresh
provider production because the Edge TTS bytes were intentionally reused.

## Verified cache and frozen replay

An immediate unchanged rerender of the 9:32 Circular Entrepreneurship lesson
completed in 0.65 seconds. All ten narration requests, all ten rendered
sections, the master, and the review copy were verified cache hits. That is
approximately 621× faster than its 6:43.59 fresh run.

A separate four-course reference batch produced 34:36 of media. Its immediate
unchanged rerun completed in 1.23 seconds with all 40 sections, four masters,
and four review copies served from verified cache entries.

These figures measure manifest verification and artifact reuse. They do not
imply that a new lesson can be generated in under a second. Frozen replay also
fails rather than calling a provider when a required artifact is missing or
corrupt.

## Local Bonsai planning

The main pilot planner is PrismML Bonsai 27B Q1_0 served locally through
llama.cpp. A bounded ten-beat CSCI-141 planning pass took 62.481 seconds for
1,397 completion tokens on the reference machine, or about 22.36 output tokens
per second. A Qwythos 9B Q5 remediation pass for CSCI-261 took 65.2 seconds for
1,633 completion tokens at 26.3 output tokens per second with hidden thinking
disabled.

This planning measurement does not include narration, visual generation,
encoding, or review. The catalog generator uses a single local model stream
because concurrent 27B streams compete for memory bandwidth on the reference
machine. Smaller Bonsai 4B and 1.7B presets are available for first-pass
planning, but outputs must pass the same source, schema, accessibility, and
faculty-review gates.

## Interpreting the results

- **Fresh production** is the relevant estimate for a new approved script.
- **Recorded reuse** avoids repeating identical provider and render work.
- **Frozen replay** is the reproducibility path and prohibits network/model
  calls.
- **Planning speed** depends on the selected text model and is not the same as
  video-rendering speed.
- Human academic, visual, accessibility, and release review remains outside the
  automatic wall-time measurements.
