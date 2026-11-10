// 📥 PSLE Papers — adding questions, on the REAL page (v1.114.0), and ✏️ editing them (v1.116.0).
//
// "The upload of PDF doesn't work on the PSLE paper page." It did read and file
// the paper — the questions sat in 📋 Vetting while the page still said "No PSLE
// papers loaded yet", the progress line was painted once and never again, and a
// failure only ever showed on the Vetting page. This harness loads the WHOLE of
// index.html with its own module, replaces Firebase with in-memory stand-ins
// (the employee harness's), answers the AI from a script, serves pdf.js from a
// local copy, and drives the real 🛠 Manage card:
//   • a real two-page PDF, chosen through the real picker, read page by page by
//     ⚡ Rapid add's own pipeline, filed, and SHOWN on the page while in Vetting;
//   • a PDF named after its paper filed under that year and paper;
//   • screenshots by paste, by picker and by drop on another tab, numbered in
//     order, with the next batch carrying on;
//   • an AI outage shown on the card with its reason, and ↻ Retry filing it;
//   • a pupil never seeing a question that is still in Vetting;
//   • a phone with no sideways scroll.
//
//   PLAYWRIGHT_MODULE=<playwright/index.mjs> PDFJS_DIR=<pdfjs-dist/build> node tools/psle-math-upload-browser.mjs [shots dir]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(/^[A-Za-z]:[\\/]|^\//.test(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://polymath.test';
const PDFJS_DIR = process.env.PDFJS_DIR || '';
const SHOTS = process.argv[2] || process.env.PSLE_SHOTS || '';

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
      return async function (payload) {
        fx.calls.push({ op: 'call', name });
        if (name === 'askOpenAi') return window.__psleAi(payload || {});
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
  page.on('dialog', d => d.accept());
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    const stub = url.hostname === 'www.gstatic.com' && Object.keys(stubs).find(k => url.pathname.endsWith('/' + k));
    if (stub) return route.fulfill({ status: 200, contentType: 'text/javascript', body: stubs[stub] });
    // pdf.js, from a local copy, in place of the CDN the page loads it from.
    if (PDFJS_DIR && /\/pdf(\.worker)?\.min\.mjs$/.test(url.pathname)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(path.join(PDFJS_DIR, path.basename(url.pathname))) });
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
// ---- The AI, from a script ------------------------------------------------
// Only the READ is answered: a PDF page (its prompt carries the boundary
// rules) gives two numbered questions, a screenshot gives one — or two with
// printed numbers when `multiNext` is set. Every other call (objective filing,
// picture clean-up) is refused, which the pipeline is built to survive.
// `aiDown` turns the account off, the way an empty prepay balance does.
const AI = () => {
  window.__psleAi = async ({ prompt }) => {
    const fx = window.__fx, p = String(prompt || '');
    fx.reads = fx.reads || [];
    if (!/diagramBox|sourceQuestionNumber/.test(p)) throw new Error('not scripted in this test');
    if (fx.aiDown) { const e = new Error('You exceeded your current quota, please check your plan and billing details.'); e.code = 'functions/resource-exhausted'; throw e; }
    if (/PDF BOUNDARY RULES/.test(p)) {
      const page = Number((p.match(/Image 1 is CURRENT page (\d+)/) || [])[1]) || 1;
      fx.reads.push('pdf-page-' + page);
      const a = 2 * page - 1, b = 2 * page;
      return { data: { text: JSON.stringify({ questions: [
        { title: 'Paper sum ' + a, questionText: 'Find the value of ' + a + ' + 10.', expected: String(a + 10), number: String(a), sourceQuestionNumber: String(a), hasDiagram: false, continuation: false },
        { title: 'Paper difference ' + b, questionText: 'Find the value of 50 - ' + b + '. [2]', expected: String(50 - b), number: String(b), sourceQuestionNumber: String(b), hasDiagram: false, continuation: false }
      ] }) } };
    }
    const k = (fx.shotN = (fx.shotN || 0) + 1);
    fx.reads.push('shot-' + k);
    if (fx.multiNext) {
      fx.multiNext = false;
      return { data: { text: JSON.stringify({ questions: [
        { title: 'Shared table A', questionText: 'Use the table. How many pens?', expected: '12', number: '12', hasDiagram: false },
        { title: 'Shared table B', questionText: 'Use the table. How many rulers?', expected: '7', number: '13', hasDiagram: false }
      ] }) } };
    }
    return { data: { text: JSON.stringify({ questions: [{ title: 'Screenshot question ' + k, questionText: 'A box holds ' + k + ' dozen eggs. How many eggs is that?', expected: String(12 * k), hasDiagram: false }] }) } };
  };
};

