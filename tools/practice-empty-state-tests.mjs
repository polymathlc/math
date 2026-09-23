// WHY PRACTICE HAS NOTHING TO SERVE (v1.90.0).
//
// A P6 pupil with 252 attempts opened Practice and was told "No suitable
// questions are ready here — return after your teacher has checked and
// levelled the questions". Nothing was wrong with the bank: the pupil had
// simply been served every levelled question at their level once, which is
// the permanent history rule working exactly as designed. The screen blamed
// the teacher for a round that had ended normally, so two people went looking
// for a fault that did not exist.
//
// Every case here runs the REAL code cut out of index.html — the classifier,
// the copy, the planner wrapper, the finished screen and the navigation that
// reaches it — against stubs for rendering and storage only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as mastery from '../practice-mastery.js';
import * as quality from '../practice-quality.js';
import {
  PRACTICE_FAMILY_COOLDOWN_MS, practiceContentKey,
  buildPracticeCatalog, createPracticeRun, recordPracticeServed, planPracticeQuestions
} from '../practice-variety.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
  const start = html.indexOf(from), end = html.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `Production section exists: ${from}`);
  return html.slice(start, end);
};
const q = (id, content = `Calculate ${id}.`, extra = {}) => ({
  id, title: `Question ${id}`, level: 'P4', topic: 'Percentage', blocks: [{ type: 'text', content }], ...extra
});

// ---- the pure half: the classifier and the words ----
function pureContext() {
  const c = vm.createContext({ Date, Set, Map, Number, String, Math, Array, Object, console });
  vm.runInContext(
    cut('// ---- WHY PRACTICE HAS NOTHING TO SERVE', '// The student catalogue lives on the feed-context cache')
    + cut('function practiceEmptyCopy(', '// 🔁 A pupil who has used up the bank')
    + cut('const LEARNING_NON_SKILL_RE', 'function topLearningEntries('), c);
  return c;
}
const P = pureContext();

test('a round emptied by the permanent history is "seen", never blamed on the teacher', () => {
  const reasons = Array(252).fill('served');
  const info = P.practiceEmptyInfo(reasons, [], 0);
  assert.equal(info.reason, 'seen');
  assert.equal(info.detail.served, 252);
  const copy = P.practiceEmptyCopy(info.reason, info.detail, Date.now());
  assert.match(copy.heading, /practised every question that’s ready for you/);
  assert.match(copy.note, /252 questions/);
  assert.match(copy.note, /nothing needs fixing/);
  assert.doesNotMatch(copy.note, /teacher has checked and levelled/);
  assert.equal(copy.button, 'Check for new questions');
});

test('served beats a handful of level misfits — the pupil has still used the bank up', () => {
  // Vi Vi's feed: almost everything served, a few above-level or unlevelled.
  const reasons = Array(40).fill('served').concat(['above-student-level', 'question-level-unknown', 'difficulty-too-high']);
  assert.equal(P.practiceEmptyInfo(reasons, [], 0).reason, 'seen');
});

test('the precedence is syncing > level > video > resting > seen > fit > round', () => {
  const all = ['served', 'above-student-level'];
  assert.equal(P.practiceEmptyInfo(['history-unavailable'].concat(all), [{ reason: 'filter' }]).reason, 'syncing');
  assert.equal(P.practiceEmptyInfo(['student-level-required'].concat(all), [{ reason: 'filter' }]).reason, 'level');
  assert.equal(P.practiceEmptyInfo(all, [{ reason: 'filter' }, { reason: 'recent-family' }]).reason, 'video');
  assert.equal(P.practiceEmptyInfo(all, [{ reason: 'review-not-due' }]).reason, 'resting');
  assert.equal(P.practiceEmptyInfo(all, []).reason, 'seen');
  assert.equal(P.practiceEmptyInfo(['above-student-level'], []).reason, 'fit');
  assert.equal(P.practiceEmptyInfo(['question-review'], []).reason, 'fit');
  assert.equal(P.practiceEmptyInfo([], []).reason, 'round');
  assert.equal(P.practiceEmptyInfo(undefined, undefined).reason, 'round');
  // A planner-level "served" (the variety run's own history) is still seen.
  assert.equal(P.practiceEmptyInfo([], [{ reason: 'served' }]).reason, 'seen');
});

