// Regression tests for the 📊 TABLE BLOCK — a real, editable table inside a
// question, read off a picture by AI or pasted in as cells. Run with:
//     node tools/table-block-tests.mjs
//
// It loads the REAL tbl* helpers out of index.html and reads the block editor,
// the worksheet builder, the CSS and the Cloud Function as text to pin the
// wiring. Every failure here is silent and the question still saves:
//
//  • THE TABLE NOT PERSISTING. `collectQuestion` maps anything that is not an
//    image to a TEXT block and drops the ones with no content, so without its
//    own branch the table saves perfectly and is gone on the next load.
//  • THE SHEET MEASURED A TABLE SHORT. Left to the flat 12mm every unknown
//    block gets, a ten-row table spills the answer row onto the next page.
//  • THE MARKER NOT SEEING THE TABLE. A question whose data is in the table is
//    marked on half the question unless the server's questionText reads it.
//  • A REPLY THAT IS NOT A RECTANGLE filed as a table, or a one-cell paste.
import fs from 'fs';

const PAGE = new URL('../index.html', import.meta.url).pathname;
const src = fs.readFileSync(PAGE, 'utf8');
const fn = fs.readFileSync(new URL('../functions/index.js', import.meta.url).pathname, 'utf8');

const cut = (from, to, what) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(what + ': "' + from + '" not found in index.html');
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error(what + ': end marker not found');
  return src.slice(a, b);
};

const M = new Function(`
  const escapeHtml = s => String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const renderMathInline = s => escapeHtml(s);
  ${cut('// 📊 TABLE BLOCK — a real table in a question', '\nfunction newBlock(type) {', 'table block')}
  ${cut('function newBlock(type) {', '\n// `at` is the index to insert BEFORE', 'newBlock')}
  const genBlockId = () => "blk_test";
  return { TBL_ROWS_MAX, TBL_COLS_MAX, TBL_DEFAULT_ROWS, TBL_DEFAULT_COLS, TBL_ROW_MM, TBL_CHROME_MM, TBL_CAPTION_MM,
           tblRows, tblHeader, tblCaption, tblCols, tblHeightMm, tblText, tblHasContent, tblHtml, tblFromText,
           tblReadPrompt, tblFromAi, newBlock };
`)();

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error((what || 'value') + ': got ' + g + ', wanted ' + w);
};

// ---- the rectangle -----------------------------------------------------------
test('a new table is a blank 3 × 3 grid with a heading row', () => {
  const b = M.newBlock('table');
  eq(b.type, 'table'); eq(b.header, true); eq(b.caption, '');
  eq(b.rows.length, M.TBL_DEFAULT_ROWS); eq(b.rows[0].length, M.TBL_DEFAULT_COLS);
  ok(b.rows.every(r => r.every(c => c === '')), 'every cell blank');
});
test('tblRows pads ragged rows to the widest and stringifies every cell', () => {
  eq(M.tblRows({ rows: [['a', 'b', 'c'], ['d'], [1, null]] }), [['a', 'b', 'c'], ['d', '', ''], ['1', '', '']]);
});
test('junk, an absent field or an empty list falls back to the blank grid, never to nothing', () => {
  for (const b of [{}, { rows: null }, { rows: [] }, { rows: 'x' }, null]) {
    const rows = M.tblRows(b);
    eq(rows.length, M.TBL_DEFAULT_ROWS, 'rows for ' + JSON.stringify(b));
    eq(rows[0].length, M.TBL_DEFAULT_COLS, 'cols for ' + JSON.stringify(b));
  }
});
test('a row that is not an array becomes a one-cell row', () => {
  eq(M.tblRows({ rows: ['just text', ['a', 'b']] }), [['just text', ''], ['a', 'b']]);
});
test('the caps hold a runaway reply', () => {
  const big = Array.from({ length: 200 }, () => Array.from({ length: 50 }, () => 'x'));
  const rows = M.tblRows({ rows: big });
  eq(rows.length, M.TBL_ROWS_MAX); eq(rows[0].length, M.TBL_COLS_MAX);
  eq(M.tblRows({ rows: [['y'.repeat(900)]] })[0][0].length, 200, 'a cell is clipped');
});
test('cells are trimmed and their whitespace folded', () => {
  eq(M.tblRows({ rows: [['  2 h   30 min \n']] }), [['2 h 30 min']]);
});
test('the heading row is on unless the field says false', () => {
  eq(M.tblHeader({}), true); eq(M.tblHeader({ header: true }), true);
  eq(M.tblHeader({ header: false }), false); eq(M.tblHeader({ header: 0 }), true, 'only false turns it off');
});

