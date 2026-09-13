import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as mastery from '../practice-mastery.js';
import * as quality from '../practice-quality.js';
import {
  PRACTICE_FAMILY_COOLDOWN_MS, practiceContentKey, practiceTitleFamily,
  buildPracticeCatalog, createPracticeRun, recordPracticeServed, planPracticeQuestions
} from '../practice-variety.js';

const NOW = Date.parse('2026-09-14T03:00:00Z');
const iso = time => new Date(time).toISOString();
const q = (id, content = `Calculate ${id}.`, extra = {}) => ({
  id, title: 'Question', level: 'P4', topic: 'Percentage', blocks: [{ type: 'text', content }], ...extra
});
const ids = plan => plan.questions.map(item => item.id);
const plan = (bank, options = {}) => planPracticeQuestions(bank, { now: NOW, uid: 'student-a', ...options });

test('ten Peggy variants produce one representative followed by other stories', () => {
  const bank = Array.from({ length: 10 }, (_, i) => q(`p${i}`, `Peggy saves ${i + 10} dollars.`, {
    title: "Peggy's Savings", variantOf: 'peggy-original'
  })).concat(q('colin', 'Colin has 40 badges.', { title: "Colin's Collection" }), q('geometry'));
  assert.deepEqual(ids(plan(bank)), ['p0', 'colin', 'geometry']);
  assert.equal(bank.length, 12, 'selection never deletes bank records');
});

test('distinctive unlinked story titles space legacy numerical variants', () => {
  const bank = [q('a', 'Save 20 dollars.', { title: 'Peggy’s Savings' }),
    q('b', 'Save 30 dollars.', { title: "Peggy's Savings (variant 2)" }), q('other')];
  assert.deepEqual(ids(plan(bank)), ['a', 'other']);
  assert.notEqual(practiceContentKey(bank[0]), practiceContentKey(bank[1]));
});

test('generic question, percentage and worksheet titles never collapse a pool', () => {
  for (const title of ['Question 1', 'Percentage', 'Percentage word problems', 'Math practice P5', 'Addition of Fractions']) {
    assert.equal(practiceTitleFamily(q('a', '', { title })), '', title);
    const bank = [q('a', 'Calculate 2 + 3.', { title }), q('b', 'Calculate 4 + 5.', { title })];
    assert.deepEqual(ids(plan(bank)), ['a', 'b'], title);
  }
});

test('same title in different topics does not imply the same family', () => {
  const bank = [q('a', 'Find the total saved.', { title: "Peggy's Savings", topic: 'Percentage' }),
    q('b', 'Find the ratio saved.', { title: "Peggy's Savings", topic: 'Ratio' })];
  assert.deepEqual(ids(plan(bank)), ['a', 'b']);
});

test('variant chains, missing roots and cycles resolve to one stable family', () => {
  const bank = [q('a', '1', { variantOf: 'missing' }), q('b', '2', { variantOf: 'a' }),
    q('c', '3', { variantOf: 'd' }), q('d', '4', { variantOf: 'c' })];
  const catalog = buildPracticeCatalog(bank);
  assert.equal(catalog.families.get('a'), catalog.families.get('b'));
  assert.equal(catalog.families.get('a'), catalog.families.get('missing'));
  assert.equal(catalog.families.get('c'), catalog.families.get('d'));
  assert.deepEqual(ids(plan(bank)), ['a', 'c']);
});

test('exact copies with unrelated ids and titles share their scheduled review', () => {
  const bank = [q('first', '<p>Find 25% of 80.</p>', { title: 'Original story' }),
    q('copy', ' Find 25% of 80. ', { title: 'Renamed duplicate' }), q('fresh')];
  const progress = { first: { lastAttemptAt: iso(NOW), nextReviewAt: iso(NOW + 86400000), lastVerdict: 'correct' } };
  assert.deepEqual(ids(plan(bank, { progress })), ['fresh']);
  assert.equal(plan(bank, { progress }).blocked.find(item => item.id === 'copy').reason, 'review-not-due');
});