test('the counts are honest: every feed reason lands in exactly one bucket', () => {
  const info = P.practiceEmptyInfo(
    ['served', 'served', 'question-level-unknown', 'question-level-invalid', 'above-student-level',
      'difficulty-too-high', 'difficulty-too-low', 'question-review', 'something-new'],
    [{ reason: 'filter' }, { reason: 'review-not-due' }, { reason: 'recent-family' }, { reason: 'served' }, { reason: 'odd' }, null],
    12345);
  assert.deepEqual({ ...info.detail }, { served: 3, resting: 2, video: 1, unlevelled: 2, above: 1, stretch: 1, easy: 1,
    review: 1, other: 2, nextReviewAt: 12345 });
});

test('"fit" names what did not fit, and only mentions the teacher when the teacher can help', () => {
  const above = P.practiceEmptyCopy('fit', { above: 3 });
  assert.equal(above.heading, 'No suitable questions are ready here');
  assert.match(above.note, /3 are above your level/);
  assert.doesNotMatch(above.note, /teacher/);
  const one = P.practiceEmptyCopy('fit', { above: 1, stretch: 1 });
  assert.match(one.note, /1 is above your level, 1 is a big stretch/);
  assert.match(one.note, /harder ones unlock/);
  const teacher = P.practiceEmptyCopy('fit', { unlevelled: 2, review: 1 });
  assert.match(teacher.note, /2 have no level set yet, 1 is waiting for your teacher to check/);
  assert.match(teacher.note, /teacher has checked and levelled/);
});

test('resting says when the next question is ready; every reason copes with no detail at all', () => {
  const now = Date.parse('2026-09-23T03:00:00Z');
  const soon = P.practiceEmptyCopy('resting', { nextReviewAt: now + 3600000 }, now);
  assert.match(soon.note, /the next one is ready at /);
  const past = P.practiceEmptyCopy('resting', { nextReviewAt: now - 1 }, now);
  assert.doesNotMatch(past.note, /ready at/);
  for (const r of ['level', 'syncing', 'seen', 'resting', 'video', 'fit', 'round', 'nonsense', undefined]) {
    const copy = P.practiceEmptyCopy(r, null, now);
    assert.ok(copy && copy.heading && typeof copy.note === 'string' && copy.button, `copy for ${r}`);
  }
  assert.equal(P.practiceEmptyCopy('seen', { served: 1 }).note.includes('all 1 question at your level'), true);
  assert.match(P.practiceEmptyCopy('level', null).button, /Choose My level/);
  assert.match(P.practiceEmptyCopy('video', null).heading, /video explanation/);
});

test('"No attempt made" is not a skill to focus on', () => {
  for (const label of ['No attempt made', 'no attempt', 'Not attempted', 'Blank', 'Left blank', 'Skipped',
    'Unanswered', 'No working shown', 'No answer', "Didn't attempt", 'N/A', '', '   ', null]) {
    assert.equal(P.learningLabelIsSkill(label), false, String(label));
  }
  for (const label of ['Fractions: Four Operations', 'Blanket area problems', 'Ratio', 'Answering with units', 'Skip counting']) {
    assert.equal(P.learningLabelIsSkill(label), true, label);
  }
});

