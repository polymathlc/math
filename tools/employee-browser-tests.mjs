// 👩‍💻⏱️ The employee role and the work-session clock, in a REAL browser on the
// REAL page (v1.92.0).
//
// The whole of index.html is loaded and its own module runs. Only Firebase is
// replaced — by small in-memory stand-ins served in place of the gstatic SDK
// files — so the sign-in path, the sidebar lockdown, the navigation guard, the
// ⏱️ pill and a question saved from the editor are all the production code.
// Nothing leaves the machine: every other request is aborted.
//
//   npm install playwright   (or PLAYWRIGHT_MODULE=<path to playwright>)
//   node tools/employee-browser-tests.mjs
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(/^[A-Za-z]:[\\/]|^\//.test(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://polymath.test';

// ---- The Firebase stand-ins ---------------------------------------------
// One shared in-memory database on window.__fx, so the test can seed it and
// read back what the page wrote.
const FX = `window.__fx = window.__fx || { db: new Map(), calls: [], claims: {}, user: null, authCb: null };`;
const stubs = {
  'firebase-app.js': `${FX} export function initializeApp(cfg) { return { cfg }; }`,
  'firebase-app-check.js': `export function initializeAppCheck() { return {}; } export class ReCaptchaV3Provider { constructor() {} }`,
  'firebase-auth.js': `${FX}
    const fx = window.__fx;
    export function getAuth() { return { name: 'auth' }; }
    export function onAuthStateChanged(auth, cb) { fx.authCb = cb; setTimeout(() => cb(fx.user), 30); return () => {}; }
    export async function signOut() { fx.user = null; if (fx.authCb) await fx.authCb(null); }
    export async function signInWithEmailAndPassword() { throw new Error('not in this test'); }
    export async function createUserWithEmailAndPassword() { throw new Error('not in this test'); }
    export async function signInAnonymously() { throw new Error('anonymous sign-in is off'); }
    export async function signInWithPopup() { throw new Error('not in this test'); }
    export async function updateProfile() {}
    export class GoogleAuthProvider { setCustomParameters() {} }
    export const browserPopupRedirectResolver = {};`,
  'firebase-firestore.js': `${FX}
    const fx = window.__fx, DEL = { __del: true };
    const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
    export function getFirestore() { return { name: 'db' }; }
    export function doc(_db, ...parts) { const p = parts.join('/'); return { path: p, id: parts[parts.length - 1], kind: 'doc' }; }
    export function collection(_db, ...parts) { return { path: parts.join('/'), kind: 'col' }; }
    export function where(field, op, value) { return { field, op, value }; }
    export function orderBy() { return null; } export function limit() { return null; }
    export function query(col, ...cs) { return { path: col.path, kind: 'col', where: cs.filter(c => c && c.field) }; }
    export function deleteField() { return DEL; }
    export function increment(n) { return { __inc: n }; }
    const snap = (path, data) => ({ id: path.split('/').pop(), exists: () => data !== undefined, data: () => clone(data), ref: { path } });
    export async function getDoc(ref) { return snap(ref.path, fx.db.get(ref.path)); }
    export async function getDocs(q) {
      const depth = q.path.split('/').length + 1, out = [];
      for (const [p, v] of fx.db) {
        if (!p.startsWith(q.path + '/') || p.split('/').length !== depth) continue;
        if ((q.where || []).every(w => w.op === '==' ? v[w.field] === w.value : w.op === 'in' ? (w.value || []).includes(v[w.field]) : true)) out.push(snap(p, v));
      }
      return { forEach: fn => out.forEach(fn), docs: out, size: out.length, empty: !out.length };
    }
    export async function setDoc(ref, data, opts) {
      fx.calls.push({ op: 'set', path: ref.path });
      const prev = (opts && opts.merge) ? (fx.db.get(ref.path) || {}) : {};
      const next = Object.assign({}, prev);
      for (const [k, v] of Object.entries(clone(data) || {})) { if (v && v.__del) delete next[k]; else next[k] = v; }
      fx.db.set(ref.path, next);
    }
    export async function addDoc(col, data) { const id = 'auto' + Math.random().toString(36).slice(2, 8); await setDoc({ path: col.path + '/' + id }, data); return { id }; }
    export async function deleteDoc(ref) { fx.calls.push({ op: 'delete', path: ref.path }); fx.db.delete(ref.path); }
    export function onSnapshot(_q, cb) { try { cb({ forEach() {}, docs: [], docChanges: () => [] }); } catch (e) {} return () => {}; }
    export async function runTransaction(_db, fn) { return fn({ get: getDoc, set: (r, d, o) => setDoc(r, d, o), update: (r, d) => setDoc(r, d, { merge: true }) }); }`,
  'firebase-functions.js': `${FX}
    const fx = window.__fx;
    export function getFunctions() { return {}; }
    export function httpsCallable(_f, name) {
      return async () => {
        fx.calls.push({ op: 'call', name });
        if (name === 'grantEmployeeRole') { fx.claims = { employee: true }; return { data: { granted: true, refreshed: true } }; }
        const e = new Error(name + ' is not deployed in this test'); e.code = 'functions/not-found'; throw e;
      };
    }`,
  'firebase-ai.js': `export function getAI() { return {}; }
    export function getGenerativeModel() { return { generateContent: async () => { throw new Error('no AI in this test'); }, startChat() { return { sendMessage: async () => { throw new Error('no AI'); } }; } }; }
    export class GoogleAIBackend {} export const ResponseModality = { TEXT: 'TEXT', IMAGE: 'IMAGE' };`,
  'firebase-storage.js': `export function getStorage() { return {}; } export function ref() { return {}; }
    export async function uploadString() { return {}; } export async function getDownloadURL() { return 'https://example.invalid/x.png'; }`
};

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg' };

const browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM_PATH || undefined });
let failed = 0;
async function scenario(name, fn) {
  const page = await browser.newPage({ viewport: { width: 1360, height: 900 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const stub = url.hostname === 'www.gstatic.com' && Object.keys(stubs).find(k => url.pathname.endsWith('/' + k));
    if (stub) return route.fulfill({ status: 200, contentType: 'text/javascript', body: stubs[stub] });
    if (url.origin !== ORIGIN) return route.abort();
    const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    const file = path.join(repo, rel);
    if (!file.startsWith(repo) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return route.fulfill({ status: 404, body: '' });
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || 'application/octet-stream', body: fs.readFileSync(file) });
  });
  try {
    await fn(page, errors);
    console.log('  ok  ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n       '));
    if (errors.length) console.log('       page errors: ' + errors.slice(0, 5).join(' | '));
  } finally { await page.close(); }
}

