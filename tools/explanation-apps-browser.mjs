// 🧩 Explanation apps, on the REAL page (v1.117.0).
//
// "Look at the /cer system where I can add an app with the explanation. After
// answering, as part of the explanation, the app will be shown. I can copy and
// paste code into the app or upload the code." This harness loads the WHOLE of
// index.html with its own module, replaces Firebase with in-memory stand-ins
// (the PSLE harness's), and drives it end to end:
//   • the teacher opens a question, ⌨ pastes code, ▶ runs the preview, 📂
//     uploads an .html file, 📋 pastes from the clipboard, reorders, and saves —
//     and the apps land in the ADMIN-ONLY key document, never the public one;
//   • a reopened question shows its apps running without a press;
//   • the sealed frame: no request leaves it, it cannot reach this page or its
//     storage, and ↻ Start again really starts it again;
//   • a pupil's browser holds no app before marking, meets it beside the
//     feedback after marking, loses it on the next question, and sees no
//     sideways scroll on a phone;
//   • ✨ Build with AI sends THIS question and keeps the reply.
//
//   PLAYWRIGHT_MODULE=<playwright/index.mjs> node tools/explanation-apps-browser.mjs [shots dir]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(/^[A-Za-z]:[\\/]|^\//.test(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'https://polymath.test';   // a SECURE origin: the question history hashes with crypto.subtle
const SHOTS = process.argv[2] || process.env.XA_SHOTS || '';

