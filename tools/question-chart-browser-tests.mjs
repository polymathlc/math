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
    // A scenario that sets window.__fx.ai answers text calls itself; every other scenario has no AI.
    export function getGenerativeModel() { return { generateContent: async req => {
      const fx = window.__fx;
      if (!fx || !fx.ai) throw new Error('no AI in this test');
      const prompt = req.contents[0].parts[0].text;
      fx.calls.push({ op: 'ai', prompt });
      const text = String(await fx.ai(prompt));
      return { response: { text: () => text } };
    }, startChat() { return { sendMessage: async () => { throw new Error('no AI'); } }; } }; }
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
  assert.match(gen[0].prompt, /THE QUESTION \(solve exactly this one\):\n[^\n]*Find 2\/5 of 30/, 'the step it was made for is the question it solves');
  assert.match(gen[0].prompt, /Never set up a different, hypothetical/, 'no parallel story');
  assert.doesNotMatch(gen[0].prompt, /use different numbers|Never solve the original/i, 'the old rule is gone');
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
  assert.equal(copy.foundationOf, 'q1', 'a ➕ step is a foundation of the question it sits under');
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
  const nq = await page.evaluate(id => window.__fx.db.get('users/teacher/mathQuestions/' + id), added[0]);
  assert.ok(!nq.foundationOf, 'a next question is not held back for a miss');
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

// ---- v1.95.0: 🧩 Foundational questions — the question broken into its parts ----------------
const PARTS = JSON.stringify({ parts: [
  { title: 'Packets of candies', questionText: 'Xiao Hua bought 8 packets of candies. Each packet contains 22 candies. How many candies did he buy?', expected: '176', markingGuide: '8 × 22 = 176', checks: 'multiplies a 2-digit number by a 1-digit number' },
  { title: 'Candies in each bag', questionText: 'Xiao Hua has 176 candies. He packed his candies into 4 bags. How many candies are there in each bag?', expected: '44', markingGuide: '176 ÷ 4 = 44', checks: 'divides a 3-digit number by a 1-digit number' }
] });
// The AI stand-in: the break-down prompt gets the parts, the checker agrees
// with the first part and flags the second, anything else gets an empty reply.
const fakeAi = page => page.evaluate(parts => {
  window.__fx.ai = async prompt => {
    if (/FOUNDATIONAL questions/.test(prompt)) { await new Promise(r => setTimeout(r, window.__fx.aiDelay || 50)); return parts; }
    if (/meticulous Singapore primary-school math checker/.test(prompt)) {
      return /8 packets/.test(prompt)
        ? JSON.stringify({ makesSense: true, issues: '', expected: '176 candies', markingGuide: '8 × 22 = 176 candies' })
        : JSON.stringify({ makesSense: false, issues: 'Say whether every bag has the same number.', expected: '44', markingGuide: '176 ÷ 4 = 44' });
    }
    return '{}';
  };
}, PARTS);