const ADMIN = { uid: 'teacher', email: 'chungzhikai@gmail.com', displayName: 'Mr Chung' };
const PUPIL = { uid: 'kid1', email: 'kid1@example.com', displayName: 'Kid' };
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: true }); } };

// A real two-page PDF, written by hand so the test needs nothing to build one.
function twoPagePdf() {
  const objs = [
    '<</Type/Catalog/Pages 2 0 R>>',
    '<</Type/Pages/Kids[3 0 R 5 0 R]/Count 2>>',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]/Contents 4 0 R/Resources<<>>>>',
    '<</Length 20>>stream\n0 0 m 100 100 l S\nendstream',
    '<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 300]/Contents 4 0 R/Resources<<>>>>'
  ];
  let out = '%PDF-1.4\n';
  const offs = [];
  objs.forEach((o, i) => { offs.push(out.length); out += `${i + 1} 0 obj${o}endobj\n`; });
  const x = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + offs.map(a => String(a).padStart(10, '0') + ' 00000 n \n').join('');
  out += `trailer<</Size ${objs.length + 1}/Root 1 0 R>>\nstartxref\n${x}\n%%EOF`;
  return Buffer.from(out, 'latin1');
}
// A small real PNG (8×8, a dark square), so the image path decodes a picture.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEklEQVR4nGNgYGD4z0AEYBxVSAQA/kwH/YbS1UEAAAAASUVORK5CYII=', 'base64');

