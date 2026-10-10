// 👩‍💻 The employee role and ⏱️ the work-session clock (v1.92.0).
//
// Run:  node --test tools/employee-work-session-tests.mjs
//
// Two halves. The STATIC half reads index.html, functions/index.js and
// firestore.rules as text and pins the promises that fail silently: an
// employee who lands in the student app, a question filed under the
// employee's own uid where no pupil ever meets it, a teacher-only page that
// opens for an author, a clock that counts ticks instead of timestamps. The
// BEHAVIOURAL half lifts the real work-session block out of the module and
// runs it in a sandbox with a clock this file controls, so "a break stops the
// clock", "two tabs never double-count" and "a session left running is filed
// at its last heartbeat" are measured rather than read.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const fnsrc = fs.readFileSync(new URL('functions/index.js', root), 'utf8');
const rules = fs.readFileSync(new URL('firestore.rules', root), 'utf8');
const modStart = html.indexOf('<script type="module">');
const src = html.slice(modStart, html.indexOf('</script>', modStart));

function cut(from, to, text = src) {
  const a = text.indexOf(from);
  assert.ok(a >= 0, 'missing: ' + from);
  const b = text.indexOf(to, a + from.length);
  assert.ok(b > a, 'missing end marker: ' + to);
  return text.slice(a, b);
}
function fnBody(name) {
  const re = new RegExp('(?:async )?function ' + name.replace(/[$]/g, '\\$') + '\\(');
  const m = re.exec(src);
  assert.ok(m, 'missing function ' + name);
  // Up to the next top-level declaration — good enough for a text pin.
  const rest = src.slice(m.index + 1);
  const next = rest.search(/\n(?:async )?function |\nconst |\nlet |\nvar |\n\/\/ ={10,}/);
  return src.slice(m.index, m.index + 1 + (next < 0 ? rest.length : next));
}
const listOf = (re, text) => {
  const m = re.exec(text);
  assert.ok(m, 'list not found: ' + re);
  return m[1].split(',').map(x => x.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
};

/* =====================================================================
   STATIC — the role
   ===================================================================== */
test('the employee is on the list, in the page AND on the server, and the two lists agree', () => {
  const page = listOf(/const EMPLOYEE_EMAILS = \[([^\]]*)\]/, src);
  const server = listOf(/const EMPLOYEE_EMAILS = \[([^\]]*)\]/, fnsrc);
  assert.ok(page.includes('pkeertana21@gmail.com'));
  assert.deepEqual(page.slice().sort(), server.slice().sort(), 'page and server lists must move together');
  const admins = listOf(/const ADMIN_EMAILS = \[([^\]]*)\]/, src);
  assert.ok(page.every(e => !admins.includes(e)), 'nobody is both an admin and an employee');
  assert.ok(page.every(e => e === e.toLowerCase()), 'addresses are compared lower-cased');
});

test('EMPLOYEE_PAGES is the authoring set and nothing of the teacher\'s', () => {
  const pages = listOf(/const EMPLOYEE_PAGES = \[([^\]]*)\]/, src);
  for (const p of ['create', 'vetting', 'bank', 'worksheet', 'myworksheets', 'worksession', 'worksheetview'])
    assert.ok(pages.includes(p), 'an employee needs ' + p);
  for (const p of ['students', 'graph', 'diagnostic', 'answerkeys', 'custompaper', 'bin', 'practice', 'tcg', 'character', 'leaderboard', 'adventure'])
    assert.ok(!pages.includes(p), p + ' is not an employee page');
  assert.match(src, /const EMPLOYEE_HOME = 'create';/);
  assert.ok(pages.includes('create'), 'EMPLOYEE_HOME must itself be allowed or navigateTo loops');
});

test('_isEmployee is a real role now, not the stub that answered false', () => {
  assert.doesNotMatch(src, /function _isEmployee\(\) \{ return false; \}/);
  assert.match(src, /function _isEmployee\(\) \{ return !!\(currentUser && currentUser\.role === 'employee'\); \}/);
  assert.match(src, /function _navAllowed\(page\) \{ return !_isEmployee\(\) \|\| EMPLOYEE_PAGES\.indexOf\(page\) >= 0; \}/);
  assert.match(src, /function canManageQuestions\(\) \{ return _canAuthor\(\); \}/);
  assert.match(src, /function _canAuthor\(\) \{ return !!currentUser && \(currentUser\.role === "admin" \|\| currentUser\.role === "employee"\); \}/);
});

