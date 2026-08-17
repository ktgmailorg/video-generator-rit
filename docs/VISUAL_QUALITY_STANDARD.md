# Educational Visual Quality Standard

This standard defines what “subject-matched visuals” means for an RIT course
pilot. Passing technical rendering is not enough: a visual must help a learner
understand the specific idea being narrated.

## Required outcome

Each visual beat must do at least one of the following:

- represent the actual subject or system being discussed;
- show a change, relationship, comparison, or causal path;
- make a calculation, structure, or decision inspectable; or
- guide attention through evidence in narration order.

Showing a production direction, repeating the narration as a paragraph, or
placing unrelated decorative geometry beside a title does not satisfy this
standard.

## Automated release checks

RIT course renders record the resolved visual family for every shot. A generic
text-card fallback is a release blocker. The visual manifest and quality report
must also show:

- a subject-matched deterministic template or an approved generated asset;
- at least two seconds of dwell time per shot;
- title-safe placement and readable contrast;
- no spoken or displayed production labels such as `NARRATOR`, `show`, or
  `display on screen`;
- meaningful visual information covered by narration or an audio-description
  cue; and
- synchronized captions and narration within 250 milliseconds at the start.

Automated checks confirm structure and provenance. They do not replace the
instructor's judgment about disciplinary accuracy.

## Human visual review

The reviewer answers these questions before approval:

1. Can a learner identify the actual subject without relying on the title?
2. Does each highlighted change correspond to what the narration says at that
   moment?
3. Are labels, quantities, arrows, and relationships academically correct?
4. Is the diagram simpler than the underlying concept without becoming
   misleading?
5. Does the visual remain understandable for a learner who cannot distinguish
   color alone?
6. Is every meaningful visual fact verbalized or included in the audio-
   description script?

Any “no” returns the visual plan for revision and invalidates its checksum-bound
approval.

## Reference examples

- **Oxygen transport:** show the trachea, left and right lungs, bronchi,
  alveoli, capillaries, red blood cells, and the direction of oxygen diffusion.
  Merely displaying the word “lungs” fails.
- **Management information systems:** follow a business event through people,
  process, validated records, analysis, a managerial decision, and feedback.
  A list of software components without the business outcome fails.
- **Algorithms:** animate the structure whose cost is being analyzed—such as a
  recurrence tree, dynamic-programming dependency table, graph frontier, or
  hash collision—rather than showing a generic flowchart.
- **Community program design:** map stakeholders and shared authority, then use
  process, evidence-table, comparison, and checklist scenes instead of reusing
  an unrelated technical pipeline.

## Draft and release language

Automated output is labeled **RIT course draft**. It becomes suitable for a
specific class only after script/evidence, visual/accessibility, and final
release review. An approved external brand pack is still required for any
official RIT-branded release.
