// Regression tests for 🔢 NUMBER FROM — a worksheet whose first question is
// not Question 1 (v1.118.0).
// Run with:
//     node tools/worksheet-start-number-tests.mjs            all cases
//     node tools/worksheet-start-number-tests.mjs <name>     cases whose name contains <name>
//
// The point of the feature is a PORTION of work that slots into the middle of
// another worksheet: the sheet that ends at Q20 is continued by one that starts
// at Q21. Every way it breaks is silent — the sheet prints, it just prints the
// wrong numbers somewhere:
//
//  • THE ANSWER KEY MUST USE THE PRINTED NUMBERS. A key that still says "3."
//    under a sheet that says "23." is a teacher marking the wrong question.
//  • THE 🧩 BOOKLET'S ✗ / ✓ LINES NAME QUESTION NUMBERS. "Go on to Question 2"
//    on a sheet numbered from 21 sends a pupil to a question that is not there.
//  • THE OVERVIEW PAGE IS WHERE A PUPIL LOOKS UP "Q23". Its chips, its jump
//    links and its video reel must carry the printed number.
//  • A PAPER'S OWN NUMBERS STILL WIN. 🗂️ Custom Paper and 🎓 PSLE exports hand
//    over `paper.numbers`, numbered by booklet; a start number must not move them.
//  • JUNK FAILS TO 1. A sheet saved before the field existed, a cleared box, a
//    negative number or text is the ordinary sheet — never a sheet numbered
//    from NaN.
import fs from 'node:fs';
import { app, src, cut } from './worksheet-cover-harness.mjs';

const only = process.argv[2] || '';
const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const eq = (a, b, msg) => {
  if (a !== b) throw new Error(`${msg || 'not equal'}\n      expected: ${JSON.stringify(b)}\n      actual:   ${JSON.stringify(a)}`);
};
const ok = (v, msg) => { if (!v) throw new Error(msg || 'expected truthy'); };
const has = (hay, needle, msg) => ok(String(hay).includes(needle), (msg || 'missing') + `: ${JSON.stringify(needle)}`);
const lacks = (hay, needle, msg) => ok(!String(hay).includes(needle), (msg || 'unexpected') + `: ${JSON.stringify(needle)}`);

// ---- The REAL code, cut out of index.html ----------------------------------
const numberingBlock = cut('// 🔢 NUMBER FROM — a worksheet whose first question is not Question 1',
  'function wsCurrentOptions() {', 'numbering block');
const answerKeyBlock = cut('function wsAnswerKeyHtml(questions, numbers, start) {', '\nfunction wsPrintCss() {', 'answer key');
const parseKeyBlock = cut('function qcParseKey(key) {', '\nfunction qcChartDocId', 'qcParseKey');
const bookletTextBlock = cut('function qcPlanFirstNo(plan) {', '\n// The heading line and the closing line of one page', 'booklet notes')
  + cut('function qcBranchPageText(plan, pg) {', '\n\n// ---- Firestore', 'page text');

const real = new Function(`
  const escapeHtml = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const wsHasMcq = q => Array.isArray(q.options) && q.options.length > 1;
  const mcqLabel = i => (i + 1) + ")";
  const annotBlocksOf = () => [];
  let box = { value: "1" };
  const $ = id => (id === "wsStartNumber" ? box : null);
  let wsOrder = [], wsSelectedIds = new Set();
  ${numberingBlock}
  ${answerKeyBlock}
  ${parseKeyBlock}
  ${bookletTextBlock}
  return {
    wsStartNumberClean, wsStartOf, wsNumberAt, wsNumberRangeText, wsBuilderStart, qcOffsetPlan,
    wsAnswerKeyHtml, qcPlanFirstNo, qcBranchNotes, qcBranchPageText, WS_START_MAX,
    setBox(v) { box.value = v; },
  };
`)();

// The real document builder, through the cover harness (its chunk stub prints
// "<n>." for each question, which is exactly the number under test).
const doc = app();
const Q = (id, extra = {}) => Object.assign({ id, title: 'Question ' + id, blocks: [{ type: 'text', text: 'x' }], expected: 'ans ' + id }, extra);
const qs = [Q('a'), Q('b'), Q('c')];
const numbersIn = html => [...String(html).matchAll(/<div class="ws-q-no">([^<]*)\.<\/div>/g)].map(m => m[1]);