await scenario('🧩 breaks the question into its parts, and Add files each one as a step under it', async (page, errors) => {
  page.on('dialog', d => d.accept());   // "1 of these was flagged — add anyway?"
  await boot(page, TEACHER, BOARD);
  await fakeAi(page);
  await openChart(page);
  const before = await bankIds(page);
  await page.click('#qcBreakBtn');
  await page.waitForSelector('#qcBreakOverlay.show');
  await page.waitForSelector('#qcBreakList .qc-break-part:nth-child(2)');
  await page.waitForFunction(() => document.querySelectorAll('#qcBreakList .qc-break-badge.ok, #qcBreakList .qc-break-badge.flag').length === 2);
  const sent = await page.evaluate(() => window.__fx.calls.filter(c => c.op === 'ai' && /FOUNDATIONAL/.test(c.prompt)).map(c => c.prompt));
  assert.equal(sent.length, 1, 'one break-down call');
  assert.match(sent[0], /Ali and Ben share 30 sweets/, 'the question is in the prompt');
  assert.match(sent[0], /Xiao Hua has 176 candies/, 'the worked example is in the prompt');
  assert.match(sent[0], /not because the numbers are small/);
  assert.equal(await page.inputValue('#qcBreakList .qc-break-part:nth-child(1) [data-f="expected"]'), '176 candies', 'the checker\'s verified answer');
  assert.match(await page.textContent('#qcBreakList .qc-break-part:nth-child(2)'), /Check this one[\s\S]*same number/);
  assert.equal(await page.textContent('#qcBreakAddBtn'), 'Add 2 to the bank and chart');
  await shot(page, '11-foundational-review');
  await page.fill('#qcBreakList .qc-break-part:nth-child(2) [data-f="questionText"]', 'Xiao Hua has 176 candies. He packed them equally into 4 bags. How many candies are there in each bag?');
  await page.click('#qcBreakAddBtn');
  await page.waitForSelector('#qcBreakOverlay', { state: 'hidden' });
  await page.waitForTimeout(1000);
  const added = (await bankIds(page)).filter(id => !before.includes(id));
  assert.equal(added.length, 2, 'two new bank questions');
  const qs = await page.evaluate(ids => ids.map(id => Object.assign({}, window.__fx.db.get('users/teacher/mathQuestions/' + id), window.__fx.db.get('users/teacher/mathQuestionKeys/' + id) || {})), added);
  const byTitle = Object.fromEntries(qs.map(q => [q.title, q]));
  assert.ok(byTitle['Packets of candies'] && byTitle['Candies in each bag'], JSON.stringify(qs.map(q => q.title)));
  assert.equal(byTitle['Candies in each bag'].blocks[0].content, 'Xiao Hua has 176 candies. He packed them equally into 4 bags. How many candies are there in each bag?', 'the teacher\'s edit was saved');
  assert.equal(byTitle['Packets of candies'].expected, '176 candies');
  assert.equal(byTitle['Packets of candies'].level, 'P5', 'the question\'s level');
  assert.ok(qs.every(q => !q.variantOf), 'no variantOf');
  assert.ok(qs.every(q => !('checks' in q)), 'the checks line is on the chart, not the question');
  assert.ok(qs.every(q => q.foundationOf === 'q1'), 'each part is shown only after a miss on the question');
  const chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  for (const q of qs) assert.ok(chart.edges.some(e => e.from === 'q:' + q.id && e.to === 'q:q1'), q.title + ' → the question');
  assert.equal(chart.nodes['q:' + byTitle['Packets of candies'].id].checks, 'multiplies a 2-digit number by a 1-digit number');
  assert.ok(chart.nodes['q:' + byTitle['Packets of candies'].id].x < chart.nodes['q:' + byTitle['Candies in each bag'].id].x, 'in solving order, left to right');
  await shot(page, '12-chart-with-foundational');
  assert.deepEqual(errors, []);
});

await scenario('🧩 on a step breaks THAT step down, and an unticked part is not added', async (page, errors) => {
  await boot(page, TEACHER, BOARD);
  await fakeAi(page);
  await openChart(page);
  const before = await bankIds(page);
  await page.click('[data-key="q:q2"] [data-act="breakdown"]');
  await page.waitForSelector('#qcBreakList .qc-break-part:nth-child(2)');
  assert.match(await page.textContent('#qcBreakHeading'), /Fraction of 30/);
  const sent = await page.evaluate(() => window.__fx.calls.filter(c => c.op === 'ai' && /FOUNDATIONAL/.test(c.prompt)).map(c => c.prompt));
  assert.match(sent[0], /Find 2\/5 of 30/, 'the step\'s own wording');
  await page.waitForFunction(() => document.querySelectorAll('#qcBreakList .qc-break-badge.ok, #qcBreakList .qc-break-badge.flag').length === 2);
  await page.click('#qcBreakList .qc-break-part:nth-child(2) [data-f="include"]');
  assert.equal(await page.textContent('#qcBreakAddBtn'), 'Add 1 to the bank and chart');
  await page.click('#qcBreakAddBtn');
  await page.waitForSelector('#qcBreakOverlay', { state: 'hidden' });
  await page.waitForTimeout(1000);
  const added = (await bankIds(page)).filter(id => !before.includes(id));
  assert.equal(added.length, 1);
  const chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  assert.ok(chart.edges.some(e => e.from === 'q:' + added[0] && e.to === 'q:q2'), 'under the step');
  const part = await page.evaluate(id => window.__fx.db.get('users/teacher/mathQuestions/' + id), added[0]);
  assert.equal(part.foundationOf, 'q2', 'a foundation of the step it was broken out of');
  assert.deepEqual(errors, []);
});