// ---- The Firebase stand-ins ---------------------------------------------
// One shared in-memory database on window.__fx, so the test can seed it and
// read back what the page wrote.
const FX = `window.__fx = window.__fx || { db: new Map(), calls: [], claims: {}, user: null, authCb: null };`;
const stubs = {
  'firebase-app.js': `${FX} export function initializeApp(cfg) { return { cfg }; }`,
  'firebase-app-check.js': `export function initializeAppCheck() { return {}; } export class ReCaptchaV3Provider { constructor() {} }`,
  'firebase-auth.js': `${FX}
    const fx = window.__fx;
    export function getAuth() { return { name: 'auth', get currentUser() { return fx.user; } }; }
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
    // A reference may be built on another reference (the question-history
    // module does doc(collectionRef, key)), so a parent's path is kept.
    const base = r => (r && r.path && (r.kind === 'col' || r.kind === 'doc')) ? [r.path] : [];
    export function doc(r, ...parts) { const all = base(r).concat(parts); const p = all.join('/'); return { path: p, id: p.split('/').pop(), kind: 'doc' }; }
    export function collection(r, ...parts) { return { path: base(r).concat(parts).join('/'), kind: 'col' }; }
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
      return async function (payload) {
        fx.calls.push({ op: 'call', name });
        if (name === 'markAttempt' && window.__xaMark) return { data: await window.__xaMark(payload || {}) };
        if ((name === 'generateChartApp' || name === 'askOpenAi') && window.__xaAi) return { data: await window.__xaAi(name, payload || {}) };
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
const leaks = [];
async function scenario(name, fn, viewport) {
  const page = await browser.newPage({ viewport: viewport || { width: 1360, height: 900 } });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  if (process.env.XA_DEBUG) page.on('console', m => { if (/warn|error/.test(m.type())) console.log('    [console] ' + m.text().slice(0, 300)); });
  page.on('dialog', d => d.accept());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const stub = url.hostname === 'www.gstatic.com' && Object.keys(stubs).find(k => url.pathname.endsWith('/' + k));
    if (stub) return route.fulfill({ status: 200, contentType: 'text/javascript', body: stubs[stub] });
    // Anything an app inside the sandbox manages to send would land here: the
    // CSP must stop it before it ever leaves the frame.
    if (url.pathname.startsWith('/xa-leak')) { leaks.push(url.href); return route.fulfill({ status: 200, body: 'leaked' }); }
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
    'users/teacher/mathQuestions/q1': Q1_PUBLIC,
    'users/teacher/mathQuestionKeys/q1': Q1_KEY
  }, extraDb)]);
  await page.goto(ORIGIN + '/index.html');
  await page.waitForFunction(() => document.getElementById('appShell')?.classList.contains('show'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
}

// ---- The scenarios ---------------------------------------------------------
const ADMIN = { uid: 'teacher', email: 'chungzhikai@gmail.com', displayName: 'Mr Chung' };
const PUPIL = { uid: 'kid1', email: 'kid1@example.com', displayName: 'Kid' };
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); } };

// An app that reports what it can and cannot do to the page around it. Every
// probe is one a page pasted from the internet would try first.
const PROBE_APP = `<!DOCTYPE html><html><head><title>Ben's sweets, bar by bar</title></head><body>
<h1 id="h">XA-PROBE-APP</h1><button id="b">Add a bar</button><div id="bars"></div>
<script>
  const report = (k, v) => parent.postMessage({ xa: k, v }, '*');
  report('start', 1);
  let reach = 'blocked'; try { reach = String(parent.document.title); } catch (e) {}
  report('parentDocument', reach);
  let store = 'blocked'; try { store = String(localStorage.length); } catch (e) {}
  report('localStorage', store);
  let cookie = 'blocked'; try { cookie = String(document.cookie); } catch (e) {}
  report('cookie', cookie);
  fetch('${'${ORIGIN}'}/xa-leak/fetch?k=1').then(() => report('fetch', 'sent'), () => report('fetch', 'blocked'));
  const img = new Image(); img.onload = () => report('img', 'sent'); img.onerror = () => report('img', 'blocked'); img.src = '${'${ORIGIN}'}/xa-leak/img.png';
  document.getElementById('b').onclick = () => { const d = document.createElement('div'); d.className = 'bar'; document.getElementById('bars').appendChild(d); report('bars', document.querySelectorAll('.bar').length); };
</script></body></html>`;
const probeApp = () => PROBE_APP.split('${ORIGIN}').join(ORIGIN);

const Q1_PUBLIC = { id: 'q1', title: 'Sharing sweets', level: 'P5', topics: ['Ratio'], blocks: [{ id: 'b1', type: 'text', content: 'Ali and Ben share 30 sweets in the ratio 2 : 3. How many sweets does Ben get?' }], options: ['12', '15', '18', '20'], createdAt: '2026-10-01T00:00:00.000Z' };
const Q1_KEY = { expected: '18', correctOption: 2, markingGuide: '30 ÷ 5 = 6 per unit; Ben has 3 units = 18.' };

// Collects what the probe app posted to this page.
async function listenToApps(page) {
  await page.evaluate(() => {
    window.__xaMsgs = [];
    window.addEventListener('message', e => { if (e.data && e.data.xa) window.__xaMsgs.push({ k: e.data.xa, v: e.data.v, origin: e.origin }); });
  });
}
const msgs = page => page.evaluate(() => window.__xaMsgs.slice());
async function waitMsg(page, k, n = 1, ms = 8000) {
  await page.waitForFunction(([k, n]) => (window.__xaMsgs || []).filter(m => m.k === k).length >= n, [k, n], { timeout: ms });
}
async function openEditor(page, id) {
  await page.click('.nav-item[data-page="bank"]');
  await page.waitForFunction(id => document.querySelector(`[data-edit="${id}"],[data-qb-edit="${id}"]`), id);
  await page.evaluate(id => document.querySelector(`[data-edit="${id}"],[data-qb-edit="${id}"]`).click(), id);
  await page.waitForSelector('#page-create.active #xaField', { state: 'visible' });
}
const edits = page => page.$$eval('#xaList [data-xa-edit]', els => els.map(e => e.getAttribute('data-xa-edit')));
const dbGet = (page, p) => page.evaluate(p => { const v = window.__fx.db.get(p); return v === undefined ? null : JSON.parse(JSON.stringify(v)); }, p);
const widest = page => page.evaluate(() => [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.right > window.innerWidth + 1 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 8).map(e => (e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + String(e.className).split(' ').join('.')) + ':' + Math.round(e.getBoundingClientRect().right)));
const sideways = page => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

console.log('Explanation apps browser tests');

await scenario('⌨ the teacher pastes code, runs it, uploads an .html file, pastes from the clipboard, and SAVES into the private half', async (page, errors) => {
  // The test page is plain http, where a browser offers no clipboard API; a
  // stand-in clipboard is the same promise-returning readText the page calls.
  await page.addInitScript(() => {
    window.__clip = '';
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => window.__clip, writeText: async t => { window.__clip = String(t); } } });
  });
  await boot(page, ADMIN);
  await listenToApps(page);
  await openEditor(page, 'q1');
  assert.match(await page.textContent('#xaList'), /No app on this question yet/);

  // ＋ Add an app → an empty app with its code box focused.
  await page.click('#xaAddBtn');
  const [a1] = await edits(page);
  assert.ok(a1 && /^xa_/.test(a1), 'an app was added: ' + a1);
  assert.equal(await page.evaluate(() => document.activeElement && document.activeElement.matches('[data-xa-code]')), true, 'the caret is put in the code box');
  const runBtn = `[data-xa-run="${a1}"].btn`;
  assert.equal(await page.$eval(runBtn, b => b.disabled), true, 'nothing to run yet');

  // ⌨ Bare JavaScript: run inside a page, and the status says so.
  await page.fill(`[data-xa-code="${a1}"]`, 'const h = document.createElement("h2"); h.textContent = "XA-BARE-SCRIPT"; document.body.appendChild(h);');
  assert.equal(await page.$eval(runBtn, b => b.disabled), false);
  assert.match(await page.textContent(`[data-xa-status="${a1}"]`), /run as JavaScript inside a page/);
  assert.equal(await page.$(`[data-xa-preview="${a1}"]`), null, 'nothing runs until ▶ Run preview');
  await page.click(runBtn);
  const frame = await page.waitForSelector(`[data-xa-preview="${a1}"] iframe.xa-frame`);
  assert.equal(await frame.getAttribute('sandbox'), 'allow-scripts');
  const f1 = await frame.contentFrame();
  await f1.waitForSelector('h2');
  assert.equal(await f1.textContent('h2'), 'XA-BARE-SCRIPT');

  // ⌨ The probe app, pasted as a whole page; the title box is retyped.
  await page.fill(`[data-xa-code="${a1}"]`, probeApp());
  assert.match(await page.textContent(`[data-xa-status="${a1}"]`), /Changed — press ▶ Run preview/);
  await page.click(runBtn);
  await waitMsg(page, 'start');
  await page.fill(`[data-xa-title="${a1}"]`, 'Bar by bar');
  await page.fill(`[data-xa-height="${a1}"]`, '420');
  await page.dispatchEvent(`[data-xa-height="${a1}"]`, 'change');
  assert.equal(await page.$eval(`[data-xa-preview="${a1}"] iframe`, f => f.style.height), '420px');

  // 📱 Phone width narrows the preview, and back.
  await page.click(`[data-xa-phone="${a1}"]`);
  assert.equal(await page.$eval(`[data-xa-preview="${a1}"]`, p => p.classList.contains('is-phone')), true);
  const w = await page.$eval(`[data-xa-preview="${a1}"] iframe`, f => f.getBoundingClientRect().width);
  assert.ok(w <= 400, 'phone width preview is phone-sized: ' + w);
  await shot(page, 'editor-1-phone-preview');
  await page.click(`[data-xa-phone="${a1}"]`);

  // 📂 Upload an .html file as a SECOND app — named from its <title>.
  const upload = `<!DOCTYPE html><html><head><title>Equal groups</title></head><body><p id="u">XA-UPLOADED</p></body></html>`;
  const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#xaUploadNewBtn')]);
  await chooser.setFiles({ name: 'equal-groups.html', mimeType: 'text/html', buffer: Buffer.from(upload) });
  await page.waitForFunction(() => document.querySelectorAll('#xaList [data-xa-edit]').length === 2);
  const [, a2] = await edits(page);
  assert.equal(await page.inputValue(`[data-xa-title="${a2}"]`), 'Equal groups');
  assert.match(await page.textContent(`[data-xa-status="${a2}"]`), /📂 equal-groups\.html/);
  const f2 = await (await page.waitForSelector(`[data-xa-preview="${a2}"] iframe`)).contentFrame();
  await f2.waitForSelector('#u');
  assert.equal(await f2.textContent('#u'), 'XA-UPLOADED', 'an uploaded app runs straight away');

  // A PDF chosen by mistake is refused by name, and changes nothing.
  const [ch2] = await Promise.all([page.waitForEvent('filechooser'), page.click('#xaUploadNewBtn')]);
  await ch2.setFiles({ name: 'paper.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 binary') });
  await page.waitForFunction(() => /not a web page/.test(document.getElementById('toast')?.textContent || ''));
  assert.equal((await edits(page)).length, 2);

  // 📋 Paste from the clipboard into a THIRD app; then the list is full.
  await page.click('#xaAddBtn');
  const [, , a3] = await edits(page);
  await page.evaluate(t => navigator.clipboard.writeText(t), '<div id="c">XA-CLIPBOARD</div>');
  await page.click(`[data-xa-paste="${a3}"]`);
  await page.waitForFunction(id => /📋 Pasted/.test(document.querySelector(`[data-xa-status="${id}"]`).textContent), a3);
  assert.match(await page.textContent(`[data-xa-status="${a3}"]`), /put inside a page for you/);
  assert.equal(await page.$eval('#xaAddBtn', b => b.disabled), true, 'three apps is the most a question holds');
  assert.equal(await page.$eval('#xaUploadNewBtn', b => b.disabled), true);

  // ↓ Move the first app down, ✕ remove the pasted one.
  await page.click(`[data-xa-move="1"][data-xa-for="${a1}"]`);
  assert.deepEqual(await edits(page), [a2, a1, a3]);
  await page.click(`[data-xa-remove="${a3}"]`);
  assert.deepEqual(await edits(page), [a2, a1]);
  assert.equal(await page.$eval('#xaAddBtn', b => b.disabled), false);
  await shot(page, 'editor-2-two-apps');

  // 💾 Save. The apps go into the KEY document; the public one never sees them.
  await page.click('#saveQBtn');
  await page.waitForFunction(() => { const k = window.__fx.db.get('users/teacher/mathQuestionKeys/q1'); return k && Array.isArray(k.explanationApps) && k.explanationApps.length === 2; });
  const key = await dbGet(page, 'users/teacher/mathQuestionKeys/q1');
  const pub = await dbGet(page, 'users/teacher/mathQuestions/q1');
  assert.equal(pub.explanationApps, undefined, 'the PUBLIC half never holds an app: ' + Object.keys(pub));
  assert.ok(!JSON.stringify(pub).includes('XA-PROBE-APP'), 'not a byte of the app in the public doc');
  assert.deepEqual(key.explanationApps.map(a => a.title), ['Equal groups', 'Bar by bar']);
  assert.equal(key.explanationApps[1].height, 420);
  assert.equal(key.explanationApps[1].source, 'pasted');
  assert.equal(key.explanationApps[0].source, 'uploaded');
  assert.ok(key.explanationApps[1].html.includes('XA-PROBE-APP'));
  assert.equal(key.expected, '18', 'the answer key is kept');
  assert.equal(key.correctOption, 2);

  // ✏️ Opened again: the apps are back, already running.
  await openEditor(page, 'q1');
  assert.equal((await edits(page)).length, 2);
  const again = await page.waitForSelector(`#xaList iframe.xa-frame`);
  assert.ok(again, 'a saved app is shown running without a press');
  assert.deepEqual(errors, []);
});