const vettingRows = page => page.evaluate(() => [...window.__fx.db.entries()]
  .filter(([k]) => /^users\/teacher\/mathVetting\//.test(k) && !/\/bin__|cpbpaper__/.test(k))
  .map(([, v]) => ({ title: v.title, src: v.sourcePdf || '', psle: v.psle || null })));
async function openManage(page) {
  await page.click('.nav-item[data-page="psle"]');
  await page.waitForSelector('#psleMain .psle-tabs');
  await page.click('[data-psle-act="tab"][data-tab="manage"]');
  await page.waitForSelector('#psleAddCard');
}
async function waitIdle(page, ms = 30000) {
  await page.waitForFunction(() => {
    const t = document.getElementById('psleJobs');
    return t && !t.querySelector('.spinner') && !/Waiting|Reading/.test(t.textContent);
  }, null, { timeout: ms });
  await page.waitForTimeout(1600);   // the debounced filer, and one more tick
}

console.log('PSLE upload browser tests' + (PDFJS_DIR ? '' : ' (no PDFJS_DIR — the PDF scenarios are skipped)'));

if (PDFJS_DIR) {
  await scenario('📄 a PDF chosen through the picker is read, filed, and SHOWN on the page while it waits in Vetting', async (page, errors) => {
    await page.addInitScript(AI);
    await boot(page, ADMIN);
    await openManage(page);
    // The drop box is a button now: clicking it opens the picker.
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('[data-psle-drop]')]);
    assert.ok(chooser.isMultiple(), 'several PDFs can be chosen at once');
    await chooser.setFiles({ name: 'scan.pdf', mimeType: 'application/pdf', buffer: twoPagePdf() });
    await page.waitForSelector('#psleJobs .psle-job');
    await shot(page, 'pdf-1-reading');
    await waitIdle(page);
    const rows = await vettingRows(page);
    assert.equal(rows.length, 4, 'two pages × two questions: ' + JSON.stringify(rows));
    const year = await page.evaluate(() => String(new Date().getFullYear() - 1));
    for (const r of rows) {
      assert.ok(r.src.startsWith(`PSLE-${year}-P1A — `), 'renamed for filing: ' + r.src);
      assert.ok(r.psle && r.psle.year === year && r.psle.paper === 'P1A' && r.psle.n >= 1 && r.psle.n <= 4, 'filed: ' + JSON.stringify(r.psle));
    }
    const panel = (await page.textContent('#psleJobs')).replace(/\s+/g, ' ');
    assert.match(panel, /Done — 4 questions read, all filed/, panel);
    assert.match(panel, /Approve all 4/, 'the next step is offered right there: ' + panel);
    await shot(page, 'pdf-2-done');
    // THE BUG: the page used to count approved bank questions only.
    await page.click('[data-psle-act="tab"][data-tab="years"]');
    const body = (await page.textContent('#psleBody')).replace(/\s+/g, ' ');
    assert.doesNotMatch(body, /No PSLE papers loaded yet/, 'a paper in Vetting is not "nothing loaded"');
    assert.match(body, /4 waiting in Vetting/, body.slice(0, 400));
    assert.match(body, /PSLE \d{4} 4 questions/, 'the year card is there');
    assert.match(body, /📋 4 in Vetting/);
    // Its questions are badged, and practice says why it cannot serve them yet.
    await page.click(`[data-psle-act="open-year"][data-year="${year}"]`);
    await page.click('#psleOverlay [data-psle-act="list"]');
    assert.equal(await page.locator('#psleOverlay .psle-vet-tag').count(), 4);
    await page.click('#psleOverlay [data-psle-act="practise"]');
    await page.waitForFunction(() => /approve them first/i.test(document.getElementById('toast')?.textContent || ''));
    assert.deepEqual(errors, []);
  });

  await scenario('📄 a PDF named after its paper is filed under THAT year and paper, whatever the pickers say', async (page, errors) => {
    await page.addInitScript(AI);
    await boot(page, ADMIN);
    await openManage(page);
    await page.selectOption('[data-psle-input="import-paper"]', 'P1B');
    await page.setInputFiles('[data-psle-input="import-files"]', { name: 'PSLE 2019 Paper 2.pdf', mimeType: 'application/pdf', buffer: twoPagePdf() });
    await waitIdle(page);
    const rows = await vettingRows(page);
    assert.equal(rows.length, 4);
    assert.ok(rows.every(r => r.psle && r.psle.year === '2019' && r.psle.paper === 'P2'), JSON.stringify(rows));
    assert.match(await page.textContent('#psleJobs'), /from the file name/);
    // Paper 2's Q1–5 are 2 marks; the printed [2] wins where there is one.
    assert.ok(rows.every(r => r.psle.marks === 2 && !r.psle.marksGuess), JSON.stringify(rows.map(r => r.psle)));
    assert.deepEqual(errors, []);
  });

  await scenario('📄 an AI outage is shown ON the page with its reason, and ↻ Retry finishes the paper', async (page, errors) => {
    await page.addInitScript(AI);
    await boot(page, ADMIN);
    await page.evaluate(() => { window.__fx.aiDown = true; });
    await openManage(page);
    await page.setInputFiles('[data-psle-input="import-files"]', { name: 'booklet.pdf', mimeType: 'application/pdf', buffer: twoPagePdf() });
    await page.waitForSelector('#psleJobs .psle-job.bad', { timeout: 30000 });
    const bad = (await page.textContent('#psleJobs .psle-job.bad')).replace(/\s+/g, ' ');
    assert.match(bad, /Retry/, bad);
    await shot(page, 'pdf-3-failed');
    await page.evaluate(() => { window.__fx.aiDown = false; });
    await page.click('#psleJobs [data-psle-act="pdf-retry"]');
    await waitIdle(page);
    assert.equal((await vettingRows(page)).length, 4, 'the whole paper came in on the retry');
    assert.match((await page.textContent('#psleJobs')).replace(/\s+/g, ' '), /Done — 4 questions read/);
    assert.deepEqual(errors, []);
  });
}

