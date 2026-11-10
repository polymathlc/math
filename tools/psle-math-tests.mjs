// 🎓 PSLE Papers — the engine (psle-math.js) and its wiring into index.html.
// node --test tools/psle-math-tests.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as P from '../psle-math.js';

const NOW = Date.parse('2026-11-10T08:00:00Z');
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../psle-math.css', import.meta.url), 'utf8');

// A tiny syllabus lookup in the shape of SYL_LO_BY_ID.
const LOS = {
  'P6.AV.1.1': { subKey: 'AV', topic: 'Area and Circumference of Circle' },
  'P6.AV.2.1': { subKey: 'AV', topic: 'Volume of Cube and Cuboid' },
  'P5.AV.1.1': { subKey: 'AV', topic: 'Area of Triangle' },
  'P6.RS.1.1': { subKey: 'RS', topic: 'Distance, Time and Speed' },
  'P5.RS.1.1': { subKey: 'RS', topic: 'Rate' },
  'P6.FR.1.1': { subKey: 'FR', topic: 'Four Operations' },
  'P6.GEO.1.1': { subKey: 'GEO', topic: 'Special Quadrilaterals' },
  'P6.GEO.2.1': { subKey: 'GEO', topic: 'Nets' },
  'P5.GEO.1.1': { subKey: 'GEO', topic: 'Angles' },
  'P5.DA.1.1': { subKey: 'DA', topic: 'Average of a Set of Data' },
  'P6.DRI.1.1': { subKey: 'DRI', topic: 'Pie Charts' },
};
const loOf = id => LOS[id] || null;
const q = (id, psle, extra = {}) => Object.assign({ id, title: 'Question ' + id, blocks: [], psle }, extra);

test('psleClean keeps only a readable year and paper, and tidies the rest', () => {
  assert.deepEqual(P.psleClean({ year: 2019, paper: 'p2', n: '7', marks: '4' }, NOW), { year: '2019', paper: 'P2', n: 7, marks: 4 });
  assert.equal(P.psleClean({ year: 2019 }, NOW), null, 'no paper → not filed');
  assert.equal(P.psleClean({ paper: 'P1A' }, NOW), null, 'no year → not filed');
  assert.equal(P.psleClean({ year: 2050, paper: 'P1A' }, NOW), null, 'a year from the future is refused');
  assert.equal(P.psleClean({ year: 2019, paper: 'P3' }, NOW), null, 'there is no Paper 3');
  const c = P.psleClean({ year: '2021', paper: 'P1A', n: 99, marks: 40, diff: 'nasty', topic: 'nope', marksGuess: true }, NOW);
  assert.deepEqual(c, { year: '2021', paper: 'P1A' }, 'out-of-range numbers, marks, difficulty and topic are dropped');
  assert.deepEqual(P.psleClean({ year: '2021', paper: 'P2', n: 12, marks: 4, marksGuess: true, diff: 'hard', topic: 'circles' }, NOW),
    { year: '2021', paper: 'P2', n: 12, marks: 4, marksGuess: true, diff: 'hard', topic: 'circles' });
  assert.equal(P.psleClean(null), null);
  assert.equal(P.psleClean('2019'), null);
});

test('labels and slots', () => {
  const m = { year: '2019', paper: 'P1B', n: 21 };
  assert.equal(P.psleLabel(m), 'PSLE 2019 · P1 Booklet B · Q21');
  assert.equal(P.psleLabel(m, { noPsle: true }), '2019 · P1 Booklet B · Q21');
  assert.equal(P.psleSlotKey(m), '2019|P1B|21');
  assert.equal(P.psleLabel(null), '');
});