test('normalization preserves different numbers, operations, units and MCQ options', () => {
  const variants = [q('a', 'Find 25% of 80.'), q('b', 'Find 25% of 90.'),
    q('c', 'Find 25 + 80.'), q('d', 'Find 25 - 80.'), q('e', 'Find 25 m.'), q('f', 'Find 25 cm.'),
    q('g', 'Pick the answer.', { options: ['12', '13'] }), q('h', 'Pick the answer.', { options: ['12', '14'] }),
    q('i', 'Pick the answer.', { options: ['13', '12'] }), q('j', 'Find x < 5.'), q('k', 'Find x < 6.')];
  assert.equal(new Set(variants.map(practiceContentKey)).size, variants.length);
  assert.equal(plan(variants).questions.length, variants.length);
});

test('diagrams, tables and annotation tasks distinguish source content', () => {
  const image = (id, url, annotate = false) => ({ id, blocks: [{ type: 'image', url, annotate }] });
  assert.notEqual(practiceContentKey(image('a', '/apple.png')), practiceContentKey(image('b', '/pear.png')));
  assert.notEqual(practiceContentKey(image('a', '/apple.png')), practiceContentKey(image('b', '/apple.png', true)));
  assert.equal(practiceContentKey(image('a', '/apple.png')), practiceContentKey(image('other-id', '/apple.png')));
  const table = (id, n) => ({ id, blocks: [{ type: 'table', rows: [['Day', 'Amount'], ['Monday', n]] }] });
  assert.notEqual(practiceContentKey(table('a', '12')), practiceContentKey(table('b', '13')));
  assert.equal(practiceContentKey(table('a', '12')), practiceContentKey(table('b', '12')));
});

test('inequalities and inline rich-text pictures remain part of exact identity', () => {
  assert.notEqual(practiceContentKey(q('a', 'Find x<y and z>4.')), practiceContentKey(q('b', 'Find x<a and z>4.')));
  assert.notEqual(practiceContentKey(q('a', 'Find x<b and z>4.')), practiceContentKey(q('b', 'Find x<a and z>4.')));
  assert.notEqual(practiceContentKey(q('a', '<p>Count <img src="/Apple.png"></p>')),
    practiceContentKey(q('b', '<p>Count <img src="/apple.png"></p>')));
  assert.notEqual(practiceContentKey(q('a', '<p>Count <img src="/apple.png"></p>')),
    practiceContentKey(q('b', '<p>Count <img src="/pear.png"></p>')));
  assert.notEqual(practiceContentKey(q('a', 'Pick.', { options: [{ text: '12' }, { text: '13' }] })),
    practiceContentKey(q('b', 'Pick.', { options: [{ text: '12' }, { text: '14' }] })));
});

test('empty or image-placeholder questions are not presumed identical', () => {
  const bank = [{ id: 'a', title: 'Question', blocks: [] }, { id: 'b', title: 'Question', blocks: [] }];
  assert.equal(practiceContentKey(bank[0]), '');
  assert.deepEqual(ids(plan(bank)), ['a', 'b']);
});

test('future reviews stay deferred despite historical mistakes or mastery', () => {
  const bank = [q('partial'), q('correct'), q('fresh')];
  const progress = {
    partial: { wrongCount: 8, lastAttemptAt: iso(NOW), nextReviewAt: iso(NOW + 7200000), lastVerdict: 'partial' },
    correct: { wrongCount: 8, correctStreak: 4, lastAttemptAt: iso(NOW), nextReviewAt: iso(NOW + 86400000), lastVerdict: 'correct' }
  };
  assert.deepEqual(ids(plan(bank, { progress })), ['fresh']);
  assert.deepEqual(ids(plan(bank, { progress: structuredClone(progress), run: createPracticeRun('student-a') })), ['fresh']);
});

test('due reviews re-enter after the review date and family cooldown expire', () => {
  const bank = [q('review'), q('fresh')];
  const progress = { review: { lastAttemptAt: iso(NOW - 3600000), nextReviewAt: iso(NOW - 1) } };
  assert.deepEqual(ids(plan(bank, { progress })), ['review', 'fresh']);
});

