// Regression tests for THE DUPLICATE WARNING.
// Run with:
//     node tools/duplicate-warning-tests.mjs            all cases
//     node tools/duplicate-warning-tests.mjs <name>     one case
//
// It loads the REAL matcher out of index.html and runs it over synthetic
// questions. Every way this can break is silent — the app works perfectly
// either way, and the only symptom is the same question in the bank twice:
//
//  • TOO TIGHT AND IT NEVER FIRES. A question re-read from the same paper is
//    never worded byte-for-byte the same, so an exact-match check catches
//    nothing at all while looking like it works.
//  • TOO LOOSE AND IT ALWAYS FIRES. A warning on every save is one nobody
//    reads, and the real duplicate goes through behind it. This bites harder
//    here than in the language portals: a math question is mostly digits and
//    a handful of stock words, so two unrelated questions share more of their
//    vocabulary than two unrelated English ones do.
//  • THE TITLE AND THE OPTIONS COUNT. Body text alone is the weakest half of
//    a math question — two questions with the same stem and different choices
//    are different questions.
//  • THE VETTING LIST MUST BE SEARCHED TOO. The commonest duplicate of all is
//    the same screenshot read twice in one sitting, and both copies are then
//    in vetting where a bank-only search sees neither.
//  • A QUESTION MUST NOT MATCH ITSELF, or every re-saved edit warns against
//    the very question being edited.
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

const FIXTURE = `
let questionBank = [];
let vettingList = [];
function stripHtml(s) { return String(s || "").replace(/<[^>]*>/g, " "); }
function questionText(q) { return (q.blocks || []).filter(b => b.type === "text").map(b => stripHtml(b.content)).join(" "); }
`;

const block = cut(
  '// =====================================================================\n// "YOU MAY ALREADY HAVE THIS ONE"',
  '\nfunction vetPreviewHtml(q) {',
  'matcher'
);

const M = new Function(FIXTURE + block + `
return {
  find: _dupFind,
  tag: _vetTagDuplicate,
  where: _dupWhereLabel,
  tokens: _vetTokens,
  MIN: DUP_MIN_SIM,
  seed(bank, vetting) { questionBank = bank || []; vettingList = vetting || []; },
};`)();

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error((what || 'value') + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
  }
};

const q = (id, title, text, options) => {
  const o = { id, title, blocks: [{ type: 'text', content: text }] };
  if (options) o.options = options;
  return o;
};

const ORIGINAL = q('m1', 'Fractions — ribbon',
  'Aisha had a ribbon 4/5 m long. She cut off 1/3 of it to tie a parcel. What length of ribbon was left, in metres?',
  ['8/15 m', '7/15 m', '2/5 m', '1/3 m']);
const RE_READ = q('m2', 'Fractions — ribbon length',
  '7. Aisha had a ribbon 4/5 m long. She cut off 1/3 of it to tie a parcel. What length of ribbon was left, in metres?',
  ['8/15 m', '7/15 m', '2/5 m', '1/3 m']);
const SIBLING = q('m3', 'Fractions — rope',
  'Bala had a rope 4/5 m long. He joined it to another rope 1/3 m long to make a swing. What was the total length of rope, in metres?',
  ['17/15 m', '16/15 m', '4/15 m', '1 m']);

// ── it fires when it should ─────────────────────────────────────────────────

test('the same question read twice is flagged', () => {
  M.seed([ORIGINAL], []);
  const d = M.find(RE_READ);
  ok(d, 'a re-read of the same question was not flagged');
  eq(d.id, 'm1', 'the twin it named');
  ok(d.sim >= 66, 'the reported match was under the threshold: ' + d.sim);
});

test('_vetTagDuplicate stamps what the card and the banner read', () => {
  M.seed([ORIGINAL], []);
  const fresh = Object.assign({}, RE_READ);
  M.tag(fresh);
  ok(fresh.duplicateOf, 'nothing was stamped on a duplicate');
  eq(fresh.duplicateOf.id, 'm1');
  eq(fresh.duplicateOf.where, 'bank', 'the stamp does not say which list');
  ok(Number.isFinite(fresh.duplicateOf.sim), 'the stamp carries no percentage');
});

test('_vetTagDuplicate leaves a question that is NOT a duplicate untouched', () => {
  M.seed([SIBLING], []);
  const fresh = Object.assign({}, ORIGINAL);
  M.tag(fresh);
  ok(!fresh.duplicateOf, 'a question with no twin was stamped as a duplicate');
});

// ── it stays quiet when it should ───────────────────────────────────────────

test('two different questions built on the same numbers are not flagged', () => {
  // The false positive that matters here: math questions share their digits
  // and their stock words, so a matcher tuned on prose alone cries wolf.
  M.seed([SIBLING], []);
  ok(!M.find(ORIGINAL), 'two genuinely different questions were called duplicates');
});