await scenario('🔒 the sealed frame: nothing leaves it, it cannot reach this page, and ↻ Start again restarts it', async (page, errors) => {
  leaks.length = 0;
  await boot(page, ADMIN, { 'users/teacher/mathQuestionKeys/q1': Object.assign({}, Q1_KEY, { explanationApps: [{ id: 'xa_probe_1', title: 'Probe', html: probeApp(), height: 400 }] }) });
  await listenToApps(page);
  await openEditor(page, 'q1');
  await waitMsg(page, 'start');
  await waitMsg(page, 'fetch');
  await waitMsg(page, 'img');
  const m = await msgs(page);
  const val = k => (m.find(x => x.k === k) || {}).v;
  assert.equal(val('parentDocument'), 'blocked', 'the app cannot read this page');
  assert.equal(val('localStorage'), 'blocked', 'the app cannot read the shared localStorage (the ChatGPT key lives there)');
  assert.equal(val('cookie'), 'blocked');
  assert.equal(val('fetch'), 'blocked', 'the CSP stops fetch');
  assert.equal(val('img'), 'blocked', 'the CSP stops an image beacon');
  assert.ok(m.every(x => x.origin === 'null'), 'the app runs as an opaque origin: ' + [...new Set(m.map(x => x.origin))]);
  assert.deepEqual(leaks, [], 'no request ever left the frame');

  // The pupil-facing card (the preview of the question as a pupil meets it).
  const fr = await (await page.waitForSelector('[data-xa-preview="xa_probe_1"] iframe')).contentFrame();
  await fr.click('#b'); await fr.click('#b');
  await waitMsg(page, 'bars', 2);
  // ↻ Run again on the preview starts the app from nothing.
  const starts = (await msgs(page)).filter(x => x.k === 'start').length;
  await page.click('[data-xa-preview="xa_probe_1"] [data-xa-run="xa_probe_1"]');
  await waitMsg(page, 'start', starts + 1);
  const fr2 = await (await page.waitForSelector('[data-xa-preview="xa_probe_1"] iframe')).contentFrame();
  assert.equal(await fr2.$$eval('.bar', b => b.length), 0, 'a fresh start has no bars');
  assert.deepEqual(errors, []);
});

