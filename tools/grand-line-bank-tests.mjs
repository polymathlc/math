import test from 'node:test';
import assert from 'node:assert/strict';
import { selectGrandLineMathBankRound } from '../grand-line-math-bank.js';
import { selectHadesMathBankRound } from '../hades-math-bank.js';
import { createGrandLineMathAdapter } from '../grand-line-math-adapter.js';
const names = ['Orchid garden', 'Harbour voyage', 'Maple trees', 'Lantern festival', 'Amber staircase', 'Emerald mosaic', 'Saffron kitchen', 'Crystal palace', 'Willow park', 'Copper necklace', 'Silver orchard', 'Coral reef'];
const q = (i, extra = {}) => ({ id: 'bank-' + i, title: names[i % names.length], level: 'P6', topic: 'Fractions',
  blocks: [{ type: 'text', content: `Find the result of ${i + 20}/4 + 3/4.` }],
  options: [i + 23, i + 24, i + 25, i + 26].map(value => value + '/4'), correctOption: 0, ...extra });
const bank = (count = 12) => Array.from({ length: count }, (_, i) => q(i));
const renderBlocks = question => question.blocks.map(block => block.content || '').join('');
const options = { bank: bank(), uid: 'student:child:P6', level: 'P6', now: 2000000000000, random: () => 0.5, renderBlocks };
const select = extra => selectGrandLineMathBankRound({ ...options, ...extra });
test('three actual bank records suffice while Hades retains its five-question contract', () => {
  assert.equal(select({ bank: bank(3) }).length, 3); assert.deepEqual(select({ bank: bank(2) }), []);
  assert.deepEqual(select({ bank: [] }), []); assert.deepEqual(selectHadesMathBankRound({ ...options, bank: bank(3) }), []);
  const rows = select(); assert.equal(new Set(rows.map(row => row.id)).size, 3); assert.ok(rows.every(row => row.source === options.bank.find(q => q.id === row.id)));
});
test('current school level, mastery, quality, release and private-key policies remain enforced', () => {
  const mixed = bank(6).concat(bank(6).map((row, i) => ({ ...row, id: 'low-' + i, level: 'P3' })));
  assert.ok(select({ bank: mixed }).every(row => row.source.level === 'P6'));
  for (const extra of [{ level: '' }, { level: 'P4' }, { bank: bank().map(q => ({ ...q, difficulty: 2200 })) },
    { bank: bank().map(q => ({ ...q, level: 'P5' })) }, { qualityOptions: () => ({ studentFlagged: true }) },
    { isReleased: () => false }, { bank: bank().map(q => ({ ...q, status: 'draft' })) },
    { bank: bank().map(q => ({ ...q, options: ['same', 'same'] })) }]) assert.deepEqual(select(extra), []);
  const rows = select({ remote: true, bank: bank().map(({ correctOption, ...row }) => row) });
  assert.equal(rows.length, 3); assert.ok(rows.every(row => row.grading === 'remote' && row.answer === null));
});
test('served records, aliases and whole story families stay excluded across modes', () => {
  const first = select(), served = Object.fromEntries(first.map(row => [row.id, options.now - 100]));
  assert.ok(select({ served }).every(row => !served[row.id]));
  assert.deepEqual(select({ bank: bank().map(row => ({ ...row, title: "Peggy's Savings" })) }), []);
  const a = q(0); assert.deepEqual(select({ bank: [a, { ...a, id: 'copy', title: 'Different title' }, q(1)] }), []);
});
function adapterFixture() {
  const storage = new Map(), served = {}, marks = [], awards = [], ctx = { identity: 'math:a:child-a:P6', profileKey: 'p-a', level: 'P6', admin: false };
  const env = { getBank: () => bank(), getProgress: () => ({}), getProfile: () => ({}), getServed: () => served,
    getSyllabus: () => ({}), isReleased: () => true, qualityOptions: () => ({}), renderBlocks, renderOption: s => s,
    awardPoints: (...args) => awards.push(args),
    storage: { getItem: k => storage.get(k), setItem: (k, v) => storage.set(k, v) }, markShown: q => { marks.push(q.id); served[q.id] = Date.now(); } };
  return { storage, served, marks, awards, ctx, env, adapter: createGrandLineMathAdapter(env) };
}
test('adapter shares only student reservations and persists deduped results per learner', () => {
  const f = adapterFixture(), rows = f.adapter.getQuestions(f.ctx); assert.equal(rows.length, 3);
  rows.forEach(row => f.adapter.markShown(row, f.ctx)); assert.deepEqual(f.marks, rows.map(q => q.id));
  const result = { question: rows[0], correct: true, round: 1, sessionId: 's' };
  f.adapter.recordAnswer(result, f.ctx); f.adapter.recordAnswer(result, f.ctx);
  assert.equal(f.awards.length, 1, 'the normal game-points award is called once, after parent grading');
  const data = JSON.parse(f.storage.get('grandLineMathV1:p-a')); assert.equal(data.progress[rows[0].id].attempts, 1);
  const next = createGrandLineMathAdapter(f.env).getQuestions(f.ctx); assert.ok(next.every(row => !f.served[row.id]));
  const sibling = { ...f.ctx, identity: 'math:a:child-b:P6', profileKey: 'p-b' };
  f.adapter.recordAnswer(result, sibling); assert.ok(f.storage.has('grandLineMathV1:p-b'));
  const preview = { ...f.ctx, identity: 'admin:P6', profileKey: 'preview', admin: true };
  f.adapter.markShown(rows[0], preview); assert.equal(f.marks.length, 3, 'preview does not reserve the student bank');
});
test('unavailable diagrams are excluded until authored question content changes', () => {
  const f = adapterFixture(), row = f.adapter.getQuestions(f.ctx)[0]; f.adapter.onQuestionUnavailable(row);
  assert.ok(f.adapter.getQuestions(f.ctx).every(q => q.id !== row.id));
});

test('student rounds await account history and atomically reserve a fresh replacement after another tab wins', async () => {
  const f = adapterFixture(); let ready = false, claims = 0, conflicted = [];
  f.env.historyReady = async () => ready;
  f.env.hasSeen = q => !!f.served[q.id];
  f.env.isCurrent = () => true;
  f.env.claimQuestions = async rows => {
    claims++;
    if (claims === 1) { conflicted = rows.map(q => q.id); rows.forEach(q => { f.served[q.id] = Date.now(); }); return false; }
    rows.forEach(q => { f.served[q.id] = Date.now(); }); return true;
  };
  const adapter = createGrandLineMathAdapter(f.env);
  assert.deepEqual(await adapter.getQuestions(f.ctx), []); assert.equal(claims, 0);
  ready = true;
  const rows = await adapter.getQuestions(f.ctx);
  assert.equal(rows.length, 3); assert.equal(claims, 2);
  assert.ok(rows.every(q => !conflicted.includes(q.id) && f.served[q.id]));
  f.env.isCurrent = () => false;
  assert.deepEqual(await adapter.getQuestions(f.ctx), []); assert.equal(claims, 2);
});
