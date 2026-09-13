import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as mastery from '../practice-mastery.js';
import * as quality from '../practice-quality.js';
import * as variety from '../practice-variety.js';
import { signature as mathImportSignature } from '../rapid-import/functions/core.js';

// Execute the shipping integration helpers with real policies. Only browser,
// Firebase and the existing explicit generation service are boundary stubs.
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function cut(from, to) {
  const start = html.indexOf(from), end = html.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `Production section: ${from}`);
  return html.slice(start, end);
}
const question = (id, extra = {}) => ({ id, level: 'P4', topic: 'Fractions', title: 'Question',
  blocks: [{ type: 'text', content: `Calculate ${id} + 7.` }], ...extra });
const ids = rows => Array.from(rows, q => q.id || q.qid);
const row = q => ({ id: q.id, qid: q.id, feedSource: q });
function fixture(bank = [question('a')], options = {}) {
  const elements = new Map(), writes = [], notices = [], served = {}, storage = new Map();
  const noop = () => {};
  const el = id => {
    if (!elements.has(id)) elements.set(id, { value: '', textContent: '', innerHTML: '', disabled: false,
      style: {}, classList: { add: noop, remove: noop, toggle: noop }, focus: noop, scrollIntoView: noop,
      querySelectorAll: () => [], addEventListener: noop });
    return elements.get(id);
  };
  const c = vm.createContext({ ...mastery, ...quality, ...variety, mathImportSignature, Date, Map, Set,
    console: { warn: noop, error: noop }, currentUser: { uid: 'alice', role: 'student' },
    questionBank: bank, studentProgress: {}, studentLearningProfile: {}, studentLevel: 'P4',
    qIndex: 0, _practiceManual: false, _practiceExhausted: false, videoOnlyFilter: false,
    _practiceEmptyReason: 'round', _practiceRun: variety.createPracticeRun('alice'),
    _practiceCatalogBank: null, _practiceCatalogLength: -1, _practiceCatalogValue: null,
    _studentFeedRevision: 0, _studentFeedContextCache: null, _studentGameSourceCache: null,
    _studentFailedImages: new Map(), _studentPrivateKeysLoaded: true, _studentAdminFlagsLoaded: false,
    flagNotifications: [], TCG_QUIZ: [], SYL_LO_BY_ID: {
      'P4.N.1.1': { level: 'P4', sub: 'Fractions', topic: 'Adding fractions' },
      'P6.N.1.1': { level: 'P6', sub: 'Fractions', topic: 'Adding fractions' }
    }, canManageQuestions: () => c.currentUser?.role === 'admin', qReleased: () => true,
    _tcgServedLoad: () => served, tcgQuizLevel: q => q.lo?.split('.')[0] || '',
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) },
    parseTimeMs: value => Date.parse(value) || 0, $: el, toast: message => notices.push(message),
    _practiceRefreshSubmit: noop, stopAiPractice: noop, renderQuestion: noop,
    QUESTION_KEY_FIELDS: ['expected', 'markingGuide', 'answerKeyImageUrl', 'videoExplanationUrl', 'videoOverlays', 'sourcePages', 'sourcePdf', 'autoCheck', 'importWarning'],
    BLOCK_KEY_FIELDS: ['answerImg', 'answerKey'], db: {},
    doc: (_db, ...parts) => parts.join('/'), collection: (_db, ...parts) => parts.join('/'),
    setDoc: async (path, value, merge) => writes.push({ path, value: structuredClone(value), merge }),
    getDocs: async () => ({ forEach: noop }), isPermissionError: () => false,
    updateFlagBadge: noop, closeOverlay: noop, makeDocId: () => 'report-1', notificationAdminUid: () => 'teacher',
    compactQuestionSummary: q => q.title, studentTopicsLabel: q => q.topic,
    aiReady: () => true, weaknessPracticeTarget: () => ({ topic: 'Fractions', concept: '' }),
    learningSnapshotForGeneration: () => ({}), parseAIJson: value => value,
    questionFromWeaknessAi: value => value, aiErrorMessage: e => e.message,
    studentGeneratedQuestions: [], ...options
  });
  c._tcgQuizPool = () => c._studentGameRows(c.questionBank.map(row));
  vm.runInContext(cut('function _studentSyllabus()', '// ---- Automatic practice:')
    + cut('function _practiceSetMode(', 'function _practiceFindMore(')
    + cut('function splitQuestionDoc(', 'async function loadBank(')
    + cut('async function saveQuestionDoc(', 'async function deleteQuestionDoc(')
    + cut('async function loadFlagNotifications()', 'function renderFlagInbox(')
    + cut('async function submitQuestionFlag()', 'async function loadEmailSubscription(')
    + cut('async function generateWeaknessPractice()', '// =====================================================================\n// Built-in starter questions'), c);
  return { c, el, writes, notices, served, storage };
}