await scenario('📸 screenshots by paste and by the picker are numbered in order, and the next batch carries on', async (page, errors) => {
  await page.addInitScript(AI);
  await boot(page, ADMIN);
  await openManage(page);
  await page.click('[data-psle-act="add-mode"][data-mode="shots"]');
  await page.selectOption('[data-psle-input="import-year"]', '2021');
  await page.selectOption('[data-psle-input="import-paper"]', 'P2');
  assert.equal(await page.inputValue('[data-psle-input="shot-start"]'), '1', 'an empty paper starts at Q1');
  // ALL is a PDF-only choice.
  assert.equal(await page.locator('[data-psle-input="import-paper"] option[value="ALL"]').count(), 0);
  // Paste one (Ctrl+V on the page).
  await page.evaluate(b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'clip.png', { type: 'image/png' }));
    document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, PNG.toString('base64'));
  await page.waitForSelector('#psleJobs .psle-shot');
  // Then two through the picker.
  await page.setInputFiles('[data-psle-input="shot-files"]', [
    { name: 'q2.png', mimeType: 'image/png', buffer: PNG },
    { name: 'q3.png', mimeType: 'image/png', buffer: PNG }
  ]);
  await waitIdle(page);
  const rows = (await vettingRows(page)).sort((a, b) => a.psle.n - b.psle.n);
  assert.deepEqual(rows.map(r => [r.psle.year, r.psle.paper, r.psle.n]), [['2021', 'P2', 1], ['2021', 'P2', 2], ['2021', 'P2', 3]]);
  assert.ok(rows.every(r => r.psle.marks === 2), 'Paper 2 Q1–5 are 2 marks');
  assert.equal(await page.locator('#psleJobs .psle-shot.ok').count(), 3);
  assert.equal(await page.inputValue('[data-psle-input="shot-start"]'), '4', 'the next batch starts at Q4');
  assert.match(await page.textContent('.psle-taken'), /Q1–3/);
  await shot(page, 'shots-1-filed');
  // A picture holding two printed questions keeps their own numbers.
  await page.evaluate(() => { window.__fx.multiNext = true; });
  await page.setInputFiles('[data-psle-input="shot-files"]', { name: 'table.png', mimeType: 'image/png', buffer: PNG });
  await waitIdle(page);
  const all = await vettingRows(page);
  assert.ok(all.some(r => /Shared table A/.test(r.title) && r.psle && r.psle.n === 12), JSON.stringify(all.map(r => [r.title, r.psle && r.psle.n])));
  assert.ok(all.some(r => /Shared table B/.test(r.title) && r.psle && r.psle.n === 13));
  // Paper 2 from Q6 on is a GUESS of 4, and is listed to be confirmed.
  assert.ok(all.filter(r => r.psle.n >= 12).every(r => r.psle.marks === 4 && r.psle.marksGuess));
  assert.match(await page.textContent('#psleMain'), /marks to confirm/);
  assert.deepEqual(errors, []);
});

await scenario('📸 a screenshot dropped on ANOTHER tab is imported, not opened by the browser', async (page, errors) => {
  await page.addInitScript(AI);
  await boot(page, ADMIN);
  await page.click('.nav-item[data-page="psle"]');
  await page.waitForSelector('#psleMain .psle-tabs');
  await page.click('[data-psle-act="tab"][data-tab="trends"]');
  const prevented = await page.evaluate(b64 => {
    const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const dt = new DataTransfer();
    dt.items.add(new File([bytes], 'dropped.png', { type: 'image/png' }));
    const pg = document.getElementById('page-psle');
    const over = new DragEvent('dragover', { dataTransfer: dt, bubbles: true, cancelable: true });
    pg.dispatchEvent(over);
    const drop = new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true });
    pg.dispatchEvent(drop);
    return over.defaultPrevented && drop.defaultPrevented;
  }, PNG.toString('base64'));
  assert.ok(prevented, 'the browser is told not to open the file');
  await page.waitForSelector('#psleAddCard');
  assert.equal(await page.getAttribute('.psle-mode.on', 'data-mode'), 'shots', 'the card switched to screenshots');
  await waitIdle(page);
  const rows = await vettingRows(page);
  assert.equal(rows.length, 1);
  assert.ok(rows[0].psle && rows[0].psle.n === 1, JSON.stringify(rows));
  assert.deepEqual(errors, []);
});

await scenario('📸 a screenshot the AI could not read says why, and ↻ Retry files it', async (page, errors) => {
  await page.addInitScript(AI);
  await boot(page, ADMIN);
  await page.evaluate(() => { window.__fx.aiDown = true; });
  await openManage(page);
  await page.click('[data-psle-act="add-mode"][data-mode="shots"]');
  await page.setInputFiles('[data-psle-input="shot-files"]', { name: 'q.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForSelector('#psleJobs .psle-shot.bad', { timeout: 20000 });
  const why = (await page.textContent('#psleJobs .psle-shot.bad')).replace(/\s+/g, ' ');
  assert.match(why, /AI|quota|engine/i, why);
  // Its red card is not ALSO left on the Vetting page — the panel here has the Retry.
  assert.equal(await page.evaluate(() => document.querySelectorAll('.rapid-job.error, .vet-card.rapid-error').length), 0);
  await shot(page, 'shots-2-failed');
  await page.evaluate(() => { window.__fx.aiDown = false; });
  await page.click('#psleJobs [data-psle-act="shot-retry"]');
  await waitIdle(page);
  const rows = await vettingRows(page);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].psle.n, 1, 'it kept the number it was queued under');
  assert.deepEqual(errors, []);
});