test('topics are read off the syllabus tags first', () => {
  assert.equal(P.psleTopicFromLo(LOS['P6.AV.1.1']), 'circles');
  assert.equal(P.psleTopicFromLo(LOS['P6.AV.2.1']), 'volume');
  assert.equal(P.psleTopicFromLo(LOS['P5.AV.1.1']), 'area');
  assert.equal(P.psleTopicFromLo(LOS['P6.RS.1.1']), 'speed');
  assert.equal(P.psleTopicFromLo(LOS['P5.RS.1.1']), 'rate');
  assert.equal(P.psleTopicFromLo(LOS['P6.GEO.1.1']), 'shapes');
  assert.equal(P.psleTopicFromLo(LOS['P6.GEO.2.1']), 'solids');
  assert.equal(P.psleTopicFromLo(LOS['P5.GEO.1.1']), 'angles');
  assert.equal(P.psleTopicFromLo(LOS['P5.DA.1.1']), 'average');
  assert.equal(P.psleTopicFromLo(LOS['P6.DRI.1.1']), 'graphs');
  assert.equal(P.psleTopicFromLo(null), '');
  // Two tags agreeing outvote one; the admin's override beats them all.
  assert.equal(P.psleTopicOf(q('a', { year: 2020, paper: 'P2' }, { los: ['P6.FR.1.1', 'P6.AV.1.1', 'P6.AV.1.1'] }), { loOf }), 'circles');
  assert.equal(P.psleTopicOf(q('a', { year: 2020, paper: 'P2', topic: 'ratio' }, { los: ['P6.AV.1.1'] }), { loOf }), 'ratio');
});

test('topics fall back to the question\'s own words, and to Other', () => {
  const t = text => P.psleTopicOf({ id: 'x', title: '', los: [] }, { textOf: () => text });
  assert.equal(t('The figure is made up of a semicircle and a quarter circle. Take π = 3.14.'), 'circles');
  assert.equal(t('What is the ratio of the number of red beads to blue beads?'), 'ratio');
  assert.equal(t('Find the average mass of the 4 parcels.'), 'average');
  assert.equal(t('Car A travelled at a speed of 60 km/h.'), 'speed');
  assert.equal(t('Find ∠x in the figure. ∠ABC = 48°'), 'angles');
  assert.equal(t('The tank is filled with water to a height of 12 cm. Find its volume.'), 'volume');
  assert.equal(t('Figure 1, Figure 2 and Figure 3 continue in this way. How many squares in Figure 20?'), 'patterns');
  assert.equal(t('Express 3k + 5 − k in terms of k.'), 'algebra');
  assert.equal(t('She spent 2/5 of her money and 1/3 of the remainder. What fraction is left?'), 'fractions');
  assert.equal(t('Write down the answer.'), 'other');
});

test('a paper\'s file name is read, canonical or not', () => {
  assert.deepEqual(P.psleParseSource('PSLE-2019-P1A — scan.pdf', NOW), { year: '2019', paper: 'P1A', canonical: true });
  assert.deepEqual(P.psleParseSource('PSLE-2021-ALL — whole.pdf', NOW), { year: '2021', paper: '', canonical: true });
  assert.deepEqual(P.psleParseSource('PSLE 2018 Paper 2.pdf', NOW), { year: '2018', paper: 'P2', canonical: false });
  assert.deepEqual(P.psleParseSource('2017 PSLE Maths Paper 1 Booklet B.pdf', NOW), { year: '2017', paper: 'P1B', canonical: false });
  assert.deepEqual(P.psleParseSource('psle_math_2016_p1.pdf', NOW), { year: '2016', paper: 'P1', canonical: false });
  assert.deepEqual(P.psleParseSource('PSLE 2015 MCQ.pdf', NOW), { year: '2015', paper: 'P1A', canonical: false });
  assert.deepEqual(P.psleParseSource('PSLE 2014 maths.pdf', NOW), { year: '2014', paper: '', canonical: false });
  assert.equal(P.psleParseSource('Nan Hua Prelim 2026 Paper 2.pdf', NOW), null, 'a prelim is not a PSLE');
  assert.equal(P.psleParseSource('PSLE revision.pdf', NOW), null, 'no year, nothing to file');
  assert.equal(P.psleParseSource('', NOW), null);
  const name = P.psleCanonicalFileName('2019', 'p2', 'My scan.pdf');
  assert.equal(name, 'PSLE-2019-P2 — My scan.pdf');
  assert.deepEqual(P.psleParseSource(name, NOW), { year: '2019', paper: 'P2', canonical: true }, 'the importer\'s own name always parses back');
  assert.equal(P.psleCanonicalFileName('2019', 'weird', 'x'), 'PSLE-2019-ALL — x.pdf');
});