test('numerical variants wait fifteen minutes but not the original whole review interval', () => {
  const bank = [q('original', 'Save 20 dollars.', { variantOf: 'root' }), q('variant', 'Save 30 dollars.', { variantOf: 'root' })];
  const progress = { original: { lastAttemptAt: iso(NOW), nextReviewAt: iso(NOW + 86400000) } };
  assert.deepEqual(ids(plan(bank, { progress })), []);
  assert.deepEqual(ids(plan(bank, { progress, now: NOW + PRACTICE_FAMILY_COOLDOWN_MS })), ['variant']);
});

test('progress for a missing original still protects its variants', () => {
  const bank = [q('variant', 'Save 30 dollars.', { variantOf: 'removed-original' })];
  const progress = { 'removed-original': { lastAttemptAt: iso(NOW) } };
  assert.deepEqual(ids(plan(bank, { progress })), []);
});

test('tiny and fully filtered pools finish without forced repeats', () => {
  const only = q('only', 'Find 25% of 80.', { hasVideoExplanation: true });
  const run = recordPracticeServed(createPracticeRun('student-a'), only, NOW);
  assert.deepEqual(ids(plan([only], { run })), []);
  assert.deepEqual(ids(plan([only, q('no-video')], { run, videoOnly: true })), []);
  assert.deepEqual(ids(plan([q('no-video')], { videoOnly: true })), []);
});

test('a served question or exact copy cannot cycle back later in the same run', () => {
  const bank = [q('a', 'Find 25% of 80.'), q('copy', 'Find 25% of 80.'), q('b')];
  const run = recordPracticeServed(createPracticeRun('student-a'), bank[0], NOW - 3600000);
  assert.deepEqual(ids(plan(bank, { run })), ['b']);
  assert.equal(recordPracticeServed(run, bank[0], NOW), run, 'rerender does not append another serving');
});

test('adaptive candidates obey recent family, served history and video filtering', () => {
  const bank = [q('current', 'A'), q('prerequisite', 'B', { hasVideoExplanation: true }),
    q('variant', 'C', { variantOf: 'current', hasVideoExplanation: true }), q('no-video', 'D')];
  let run = recordPracticeServed(createPracticeRun('student-a'), bank[1], NOW);
  run = recordPracticeServed(run, bank[0], NOW);
  const cands = [bank[1], bank[2], bank[3]];
  assert.deepEqual(ids(planPracticeQuestions(cands, { bank, run, uid: 'student-a', now: NOW, videoOnly: true })), []);
});

test('different students never share served history', () => {
  const bank = [q('a'), q('b')];
  const run = recordPracticeServed(createPracticeRun('student-a'), bank[0], NOW);
  assert.deepEqual(ids(plan(bank, { run, uid: 'student-b' })), ['a', 'b']);
  const switched = recordPracticeServed(run, bank[1], NOW, 'student-b');
  assert.equal(switched.uid, 'student-b');
  assert.deepEqual(switched.served.map(item => item.id), ['b']);
});

test('explicit worksheets and direct retries retain supplied order without scheduling changes', () => {
  const bank = [q('a', 'Save 20.', { variantOf: 'root' }), q('b', 'Save 30.', { variantOf: 'root' })];
  const run = recordPracticeServed(createPracticeRun('student-a'), bank[0], NOW);
  const progress = { b: { lastAttemptAt: iso(NOW), nextReviewAt: iso(NOW + 86400000) } };
  assert.deepEqual(ids(planPracticeQuestions([bank[1], bank[0]], { bank, run, progress, uid: 'student-a', now: NOW, manual: true })), ['b', 'a']);
});

test('planner preserves priority among eligible families and never mutates input or progress', () => {
  const bank = [q('due'), q('deferred'), q('growth')];
  const progress = { deferred: { nextReviewAt: iso(NOW + 7200000) } };
  const before = JSON.stringify({ bank, progress });
  assert.deepEqual(ids(plan(bank, { progress, limit: 2 })), ['due', 'growth']);
  assert.equal(JSON.stringify({ bank, progress }), before);
});

test('Firestore-style timestamps and corrupt history are handled without an empty accidental lockout', () => {
  const bank = [q('a'), q('b')];
  const progress = { a: { lastAttemptAt: { seconds: NOW / 1000 }, nextReviewAt: { seconds: (NOW + 3600000) / 1000 } }, b: null, junk: 'bad' };
  assert.deepEqual(ids(plan(bank, { progress })), ['b']);
});

