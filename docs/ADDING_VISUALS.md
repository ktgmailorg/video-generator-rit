# Adding a diagram family

Course videos draw their visuals from deterministic SVG "families" in
`src/visuals.mjs`. A beat whose direction matches no family renders a plain
text card, and for RIT presets that is a release blocker
(`subject-matched-visuals`). Adding a family is how a new subject area —
policy, history, ethics, chemistry — gets real diagrams.

A family is not a file and exports nothing. It is three edits in one file.

## 1. Selection rule — `ACADEMIC_TEMPLATE_RULES`

An ordered list of `[regex, "showcase-<id>"]`; **the first match wins**.

- Put specific rules before general ones. Existing rules claim ordinary
  words: `consensus` and `quorum` select the distributed-systems diagram,
  `adversary` the threat model, `signal` the signals diagram, `hierarchy` and
  `contrast` the generic ones. A rule for political or social content must sit
  above them or a treaty beat becomes a replica-set diagram.
- Write patterns as word starts, not fragments. Rules are matched at a word
  boundary, so `heap` no longer fires inside `cheaply`. A stem such as
  `cryptograph` still matches `cryptography`.
- Prefer distinctive phrases (`think tanks`, `grand bargain`) over single
  common words.

## 2. Subtitle — `academicSceneLabel`

Add `"showcase-<id>": "Family name · imperative subtitle"`. Skipping this
silently shows the generic subtitle.

## 3. Body — `showcaseVisualBody`

Add `if (template === "showcase-<id>") { return `<g>…</g>`; }` before the final
fallback. Return a fragment: no `<svg>`, no `<defs>`. Shared ids
(`showcase-arrow`, `showcase-glow`) come from the wrapper.

Constraints:

- **Pure.** Same inputs, same bytes. No `Date`, no `Math.random`.
- **Canvas 1920×1080**, body inside roughly x 96–1824 and y 280–840; the
  wrapper owns the title, subtitle, narration bar, and progress bar.
- **Colour from `accent` / `secondary` only.** No new hues. Neutral scaffold
  colours already in use (`#202020`, `#151515`, `#ffffff`, `#cfd2d3`) are fine.
- **Fonts:** `Arial, Liberation Sans, sans-serif` (equations may use
  `Georgia, Liberation Serif, serif`). The repo ships no font files.
- **Never encode state by colour alone.** Highlight with fill, stroke width,
  and size together; an accessibility reviewer asks whether the scene reads
  without distinguishing colour.
- **Highlight follows the shot.** `shotIndex % n` picks the highlighted
  element; each shot covers the narration sentence at its proportional
  position. You do not author timing.

## Labels come from the author, not the family

Nodes take their text from the beat's `**[VISUAL]**` direction through
`academicDiagramLabels`, which recognises `from A to B to C`, `columns for A, B,
C`, quoted runs, and a **parenthesised list** — the most reliable:

```markdown
**[VISUAL]** Contrasting cases with divergent outcomes (KEPT ITS PROGRAMME,
GAVE ITS PROGRAMME UP, LEFT ALONE, REGIME REMOVED).
```

Two rules follow, both learned the hard way:

- **Never bake content into a family.** The first policy families printed text
  from the lesson they were built for ("REGIME REMOVED"). Once the desktop app
  could select them automatically, an unrelated lesson would have displayed
  claims nobody wrote. Fallback labels must be neutral structure
  (`FIRST PREMISE`, `FIRST CASE`); `tests/course.test.mjs` asserts no family
  leaks lesson text.
- **Instructions are not labels.** With no list, the miner will happily turn
  your instructions into node text. If a family needs N labels, make the
  direction supply N.

## Register it, then test it

- Add the id to `RENDERABLE_SHOWCASE_TEMPLATES`. An id outside that set is
  ignored in favour of inference, so a typo cannot pass the visuals gate with a
  generic card; a test renders every registered id to keep the set honest.
- Bump `cacheVersion` in `src/pipeline/visual-generation.mjs`, or projects keep
  images from the old body.
- In `tests/course.test.mjs`: one row in the showcase table (family id and a
  string only that family prints); positive selection assertions through
  `resolveCourseVisualTemplate`; **negative** assertions that your vocabulary
  does not steal an existing family and theirs does not steal yours.
- **Render it and look.** Assertions cannot see a label colliding with a line
  or text running out of its box. Render to PNG and inspect it.

## Storyboard side

Select a family explicitly with `**[VISUAL]** template:showcase-<id> | …`, or
let inference choose. Add `**[DESCRIBE]**` for anything on screen the narration
does not say aloud; it goes into the audio-description script.