// Seeds the database and the signed-in user BEFORE the page's module runs.
async function boot(page, user, extraDb = {}) {
  await page.addInitScript(([u, seed]) => {
    window.__fx = { db: new Map(Object.entries(seed)), calls: [], claims: {}, user: null, authCb: null };
    if (u) window.__fx.user = Object.assign({}, u, {
      providerData: [], isAnonymous: false,
      getIdTokenResult: async () => ({ claims: Object.assign({}, window.__fx.claims) }),
      getIdToken: async () => 'token'
    });
  }, [user, Object.assign({
    'config/mathAdmin': { uid: 'teacher', email: 'chungzhikai@gmail.com' },
    'users/teacher/mathQuestions/q1': { id: 'q1', title: 'Sharing sweets', level: 'P5', topics: ['Ratio'], blocks: [{ id: 'b1', type: 'text', content: 'Ali and Ben share 30 sweets in the ratio 2 : 3. How many does Ben get?' }], createdAt: '2026-10-01T00:00:00.000Z' },
    'users/teacher/mathQuestionKeys/q1': { expected: '18' }
  }, extraDb)]);
  await page.goto(ORIGIN + '/index.html');
  await page.waitForFunction(() => document.getElementById('appShell')?.classList.contains('show'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
}
// EMP_SHOTS=<dir> saves screenshots of the pill and the page, for a human to look at.
const SHOTS = process.env.EMP_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const visibleNav = page => page.$$eval('.sidebar-nav .nav-item', els => els.filter(e => e.offsetParent !== null).map(e => e.textContent.replace(/\s+/g, ' ').trim()));
const EMPLOYEE = { uid: 'emp1', email: 'pkeertana21@gmail.com', displayName: 'Keertana' };

console.log('employee browser tests');

await scenario('an employee signs in to the AUTHORING app, not the student one', async (page, errors) => {
  await boot(page, EMPLOYEE);
  assert.ok(await page.evaluate(() => document.body.classList.contains('role-employee')), 'body carries role-employee');
  const nav = await visibleNav(page);
  for (const want of ['Create Question', 'Vetting', 'Question Bank', 'Create Worksheet', 'My Worksheets', 'Work Sessions'])
    assert.ok(nav.some(t => t.includes(want)), 'menu shows ' + want + ' — got ' + JSON.stringify(nav));
  for (const never of ['Practice', 'AI Marking', 'Student Results', 'Dependency Board', 'Bin', 'Diagnostic', 'Custom Paper', 'Answer Keys', 'AI Engine', 'Hades', 'Pirate Rift', 'Crew Defense', 'Aetherfall'])
    assert.ok(!nav.some(t => t.includes(never)), never + ' must not be on an employee menu — got ' + JSON.stringify(nav));
  assert.equal(await page.textContent('#topbarTitle'), 'Create Question');
  assert.ok(await page.isVisible('#page-create'));
  assert.equal(await page.isVisible('#sidebarLevel'), false, 'no "My level" picker for an author');
  const calls = await page.evaluate(() => window.__fx.calls);
  assert.ok(calls.some(c => c.op === 'call' && c.name === 'grantEmployeeRole'), 'the claim is asked for');
  assert.ok(!calls.some(c => c.op === 'set' && c.path === 'config/mathAdmin'), 'an employee never repoints the school');
  assert.ok(!calls.some(c => c.op === 'set' && c.path.startsWith('studentProfiles/')), 'no roster row for an author');
  assert.ok(!calls.some(c => c.op === 'set' && c.path.startsWith('gameLeaderboard/')), 'no leaderboard row for an author');
  assert.deepEqual(errors, []);
});

await scenario('the ⏱️ pill is a quiet Start button, and starting it runs in the background', async (page, errors) => {
  await boot(page, EMPLOYEE);
  assert.ok(await page.isVisible('#wkChip'));
  assert.match(await page.textContent('#wkChip'), /Start work session/);
  assert.equal(await page.isVisible('#wkPop'), false, 'nothing open over the page');
  await shot(page, '1-employee-idle');
  await page.click('#wkChip');
  await page.waitForFunction(() => /\d:\d\d:\d\d/.test(document.getElementById('wkChipTime').textContent));
  assert.equal(await page.isVisible('#wkPop'), false, 'starting does not open anything');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('mathWorkSession:emp1') || 'null'));
  assert.ok(stored && stored.id.startsWith('emp1_'), 'mirrored to localStorage');
  const filed = await page.evaluate(() => [...window.__fx.db.keys()].filter(k => k.startsWith('mathWorkSessions/')));
  assert.equal(filed.length, 1, 'filed to the shared collection');
  await page.waitForTimeout(1200);
  const t = await page.textContent('#wkChipTime');
  assert.match(t, /^0:00:0[1-9]$/, 'it ticks: ' + t);
  await shot(page, '2-employee-running');
  // The popover opens only when asked, and closes on Escape.
  await page.click('#wkChip');
  assert.ok(await page.isVisible('#wkPop'));
  assert.match(await page.textContent('#wkPop'), /Break/);
  assert.match(await page.textContent('#wkPop'), /End session/);
  await shot(page, '3-employee-popover');
  await page.keyboard.press('Escape');
  assert.equal(await page.isVisible('#wkPop'), false);
  assert.deepEqual(errors, []);
});