test('the paper\'s own question number', () => {
  assert.equal(P.psleQuestionNumber({ sourceQuestionNumber: '14' }), 14);
  assert.equal(P.psleQuestionNumber({ sourceQuestionNumber: 'Q7' }), 7);
  assert.equal(P.psleQuestionNumber({ title: 'Q12 — Shaded area of a figure' }), 12);
  assert.equal(P.psleQuestionNumber({ title: '9. Find the value' }), 9);
  assert.equal(P.psleQuestionNumber({ title: 'PSLE 2019 Paper 2 Q15 — tank' }), 15);
  assert.equal(P.psleQuestionNumber({ title: 'Sharing a sum of money' }), null);
  assert.equal(P.psleQuestionNumber({ title: '2019 results' }), null, 'a year is not a question number');
});

test('marks: printed brackets, words, then the PSLE defaults', () => {
  assert.equal(P.psleMarksFromText('(a) Find x. [1]\n(b) Find y. [2]'), 3);
  assert.equal(P.psleMarksFromText('Find the area. [4]'), 4);
  assert.equal(P.psleMarksFromText('Find the area. (2 marks)'), 2);
  assert.equal(P.psleMarksFromText('In [2016] the total was …'), null, 'a year in brackets is not marks');
  assert.equal(P.psleMarksFromText('[3] [3] [3]'), null, 'nine marks is not one PSLE question');
  assert.equal(P.psleMarksFromText(''), null);
  assert.deepEqual(P.psleDefaultMarks('P1A', 4), { marks: 1, guess: false });
  assert.deepEqual(P.psleDefaultMarks('P1A', 15), { marks: 2, guess: false });
  assert.deepEqual(P.psleDefaultMarks('P1B', 22), { marks: 2, guess: false });
  assert.deepEqual(P.psleDefaultMarks('P2', 3), { marks: 2, guess: false });
  assert.deepEqual(P.psleDefaultMarks('P2', 12), { marks: 4, guess: true });
});

test('the detector files a canonical booklet, and refuses to guess', () => {
  const src = 'PSLE-2019-P2 — paper.pdf';
  const qs = [
    { id: 'a', title: 'Q1 — x', sourcePdf: src, sourceQuestionNumber: '1', sourcePages: [{ page: 2 }] },
    { id: 'b', title: 'Q7 — y', sourcePdf: src, sourceQuestionNumber: '7', sourcePages: [{ page: 4 }], blocks: [{ type: 'text', content: '(a) … [2] (b) … [3]' }] },
    { id: 'c', title: 'no number', sourcePdf: src, sourcePages: [{ page: 5 }] },
    { id: 'd', title: 'already filed', psle: { year: 2019, paper: 'P2', n: 9, marks: 4 } },
    { id: 'e', title: 'clash', sourcePdf: src, sourceQuestionNumber: '9', sourcePages: [{ page: 6 }] },
    { id: 'f', title: 'unrelated', sourcePdf: 'Prelim 2025.pdf', sourceQuestionNumber: '3' },
  ];
  const textOf = x => (x.blocks || []).map(b => b.content).join(' ');
  const out = P.psleDetect(qs, { textOf, now: NOW });
  const by = Object.fromEntries(out.map(p => [p.id, p]));
  assert.deepEqual(Object.keys(by).sort(), ['a', 'b', 'c', 'e']);
  assert.deepEqual(by.a.psle, { year: '2019', paper: 'P2', n: 1, marks: 2 });
  assert.equal(by.a.confidence, 'high');
  assert.equal(by.a.canonical, true);
  assert.equal(by.b.psle.marks, 5, 'printed part marks win over the default');
  assert.equal(by.c.confidence, 'low');
  assert.equal(by.c.psle.n, undefined);
  assert.equal(by.e.conflict, 'd', 'a slot already held is a conflict');
  assert.ok(P.psleAutoFileable(by.a));
  assert.ok(P.psleAutoFileable(by.b));
  assert.ok(!P.psleAutoFileable(by.c), 'never filed without a number');
  assert.ok(!P.psleAutoFileable(by.e), 'never filed over another question');
});