await scenario('🧒 a pupil holds NO app before marking, meets it beside the feedback after, and loses it on the next question', async (page, errors) => {
  leaks.length = 0;
  const apps = [{ id: 'xa_kid_app1', title: 'Bar by bar', html: probeApp(), height: 460, brief: 'TEACHER-NOTES', source: 'pasted' }];
  await page.addInitScript(appsJson => {
    window.__xaMarkCalls = 0;
    window.__xaMark = async payload => {
      window.__xaMarkCalls++;
      const right = payload.selectedOption === 2;
      return {
        verdict: { verdict: right ? 'correct' : 'incorrect', score: right ? 1 : 0, outOf: 1, feedback: right ? 'Well done.' : 'Look at the units again.', mistakes: [], nextStep: '', fullAnswerKey: '18' },
        progress: {}, reward: { gold: 0, xp: 0 }, totals: {},
        correctOption: 2, videoExplanationUrl: '', videoOverlays: [], answerKeyImageUrl: '', annotationAnswers: [],
        // What cleanExplanationApps sends: four fields, never the brief.
        explanationApps: JSON.parse(appsJson).map(a => ({ id: a.id, title: a.title, html: a.html, height: a.height }))
      };
    };
  }, JSON.stringify(apps));
  await boot(page, PUPIL, {
    'users/teacher/mathQuestionKeys/q1': Object.assign({}, Q1_KEY, { explanationApps: apps }),
    'users/kid1/settings/mathLearningProfile': { level: 'P5' }
  });
  await listenToApps(page);
  await page.click('.nav-item[data-page="practice"]');
  if (process.env.XA_DEBUG) { await page.waitForTimeout(4000); console.log((await page.textContent('#page-practice')).replace(/\s+/g,' ').slice(0,1500)); }
  await page.waitForSelector('#mcqOptions .mcq-option', { state: 'visible', timeout: 20000 });
  // Before marking: not in the DOM, not in any frame, nowhere.
  assert.equal(await page.$eval('#xaRevealBlock', b => b.style.display), 'none');
  assert.equal(await page.$$eval('iframe.xa-frame', f => f.length), 0);
  assert.ok(!(await page.content()).includes('XA-PROBE-APP'), 'the app is not on the page before the answer');
  assert.equal(await page.$('#xaField:visible'), null, 'a pupil has no app editor');
  assert.deepEqual(await msgs(page), []);

  await page.click('#mcqOptions .mcq-option[data-i="0"]');
  await page.click('#submitBtn');
  await page.waitForSelector('#result.show');
  await page.waitForSelector('#xaRevealBlock iframe.xa-frame');
  assert.equal(await page.evaluate(() => window.__xaMarkCalls), 1);
  assert.equal(await page.$eval('#xaRevealBlock', b => getComputedStyle(b).display), 'block');
  assert.match(await page.textContent('#xaRevealBlock'), /🧩 Explore it — interactive[\s\S]*Bar by bar/);
  assert.match(await page.textContent('#xaRevealBlock'), /Try this app/);
  assert.ok(!(await page.content()).includes('TEACHER-NOTES'), 'the teacher\'s notes never reach the pupil');
  const frame = await page.$('#xaRevealBlock iframe.xa-frame');
  assert.equal(await frame.getAttribute('sandbox'), 'allow-scripts');
  assert.equal(await frame.evaluate(f => f.style.height), '460px');
  await waitMsg(page, 'start');
  await waitMsg(page, 'fetch');
  assert.equal((await msgs(page)).find(x => x.k === 'fetch').v, 'blocked');
  assert.deepEqual(leaks, []);
  await shot(page, 'pupil-1-after-marking');

  // ⤢ Bigger and ↻ Start again on the pupil's card.
  const fr = await frame.contentFrame();
  await fr.click('#b');
  await waitMsg(page, 'bars', 1);
  await page.click('#xaRevealBlock [data-xa-expand="xa_kid_app1"]');
  assert.equal(await page.$eval('#xaRevealBlock .xa-card', c => c.classList.contains('is-big')), true);
  assert.equal(await page.textContent('#xaRevealBlock [data-xa-expand]'), '⤡ Smaller');
  const starts = (await msgs(page)).filter(x => x.k === 'start').length;
  await page.click('#xaRevealBlock [data-xa-restart="xa_kid_app1"]');
  await waitMsg(page, 'start', starts + 1);
  const fresh = await (await page.$('#xaRevealBlock iframe.xa-frame')).contentFrame();
  assert.equal(await fresh.$$eval('.bar', b => b.length), 0);

  // The result going away takes the app with it.
  await page.evaluate(() => document.getElementById('nextBtn') && document.getElementById('nextBtn').click());
  await page.waitForFunction(() => !document.getElementById('result').classList.contains('show'));
  assert.equal(await page.$$eval('#xaRevealBlock iframe', f => f.length), 0, 'the app stopped with its result');
  assert.equal(await page.$eval('#xaRevealBlock', b => b.style.display), 'none');
  assert.deepEqual(errors, []);
});