test('automatic, manual and direct selectors enforce the highest school stage despite easy ratings', () => {
  const bank = [question('p4'), question('p5', { level: 'P5', difficulty: 400 }),
    question('p6', { level: 'P6', difficulty: 400 }), question('range', { level: 'P4/P6', difficulty: 400 })];
  const { c } = fixture(bank);
  assert.deepEqual(ids(c._practicePlan(bank).questions), ['p4']);
  assert.deepEqual(ids(c._studentManualQuestions(bank)), ['p4']);
  assert.equal(c._studentGateDirect(bank[1]), false);
  assert.deepEqual(ids(c._studentGameRows(bank.map(row))), ['p4']);
  c.currentUser.role = 'admin';
  assert.deepEqual(ids(c._studentFeedCandidates(bank).questions), ids(bank), 'authoring retains every bank record');
});

test('missing student level blocks all student feeders and makes the chooser usable', () => {
  const { c, el } = fixture(undefined, { studentLevel: '' });
  let opened = false, focused = false;
  el('sidebar').classList.add = value => { opened = value === 'open'; };
  el('studentLevelSelect').focus = () => { focused = true; };
  assert.equal(c._practicePlan(c.questionBank).questions.length, 0);
  assert.equal(c._studentGameRows(c.questionBank.map(row)).length, 0);
  assert.equal(c._studentGateDirect(c.questionBank[0]), false);
  assert.equal(c._practiceEmptyReason, 'level');
  assert.ok(opened && focused);
});

test('unknown question stage cannot bypass the cap but valid syllabus metadata can supply it', () => {
  const bank = [question('unknown', { level: '' }), question('lo4', { level: 'Practice', los: ['P4.N.1.1'] }),
    question('lo6', { level: 'P4', los: ['P6.N.1.1'] }), question('badlo', { level: 'P4', los: ['P4.N.999'] })];
  const { c } = fixture(bank);
  assert.deepEqual(ids(c._studentFeedCandidates(bank).questions), ['lo4']);
});

test('mastery difficulty is enforced automatically while explicit within-grade order is preserved', () => {
  const bank = [question('a'), question('challenge', { difficulty: 2200 }), question('b')];
  const { c } = fixture(bank, { studentProgress: { b: { nextReviewAt: new Date(Date.now() - 1000).toISOString() } } });
  assert.ok(!ids(c._practicePlan(bank).questions).includes('challenge'));
  c._practiceSetMode(true);
  assert.deepEqual(ids(c._practicePlan(bank).questions), ['a', 'challenge', 'b']);
});

test('automatic feeds never fall back to suspect questions; manual choices warn and skip blocked content', () => {
  const suspect = question('review', { diagramWhole: true });
  const bank = [suspect, question('broken', { options: ['12', '12'] }), question('higher', { level: 'P6' })];
  const { c, notices } = fixture(bank);
  assert.deepEqual(ids(c._practicePlan(bank).questions), []);
  assert.deepEqual(ids(c._studentGameRows(bank.map(row))), []);
  assert.deepEqual(ids(c._studentManualQuestions(bank)), ['review']);
  assert.match(notices.at(-1), /skipped.*awaiting teacher review/);
  assert.equal(c._studentGateDirect(suspect), true);
  assert.match(notices.at(-1), /awaiting teacher review/);
});

test('ten Peggy game variants yield one story and a served family is deferred in every mode', () => {
  const bank = Array.from({ length: 10 }, (_, i) => question(`p${i}`, {
    title: "Peggy's Savings", blocks: [{ type: 'text', content: `Peggy saves ${20 + i} dollars.` }]
  })).concat(question('fresh'));
  const { c, served } = fixture(bank);
  assert.deepEqual(ids(c._studentGameRows(bank.map(row))), ['p0', 'fresh']);
  served.p0 = Date.now();
  assert.deepEqual(ids(c._studentGameRows(bank.map(row))), ['fresh']);
  assert.deepEqual(ids(c._practicePlan(bank).questions), ['fresh']);
});