// ---- 1. Cleaning ---------------------------------------------------------------
test('a missing, empty or junk start number is 1', () => {
  for (const v of [undefined, null, '', '   ', 'abc', 0, -5, '-3', NaN, Infinity, '0', {}, []]) {
    eq(real.wsStartNumberClean(v), 1, 'clean(' + JSON.stringify(v) + ')');
  }
});
test('a real start number is kept, floored and capped', () => {
  eq(real.wsStartNumberClean(21), 21);
  eq(real.wsStartNumberClean('21'), 21);
  eq(real.wsStartNumberClean(' 7 '), 7);
  eq(real.wsStartNumberClean(4.9), 4);
  eq(real.wsStartNumberClean('12abc'), 12, 'parseInt reads the leading number like the input does');
  eq(real.wsStartNumberClean(5000), real.WS_START_MAX);
  eq(real.WS_START_MAX, 999);
});
test('a saved sheet without the field starts at 1', () => {
  eq(real.wsStartOf({ id: 'x' }), 1);
  eq(real.wsStartOf(null), 1);
  eq(real.wsStartOf({ startNumber: 31 }), 31);
  eq(real.wsStartOf({ startNumber: 'nope' }), 1);
});
test('wsNumberAt counts on from the start', () => {
  eq(real.wsNumberAt(0, 1), '1');
  eq(real.wsNumberAt(0, 21), '21');
  eq(real.wsNumberAt(4, 21), '25');
  eq(real.wsNumberAt(2, undefined), '3', 'no start = the old i + 1');
});
test('the range text says what will print', () => {
  eq(real.wsNumberRangeText(10, 21), '21–30');
  eq(real.wsNumberRangeText(1, 21), '21');
  eq(real.wsNumberRangeText(0, 1), '1, 2, 3…');
  eq(real.wsNumberRangeText(0, 8), '8, 9, 10…');
  eq(real.wsNumberRangeText(3, undefined), '1–3');
});
test('the builder box is read through the same cleaner', () => {
  real.setBox('21'); eq(real.wsBuilderStart(), 21);
  real.setBox(''); eq(real.wsBuilderStart(), 1);
  real.setBox('-4'); eq(real.wsBuilderStart(), 1);
  real.setBox('1');
});

// ---- 2. The printed sheet -----------------------------------------------------
test('an ordinary sheet still prints 1, 2, 3', async () => {
  const html = await doc.wsBuildDocumentHtml(qs, 'Sheet', { fields: true });
  eq(numbersIn(html).join(','), '1,2,3');
});
test('a sheet numbered from 21 prints 21, 22, 23', async () => {
  const html = await doc.wsBuildDocumentHtml(qs, 'Sheet', { fields: true, startNumber: 21 });
  eq(numbersIn(html).join(','), '21,22,23');
});
test('a junk start number prints the ordinary sheet', async () => {
  const plain = await doc.wsBuildDocumentHtml(qs, 'Sheet', { fields: true });
  const junk = await doc.wsBuildDocumentHtml(qs, 'Sheet', { fields: true, startNumber: 'abc' });
  eq(junk, plain, 'byte-for-byte the sheet it always was');
});
test("a paper's own numbers still win over the start number", async () => {
  const paper = { groups: [{ questions: qs }], numbers: { a: '7', b: '8', c: '9' } };
  const html = await doc.wsBuildDocumentHtml(qs, 'Paper', { paper, startNumber: 50 });
  eq(numbersIn(html).join(','), '7,8,9');
});
test('the cover sheet stays with the document when numbered from 21', async () => {
  const html = await doc.wsBuildDocumentHtml(qs, 'Sheet', { cover: true, fields: true, startNumber: 21 });
  has(html, 'ws-cover-sheet', 'the Big M cover still prints');
  eq(numbersIn(html).join(','), '21,22,23');
});

// ---- 3. The answer key --------------------------------------------------------
const akNumbers = html => [...String(html).matchAll(/<div class="ws-ak-q">([^<.]*)\./g)].map(m => m[1]);
test('the answer key numbers from the same start', () => {
  eq(akNumbers(real.wsAnswerKeyHtml(qs, null, 21)).join(','), '21,22,23');
  eq(akNumbers(real.wsAnswerKeyHtml(qs, null)).join(','), '1,2,3', 'no start = as it always was');
  eq(akNumbers(real.wsAnswerKeyHtml(qs, { a: 'A1' }, 21)).join(','), 'A1,22,23', 'a mapped number still wins');
});
test('the document hands its start number to the answer key', () => {
  const build = cut('async function wsBuildDocumentHtml(questions, title, opts) {', '\n// ---- Editing the header ON the preview', 'build');
  has(build, 'wsAnswerKeyHtml(questions, numbers, startAt)', 'the key is told where the sheet starts');
  has(build, 'wsNumberAt(i, startAt)', 'the chunk numbers from the start');
});