test('a question never matches ITSELF', () => {
  M.seed([ORIGINAL], []);
  ok(!M.find(ORIGINAL), 'a question matched itself');
});

test('an explicit excludeId wins over the question own id', () => {
  M.seed([ORIGINAL], []);
  ok(!M.find(Object.assign({}, RE_READ, { id: null }), 'm1'), 'excludeId was ignored');
});

test('a question too short to judge is never flagged', () => {
  M.seed([ORIGINAL], []);
  ok(!M.find(q('z', 'Sum', 'add')), 'a three-word question was matched on nothing');
});

test('an empty bank and an empty vetting list flag nothing', () => {
  M.seed([], []);
  ok(!M.find(RE_READ), 'something was found in two empty lists');
});

// ── what the questions are compared ON ──────────────────────────────────────

test('the TITLE counts', () => {
  const t = M.tokens({ title: 'Fractions ribbon parcel', blocks: [] });
  ok(t.has('fractions') && t.has('ribbon'), 'title words are not compared on');
});

test('the MCQ OPTIONS count', () => {
  const t = M.tokens({ title: '', blocks: [], options: ['eighteen apples', 'twenty pears'] });
  ok(t.has('eighteen') && t.has('pears'), 'option words are not compared on');
});

test('the BODY still counts', () => {
  const t = M.tokens(q('x', '', 'Aisha had a ribbon four fifths of a metre long'));
  ok(t.has('ribbon') && t.has('metre'), 'body words are not compared on');
});

test('same stem, DIFFERENT choices — the options are what tell them apart', () => {
  // Two questions can share a stem and ask different things of it. If the
  // options were not compared on, these would read as the same question.
  const stem = 'A shop sold 240 pens on Monday and 3/8 as many on Tuesday.';
  const askA = q('s1', 'Pens sold on Tuesday', stem + ' How many pens were sold on Tuesday?', ['90', '120', '150', '640']);
  const askB = q('s2', 'Pens sold altogether', stem + ' How many pens were sold altogether over the two days?', ['330', '360', '390', '880']);
  M.seed([askA], []);
  const d = M.find(askB);
  ok(!d, 'two different questions on one stem were called duplicates' + (d ? ' at ' + d.sim + '%' : ''));
});

test('a question with no options at all is still comparable', () => {
  const open = q('o1', 'Ribbon left', 'Aisha had a ribbon 4/5 m long. She cut off 1/3 of it to tie a parcel. What length of ribbon was left, in metres?');
  M.seed([open], []);
  ok(M.find(Object.assign({}, open, { id: 'o2' })), 'an open-ended question was never compared');
});

// ── the vetting list is searched too ────────────────────────────────────────

test('a twin waiting in VETTING is found', () => {
  M.seed([], [ORIGINAL]);
  const d = M.find(RE_READ);
  ok(d, 'a twin in the vetting list was not found');
  eq(d.where, 'vetting', 'where the twin was reported to be');
});

test('the CLOSER of two twins wins, whichever list it is in', () => {
  const loose = q('c1', 'Fractions — ribbon', 'Aisha had a ribbon. She cut some off. What was left?');
  M.seed([loose], [ORIGINAL]);
  eq(M.find(RE_READ).id, 'm1', 'the closer twin did not win');
});

test('each list is named in words, and only vetting reads as vetting', () => {
  ok(/vetting/i.test(M.where({ where: 'vetting' })), 'a vetting twin is not described as being in vetting');
  ok(/bank/i.test(M.where({ where: 'bank' })), 'a bank twin is not described as being in the bank');
  ok(/bank/i.test(M.where(null)), 'an unknown origin should read as the bank, not blank');
});

test('a null or empty question is handled rather than thrown on', () => {
  M.seed([ORIGINAL], []);
  ok(!M.find(null), 'a null question was matched');
  ok(!M.find({}), 'an empty question was matched');
  eq(M.tokens(null).size, 0, 'tokens of nothing');
});

// ── the threshold ───────────────────────────────────────────────────────────

test('the threshold is a named constant, in the sane middle of the range', () => {
  ok(M.MIN > 0.5 && M.MIN < 0.95, 'DUP_MIN_SIM is outside the useful range: ' + M.MIN);
});

// ── runner ───────────────────────────────────────────────────────────────────

const only = process.argv[2];
let passed = 0, failed = 0;
for (const c of cases) {
  if (only && c.name !== only) continue;
  try { await c.fn(); console.log('  ok   ' + c.name); passed++; }
  catch (err) { console.log('  FAIL ' + c.name + '\n         ' + err.message); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