// ---- the integrated half: the real planner, navigation and finished screen ----
function fixture(bank, { progress = {}, seen = () => false, level = 'P4', videoOnly = false } = {}) {
  const elements = new Map(), noop = () => {}, listeners = new Map();
  const el = id => {
    if (!elements.has(id)) elements.set(id, { id, style: {}, value: '', disabled: false, textContent: '', innerHTML: '',
      classList: { add: noop, remove: noop, toggle: noop },
      addEventListener: (type, fn) => listeners.set(id + ':' + type, fn), querySelectorAll: () => [],
      focus: noop, scrollIntoView: noop });
    return elements.get(id);
  };
  const toasts = [];
  const c = vm.createContext({
    ...mastery, ...quality, console,
    Date, Set, Map, PRACTICE_FAMILY_COOLDOWN_MS, practiceContentKey, buildPracticeCatalog, createPracticeRun,
    recordPracticeServed, planPracticeQuestions, currentUser: { uid: 'student-a', role: 'student' },
    questionBank: bank.slice(), studentProgress: progress, studentLearningProfile: {}, qIndex: 0,
    _practiceRun: createPracticeRun('student-a'), _practiceManual: false, _practiceManualIds: null, _practiceExhausted: false,
    _practiceCatalogBank: null, _practiceCatalogLength: -1, _practiceCatalogValue: null,
    _practiceViewEpoch: 0, _practiceMcqRevising: false, _practicePresentation: null, _practiceHistoryPending: false,
    _studentHistoryError: false, _studentHistoryLoading: null,
    studentQuestionHistory: { isReady: () => true, has: (id, key) => seen(id, key), claimMany: async () => true },
    studentLevel: level, _practiceEmptyReason: 'round',
    _studentFeedRevision: 0, _studentFeedContextCache: null, _studentGameSourceCache: null,
    _studentFailedImages: new Map(), canManageQuestions: () => c.currentUser?.role === 'admin',
    _tcgServedLoad: () => ({}),
    SYL_LO_BY_ID: {}, TCG_QUIZ: [], qReleased: () => true,
    aiPracticeActive: false, aiPracticeQueue: [], aiPracticeStats: {}, videoOnlyFilter: videoOnly,
    strokes: [], textBoxes: [], redoStack: [], current: null, solutionPhotoDataUrl: '',
    $: el, confirm: () => true, toast: (msg, kind) => toasts.push([msg, kind]), studentEloValue: () => 1000,
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
    stopAiPractice: () => { c.aiPracticeActive = false; }, graphPrereqsOf: () => [], graphEasierVersionsOf: () => [],
    navigateTo: noop
  });
  const code = cut('function _studentHistoryReady()', '// ---- Automatic practice:')
    + cut('function _practiceSetMode(', 'function updateDifficultyChip(')
    + cut('function questionWrongBefore(', 'const AI_PRACTICE_SET_MAX')
    + cut('const AI_PRACTICE_SET_MAX', 'function renderAiPracticeBar(')
    + cut('function visiblePracticeIndices(', 'function renderVideoOnlyBtn(')
    + cut('function renderQuestion()', '$("prevBtn").addEventListener')
    + cut('function graphBestPrerequisiteToServe(', 'function maybeServePrerequisiteOnMiss(')
    + cut('function graphBestEasierToServe(', 'function maybeServeEasierOnMiss(');
  vm.runInContext(code, c);
  return { c, el, listeners, toasts };
}

test('a pupil who has been served every question sees "practised every question", not the teacher sentence', async () => {
  const bank = Array.from({ length: 6 }, (_, i) => q(`s${i}`, `Find ${i + 3}% of 400.`));
  const { c, el } = fixture(bank, { seen: () => true });
  c.prioritizeReviewQuestions(); await c.renderQuestion();
  assert.equal(c._practiceExhausted, true);
  assert.equal(c._practiceEmptyReason, 'seen');
  const body = el('qBody').innerHTML;
  assert.match(body, /You’ve practised every question that’s ready for you/);
  assert.match(body, /all 6 questions at your level/);
  assert.doesNotMatch(body, /No suitable questions are ready here/);
  assert.doesNotMatch(body, /teacher has checked and levelled/);
  assert.match(body, /Check for new questions/);
  assert.equal(el('submitLabel').textContent, 'Practice round complete');
});