test('the detector sorts a whole sitting into booklets', () => {
  const src = 'PSLE 2018 maths full.pdf';
  const mk = (id, n, page, mcq) => ({ id, title: 'Q' + n + ' — t', sourcePdf: src, sourceQuestionNumber: String(n), sourcePages: [{ page }], options: mcq ? ['1', '2', '3', '4'] : undefined });
  const qs = [mk('a1', 1, 2, true), mk('a2', 2, 2, true), mk('b1', 19, 8, false), mk('b2', 20, 8, false), mk('p1', 1, 12, false), mk('p2', 6, 14, false)];
  const out = P.psleDetect(qs, { now: NOW });
  const by = Object.fromEntries(out.map(p => [p.id, p.psle.paper]));
  assert.deepEqual(by, { a1: 'P1A', a2: 'P1A', b1: 'P1B', b2: 'P1B', p1: 'P2', p2: 'P2' });
  assert.ok(out.every(p => p.confidence === 'medium'), 'a worked-out booklet is medium confidence');
  assert.ok(out.every(p => !p.canonical));
  assert.ok(out.every(P.psleAutoFileable), 'medium with a number and no clash may still be filed on a press');
  const p2 = out.find(p => p.id === 'p2');
  assert.equal(p2.psle.marks, 4); assert.equal(p2.psle.marksGuess, true);
});

test('the detector reads a title when there is no file', () => {
  const out = P.psleDetect([{ id: 't', title: 'PSLE 2020 Paper 1 Booklet B Q23 — ratio' }], { now: NOW });
  assert.equal(out.length, 1);
  assert.deepEqual(out[0].psle, { year: '2020', paper: 'P1B', n: 23, marks: 2 });
});

function bank() {
  return [
    q('19a1', { year: 2019, paper: 'P1A', n: 1, marks: 1 }, { los: ['P6.FR.1.1'] }),
    q('19a2', { year: 2019, paper: 'P1A', n: 2, marks: 1, diff: 'easy' }, { los: ['P6.AV.1.1'] }),
    q('19b20', { year: 2019, paper: 'P1B', n: 20, marks: 2 }, { los: ['P6.RS.1.1'] }),
    q('19p2', { year: 2019, paper: 'P2', n: 2, marks: 2 }, { los: ['P6.AV.1.1'] }),
    q('19p7', { year: 2019, paper: 'P2', n: 7, marks: 4, diff: 'hard' }, { los: ['P6.AV.2.1'] }),
    q('20a1', { year: 2020, paper: 'P1A', n: 1, marks: 1 }, { los: ['P6.FR.1.1'] }),
    q('20p5', { year: 2020, paper: 'P2', n: 5, marks: 2 }, { los: ['P6.AV.1.1'] }),
    q('21p1', { year: 2021, paper: 'P2', n: 1, marks: 2 }, { los: ['P5.DA.1.1'] }),
    q('22a3', { year: 2022, paper: 'P1A', n: 3 }, { los: ['P6.AV.1.1'] }),
    q('plain', null, { los: ['P6.FR.1.1'] }),
  ];
}

test('the index: years newest first, topics in syllabus order, marks counted', () => {
  const ix = P.psleBuildIndex(bank(), { loOf, now: NOW });
  assert.equal(ix.total, 9, 'a question with no psle is not on the page');
  assert.deepEqual(ix.years.map(y => y.year), ['2022', '2021', '2020', '2019']);
  const y19 = ix.years.find(y => y.year === '2019');
  assert.equal(y19.count, 5);
  assert.equal(y19.marks, 10);
  assert.deepEqual(y19.papers.P1A, { count: 2, marks: 2 });
  assert.equal(ix.byId.get('22a3').marks, 1, 'a missing mark takes the paper default');
  assert.deepEqual(ix.topics.map(t => t.key), ['fractions', 'speed', 'circles', 'volume', 'average']);
  assert.equal(ix.topics.find(t => t.key === 'circles').count, 4);
  assert.equal(ix.marks, 16);
});