// ---- 4. The 🧩 related-questions booklet ------------------------------------
const plan = () => ({
  pages: [
    { n: 1, kind: 'start', keys: ['q:a', 'q:b'], refs: [] },
    { n: 2, kind: 'steps', forKey: 'q:a', backTo: 1, keys: ['q:s1', 'q:s2'], refs: [] },
    { n: 3, kind: 'next', keys: ['q:n1', 'q:n2'], refs: [] },
  ],
  order: ['q:a', 'q:b', 'q:s1', 'q:s2', 'q:n1', 'q:n2'],
  numbers: { a: '1', b: '2', s1: '3', s2: '4', n1: '5', n2: '6' },
  pageOf: { 'q:a': 1, 'q:b': 1, 'q:s1': 2, 'q:s2': 2, 'q:n1': 3, 'q:n2': 3 },
  stepsPage: { 'q:a': 2 },
  nextPage: 3,
});
test('offsetting a plan moves every number and leaves the pages alone', () => {
  const p = real.qcOffsetPlan(plan(), 21);
  eq(JSON.stringify(p.numbers), JSON.stringify({ a: '21', b: '22', s1: '23', s2: '24', n1: '25', n2: '26' }));
  eq(p.startNumber, 21);
  eq(JSON.stringify(p.pageOf), JSON.stringify(plan().pageOf), 'pages are pages, not questions');
  const orig = plan();
  real.qcOffsetPlan(orig, 21);
  eq(orig.numbers.a, '1', 'the original plan is not mutated');
  eq(real.qcOffsetPlan(orig, 1), orig, 'starting at 1 hands back the same plan');
  eq(real.qcOffsetPlan(orig, 'junk'), orig, 'junk hands back the same plan');
});
test('the ✗ / ✓ lines name the printed numbers', () => {
  const p = real.qcOffsetPlan(plan(), 21);
  const a = real.qcBranchNotes(p, 'q:a');
  has(a.wrong, 'break Question 21 into smaller steps');
  has(a.right, 'Go on to Question 22 below');
  const s1 = real.qcBranchNotes(p, 'q:s1');
  has(s1.right, 'Go on to Question 24 below');
  const n1 = real.qcBranchNotes(p, 'q:n1');
  has(n1.wrong, 'Look back at Question 21 on Page 1', 'the "next" page points at the real first question');
  lacks(n1.wrong, 'Question 1 on', 'never the old hard-coded Question 1');
  has(n1.right, 'Go on to Question 26 below');
});
test('the page headings name the printed numbers', () => {
  const p = real.qcOffsetPlan(plan(), 21);
  const steps = real.qcBranchPageText(p, p.pages[1]);
  has(steps.label, 'Steps for Question 21');
  has(steps.foot, 'try Question 21 again');
  const next = real.qcBranchPageText(p, p.pages[2]);
  has(next.intro, 'You can do Question 21.');
});
test('an un-offset booklet reads exactly as it always did', () => {
  const p = plan();
  eq(real.qcPlanFirstNo(p), '1');
  eq(real.qcBranchNotes(p, 'q:n1').wrong, '✗ Stuck? Look back at Question 1 on Page 1, then ask your teacher.');
  eq(real.qcBranchPageText(p, p.pages[2]).intro, 'You can do Question 1. Now try these on your own.');
});
test('the booklet build offsets its plan before writing any line', () => {
  const rel = cut('function qcRelatedDocumentOpts(ids, o) {', '\n// How many questions the related pages ADD', 'related');
  has(rel, 'qcOffsetPlan(qcRelatedPlan(ids, o), o && o.startNumber)');
  const booklet = cut('function qcBookletDocumentOpts(plan, title, o) {', '\n// 🧪 { qid:', 'booklet');
  has(booklet, 'qcPlanFirstNo(plan)', 'the guide box names the first number too');
  has(booklet, 'startNumber: plan.startNumber || 1', 'the answer key behind the booklet follows');
  const build = cut('function wsRelatedBuild(ids, title, o) {', '\nfunction wsCurrentTitle', 'wsRelatedBuild');
  has(build, 'startNumber: wsStartNumberClean(o.startNumber)', 'the builder hands its start to the booklet');
});

