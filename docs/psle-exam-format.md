# Custom Paper: PSLE covers with the 2026 paper structure (v1.73.0)

Exam paper mode keeps the existing PSLE cover layout and follows the question
types, marks targets and timings in `P6_Maths_Prelim_2026_NanChiau_Exam_Papers.pdf`.
This is a supplied reference, not a claim about the current PSLE syllabus.
Worksheet mode continues to use the ordinary worksheet renderer.

| Section | Reference questions | Reference marks | Numbering |
| --- | --- | --- | --- |
| Paper 1 Booklet A | 18 MCQs | First 10 × 1, next 8 × 2 = 26 | 1–18 |
| Paper 1 Booklet B | 12 short-answer | 12 × 2 = 24 | 19–30 |
| Paper 2, first section | 5 short-answer | 5 × 2 = 10 | 1–5 |
| Paper 2, second section | 10 longer questions | 3–5 marks each; stated target 40 | 6–15 |

Paper 1 totals 50 marks, and Paper 2's stated target is 50 marks (100 overall).
The source cover is on PDF pages 1/11/19; section instructions are on pages
2/12/20/23. Its Paper 2 question allocations are
`2,2,2,2,2,3,3,4,3,3,4,4,5,5,5`, which total **49**, despite the stated 50.
Do not silently add a mark to a source question. Preserve printed/teacher
allocations and show the shortfall; generated covers state actual totals.
The browser fixture explicitly uses a synthetic teacher correction to Q9
from 3 to 4 marks to exercise a complete 100-mark paper.

The section menu stores `_cpbBook` as `a`, `b` or `p2`. Unidentified written
questions stay in Booklet B; a marks value alone must never imply Paper 2.
The screenshot reader can supply `paperSection` when a visible heading/footer
identifies it. Teachers can change the section and marks directly in the list.
Printed or teacher-entered marks take priority; 0 uses the reference allocation
for Paper 1 (first ten MCQs: 1, remaining MCQs and all Booklet B questions: 2)
and defaults to 2 in Paper 2. The UI counts missing allocations.

Saved paper/draft metadata and teacher-edited allocations survive reopening and
question editing. Existing explicit section/mark values are preserved. Timings
are editable separately (defaults: 1 hour 10 minutes for Paper 1, 1 hour 20 minutes
for Paper 2). Existing saved settings are retained; **Use 2026 targets and timings**
applies the new targets/timings without changing questions, marks or other fields.
Empty sections are omitted. Covers state actual totals, never targets.

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

Every question row in both Custom Paper modes has an eye button. It shares the
Vetting export preview controller and worksheet renderer: hover/focus opens a
scrollable preview, click/tap opens the full question preview, and **Edit question**
returns through `cpbEditQuestion`. The explicit `cpb` source resolves the latest
local draft, including unsaved edits, without looking in the bank or falling back
to a same-ID Vetting question. Rerender/navigation/Escape dismiss stale previews.

Validation:

- `node tools/psle-paper-tests.mjs`: real model/rendering regression checks.
- `node tools/custom-paper-tests.mjs` and `node tools/scheduled-release-tests.mjs`.
- Existing worksheet answer-field, header and objectives-box tests.
- `node tools/vetting-export-hover-tests.mjs`: shared preview lifecycle and
  Custom Paper question resolution/edit routing.
- `.github/workflows/psle-paper.yml`: Chromium checks screen/print overflow,
  question preservation, numbering and long-question continuation, and exports
  synthetic sample PDFs/screenshots for visual inspection.

This Mathematics-specific layout supersedes the older two-booklet description
in CLAUDE.md; it is not intended for the Science paper exporter.
