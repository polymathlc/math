# Custom Paper: 2023 PSLE Mathematics layout (v1.70.0)

Exam paper mode follows the 2023 paper supplied for this change. This is a
reference layout, not a claim about the current PSLE syllabus. Worksheet mode
continues to use the ordinary worksheet renderer.

| Section | Reference questions | Reference marks | Numbering |
| --- | --- | --- | --- |
| Paper 1 Booklet A | 15 MCQs | First 10 × 1, next 5 × 2 = 20 | 1–15 |
| Paper 1 Booklet B | 15 written | First 5 × 1, next 10 × 2 = 25 | 16–30 |
| Paper 2 | 17 written | 55 | Restarts at 1 |

The section menu stores `_cpbBook` as `a`, `b` or `p2`. Unidentified written
questions stay in Booklet B; a marks value alone must never imply Paper 2.
The screenshot reader can supply `paperSection` when a visible heading/footer
identifies it. Teachers can change the section and marks directly in the list.
Printed or teacher-entered marks take priority; 0 uses the reference allocation
for Paper 1 and defaults to 2 in Paper 2. The UI counts missing allocations.

Saved paper/draft metadata and teacher-edited allocations survive reopening and
question editing. Existing explicit section/mark values are preserved. Timings
are editable separately (defaults: 1 hour for Paper 1, 1 hour 30 minutes for
Paper 2). Empty sections are omitted. Covers state actual totals, never targets.

`cpbLayout()` owns question order and numbering. Paper 2 restarts at 1, while
answer-key labels also name the paper/booklet to remove ambiguity.
`cpbPaperOpts()` enables the `paper.psle` presentation through
`wsBuildDocumentHtml()`. Question content still uses `wsQuestionChunkHtml()`;
the optional `exam` argument supplies numbered options, Ans lines and marks.

The exported document waits for fonts/images before measuring physical A4 page
boxes. It keeps introductions with their first question, moves whole questions
where possible, and continues long questions at block boundaries. Each booklet
has its own page numbering, footer, accurate cover page count and an optional
blank final page to make an even page count. Preview and print share those pages.
The separate MCQ answer sheet and optional teacher key follow the exam booklets.

Validation:

- `node tools/psle-paper-tests.mjs`: real model/rendering regression checks.
- `node tools/custom-paper-tests.mjs` and `node tools/scheduled-release-tests.mjs`.
- Existing worksheet answer-field, header and objectives-box tests.
- `.github/workflows/psle-paper.yml`: Chromium checks screen/print overflow,
  question preservation, numbering and long-question continuation, and exports
  synthetic sample PDFs/screenshots for visual inspection.

This Mathematics-specific layout supersedes the older two-booklet description
in CLAUDE.md; it is not intended for the Science paper exporter.