// ---- 5. Everywhere else the number shows -------------------------------------
test('the builder reads the box into its options', () => {
  const opts = cut('function wsCurrentOptions() {', '\n// ====', 'wsCurrentOptions');
  has(opts, 'startNumber: wsBuilderStart()');
});
test('saving writes the field only when it is not 1', () => {
  const save = cut('async function saveCurrentWorksheet() {', '\nfunction wsFind(id)', 'save');
  has(save, 'if (wsStartNumberClean(opts.startNumber) !== 1) ws.startNumber = wsStartNumberClean(opts.startNumber);');
});
test('every reprint of a saved sheet numbers from its own start', () => {
  const reprint = cut('async function openSavedWorksheet(id, autoPrint) {', '\n// ============ EDITING THE SHEET HEADER', 'reprint');
  has(reprint, 'po.startNumber = wsStartOf(ws);');
  ok(reprint.indexOf('po.startNumber = wsStartOf(ws);') < reprint.indexOf('wsRelatedBuild('), 'set before the booklet is built');
});
test('the overview page uses the printed numbers', () => {
  const ov = cut('function renderWorksheetOverview() {', '\n  $("wvRevealAllBtn")', 'overview');
  has(ov, 'const wvStart = wsStartOf(ws);');
  has(ov, 'id="wvq${wsNumberAt(i, wvStart)}"');
  has(ov, 'Q${wsNumberAt(i, wvStart)}</span>');
  has(ov, 'href="#wvq${wsNumberAt(i, wvStart)}"');
  lacks(ov, 'Q${i + 1}', 'no position-based number left on the page');
  const reel = cut('function wvReelList(questions) {', '\n// Put question `i` of the reel', 'reel');
  has(reel, 'no: Number(wsNumberAt(i, wsStartOf(_wvWs)))');
  lacks(reel, 'no: i + 1');
});
test('the builder badges and the drawer show the printed numbers', () => {
  ok(!/wsOrder\.indexOf\([^)]*\) \+ 1/.test(src), 'no badge still counts from 1');
  has(src, 'wsOrder.indexOf(q.id) + wsBuilderStart()');
  has(src, 'wsOrder.indexOf(id) + wsBuilderStart()');
  has(src, 'return wseRowHtml(q, i + wsStartOf(ws),');
});
test('the drawer saves the number, removes it at 1, and rolls back a failed write', () => {
  const fn = cut('async function wseSetStart(value) {', '\n}', 'wseSetStart');
  has(fn, 'if (!wsMine(ws)) return;', 'only the owner renumbers a sheet');
  has(fn, 'if (next === 1) delete ws.startNumber; else ws.startNumber = next;');
  has(fn, 'if (was === undefined) delete ws.startNumber; else ws.startNumber = was;');
});
test('the controls are in the page, labelled and bounded', () => {
  has(src, 'id="wsStartNumber" class="ws-start-input" min="1" max="999"');
  has(src, 'id="wseStartNumber" class="ws-start-input" min="1" max="999"');
  has(src, '🔢 Number the questions from');
});
test('the question QR codes do not carry a number', () => {
  const qr = cut('async function buildQrMap(questions) {', '\nasync function printQuestions', 'qr');
  lacks(qr, 'startNumber');
  has(qr, 'questionShareUrl(q)', 'a QR still opens the question by id');
});
test('the version moved to v1.118.0 or later', () => {
  const m = /const APP_VERSION = "v(\d+)\.(\d+)\.(\d+)/.exec(src);
  ok(m, 'APP_VERSION found');
  ok(Number(m[1]) > 1 || Number(m[2]) >= 118, 'version is ' + m[0]);
});
test('CLAUDE.md documents the feature', () => {
  const doc = fs.readFileSync(new URL('../CLAUDE.md', import.meta.url), 'utf8');
  has(doc, '🔢 Number from');
  has(doc, 'worksheet-start-number-tests.mjs');
});

// ---- Run ---------------------------------------------------------------------
let pass = 0, fail = 0;
for (const c of cases) {
  if (only && !c.name.includes(only)) continue;
  try { await c.fn(); pass++; console.log('  ok   ' + c.name); }
  catch (e) { fail++; console.log('  FAIL ' + c.name + '\n      ' + String(e && e.message || e).split('\n').join('\n      ')); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