// ---- the words and the measure --------------------------------------------------
test('tblText is one line per row, cells piped, caption first', () => {
  eq(M.tblText({ caption: 'Movies', rows: [['Movie', 'Starts at'], ['Movie 1', '2:00 pm']] }), 'Movies\nMovie | Starts at\nMovie 1 | 2:00 pm');
  eq(M.tblText({ rows: [['a', 'b']] }), 'a | b');
});
test('tblHasContent is true for a table with any words, false for a blank grid', () => {
  eq(M.tblHasContent(M.newBlock('table')), false);
  eq(M.tblHasContent({ rows: [['Movie', ''], ['', '']] }), true, 'headings alone keep a fill-in table');
});
test('the printed height is a row per row, plus the caption when there is one', () => {
  eq(M.tblHeightMm({ rows: [['a'], ['b'], ['c']] }), 3 * M.TBL_ROW_MM + M.TBL_CHROME_MM);
  eq(M.tblHeightMm({ rows: [['a']], caption: 'Cap' }), M.TBL_ROW_MM + M.TBL_CHROME_MM + M.TBL_CAPTION_MM);
  ok(M.tblHeightMm({ rows: Array.from({ length: 10 }, () => ['x']) }) > 12, 'a ten-row table is more than the flat 12mm an unknown block gets');
});