test('entries for a year, a paper, a topic — always in paper order', () => {
  const ix = P.psleBuildIndex(bank(), { loOf, now: NOW });
  assert.deepEqual(P.psleEntriesFor(ix, { year: 2019 }).map(e => e.id), ['19a1', '19a2', '19b20', '19p2', '19p7']);
  assert.deepEqual(P.psleEntriesFor(ix, { year: 2019, paper: 'P1' }).map(e => e.id), ['19a1', '19a2', '19b20']);
  assert.deepEqual(P.psleEntriesFor(ix, { year: 2019, paper: 'P2' }).map(e => e.id), ['19p2', '19p7']);
  assert.deepEqual(P.psleEntriesFor(ix, { topic: 'circles' }).map(e => e.id), ['19a2', '19p2', '20p5', '22a3']);
  assert.deepEqual(P.psleEntriesFor(ix, { topic: 'circles', year: '2020' }).map(e => e.id), ['20p5']);
  assert.deepEqual(P.psleEntriesFor(ix, { year: 2019, diff: 'hard' }).map(e => e.id), ['19p7']);
  const groups = P.psleTopicGroups(ix);
  assert.deepEqual(groups.map(g => g.name), ['Number and Algebra', 'Measurement and Geometry', 'Statistics']);
});

test('gaps name the missing numbers and the doubled ones', () => {
  const qs = bank().concat([q('19a4', { year: 2019, paper: 'P1A', n: 4 }), q('19p7b', { year: 2019, paper: 'P2', n: 7 })]);
  const g = P.psleGaps(P.psleBuildIndex(qs, { loOf, now: NOW }), '2019');
  assert.deepEqual(g.P1A, { missing: [3], dupes: [] });
  assert.deepEqual(g.P1B, { missing: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19].filter(n => n > 4), dupes: [] }, 'Booklet B starts after Booklet A');
  assert.deepEqual(g.P2.dupes, [7]);
  assert.deepEqual(g.P2.missing, [1, 3, 4, 5, 6]);
});

test('trends: shares per year, staples, and what is rising', () => {
  const ix = P.psleBuildIndex(bank(), { loOf, now: NOW });
  const tr = P.psleTrends(ix);
  assert.deepEqual(tr.years, ['2019', '2020', '2021', '2022']);
  const circles = tr.rows.find(r => r.key === 'circles');
  assert.equal(circles.cells.find(c => c.year === '2022').share, 1, 'the only question in 2022 is a circle');
  assert.equal(circles.cells.find(c => c.year === '2021').marks, 0);
  assert.equal(tr.rows[0].key, 'circles', 'the topic carrying the most marks is first');
  assert.ok(tr.maxShare > 0 && tr.maxShare <= 1);
  assert.ok(Array.isArray(tr.hot) && Array.isArray(tr.cooling) && Array.isArray(tr.staples));
});

test('print plan: one sitting keeps its numbers, a mixed set is renumbered', () => {
  const ix = P.psleBuildIndex(bank(), { loOf, now: NOW });
  const one = P.pslePrintPlan(P.psleEntriesFor(ix, { year: 2019 }));
  assert.equal(one.keepNumbers, true);
  assert.deepEqual(one.groups.map(g => g.book), ['a', 'b', 'p2']);
  assert.equal(one.numbers['19b20'], 20);
  assert.equal(one.numbers['19p7'], 7);
  assert.equal(one.allocations['19p7'], 4);
  assert.equal(one.totals.marks, 10);
  const mixed = P.pslePrintPlan(P.psleEntriesFor(ix, { topic: 'circles' }));
  assert.equal(mixed.keepNumbers, false);
  assert.deepEqual(mixed.list.map(x => x.id), ['19a2', '19p2', '20p5', '22a3']);
  // P1 questions 1, 2; Paper 2 restarts at 1.
  assert.deepEqual([mixed.numbers['19a2'], mixed.numbers['22a3'], mixed.numbers['19p2'], mixed.numbers['20p5']], [1, 2, 1, 2]);
});

