// 🧩 Question charts and their apps, in a REAL browser on the REAL page
// (v1.93.0). The Firebase stand-ins are the employee harness's, copied so the
// two files can change independently.
//
// The whole of index.html is loaded and its own module runs. Only Firebase is
// replaced — by small in-memory stand-ins served in place of the gstatic SDK
// files — so the sign-in path, the sidebar lockdown, the navigation guard, the
// ⏱️ pill and a question saved from the editor are all the production code.
// Nothing leaves the machine: every other request is aborted.
//
//   npm install playwright   (or PLAYWRIGHT_MODULE=<path to playwright>)
//   node tools/question-chart-browser-tests.mjs
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
      return async function () {
        fx.calls.push({ op: 'call', name });
        if (name === 'grantEmployeeRole') { fx.claims = { employee: true }; return { data: { granted: true, refreshed: true } }; }
        if (name === 'generateChartApp') {
          const d = arguments[0] || {};
          fx.calls.push({ op: 'gen', data: d });
          return { data: { html: '<!DOCTYPE html><html><body style="font-family:sans-serif;background:#FAFAFA"><main><h1>Bar model</h1><input type=range id=r><script>document.getElementById("r").oninput=()=>{};<\/script></main></body></html>', model: d.model, effort: d.effort, size: d.size } };
        }
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
// QC_SHOTS=<dir> saves screenshots of the pill and the page, for a human to look at.
const SHOTS = process.env.QC_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const visibleNav = page => page.$$eval('.sidebar-nav .nav-item', els => els.filter(e => e.offsetParent !== null).map(e => e.textContent.replace(/\s+/g, ' ').trim()));
const EMPLOYEE = { uid: 'emp1', email: 'pkeertana21@gmail.com', displayName: 'Keertana' };


const TEACHER = { uid: 'teacher', email: 'chungzhikai@gmail.com', displayName: 'Mr Chung' };
const BOARD = {
  'users/teacher/mathQuestions/q2': { id: 'q2', title: 'Fraction of 30', level: 'P4', topics: ['Fractions'], blocks: [{ id: 'b2', type: 'text', content: 'Find 2/5 of 30.' }], createdAt: '2026-10-01T00:00:00.000Z' },
  'users/teacher/mathQuestionGraph/main': { nodes: { q1: { x: 0, y: 0 }, q2: { x: 300, y: 0 } }, edges: [{ id: 'g1', from: 'q2', to: 'q1', kind: 'prereq', comment: 'finds a fraction of a quantity' }] }
};
const openChart = async page => {
  await page.evaluate(() => document.querySelector('.nav-item[data-page="bank"]').click());
  await page.waitForSelector('[data-qchart="q1"]');
  await page.click('[data-qchart="q1"]');
  await page.waitForSelector('#page-qchart.active .qc-node');
  await page.waitForTimeout(900);   // the debounced save
};

console.log('question chart browser tests');

await scenario('a chart opens from the bank, seeded from the board, and saves with no answer in it', async (page, errors) => {
  await boot(page, TEACHER, BOARD);
  await openChart(page);
  assert.equal(await page.textContent('#topbarTitle'), 'Dependency Chart');
  const keys = await page.$$eval('#qcWorld .qc-node', els => els.map(e => e.dataset.key).sort());
  assert.deepEqual(keys, ['q:q1', 'q:q2']);
  assert.match(await page.textContent('[data-key="q:q2"] .qc-checks'), /finds a fraction of a quantity/);
  const saved = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  assert.ok(saved, 'chart document written');
  assert.ok(!/"18"|expected|markingGuide|Ali and Ben|Find 2\/5/.test(JSON.stringify(saved)), 'no wording or answer: ' + JSON.stringify(saved));
  assert.equal(saved.edges.length, 1);
  await shot(page, '1-chart-seeded');
  assert.deepEqual(errors, []);
});

await scenario('a linked app is added, drawn as an app node and saved', async (page, errors) => {
  await boot(page, TEACHER, BOARD);
  await openChart(page);
  await page.click('#qcAddAppBtn');
  await page.click('#qcAppTab-url');
  await page.fill('#qcAppUrl', 'https://polymathlc.github.io/fractions/');
  await page.fill('#qcAppUrlTitle', 'Fraction bars');
  await page.click('#qcAppUrlSaveBtn');
  await page.waitForSelector('.qc-node.qc-app');
  const apps = await page.evaluate(() => [...window.__fx.db.keys()].filter(k => k.includes('/app__')));
  assert.equal(apps.length, 1);
  await page.waitForTimeout(900);
  const chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  assert.ok(chart.edges.some(e => e.from.startsWith('app:') && e.to === 'q:q1'), 'app linked to the question');
  await page.click('.qc-node.qc-app [data-act="open"]');
  const sb = await page.getAttribute('#qcViewFrameWrap iframe', 'sandbox');
  assert.ok(!/allow-same-origin/.test(sb), 'linked frame sandbox: ' + sb);
  assert.ok(await page.isVisible('#qcViewExternal'));
  assert.deepEqual(errors, []);
});

await scenario('an app is generated with Sol at the chosen effort and size, previewed sandboxed, then saved', async (page, errors) => {
  await boot(page, TEACHER, BOARD);
  await openChart(page);
  await page.click('[data-key="q:q2"] [data-act="addapp"]');
  assert.ok(await page.isVisible('#qcAppEffortWrap'), 'Sol shows the effort picker');
  assert.match(await page.inputValue('#qcAppBrief'), /finds a fraction of a quantity/);
  await page.selectOption('#qcAppEffort', 'high');
  await page.selectOption('#qcAppSize', 'rich');
  await page.click('#qcAppGenBtn');
  await page.waitForSelector('#qcAppPreviewWrap', { state: 'visible' });
  const gen = await page.evaluate(() => window.__fx.calls.filter(c => c.op === 'gen').map(c => c.data));
  assert.equal(gen.length, 1);
  assert.deepEqual([gen[0].model, gen[0].effort, gen[0].size], ['gpt-6.1-sol', 'high', 'rich']);
  assert.match(gen[0].prompt, /Find 2\/5 of 30/, 'the step it was made for is in the brief');
  assert.equal(await page.getAttribute('#qcAppFrame', 'sandbox'), 'allow-scripts');
  await shot(page, '2-app-generated');
  await page.click('#qcAppSaveBtn');
  await page.waitForSelector('.qc-node.qc-app');
  const app = await page.evaluate(() => { const k = [...window.__fx.db.keys()].find(x => x.includes('/app__')); return window.__fx.db.get(k); });
  assert.equal(app.model, 'gpt-6.1-sol'); assert.equal(app.effort, 'high'); assert.equal(app.size, 'rich');
  assert.match(app.html, /Bar model/);
  await page.waitForTimeout(900);
  const chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  assert.ok(chart.edges.some(e => e.from.startsWith('app:') && e.to === 'q:q2'), 'app linked to the step it was made for');
  await page.click('#qcTidyBtn');
  await page.waitForTimeout(300);
  await shot(page, '3-chart-with-app');
  assert.deepEqual(errors, []);
});

await scenario('Luna hides the effort picker and sends no effort', async (page, errors) => {
  await boot(page, TEACHER, BOARD);
  await openChart(page);
  await page.click('#qcAddAppBtn');
  await page.check('input[name="qcAppModel"][value="gpt-6-luna"]');
  assert.equal(await page.isVisible('#qcAppEffortWrap'), false);
  await page.selectOption('#qcAppSize', 'compact');
  await page.click('#qcAppGenBtn');
  await page.waitForSelector('#qcAppPreviewWrap', { state: 'visible' });
  const gen = await page.evaluate(() => window.__fx.calls.filter(c => c.op === 'gen').map(c => c.data));
  assert.deepEqual([gen[0].model, gen[0].effort, gen[0].size], ['gpt-6-luna', '', 'compact']);
  assert.deepEqual(errors, []);
});

await scenario('a step question is added under the root and linked; a loop is refused', async (page, errors) => {
  await boot(page, TEACHER, Object.assign({}, BOARD, {
    'users/teacher/mathQuestions/q3': { id: 'q3', title: 'Ratio basics', level: 'P5', topics: ['Ratio'], blocks: [{ id: 'b3', type: 'text', content: 'Share 10 in the ratio 2 : 3.' }], createdAt: '2026-10-01T00:00:00.000Z' }
  }));
  await openChart(page);
  await page.click('[data-key="q:q2"] [data-act="pickstep"]');
  await page.fill('#qcPickerSearch', 'Ratio basics');
  await page.click('#qcPickerList .graph-picker-item');
  await page.waitForSelector('[data-key="q:q3"]');
  await page.waitForTimeout(900);
  let chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  assert.ok(chart.edges.some(e => e.from === 'q:q3' && e.to === 'q:q2'), 'q3 → q2');
  await page.click('[data-key="q:q2"] [data-act="link"]');
  await page.click('[data-key="q:q3"] .gnode-head');
  await page.waitForTimeout(900);
  chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  assert.ok(!chart.edges.some(e => e.from === 'q:q2' && e.to === 'q:q3'), 'loop refused');
  assert.deepEqual(errors, []);
});

// ---- v1.94.0: ➕ and ⏭ open a COPY in the editor, and Save comes back -------------------
const bankIds = page => page.evaluate(() => [...window.__fx.db.keys()]
  .filter(k => /^users\/teacher\/mathQuestions\//.test(k)).map(k => k.split('/').pop()).sort());
const editorOpen = async page => {
  await page.waitForSelector('#page-create.active #qcSpawnBar:not([hidden])');
  await page.waitForTimeout(200);
};

await scenario('➕ opens a copy of the question in the editor; Save adds it as a step and comes back', async (page, errors) => {
  page.on('dialog', d => d.accept());           // the duplicate warning, if the copy is close enough to ask
  await boot(page, TEACHER, BOARD);
  await openChart(page);
  const before = await bankIds(page);
  await page.click('[data-key="q:q1"] [data-act="addstep"]');
  await editorOpen(page);
  assert.equal(await page.isVisible('#qcPickerOverlay'), false, 'no list by default');
  assert.equal(await page.inputValue('#qTitleInput'), 'Sharing sweets', 'a copy of the question');
  assert.match(await page.textContent('#qcSpawnBar'), /New easier step[\s\S]*Sharing sweets/);
  assert.equal(await page.getAttribute('#qcSpawnBar [data-qc-regen="easier"]', 'class'), 'btn btn-sm btn-primary', 'easier is the suggested regenerate');
  assert.equal(await page.textContent('#saveQBtn'), '💾 Save and add to the chart');
  await shot(page, '7-editor-copy');
  await page.fill('#qTitleInput', 'Sharing stickers');
  await page.click('#saveQBtn');
  await page.waitForSelector('#page-qchart.active');
  assert.match(await page.textContent('#toast'), /added to the chart as an easier step/);
  await page.waitForTimeout(900);
  const after = await bankIds(page);
  const added = after.filter(id => !before.includes(id));
  assert.equal(added.length, 1, 'one new bank question: ' + JSON.stringify(after));
  assert.notEqual(added[0], 'q1');
  const orig = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestions/q1'));
  assert.equal(orig.title, 'Sharing sweets', 'the original is untouched');
  const copy = await page.evaluate(id => window.__fx.db.get('users/teacher/mathQuestions/' + id), added[0]);
  assert.equal(copy.title, 'Sharing stickers');
  assert.ok(!copy.variantOf, 'no variantOf on a chart step');
  const chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  assert.ok(chart.edges.some(e => e.from === 'q:' + added[0] && e.to === 'q:q1'), 'new step → question: ' + JSON.stringify(chart.edges));
  assert.ok(await page.isVisible('[data-key="q:' + added[0] + '"]'), 'drawn on the chart');
  await shot(page, '8-chart-after-step');
  assert.deepEqual(errors, []);
});

await scenario('➕ on a step copies THAT step and files the new one under it', async (page, errors) => {
  page.on('dialog', d => d.accept());
  await boot(page, TEACHER, Object.assign({}, BOARD, { 'users/teacher/mathQuestionKeys/q2': { expected: '12' } }));
  await openChart(page);
  const before = await bankIds(page);
  await page.click('[data-key="q:q2"] [data-act="addstep"]');
  await editorOpen(page);
  assert.equal(await page.inputValue('#qTitleInput'), 'Fraction of 30');
  await page.fill('#qTitleInput', 'Fraction of 20');
  await page.click('#saveQBtn');
  await page.waitForSelector('#page-qchart.active');
  await page.waitForTimeout(900);
  const added = (await bankIds(page)).filter(id => !before.includes(id));
  const chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  assert.ok(chart.edges.some(e => e.from === 'q:' + added[0] && e.to === 'q:q2'), 'under q2');
  assert.deepEqual(errors, []);
});

await scenario('⏭ harder makes a next question above the question, with no arrow into the steps', async (page, errors) => {
  page.on('dialog', d => d.accept());
  await boot(page, TEACHER, BOARD);
  await openChart(page);
  const before = await bankIds(page);
  await page.click('#qcAddNextBtn');
  await page.waitForSelector('#qcNextOverlay.show');
  await shot(page, '9-next-chooser');
  await page.click('#qcNextOverlay .qc-next-choice[data-qc-next="harder"]');
  await editorOpen(page);
  assert.match(await page.textContent('#qcSpawnBar'), /next question · harder/);
  assert.equal(await page.getAttribute('#qcSpawnBar [data-qc-regen="harder"]', 'class'), 'btn btn-sm btn-primary', 'harder is the suggested regenerate');
  await page.fill('#qTitleInput', 'Sharing sweets three ways');
  await page.click('#saveQBtn');
  await page.waitForSelector('#page-qchart.active');
  await page.waitForTimeout(900);
  const added = (await bankIds(page)).filter(id => !before.includes(id));
  assert.equal(added.length, 1);
  const chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  const key = 'q:' + added[0];
  assert.equal(chart.nodes[key].tier, 'harder');
  assert.ok(chart.nodes[key].y < chart.nodes['q:q1'].y, 'above the question');
  assert.ok(!chart.edges.some(e => e.from === key || e.to === key), 'not a step');
  assert.ok(await page.isVisible('[data-key="' + key + '"].qc-next'), 'drawn as a next question');
  assert.equal(await page.$$eval('#qcEdges .qc-next-line', els => els.length), 1, 'one dashed line up to it');
  await shot(page, '10-chart-with-next');
  assert.deepEqual(errors, []);
});

await scenario('⏭ from the bank adds an existing question as a same-level next question', async (page, errors) => {
  await boot(page, TEACHER, Object.assign({}, BOARD, {
    'users/teacher/mathQuestions/q3': { id: 'q3', title: 'Sharing marbles', level: 'P5', topics: ['Ratio'], blocks: [{ id: 'b3', type: 'text', content: 'Share 40 marbles in the ratio 3 : 5.' }], createdAt: '2026-10-01T00:00:00.000Z' }
  }));
  await openChart(page);
  await page.click('[data-key="q:q1"] [data-act="addnext"]');
  await page.click('#qcNextOverlay [data-qc-next="same"][data-qc-bank]');
  await page.waitForSelector('#qcPickerOverlay.show');
  assert.match(await page.textContent('#qcPickerHeading'), /next question \(same level\)/);
  await page.fill('#qcPickerSearch', 'marbles');
  await page.click('#qcPickerList .graph-picker-item');
  await page.waitForSelector('[data-key="q:q3"].qc-next');
  await page.waitForTimeout(900);
  const chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  assert.equal(chart.nodes['q:q3'].tier, 'same');
  assert.deepEqual(errors, []);
});

await scenario('↩ Back to the chart adds nothing and leaves no chart step behind in the editor', async (page, errors) => {
  page.on('dialog', d => d.accept());
  await boot(page, TEACHER, BOARD);
  await openChart(page);
  await page.click('#qcAddStepBtn');
  await editorOpen(page);
  await page.click('#qcSpawnBar [data-qc-back]');
  await page.waitForSelector('#page-qchart.active');
  assert.equal(await page.isVisible('#qcSpawnBar'), false, 'the bar is gone');
  await page.waitForTimeout(900);
  let chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  const nodesBefore = Object.keys(chart.nodes).sort();
  // A plain new question typed into the editor afterwards is just a question.
  await page.evaluate(() => document.querySelector('.nav-item[data-page="create"]').click());
  await page.waitForSelector('#page-create.active');
  assert.equal(await page.isVisible('#qcSpawnBar'), false);
  chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  assert.deepEqual(Object.keys(chart.nodes).sort(), nodesBefore, 'nothing joined the chart');
  assert.deepEqual(errors, []);
});

await scenario('a pupil never reaches the chart page', async (page, errors) => {
  await boot(page, { uid: 'kid', email: 'kid@example.com', displayName: 'Kid' }, BOARD);
  assert.equal(await page.isVisible('#page-qchart'), false);
  assert.equal(await page.$('[data-qchart]'), null, 'no chart buttons anywhere');
  assert.equal(await page.isVisible('#qcEditorChartBtn'), false);
});

await browser.close();
if (failed) { console.log(failed + ' question chart browser scenario(s) FAILED'); process.exit(1); }
console.log('all question chart browser scenarios passed');
