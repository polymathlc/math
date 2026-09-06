// Regression tests for 🗂️ CUSTOM PAPER — a mock exam paper, or an ordinary
// worksheet, built from screenshots.  Run with:
//     node tools/custom-paper-tests.mjs
//
// The whole app is one file, so this reads the module out of index.html as
// TEXT and evaluates only the sections it is about.
//
// The page does four things and every one of them fails silently:
//
//  • THE MODE decides the FORMAT and nothing else, and `cpbMode()` FAILS TO
//    'paper'. Every sheet saved before the second mode existed carries no
//    `mode` field and is a paper; fail the other way and a mock exam comes off
//    the printer with its covers, its booklet split and its answer sheet gone,
//    on the morning a class sits it.
//  • THE BOOKLET SPLIT decides whether a child is given working space to write
//    in. A question in the wrong booklet is answerable in the wrong place, and
//    that is found in the exam hall.
//  • THE NUMBERING runs straight through both booklets. Numbered per booklet
//    instead, Booklet B starts again at 1 and every row on the answer key is
//    against the wrong question. A WORKSHEET is one list in the order the
//    teacher arranged it — re-ordered, its MCQs jump to the front of a sheet
//    whose order was the whole point of arranging it.
//  • THE HOLD-BACK is the only reason the page is safe to use on a live bank.
//    It is folded into `qReleased`, which `loadBank` already asks, so every
//    student-facing surface gained it without being told. Lift it into a gate
//    of its own and the next reader somebody writes serves next week's paper
//    to the class sitting it.
import fs from "fs";

const HTML = new URL("../index.html", import.meta.url).pathname;
const src = fs.readFileSync(HTML, "utf8");

const cut = (from, to, what) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(what + ': "' + from.slice(0, 46) + '" not found in index.html');
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error(what + ": end marker not found");
  return src.slice(a, b);
};

let fails = 0, ran = 0;
function ok(name, cond, extra) {
  ran++;
  if (cond) return;
  fails++;
  console.error("FAIL: " + name + (extra ? "\n      " + extra : ""));
}
const eq = (name, got, want) => ok(name, got === want, "got " + JSON.stringify(got) + ", want " + JSON.stringify(want));

/* ------------------------------------------------------------------ *
 * The REAL mode + booklet model, run as itself.                       *
 * ------------------------------------------------------------------ */
const modes = cut("// 🅰 TWO MODES — an exam paper, or an ordinary worksheet",
                  "const CPB_MAX_SHOTS", "modes");
const model = cut("const CPB_MAX_SHOTS = 160;",
                  "\n// ---- The draft survives the window", "booklet model");

const api = new Function(`
  // The two shape tests the model leans on, exactly as the app defines them.
  const wsHasMcq = q => Array.isArray(q && q.options) && q.options.length >= 2;
  const questionIsAnnotation = q => (q && q.blocks || []).some(b => b && b.annotate);
  ${modes}
  ${model}
  return {
    CPB_MODES, cpbMode, cpbIsWorksheet, cpbThing,
    cpbIsMcqOnly, cpbBookOf, cpbSetBook, cpbLayout, cpbMarks,
    cpbQuestionMarks, cpbDefaultMarks, cpbTargetNum, cpbGapLabel, cpbGapClass,
    CPB_TARGET_MCQ, CPB_TARGET_OPEN_MARKS, CPB_TARGET_QUESTIONS, CPB_MCQ_MARKS,
    set: qs => { cpbQuestions = qs; },
    get: () => cpbQuestions,
    setMeta: m => { cpbMeta = m || {}; },
  };
  function cpbRender() {}
`)();

const mcq = (id, extra) => Object.assign({ id, title: id, blocks: [{ type: "text", content: "x" }], options: ["a", "b", "c", "d"], correctOption: 0 }, extra || {});
const open = (id, marks) => ({ id, title: id, blocks: [{ type: "text", content: "x" }], marks });

/* ---------- ① the mode, and its fallback ---------- */
api.setMeta({});
ok("no mode field at all is a PAPER — which is what every sheet saved before this is",
   api.cpbMode() === "paper" && api.cpbIsWorksheet() === false);
api.setMeta({ mode: "nonsense" });
ok("…and so is a value nobody recognises", api.cpbMode() === "paper",
   "failing to worksheet strips the covers off a mock exam somebody is about to sit");
api.setMeta({ mode: "worksheet" });
ok("only the word itself is a worksheet", api.cpbMode() === "worksheet" && api.cpbIsWorksheet() === true);
eq("the word for what is being built comes from ONE place", api.cpbThing(), "worksheet");
api.setMeta({});
eq("…and says paper in the other mode", api.cpbThing(), "paper");
ok("both modes are described to the teacher, not just named",
   ["paper", "worksheet"].every(k => api.CPB_MODES[k] && api.CPB_MODES[k].label && api.CPB_MODES[k].blurb && api.CPB_MODES[k].icon));

/* ---------- ② the split ---------- */
ok("an MCQ with nothing to write is Booklet A", api.cpbBookOf(mcq("q1")) === "a");
ok("a written answer is Booklet B", api.cpbBookOf(open("q2", 3)) === "b");
ok("a question with no options at all is Booklet B", api.cpbBookOf({ id: "q", blocks: [] }) === "b");
ok("nothing at all is Booklet B rather than a crash", api.cpbBookOf(null) === "b");
// The load-bearing half: an annotation question is answered ON its diagram, so
// it needs the sheet however its options read — the safe direction, whose
// worst case is working space nobody uses.
ok("an ANNOTATION question is Booklet B even with options on it",
   api.cpbBookOf({ id: "q", options: ["a", "b"], correctOption: 0, blocks: [{ type: "image", annotate: true }] }) === "b");