await scenario('🧩 closed before the AI answers writes nothing and fills nothing', async (page, errors) => {
  await boot(page, TEACHER, BOARD);
  await fakeAi(page);
  await page.evaluate(() => { window.__fx.aiDelay = 800; });
  await openChart(page);
  const before = await bankIds(page);
  await page.click('#qcBreakBtn');
  await page.waitForSelector('#qcBreakStatus.busy');
  await page.click('#qcBreakOverlay [data-close="qcBreakOverlay"].close');
  await page.waitForTimeout(1300);
  assert.equal(await page.isVisible('#qcBreakOverlay'), false);
  assert.equal(await page.$$eval('#qcBreakList .qc-break-part', els => els.length), 0, 'the late reply filled nothing');
  assert.deepEqual(await bankIds(page), before, 'nothing saved');
  assert.deepEqual(errors, []);
});

await scenario('🔒 on a bank-picked step keeps it for after a miss, and 🔓 puts it back', async (page, errors) => {
  await boot(page, TEACHER, BOARD);
  await openChart(page);
  assert.match(await page.textContent('[data-key="q:q2"] .qc-found'), /ordinary practice/, 'a board step starts in ordinary practice');
  await page.click('[data-key="q:q2"] [data-act="found"]');
  await page.waitForSelector('[data-key="q:q2"] .qc-found.on');
  await page.waitForTimeout(300);
  let q2 = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestions/q2'));
  assert.equal(q2.foundationOf, 'q1');
  assert.equal(q2.title, 'Fraction of 30', 'only the one field was written');
  await shot(page, '13-locked-step');
  await page.click('[data-key="q:q2"] [data-act="found"]');
  await page.waitForSelector('[data-key="q:q2"] .qc-found:not(.on)');
  await page.waitForTimeout(300);
  q2 = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestions/q2'));
  assert.ok(!('foundationOf' in q2), 'cleared');
  assert.deepEqual(errors, []);
});

// ---- v1.97.0: every question, from the chart page; Save and Cancel come back to it ----------
await scenario('🧩 nav opens the chart page; ＋ New question saves and lands on its own chart', async (page, errors) => {
  page.on('dialog', d => d.accept());
  await boot(page, TEACHER, BOARD);
  await page.evaluate(() => document.querySelector('.nav-item[data-page="qchart"]').click());
  await page.waitForSelector('#page-qchart.active #qcEmpty:not([hidden])');
  assert.equal(await page.isVisible('#qcViewport'), false, 'no chart drawn with no question chosen');
  assert.equal(await page.isDisabled('#qcBreakBtn'), true, 'chart tools wait for a question');
  await shot(page, '14-chart-front-door');
  const before = await bankIds(page);
  await page.click('#qcEmpty [data-qc-empty="new"]');
  await page.waitForSelector('#page-create.active #qcSpawnBar:not([hidden])');
  assert.match(await page.textContent('#qcSpawnBar'), /New question/);
  assert.equal(await page.textContent('#saveQBtn'), '💾 Save and open its chart');
  await page.fill('#qTitleInput', 'Fruit tarts on trays');
  await page.click('#page-create .block-body [contenteditable="true"]');
  await page.keyboard.type('Xiao Ming bought 7 boxes of 24 fruit tarts and shared them equally on 4 trays. How many were on each tray?');
  await page.fill('#qExpectedInput', '42');
  await page.click('#saveQBtn');
  await page.waitForSelector('#page-qchart.active #qcViewport .qc-node.qc-root');
  assert.match(await page.textContent('#qcTitle'), /Fruit tarts on trays/, 'its own chart');
  const added = (await bankIds(page)).filter(id => !before.includes(id));
  assert.equal(added.length, 1, 'one new bank question');
  const nq = await page.evaluate(id => window.__fx.db.get('users/teacher/mathQuestions/' + id), added[0]);
  assert.ok(!nq.foundationOf, 'a main question is not a foundational step');
  await page.waitForTimeout(900);
  assert.ok(await page.evaluate(id => !!window.__fx.db.get('users/teacher/mathQuestionGraph/chart__' + id), added[0]), 'its chart is saved');
  assert.equal(await page.isDisabled('#qcBreakBtn'), false, 'ready for 🧩');
  assert.deepEqual(errors, []);
});

