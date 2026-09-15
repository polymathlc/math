import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as mastery from '../practice-mastery.js';
import * as quality from '../practice-quality.js';
import * as variety from '../practice-variety.js';
import { signature as mathImportSignature } from '../rapid-import/functions/core.js';
import { createStudentQuestionHistory } from '../student-question-history.js';
import { pirateRiftScope } from '../pirate-rift-portal.js';

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
    qIndex: 0, _practiceManual: false, _practiceManualIds: null, _practiceExhausted: false, videoOnlyFilter: false,
    _practiceEmptyReason: 'round', _practiceRun: variety.createPracticeRun('alice'),
    _practiceCatalogBank: null, _practiceCatalogLength: -1, _practiceCatalogValue: null,
    _studentFeedRevision: 0, _studentFeedContextCache: null, _studentGameSourceCache: null,
    _studentHistoryError: false, _studentHistoryLoading: null,
    studentQuestionHistory: { isReady: () => true, has: id => !!served[id],
      claimMany: async entries => { if (entries.some(entry => served[entry.id])) return false; entries.forEach(entry => { served[entry.id] = Date.now(); }); return true; } },
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
  vm.runInContext(cut('function _studentHistoryReady()', '// ---- Automatic practice:')
    + cut('function _practiceSetMode(', 'async function _practiceFindMore(')
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

test('cached live game runs revalidate level and stop on an account change', async () => {
  const bank = [question('p4'), question('p6', { level: 'P6' })];
  const { c } = fixture(bank);
  const run = { pool: bank.map(row), poolI: 0, feedLevel: 'P6', feedUid: 'alice' };
  assert.equal((await c._studentNextGameQuestion(run)).id, 'p4');
  assert.deepEqual(ids(run.pool), ['p4']);
  c.currentUser = { uid: 'bob', role: 'student' };
  assert.equal(await c._studentNextGameQuestion(run), null);
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

// The production host helpers above now run against the real cloud ledger.
// Firebase is the boundary substitute; all selection and reservation code ships.
function historyCloud() {
  const data = new Map(), listeners = [], db = {};
  const snapshot = path => ({ metadata: { fromCache: false }, forEach(fn) {
    for (const [key, value] of data) if (key.startsWith(path + '/') && !key.slice(path.length + 1).includes('/')) fn({ data: () => structuredClone(value) });
  } });
  let queue = Promise.resolve();
  const api = { db, collection: (_db, ...parts) => parts.join('/'), doc: (path, id) => path + '/' + id,
    getDocs: async path => snapshot(path), onSnapshot(path, next) { const listener = { path, next }; listeners.push(listener); return () => { const i = listeners.indexOf(listener); if (i >= 0) listeners.splice(i, 1); }; },
    runTransaction: (_db, fn) => { const result = queue.then(async () => {
      const writes = [];
      const answer = await fn({ get: async path => ({ exists: () => data.has(path), data: () => structuredClone(data.get(path)) }), set: (path, value) => writes.push([path, value]) });
      writes.forEach(([path, value]) => data.set(path, structuredClone(value)));
      listeners.forEach(listener => listener.next(snapshot(listener.path))); return answer;
    }); queue = result.catch(() => {}); return result; }
  };
  return { data, create: () => createStudentQuestionHistory({ ...api, subject: 'math' }) };
}
async function withHistory(cloud, bank, uid = 'alice', legacy = []) {
  const f = fixture(bank, { currentUser: { uid, role: 'student' } });
  f.c.studentQuestionHistory = cloud.create();
  f.c._tcgServedLoad = () => f.c.studentQuestionHistory.snapshot().seen;
  await f.c.studentQuestionHistory.open({ uid, profile: '' }, legacy);
  return f;
}

test('actual account history survives a new browser and excludes exact copies across Practice and every game queue', async () => {
  const cloud = historyCloud(), first = question('first', { source: 'scan' }), bank = [first, question('copy', { blocks: first.blocks }), question('next')];
  const a = await withHistory(cloud, bank);
  assert.equal(await a.c._studentHistoryClaim([first]), true, 'Practice reserves before display');
  a.c.studentQuestionHistory.close();
  const remaining = bank.slice(1), b = await withHistory(cloud, remaining);
  assert.deepEqual(ids(b.c._practicePlan(remaining).questions), ['next'], 'The original scan may have been deleted; its content identity still excludes the copy');
  assert.deepEqual(ids(b.c._studentGameRows(remaining.map(row))), ['next']);
  assert.equal((await b.c._studentNextGameQuestion({ pool: remaining.map(row) })).id, 'next');
  assert.equal(await b.c._studentNextGameQuestion({ pool: remaining.map(row) }), null, 'Starting another game never refills from seen questions');
  const other = await withHistory(cloud, bank, 'bob');
  assert.equal(await other.c._studentHistoryClaim([first]), true, 'Another student has an independent history');
});

test('month-old history remains excluded and manual revision records new exposures without reopening automatic repeats', async () => {
  const cloud = historyCloud(), old = question('old'), fresh = question('fresh');
  const { c } = await withHistory(cloud, [old, fresh], 'alice', [{ id: old.id, contentKey: variety.practiceContentKey(old), at: Date.now() - 45 * 86400000 }]);
  c._practiceRestartIfRested();
  assert.deepEqual(ids(c._practicePlan([old, fresh]).questions), ['fresh']);
  assert.equal(await c._studentHistoryClaim([old], true), true, 'A deliberate revision remains possible');
  c._practiceSetMode(true, [old]);
  assert.deepEqual(ids(c._practicePlan([old, fresh]).questions), ['old'], 'Revision permission stays inside the selected worksheet or question');
  c._practiceSetMode(false);
  assert.equal(await c._studentHistoryClaim([fresh], true), true, 'A new worksheet question enters the same permanent history');
  assert.equal(c._practicePlan([old, fresh]).questions.length, 0);
});

test('simultaneous game queues claim different questions and rapid calls cannot advance the same run twice', async () => {
  const cloud = historyCloud(), bank = [question('a'), question('b'), question('c')];
  const a = await withHistory(cloud, bank), b = await withHistory(cloud, bank);
  const run = { pool: bank.map(row) };
  const [one, duplicate, two] = await Promise.all([a.c._studentNextGameQuestion(run), a.c._studentNextGameQuestion(run), b.c._studentNextGameQuestion({ pool: bank.map(row) })]);
  assert.equal(duplicate, null); assert.ok(one && two); assert.notEqual(one.id, two.id);
});

test('migration unions every local and cloud mode without migrating another account or preview', async () => {
  const bank = Array.from({ length: 8 }, (_, i) => question('q' + i)), f = fixture(bank), entries = [];
  f.c.pirateRiftScope = pirateRiftScope;
  f.c.ATTEMPTS_COL = 'mathQuestionAttempts'; f.c.ATTEMPTS_COL_LEGACY = 'questionAttempts';
  f.c.where = (field, _operator, value) => ({ field, value }); f.c.query = (path, condition) => ({ path, condition });
  f.c.studentQuestionHistory.open = async (identity, rows) => { assert.equal(identity.uid, 'alice'); entries.push(...rows); return true; };
  f.storage.set('tcgTrainServed_alice', JSON.stringify({ q0: 100 }));
  f.storage.set('gameQSeen_alice', JSON.stringify({ q1: 110 }));
  f.storage.set('mqGameAttempts_alice', JSON.stringify({ q2: { at: 120 } }));
  f.storage.set('tcgTrainServed_bob', JSON.stringify({ other: 100 }));
  f.storage.set('mathHadesBetaV1:alice:hades-student:P4', JSON.stringify({ shown: { q3: 130 } }));
  f.storage.set('mathHadesBetaV1:alice:hades-preview:P4', JSON.stringify({ shown: { preview: 130 } }));
  const identity = JSON.stringify(['Math', JSON.stringify(['alice', 'student', '', 'P4']), 'P4', 'student']);
  f.storage.set('grandLineMathV1:' + pirateRiftScope(identity), JSON.stringify({ shown: { q4: 140 } }));
  const reads = [];
  f.c.getDocs = async ref => {
    const path = ref.path || ref; reads.push(path);
    if (ref.condition) assert.equal(ref.condition.value, 'alice');
    const rows = path.endsWith('mathQuestionProgress') ? [{ questionId: 'q5', lastAttemptAt: '2025-01-01' }]
      : path.endsWith('mathPerformanceAttempts') ? [{ questionId: 'q6', createdAt: '2025-01-02' }]
      : path === 'mathQuestionAttempts' ? [{ questionId: 'q7', timestamp: { seconds: 100 } }]
      : [{ questionId: 'q0', timestamp: { seconds: 200 } }, { questionId: 'science-only', timestamp: { seconds: 200 } }];
    return { metadata: { fromCache: false }, forEach: fn => rows.forEach(data => fn({ data: () => data })) };
  };
  assert.equal(await f.c._studentHistoryLoad('alice'), true);
  assert.equal(reads.length, 4); assert.deepEqual(entries.map(entry => entry.id).sort(), bank.map(q => q.id));
  assert.ok(entries.every(entry => entry.contentKey === variety.practiceContentKey(bank.find(q => q.id === entry.id))));
  assert.equal(entries.find(entry => entry.id === 'q0').at, 200000);
});

test('cached or failed migration cannot make a student appear new, and account changes cancel the migration', async () => {
  const { c } = fixture([question('a')]); let opens = 0;
  Object.assign(c, { pirateRiftScope, ATTEMPTS_COL: 'mathQuestionAttempts', ATTEMPTS_COL_LEGACY: 'questionAttempts', where: () => '', query: path => path });
  c.studentQuestionHistory.open = async () => { opens++; return true; };
  c.getDocs = async () => ({ metadata: { fromCache: true }, forEach() {} });
  await assert.rejects(c._studentHistoryLoad('alice'), /complete question history/); assert.equal(opens, 0);
  c.getDocs = async () => { throw Error('offline'); };
  await assert.rejects(c._studentHistoryLoad('alice'), /offline/); assert.equal(opens, 0);
  c.getDocs = async () => { c.currentUser = { uid: 'bob', role: 'student' }; return { forEach() {} }; };
  assert.equal(await c._studentHistoryLoad('alice'), false); assert.equal(opens, 0);
});

test('a previous account late reservation failure cannot poison the next student history', async () => {
  const { c } = fixture([question('a')]); let reject;
  c.studentQuestionHistory.claimMany = () => new Promise((_resolve, no) => { reject = no; });
  const pending = c._studentNextGameQuestion({ pool: c.questionBank.map(row) });
  await new Promise(resolve => setImmediate(resolve)); assert.equal(typeof reject, 'function');
  c.currentUser = { uid: 'bob', role: 'student' };
  reject(Error('Old account disconnected'));
  assert.equal(await pending, null); assert.equal(c._studentHistoryError, false);
});