// ✏️ v1.116.0 — every question of a year can be edited from the PSLE page, and
// every way out of the editor comes back to the view exactly as it was left.
function yearSeed() {
  const seed = {};
  const long = n => Array.from({ length: 6 }, (_, i) => 'Line ' + (i + 1) + ' of question ' + n + ': a shop sells pens at $' + n + ' each.').join(' ');
  for (let n = 1; n <= 14; n++) {
    const id = 'p13_' + n, vet = n === 12;
    const q = { id, title: 'Pens question ' + n, level: 'P6', topics: ['Whole numbers'], blocks: [{ id: 'b' + n, type: 'text', content: long(n) }],
      psle: { year: '2013', paper: 'P1B', n, marks: 2 }, createdAt: '2026-10-01T00:00:00.000Z' };
    if (vet) seed['users/teacher/mathVetting/' + id] = Object.assign({}, q, { expected: '24', source: 'rapid', autoCheck: { verdict: 'ok' } });
    else { seed['users/teacher/mathQuestions/' + id] = q; seed['users/teacher/mathQuestionKeys/' + id] = { expected: String(n * 2) }; }
  }
  return seed;
}
const scrolls = page => page.evaluate(() => {
  const t = s => { const n = document.querySelector(s); return n ? n.scrollTop : 0; };
  return { win: Math.round(window.scrollY), main: t('.main'), overlay: t('#psleOverlay'), card: t('#psleOverlay .overlay-card'), body: t('#psleSheetBody') };
});
const sheetScrolled = s => Math.max(s.overlay, s.card, s.body, s.win, s.main);

