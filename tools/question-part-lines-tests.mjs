// Regression tests for QUESTION PARTS ON THEIR OWN LINES (v1.105.0).
// Run with:
//     node tools/question-part-lines-tests.mjs
//
// It loads the REAL renderer block out of index.html — from VULGAR_FRACTIONS
// to renderQuestionBlockHtml — and checks:
//  • "(a)" / "a)" / "(b)" / "b)" written ANYWHERE in a paragraph (mid-sentence,
//    after a full stop, at a line start) each end up on a line of their own,
//    under the main paragraph, as a labelled row with line-height 1.6.
//  • Ordinary maths is left alone: f(a), 2(b), (a)+(b), x(a+b).
//  • A lone marker, or markers out of sequence, change nothing.
//  • A block with no parts renders byte-for-byte as before.
import fs from 'fs';
import assert from 'assert/strict';

const PAGE = new URL('../index.html', import.meta.url).pathname;
const src = fs.readFileSync(PAGE, 'utf8');
const cut = (from, to) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error('"' + from + '" not found in index.html');
  const b = src.indexOf(to, a);
  if (b < 0) throw new Error('"' + to + '" not found in index.html');
  return src.slice(a, b);
};
const escapeHtml = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const body = cut('const VULGAR_FRACTIONS = {', '// `q` is OPTIONAL and only a PREVIEW passes it');
const api = new Function('escapeHtml', body + '\nreturn { splitQuestionParts, questionPartMarks, renderMathBlock, renderMathInline };')(escapeHtml);
const { splitQuestionParts, questionPartMarks, renderMathBlock, renderMathInline } = api;

const cases = [];
const t = (name, fn) => cases.push([name, fn]);

t('mid-sentence (a) (b) move onto their own lines', () => {
  assert.equal(
    splitQuestionParts('Ali has 24 tarts. (a) How many boxes? (b) How many are left?'),
    'Ali has 24 tarts.\n(a) How many boxes?\n(b) How many are left?');
});
t('a) b) without the opening bracket', () => {
  assert.equal(
    splitQuestionParts('Find the angles. a) Find ∠BCD. b) Find ∠ABE. c) Find ∠BEF.'),
    'Find the angles.\na) Find ∠BCD.\nb) Find ∠ABE.\nc) Find ∠BEF.');
});
t('marker straight after a full stop with no space', () => {
  assert.equal(splitQuestionParts('A box holds 6.(a) How many? (b) Why?'), 'A box holds 6.\n(a) How many?\n(b) Why?');
});
t('mixed spellings in sequence', () => {
  assert.equal(splitQuestionParts('Stem. (a) One. b) Two.'), 'Stem.\n(a) One.\nb) Two.');
});
t('already on their own lines: unchanged apart from indent', () => {
  assert.equal(splitQuestionParts('Stem.\n(a) One.\n(b) Two.'), 'Stem.\n(a) One.\n(b) Two.');
  assert.equal(splitQuestionParts('Stem.\n   (a) One.\n  (b) Two.'), 'Stem.\n(a) One.\n(b) Two.');
});
t('(a) at the very start, (b) mid-paragraph', () => {
  assert.equal(splitQuestionParts('(a) Find x. (b) Find y.'), '(a) Find x.\n(b) Find y.');
});
t('ordinary maths is left alone', () => {
  for (const s of ['f(a) = 3 and f(b) = 5', '2(a) + 3(b) = 7', '(a)+(b) = 9', 'x(a+b) and y(a-b)', 'Area = l(b) (a) value']) {
    // The last one has a lone (a) after a space — still no (b) after it.
    assert.equal(splitQuestionParts(s), s, s);
  }
});
t('a lone marker is not a question in parts', () => {
  const s = 'Find the value of the area (a) in cm².';
  assert.equal(splitQuestionParts(s), s);
  assert.deepEqual(questionPartMarks(s), []);
});
t('out of sequence markers are not parts', () => {
  const s = 'Look at b) first and then c) next.';
  assert.equal(splitQuestionParts(s), s);
});
t('rendered rows carry line-height 1.6 and the label beside the text', () => {
  const html = renderMathBlock('Ali has 24 tarts. (a) How many boxes? (b) How many are left?');
  assert.ok(html.startsWith('<span style="display:block">Ali has 24 tarts.</span>'), html);
  const rows = html.match(/<span style="display:flex;align-items:baseline;gap:0\.34em;line-height:1\.6">/g) || [];
  assert.equal(rows.length, 2, html);
  assert.ok(html.includes('<span style="flex:0 0 auto">(a)</span>'), html);
  assert.ok(html.includes('<span style="flex:0 0 auto">(b)</span>'), html);
});
t('a block with no parts is byte-for-byte what it was', () => {
  const s = 'Ali has 24 tarts.\nHow many are left?';
  assert.equal(renderMathBlock(s), s.split('\n').map(renderMathInline).join('<br>'));
});
t('numbered lists keep their old row style', () => {
  const html = renderMathBlock('Steps:\n1. Add.\n2. Divide.');
  assert.ok(!html.includes('line-height:1.6'), html);
});

let failed = 0;
const only = process.argv[2];
for (const [name, fn] of cases) {
  if (only && !name.includes(only)) continue;
  try { fn(); console.log('ok  ', name); }
  catch (e) { failed++; console.log('FAIL', name, '\n     ', e.message); }
}
if (failed) { console.log(`\n${failed} failing`); process.exit(1); }
console.log('\nall question-part line tests pass');