// Exercise the real selectors and navigation, not a reimplementation of the
// integration. The boundary stubs are rendering, storage and rating services.
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
  const start = html.indexOf(from), end = html.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `Production section exists: ${from}`);
  return html.slice(start, end);
};
function navigationFixture(bank, progress = {}) {
  const elements = new Map(), noop = () => {};
  const el = id => {
    if (!elements.has(id)) elements.set(id, { id, style: {}, value: '', disabled: false, textContent: '', innerHTML: '',
      classList: { add: noop, remove: noop, toggle: noop }, addEventListener: noop, querySelectorAll: () => [] });
    return elements.get(id);
  };
  const c = vm.createContext({
    ...mastery, ...quality,
    Date, Set, Map, PRACTICE_FAMILY_COOLDOWN_MS, buildPracticeCatalog, createPracticeRun,
    recordPracticeServed, planPracticeQuestions, currentUser: { uid: 'student-a', role: 'student' },
    questionBank: bank.slice(), studentProgress: progress, studentLearningProfile: {}, qIndex: 0,
    _practiceRun: createPracticeRun('student-a'), _practiceManual: false, _practiceExhausted: false,
    _practiceCatalogBank: null, _practiceCatalogLength: -1, _practiceCatalogValue: null,
    _practiceViewEpoch: 0, _practiceMcqRevising: false,
    studentLevel: 'P4', _practiceEmptyReason: 'round',
    _studentFeedRevision: 0, _studentFeedContextCache: null, _studentGameSourceCache: null,
    _studentFailedImages: new Map(), canManageQuestions: () => c.currentUser?.role === 'admin',
    _tcgServedLoad: () => ({}),
    SYL_LO_BY_ID: {}, TCG_QUIZ: [], qReleased: () => true,
    aiPracticeActive: false, aiPracticeQueue: [], aiPracticeStats: {}, videoOnlyFilter: false,
    strokes: [], textBoxes: [], redoStack: [], current: null, solutionPhotoDataUrl: '',
    $: el, confirm: () => true, toast: noop, studentEloValue: () => 1000,
    questionDifficultyRating: question => question.difficulty || 1080, graphPrereqsMet: () => true,
    questionTopics: question => [question.topic || 'Percentage'], studentTopicLabel: value => value,
    studentTopicsLabel: question => question.topic || 'Percentage',
    parseTimeMs: value => Date.parse(value) || 0, dueTime: p => p ? Date.parse(p.nextReviewAt) || 0 : 0,
    questionHasVideo: question => !!(question.hasVideoExplanation || question.videoExplanationUrl),
    passesVideoFilter: question => !c.videoOnlyFilter || !!(question.hasVideoExplanation || question.videoExplanationUrl),
    renderAiPracticeBar: noop, renderLearningProfile: noop, renderVideoOnlyBtn: noop,
    updateDifficultyChip: noop, renderQuestionBlocksHtml: blocks => JSON.stringify(blocks),
    renderMcqArea: noop, applyAnnotationMode: noop, clearSolutionPhoto: noop, clearTextBoxes: noop,
    redraw: noop, requestAnimationFrame: noop, setupCanvasSize: noop, hideResult: noop, hideHint: noop,
    resetAskAi: noop, rpgQuestionChanged: noop, _practiceRefreshSubmit: noop, _practiceCurrentAnswerMarked: () => true,
    stopAiPractice: () => { c.aiPracticeActive = false; }, graphPrereqsOf: () => [], graphEasierVersionsOf: () => []
  });
  const code = cut('function _studentSyllabus()', '// ---- Automatic practice:')
    + cut('function _practiceSetMode(', 'function updateDifficultyChip(')
    + cut('function questionWrongBefore(', 'const AI_PRACTICE_SET_MAX')
    + cut('const AI_PRACTICE_SET_MAX', 'function renderAiPracticeBar(')
    + cut('function visiblePracticeIndices(', 'function renderVideoOnlyBtn(')
    + cut('function renderQuestion()', '$("prevBtn").addEventListener')
    + cut('function graphBestPrerequisiteToServe(', 'function maybeServePrerequisiteOnMiss(')
    + cut('function graphBestEasierToServe(', 'function maybeServeEasierOnMiss(');
  vm.runInContext(code, c);
  return { c, el };
}