await scenario('＋ New question then Cancel goes back to the chart it came from, adding nothing', async (page, errors) => {
  await boot(page, TEACHER, BOARD);
  await openChart(page);
  const before = await bankIds(page);
  await page.click('#qcNewBtn');
  await page.waitForSelector('#page-create.active');
  await page.click('#cancelEditBtn');
  await page.waitForSelector('#page-qchart.active');
  assert.match(await page.textContent('#qcTitle'), /Sharing sweets/);
  assert.deepEqual(await bankIds(page), before);
  assert.equal(await page.isVisible('#qcSpawnBar'), false);
  assert.deepEqual(errors, []);
});

await scenario('✏️ on a card edits that question; Save and Cancel both come back to the chart', async (page, errors) => {
  page.on('dialog', d => d.accept());
  await boot(page, TEACHER, Object.assign({}, BOARD, { 'users/teacher/mathQuestionKeys/q2': { expected: '12' } }));
  await openChart(page);
  await page.click('[data-key="q:q2"] [data-act="editq"]');
  await page.waitForSelector('#page-create.active');
  assert.equal(await page.inputValue('#qTitleInput'), 'Fraction of 30');
  await page.click('#cancelEditBtn');
  await page.waitForSelector('#page-qchart.active');
  await page.click('[data-key="q:q2"] [data-act="editq"]');
  await page.waitForSelector('#page-create.active');
  await page.fill('#qTitleInput', 'Two fifths of 30');
  await page.click('#saveQBtn');
  await page.waitForSelector('#page-qchart.active');
  await page.waitForTimeout(300);
  assert.match(await page.textContent('[data-key="q:q2"] .gnode-title'), /Two fifths of 30/, 'the card shows the edit');
  const q2 = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestions/q2'));
  assert.equal(q2.title, 'Two fifths of 30', 'saved over the same question, not a copy');
  assert.match(await page.textContent('#qcTitle'), /Sharing sweets/, 'the same chart');
  assert.deepEqual(errors, []);
});