test('a bank that is all above the pupil\'s level says so, and does not send them to the teacher', async () => {
  const bank = [q('hard1', 'P6 speed.', { level: 'P6' }), q('hard2', 'P6 volume.', { level: 'P6' })];
  const { c, el } = fixture(bank, { level: 'P4' });
  c.prioritizeReviewQuestions(); await c.renderQuestion();
  assert.equal(c._practiceEmptyReason, 'fit');
  const body = el('qBody').innerHTML;
  assert.match(body, /No suitable questions are ready here/);
  assert.match(body, /2 are above your level/);
  assert.doesNotMatch(body, /teacher/);
});

test('walking off the end of a round with Next reclassifies from a plain plan', async () => {
  const bank = [q('a', 'Find 10% of 50.'), q('b', 'Find the perimeter of a square of side 4 cm.')];
  const served = new Set();
  const { c, el } = fixture(bank, { seen: id => served.has(String(id)) });
  c.prioritizeReviewQuestions(); await c.renderQuestion();
  assert.equal(c._practiceEmptyReason, 'round');
  const first = c.questionBank[c.qIndex].id;
  served.add(String(first));
  c.changeQuestion(1); await c.renderQuestion();
  served.add(String(c.questionBank[c.qIndex].id));
  c.changeQuestion(1); await c.renderQuestion();
  assert.equal(c._practiceExhausted, true);
  assert.equal(c._practiceEmptyReason, 'seen');
  assert.match(el('qBody').innerHTML, /practised every question that’s ready for you/);
});

test('a narrowed plan (an adaptive probe) never reclassifies the round', () => {
  const bank = [q('a'), q('b')];
  const { c } = fixture(bank, { seen: () => true });
  c._practicePlan(c.questionBank);
  assert.equal(c._practiceEmptyReason, 'seen');
  c._practiceEmptyReason = 'resting';
  c._practicePlan(c.questionBank, { excludeIds: ['a'], excludeFamilyIds: ['a'] });
  assert.equal(c._practiceEmptyReason, 'resting');
  c._practicePlan(c.questionBank, { excludeIds: new Set(['a']) });
  assert.equal(c._practiceEmptyReason, 'resting');
});

test('a round with questions left clears the last empty reason and its detail', () => {
  const served = new Set(['a', 'b']);
  const { c } = fixture([q('a'), q('b')], { seen: id => served.has(String(id)) });
  c._practicePlan(c.questionBank);
  assert.equal(c._practiceEmptyReason, 'seen');
  assert.ok(c._practiceEmptyDetail && c._practiceEmptyDetail.served === 2);
  served.clear();
  c._practicePlan(c.questionBank);
  assert.equal(c._practiceEmptyReason, 'round');
  assert.equal(c._practiceEmptyDetail, null);
});

test('the video-only filter is named as the reason and offers to show the rest', async () => {
  const bank = [q('plain1'), q('plain2')];
  const { c, el } = fixture(bank, { videoOnly: true });
  c.prioritizeReviewQuestions(); await c.renderQuestion();
  assert.equal(c._practiceEmptyReason, 'video');
  const body = el('qBody').innerHTML;
  assert.match(body, /No questions with a video explanation are left here/);
  assert.match(body, /id="practiceShowAllBtn"/);
});

