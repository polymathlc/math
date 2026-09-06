// Regression tests for the 🎯 LEARNING-OBJECTIVES BOX — the blank rounded
// rectangle a PUPIL writes their own learning objectives in. Run with:
//     node tools/objectives-box-tests.mjs            all cases
//     node tools/objectives-box-tests.mjs <name>     one case
//
// It loads the REAL objBox* helpers out of index.html and reads the block
// editor, the worksheet builder and the CSS as text to pin the wiring.
//
// Every failure here is silent and the sheet still prints:
//
//  • THE BOX NOT PERSISTING. `collectQuestion` maps anything that is not an
//    image to a TEXT block and then filters out the ones with no content — so
//    without its own branch the box saves perfectly and is gone on the next
//    load, with nothing anywhere to say so.
//  • THE SHEET MEASURED A BOX SHORT. The automatic box is NOT in `q.blocks`,
//    so `wsBodyEstimateMm` has to reserve it by name. Reserve nothing and the
//    question spills its "Answer: ____" row onto the next page, which is the
//    exact fault the mm sizing exists to prevent.
//  • THE SWITCH PROMISING ONE BOX AND PRINTING TWO on a question the author had
//    already given one.
import fs from 'fs';

const PAGE = new URL('../index.html', import.meta.url).pathname;
const src = fs.readFileSync(PAGE, 'utf8');

const cut = (from, to, what) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(what + ': "' + from + '" not found in index.html');
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error(what + ': end marker not found');
  return src.slice(a, b);
};