ok("one option is not a multiple choice", api.cpbBookOf({ id: "q", options: ["only"], correctOption: 0, blocks: [] }) === "b");

/* ---------- ③ the override ---------- */
{
  api.set([mcq("q1")]);
  api.cpbSetBook("q1", "b");
  ok("a question moved by hand goes where it was put", api.cpbBookOf(api.get()[0]) === "b");
  api.cpbSetBook("q1", "a");
  ok("…and back again", api.cpbBookOf(api.get()[0]) === "a");
  api.cpbSetBook("q1", "nonsense");
  ok("a booklet that is neither is refused, not stored", api.cpbBookOf(api.get()[0]) === "a");
}

/* ---------- ④ the numbering, in both modes ---------- */
{
  // Interleaved exactly as they come off a real pile of screenshots.
  const mixed = [mcq("a1"), open("b1", 2), mcq("a2"), open("b2", 3)];
  api.set(mixed);
  api.setMeta({});
  const paper = api.cpbLayout();
  eq("a PAPER re-orders into its two booklets", paper.list.map(q => q.id).join(","), "a1,a2,b1,b2");
  eq("Booklet A is numbered from 1", [paper.numbers.a1, paper.numbers.a2].join(","), "1,2");
  eq("Booklet B carries straight on from it, never restarting at 1",
     [paper.numbers.b1, paper.numbers.b2].join(","), "3,4");
  ok("every question on the paper has a number",
     Object.keys(paper.numbers).length === 4 && Object.values(paper.numbers).every(n => /^\d+$/.test(n)));

  api.setMeta({ mode: "worksheet" });
  const sheet = api.cpbLayout();
  ok("a WORKSHEET is one list, in the order the teacher arranged it",
     sheet.worksheet === true && sheet.list.map(q => q.id).join(",") === "a1,b1,a2,b2",
     "re-ordered, the MCQs jump to the front of a sheet whose order was the point of arranging it");
  eq("…numbered 1…n down that order",
     ["a1", "b1", "a2", "b2"].map(id => sheet.numbers[id]).join(","), "1,2,3,4");
  ok("…and it has no booklets at all", sheet.a.length === 0 && sheet.b.length === 4,
     "`b` is everything so the totals read the same fields in either mode");
  api.setMeta({});
}
{
  api.set([mcq("a1"), mcq("a2")]);
  eq("an all-MCQ paper numbers 1..n", [api.cpbLayout().numbers.a1, api.cpbLayout().numbers.a2].join(","), "1,2");
  api.set([open("b1", 1), open("b2", 1)]);
  eq("an all-open paper starts at 1 too, because Booklet A is empty",
     [api.cpbLayout().numbers.b1, api.cpbLayout().numbers.b2].join(","), "1,2");
  api.set([]);
  const empty = api.cpbLayout();
  ok("an empty paper is two empty booklets rather than a crash", empty.a.length === 0 && empty.b.length === 0);
}

/* ---------- ⑤ the marks ---------- */
{
  api.setMeta({});
  api.set([mcq("a1"), mcq("a2"), open("b1", 3), open("b2", 0)]);
  const m = api.cpbMarks();
  eq("Booklet A is 2 marks a question", m.a, 4);
  // b1 prints 3; b2 prints nothing, so it counts as the default rather than as
  // nothing — a cover that silently understates the paper is worse than one
  // that says how many it had to assume.
  eq("Booklet B sums what is printed, and counts an unmarked question as 2", m.b, 5);
  eq("the total is the two together", m.total, 9);
  eq("…and the page is told how many were assumed", m.guessed, 1);
  eq("a mark allocation nobody printed is 0, so cpbMarks can tell it apart from a real one",
     api.cpbQuestionMarks({ marks: 0 }), 0);
  eq("…and an absurd one is not believed", api.cpbQuestionMarks({ marks: 4000 }), 0);
  eq("an MCQ with no printed marks is worth an MCQ's marks", api.cpbDefaultMarks(mcq("x")), 2);
  eq("…and an open one an open question's", api.cpbDefaultMarks(open("y", 0)), 2);
}
{
  // 📝 A worksheet counts what each question prints, defaulting the ones that
  // print none, and measures nothing against a booklet target it does not have.
  api.setMeta({ mode: "worksheet" });
  api.set([mcq("m1"), open("o1", 5), open("o2", 0)]);
  const wm = api.cpbMarks();
  ok("a worksheet reports itself as one", wm.worksheet === true);
  eq("…counts what each question prints, defaulting the ones that print none", wm.total, 2 + 5 + 2);
  eq("…and says how many it had to assume", wm.guessed, 2);
  eq("…and counts the questions", wm.n, 3);
  ok("…and measures nothing against a booklet target that does not exist",
     wm.needMcq === null && wm.needOpen === null,
     "a chip about Booklet A on a worksheet is a chip about a thing the sheet does not have");
  api.setMeta({});
}