await scenario('📂 Open question switches to another question\'s chart', async (page, errors) => {
  await boot(page, TEACHER, BOARD);
  await openChart(page);
  await page.click('#qcOpenBtn');
  await page.waitForSelector('#qcPickerOverlay.show');
  assert.match(await page.textContent('#qcPickerHeading'), /Open a question's chart/);
  assert.doesNotMatch(await page.textContent('#qcPickerList'), /Sharing sweets/, 'not the one already open');
  await page.fill('#qcPickerSearch', 'Fraction');
  await page.click('#qcPickerList .graph-picker-item');
  await page.waitForSelector('#page-qchart.active .qc-node.qc-root[data-key="q:q2"]');
  assert.match(await page.textContent('#qcTitle'), /Fraction of 30/);
  assert.deepEqual(errors, []);
});

// ---- v1.98.0: ◀ ▶ and drag set which step is done first, and where it leads ----------------------
const ORDER_DB = Object.assign({}, BOARD, {
  'users/teacher/mathQuestions/s1': { id: 's1', title: 'Multiply first', level: 'P4', topics: ['Whole numbers'], foundationOf: 'q1', createdAt: '2026-10-11T10:00:01.000Z', blocks: [{ id: 'x1', type: 'text', content: '8 × 22 = ?' }] },
  'users/teacher/mathQuestions/s2': { id: 's2', title: 'Then divide', level: 'P4', topics: ['Whole numbers'], foundationOf: 'q1', createdAt: '2026-10-11T10:00:02.000Z', blocks: [{ id: 'x2', type: 'text', content: '176 ÷ 4 = ?' }] },
  'users/teacher/mathQuestionGraph/chart__q1': { root: 'q1', nodes: { 'q:q1': { x: 0, y: 0 }, 'q:s1': { x: -300, y: 230 }, 'q:s2': { x: 0, y: 230 }, 'q:q2': { x: 300, y: 230 } },
    edges: [{ id: 'e1', from: 'q:s1', to: 'q:q1' }, { id: 'e2', from: 'q:s2', to: 'q:q1' }, { id: 'e3', from: 'q:q2', to: 'q:q1' }] }
});
await scenario('▶ moves a step later, and pupils get the steps in the new order', async (page, errors) => {
  await boot(page, TEACHER, ORDER_DB);
  await openChart(page);
  assert.match(await page.textContent('[data-key="q:s1"] .qc-order'), /Do 1st of 3/);
  assert.equal(await page.isDisabled('[data-key="q:s1"] [data-act="left"]'), true, 'nothing before the first');
  await page.click('[data-key="q:s1"] [data-act="right"]');
  await page.waitForFunction(() => /Do 2nd of 3/.test(document.querySelector('[data-key="q:s1"] .qc-order').textContent));
  assert.match(await page.textContent('[data-key="q:s2"] .qc-order'), /Do 1st of 3/);
  await page.waitForTimeout(1000);
  const s1 = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestions/s1'));
  const s2 = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestions/s2'));
  assert.deepEqual([s2.foundationRank, s1.foundationRank], [0, 1], 'the order is on the held-back steps');
  assert.equal(s1.title, 'Multiply first', 'only the order field was written');
  const q2 = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestions/q2'));
  assert.ok(!('foundationRank' in q2), 'an ordinary question is left alone');
  const chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  assert.ok(chart.nodes['q:s2'].x < chart.nodes['q:s1'].x, 'the chart itself is the order');
  await shot(page, '15-step-order');
  assert.deepEqual(errors, []);
});
await scenario('dragging a step onto another card makes it a step of that question', async (page, errors) => {
  await boot(page, TEACHER, ORDER_DB);
  await openChart(page);
  const from = await page.$eval('[data-key="q:s2"]', el => { const r = el.getBoundingClientRect(); return { x: r.left + 40, y: r.top + 14 }; });
  const to = await page.$eval('[data-key="q:q2"]', el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 6 });
  await page.mouse.move(to.x, to.y, { steps: 6 });
  assert.ok(await page.$('[data-key="q:q2"].qc-drop'), 'the card it will land on is lit');
  await page.mouse.up();
  await page.waitForTimeout(1100);
  const chart = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestionGraph/chart__q1'));
  assert.ok(chart.edges.some(e => e.from === 'q:s2' && e.to === 'q:q2'), 'now under q2');
  assert.ok(!chart.edges.some(e => e.from === 'q:s2' && e.to === 'q:q1'), 'its old arrow is gone');
  assert.ok(chart.nodes['q:s2'].y > chart.nodes['q:q2'].y, 'placed below its new question');
  const s2 = await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestions/s2'));
  assert.equal(s2.foundationOf, 'q2', 'held back for its new question now');
  assert.deepEqual(errors, []);
});
await scenario('dragging a step onto its own step is refused and put back', async (page, errors) => {
  await boot(page, TEACHER, Object.assign({}, ORDER_DB, {
    'users/teacher/mathQuestionGraph/chart__q1': { root: 'q1', nodes: { 'q:q1': { x: 0, y: 0 }, 'q:s1': { x: 0, y: 230 }, 'q:s2': { x: 0, y: 460 } },
      edges: [{ id: 'e1', from: 'q:s1', to: 'q:q1' }, { id: 'e2', from: 'q:s2', to: 'q:s1' }] }
  }));
  await openChart(page);
  const from = await page.$eval('[data-key="q:s1"]', el => { const r = el.getBoundingClientRect(); return { x: r.left + 40, y: r.top + 14 }; });
  const to = await page.$eval('[data-key="q:s2"]', el => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height - 20 }; });
  await page.mouse.move(from.x, from.y); await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 8 }); await page.mouse.up();
  await page.waitForTimeout(500);
  assert.match(await page.textContent('#toast'), /loop/);
  const n = await page.$eval('[data-key="q:s1"]', el => [parseInt(el.style.left), parseInt(el.style.top)]);
  assert.deepEqual(n, [0, 230], 'back where it was');
  assert.deepEqual(errors, []);
});