await scenario('📱 on a phone the pupil\'s app fits with no sideways scroll', async (page, errors) => {
  const apps = [{ id: 'xa_phone_app', title: 'A rather long title for an app that has to wrap on a phone screen', html: '<div style="width:100%">XA-PHONE</div>', height: 900 }];
  await page.addInitScript(appsJson => {
    window.__xaMark = async () => ({ verdict: { verdict: 'correct', score: 1, outOf: 1, feedback: 'Yes.', mistakes: [] }, progress: {}, reward: {}, totals: {}, correctOption: 2, explanationApps: JSON.parse(appsJson) });
  }, JSON.stringify(apps));
  await boot(page, PUPIL, { 'users/kid1/settings/mathLearningProfile': { level: 'P5' } });
  await page.evaluate(() => { const t = document.querySelector('.mobile-menu-btn, #menuToggle'); }); 
  await page.evaluate(() => { if (typeof window.navigateTo === 'function') window.navigateTo('practice'); else document.querySelector('.nav-item[data-page="practice"]').click(); });
  await page.waitForSelector('#mcqOptions .mcq-option', { state: 'visible', timeout: 20000 });
  if (process.env.XA_DEBUG) console.log('    before marking, sideways =', await sideways(page), await widest(page));
  await page.click('#mcqOptions .mcq-option[data-i="2"]');
  await page.click('#submitBtn');
  await page.waitForSelector('#xaRevealBlock iframe.xa-frame');
  await page.$eval('#xaRevealBlock', b => b.scrollIntoView());
  await page.click('#xaRevealBlock [data-xa-expand]');
  await page.waitForTimeout(200);
  assert.ok(await sideways(page) <= 0, 'no sideways scroll: ' + await sideways(page) + ' ' + JSON.stringify(await widest(page)));
  const box = await page.$eval('#xaRevealBlock iframe', f => { const r = f.getBoundingClientRect(); return { left: r.left, right: r.right }; });
  assert.ok(box.left >= 0 && box.right <= 390, 'the frame is on screen: ' + JSON.stringify(box));
  await shot(page, 'pupil-2-phone');
  assert.deepEqual(errors, []);
}, { width: 390, height: 844 });