test('sign-in: admin wins, a guest is never an employee, and the role is written onto currentUser', () => {
  const enter = cut('async function enterApp(user, authEpoch = _studentAuthEpoch) {', '\nfunction canManageQuestions()');
  assert.match(enter, /const isEmployee = !isAdmin && !isGuest && isEmployeeEmail\(user\.email\);/);
  assert.match(enter, /role: isAdmin \? "admin" : \(isEmployee \? "employee" : "student"\)/);
  assert.match(enter, /if \(isEmployee\) await employeeEnsureClaim\(user, tokenResult\);/);
  assert.match(enter, /employeeApplySidebar\(\);/);
  assert.match(enter, /if \(!isEmployee\) rpgInit\(\)/, 'no hero, no game doors for an author');
  assert.match(enter, /wkInit\(\)/, 'the clock is picked back up at sign-in');
});

test('the employee branch reads the TEACHER\'s bank and never writes the pointer, the roster or the login log', () => {
  const enter = cut('async function enterApp(user, authEpoch = _studentAuthEpoch) {', '\nfunction canManageQuestions()');
  const branch = cut('} else if (isEmployee) {', '// students discover the admin', enter);
  assert.doesNotMatch(branch, /setDoc\(doc\(db, "config", "mathAdmin"\)/, 'an employee must never repoint the school');
  assert.doesNotMatch(branch, /saveStudentRosterSummary|recordLoginEvent|loadStudentLearningState|_studentHistoryLoad/);
  assert.match(branch, /getDoc\(doc\(db, "config", "mathAdmin"\)\)/);
  for (const call of ['loadBank(adminUid)', 'loadVettingList(adminUid)', 'loadGenSettings(adminUid)'])
    assert.ok(branch.includes(call), 'employee loads ' + call);
  assert.match(branch, /navigateTo\(EMPLOYEE_HOME\)/);
});

test('navigateTo: default-deny for an employee, authors-only for the clock, and the old pinned guard intact', () => {
  const nav = fnBody('navigateTo');
  assert.match(nav, /"diagnostic", "answerkeys", "custompaper"\]\.includes\(page\) && !canManageQuestions\(\)/);
  assert.match(nav, /if \(page === "worksession" && !canManageQuestions\(\)\) page = "practice";/);
  assert.match(nav, /if \(_isEmployee\(\) && !EMPLOYEE_PAGES\.includes\(page\)\) page = EMPLOYEE_HOME;/);
  // The rewrite must come BEFORE the page is activated, or the forbidden page flashes up.
  assert.ok(nav.indexOf('EMPLOYEE_PAGES.includes(page)') < nav.indexOf('pageEl.classList.add("active")'));
  assert.match(nav, /if \(page === "worksession"\) wkRenderPage\(\);/);
});

test('every bank, key and vetting write resolves to the BANK OWNER, never to the signed-in uid', () => {
  assert.doesNotMatch(src, /"users", currentUser\.uid, "(mathQuestions|mathQuestionKeys|mathVetting)"/,
    'a question written under the employee\'s own uid is one no student is ever served');
  for (const name of ['saveQuestionDoc', 'deleteQuestionDoc', 'saveVettingDoc'])
    assert.match(fnBody(name), /_bankOwner(OrThrow|Uid)\(\)/, name + ' resolves the owner');
  assert.match(fnBody('binMove'), /_bankOwnerOrThrow\(\)/);
  assert.match(src, /setDoc\(doc\(db, "users", _bankOwnerOrThrow\(\), "mathQuestions", q\.id\), \{ los \}, \{ merge: true \}\)/);
  const owner = fnBody('_bankOwnerUid');
  assert.match(owner, /if \(currentUser\.role === "employee"\) return adminUid \|\| null;/,
    'with no teacher found an employee owns NOTHING, rather than their own subtree');
});