/* ---------- ⑥ the shape it is built to ---------- */
{
  api.setMeta({});
  api.set([]);
  const empty = api.cpbMarks();
  eq("an empty paper knows what it is aiming at", empty.wantTotal, api.CPB_TARGET_MCQ * 2 + api.CPB_TARGET_OPEN_MARKS);
  eq("…and how far off it is", empty.needMcq, api.CPB_TARGET_MCQ);
  eq("…on both counts", empty.needOpen, api.CPB_TARGET_OPEN_MARKS);

  api.set([mcq("m1"), mcq("m2"), mcq("m3")]);
  const short = api.cpbMarks();
  eq("three of the target is the rest to go", short.needMcq, api.CPB_TARGET_MCQ - 3);
  ok("…and it is SAID, not just coloured",
     api.cpbGapLabel(6, "question") === "6 questions to go");
  // Booklet A is measured in QUESTIONS and Booklet B in MARKS, and the two
  // chips sit side by side — a bare "26 to go" on each is two different
  // quantities wearing the same words.
  ok("…and it names its unit", api.cpbGapLabel(6, "mark") === "6 marks to go");
  ok("…which is singular when it is one", api.cpbGapLabel(1, "question") === "1 question to go");
  ok("…and marked as under", api.cpbGapClass(6) === " under");
  ok("over the target is its own state, never the same colour as under",
     api.cpbGapLabel(-3, "question") === "3 questions over"
     && api.cpbGapClass(-3) === " over" && api.cpbGapClass(-1) !== api.cpbGapClass(1));
  ok("on target is its own state again",
     api.cpbGapLabel(0, "mark") === "✓" && api.cpbGapClass(0) === " on-target");

  // A TARGET OF 0 IS NO TARGET. A short topical sheet is a real thing to
  // build, and a page nagging that it is 22 questions short is a page whose
  // warnings stop being read.
  api.setMeta({ targetMcq: 0, targetOpen: 0 });
  api.set([mcq("a1"), open("b1", 3)]);
  const none = api.cpbMarks();
  ok("a target of 0 measures nothing", none.needMcq === null && none.needOpen === null);
  eq("…and the totals are still counted", none.total, 2 + 3);
  eq("…and no total is claimed", none.wantTotal, 0);
  ok("nothing is said about a gap that does not exist", api.cpbGapLabel(null) === "");

  eq("a WORKSHEET has NO length target by default — it has no standard length",
     api.CPB_TARGET_QUESTIONS, 0);
  api.setMeta({ mode: "worksheet", targetQuestions: 12 });
  api.set([mcq("m1"), mcq("m2")]);
  const wt = api.cpbMarks();
  eq("a target the teacher set is honoured", wt.wantQuestions, 12);
  eq("…and the gap measured against it", wt.needQuestions, 10);

  // Junk in the field must never make the page unusable.
  eq("a blank target falls back to the shape above", api.cpbTargetNum("", 30), 30);
  eq("…and so does a word", api.cpbTargetNum("thirty", 30), 30);
  eq("…and a negative number", api.cpbTargetNum(-5, 30), 30);
  eq("a real 0 is kept, because 0 means no target", api.cpbTargetNum(0, 30), 0);
  eq("…and an absurd one is capped rather than believed", api.cpbTargetNum(99999, 30), 999);
  api.setMeta({});
}

/* ---------- ⑦ nothing is thrown away by switching mode ---------- */
{
  api.set([mcq("q1")]);
  api.cpbSetBook("q1", "b");
  api.setMeta({ mode: "worksheet" });
  ok("a ⇄ booklet override survives a trip through worksheet mode", api.get()[0]._cpbBook === "b");
  api.setMeta({});
  ok("…and is back in force the moment the paper is", api.cpbBookOf(api.get()[0]) === "b",
     "switching mode must cost nothing, or it is a switch nobody dares press");
  api.set([]);
}