test('the exam clock', () => {
  const e = (paper, marks, year = '2019') => ({ meta: { year, paper }, marks });
  const p1 = Array.from({ length: 30 }, (_, i) => e(i < 18 ? 'P1A' : 'P1B', i < 10 ? 1 : 2));
  assert.equal(P.psleExamMinutes(p1), 60, 'a whole Paper 1 is the real hour');
  const p2 = Array.from({ length: 15 }, () => e('P2', 4));
  assert.equal(P.psleExamMinutes(p2), 90);
  assert.equal(P.psleExamMinutes(p1.concat(p2)), 150);
  assert.equal(P.psleExamMinutes([e('P2', 4), e('P2', 4)]), 12, 'a set is a minute and a half a mark');
  assert.equal(P.psleExamMinutes([e('P1A', 1)]), 10, 'never less than ten minutes');
  assert.equal(P.psleExamMinutes([]), 0);
  assert.equal(P.psleFormatClock(65000), '1:05');
  assert.equal(P.psleFormatClock(3725000), '1:02:05');
  assert.equal(P.psleFormatClock(-5), '0:00');
  let t = { startedAt: 1000, minutes: 10, pausedMs: 0 };
  assert.equal(P.psleTimerRemaining(t, 61000), 540000);
  t = P.psleTimerPause(t, 61000);
  assert.equal(P.psleTimerRemaining(t, 999999), 540000, 'a paused clock does not move');
  t = P.psleTimerResume(t, 121000);
  assert.equal(t.pausedAt, undefined);
  assert.equal(P.psleTimerRemaining(t, 181000), 480000, 'the paused minute is given back');
  assert.ok(P.psleTimerValid(t));
  assert.ok(!P.psleTimerValid({ startedAt: 1, minutes: 0 }));
  assert.ok(!P.psleTimerValid(null));
});

test('progress: the best attempt counts', () => {
  const p = P.psleProgress([
    { questionId: '19a1', verdict: 'incorrect', credit: 0 },
    { questionId: '19a1', verdict: 'correct' },
    { questionId: '19p7', marks: 2, outOf: 4 },
    { questionId: '20a1', credit: 0 },
    { questionId: '', credit: 1 },
  ]);
  assert.equal(p['19a1'].status, 'right');
  assert.equal(p['19a1'].tries, 2);
  assert.equal(p['19p7'].status, 'part');
  assert.equal(p['20a1'].status, 'wrong');
  const ix = P.psleBuildIndex(bank(), { loOf, now: NOW });
  const s = P.psleProgressSummary(P.psleEntriesFor(ix, { year: 2019 }), p);
  assert.equal(s.total, 5); assert.equal(s.done, 2); assert.equal(s.right, 1);
  assert.equal(s.pctDone, 40);
  assert.equal(s.score, 60, '(1×1 + 0.5×4) / 5 marks');
  const w = P.psleWeakTopics(ix, Object.assign({}, p, { '20p5': { tries: 1, best: 0, status: 'wrong' }, '19p2': { tries: 1, best: 0, status: 'wrong' } }), 2);
  assert.deepEqual(w.weak.map(t => t.key), ['circles', 'fractions'], 'two wrong circles questions is the weakest topic; half the fractions next');
  assert.ok(w.untried.some(t => t.key === 'average'));
  assert.equal(P.psleAttemptCredit({ verdict: 'partial' }), 0.5);
  assert.equal(P.psleAttemptCredit({}), null);
});

