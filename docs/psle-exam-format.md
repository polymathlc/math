# Custom Paper: the 2026 Nan Hua exam format (v1.74.0)

Exam paper mode follows the supplied reference, page for page:
`P6_Maths_Prelim_2026_NanHua_Exam_Papers.pdf` — the Nan Hua Primary School
Preliminary Examination 2026, Primary Six Mathematics. It is a supplied
reference, not a claim about the current PSLE syllabus. Worksheet mode
continues to use the ordinary worksheet renderer and is unaffected.

`CPB_REF` in `index.html` (search `THE REFERENCE PAPER`) is the table below in
code, and every count, target, default timing and section rule reads it.

## The structure — a different number of questions in each section

| Section | Questions | Marks | Numbering | Working |
| --- | --- | --- | --- | --- |
| Paper 1 Booklet A | 18 MCQs | Q1–10 × 1, Q11–18 × 2 = **26** | 1–18 | none; shaded on the Optical Answer Sheet |
| Paper 1 Booklet B | 12 short-answer | 12 × 2 = **24** | 19–30 | blank space + `Ans:` per part, score box in the margin |
| Paper 2, Q1–5 | 5 short-answer | 5 × 2 = **10** | 1–5 | as Booklet B |
| Paper 2, Q6–15 | 10 longer | 3–5 each = **40**, in brackets `[ ]` | 6–15 | as Booklet B, marks bracketed on every `Ans:` line |

Paper 1 totals 50 marks over 30 questions and Paper 2 totals 50 marks over 15
questions (100 overall). Paper 1 is 1 hour 10 minutes for both booklets;
Paper 2 is 1 hour 20 minutes. Calculators are allowed in Paper 2 only.

The reference's Paper 2 allocations, Q1–Q15, are
`2,2,2,2,2,3,3,4,3,4,4,4,5,5,5` (`CPB_REF.p2Allocations`), which add to 50.
Q7, Q8, Q9, Q10, Q12, Q13, Q14 and Q15 print a mark against **each part**
(`[1]` after `Ans: (a)`, `[2]` after `Ans: (b)`); the others print one bracket.

Source pages in the PDF: covers on 1 / 11 / 20; section instructions on
2 / 12 / 21 / 24; the Booklet A answer grid and worked answers on 35–39.

## What the page does with it

- **Counts per section are measured in QUESTIONS as well as marks.**
  `cpbMarks()` reports `needMcq` (Booklet A questions), `needOpenQ` /
  `needOpen` (Booklet B questions / marks) and `needPaper2Q` / `needPaper2`
  (Paper 2 questions / marks), and the ③ panel shows a chip for each. The
  targets are `targetMcq` (18), `targetOpenQ` (12), `targetOpen` (24),
  `targetPaper2Q` (15) and `targetPaper2` (50) on the meta object; 0 turns
  one off. **Use the 2026 Nan Hua targets and timings** resets them without
  touching questions or marks.
- **A stored default nobody chose is lifted on the way in** (`cpbMetaFromStored`,
  v1.74.1). Targets and timings are written into every draft and saved paper, so
  a sheet started under the 2023 PSLE layout carried 15 / 25 / 55 and 1 hour /
  1 hour 30 minutes in its own meta and the panel kept measuring against them.
  Every stored meta now passes through `cpbMetaFromStored`, which replaces a
  value listed in `CPB_META_SUPERSEDED` with the current default, field by
  field, and leaves anything a teacher typed alone.
- **`cpbPaper2Split()` is the ONE place Paper 2's two sections are decided**:
  the first `CPB_P2_SHORT` (5) questions form the 2-mark opening section when
  there are at least five and each is worth exactly 2; otherwise the whole
  paper is the bracketed kind. The printed paper, the ③ panel's sub-headings
  and the totals all ask it, so the heading a child reads is the heading the
  teacher saw.
- **Marks.** Printed or teacher-entered marks win. A mark left at 0 takes the
  reference's Paper 1 allocation for its position (1 for the first ten MCQs,
  2 for the rest and for all of Booklet B) and 2 in Paper 2. The UI counts
  missing allocations. Covers and the answer key print the marks actually
  allocated, never the targets.
- **Part marks.** The reader returns `partMarks` (`[1,2]`) when a page prints
  a mark against each lettered part; `cpbReadPartMarks` keeps only a
  plausible list of two or more, and `cpbPartMarks(q, total)` believes it
  only when it adds up to the question's marks. They print as `[n]` at the
  end of each `Ans: (a)` line in Paper 2's bracketed section; a question in
  parts with one printed mark carries it on the last part's line. Editing a
  question's total by hand drops a split that no longer adds up.