/* ------------------------------------------------------------------ *
 * 🔒 HELD BACK — folded into the ONE predicate, not bolted beside it.  *
 * ------------------------------------------------------------------ */
{
  const rel = cut("// ---- ⏳ Scheduled release — a question that is IN the bank and not yet due --",
                  "const QUESTION_KEY_FIELDS", "release block");
  const r = new Function(`
    const escapeHtml = s => String(s == null ? "" : s).replace(/[&<>"']/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    ${rel}
    return { qHeldBack, qReleased, qScheduled, qReleaseChipHtml };
  `)();
  ok("a held-back question is NOT released", r.qReleased({ holdBack: true }, "2026-01-01") === false);
  ok("an ordinary question is", r.qReleased({ title: "x" }, "2026-01-01") === true);
  ok("nothing at all is", r.qReleased(null, "2026-01-01") === true);
  ok("held back AND scheduled is still held back",
     r.qReleased({ holdBack: true, releaseOn: "2020-01-01" }, "2026-01-01") === false);
  // STRICT, and deliberately not the fail-open rule `qReleaseOn` follows: the
  // field has exactly two writers and neither can produce a truthy non-true
  // value, so there is no third state to be lenient about.
  ok("only true holds it back — a stray string does not", r.qReleased({ holdBack: "yes" }, "2026-01-01") === true);
  ok("…nor a 1", r.qReleased({ holdBack: 1 }, "2026-01-01") === true);
  ok("…nor false", r.qReleased({ holdBack: false }, "2026-01-01") === true);
  ok("qHeldBack answers for nothing at all", r.qHeldBack(null) === false);
  const chip = r.qReleaseChipHtml({ holdBack: true });
  ok("a held-back question wears a badge on every management surface",
     /🔒/.test(chip) && /Not released/.test(chip),
     "one that looked ordinary is a paper somebody prints for Monday and cannot understand why no student sees it");
  ok("…and the badge beats the date, because it is the one that is true",
     /🔒/.test(r.qReleaseChipHtml({ holdBack: true, releaseOn: "2030-01-01" })));

  const gate = cut("function qReleased(q, today)", "function qReleaseLabel", "qReleased body");
  ok("the hold-back is folded INTO qReleased rather than bolted beside it",
     /qHeldBack\(q\)/.test(gate) && /qScheduled\(q, today\)/.test(gate),
     "a gate of its own is one the next reader somebody writes forgets to ask");

  const load = cut("async function loadBank(uid) {", "\nfunction isPermissionError", "loadBank");
  ok("the ONE gate covers the hold-back too, because it asks qReleased",
     /if \(!canManageQuestions\(\) && !qReleased\(q\)\) \{/.test(load));
  ok("…and a question with no DATE is still stubbed, so a worksheet draws a locked row",
     /qReleaseOn\(q\) \|\| HOLD_LOCK_KEY/.test(load),
     "without the sentinel the stub is empty and the sheet says the question was deleted");
  const lockOn = cut("function qLockedOn(id) {", "function wsLockedIds", "qLockedOn");
  ok("the sentinel is a lock", /on === HOLD_LOCK_KEY/.test(lockOn));
  const soon = cut("function wsLockSoonest(ids) {", "function wsLockNote", "wsLockSoonest");
  ok("…but it is never NAMED as a date, because there is no date to name",
     /RELEASE_DAY_RE\.test\(on\)/.test(soon),
     '"the first unlocks  ()" is worse than saying no day at all');
}

/* ------------------------------------------------------------------ *
 * THE SHEET AS IT REALLY COMES OUT.                                   *
 *                                                                     *
 * `wsBuildDocumentHtml` is run for real with its helpers stubbed, and  *
 * the HTML it produces is read back. The last case matters most: with  *
 * NO `paper` option at all, an ordinary worksheet must come out        *
 * byte-for-byte as it always did.                                     *
 * ------------------------------------------------------------------ */
const build = cut("async function wsBuildDocumentHtml(questions, title, opts) {",
                  "\n// ---- Editing the header ON the preview", "wsBuildDocumentHtml");
const chunkFn = cut("function wsQuestionChunkHtml(q, n, qrSvg, reserveMm, noBracket, objBoxAll) {",
                    "\nfunction wsAnswerKeyHtml(", "wsQuestionChunkHtml");
const keyFn = cut("function wsAnswerKeyHtml(questions, numbers) {", "\nfunction wsPrintCss(", "wsAnswerKeyHtml");
const doc = new Function(`
  const escapeHtml = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wsHasMcq = q => Array.isArray(q && q.options) && q.options.length >= 2;
  const questionIsAnnotation = q => (q && q.blocks || []).some(b => b && b.annotate);
  const mcqLabel = i => (i + 1) + ")";
  const annotBlocksOf = () => [];
  const WS_IMG_MM = 92;
  const wsEffectiveImgMm = () => 92;
  const wsWorkingSpaceMm = () => 40;
  const wsAnswerBlankHtml = () => '<blank>';
  const renderQuestionBlocksHtml = bs => (bs || []).map(b => '<b>' + escapeHtml(b.content || '') + '</b>').join('');
  const wsCoverHtml = t => '<cover>' + escapeHtml(t) + '</cover>';
  const wsHeaderHtml = t => '<header>' + escapeHtml(t) + '</header>';
  const wsFooterHtml = () => '<foot>';
  const wsScoreTableHtml = () => '<score>';
  const wsHeadEstimateMm = () => 26;
  const wsHeaderEditScript = () => '';
  const wsPrintCss = () => '';
  const buildQrMap = async () => ({});
  const makeQrSvg = async () => '<qr>';
  const WS_EDIT_HINT = '';
  const WS_HEADER_ORG = 'Polymath Learning Centre';
  // 🎯 The learning-objectives box. Off unless the print asked for it, which no
  // Custom Paper print does — a mock exam paper is not where a pupil reflects.
  const objBoxAutoHtml = (q, on) => on ? '<div class="obx-box"></div>' : '';
  ${chunkFn}
  ${keyFn}
  ${build}
  return wsBuildDocumentHtml;
`)();

const rMcq = (id, t) => ({ id, title: t, level: "P5", options: ["one", "two", "three", "four"], correctOption: 1, blocks: [{ type: "text", content: t }] });
const rOpen = (id, t) => ({ id, title: t, level: "P5", expected: "42", blocks: [{ type: "text", content: t }] });
const A = [rMcq("a1", "Fractions"), rMcq("a2", "Ratio")];
const B = [rOpen("b1", "Speed problem"), rOpen("b2", "Area problem")];
const NUM = { a1: "1", a2: "2", b1: "3", b2: "4" };

const paperHtml = await doc(A.concat(B), "Mock Paper", {
  cover: false, fields: false, withQr: false, withAnswers: true,
  paper: {
    groups: [
      { cover: "<section>COVER A</section>", lead: "<div>LEAD A</div>", questions: A },
      { cover: "<section>COVER B</section>", lead: "<div>LEAD B</div>", questions: B },
    ],
    numbers: NUM,
    noBracketIds: new Set(["a1", "a2"]),
    tail: "<section>ANSWER SHEET</section>",
  },
});
ok("Booklet A's cover leads the document", paperHtml.indexOf("COVER A") < paperHtml.indexOf("LEAD A"));
ok("Booklet B's cover is emitted between the two booklets, not at the front",
   paperHtml.indexOf("COVER B") > paperHtml.indexOf("Ratio")
   && paperHtml.indexOf("COVER B") < paperHtml.indexOf("LEAD B"),
   "hoisted to the front it prints on top of Booklet A's");
ok("each cover starts a printed page of its own",
   (paperHtml.match(/class="ws-newpage"/g) || []).length >= 4,
   "the sections are the page breaks — a cover sharing a sheet with a question is not a cover");
ok("every question carries its PAPER number, not its position",
   ["1", "2", "3", "4"].every(n => paperHtml.includes('<div class="ws-q-no">' + n + ".</div>")));
ok("Booklet A prints NO answer box — its answer goes on the answer sheet",
   !/ws-mcq-answer/.test(paperHtml),
   "a box nobody writes in is a mark a child looks for and cannot find");
ok("…but its options are still there", (paperHtml.match(/ws-mcq-opt/g) || []).length === 8);
ok("Booklet B prints its working space", (paperHtml.match(/ws-answer-box/g) || []).length === 2);
ok("the answer sheet is the last thing before the key",
   paperHtml.indexOf("ANSWER SHEET") > paperHtml.indexOf("Area problem")
   && paperHtml.indexOf("ANSWER SHEET") < paperHtml.indexOf("ws-ak"));
ok("the key numbers its rows by the PAPER number, not by position",
   ["1. Fractions", "2. Ratio", "3. Speed problem", "4. Area problem"]
     .every(t => paperHtml.includes('<div class="ws-ak-q">' + t + "</div>")),
   "numbered by position, every answer on the key is against the wrong question");

// …with the bracket switched ON, which is the other half of the promise.
const onPaper = await doc(A, "Mock", {
  withAnswers: false,
  paper: { groups: [{ cover: "<section>C</section>", lead: "", questions: A }], numbers: NUM, noBracketIds: null, tail: "" },
});
ok("with the answer box switched on it comes back", (onPaper.match(/ws-mcq-answer/g) || []).length === 2);

// …and with NO paper option at all, nothing about an ordinary worksheet moved.
const plain = await doc(A.concat(B), "Sheet", { cover: false, fields: true, withAnswers: true });
ok("an ordinary worksheet is unchanged: numbered 1..n by position",
   ["1", "2", "3", "4"].every(n => plain.includes('<div class="ws-q-no">' + n + ".</div>"))
   && plain.includes("<header>"));
ok("…and its MCQs keep their answer box", (plain.match(/ws-mcq-answer/g) || []).length === 2);
ok("…and its key numbers by position", plain.includes('<div class="ws-ak-q">1. Fractions</div>'));
// 📝 The worksheet mode's own instruction line rides in the SAME page section
// as the header, so it shares a sheet with question 1.
const withIntro = await doc(A, "Sheet", { fields: true, intro: "<div>DO ALL QUESTIONS</div>" });
ok("a worksheet's instruction line prints above question 1, on the same sheet",
   withIntro.indexOf("DO ALL QUESTIONS") > withIntro.indexOf("<header>")
   && withIntro.indexOf("DO ALL QUESTIONS") < withIntro.indexOf("ws-q-no"));

/* ------------------------------------------------------------------ *
 * Wiring that cannot be exercised without a DOM, read off the source. *
 * ------------------------------------------------------------------ */
{
  const wsOpts = cut("function cpbWorksheetOpts() {", "// THE ONE DOOR", "worksheet options");
  ok("a worksheet passes NO `paper` option at all — it IS the ordinary render",
     !/\bpaper:/.test(wsOpts),
     "passing one gives a worksheet an exam paper's numbering and takes the answer box off its MCQs");
  ok("…and no cover", /cover: false/.test(wsOpts));
  ok("…and it prints the Name / Class / Date strip unless the teacher turned it off",
     /fields: !!cpbMetaGet\("wsFields"\)/.test(wsOpts));

  ok("the printer and the preview go through ONE door, so they cannot disagree",
     /function cpbOutputOpts\(\) \{ return cpbIsWorksheet\(\) \? cpbWorksheetOpts\(\) : cpbPaperOpts\(\); \}/.test(src)
     && /const o = cpbOutputOpts\(\);/.test(cut("async function cpbOpenSheet(", "\nfunction cpbPreview", "opener")),
     "a preview of a different sheet is the one thing a preview must never be");
  ok("the sheet goes through the ONE worksheet builder",
     /wsOpenDocument\(o\.list, cpbTitle\(\)/.test(src),
     "a second renderer is one the sheet a class sits drifts away from");
  ok("the print order is taken from the ONE layout function, never worked out again",
     /function cpbPrintOrder\(\) \{ return cpbLayout\(\)\.list; \}/.test(src));

  const title = cut("function cpbTitle() {", "\nasync function cpbOpenSheet", "title");
  ok("an unnamed worksheet is named for what it is, not for an examination that is not happening",
     /cpbIsWorksheet\(\)\) return \[cpbMetaGet\("subject"\), "Worksheet"\]/.test(title));

  const send = cut("function cpbSend() {", "\nasync function cpbCommit", "send");
  // The mode decides only how the COUNT is worded (`what`); the promise
  // itself is one unconditional sentence in the confirm.
  ok("the HOLD-BACK is promised in the same words in BOTH modes",
     /\$\{what\} into the question bank HELD BACK FROM STUDENTS/.test(send),
     "a worksheet whose questions reached students early is the one failure this page must never have");
  const commit = cut("async function cpbCommit() {", "\n// ---- Rendering", "commit");
  ok("every question sent from the page is held back", /clean\.holdBack = true/.test(commit));
  ok("…in BOTH modes — there is no branch here at all", !/cpbIsWorksheet/.test(commit),
     "one branch here is a mode whose questions quietly reach students");
  ok("…and it is AWAITED, so the count reported is the count that went",
     /await saveQuestionDoc\(clean\)/.test(commit));
  ok("…and only joins the in-memory bank once the write landed", /if \(ok\) \{/.test(commit));
  ok("…and a re-send REPLACES rather than pushing a second copy",
     /questionBank\[at\] = clean; else questionBank\.push\(clean\)/.test(commit));
  ok("a part-failed send keeps the sheet on the page", /if \(done && !failed\)/.test(commit));
  ok("…and Send cannot be pressed twice while it runs", /if \(cpbBusy\) return;/.test(commit));
  ok("page-local bookkeeping never reaches the bank", /delete clean\._cpbBook/.test(commit));

  const mv = cut("function cpbMove(id, dir) {", "\nfunction cpbDropQuestion", "move");
  ok("on a worksheet up means up — there is no booklet to stay inside",
     /if \(!cpbIsWorksheet\(\)\) \{/.test(mv));

  const row = cut("function cpbRowHtml(q, num, book, first, last) {", "\nfunction cpbBookletHtml(", "row");
  ok("a worksheet row has no ⇄ button", /\$\{ws \? "" : `<button[^`]*cpbSetBook/.test(row),
     "a button that moves a question into a booklet nothing prints appears to do nothing");
  ok("…and it still carries the editor", /cpbEditQuestion/.test(row));

  const setMode = cut("function cpbSetMode(mode) {", "\n// =====", "cpbSetMode");
  ok("an unknown mode is refused rather than stored", /if \(!CPB_MODES\[mode\] \|\| mode === cpbMode\(\)\) return;/.test(setMode));
  ok("…and the switch says outright that it costs nothing", /nothing is lost/.test(setMode));
  ok("switching mode re-renders the page",
     /k === "mode"/.test(cut("function cpbSetMeta(k, v) {", "\n// 🅰 SWITCHING", "setMeta")),
     "without it the page still says Booklet A after the teacher has chosen a worksheet");

  /* ---------- ✏️ the editor round-trip ---------- */
  const edit = cut("function cpbEditQuestion(id) {", "\nfunction cpbEditSave", "cpbEditQuestion");
  ok("the paper edit opens the SHARED editor rather than one of its own",
     /loadQuestionIntoEditor\(q\)/.test(edit));
  ok("…and comes back to this page", /qEditReturn = \{ page: "custompaper" \}/.test(edit));
  ok("…on the same question", /cpbEditFocus = q\.id/.test(edit));
  ok("…set AFTER the load, which clears both",
     edit.indexOf("loadQuestionIntoEditor(q)") < edit.indexOf("qEditReturn ="),
     "set before, the load wipes them and the trip lands on the bank");
  const save = cut("function cpbEditSave() {", "\n// Put the row back", "cpbEditSave");
  ok("the save writes into the SHEET and nowhere else",
     /cpbQuestions\[at\] = q;/.test(save) && !/saveQuestionDoc\(/.test(save),
     "a bank write here leaves the sheet and the bank each holding half the question");
  ok("a question that has since left the sheet is SAID, not silently appended",
     /no longer on the/.test(save));
  ok("the bank's own Save routes a paper question back to the paper",
     /if \(cpbEditActive\(\)\) \{ cpbEditSave\(\); return; \}/.test(src),
     "a hidden button is not a lock — this is the door every save comes through");
  ok("every route INTO the editor clears the paper question",
     (src.match(/cpbEdit = null;/g) || []).length >= 3,
     "a bank edit that inherited it would be written into a paper instead of into the bank");
  const carry = cut("function cpbCarryOver(q, prev) {", "\nfunction cpbEditQuestion", "carry over");
  ok("the carry-over reads the editor-owned list rather than guessing",
     /CPB_EDITOR_FIELDS\.has\(k\)/.test(carry));
  ok("…so the teacher's own ⇄ booklet override survives an edit", !/_cpbBook/.test(carry));
  const owned = cut("const CPB_EDITOR_FIELDS = new Set([", "]);", "editor fields");
  ok("`options` and `correctOption` are editor-owned, so removing an MCQ sticks",
     /"options", "correctOption"/.test(owned),
     "carried back, the choices the teacher just deleted are put straight on again");
  ok("`holdBack` is NOT editor-owned, so it survives an ordinary edit", !/holdBack/.test(owned));

  /* ---------- 📸 reading only what has not been read ---------- */
  const unread = cut("function cpbUnread() {", "\nfunction cpbRunPrompt", "unread helpers");
  const inc = new Function(`
    let cpbShots = [], cpbQuestions = [], cpbLastRead = "";
    ${unread}
    return { cpbUnread, cpbUnreadIsTail, cpbSeedQuestion,
             set: (s, q, l) => { cpbShots = s; cpbQuestions = q || []; cpbLastRead = l || ""; } };
  `)();
  const shot = (id, status) => ({ id, status: status || "new" });
  const done = id => shot(id, "done");
  inc.set([done("s1"), done("s2"), shot("s3"), shot("s4")], [], "");
  eq("the unread set is the ones never read", inc.cpbUnread().map(s => s.id).join(","), "s3,s4");
  inc.set([done("s1"), shot("s2", "empty")], [], "");
  eq("a screenshot that held nothing is READ, not unread", inc.cpbUnread().length, 0);
  inc.set([done("s1"), shot("s2", "error")], [], "");
  eq("…but one that FAILED is unread, so the same button retries it",
     inc.cpbUnread().map(s => s.id).join(","), "s2");
  const q1 = { id: "q1" }, q2 = { id: "q2" };
  inc.set([done("s1"), done("s2"), shot("s3")], [q1, q2], "q2");
  ok("the unread screenshots at the END of the pile are a tail", inc.cpbUnreadIsTail());
  ok("…so the run carries on from the question the last read finished on", inc.cpbSeedQuestion() === q2);
  inc.set([done("s1"), shot("s2"), done("s3")], [q1, q2], "q2");
  ok("an unread screenshot in the MIDDLE is not a tail", !inc.cpbUnreadIsTail());
  ok("…so nothing is joined — those pages are not adjacent to the last question read",
     inc.cpbSeedQuestion() === null,
     "joined anyway, a retried failure from the middle is grafted onto a question from the end");
  inc.set([shot("s1"), shot("s2")], [], "");
  ok("a pile where NOTHING has been read is not a tail either",
     !inc.cpbUnreadIsTail() && inc.cpbSeedQuestion() === null);
  inc.set([done("s1"), shot("s2")], [q1, q2], "gone");
  ok("a join point whose question has since been removed seeds nothing",
     inc.cpbSeedQuestion() === null,
     "a stale id must fall back to filing the entry as its own question, never throw");

  const run = cut("async function cpbRunBuild(mode) {", "\nfunction cpbCancelRun", "the run");
  ok("an APPEND reads only the unread screenshots", /const shots = append \? cpbUnread\(\) : cpbShots;/.test(run));
  ok("…and keeps every question already on the sheet", /if \(!append\) \{\n    cpbQuestions = \[\];/.test(run),
     "clearing them is the teacher's order and booklet moves thrown away by the ordinary button");
  ok("the seed is taken BEFORE the run resets any status",
     run.indexOf("cpbSeedQuestion()") < run.indexOf("cpbBusy = true"),
     "read after, `cpbUnreadIsTail` is asked about a pile that has just been wiped");
  ok("the level and the name are read ONCE, before the run",
     run.indexOf('const level = cpbMetaGet("qLevel")') < run.indexOf("cpbReadRun("),
     "read inside the job, a forty-screenshot sheet is filed at whatever the picker was moved to");
  ok("the JOIN is a fact the run reports, not arithmetic",
     /if \(seed && q === seed\) joined = true;/.test(run),
     "an extended question is never added, so counting the totals can never see it");
  const buildFn = cut("function cpbBuild() {", "\n// THE WHOLE PILE", "cpbBuild");
  ok("the ordinary press appends", /cpbRunBuild\("append"\)/.test(buildFn));
  ok("…asks nothing, because it destroys nothing", !/confirm\(/.test(buildFn));
  const rebuildFn = cut("function cpbRebuild() {", "\n// mode 'append' reads", "cpbRebuild");
  ok("🔁 Read everything again is a SEPARATE button that asks first",
     /cpbRunBuild\("all"\)/.test(rebuildFn) && /confirm\(/.test(rebuildFn));
  ok("…and points at the other button, so nobody presses this one to add three questions",
     /🤖 Read instead/.test(rebuildFn));
  const addFn = cut("async function cpbAddFiles(files) {", "\nfunction cpbPick()", "cpbAddFiles");
  ok("adding a screenshot no longer nags for a full re-read", !/cpbDirty = true/.test(addFn));
  const rmFn = cut("function cpbRemove(id) {", "\nfunction cpbClearShots", "cpbRemove");
  ok("removing a READ screenshot raises the warning",
     /gone\.status !== "new" && cpbQuestions\.length/.test(rmFn) && /cpbDirty = true/.test(rmFn));

  /* ---------- the reader ---------- */
  const reader = cut("async function cpbReadRun(shots, opt) {", "\n// The marks the paper printed", "reader");
  ok("a batch that fails does not sink the rest of the sheet", /failed \+= batch\.length;\n      continue;/.test(reader));
  ok("`last` starts as the caller's SEED, so an appended run can continue a question",
     /let last = o\.seed \|\| null/.test(reader));
  ok("a continuation is only ever the FIRST entry of a batch",
     /r === 0 && row\.continuation === true && last/.test(reader),
     "any other entry claiming to continue something is a reply that ignored the question");
  ok("…and it is EXTENDED, never pushed as a second question",
     reader.indexOf("cpbExtend(last") < reader.indexOf("cpbQuestions.push") || !/cpbQuestions\.push/.test(reader));
  ok("the run can be stopped between questions", /o\.stopped\(\)/.test(reader));
  ok("a rectangle is measured on the image the model NAMED, never on the first",
     /let pi = parseInt\(row\.page, 10\);/.test(reader),
     "measured on the wrong screenshot, the crop is of another question entirely");
  ok("…and an out-of-range page falls back rather than throwing",
     /if \(!isFinite\(pi\) \|\| pi < 1 \|\| pi > batch\.length\) pi = 1;/.test(reader));
  ok("the whole page is prepared ONCE per screenshot and shared",
     /pages\[idx\] \|\| \(pages\[idx\] =/.test(reader),
     "five clean-ups of one sheet is five image-model calls for one picture");
  ok("ONE enhancement budget for the whole run",
     /const budget = \{ left: Math\.max\(0, Number\(o\.enhance\) \|\| 0\) \};/.test(reader),
     "a per-question cap is no cap at all on a forty-question sheet");

  /* ---------- the shared prompt, not a forked one ---------- */
  ok("the reader uses the ONE prompt ⚡ Rapid add and ✨ Build with AI share",
     /aiQuestionReadPrompt\(false, true, true, \{ images: n, seeded: !!cpbRunSeed \}\)/.test(src),
     "a second copy of that wording is a second copy to fix");
  const prompt = cut("function aiQuestionReadPrompt(isPdf, withBox = false, many = false, run = null) {",
                     "\n// A page can hold SEVERAL questions", "prompt");
  ok("the run mode asks which KIND each question is — it decides the booklet",
     /"questionType"/.test(prompt) && /offers options AND asks for written working is "open"/.test(prompt));
  ok("…and for the marks the page prints, never an invented one",
     /"marks"/.test(prompt) && /never invent one/.test(prompt));
  ok("…and it reads the images as ONE CONTINUOUS RUN", /ONE CONTINUOUS RUN/.test(prompt));
  ok("…and asks which image a figure is on", /"page": the 1-based index/.test(prompt));
  ok("a page holding only the TAIL of a question is not an empty page",
     /holding only the TAIL/.test(prompt),
     "the blank-page rule and the continuation rule read straight at each other");
  ok("with no run at all the prompt is what it always was",
     /\(run\n?\s*\?/.test(prompt) || /\(run$/m.test(prompt) || prompt.includes("(run\n"),
     "every run clause is inside a `run ?` guard, so ⚡ Rapid add's prompt did not move");

  /* ---------- the shelf ---------- */
  const lib = cut("const CPB_LIB_MAX = 60;", "\nfunction cpbSetMeta(", "library");
  ok("a saved sheet lives in the collection the app already has rules for",
     /"mathVetting"/.test(lib) && /cpbPaper: true/.test(lib),
     "a new subcollection would cost a whole-project rules deploy for one feature");
  ok("…and is told apart from a vetting draft by its own flag",
     /else if \(data\.cpbPaper\) papers\.push\(data\);/.test(src),
     "left in vettingList it is a card nobody can approve and a 📋 badge that never clears");
  ok("the SCREENSHOTS are not saved — a document dies at 1 MB and they are megabytes",
     /questions: cpbQuestions,/.test(lib) && !/shots: cpbShots/.test(lib));
  ok("…and one too big is refused BEFORE the write, naming the size",
     /bytes > CPB_LIB_MAX_BYTES/.test(lib) && /Math\.round\(bytes \/ 1024\)/.test(lib));
  ok("one with no name is refused — the name is what it is listed under",
     /Give it a name in ①/.test(lib));
  ok("opening REPLACES the page, so it asks first", /It replaces what is on this page/.test(lib));
  ok("…and says outright when what is on the page has never been saved",
     /has NEVER been saved/.test(lib));
  ok("an opened sheet is NOT dirty — there are no screenshots for it to be out of step with",
     /cpbDirty = false;/.test(lib));
  ok("deleting the sheet does not touch the questions already in the bank",
     /STAYS there/.test(lib));
  ok("✚ New lets GO of the saved one rather than deleting it",
     /cpbLibId = "";/.test(cut("function cpbNewPaper() {", "\nfunction cpbSetMeta(", "cpbNewPaper")));
  ok("a SAVED sheet is not cleared by a send — the shelf was for coming back to it",
     /if \(cpbLibId\) cpbLibMarkSent\(\)/.test(commit));

  /* ---------- 🔒 releasing it again ---------- */
  const held = cut("function bankHeldSectionHtml() {", "\n// ONE writer, for one question", "held section");
  ok("a held-back paper is listed where it can be released", /data-bsq-paper=/.test(held)
     && /bankUnholdPaper/.test(src));
  ok("…grouped by the paper it belongs to", /bankHeldGroupKey/.test(held),
     "forty separate Release buttons is a list nobody works through");
  const setHold = cut("async function bankSetHold(id, held) {", "\nasync function bankUnholdNow", "hold writer");
  ok("a write that failed changes nothing on screen",
     /if \(prev === undefined\) delete q\.holdBack; else q\.holdBack = prev;/.test(setHold),
     "a page that has released a question the database still holds back looks right until the next sign-in");
  ok("…and only an admin may write it", /if \(!canManageQuestions\(\)\) return false;/.test(setHold));

  /* ---------- the page is shut ---------- */
  ok("the page is shut to anyone but an admin, whatever route they arrive by",
     /"answerkeys", "custompaper"\]\.includes\(page\) && !canManageQuestions\(\)/.test(src),
     "hiding a nav item is never on its own what keeps a page shut");
  ok("…and its nav item is admin-only",
     /class="nav-item admin-only" data-page="custompaper"/.test(src));
  ok("…and the renderer refuses too",
     /if \(!canManageQuestions\(\)\) \{\n    el\.innerHTML = `<div class="cpb-card"><p class="cpb-empty">Only admin/.test(src));
}

/* ---------- the markup, the CSS and the handlers ---------- */
{
  ok("the page exists", /id="page-custompaper"/.test(src));
  ok("the pad has somewhere to render into", /id="cpbBody"/.test(src));
  ok("…and a status line", /id="cpbStatus"/.test(src));
  ok("the covers have their print styles", /\.cpb-cv-head \{/.test(src) && /\.cpb-cv-ins \{/.test(src));
  ok("the answer sheet has its grid", /\.cpb-as-grid \{/.test(src));
  ok("the mode chooser has its own styles", /\.cpb-modes \{/.test(src) && /\.cpb-mode\.on \{/.test(src));
  ok("the switches draw a real checkbox despite the reset",
     /\.cpb-switch input\[type="checkbox"\] \{[^}]*appearance: auto/.test(src));

  // Every function the page's own markup names has to be on window: the module
  // has its own scope, so anything missing is a dead button.
  const rendered = src.slice(src.indexOf("function cpbRender()"), src.indexOf("function cpbInit()"));
  const page = src.slice(src.indexOf('id="page-custompaper"'), src.indexOf("</div>", src.indexOf('id="cpbBody"')));
  const handlers = new Set();
  (page + rendered).replace(/on(?:click|change|input|dragover|drop)="([a-zA-Z_$][\w$]*)\(/g,
    (m, n) => { handlers.add(n); return m; });
  const missing = [...handlers].filter(n => !new RegExp("window\\." + n + "\\s*=").test(src));
  ok("every function an inline handler names is on window", missing.length === 0,
     "these are dead buttons: " + missing.join(", "));
  ok("…and the census can still see them", handlers.size >= 12, "found only " + handlers.size);
}

console.log((fails ? "✗ " : "✓ ") + (ran - fails) + "/" + ran + " custom-paper checks passed");
if (fails) process.exit(1);