test('search needs every word', () => {
  const ix = P.psleBuildIndex(bank(), { loOf, now: NOW });
  assert.deepEqual(P.psleSearch(ix.entries, '2019 p2').map(e => e.id), ['19p2', '19p7']);
  assert.deepEqual(P.psleSearch(ix.entries, 'circles 2020').map(e => e.id), ['20p5']);
  assert.deepEqual(P.psleSearch(ix.entries, 'q7 hard').map(e => e.id), ['19p7']);
  assert.equal(P.psleSearch(ix.entries, '').length, 9);
  assert.equal(P.psleSearch(ix.entries, 'nothing-like-this').length, 0);
});

test('the edit form refuses a taken slot and bad numbers', () => {
  const others = bank();
  assert.equal(P.psleEditValidate({ year: '', paper: 'P2', n: 1, marks: 2 }, { now: NOW }).ok, false);
  assert.equal(P.psleEditValidate({ year: 2019, paper: 'X', n: 1, marks: 2 }, { now: NOW }).ok, false);
  assert.equal(P.psleEditValidate({ year: 2019, paper: 'P2', n: 0, marks: 2 }, { now: NOW }).ok, false);
  assert.equal(P.psleEditValidate({ year: 2019, paper: 'P2', n: 3, marks: 9 }, { now: NOW }).ok, false);
  const clash = P.psleEditValidate({ year: 2019, paper: 'P2', n: 7, marks: 4 }, { id: 'new', others, now: NOW });
  assert.equal(clash.ok, false); assert.equal(clash.clash, '19p7');
  const self = P.psleEditValidate({ year: 2019, paper: 'P2', n: 7, marks: 5, diff: 'hard' }, { id: '19p7', others, now: NOW });
  assert.equal(self.ok, true, 'a question may keep its own slot');
  assert.deepEqual(self.meta, { year: '2019', paper: 'P2', n: 7, marks: 5, diff: 'hard' });
});

test('deep links round-trip', () => {
  const cases = [
    ['#psle', { view: 'home' }], ['#psle/2019', { view: 'year', year: '2019', paper: '' }],
    ['#psle/2019/p2', { view: 'year', year: '2019', paper: 'P2' }], ['#psle/2019/p1', { view: 'year', year: '2019', paper: 'P1' }],
    ['#psle/topic/circles', { view: 'topic', topic: 'circles' }], ['#psle/trends', { view: 'trends' }],
  ];
  for (const [h, sel] of cases) {
    assert.deepEqual(P.psleParseHash(h), sel, h);
    assert.equal(P.psleHash(sel).toLowerCase(), h.toLowerCase(), 'back to ' + h);
  }
  assert.equal(P.psleParseHash('#practice'), null);
  assert.equal(P.psleParseHash(''), null);
  assert.deepEqual(P.psleParseHash('#psle/topic/nonsense'), { view: 'home' });
  assert.deepEqual(P.psleYearOptions(NOW).slice(0, 2), ['2026', '2025']);
  assert.equal(P.psleYearOptions(NOW).at(-1), String(P.PSLE_FIRST_YEAR));
});

// ---------------------------------------------------------------------------
// The wiring. These are the places a later edit most easily breaks silently.
// ---------------------------------------------------------------------------
test('index.html imports the engine and links the stylesheet', () => {
  assert.match(html, /from "\.\/psle-math\.js\?v=\d+"/);
  assert.match(html, /<link rel="stylesheet" href="psle-math\.css\?v=\d+">/);
  const imported = html.match(/import \{([^}]*)\} from "\.\/psle-math\.js/)[1].split(',').map(s => s.trim()).filter(Boolean);
  for (const name of imported) assert.ok(name in P, 'psle-math.js exports ' + name);
});

test('the nav item, the page and the title are in place', () => {
  assert.match(html, /<div class="nav-item" data-page="psle"[^>]*><span class="ico">🎓<\/span> PSLE Papers<\/div>/);
  assert.ok(!/class="nav-item admin-only" data-page="psle"/.test(html), 'every pupil sees it');
  assert.match(html, /<div class="page" id="page-psle">/);
  assert.match(html, /psle: "PSLE Papers" \}/);
  assert.match(html, /psleOnNavigate\(page\);/);
});