- **Section menu.** `_cpbBook` is `a`, `b` or `p2`. An unidentified written
  question stays in Booklet B; a marks value alone never implies Paper 2. The
  reader can supply `paperSection` when a visible heading or footer names it.
- **Persistence.** Saved papers and drafts keep section, marks, part marks,
  the class-line label and the date; `CPB_EDITOR_FIELDS` lists what the
  editor owns, and everything else is carried across an edit.

## The printed paper

`cpbPaperOpts()` enables the `paper.psle` presentation through
`wsBuildDocumentHtml()` → `cpbBuildPsleDocumentHtml()`. Question content still
comes from `wsQuestionChunkHtml()`; the `exam` argument carries `book`,
`marks`, `brackets` and `partMarks`.

- **Three covers** (`cpbPsleCover`), in the reference's layout: centre / exam
  and year / level / subject / PAPER n / (BOOKLET X); the time line right
  aligned; `INSTRUCTIONS TO CANDIDATES` with the reference's own six (A) or
  seven (B, Paper 2) items; a **Marks Obtained** table on the Booklet B cover
  (Booklet A, Booklet B, Paper 2, Total — `cpbCoverMarksTable`) and a one-row
  Maximum / Actual Marks table on the Paper 2 cover; a name line with an
  index bracket, a `Class:` line (`classLabel`, editable) and a `Date :` line
  (`date`, a blank rule when empty); "This booklet consists of N printed
  pages" filled in by the paginator. The PSLE index grid and barcode box are
  gone from the covers; the index grid stays on the separate answer sheet.
- **Section instructions** above each run, in the reference's words:
  Booklet A names the 1-mark and 2-mark ranges and the Optical Answer Sheet;
  Booklet B and Paper 2 Q1–5 say "Questions n to m carry 2 marks each. Show
  your working clearly…"; Paper 2's second section says "For questions 6 to
  15, … The number of marks available is shown in brackets [ ] at the end of
  each question or part-question." Each lead ends with "(N marks)".
- **The margin.** Every written-answer page (`cpb-has-margin`, Booklet B and
  Paper 2, never a cover or a blank page) carries a rule down its right side,
  "Please do not write in the margin." up its length and a score box
  (`.cpb-score`) beside every question. The box hangs into the page body's
  padding, so it never widens a question or moves the pagination.
- **Working space** (`cpbWorkMm`): 40 mm in Booklet B (16 mm for a 1-mark
  question), 80 mm in Paper 2's first section, 40 + 22 × marks mm (capped at
  150) in its second; the paginator gives it back when a question would not
  otherwise fit.
- **Pagination** waits for fonts and images, measures physical A4 page
  boxes, keeps an introduction with its first question, moves whole
  questions where possible and continues long questions at block boundaries.
  Each booklet has its own page numbering, footer code (`0008/1(A)`-style),
  page count on its cover and an even page count via one blank page.
- **The answer key** opens with the Booklet A grid (`cpbMcqKeyHtml` — Q1…Q18
  over the option chosen, ten to a row, the way the reference prints it),
  then the worked answers for Booklet B and Paper 2 labelled by paper and
  booklet, since Paper 2 restarts at Q1. The optional Booklet A answer sheet
  follows the exam booklets.

Every question row in both Custom Paper modes has an eye button that shares
the Vetting export preview controller and worksheet renderer; **Edit
question** returns through `cpbEditQuestion`.

## Validation

- `node tools/psle-paper-tests.mjs`: the model (section counts, marks, part
  marks, the Paper 2 split), the three covers, the section wording, the
  brackets, the margin boxes and the answer key grid.
- `node tools/custom-paper-tests.mjs` and `node tools/scheduled-release-tests.mjs`.
- Existing worksheet answer-field, header and objectives-box tests.
- `node tools/vetting-export-hover-tests.mjs`: shared preview lifecycle and
  Custom Paper question resolution / edit routing.
- `.github/workflows/psle-paper.yml`: Chromium checks screen / print overflow,
  question preservation, numbering and long-question continuation, and
  exports synthetic sample PDFs / screenshots for visual inspection.

This Mathematics-specific layout supersedes the older two-booklet description
in CLAUDE.md; it is not intended for the Science paper exporter.