// ---- the one renderer -----------------------------------------------------------
test('tblHtml draws a thead of th when the first row is a heading, and none when it is not', () => {
  const h = M.tblHtml({ rows: [['A', 'B'], ['1', '2']] });
  ok(h.includes('<thead><tr><th>A</th><th>B</th></tr></thead>'), 'heading row');
  ok(h.includes('<tbody><tr><td>1</td><td>2</td></tr></tbody>'), 'body row');
  const n = M.tblHtml({ header: false, rows: [['A', 'B'], ['1', '2']] });
  ok(!n.includes('<th>') && !n.includes('<thead>'), 'no heading');
  ok(n.includes('<tr><td>A</td><td>B</td></tr>'), 'first row is body');
});
test('the caption prints above the table, and every cell is escaped', () => {
  const h = M.tblHtml({ caption: 'Fees <b>', rows: [['<script>', '5 > 3']] });
  ok(h.indexOf('qtb-caption') < h.indexOf('<table'), 'caption first');
  ok(h.includes('Fees &lt;b&gt;'), 'caption escaped');
  ok(h.includes('&lt;script&gt;') && h.includes('5 &gt; 3'), 'cells escaped');
});
test('the classes are the same on screen and on paper', () => {
  ok(/\n\.qtb \{/.test(src) && /\n\.qtb th, \.qtb td \{/.test(src), 'screen CSS');
  ok(/    \.qtb \{ border-collapse/.test(src) && /    \.qtb th, \.qtb td \{ border: 0\.7pt/.test(src), 'print CSS in wsPrintCss');
  ok(src.includes('.qtb-wrap { margin: 3mm 0 3.5mm; break-inside: avoid;'), 'a printed table does not break across pages');
});

// ---- pasted text ------------------------------------------------------------------
test('a spreadsheet paste (tabs) becomes cells', () => {
  eq(M.tblFromText('Movie\tStarts at\tDuration\nMovie 1\t2:00 pm\t2 h 30 min\n'), [['Movie', 'Starts at', 'Duration'], ['Movie 1', '2:00 pm', '2 h 30 min']]);
});
test('pipes, commas and runs of spaces are read too, in that order of preference', () => {
  eq(M.tblFromText('| a | b |\n| 1 | 2 |'), [['a', 'b'], ['1', '2']]);
  eq(M.tblFromText('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
  eq(M.tblFromText('Item    Price\nPen     $2'), [['Item', 'Price'], ['Pen', '$2']]);
});
test('a paste with nothing table-shaped in it is refused', () => {
  eq(M.tblFromText(''), null); eq(M.tblFromText('   \n  '), null); eq(M.tblFromText('hello'), null);
});
test('a single column of several lines is a table; blank lines are skipped', () => {
  eq(M.tblFromText('Mon\n\nTue\nWed'), [['Mon'], ['Tue'], ['Wed']]);
});

// ---- the AI reply -----------------------------------------------------------------
test('the prompt asks for a rectangle of strings and nothing around the table', () => {
  const p = M.tblReadPrompt();
  ok(p.includes('"rows":[['), 'the JSON shape'); ok(p.includes('SAME number of cells'), 'rectangular');
  ok(p.includes('Leave out the question wording'), 'only the table'); ok(p.includes('"rows":[]'), 'a way to say there is no table');
});
test('tblFromAi believes a rectangle and refuses everything else', () => {
  const got = M.tblFromAi({ caption: 'Fees', header: true, rows: [['Time', 'Fee'], ['10 min', '$12']] });
  eq(got, { rows: [['Time', 'Fee'], ['10 min', '$12']], header: true, caption: 'Fees' });
  eq(M.tblFromAi({ rows: [] }), null, 'no rows');
  eq(M.tblFromAi({ rows: [['', '']] }), null, 'nothing in the cells');
  eq(M.tblFromAi(null), null); eq(M.tblFromAi('x'), null); eq(M.tblFromAi({}), null);
});
test('a bare array of rows and an object-shaped row are accepted', () => {
  eq(M.tblFromAi([['a', 'b'], ['1', '2']]).rows, [['a', 'b'], ['1', '2']]);
  eq(M.tblFromAi({ rows: [{ x: 'a', y: 'b' }, ['1', '2']] }).rows, [['a', 'b'], ['1', '2']]);
});
test('header defaults to true and is only false when the reply says so', () => {
  eq(M.tblFromAi({ rows: [['a']] }).header, true);
  eq(M.tblFromAi({ header: false, rows: [['a']] }).header, false);
});

// ---- the wiring, read as text --------------------------------------------------------
test('renderQuestionBlockHtml — the ONE place a block becomes markup — draws the table', () => {
  const body = cut('function renderQuestionBlockHtml(b, q) {', '\nfunction renderQuestionBlocksHtml', 'renderQuestionBlockHtml');
  ok(body.includes('if (b.type === "table") return tblHtml(b);'), 'the branch');
});
test('collectQuestion persists the table and keeps one that has words', () => {
  const body = cut('function collectQuestion() {', 'const existing = currentEditingId', 'collectQuestion');
  ok(body.includes('if (b.type === "table") return { id: b.id, type: "table", header: tblHeader(b), rows: tblRows(b), caption: tblCaption(b) };'), 'the branch');
  ok(body.includes('b.type === "table" ? tblHasContent(b)'), 'the filter keeps it');
});
test('wsBodyEstimateMm reserves every row of a table', () => {
  const body = cut('function wsBodyEstimateMm(q, imgMm, objBoxAll) {', '\n// Every "Answer: ____" row', 'wsBodyEstimateMm');
  ok(body.includes('else if (b.type === "table") mm += tblHeightMm(b);'), 'the branch');
});
test('the inserter offers a table and is wired', () => {
  ok(src.includes('data-insert-table="${at}"'), 'the button');
  ok(src.includes('root.querySelectorAll("[data-insert-table]").forEach(btn => btn.addEventListener("click", () => addBlock("table", Number(btn.dataset.insertTable))));'), 'the wiring');
});
test('the editor draws the card, wires it, and the paste window reads pictures AND text', () => {
  ok(src.includes('${isTbl ? tblBlockHtml(b) : isObx ? objBoxBlockHtml(b)'), 'the card body');
  ok(src.includes('\n  tblWire(wrap);'), 'wired on every render');
  const w = cut('function tblWire(root) {', '\n// What lands in the window', 'tblWire');
  ok(w.includes('enableHoverPaste(z, e => tblHandlePaste(id, e))') && w.includes('z.addEventListener("paste", e => tblHandlePaste(id, e))'), 'hover and focused paste');
  const h = cut('function tblHandlePaste(id, e) {', '\nfunction tblPasteText', 'tblHandlePaste');
  ok(h.includes('tblReadImage(id, it.getAsFile())') && h.includes('tblPasteText(id, text)'), 'a picture goes to the model, words are split locally');
});
test('the picture reader goes through the app\'s own vision door and the tolerant parser, and refuses a non-table', () => {
  const r = cut('async function tblReadImage(id, file) {', '\nfunction imgBlockHtml', 'tblReadImage');
  ok(r.includes('askGeminiVision(tblReadPrompt(), [media]'), 'askGeminiVision');
  ok(r.includes('tblFromAi(parseAIJson(raw))'), 'parseAIJson → tblFromAi');
  ok(r.includes('if (!got) { tblStatus(id, "No table found'), 'a non-table is said, not filed');
  ok(r.includes('if (!editorBlocks.some(x => x.id === id && x.type === "table")) return;'), 'a block removed mid-read is not written to');
  ok(r.includes('if (got.caption && !tblCaption(b)) b.caption = got.caption;'), 'a typed caption is kept');
});
test('a question\'s words include its tables — search, duplicates, AI prompts, the checker', () => {
  ok(src.includes('function questionText(q) { return blocksPlainText((q && q.blocks) || [], " "); }'), 'questionText');
  ok(src.includes('if (b.type === "table") return tblText(b);'), 'blockPlainText');
  ok(src.includes('const stem = blocksPlainText(editorBlocks, " ").slice(0, 700);'), 'the annotation reader');
  ok((src.match(/const sourceText = blocksPlainText\(editorBlocks, "\\n\\n"\);/g) || []).length === 2, 'regenerate and check with AI');
  ok(src.includes('const text = blocksPlainText(q.blocks, "\\n\\n");'), 'the answer-key cross-check');
  ok(!/filter\(b => b\.type === "text"\)\.map\(b => stripHtml\(b\.content\)\)\.join\(" "\)/.test(src), 'no text-only flattening left behind');
});
test('the Cloud Function\'s marker reads the table too', () => {
  ok(fn.includes('const tableText = b => {'), 'tableText');
  ok(fn.includes('(b && b.type === "table") ? tableText(b)'), 'questionText reads it');
});

// ---- run ----------------------------------------------------------------------------------
const only = process.argv[2];
let passed = 0, failed = 0;
for (const c of cases) {
  if (only && c.name !== only) continue;
  try { c.fn(); passed++; console.log('  ok   ' + c.name); }
  catch (e) { failed++; console.log('  FAIL ' + c.name + '\n       ' + e.message); }
}
console.log('\n' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
