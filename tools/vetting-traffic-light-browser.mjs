// 🚦 The traffic lights on the vetting cards, and 🔍± the picture pills in
// the 👁 peek, in a REAL browser on the REAL page (v1.111.0).
//
// The whole of index.html is loaded and its own module runs. Only Firebase is
// replaced — by the same small in-memory stand-ins the employee browser test
// serves in place of the gstatic SDK — so the vetting list, the cards, the
// quick edit, the filter and the exported peek are all the production code.
// Nothing leaves the machine: every other request is aborted, which is also
// why a 🚦 press here must end in a red "couldn't finish" line on the card,
// never in a broken card.
//
//   npm install playwright   (or PLAYWRIGHT_MODULE=<path to playwright>)
//   node tools/vetting-traffic-light-browser.mjs
//   TL_SHOTS=<dir> node tools/vetting-traffic-light-browser.mjs   (screenshots)
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
const SHOTS = process.env.TL_SHOTS || '';
const shot = async (page, name, el) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await (el || page).screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const TEACHER = { uid: 'teacher', email: 'chungzhikai@gmail.com', displayName: 'Mr Chung' };
const IMG = ORIGIN + '/assets/app-icons/icon-512.png';
const vet = (id, extra) => Object.assign({
  id, title: 'Cost of a Bag ' + id, level: 'P4', topics: ['Whole Numbers'], topic: 'Whole Numbers',
  blocks: [{ id: 't1', type: 'text', content: 'Peter bought 3 shirts and 2 bags for $289. Each bag cost $17 more than a shirt. How much did a bag cost?' }],
  expected: '$68', markingGuide: '289 - 34 = 255, 255 / 5 = 51, 51 + 17 = 68', createdAt: '2026-10-2' + id.length + 'T00:00:00.000Z'
}, extra || {});
const SEED = {
  'users/teacher/mathVetting/v1': vet('v1'),
  'users/teacher/mathVetting/v2': vet('v2', { title: 'Favourite Hobbies', blocks: [
    { id: 't1', type: 'text', content: 'The table below shows the favourite hobbies of some P4 students.' },
    { id: 'img1', type: 'image', url: IMG }
  ], expected: '120 students' }),
  'users/teacher/mathVetting/v3': vet('v3', { title: 'Imported', autoCheck: { state: 'red', sig: 'old', findings: [{ title: 'Answer', detail: 'should be 35' }] } })
};
async function openVetting(page) {
  await boot(page, TEACHER, SEED);
  await page.click('.nav-item[data-page="vetting"]');
  await page.waitForSelector('#vettingList .vet-card');
}
const card = (page, title) => page.locator('#vettingList .vet-card', { hasText: title });

console.log('vetting traffic light browser tests');

await scenario('every vetting card carries its light, and the PDF import\'s verdict is one of them', async (page, errors) => {
  await openVetting(page);
  assert.equal(await page.locator('#vettingList .vet-card').count(), 3);
  const plain = card(page, 'Cost of a Bag v1');
  assert.match(await plain.locator('.vet-tl').innerText(), /Not checked yet/);
  assert.match(await plain.locator('[data-aic-run]').innerText(), /Check with AI/);
  const imported = card(page, 'Imported');
  assert.match(await imported.locator('.vet-tl').innerText(), /Red light/);
  assert.match(await imported.locator('.vet-tl').innerText(), /should be 35/);
  assert.match(await imported.locator('.vet-tl').innerText(), /changed since this light/, 'its signature does not match the question any more');
  // The bulk bar carries the filter and the two 🚦 buttons.
  assert.ok(await page.isVisible('#vetLightFilter'));
  assert.match(await page.locator('#aicCheckNewBtn').innerText(), /Check unchecked \(3\)/);
  await shot(page, '1-cards');
  assert.deepEqual(errors, []);
});

await scenario('✏️ quick edit fixes the answer and adds the teacher\'s own green, without opening the editor', async (page, errors) => {
  await openVetting(page);
  const c = card(page, 'Cost of a Bag v1');
  await c.locator('[data-aic-quick]').click();
  const box = card(page, 'Cost of a Bag v1').locator('.vet-qe');
  await box.locator('[data-qe-k="expected"]').fill('$51');
  await box.locator('[data-qe-k="markingGuide"]').fill('A shirt is $51 - wait, a bag is $68; checked.');
  await box.locator('[data-qe-light][data-v="green"]').click();
  assert.ok(await box.locator('[data-qe-k="note"]').isVisible(), 'the note opens with a light');
  await box.locator('[data-qe-k="note"]').fill('checked against the paper');
  await shot(page, '2-quick-edit', card(page, 'Cost of a Bag v1'));
  await box.locator('[data-qe-save]:not([data-qe-recheck])').click();
  await page.waitForFunction(() => !document.querySelector('#vettingList .vet-qe'));
  const saved = await page.evaluate(() => window.__fx.db.get('users/teacher/mathVetting/v1'));
  assert.equal(saved.expected, '$51');
  assert.equal(saved.aiChecks.length, 1);
  assert.equal(saved.aiChecks[0].kind, 'manual');
  assert.equal(saved.aiChecks[0].verdict, 'green');
  const after = card(page, 'Cost of a Bag v1');
  assert.match(await after.locator('.vet-tl').innerText(), /Green light/);
  assert.match(await after.locator('.vet-tl').innerText(), /checked against the paper/);
  assert.ok(await after.evaluate(el => el.classList.contains('tl-green')), 'the card edge goes green');
  assert.equal(await page.isVisible('#page-create'), false, 'the editor was never opened');
  // A second light: red this time — both are kept, the newest on top.
  await after.locator('[data-aic-quick]').click();
  const box2 = card(page, 'Cost of a Bag v1').locator('.vet-qe');
  await box2.locator('[data-qe-light][data-v="red"]').click();
  await box2.locator('[data-qe-k="note"]').fill('no — the bag is $68');
  await box2.locator('[data-qe-save]:not([data-qe-recheck])').click();
  await page.waitForFunction(() => !document.querySelector('#vettingList .vet-qe'));
  const two = card(page, 'Cost of a Bag v1');
  assert.match(await two.locator('.vet-tl-head').innerText(), /Red light/);
  assert.match(await two.locator('.vet-tl-more').innerText(), /Earlier checks \(1\) 🟢/);
  await two.locator('.vet-tl-more').click();
  assert.match(await card(page, 'Cost of a Bag v1').locator('.vet-tl-history').innerText(), /checked against the paper/);
  await shot(page, '3-two-lights', card(page, 'Cost of a Bag v1'));
  assert.equal((await page.evaluate(() => window.__fx.db.get('users/teacher/mathVetting/v1'))).aiChecks.length, 2);
  assert.deepEqual(errors, []);
});