test('the overlays and the exam clock sit at the top level of <body>', () => {
  // A div appended inside an unclosed overlay is invisible forever (the
  // subject-switcher bug). Walk the markup and check the depth of each id.
  const body = html.slice(html.indexOf('<body'), html.indexOf('<script type="module">'));
  const ids = ['psleOverlay', 'psleEditOverlay', 'psleFileOverlay', 'psleTimer'];
  const depthOf = {};
  let depth = 0;
  const re = /<(\/?)div\b([^>]*)>/g;
  let m;
  while ((m = re.exec(body))) {
    if (m[1]) { depth--; continue; }
    const id = (m[2].match(/\bid="([^"]+)"/) || [])[1];
    if (id && ids.includes(id)) depthOf[id] = depth;
    if (!/\/\s*$/.test(m[2])) depth++;
  }
  for (const id of ids) assert.equal(depthOf[id], 0, id + ' must be a direct child of <body>');
});

test('the editor carries psle through a save, and vetting shows it', () => {
  assert.match(html, /const psleCarry = existing\.psle \|\| \(currentEditingId \? \(\(vettingList \|\| \[\]\)\.find\(v => v\.id === currentEditingId\) \|\| \{\}\)\.psle : null\);/);
  assert.match(html, /if \(psleClean\(psleCarry\)\) q\.psle = psleClean\(psleCarry\);/);
  assert.match(html, /\$\{scanBadge\}\$\{psleVetBadge\(q\)\}/);
  assert.match(html, /if \(typeof psleAfterRapid === "function"\) \{ try \{ psleAfterRapid\(questions\); \}/);
  assert.equal((html.match(/psleRouteFromHash\(\);   \/\/ 🎓 a #psle link survives sign-in/g) || []).length, 2, 'admins and pupils both arrive by #psle links');
});

test('psle is written as a MERGE on the public half, never a whole-question save', () => {
  const block = html.slice(html.indexOf('// 🎓 PSLE MATH — THE PAPERS PAGE'), html.indexOf('// 🎓 END PSLE MATH'));
  assert.ok(block.length > 1000, 'the block is there');
  assert.match(block, /setDoc\(doc\(db, "users", _bankOwnerOrThrow\(\), "mathQuestions", q\.id\), \{ psle: clean \|\| deleteField\(\) \}, \{ merge: true \}\)/);
  assert.ok(!/saveQuestionDoc\(/.test(block), 'the page never re-saves a whole question');
  assert.ok(!/settings", "paperData"|'paperData'|"paperData"/.test(block), 'the Science app\'s paperData document is never touched');
  assert.match(block, /startRapidJob\(file, "P6", \{ release: "" \}\)/, 'papers go through Rapid add\'s one door');
  // The exam printer's meta is borrowed and ALWAYS put back.
  assert.match(block, /const saved = cpbMeta;/);
  assert.match(block, /finally \{ cpbMeta = saved; \}/);
});

test('the stylesheet covers every class the page draws', () => {
  const block = html.slice(html.indexOf('// 🎓 PSLE MATH — THE PAPERS PAGE'), html.indexOf('// 🎓 END PSLE MATH'));
  const classes = new Set([...block.matchAll(/class="([^"$]*)"/g)].flatMap(m => m[1].split(/\s+/)).filter(c => /^psle-/.test(c)));
  const missing = [...classes].filter(c => !css.includes('.' + c));
  assert.deepEqual(missing, [], 'every psle- class has a rule');
  assert.match(css, /@media \(max-width: 680px\)/, 'phones are designed for');
  assert.match(css, /\.psle-timer\[hidden\] \{ display: none; \}/);
});

test('APP_VERSION was bumped for this feature', () => {
  const v = html.match(/const APP_VERSION = "v(\d+)\.(\d+)\.(\d+)/);
  assert.ok(v && (Number(v[1]) > 1 || Number(v[2]) >= 113), 'v1.113.0 or later');
});