await scenario('✏️ a year\'s questions open in the editor from the sheet, Save & next walks the paper, and Save comes back to the SAME view', async (page, errors) => {
  await boot(page, ADMIN, yearSeed());
  await page.click('.nav-item[data-page="psle"]');
  await page.waitForSelector('#psleMain .psle-tabs');
  await page.click('[data-psle-act="open-year"][data-year="2013"]');
  await page.waitForSelector('#psleOverlay.show');
  await page.click('#psleSheetBody [data-psle-act="list"]');
  await page.waitForSelector('#psleSheetBody [data-psle-row="p13_8"]');
  // Expand a row and scroll down the sheet, the way a teacher reading it would.
  await page.click('#psleSheetBody [data-psle-row="p13_3"] [data-psle-act="toggle-row"]');
  await page.locator('#psleSheetBody [data-psle-row="p13_8"]').scrollIntoViewIfNeeded();
  await page.evaluate(() => { const r = document.querySelector('#psleSheetBody [data-psle-row="p13_10"]'); r && r.scrollIntoView({ block: 'center' }); });
  const before = await scrolls(page);
  assert.ok(sheetScrolled(before) > 40, 'the sheet was scrolled: ' + JSON.stringify(before));
  // Both buttons on every row: ✏️ the question, 🏷️ the paper details.
  assert.equal(await page.locator('#psleSheetBody [data-psle-act="edit-q"]').count(), 14);
  assert.equal(await page.locator('#psleSheetBody .psle-row [data-psle-act="edit"]').count(), 14);
  await page.click('#psleSheetBody [data-psle-row="p13_8"] [data-psle-act="edit-q"]');
  await page.waitForSelector('#page-create.active #psleEditBar:not([hidden])');
  assert.equal(await page.inputValue('#qTitleInput'), 'Pens question 8');
  const bar = (await page.textContent('#psleEditBar')).replace(/\s+/g, ' ');
  assert.match(bar, /2013/); assert.match(bar, /Question 8 of 14/); assert.match(bar, /in the bank/);
  await shot(page, 'edit-1-bar');
  // 💾 Save & next: Q8 is saved and Q9 opens, still in the walk.
  await page.fill('#qTitleInput', 'Pens question 8 (fixed)');
  await page.click('#psleEditBar [data-psle-edit="next"]');
  await page.waitForFunction(() => document.getElementById('qTitleInput').value === 'Pens question 9');
  assert.equal(await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestions/p13_8').title), 'Pens question 8 (fixed)');
  assert.match(await page.textContent('#psleEditBar'), /Question 9 of 14/);
  // A plain 💾 Save on Q9 ends the walk and lands on the view it STARTED from.
  await page.fill('#qTitleInput', 'Pens question 9 (fixed)');
  await page.click('#saveQBtn');
  await page.waitForSelector('#page-psle.active');
  await page.waitForSelector('#psleOverlay.show #psleSheetBody [data-psle-row="p13_9"]');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestions/p13_9').title), 'Pens question 9 (fixed)');
  assert.match(await page.textContent('#psleSheetTitle'), /2013/);
  assert.ok(await page.locator('#psleSheetBody [data-psle-row="p13_3"] .psle-row-preview').count() === 1, 'the expanded row is still open');
  assert.match(await page.textContent('#psleSheetBody [data-psle-row="p13_9"]'), /\(fixed\)/, 'the list shows the new wording');
  const after = await scrolls(page);
  assert.ok(Math.abs(sheetScrolled(after) - sheetScrolled(before)) < 30, 'the same scroll: ' + JSON.stringify({ before, after }));
  assert.match(page.url(), /#psle\/2013/);
  assert.equal(await page.locator('#psleEditBar:not([hidden])').count(), 0);
  await shot(page, 'edit-2-back');
  assert.deepEqual(errors, []);
});

await scenario('✏️ a question still in Vetting is saved BACK to Vetting, and Cancel / ↩ Back return without saving', async (page, errors) => {
  await boot(page, ADMIN, yearSeed());
  await page.click('.nav-item[data-page="psle"]');
  await page.waitForSelector('#psleMain .psle-tabs');
  await page.click('[data-psle-act="open-year"][data-year="2013"]');
  await page.waitForSelector('#psleOverlay.show');
  // ✏️ Edit the questions starts at the first one of the paper.
  await page.click('#psleSheetBody [data-psle-act="edit-all"]');
  await page.waitForFunction(() => document.getElementById('qTitleInput').value === 'Pens question 1');
  assert.match(await page.textContent('#psleEditBar'), /Question 1 of 14/);
  assert.equal(await page.locator('#psleEditBar [data-psle-edit="prev"]').count(), 0, 'no previous on the first');
  // ↩ Back saves nothing and goes back to the sheet, list closed as it was.
  await page.fill('#qTitleInput', 'should not be saved');
  await page.click('#psleEditBar [data-psle-edit="back"]');
  await page.waitForSelector('#psleOverlay.show');
  assert.equal(await page.evaluate(() => window.__fx.db.get('users/teacher/mathQuestions/p13_1').title), 'Pens question 1');
  assert.equal(await page.locator('#psleSheetBody .psle-sheet-rows').count(), 0, 'the list was closed, and stays closed');
  // The vetting one: open it from the list and save.
  await page.click('#psleSheetBody [data-psle-act="list"]');
  await page.click('#psleSheetBody [data-psle-row="p13_12"] [data-psle-act="edit-q"]');
  await page.waitForSelector('#psleEditBar:not([hidden])');
  assert.match(await page.textContent('#psleEditBar'), /still in Vetting/);
  await page.fill('#qTitleInput', 'Pens question 12 (fixed)');
  await page.click('#saveQBtn');
  await page.waitForSelector('#psleOverlay.show #psleSheetBody [data-psle-row="p13_12"]');
  const v = await page.evaluate(() => window.__fx.db.get('users/teacher/mathVetting/p13_12'));
  assert.equal(v.title, 'Pens question 12 (fixed)');
  assert.equal(v.source, 'rapid', 'the vetting doc keeps its own fields');
  assert.deepEqual([v.psle.year, v.psle.paper, v.psle.n], ['2013', 'P1B', 12], 'it is still on its paper');
  assert.equal(await page.evaluate(() => window.__fx.db.has('users/teacher/mathQuestions/p13_12')), false, 'the save did not approve it');
  // Cancel edit from the editor's own button comes back too.
  await page.click('#psleSheetBody [data-psle-row="p13_2"] [data-psle-act="edit-q"]');
  await page.waitForSelector('#psleEditBar:not([hidden])');
  await page.click('#cancelEditBtn');
  await page.waitForSelector('#psleOverlay.show #psleSheetBody [data-psle-row="p13_2"]');
  // A later, unrelated edit from the bank is NOT sent back to the PSLE page or to vetting.
  await page.evaluate(() => document.getElementById('psleSheetClose').click());
  assert.equal(await page.locator('#psleEditBar:not([hidden])').count(), 0);
  assert.deepEqual(errors, []);
});

await scenario('✏️ a filed screenshot card opens its question in the editor and comes back to 🛠 Manage', async (page, errors) => {
  await page.addInitScript(AI);
  await boot(page, ADMIN);
  await openManage(page);
  await page.click('[data-psle-act="add-mode"][data-mode="shots"]');
  await page.selectOption('[data-psle-input="import-year"]', '2013');
  await page.selectOption('[data-psle-input="import-paper"]', 'P1B');
  await page.setInputFiles('[data-psle-input="shot-files"]', [{ name: 'a.png', mimeType: 'image/png', buffer: PNG }, { name: 'b.png', mimeType: 'image/png', buffer: PNG }]);
  await waitIdle(page);
  assert.equal(await page.locator('#psleJobs [data-psle-act="edit-q"]').count(), 2);
  await page.locator('#psleJobs [data-psle-act="edit-q"]').first().click();
  await page.waitForSelector('#psleEditBar:not([hidden])');
  assert.match(await page.textContent('#psleEditBar'), /of 2/);
  await page.click('#saveQBtn');
  await page.waitForSelector('#page-psle.active #psleJobs .psle-shot.ok');
  assert.equal(await page.getAttribute('.psle-mode.on', 'data-mode'), 'shots', 'back on the screenshots door');
  assert.equal((await vettingRows(page)).length, 2, 'both still in Vetting');
  assert.deepEqual(errors, []);
});

await scenario('🧒 a pupil never sees a PSLE question that is still in Vetting, and has no add card', async (page, errors) => {
  await page.addInitScript(AI);
  await boot(page, PUPIL, {
    'users/teacher/mathVetting/v1': { id: 'v1', title: 'Draft', blocks: [{ id: 'b', type: 'text', content: 'x' }], psle: { year: '2020', paper: 'P1A', n: 1, marks: 1 } },
    'users/teacher/mathQuestions/b1': { id: 'b1', title: 'Approved', level: 'P6', blocks: [{ id: 'b', type: 'text', content: 'What is 3 + 4?' }], psle: { year: '2018', paper: 'P1A', n: 2, marks: 1 }, createdAt: '2026-10-01T00:00:00.000Z' }
  });
  await page.click('.nav-item[data-page="psle"]');
  await page.waitForSelector('#psleMain .psle-tabs');
  const body = (await page.textContent('#psleBody')).replace(/\s+/g, ' ');
  assert.doesNotMatch(body, /2020|Vetting|Add PSLE questions/, body.slice(0, 500));
  assert.equal(await page.locator('[data-psle-act="tab"][data-tab="manage"]').count(), 0);
  assert.deepEqual(errors, []);
});

await scenario('📱 the add card on a phone: both modes fit with no sideways scroll, and 📷 is offered', async (page, errors) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript(AI);
  await boot(page, ADMIN);
  await page.evaluate(() => { if (typeof window.navigateTo === 'function') window.navigateTo('psle'); else document.querySelector('.nav-item[data-page="psle"]').click(); });
  await page.waitForSelector('#psleMain .psle-tabs');
  await page.click('[data-psle-act="tab"][data-tab="manage"]');
  await page.click('[data-psle-act="add-mode"][data-mode="shots"]');
  await page.setInputFiles('[data-psle-input="shot-files"]', { name: 'q.png', mimeType: 'image/png', buffer: PNG });
  await waitIdle(page);
  const sideways = await page.evaluate(() => {
    const host = document.getElementById('page-psle');
    // A wide table inside its own scroller is fine; anything else past the edge is not.
    const scrolls = e => { for (let a = e.parentElement; a && a !== host; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
    const wide = [...host.querySelectorAll('*')].filter(e => e.offsetParent !== null && e.getBoundingClientRect().right > window.innerWidth + 1 && !scrolls(e));
    const out = wide.slice(0, 5).map(e => String(e.className || e.tagName));
    if (document.documentElement.scrollWidth > window.innerWidth + 1) out.push('page scrollWidth ' + document.documentElement.scrollWidth);
    return out;
  });
  assert.deepEqual(sideways, [], 'nothing pokes past the right edge');
  await shot(page, 'phone-shots');
  assert.deepEqual(errors, []);
});

await browser.close();
if (failed) { console.log(failed + ' scenario(s) failed'); process.exit(1); }
console.log('all PSLE upload scenarios passed');