await scenario('the 🚦 filter shows only the reds, and Select all ticks only what is shown', async (page, errors) => {
  await openVetting(page);
  await page.selectOption('#vetLightFilter', 'stale');
  assert.equal(await page.locator('#vettingList .vet-card').count(), 1);
  assert.match(await page.locator('#vettingList').innerText(), /2 questions are hidden by the 🚦 filter/);
  await page.check('#vetPickAll');
  assert.match(await page.locator('.vet-bulk-count').first().innerText(), /1 selected/);
  await page.click('#vetLightShowAll');
  assert.equal(await page.locator('#vettingList .vet-card').count(), 3);
  assert.deepEqual(errors, []);
});

await scenario('a 🚦 press with no AI reachable ends in a reason on the card, not a broken card', async (page, errors) => {
  await openVetting(page);
  const ready = await page.evaluate(() => typeof window.aiReady === 'function' ? window.aiReady() : null);
  await card(page, 'Cost of a Bag v1').locator('[data-aic-run]').click();
  if (ready === false) {
    // The page says "AI isn't ready" and leaves the card as it was.
    assert.match(await card(page, 'Cost of a Bag v1').locator('.vet-tl').innerText(), /Not checked yet/);
  } else {
    await page.waitForFunction(() => !document.querySelector('#vettingList [data-aic-run][disabled]'), null, { timeout: 20000 });
    const txt = await card(page, 'Cost of a Bag v1').locator('.vet-tl').innerText();
    assert.ok(/Couldn't finish the check|Not checked yet/.test(txt), txt);
  }
  assert.equal(await page.locator('#vettingList .vet-card').count(), 3);
  assert.deepEqual(errors, []);
});

await scenario('the 👁 peek has − / + / Auto on its picture, and the size is saved when it closes', async (page, errors) => {
  await openVetting(page);
  const eye = card(page, 'Favourite Hobbies').locator('.vet-print-eye');
  await eye.hover();
  await page.waitForSelector('.vet-print-peek iframe');
  const frame = page.frameLocator('.vet-print-peek iframe');
  await frame.locator('[data-pvs-bar]').first().waitFor({ timeout: 15000 });
  assert.equal(await frame.locator('[data-pvs-bar]').count(), 1, 'one pill for the one picture');
  assert.equal(await frame.locator('[data-pvs-bar] .pvs-label').innerText(), '100%');
  const plus = frame.locator('[data-pvs-bar] .pvs-btn', { hasText: '+' });
  await plus.click(); await plus.click();
  assert.equal(await frame.locator('[data-pvs-bar] .pvs-label').innerText(), '120%');
  const width = await frame.locator('img.question-image[data-bid="img1"]').evaluate(img => img.style.getPropertyValue('--question-image-width'));
  assert.equal(width.trim(), '120%', 'the picture itself is resized in the peek');
  await shot(page, '4-peek-pill');
  await frame.locator('[data-pvs-bar] .pvs-btn', { hasText: '−' }).click();
  assert.equal(await frame.locator('[data-pvs-bar] .pvs-label').innerText(), '110%');
  // Close the peek: the size is written then.
  await page.click('.vet-print-peek-head button');
  await page.waitForFunction(() => {
    const d = window.__fx.db.get('users/teacher/mathVetting/v2');
    return d && d.blocks && d.blocks[1] && d.blocks[1].scale === 1.1;
  }, null, { timeout: 5000 });
  // Auto puts it back: the field is removed, not set.
  await eye.hover();
  await page.frameLocator('.vet-print-peek iframe').locator('[data-pvs-bar]').first().waitFor({ timeout: 15000 });
  const f2 = page.frameLocator('.vet-print-peek iframe');
  assert.equal(await f2.locator('[data-pvs-bar] .pvs-label').innerText(), '110%', 'the peek opens at the saved size');
  await f2.locator('[data-pvs-bar] .pvs-btn', { hasText: 'Auto' }).click();
  assert.equal(await f2.locator('[data-pvs-bar] .pvs-label').innerText(), '100%');
  await page.click('.vet-print-peek-head button');
  await page.waitForFunction(() => {
    const d = window.__fx.db.get('users/teacher/mathVetting/v2');
    return d && d.blocks && d.blocks[1] && !('scale' in d.blocks[1]);
  }, null, { timeout: 5000 });
  assert.deepEqual(errors, []);
});

await browser.close();
console.log(failed ? `\n${failed} scenario(s) failed` : '\nall scenarios passed');
process.exit(failed ? 1 : 0);
