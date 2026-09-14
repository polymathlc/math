import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { selectHadesMathBankRound, readHadesMathMcq } from '../hades-math-bank.js';

const names = ['Orchid garden', 'Harbour voyage', 'Maple trees', 'Lantern festival', 'Amber staircase', 'Emerald mosaic', 'Saffron kitchen', 'Crystal palace', 'Willow park', 'Copper necklace', 'Silver orchard', 'Coral reef'];
const q = (i, extra = {}) => ({ id: 'bank-' + i, title: names[i % names.length] + (i >= names.length ? ' extension' : ''),
  level: 'P6', topic: 'Fractions', blocks: [{ type: 'text', content: `Find the result of ${i + 20}/4 + 3/4.` }],
  options: [i + 23, i + 24, i + 25, i + 26].map(value => value + '/4'), correctOption: 0, ...extra });
const bank = (count = 12) => Array.from({ length: count }, (_, i) => q(i));
const select = overrides => selectHadesMathBankRound({ bank: bank(), uid: 'preview:alice:P6', level: 'P6',
  now: 2000000000000, random: () => 0.5, renderBlocks: question => question.blocks.map(block => block.content || '').join(''), ...overrides });

test('five unique database records, never a built-in or fabricated fallback', () => {
  const selected = select(); assert.equal(selected.length, 5);
  assert.equal(new Set(selected.map(row => row.id)).size, 5);
  assert.ok(selected.every(row => row.id.startsWith('bank-') && row.source));
  assert.deepEqual(select({ bank: [] }), []);
  assert.deepEqual(select({ bank: bank(4) }), []);
});

test('grade and mastery policy applies even in the administrator beta', () => {
  const rows = select({ bank: bank().concat(bank().map((row, i) => q(i + 50, { id: 'lower-' + i, level: 'P3', title: 'P3 ' + names[i] }))) });
  assert.ok(rows.every(row => row.source.level === 'P6'));
  assert.deepEqual(select({ level: '' }), []);
  assert.deepEqual(select({ level: 'P4', bank: bank(8) }), []);
  assert.deepEqual(select({ bank: bank(8).map(row => ({ ...row, difficulty: 2200 })) }), []);
});

test('legacy difficulty cannot let randomized P3 questions displace fresh P6 work', () => {
  const mixed = bank(6).map(row => ({ ...row, difficulty: 1100 })).concat(bank(6).map((row, i) =>
    ({ ...q(i + 6), id: 'lower-' + i, level: 'P3', difficulty: 1200 })));
  let counter = 0;
  const selected = select({ bank: mixed, random: () => 1 - (++counter / 20) });
  assert.equal(selected.length, 5); assert.ok(selected.every(row => row.source.level === 'P6'));
  assert.deepEqual(select({ bank: mixed.filter(row => row.level === 'P3') }), []);
  assert.deepEqual(select({ bank: bank().map(row => ({ ...row, level: 'P5', difficulty: 1060 })) }), [], 'a cold profile cannot be filled with lower-year revision');
});

test('malformed and suspected questions never fill a five-question round', () => {
  assert.deepEqual(select({ bank: bank(8).map(row => ({ ...row, options: ['12', '12'] })) }), []);
  assert.deepEqual(select({ qualityOptions: () => ({ studentFlagged: true }) }), []);
  assert.deepEqual(select({ isReleased: () => false }), []);
  assert.deepEqual(select({ bank: bank(8).map(row => ({ ...row, status: 'draft' })) }), []);
  assert.deepEqual(select({ bank: bank(8).map(row => { const { correctOption, ...rest } = row; return rest; }) }), []);
});

test('recently served questions, aliases and whole story families remain excluded after reopening', () => {
  const first = select(), served = Object.fromEntries(first.map(row => [row.id, 1999999999900]));
  const next = select({ served });
  assert.equal(next.length, 5); assert.ok(next.every(row => !served[row.id]));
  const familyBank = bank(7).map(row => ({ ...row, title: "Peggy's Savings" }));
  assert.deepEqual(select({ bank: familyBank }), []);
  const original = q(0), alias = { ...original, id: 'copied-question', title: 'Different title' };
  assert.deepEqual(select({ bank: [original, alias, ...bank(3).map((row, i) => q(i + 6))] }), []);
});

test('random order changes inside the appropriate cohort', () => {
  let index = 0; const a = select({ random: () => ++index / 20 }).map(row => row.id);
  index = 0; const b = select({ random: () => 1 - (++index / 20) }).map(row => row.id);
  assert.notDeepEqual(a, b);
});

test('block MCQs require one valid private key, preserving option notation', () => {
  const source = { blocks: [{ type: 'mcq', correctId: 'b', options: [{ id: 'a', text: '1/2' }, { id: 'b', text: '3/4' }] }] };
  assert.deepEqual(readHadesMathMcq(source), { options: ['1/2', '3/4'], answer: 1 });
  source.blocks[0].correctId = 'missing'; assert.equal(readHadesMathMcq(source), null);
  assert.equal(readHadesMathMcq({ options: ['1', '2'], correctOption: 9 }), null);
  const mcq = { type: 'mcq', correctId: 'a', options: [{ id: 'a', text: '1/2' }, { id: 'b', text: '3/4' }] };
  assert.equal(readHadesMathMcq({ blocks: [mcq, { ...mcq }] }), null);
  assert.equal(readHadesMathMcq({ ...q(0), blocks: [{ type: 'answerLine' }] }), null);
  assert.equal(readHadesMathMcq({ ...q(0), blocks: [mcq] }), null);
});

test('the shipping integration gates navigation and gameplay independently from student releases', () => {
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const wrapper = fs.readFileSync(new URL('../hades-math-beta.js', import.meta.url), 'utf8');
  assert.match(html, /class="nav-item admin-only" id="navHadesBeta"/);
  assert.match(wrapper, /getUser\(\)\?\.role === 'admin' && !!env.keysAvailable\(\)/);
  assert.match(html, /onAuthStateChanged\(auth, async \(user\) => \{\s+hadesMathBeta.close\(\)/);
  assert.match(html, /function navigateTo\(page\) \{\s+vetPrintPeekHide\(\);\s+hadesMathBeta.close\(\)/);
  assert.doesNotMatch(wrapper, /TCG_QUIZ|_tcgQuizPool|fetch\(|httpsCallable|rpgAwardGameQuestion/);
});