test('saved exact review dates and Practice served stamps also apply to games', () => {
  const bank = [question('marked'), question('copy', { blocks: question('marked').blocks }), question('shown'), question('fresh')];
  const { c } = fixture(bank, { studentProgress: { marked: { lastAttemptAt: new Date().toISOString(),
    nextReviewAt: new Date(Date.now() + 86400000).toISOString(), lastVerdict: 'correct' } } });
  c._practiceRun = variety.recordPracticeServed(c._practiceRun, bank[2], Date.now(), 'alice');
  assert.deepEqual(ids(c._studentGameRows(bank.map(row))), ['fresh']);
});

test('built-in game content identity suppresses an independently imported Practice copy', () => {
  const copy = question('copy', { blocks: [{ type: 'text', content: 'Find 25% of 80.' }], options: ['10', '20'] });
  const { c, served } = fixture([copy, question('fresh')], { TCG_QUIZ: [
    { qid: 'builtin', lo: 'P4.N.1.1', q: 'Find 25% of 80.', opts: ['10', '20'], a: 1 }
  ] });
  served.builtin = Date.now();
  assert.deepEqual(ids(c._practicePlan(c.questionBank).questions), ['fresh']);
});

test('cached live game runs revalidate level and stop on an account change', () => {
  const bank = [question('p4'), question('p6', { level: 'P6' })];
  const { c } = fixture(bank);
  const run = { pool: bank.map(row), poolI: 0, feedLevel: 'P6', feedUid: 'alice' };
  assert.equal(c._studentNextGameQuestion(run).id, 'p4');
  assert.deepEqual(ids(run.pool), ['p4']);
  c.currentUser = { uid: 'bob', role: 'student' };
  assert.equal(c._studentNextGameQuestion(run), null);
  for (const pattern of [/_tcgQuiz = \{[^\n]+feedLevel: studentLevel/, /duelRun = \{\n\s+feedLevel: studentLevel/,
    /emsRun.feedLevel = studentLevel/, /elgRun.feedLevel = studentLevel/]) assert.match(html, pattern);
});

test('a failed diagram is immediately ineligible and cannot lower the mastery target', () => {
  const bad = question('bad', { blocks: [{ type: 'image', url: '/diagram.png' }] });
  const fresh = question('fresh');
  const { c, el } = fixture([bad, fresh], { studentProgress: { bad: { lastVerdict: 'incorrect', lastAttemptAt: new Date().toISOString() } } });
  const events = {}; let refreshes = 0;
  el('qBody').querySelectorAll = () => [{ getAttribute: () => '/diagram.png', addEventListener: (name, fn) => { events[name] = fn; } }];
  c._practiceRefreshSubmit = () => { refreshes++; };
  c._studentBindQuestionImages(bad); events.error();
  assert.equal(refreshes, 1);
  assert.equal(c._studentQuestionAllowed(bad, true), false);
  assert.deepEqual(ids(c._studentFeedCandidates([bad, fresh]).questions), ['fresh']);
  assert.equal(mastery.evaluatePracticeFit(fresh, { context: c._studentFeedContext() }).diagnostic.evidenceCount, 0);
});

test('public summary saving never copies private importer findings or answer keys', () => {
  const q = question('checked', { expected: 'SECRET_ANSWER', markingGuide: 'SECRET_GUIDE', options: ['1', '2'], correctOption: 1,
    importWarning: 'PRIVATE_WARNING' });
  q.autoCheck = { state: 'red', sig: mathImportSignature(q), findings: [{ detail: 'SECRET_FINDING' }] };
  const { c } = fixture([q], { currentUser: { uid: 'teacher', role: 'admin' } });
  const result = c.splitQuestionDoc(q);
  assert.equal(result.pub.practiceQuality.tier, 'blocked');
  assert.doesNotMatch(JSON.stringify(result.pub), /SECRET_|PRIVATE_WARNING|correctOption|autoCheck/);
  assert.equal(result.key.correctOption, 1);
  assert.equal(result.key.expected, 'SECRET_ANSWER');
});

test('failed private key reads preserve current known-error summaries during ordinary save', async () => {
  const q = question('checked');
  q.autoCheck = { state: 'red', sig: mathImportSignature(q) };
  q.practiceQuality = quality.buildQuestionQualitySummary(q, { importSignature: mathImportSignature(q) });
  delete q.autoCheck;
  const { c, writes } = fixture([q], { currentUser: { uid: 'teacher', role: 'admin' }, _studentPrivateKeysLoaded: false });
  await c.saveQuestionDoc(q);
  assert.equal(writes[0].value.practiceQuality.tier, 'blocked');
  assert.equal(c._studentQualitySummary(q, true).tier, 'blocked');
});

test('only successfully loaded and reviewed current-revision reports can clear an own report', () => {
  const q = question('reported'), at = Date.now() - 1000;
  const { c } = fixture([q], { currentUser: { uid: 'teacher', role: 'admin' } });
  q.practiceQuality = quality.buildQuestionQualitySummary(q, { unresolvedFlagCount: 1 });
  assert.equal(c._studentQualitySummary(q, true).reportCount, 1, 'failed/unloaded flags preserve quarantine');
  c._studentAdminFlagsLoaded = true;
  c.flagNotifications = [{ questionId: q.id, questionSignature: quality.questionQualitySignature(q), status: 'reviewed', reviewedAt: new Date(at + 500).toISOString() }];
  q.practiceQuality = c._studentQualitySummary(q, true);
  assert.equal(q.practiceQuality.reportCount, 0);
  assert.equal(quality.questionHasUnresolvedStudentFlag(q, { signature: quality.questionQualitySignature(q), at }), false);
});

test('admin flag reads cannot publish into an account that changed while the fetch was pending', async () => {
  const { c, writes } = fixture(undefined, { currentUser: { uid: 'teacher-a', role: 'admin' } });
  let resolve;
  c.getDocs = () => new Promise(done => { resolve = done; });
  const pending = c.loadFlagNotifications();
  c.currentUser = { uid: 'teacher-b', role: 'admin' };
  resolve({ forEach: fn => fn({ id: 'old-flag', data: () => ({ questionId: 'a', status: 'open' }) }) });
  await pending;
  assert.equal(c._studentAdminFlagsLoaded, false);
  assert.equal(c.flagNotifications.length, 0);
  assert.equal(writes.length, 0);
});

test('own question reports persist only a content fingerprint and survive profile updates without copying feedback', async () => {
  const { c, el, writes } = fixture(undefined, { studentLearningProfile: { level: 'P4', topicStats: { Fractions: {} } } });
  el('flagFeedbackInput').value = 'The labels cannot be read';
  await c.submitQuestionFlag();
  assert.equal(writes.length, 2);
  assert.match(writes[1].path, /users\/alice\/settings\/mathLearningProfile/);
  assert.deepEqual(Object.keys(writes[1].value), ['practiceFlags']);
  assert.deepEqual(Object.keys(writes[1].value.practiceFlags.a).sort(), ['at', 'signature']);
  assert.doesNotMatch(JSON.stringify(writes[1].value), /labels cannot/);
  assert.equal(c.studentLearningProfile.level, 'P4');
  assert.equal(c._studentQuestionAllowed(c.questionBank[0]), false);
});

test('report completion after an account switch does not write the previous student snapshot into the new account', async () => {
  const { c, el } = fixture();
  el('flagFeedbackInput').value = 'Diagram is unclear';
  let complete, calls = 0;
  c.setDoc = () => { calls++; return new Promise(resolve => { complete = resolve; }); };
  const pending = c.submitQuestionFlag();
  c.currentUser = { uid: 'bob', role: 'student' }; c.studentLearningProfile = {};
  complete(); await pending;
  assert.equal(calls, 1);
  assert.equal(c.studentLearningProfile.practiceFlags, undefined);
});

test('generation refuses unknown school level before AI and rejects an above-stage response before storing', async () => {
  const { c, writes, notices } = fixture(undefined, { studentLevel: '' });
  let calls = 0;
  c.askGeminiVision = async prompt => { calls++; assert.match(prompt, /student is in P4/);
    return question('generated', { level: 'P6', difficulty: 400, expected: '12', markingGuide: 'work' }); };
  await c.generateWeaknessPractice();
  assert.equal(calls, 0);
  c.studentLevel = 'P4'; await c.generateWeaknessPractice();
  assert.equal(calls, 1, 'no automatic retry or extra quality-check AI calls');
  assert.equal(writes.length, 0);
  assert.equal(c.studentGeneratedQuestions.length, 0);
  assert.match(notices.at(-1), /not suitable/);
});

test('ordinary and game selection use no AI requests or writes', () => {
  const { c, writes } = fixture([question('a'), question('b')]);
  c.askGeminiVision = () => { throw new Error('Unexpected paid selector call'); };
  c._practicePlan(c.questionBank); c._studentGameRows(c.questionBank.map(row));
  c._studentManualQuestions(c.questionBank); c._studentGateDirect(c.questionBank[0]);
  assert.equal(writes.length, 0);
});