await scenario('✨ Build with AI sends THIS question, and the reply becomes the app', async (page, errors) => {
  await page.addInitScript(() => {
    window.__xaAiCalls = [];
    window.__xaAi = async (name, payload) => {
      window.__xaAiCalls.push({ name, prompt: String(payload.prompt || payload.messages && JSON.stringify(payload.messages) || JSON.stringify(payload)) });
      const html = '<!DOCTYPE html><html><body><p id="g">XA-GENERATED</p></body></html>';
      return name === 'generateChartApp' ? { html, text: html } : { text: 'Here it is:\n```html\n' + html + '\n```' };
    };
  });
  await boot(page, ADMIN);
  await openEditor(page, 'q1');
  await page.click('#xaAddBtn');
  const [a] = await edits(page);
  await page.click(`[data-xa-tab="gen"][data-xa-for="${a}"]`);
  assert.match(await page.inputValue(`[data-xa-brief="${a}"]`), /AFTER their answer has been marked/);
  await page.click(`[data-xa-gen="${a}"]`);
  const fr = await (await page.waitForSelector(`[data-xa-preview="${a}"] iframe`, { timeout: 15000 })).contentFrame();
  await fr.waitForSelector('#g');
  assert.equal(await fr.textContent('#g'), 'XA-GENERATED');
  const calls = await page.evaluate(() => window.__xaAiCalls);
  assert.ok(calls.length >= 1, 'the AI was asked');
  assert.match(calls[0].prompt, /Ali and Ben share 30 sweets/, 'the prompt carries THIS question');
  assert.match(await page.textContent(`[data-xa-status="${a}"]`), /Built in \d+s/);
  await page.click('#saveQBtn');
  await page.waitForFunction(() => { const k = window.__fx.db.get('users/teacher/mathQuestionKeys/q1'); return k && k.explanationApps && k.explanationApps.length === 1; });
  const key = await dbGet(page, 'users/teacher/mathQuestionKeys/q1');
  assert.equal(key.explanationApps[0].source, 'generated');
  assert.ok(key.explanationApps[0].model, 'the model it was built with is remembered');
  assert.deepEqual(errors, []);
});

await browser.close();
if (failed) { console.log(failed + ' scenario(s) failed'); process.exit(1); }
console.log('all explanation app browser scenarios passed');