test('the teacher-only paths ask _isAdmin, not the authoring gate', () => {
  const adminOnly = [
    ['notifyQuestionSubscribers', /if \(!_isAdmin\(\) \|\| !q\) return;/],
    ['openFlagInbox', /if \(!_isAdmin\(\)\)/],
    ['openAiEngineSettings', /if \(!_isAdmin\(\)\)/],
    ['openMarking', /if \(!_isAdmin\(\)\)/],
    ['openGen', /if \(!_isAdmin\(\)\)/],
    ['scheduleGraphSave', /if \(!_isAdmin\(\)\) return;/],
    ['saveQuestionGraphNow', /if \(!_isAdmin\(\) \|\| !currentUser\) return;/],
    ['binPurgeExpired', /if \(!_isAdmin\(\)\)/],
    ['sylImportQuizToBank', /if \(!_isAdmin\(\)\)/],
    ['openStudentActivity', /if \(!_isAdmin\(\)\)/]
  ];
  for (const [name, re] of adminOnly) {
    if (name === 'openStudentActivity') { assert.match(src, /if \(!_isAdmin\(\)\) \{ toast\("Only admin accounts can view student activity"/); continue; }
    assert.match(fnBody(name), re, name + ' stays the teacher\'s');
  }
  assert.match(src, /function notificationAdminUid\(\) \{ return \(currentUser && currentUser\.role === "admin"\) \? currentUser\.uid : adminUid; \}/);
  assert.match(fnBody('loadBank'), /if \(_isAdmin\(\) && !clientAdminFallback && \(QUESTION_KEY_FIELDS/,
    'an employee\'s load never re-saves the whole bank behind their back');
  assert.match(src, /const employee = currentUser\?\.role === 'employee';\n  if \(!uid \|\| !canManageQuestions\(\) \|\| employee\) \{/,
    'the online PDF worker is the teacher\'s (it answers an admin claim only)');
});

test('the pupil surfaces are refused to an employee, not merely hidden', () => {
  assert.match(fnBody('practiseWorksheet'), /if \(_isEmployee\(\)\) \{ toast\(/);
  assert.match(fnBody('practiseCurrentWorksheet'), /if \(_isEmployee\(\)\) \{ toast\(/);
  assert.match(src, /window\.openPirateRift = \(\) => \(_isEmployee\(\) \? undefined : pirateRiftPortal\.open\(\)\);/);
  assert.match(src, /window\.openGrandLine=\(\)=>\(_isEmployee\(\) \? undefined : grandLinePortal\.open\(\)\);/);
  assert.match(src, /window\.openHadesMathBeta = \(\) => \{ pirateRiftPortal\.close\(\); grandLinePortal\.close\(\); if \(_isEmployee\(\)\) return;/);
  assert.match(src, /!isEmployeeEmail\(r\.email\)\);\n  studentRosterRows = rows;/, 'an employee is not listed on Student Results');
});

test('the CSS lock outlives a late style.display = "" from a game door', () => {
  assert.match(html, /body\.role-employee \.sidebar-nav \.nav-item:not\(\.emp-ok\) \{ display: none !important; \}/);
  for (const sel of ['.nav-tcg-wrap', '.rpg-side', '.rpg-el', '.sidebar-level', '#flagInboxBtn', '#emailBellBtn'])
    assert.ok(html.includes('body.role-employee ' + sel), sel + ' is locked for an employee');
});

test('markup: the pill lives in the top bar, the page and the nav item exist', () => {
  const bar = cut('<div class="topbar-actions">', '<div class="ai-badge">', html);
  assert.match(bar, /<div class="wk-slot" id="wkSlot" style="display:none;">/);
  assert.match(bar, /<button class="wk-chip" id="wkChip" type="button"/);
  assert.match(bar, /<div class="wk-pop" id="wkPop" role="dialog" aria-label="Work session" hidden><\/div>/);
  assert.match(html, /<div class="page" id="page-worksession">[\s\S]{0,600}<div class="wk-wrap" id="wkPageBody"><\/div>/);
  assert.match(html, /<div class="nav-item admin-only" data-page="worksession"[^>]*><span class="ico">⏱️<\/span> Work Sessions<\/div>/);
  // Nothing floats over the page: no fixed bar like the Science app's #wkBar.
  assert.doesNotMatch(html, /id="wkBar"/);
});

test('the version is bumped to v1.92.0', () => {
  assert.match(src, /const APP_VERSION = "v1\.92\.0/);
});

/* =====================================================================
   STATIC — the clock
   ===================================================================== */
test('the clock is TIMESTAMPS, never a tick counter', () => {
  const el = fnBody('_wkElapsed');
  assert.match(el, /const end = s\.endedAt \|\| s\.pausedAt \|\| Date\.now\(\);/);
  assert.match(el, /return Math\.max\(0, end - s\.startedAt - \(s\.pausedMs \|\| 0\)\);/);
  const tick = fnBody('_wkTick');
  assert.doesNotMatch(tick, /\+\+|\+= 1|elapsed\s*\+=/, 'a tick only repaints');
});

test('the store is SUBJECT-MARKED so the Science app\'s session never merges into this one', () => {
  assert.match(src, /var WK_LS_PREFIX = "mathWorkSession:";/);
  assert.match(src, /var WK_COL = "mathWorkSessions";/);
  // As CODE — the comment above the block names the Science app's keys in order to explain them.
  assert.doesNotMatch(src, /["']sq_work_session|collection\(db, ["']workSessions["']|doc\(db, ["']workSessions["']|"users", \w+, ["']workSessions["']/);
});

test('both save doors log, and read the quiet flag BEFORE their first await', () => {
  for (const name of ['saveQuestionDoc', 'saveVettingDoc']) {
    const body = fnBody(name);
    const flag = body.indexOf('const wkLog = !opts.quiet && !_wkSuppress;');
    assert.ok(flag > 0, name + ' reads the flag');
    assert.ok(flag < body.indexOf('await '), name + ' reads it before awaiting anything');
    assert.match(body, /if \(wkLog\) \{ try \{ wkLogQuestion\(q, "(bank|vetting)"\); \}/);
  }
  // The housekeeping writes stay out of the log.
  assert.match(src, /saveQuestionDoc\(q, \{ quiet: true \}\)\.catch\(e => console\.warn\("question sync"/);
  assert.match(src, /if \(inBank\) await saveQuestionDoc\(q, \{ quiet: true \}\); else await saveVettingDoc\(q, \{ quiet: true \}\);/);
  assert.match(fnBody('binRestore'), /saveVettingDoc\(q, \{ quiet: true \}\)/);
  assert.match(fnBody('sylImportQuizToBank'), /saveQuestionDoc\(q, \{ quiet: true \}\)/);
});

test('signing out FILES the session, and an account change only lets go of it', () => {
  assert.match(src, /\$\("logoutBtn"\)\.addEventListener\("click", async \(\) => \{\n  try \{ await wkBeforeSignOut\(\); \}/);
  const auth = cut('onAuthStateChanged(auth, async (user) => {', 'if (user) { await enterApp');
  assert.match(auth, /wkReset\(\)/);
  assert.ok(auth.indexOf('grandLinePortal.close()') < auth.indexOf('wkReset()'),
    'the portals still close first (grand-line-learning-tests reads that window)');
});

test('the work-session state is `var`, the temporal-dead-zone trap the save doors would hit', () => {
  for (const name of ['_wkSession', '_wkSuppress', 'WK_COL', 'WK_LS_PREFIX'])
    assert.match(src, new RegExp('\\nvar ' + name + ' = '), name + ' is var');
});

/* =====================================================================
   STATIC — the server and the rules
   ===================================================================== */
test('grantEmployeeRole never grants admin, carries the claims it did not set, and refuses an admin', () => {
  const fn = cut('export const grantEmployeeRole = onCall(LIGHT_OPTS', '\n});', fnsrc);
  assert.match(fn, /if \(ADMIN_EMAILS\.includes\(email\)\) throw new HttpsError\("failed-precondition"/);
  assert.match(fn, /if \(!EMPLOYEE_EMAILS\.includes\(email\)\) throw new HttpsError\("permission-denied"/);
  assert.match(fn, /if \(auth\.token\.email_verified !== true\)/);
  assert.match(fn, /const claims = Object\.assign\(\{\}, user\.customClaims \|\| \{\}\);/);
  assert.match(fn, /delete claims\.admin;/);
  assert.match(fn, /claims\.employee = true;/);
  assert.doesNotMatch(fn, /admin: true/);
  assert.doesNotMatch(fn, /config\/mathAdmin/, 'the bank pointer is the teacher\'s alone');
  assert.match(src, /const grantEmployeeRoleCall = httpsCallable\(cloudFunctions, "grantEmployeeRole"\);/);
});

test('the rules template lets an employee into the ONE bank students load, and files work sessions per author', () => {
  assert.match(rules, /function isBankEmployee\(uid\) \{[\s\S]*?get\(\/databases\/\$\(database\)\/documents\/config\/mathAdmin\)\.data\.uid == uid;/);
  for (const col of ['mathQuestions', 'mathQuestionKeys', 'mathVetting'])
    assert.match(rules, new RegExp('match /' + col + '/\\{qid\\} \\{[\\s\\S]*?\\|\\| isBankEmployee\\(uid\\);'), col);
  assert.match(rules, /match \/mathWorkSessions\/\{sessionId\} \{\n      allow read: if isAdmin\(\)/);
  assert.match(rules, /sessionId\.matches\(request\.auth\.uid \+ '_\[0-9\]\+'\)/);
  // config/mathAdmin stays admin-write-only.
  assert.match(rules, /match \/config\/mathAdmin \{\n      allow read: if signedIn\(\);\n      allow write: if isAdmin\(\);/);
});

/* =====================================================================
   BEHAVIOURAL — the real block in a sandbox
   ===================================================================== */
const BLOCK = cut('// =====================================================================\n// 👩‍💻 EMPLOYEE SIGN-IN', 'let clientAdminFallback = false;');

function makeEl(id, opts = {}) {
  const classes = new Set(opts.classes || []);
  const attrs = new Map();
  const el = {
    id, dataset: Object.assign({}, opts.dataset || {}), style: Object.assign({}, opts.style || {}),
    textContent: '', innerHTML: '', hidden: !!opts.hidden, title: '',
    classList: {
      add: c => classes.add(c), remove: c => classes.delete(c), contains: c => classes.has(c),
      toggle: (c, on) => { const want = on === undefined ? !classes.has(c) : !!on; if (want) classes.add(c); else classes.delete(c); return want; }
    },
    setAttribute: (k, v) => attrs.set(k, String(v)), getAttribute: k => (attrs.has(k) ? attrs.get(k) : null),
    removeAttribute: k => attrs.delete(k), hasAttribute: k => attrs.has(k),
    addEventListener() {}, closest: () => null,
    matches(sel) {
      return sel.split(',').map(x => x.trim()).some(one => one.startsWith('#') ? one.slice(1) === id : (one.startsWith('.') && classes.has(one.slice(1))));
    }
  };
  return el;
}

function sandbox(opts = {}) {
  const clock = { t: opts.t || Date.UTC(2026, 9, 10, 1, 0, 0) };
  class FakeDate extends Date {
    constructor(...a) { if (a.length) super(...a); else super(clock.t); }
    static now() { return clock.t; }
  }
  const store = new Map(), sstore = new Map(), writes = [], toasts = [], confirms = [];
  const els = new Map();
  const nav = opts.nav || [];
  const sections = opts.sections || [];
  const getEl = id => { if (!els.has(id)) els.set(id, makeEl(id)); return els.get(id); };
  const bodyClasses = new Set();
  const document = {
    visibilityState: 'visible', hidden: false,
    getElementById: getEl,
    querySelectorAll(sel) {
      if (sel === '.sidebar-nav .nav-item') return nav;
      if (sel === '.sidebar-nav .nav-section') return sections;
      if (sel === '[data-emp-hidden]') return nav.concat(sections).filter(e => e.hasAttribute('data-emp-hidden'));
      return [];
    },
    addEventListener() {}, createElement: () => ({ click() {}, remove() {} }),
    body: { classList: { toggle: (c, on) => { if (on) bodyClasses.add(c); else bodyClasses.delete(c); }, contains: c => bodyClasses.has(c) }, appendChild() {} }
  };
  const ctx = {
    console: { warn() {}, info() {}, log() {} }, Date: FakeDate, Math, JSON, Map, Set, Array, Object, String, Number, Promise, Infinity,
    document, window: { addEventListener() {} },
    localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
    sessionStorage: { getItem: k => (sstore.has(k) ? sstore.get(k) : null), setItem: (k, v) => sstore.set(k, String(v)) },
    setTimeout: (fn) => { fn(); return 1; }, clearTimeout() {}, setInterval: () => 7, clearInterval() {},
    currentUser: opts.user === undefined ? { uid: 'emp1', email: 'pkeertana21@gmail.com', name: 'Keertana', role: 'employee' } : opts.user,
    adminUid: 'teacher',
    EMPLOYEE_PAGES: ['create', 'vetting', 'bank', 'syllabus', 'worksheet', 'myworksheets', 'worksheetview', 'worksession'],
    EMPLOYEE_EMAILS: ['pkeertana21@gmail.com'],
    toast: (m, k) => toasts.push({ m, k }), confirm: m => { confirms.push(m); return opts.confirm !== false; },
    escapeHtml: s => String(s == null ? '' : s), navigateTo() {},
    questionTopics: q => (q && q.topics) || [],
    db: {}, doc: (_db, ...parts) => parts.join('/'), collection: (_db, ...parts) => parts.join('/'),
    query: (c) => c, where: () => null,
    setDoc: async (path, data) => { if (opts.denyShared && !path.startsWith('users/')) { const e = new Error('denied'); e.code = 'permission-denied'; throw e; } writes.push({ path, data: JSON.parse(JSON.stringify(data)) }); },
    getDocs: async () => ({ forEach() {} }),
    grantEmployeeRoleCall: async () => ({ data: { granted: true } })
  };
  ctx.isEmployeeEmail = e => ctx.EMPLOYEE_EMAILS.includes(String(e || '').toLowerCase());
  ctx._isAdmin = () => !!(ctx.currentUser && ctx.currentUser.role === 'admin');
  ctx._isEmployee = () => !!(ctx.currentUser && ctx.currentUser.role === 'employee');
  ctx._canAuthor = () => ctx._isAdmin() || ctx._isEmployee();
  ctx._bankOwnerUid = () => (!ctx.currentUser ? null : (ctx.currentUser.role === 'employee' ? ctx.adminUid : ctx.currentUser.uid));
  const c = vm.createContext(ctx);
  vm.runInContext(BLOCK, c);
  return { c, clock, store, writes, toasts, confirms, els, getEl, bodyClasses };
}
const MIN = 60000, HOUR = 60 * MIN;

test('Start → a session keyed uid_startedAt, mirrored locally and filed to mathWorkSessions', () => {
  const { c, store, writes, clock } = sandbox();
  c.wkStart();
  assert.equal(c._wkRunning(), true);
  assert.equal(c._wkSession.id, 'emp1_' + clock.t);
  assert.equal(c._wkSession.bankOwner, 'teacher', 'the session names the bank the work went into');
  assert.ok(store.has('mathWorkSession:emp1'));
  assert.equal(writes[0].path, 'mathWorkSessions/emp1_' + clock.t);
  assert.equal(writes[0].data.subject, 'math');
  assert.equal(writes[0].data.uid, 'emp1');
});

test('the clock follows the WALL CLOCK, and a break stops it', () => {
  const { c, clock } = sandbox();
  c.wkStart();
  clock.t += 25 * MIN;
  assert.equal(c._wkElapsed(c._wkSession), 25 * MIN);
  c.wkTogglePause();
  clock.t += 30 * MIN;                       // a 30-minute break
  assert.equal(c._wkElapsed(c._wkSession), 25 * MIN, 'paused: the clock stands still');
  c.wkTogglePause();
  clock.t += 5 * MIN;
  assert.equal(c._wkElapsed(c._wkSession), 30 * MIN);
  assert.equal(c._wkSession.pausedMs, 30 * MIN);
});

test('a question is logged once per id, re-saves count, and both doors are told apart', () => {
  const { c } = sandbox();
  c.wkStart();
  c.wkLogQuestion({ id: 'q1', title: 'Ratio of sweets', level: 'P5', topics: ['Ratio'] }, 'vetting');
  c.wkLogQuestion({ id: 'q1', title: 'Ratio of sweets (fixed)', level: 'P5' }, 'bank');
  c.wkLogQuestion({ id: 'q2', title: 'Area of a trapezium', level: 'P6' }, 'bank');
  assert.equal(c._wkCount(c._wkSession), 2);
  const q1 = c._wkSession.items.find(x => x.id === 'q1');
  assert.equal(q1.n, 2);
  assert.equal(q1.act, 'bank', 'approved into the bank after it was drafted');
  assert.equal(q1.title, 'Ratio of sweets (fixed)');
  assert.equal(q1.topic, 'Ratio');
  assert.equal(c._wkSaves(c._wkSession), 3);
});

test('nothing is logged when no session runs, or while an automatic job holds _wkSuppress', () => {
  const { c } = sandbox();
  c.wkLogQuestion({ id: 'q1' }, 'bank');
  assert.equal(c._wkSession, null);
  c.wkStart();
  c._wkSuppress = 1;
  c.wkLogQuestion({ id: 'q2' }, 'bank');
  assert.equal(c._wkCount(c._wkSession), 0);
});

test('two tabs: the merge is a UNION, idempotent, and never double-counts a save', () => {
  const { c } = sandbox();
  const base = { id: 's1', uid: 'emp1', startedAt: 1000, lastSeen: 1000, pausedMs: 0, items: [], actMins: [0] };
  const a = Object.assign({}, base, { savesByTab: { tA: 2 }, items: [{ id: 'q1', at: 2000, last: 2000, n: 1, act: 'vetting' }], actMins: [0, 3] });
  const b = Object.assign({}, base, { savesByTab: { tB: 1 }, items: [{ id: 'q2', at: 3000, last: 3000, n: 1, act: 'bank' }], actMins: [0, 5], lastSeen: 9000 });
  const m1 = c._wkMerge(a, b);
  assert.deepEqual(m1.items.map(x => x.id).sort(), ['q1', 'q2']);
  assert.deepEqual(Array.from(m1.actMins), [0, 3, 5]);
  assert.equal(c._wkSaves(m1), 3);
  assert.equal(m1.lastSeen, 9000);
  const m2 = c._wkMerge(m1, b);              // the tabs echo each other
  assert.equal(c._wkSaves(m2), 3, 'echoing the same state must not grow the count');
  assert.equal(m2.items.length, 2);
  assert.equal(m2.uniq, 2);
  const ended = c._wkMerge(m2, Object.assign({}, b, { endedAt: 12000 }));
  assert.equal(ended.endedAt, 12000, 'if any tab ended it, it ended');
});

test('active minutes: stamped once a minute, never while on a break, never more than the clock', () => {
  const { c, clock } = sandbox();
  c.wkStart();                               // minute 0 is the press itself
  clock.t += 10 * 1000; c._wkNoteActivity(); // same minute — nothing new
  assert.deepEqual(Array.from(c._wkSession.actMins), [0]);
  clock.t += 2 * MIN; c._wkNoteActivity(); c._wkNoteActivity();
  assert.equal(c._wkSession.actMins.length, 2);
  c.wkTogglePause();
  clock.t += 5 * MIN; c._wkNoteActivity();
  assert.equal(c._wkSession.actMins.length, 2, 'a break is not active time');
  c.wkTogglePause();
  clock.t += 1 * MIN; c._wkNoteActivity();
  assert.equal(c._wkSession.actMins.length, 3);
  assert.ok(c._wkActiveMs(c._wkSession) <= c._wkElapsed(c._wkSession));
  const fresh = { startedAt: clock.t, actMins: [0], pausedMs: 0 };
  assert.equal(c._wkActiveMs(fresh), 0, 'a bucket stamped this second is not a minute\'s work yet');
});

test('End asks once and files with endedAt; declining keeps it running', () => {
  const s1 = sandbox({ confirm: false });
  s1.c.wkStart();
  s1.c.wkEnd();
  assert.equal(s1.c._wkRunning(), true, 'declining the confirm keeps the clock running');
  const s2 = sandbox();
  s2.c.wkStart();
  s2.clock.t += 2 * HOUR;
  s2.c.wkEnd();
  assert.equal(s2.c._wkRunning(), false);
  const last = s2.writes[s2.writes.length - 1];
  assert.equal(last.data.endedAt, s2.clock.t);
  assert.equal(last.data.ms, 2 * HOUR);
  assert.equal(s2.store.has('mathWorkSession:emp1'), false, 'the local copy is cleared');
});

test('a session left running is filed at its LAST HEARTBEAT, not when it was reopened', () => {
  const { c, store, writes, clock, toasts } = sandbox();
  const started = clock.t - 9 * HOUR;
  store.set('mathWorkSession:emp1', JSON.stringify({ id: 'emp1_' + started, uid: 'emp1', startedAt: started,
    lastSeen: started + 3 * HOUR, pausedMs: 0, items: [], actMins: [0, 1, 2], savesByTab: {} }));
  c.wkInit();                                // six hours since anybody had it open
  assert.equal(c._wkRunning(), false);
  const filed = writes[writes.length - 1].data;
  assert.equal(filed.endedAt, started + 3 * HOUR);
  assert.equal(filed.ms, 3 * HOUR, 'the hours nobody was at the keyboard are not counted');
  assert.ok(toasts.some(t => /left running/.test(t.m)));
});

test('a fresh session is picked back up mid-count after a reload', () => {
  const { c, store, clock } = sandbox();
  const started = clock.t - 40 * MIN;
  store.set('mathWorkSession:emp1', JSON.stringify({ id: 'emp1_' + started, uid: 'emp1', startedAt: started,
    lastSeen: clock.t - 30 * 1000, pausedMs: 0, items: [{ id: 'q9', at: started, last: started, n: 1, act: 'bank' }], actMins: [0], savesByTab: { t1: 1 } }));
  c.wkInit();
  assert.equal(c._wkRunning(), true);
  assert.equal(c._wkElapsed(c._wkSession), 40 * MIN);
  assert.equal(c._wkCount(c._wkSession), 1);
});

test('a session is never written under ANOTHER account, and wkReset lets go without filing', () => {
  const { c, writes } = sandbox();
  c.wkStart();
  const n = writes.length;
  const mine = c._wkSession;
  c.currentUser = { uid: 'someone-else', role: 'admin' };
  c._wkPersist(mine);
  assert.equal(writes.length, n, 'one person\'s hours must not be filed under another\'s uid');
  c.wkReset();
  assert.equal(c._wkSession, null);
  assert.equal(writes.length, n, 'letting go is not filing');
});

test('Sign out files the session at that moment', async () => {
  const { c, writes, clock } = sandbox();
  c.wkStart();
  clock.t += 50 * MIN;
  await c.wkBeforeSignOut();
  assert.equal(c._wkRunning(), false);
  assert.equal(writes[writes.length - 1].data.endedAt, clock.t);
  assert.equal(writes[writes.length - 1].data.ms, 50 * MIN);
});

test('a denied shared write falls back to the author\'s own subtree and the clock keeps running', async () => {
  const { c, writes } = sandbox({ denyShared: true });
  c.wkStart();
  await c._wkPersisting;
  assert.equal(c._wkPrivateOnly, true);
  assert.ok(writes.some(w => w.path.startsWith('users/emp1/mathWorkSessions/')));
  assert.equal(c._wkRunning(), true);
});

test('the pill: an employee always has it (it IS the start button); a teacher only while clocked on; a pupil never', () => {
  const emp = sandbox();
  emp.c.wkRenderBar();
  assert.equal(emp.getEl('wkSlot').style.display, '');
  assert.match(emp.getEl('wkChipLabel').innerHTML, /Start work session/);
  emp.c.wkStart();
  emp.c.wkRenderBar();
  assert.equal(emp.getEl('wkChip').classList.contains('on'), true);
  assert.equal(emp.getEl('wkChipTime').textContent, '0:00:00');
  const admin = sandbox({ user: { uid: 'teacher', email: 'chungzhikai@gmail.com', role: 'admin' } });
  admin.c.wkRenderBar();
  assert.equal(admin.getEl('wkSlot').style.display, 'none', 'no pill nobody asked for in the teacher\'s top bar');
  admin.c.wkStart();
  admin.c.wkRenderBar();
  assert.equal(admin.getEl('wkSlot').style.display, '');
  const pupil = sandbox({ user: { uid: 'kid', role: 'student' } });
  pupil.c.wkRenderBar();
  assert.equal(pupil.getEl('wkSlot').style.display, 'none');
  pupil.c.wkStart();
  assert.equal(pupil.c._wkRunning(), false, 'a pupil cannot start one');
});

test('the popover opens only when asked, and shows Break / End', () => {
  const { c, getEl } = sandbox();
  c.wkStart();
  c.wkRenderBar();
  assert.equal(getEl('wkPop').hidden, true, 'running quietly: nothing open over the page');
  c.wkPopToggle(true);
  assert.equal(getEl('wkPop').hidden, false);
  assert.match(getEl('wkPop').innerHTML, /data-wk="pause"/);
  assert.match(getEl('wkPop').innerHTML, /data-wk="end"/);
  c.wkPopToggle(false);
  assert.equal(getEl('wkPop').hidden, true);
});

test('the sidebar lockdown is default-deny for an employee and undone exactly for the next account', () => {
  const nav = [
    makeEl('n-practice', { dataset: { page: 'practice' } }),
    makeEl('n-create', { dataset: { page: 'create' }, classes: ['admin-only'] }),
    makeEl('n-students', { dataset: { page: 'students' }, classes: ['admin-only'] }),
    makeEl('navHadesBeta', {}),
    makeEl('rpgHideToggle', { style: { display: 'none' } }),
    makeEl('n-work', { dataset: { page: 'worksession' }, classes: ['admin-only'] })
  ];
  const sections = [makeEl('sec-admin', { classes: ['admin-only'] })];
  const { c, bodyClasses } = sandbox({ nav, sections });
  c.employeeApplySidebar();
  const vis = Object.fromEntries(nav.map(e => [e.id, e.style.display]));
  assert.equal(vis['n-create'], '');
  assert.equal(vis['n-work'], '');
  assert.equal(vis['n-practice'], 'none');
  assert.equal(vis['n-students'], 'none');
  assert.equal(vis['navHadesBeta'], 'none');
  assert.ok(bodyClasses.has('role-employee'));
  assert.ok(nav[1].classList.contains('emp-ok'));
  assert.equal(nav[4].hasAttribute('data-emp-hidden'), false, 'already hidden by its own rule: not ours to restore');
  // A pupil signs in on the same machine.
  c.currentUser = { uid: 'kid', role: 'student' };
  nav[2].style.display = 'none';             // the .admin-only sweep ran first, as in enterApp
  c.employeeApplySidebar();
  assert.equal(bodyClasses.has('role-employee'), false);
  assert.equal(nav[0].style.display, '', 'Practice is back for the pupil');
  assert.equal(nav[3].style.display, '', 'the Hades door is back');
  assert.equal(nav[2].style.display, 'none', 'an .admin-only item is never restored by this function');
  assert.equal(nav[4].style.display, 'none', 'the Hide-game toggle keeps its own rule');
  assert.equal(nav[1].classList.contains('emp-ok'), false);
});

test('the claim is asked for once and never stops the sign-in', async () => {
  const { c } = sandbox();
  let asked = 0;
  c.grantEmployeeRoleCall = async () => { asked++; throw Object.assign(new Error('not deployed'), { code: 'not-found' }); };
  const user = { getIdTokenResult: async () => ({ claims: {} }) };
  assert.equal(await c.employeeEnsureClaim(user, { claims: {} }), false);
  assert.equal(asked, 1);
  assert.equal(await c.employeeEnsureClaim(user, { claims: { employee: true } }), true);
  assert.equal(asked, 1, 'a token already carrying the claim asks for nothing');
});

test('CSV: one row per question, with the active minutes beside the clock', () => {
  const { c } = sandbox({ user: { uid: 'teacher', role: 'admin', email: 'chungzhikai@gmail.com' } });
  let blobText = '';
  c.Blob = class { constructor(parts) { blobText = parts.join(''); } };
  c.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
  c._wkHistory = [{ id: 'emp1_1', uid: 'emp1', name: 'Keertana', email: 'pkeertana21@gmail.com', startedAt: 1000, endedAt: 1000 + 2 * HOUR,
    ms: 2 * HOUR, actMins: Array.from({ length: 90 }, (_, i) => i), pausedMs: 0, questions: 2, saves: 3,
    items: [{ id: 'q1', title: 'Ratio', level: 'P5', topic: 'Ratio', at: 2000, n: 2, act: 'bank' }, { id: 'q2', title: 'Area', at: 3000, n: 1, act: 'vetting' }] }];
  c.wkExportCsv();
  const lines = blobText.replace(/^﻿/, '').split('\r\n');
  assert.equal(lines.length, 3, 'header + one row per question');
  assert.match(lines[0], /"?Active \(min\)"?/);
  assert.match(lines[1], /"Keertana".*"2\.00","90"/);
  assert.match(lines[2], /"Vetting"/);
});