// ---- v1.99.0: the chart printed as a step-by-step booklet ---------------------------------------
const BOOK_DB = Object.assign({}, ORDER_DB, {
  'users/teacher/mathQuestions/s3': { id: 's3', title: 'Times table', level: 'P3', topics: ['Whole numbers'], foundationOf: 's1', createdAt: '2026-10-11T10:00:03.000Z', blocks: [{ id: 'x3', type: 'text', content: '8 × 2 = ?' }] },
  'users/teacher/mathQuestionGraph/chart__q1': { root: 'q1', nodes: { 'q:q1': { x: 0, y: 0 }, 'q:s1': { x: -300, y: 230 }, 'q:s2': { x: 0, y: 230 }, 'q:s3': { x: -300, y: 460 }, 'q:q2': { x: 0, y: -230, tier: 'harder' } },
    edges: [{ id: 'e1', from: 'q:s1', to: 'q:q1' }, { id: 'e2', from: 'q:s2', to: 'q:q1' }, { id: 'e3', from: 'q:s3', to: 'q:s1' }] }
});
await scenario('🖨 prints the chart as a booklet: wrong? turn to the steps page, then back up', async (page, errors) => {
  await boot(page, TEACHER, BOOK_DB);
  await openChart(page);
  await page.click('#qcPrintBtn');
  await page.waitForSelector('#qcPrintOverlay.show');
  assert.match(await page.textContent('#qcPrintSummary'), /4 pages · the question, 3 steps, 1 next question/);
  await page.uncheck('#qcPrintNext');
  assert.match(await page.textContent('#qcPrintSummary'), /3 pages/);
  await page.check('#qcPrintNext');
  const [sheet] = await Promise.all([page.context().waitForEvent('page'), page.click('#qcPrintPreviewBtn')]);
  await sheet.waitForSelector('.qcb-label', { timeout: 15000 });
  const text = (await sheet.evaluate(() => document.querySelector('.ws-sheet').innerText)).replace(/\s+/g, ' ');
  assert.match(text, /How to use this worksheet/);
  assert.match(text, /Page 1 Start here/);
  assert.match(text, /✗ Wrong, or stuck\? Turn to Page 2\. The questions there break Question 1 into smaller steps\./);
  assert.match(text, /✓ Right\? Well done! Go on to Page 4 for your next challenge\./);
  assert.match(text, /Page 2 Steps for Question 1/);
  assert.match(text, /✗ Wrong, or stuck\? Turn to Page 3\. The questions there break Question 2 into smaller steps\./, 'a step with steps of its own');
  assert.match(text, /Finished these steps\? Go back to Page 1 and try Question 1 again\./);
  assert.match(text, /Page 3 Steps for Question 2/);
  assert.match(text, /Go back to Page 2 and try Question 2 again\./);
  assert.match(text, /Page 4 Your next challenge/);
  assert.ok(text.indexOf('8 × 22') < text.indexOf('176 ÷ 4'), 'steps print in the chart\'s left-to-right order');
  assert.ok(!/Answer key/i.test(text), 'no answer key unless asked');
  assert.equal(await sheet.$$eval('.ws-doc > tbody > tr', rows => rows.length), 4, 'one page section per page, no covers');
  // The popup is not routed, so its web fonts never arrive: a picture is a nice-to-have, never a failure.
  if (process.env.QC_SHOTS) await sheet.screenshot({ path: path.join(process.env.QC_SHOTS, '16-branch-sheet.png'), fullPage: true, timeout: 5000 }).catch(() => {});
  if (process.env.QC_SHEET_HTML) fs.writeFileSync(process.env.QC_SHEET_HTML, await sheet.content());
  await sheet.close();
  // The same dialog from 📝 Create Worksheet, with the chart chosen there.
  await page.click('#qcPrintOverlay [data-close]');
  await page.click('.nav-item[data-page="worksheet"]');
  await page.waitForSelector('#page-worksheet.active');
  await page.click('#wsBranchSheetBtn');
  await page.waitForSelector('#qcPrintOverlay.show');
  assert.equal(await page.$eval('#qcPrintRoot', s => s.value), 'q1');
  assert.deepEqual(errors, []);
});