test('a used-up bank still offers the pupil their own mistakes, and never toasts while drawing', async () => {
  const bank = [q('w1', 'Find 20% of 90.'), q('w2', 'Find 30% of 70.'), q('ok', 'Find 40% of 50.')];
  const progress = {
    w1: { wrongCount: 2, lastVerdict: 'incorrect', lastAttemptAt: '2026-09-01T00:00:00Z' },
    w2: { wrongCount: 1, lastVerdict: 'partial', lastAttemptAt: '2026-09-02T00:00:00Z' },
    ok: { wrongCount: 1, correctStreak: 3, lastVerdict: 'correct', lastAttemptAt: '2026-09-03T00:00:00Z' }
  };
  const { c, el, listeners, toasts } = fixture(bank, { progress, seen: () => true });
  c.prioritizeReviewQuestions(); await c.renderQuestion();
  assert.equal(c._practiceEmptyReason, 'seen');
  assert.match(el('qBody').innerHTML, /Revise my mistakes \(2\)/);
  assert.equal(toasts.length, 0, 'drawing the empty screen raised no toast');
  const revise = listeners.get('practiceReviseBtn:click');
  assert.equal(typeof revise, 'function');
  revise(); await c.renderQuestion();
  assert.equal(c._practiceManual, true);
  assert.deepEqual(Array.from(c.questionBank.slice(0, 2), item => item.id), ['w1', 'w2']);
  assert.equal(c.questionBank[c.qIndex].id, 'w1');
  assert.equal(c._practiceExhausted, false);
  assert.equal(c.questionBank.length, bank.length, 'revision reorders the bank, it never drops a question');
});

test('mastered questions and an admin never get a revise button', () => {
  const progress = { m: { wrongCount: 3, correctStreak: 2, lastVerdict: 'correct' } };
  const { c } = fixture([q('m')], { progress, seen: () => true });
  assert.equal(c._practiceMistakeQuestions().length, 0);
  const admin = fixture([q('x')], { progress: { x: { wrongCount: 1 } } });
  admin.c.currentUser = { uid: 'admin', role: 'admin' };
  assert.equal(admin.c._practiceMistakeQuestions().length, 0);
  const nolevel = fixture([q('y')], { progress: { y: { wrongCount: 1 } }, level: '' });
  assert.equal(nolevel.c._practiceMistakeQuestions().length, 0);
});

test('revision still goes through the level gate: an above-level mistake never comes back', () => {
  const progress = { hard: { wrongCount: 4 }, fine: { wrongCount: 1 } };
  const { c } = fixture([q('hard', 'P6 speed.', { level: 'P6' }), q('fine')], { progress, seen: () => true, level: 'P4' });
  assert.deepEqual(Array.from(c._practiceMistakeQuestions(), item => item.id), ['fine']);
});

// ---- source pins: the parts nothing above can reach ----
test('the sidebar level picker is readable on the arcade theme', () => {
  assert.match(html, /body\.arcade-ui \.sidebar-level :is\(select, #studentLevelSelect\) \{[^}]*color:\s*#fff/);
  assert.match(html, /body\.arcade-ui \.sidebar-level :is\(select, #studentLevelSelect\) option \{[^}]*color:\s*#172542/);
  assert.match(html, /id="studentLevelSelect"/);
  const css = fs.readFileSync(new URL('../arcade-ui.css', import.meta.url), 'utf8');
  assert.match(css, /select/, 'the arcade rule this overrides is still there to override');
});

test('the ready-render no longer forces every empty feed to "fit"', () => {
  const ready = cut('function _renderQuestionReady(', '\nfunction ') || '';
  assert.doesNotMatch(ready, /_practiceEmptyReason\s*=\s*['"]fit['"]/);
  assert.match(ready, /_practiceEmptyReason === 'round' && videoOnlyFilter/);
  assert.doesNotMatch(html, /_practiceEmptyReason\s*=\s*["']fit["']/, 'nowhere assigns "fit" by hand');
});

test('both exhaustion paths reclassify from a plain plan before ending the round', () => {
  const plain = /try \{ _practicePlan\(questionBank\); \} catch \(e\) \{ console\.warn\('practice empty reason', e\); \}\s*\n?\s*_practiceExhausted = true/g;
  assert.ok((html.match(plain) || []).length >= 2, 'the claim loop and changeQuestion both reclassify');
});

test('"No attempt made" is filtered where profiles are read AND where they are written', () => {
  assert.match(cut('function topLearningEntries(', '\nfunction '), /learningLabelIsSkill\(label\)/);
  assert.match(cut('function weaknessLabelsFromResult(', '\nfunction '), /learningLabelIsSkill/);
});

test('the version is bumped', () => {
  assert.match(html, /const APP_VERSION = "v1\.90\.0/);
});