await scenario('a question written by the employee goes into the TEACHER\'s bank and onto the session', async (page, errors) => {
  await boot(page, EMPLOYEE);
  await page.click('#wkChip');
  await page.waitForFunction(() => /\d:\d\d:\d\d/.test(document.getElementById('wkChipTime').textContent));
  await page.fill('#qTitleInput', 'Area of a rectangle');
  await page.click('.block-edit[contenteditable="true"]');
  await page.keyboard.type('A rectangle is 8 cm long and 5 cm wide. What is its area?');
  await page.fill('#qExpectedInput', '40 cm²');
  page.on('dialog', d => d.accept());
  await page.click('#saveQBtn');
  await page.waitForFunction(() => [...window.__fx.db.keys()].some(k => /^users\/teacher\/mathQuestions\/mq_/.test(k)), null, { timeout: 8000 });
  const keys = await page.evaluate(() => [...window.__fx.db.keys()]);
  assert.ok(keys.some(k => /^users\/teacher\/mathQuestionKeys\/mq_/.test(k)), 'the answer key is in the teacher\'s private half');
  assert.ok(!keys.some(k => k.startsWith('users/emp1/mathQuestions')), 'nothing filed under the employee\'s own uid');
  const session = await page.evaluate(() => JSON.parse(localStorage.getItem('mathWorkSession:emp1')));
  assert.equal(session.items.length, 1);
  assert.equal(session.items[0].title, 'Area of a rectangle');
  assert.equal(session.items[0].act, 'bank');
  assert.ok(errors.every(e => !/ReferenceError|TypeError/.test(e)), 'no script errors: ' + errors.join(' | '));
});