test('real ordinary Next skips a Peggy cluster, then shows the explicit end of the round', () => {
  const bank = Array.from({ length: 10 }, (_, i) => q(`p${i}`, `Save ${i + 10} dollars.`, { title: "Peggy's Savings" }))
    .concat(q('other', 'Find the perimeter of a square.'));
  const { c, el } = navigationFixture(bank);
  c.prioritizeReviewQuestions(); c.renderQuestion();
  assert.equal(c.questionBank[c.qIndex].id, 'p0');
  c.changeQuestion(1);
  assert.equal(c.questionBank[c.qIndex].id, 'other');
  c.changeQuestion(1);
  assert.equal(c._practiceExhausted, true);
  assert.match(el('qBody').innerHTML, /end of this practice round/);
  assert.equal(el('submitBtn').disabled, true);
  assert.equal(c.questionBank.length, bank.length);
});

test('real AI set skips recently completed questions and includes one per unlinked story family', () => {
  const bank = [q('done', 'Save 10 dollars.', { title: "Peggy's Savings" }),
    q('sibling', 'Save 20 dollars.', { title: "Peggy's Savings" }), q('fresh'), q('fresh2')];
  const progress = { done: { wrongCount: 9, lastAttemptAt: new Date().toISOString(), nextReviewAt: iso(Date.now() + 7200000) } };
  const { c } = navigationFixture(bank, progress);
  c.startAiPractice();
  assert.deepEqual(Array.from(c.aiPracticeQueue, item => item.id), ['fresh', 'fresh2']);
  assert.equal(c.questionBank.length, bank.length);
});

test('real manual worksheet Next keeps B before overdue C', () => {
  const bank = [q('a'), q('b'), q('c')];
  const { c } = navigationFixture(bank, { c: { nextReviewAt: iso(Date.now() - 3600000) } });
  c._practiceSetMode(true); c.renderQuestion(); c.changeQuestion(1);
  assert.equal(c.questionBank[c.qIndex].id, 'b');
  assert.equal(c._practiceExhausted, false);
  assert.deepEqual(Array.from(c.questionBank, item => item.id), ['a', 'b', 'c']);
});

test('real reload prioritization moves a fresh question ahead of mastered history', () => {
  const bank = [q('peggy'), q('fresh')];
  const progress = { peggy: { wrongCount: 10, correctStreak: 4, lastVerdict: 'correct',
    lastAttemptAt: new Date().toISOString(), nextReviewAt: iso(Date.now() + 86400000) } };
  const { c } = navigationFixture(bank, progress);
  c.prioritizeReviewQuestions(); c.renderQuestion();
  assert.equal(c.questionBank[c.qIndex].id, 'fresh');
});

test('real prerequisite selection cannot loop A to B to A or escape video-only mode', () => {
  const bank = [q('a', 'Compute 12.', { hasVideoExplanation: true }), q('b', 'Compute 13.', { hasVideoExplanation: true }), q('no-video')];
  const { c } = navigationFixture(bank);
  c.videoOnlyFilter = true;
  c.graphPrereqsOf = id => id === 'a' ? ['b', 'no-video'] : ['a', 'no-video'];
  c.renderQuestion();
  assert.equal(c.graphBestPrerequisiteToServe(bank[0]).id, 'b');
  c.qIndex = 1; c.renderQuestion();
  assert.equal(c.graphBestPrerequisiteToServe(bank[1]), null);
});

test('real direct manual mode clears exhaustion, video-only and inherited AI mode', () => {
  const { c } = navigationFixture([q('a')]);
  c._practiceExhausted = true; c.videoOnlyFilter = true; c.aiPracticeActive = true;
  c._practiceSetMode(true); c.renderQuestion();
  assert.equal(c._practiceExhausted, false); assert.equal(c.videoOnlyFilter, false); assert.equal(c.aiPracticeActive, false);
  assert.equal(c._practiceRun.served.length, 0, 'explicit retries do not corrupt automatic serving history');
});