// The REAL helpers, cut straight out of the file.
const M = new Function(`
  const escapeHtml = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  ${cut('// 🎯 LEARNING OBJECTIVES BOX', '\nfunction newBlock(type) {', 'objBox block')}
  ${cut('function newBlock(type) {', '\n// `at` is the index to insert BEFORE', 'newBlock')}
  const genBlockId = () => "blk_test";
  return { OBJBOX_DEFAULT_LINES, OBJBOX_LINES_MIN, OBJBOX_LINES_MAX, OBJBOX_LABEL,
           OBJBOX_LINE_MM, objBoxLines, objBoxLabel, objBoxHeightMm, objBoxHtml,
           objBoxAutoHtml, newBlock };
`)();

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  if (got !== want) throw new Error((what || 'value') + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
};
// The closing quote matters: `obx-lines` is the WRAPPER, and counting it
// inflates every measurement here by one — on a test whose whole subject is
// how many lines the box has.
const countLines = h => (h.match(/obx-line"/g) || []).length;

// ---- the default the whole block exists for --------------------------------
test('the default is TWO lines', () => {
  eq(M.OBJBOX_DEFAULT_LINES, 2, 'OBJBOX_DEFAULT_LINES');
  eq(M.objBoxLines({ type: 'objectivesBox' }), 2, 'a block with no lines field');
  eq(countLines(M.objBoxHtml({})), 2, 'drawn lines');
  eq(M.newBlock('objectivesBox').lines, 2, 'a freshly inserted block');
});

test('one line is allowed — "can be changed to ONE or more"', () => {
  eq(M.OBJBOX_LINES_MIN, 1, 'OBJBOX_LINES_MIN');
  eq(M.objBoxLines({ lines: 1 }), 1, 'one line');
  eq(countLines(M.objBoxHtml({ lines: 1 })), 1, 'drawn lines');
});

test('more lines are allowed, and asked for', () => {
  eq(M.objBoxLines({ lines: 6 }), 6, 'six lines');
  eq(countLines(M.objBoxHtml({ lines: 6 })), 6, 'drawn lines');
});

// ---- junk must never make the box unusable ---------------------------------
test('a junk line count falls back to the default, never to zero', () => {
  // A box with no lines in it is a box a pupil cannot write in, and it renders
  // perfectly — so every one of these has to land on the default.
  for (const v of [0, -3, NaN, null, undefined, '', 'two', {}, []]) {
    eq(M.objBoxLines({ lines: v }), 2, 'lines=' + JSON.stringify(v));
  }
  eq(countLines(M.objBoxHtml({ lines: 0 })), 2, 'a zero-line box must still draw lines');
});

test('an absurd line count is capped rather than believed', () => {
  eq(M.objBoxLines({ lines: 500 }), M.OBJBOX_LINES_MAX, 'capped');
  ok(M.OBJBOX_LINES_MAX <= 24, 'the cap must stay well under a sheet, got ' + M.OBJBOX_LINES_MAX);
  ok(M.objBoxHeightMm({ lines: 500 }) < 200, 'a capped box still asks for most of a page');
});

test('a fractional line count is rounded, not truncated to nothing', () => {
  eq(M.objBoxLines({ lines: 3.4 }), 3, '3.4');
  eq(M.objBoxLines({ lines: 0.6 }), 1, '0.6 rounds to a real line');
});

// ---- the heading -----------------------------------------------------------
test('a block with no label at all takes the default heading', () => {
  eq(M.objBoxLabel({ type: 'objectivesBox' }), M.OBJBOX_LABEL, 'absent label');
  ok(M.objBoxHtml({}).indexOf('obx-label') >= 0, 'no heading drawn');
});

test('an author who CLEARS the heading gets a truly blank box', () => {
  // `|| OBJBOX_LABEL` would put the heading back on the box they had just
  // emptied — the box is "blank" by request, and this is the half of it that is
  // easiest to undo by accident.
  eq(M.objBoxLabel({ label: '' }), '', 'cleared label');
  eq(M.objBoxLabel({ label: '   ' }), '', 'whitespace-only label');
  const h = M.objBoxHtml({ label: '' });
  ok(h.indexOf('obx-label') < 0, 'a cleared heading was still drawn: ' + h);
  ok(h.indexOf('obx-line') >= 0, 'the lines went with it: ' + h);
});

test('the heading is ESCAPED — it is text an author typed', () => {
  const h = M.objBoxHtml({ label: '<script>x</script> & "co"' });
  ok(h.indexOf('<script>') < 0, 'unescaped markup reached the sheet: ' + h);
  ok(h.indexOf('&amp;') >= 0, 'ampersand not escaped: ' + h);
});

// ---- how much of the sheet it asks for --------------------------------------
test('the height grows with the lines, and is measured not guessed', () => {
  const two = M.objBoxHeightMm({ lines: 2 });
  const six = M.objBoxHeightMm({ lines: 6 });
  eq(six - two, 4 * M.OBJBOX_LINE_MM, 'four more lines is four line-heights');
  ok(two > M.OBJBOX_LINE_MM * 2, 'the border, padding and heading are not reserved');
  ok(M.OBJBOX_LINE_MM >= 6, 'a line under 6mm is not a line anyone can write on');
});

// ---- 🎯 ONE box in every question ------------------------------------------
test('the switch off changes nothing at all', () => {
  eq(M.objBoxAutoHtml({ blocks: [] }, false), '', 'off');
  eq(M.objBoxAutoHtml({ blocks: [] }, undefined), '', 'undefined');
  eq(M.objBoxAutoHtml(null, false), '', 'no question');
});

test('the switch on puts a DEFAULT box on a question that has none', () => {
  const h = M.objBoxAutoHtml({ blocks: [{ type: 'text' }] }, true);
  ok(h.indexOf('obx-box') >= 0, 'no box: ' + h);
  eq(countLines(h), M.OBJBOX_DEFAULT_LINES, 'the automatic box is the default size');
});

test('a question that ALREADY has a box does not get a second one', () => {
  // "ONE learning objective box into each question" — a question the author
  // already gave a box would otherwise print two, the second at a size they
  // never chose.
  eq(M.objBoxAutoHtml({ blocks: [{ type: 'text' }, { type: 'objectivesBox', lines: 5 }] }, true), '',
     'a second box was added');
});

test('a question with no blocks array at all does not throw', () => {
  ok(typeof M.objBoxAutoHtml({}, true) === 'string', 'threw or returned non-string');
  ok(typeof M.objBoxAutoHtml(undefined, true) === 'string', 'threw on undefined');
});

// ---- it has to SURVIVE a save ----------------------------------------------
test('collectQuestion persists the box, and keeps it through the filter', () => {
  // Without its own branch it is written out as an empty TEXT block and then
  // dropped for having no content: saved perfectly, gone on the next load.
  const cq = cut('function collectQuestion() {', '\n  const existing = currentEditingId', 'collectQuestion');
  ok(/b\.type === "objectivesBox"\) return \{ id: b\.id, type: "objectivesBox", lines: objBoxLines\(b\), label: objBoxLabel\(b\) \}/.test(cq),
     'collectQuestion does not persist the box with its own fields');
  const filt = cut('.filter(b => (b.type === "objectivesBox"', ';', 'the block filter');
  ok(filt.indexOf('"objectivesBox" ? true') >= 0, 'a blank box is filtered out for being blank');
});

// ---- the block is reachable, and drawn everywhere ---------------------------
test('the block can be inserted, and the inserter is wired', () => {
  ok(src.indexOf('data-insert-objbox="${at}"') >= 0, 'the insert menu does not offer it');
  ok(/addBlock\("objectivesBox", Number\(btn\.dataset\.insertObjbox\)\)/.test(src),
     'the insert button is drawn but not wired — it does nothing at all');
  eq(M.newBlock('objectivesBox').type, 'objectivesBox', 'newBlock does not make one');
  eq(M.newBlock('text').type, 'text', 'newBlock broke the ordinary text block');
  eq(M.newBlock('image').type, 'image', 'newBlock broke the image block');
});

test('the card carries a badge, both controls and a live preview', () => {
  ok(src.indexOf('const isObx = b.type === "objectivesBox";') >= 0, 'no badge branch');
  const card = cut('function objBoxBlockHtml(b) {', '\n// Repaint one card', 'objBoxBlockHtml');
  ok(card.indexOf('data-obxlines=') >= 0, 'no line-count control');
  ok(card.indexOf('data-obxlabel=') >= 0, 'no heading control');
  ok(card.indexOf('objBoxHtml(b)') >= 0, 'the card describes the box instead of drawing it');
  ok(src.indexOf('[data-obxlines]') >= 0 && src.indexOf('[data-obxlabel]') >= 0,
     'the card is drawn but its inputs are not wired');
});

test('ONE renderer draws the box on every surface', () => {
  // renderQuestionBlockHtml is the one place a block becomes markup — practice,
  // every preview and the printed sheet all come through it.
  const r = cut('function renderQuestionBlockHtml(b) {', '\nfunction renderQuestionBlocksHtml', 'renderQuestionBlockHtml');
  ok(r.indexOf('objBoxHtml(b)') >= 0, 'the one renderer does not draw the box');
});

// ---- the printed sheet ------------------------------------------------------
test('the chunk appends the automatic box, INSIDE the question', () => {
  const chunk = cut('function wsQuestionChunkHtml(q, n, qrSvg, reserveMm, noBracket, objBoxAll) {',
                    '\nfunction wsAnswerKeyHtml', 'wsQuestionChunkHtml');
  const at = chunk.indexOf('objBoxAutoHtml(q, objBoxAll)');
  ok(at >= 0, 'the chunk never appends the box');
  ok(chunk.indexOf('</section>', at) > at, 'the box is emitted outside the question section');
});

test('the SHEET reserves the automatic box, or the question spills', () => {
  const est = cut('function wsBodyEstimateMm(q, imgMm, objBoxAll) {', '\n// Every "Answer: ____" row', 'wsBodyEstimateMm');
  // Named specifically: `objBoxHeightMm` also appears on the AUTHORED-block
  // line below, so merely finding it somewhere in the function passes a
  // version that reserves nothing at all for the automatic box.
  ok(/objBoxHeightMm\(\{ lines: OBJBOX_DEFAULT_LINES \}\)/.test(est),
     'the AUTOMATIC box is not reserved — the question spills onto the next page');
  ok(/if \(objBoxAll && !\(\(q\.blocks \|\| \[\]\)\.some/.test(est),
     'a question that already has a box would be reserved for twice');
  // …and an authored box is measured from its OWN line count rather than the
  // flat 12mm every unknown block gets.
  ok(/b\.type === "objectivesBox"\) mm \+= objBoxHeightMm\(b\)/.test(est),
     'an authored box falls through to the flat unknown-block allowance');
});

test('the working-space sizing knows about the box too', () => {
  // Both of these subtract wsBodyEstimateMm, so a flag that stops here leaves
  // the working area sized as though the box were not there.
  for (const fn of ['wsEffectiveImgMm(q, reserveMm, objBoxAll)', 'wsWorkingSpaceMm(q, reserveMm, objBoxAll)']) {
    ok(src.indexOf('function ' + fn) >= 0, fn + ' does not take the flag');
  }
  const chunk = cut('function wsQuestionChunkHtml(q, n, qrSvg, reserveMm, noBracket, objBoxAll) {',
                    '\nfunction wsAnswerKeyHtml', 'wsQuestionChunkHtml');
  ok(chunk.indexOf('wsEffectiveImgMm(q, reserveMm, objBoxAll)') >= 0, 'the chunk does not pass it to wsEffectiveImgMm');
  ok(chunk.indexOf('wsWorkingSpaceMm(q, reserveMm, objBoxAll)') >= 0, 'the chunk does not pass it to wsWorkingSpaceMm');
});

test('the builder reads the option and hands it to every chunk', () => {
  const b = cut('async function wsBuildDocumentHtml(questions, title, opts) {',
                '\n// ---- Editing the header ON the preview', 'wsBuildDocumentHtml');
  ok(b.indexOf('const objBoxAll = !!opts.objBox;') >= 0, 'the builder ignores the option');
  // `[^)]*` stops at the first `)`, which here is inside
  // `(numbers && numbers[q.id])` — match to the end of the STATEMENT instead.
  ok(/wsQuestionChunkHtml\(.*objBoxAll\);/.test(b), 'the builder does not pass it to the chunk');
});

// ---- the switches ----------------------------------------------------------
test('both printing surfaces read a checkbox that really exists', () => {
  for (const [fn, id] of [['wsCurrentOptions', 'wsIncludeObjBox'], ['mwPrintOptions', 'mwIncludeObjBox']]) {
    ok(src.indexOf('objBox: !!($("' + id + '")') >= 0, fn + ' does not read ' + id);
    ok(src.indexOf('id="' + id + '"') >= 0, id + ' has no checkbox — the switch can never be turned on');
  }
});

// ---- the CSS the box is nothing without ------------------------------------
test('the box is a ROUNDED rectangle, on screen AND on paper', () => {
  const print = cut('function wsPrintCss() {', '\n// ---- Editing the header', 'wsPrintCss');
  for (const sel of ['.obx-box', '.obx-label', '.obx-line']) {
    ok(print.indexOf(sel + ' {') >= 0, sel + ' is not in the print CSS — the box prints as bare text');
  }
  ok(/\.obx-box \{[^}]*border-radius/.test(print), 'the printed box is not rounded');
  // The app's own stylesheet, for practice and the editor preview.
  const screen = src.slice(0, src.indexOf('function wsPrintCss'));
  ok(/^\.obx-box \{[^}]*border-radius/m.test(screen), 'the on-screen box is missing or not rounded');
  ok(/^\.obx-line \{/m.test(screen), 'the on-screen box has no ruled lines');
});

test('the printed box keeps itself with its question', () => {
  const print = cut('function wsPrintCss() {', '\n// ---- Editing the header', 'wsPrintCss');
  const rule = print.slice(print.indexOf('.obx-box {'));
  ok(/break-inside: avoid/.test(rule.slice(0, 300)),
     'a box stranded at the top of the next sheet belongs to no question');
});

// ---- the box is somewhere a pupil WRITES -----------------------------------
test('a question carrying a box is not Booklet A', () => {
  // Booklet A is answered on a separate answer sheet — a reflection box printed
  // there is one nobody can fill in.
  const fn = cut('function cpbIsMcqOnly(q) {', '\nfunction cpbBookOf', 'cpbIsMcqOnly');
  ok(fn.indexOf('objectivesBox') >= 0, 'cpbIsMcqOnly puts a box-carrying MCQ in the answer-sheet booklet');
});

// ---- run -------------------------------------------------------------------
const only = process.argv[2];
let pass = 0, fail = 0;
for (const c of cases) {
  if (only && c.name.indexOf(only) < 0) continue;
  try { c.fn(); pass++; console.log('  ok   ' + c.name); }
  catch (e) { fail++; console.log('  FAIL ' + c.name + '\n       ' + e.message); }
}
console.log((fail ? '❌ ' : '✅ ') + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