await scenario('a forbidden page — practice, students, the board — is rewritten to the question creator', async (page) => {
  await boot(page, EMPLOYEE);
  for (const p of ['practice', 'students', 'graph', 'diagnostic', 'bin', 'custompaper', 'answerkeys', 'tcg', 'leaderboard']) {
    await page.evaluate(pg => window.navigateTo ? window.navigateTo(pg) : document.querySelector('.nav-item[data-page="' + pg + '"]')?.click(), p);
    const active = await page.$eval('.page.active', el => el.id);
    assert.equal(active, 'page-create', p + ' must land on the creator, landed on ' + active);
  }
  // The Work Sessions page itself opens and shows the live card.
  await page.click('.nav-item[data-page="worksession"]');
  assert.ok(await page.isVisible('#page-worksession'));
  assert.match(await page.textContent('#wkPageBody'), /Start work session|Session running/);
  await shot(page, '4-employee-worksession-page');
});

await scenario('Sign out FILES the running session', async (page) => {
  await boot(page, EMPLOYEE);
  await page.click('#wkChip');
  await page.waitForTimeout(300);
  await page.click('#logoutBtn');
  await page.waitForFunction(() => !document.getElementById('appShell').classList.contains('show'));
  const doc = await page.evaluate(() => { const k = [...window.__fx.db.keys()].find(x => x.startsWith('mathWorkSessions/')); return k ? window.__fx.db.get(k) : null; });
  assert.ok(doc && doc.endedAt, 'filed with an end time');
  assert.equal(await page.evaluate(() => localStorage.getItem('mathWorkSession:emp1')), null);
  assert.equal(await page.evaluate(() => document.body.classList.contains('role-employee')), false, 'the lock is lifted for the next account');
});

await scenario('a pupil still gets the student app, with no pill and no employee lock', async (page, errors) => {
  await boot(page, { uid: 'kid1', email: 'kid@example.com', displayName: 'Kid' });
  assert.equal(await page.evaluate(() => document.body.classList.contains('role-employee')), false);
  assert.equal(await page.isVisible('#wkSlot'), false);
  const nav = await visibleNav(page);
  assert.ok(nav.some(t => t.includes('Practice')));
  assert.ok(!nav.some(t => t.includes('Work Sessions')));
  assert.ok(!nav.some(t => t.includes('Create Question')));
  assert.ok(errors.every(e => !/ReferenceError|TypeError/.test(e)), 'no script errors: ' + errors.join(' | '));
});

await scenario('the teacher sees no pill until clocked on, and reads the employee\'s session', async (page, errors) => {
  const filed = { id: 'emp1_1760000000000', subject: 'math', uid: 'emp1', email: 'pkeertana21@gmail.com', name: 'Keertana', role: 'employee',
    startedAt: 1760000000000, endedAt: 1760000000000 + 2 * 3600000, ms: 2 * 3600000, activeMs: 90 * 60000, actMins: Array.from({ length: 90 }, (_, i) => i),
    pausedMs: 0, questions: 3, saves: 4, items: [{ id: 'mq_1', title: 'Ratio', level: 'P5', topic: 'Ratio', at: 1760000100000, last: 1760000100000, n: 1, act: 'bank' }] };
  await boot(page, { uid: 'teacher', email: 'chungzhikai@gmail.com', displayName: 'Mr Chung' }, { ['mathWorkSessions/' + filed.id]: filed });
  assert.equal(await page.isVisible('#wkSlot'), false, 'no pill nobody asked for in the teacher\'s top bar');
  await page.click('.nav-item[data-page="worksession"]');
  await page.waitForFunction(() => /Keertana/.test(document.getElementById('wkPageBody').textContent));
  const body = await page.textContent('#wkPageBody');
  assert.match(body, /2h/);
  assert.match(body, /1h 30m active/);
  assert.match(body, /Everyone/);
  await shot(page, '5-teacher-worksession-page');
  assert.ok(errors.every(e => !/ReferenceError|TypeError/.test(e)), 'no script errors: ' + errors.join(' | '));
});

await browser.close();
if (failed) { console.log(failed + ' scenario(s) failed'); process.exit(1); }
console.log('all employee browser scenarios passed');