// ---- v1.101.0: ✨ Answer with AI reads the question as it is now -----------------------------
await scenario('✨ Answer with AI fills the answer and guide from the edited question, and ↩ Undo puts them back', async (page, errors) => {
  await boot(page, TEACHER);
  await page.evaluate(() => {
    window.__fx.ai = async prompt => /writing the answer key for a question/.test(prompt)
      ? JSON.stringify({ answer: '$10', markingGuide: '6 ÷ 2 = 3 packets\n3 × $3 = $9\nAnswer: $9', optionNumber: null, confidence: 'high', issue: '' })
      : '{}';
  });
  await page.evaluate(() => document.querySelector('.nav-item[data-page="create"]').click());
  await page.waitForSelector('#page-create.active');
  await page.click('#page-create .block-body [contenteditable="true"]');
  await page.keyboard.type('Mr Chung needs 6 pens. Pens are sold in packets of 2 for $3. What is the least he needs to spend?');
  await page.fill('#qExpectedInput', 'STALE-ANSWER');
  await page.fill('#qGuideInput', '48 ÷ 8 = 6 packets');
  await page.click('#qAiAnswerBtn');
  await page.waitForSelector('#qAiAnswerStatus.ok');
  const sent = await page.evaluate(() => window.__fx.calls.filter(c => c.op === 'ai' && /answer key for a question/.test(c.prompt)).map(c => c.prompt));
  assert.equal(sent.length, 1, 'one call');
  assert.match(sent[0], /Mr Chung needs 6 pens/, 'the question as it is now');
  assert.doesNotMatch(sent[0], /STALE-ANSWER|48 ÷ 8/, 'the stale answer and guide are not shown to the model');
  assert.equal(await page.inputValue('#qExpectedInput'), '$10');
  assert.equal(await page.inputValue('#qGuideInput'), '6 ÷ 2 = 3 packets\n3 × $3 = $9\nAnswer: $9');
  assert.match(await page.textContent('#qAiAnswerStatus'), /Filled the answer and marking guide/);
  await shot(page, '16-answer-with-ai');
  await page.click('#qAiAnswerStatus .qaa-undo');
  assert.equal(await page.inputValue('#qExpectedInput'), 'STALE-ANSWER');
  assert.equal(await page.inputValue('#qGuideInput'), '48 ÷ 8 = 6 packets');
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
