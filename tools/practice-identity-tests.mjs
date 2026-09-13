import test from 'node:test';
import assert from 'node:assert/strict';
import { practiceContentKey, practiceTitleFamily, buildPracticeCatalog, planPracticeQuestions } from '../practice-variety.js';

const question = (id, content, extra = {}) => ({ id, title: 'Question', topic: 'Algebra', blocks: [{ type: 'text', content }], ...extra });

test('exact identities retain mathematical superscripts, subscripts, case and symbols', () => {
  const variants = ['Find x².', 'Find x2.', 'Find x₂.', 'Find X2.', 'Find 5 m.', 'Find 5 M.',
    'Find ℕ.', 'Find N.', 'Find x<sup>2</sup>.', 'Find x<sub>2</sub>.', 'Find x 2.'];
  assert.equal(new Set(variants.map((value, i) => practiceContentKey(question(String(i), value)))).size, variants.length);
});

test('options, table cells, captions and legacy stems preserve the same distinctions', () => {
  for (const [left, right] of [['x²', 'x2'], ['m', 'M']]) {
    const pairs = [
      [question('a', 'Choose.', { options: [left, '0'] }), question('b', 'Choose.', { options: [right, '0'] })],
      [{ blocks: [{ type: 'table', rows: [['Value'], [left]] }] }, { blocks: [{ type: 'table', rows: [['Value'], [right]] }] }],
      [{ blocks: [{ type: 'table', caption: left, rows: [['1']] }] }, { blocks: [{ type: 'table', caption: right, rows: [['1']] }] }],
      [{ questionText: left }, { questionText: right }]
    ];
    for (const [a, b] of pairs) assert.notEqual(practiceContentKey(a), practiceContentKey(b));
  }
});

test('formatting and canonical Unicode copies retain shared review history', () => {
  const bank = [question('a', '<p>Find café &amp; 5.</p>'), question('copy', ' Find cafe\u0301 & 5. '), question('fresh', 'Find 6.')];
  assert.equal(practiceContentKey(bank[0]), practiceContentKey(bank[1]));
  const now = Date.parse('2026-09-14T12:00:00Z');
  const result = planPracticeQuestions(bank, { bank, now, progress: { a: { nextReviewAt: new Date(now + 86400000).toISOString() } } });
  assert.deepEqual(result.questions.map(q => q.id), ['fresh']);
});

test('title families remain case-insensitive while exact mathematical groups stay separate', () => {
  const a = question('a', 'Find x².', { title: "Peggy’s Savings" });
  const b = question('b', 'Find x2.', { title: "PEGGY'S SAVINGS (variant 2)" });
  assert.equal(practiceTitleFamily(a), practiceTitleFamily(b));
  const catalog = buildPracticeCatalog([a, b]);
  assert.equal(catalog.families.get('a'), catalog.families.get('b'));
  assert.notEqual(catalog.exact.get('a'), catalog.exact.get('b'));
});
