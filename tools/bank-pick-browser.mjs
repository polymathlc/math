// ☑️ Picking questions across searches — on the REAL page (v1.119.0).
//
// "When I search or filter in the math system, I should be able to select
// individual or multiple questions so after all selection and searching and
// filtering I can make a practice and worksheet out of those questions."
//
// This harness loads the WHOLE of index.html with its own module, replaces
// Firebase with in-memory stand-ins (the PSLE upload harness's), seeds a small
// bank, and drives the real Question Bank:
//   • a tick in the LIST view, by the box and by clicking the row;
//   • the ticks SURVIVE a new search, a filter change, a sort and a view switch;
//   • "Select all N shown" ticks only what is shown, is three-state, and
//     unticks only what is shown;
//   • Shift-click ticks a range of what is shown;
//   • the bar counts every pick and says how many the search is hiding;
//   • "Show selected only" / 👁 Review selected narrows the list to the picks;
//   • the 🔢 Number from box in the bar IS the builder's #wsStartNumber;
//   • 📝 Create worksheet opens the builder with the picks in print order, a
//     title to start from, and the right numbers;
//   • ✍️ Create practice starts practice on exactly the picks, in order;
//   • Preview / Edit buttons never tick anything;
//   • a phone has no sideways scroll.
//
//   PLAYWRIGHT_MODULE=<playwright/index.mjs> node tools/bank-pick-browser.mjs [shots dir]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL, fileURLToPath } from 'node:url';

const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(/^[A-Za-z]:[\\/]|^\//.test(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ORIGIN = 'http://polymath.test';
const SHOTS = process.argv[2] || process.env.BANK_PICK_SHOTS || '';

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
async function scenario(name, fn, viewport = { width: 1360, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(15000);
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => d.accept());
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
    const own = errors.filter(e => /bank|Pick|pick|wsOnly|_bank/i.test(e));
    assert.deepEqual(own, [], 'no page errors from the picking code');
    console.log('  ok  ' + name);
  } catch (e) {
    failed++;
    console.log('  FAIL ' + name + '\n       ' + String(e && e.stack || e).split('\n').slice(0, 6).join('\n       '));
    if (errors.length) console.log('       page errors: ' + errors.slice(0, 5).join(' | '));
  } finally { await page.close(); }
}

// ---- The bank ---------------------------------------------------------------
// Two concepts under Whole Numbers, one Ratio set, one Fractions set — enough
// that a search and a filter each show a DIFFERENT handful.
const Q = (id, title, level, topic, concept, text, createdAt) => ({
  [`users/teacher/mathQuestions/${id}`]: { id, title, level, topics: [topic], concept, blocks: [{ id: 'b' + id, type: 'text', content: text }], createdAt },
  [`users/teacher/mathQuestionKeys/${id}`]: { expected: '1' }
});
const SEED = Object.assign({ 'config/mathAdmin': { uid: 'teacher', email: 'chungzhikai@gmail.com' } },
  Q('es1', 'Number of sweets Jane has', 'P4', 'Whole Numbers', 'Excess and Shortage', 'Jane has more than 50 sweets but fewer than 100 sweets.', '2026-11-10T00:00:00.000Z'),
  Q('es2', 'Buying Buns Excess and Shortage', 'P5', 'Whole Numbers', 'Excess and Shortage', 'Mathew wanted to buy 9 buns but found that he was short of $6.80.', '2026-11-11T00:00:00.000Z'),
  Q('es3', 'Lollipops and Boxes', 'P5', 'Whole Numbers', 'Excess and Shortage', 'Jonathan has some lollipops and he wants to put them into boxes.', '2026-11-12T00:00:00.000Z'),
  Q('rm1', 'Remainder riddle', 'P4', 'Whole Numbers', 'Remainders', 'A number leaves a remainder of 3 when divided by 7.', '2026-11-09T00:00:00.000Z'),
  Q('ra1', 'Sharing marbles', 'P5', 'Ratio', 'Ratio sharing', 'Ali and Ben share 30 marbles in the ratio 2 : 3.', '2026-11-08T00:00:00.000Z'),
  Q('ra2', 'Ratio of ages', 'P6', 'Ratio', 'Ratio sharing', 'The ratio of Tom’s age to his father’s age is 1 : 4.', '2026-11-07T00:00:00.000Z'),
  Q('fr1', 'Fraction of a cake', 'P4', 'Fractions', 'Fraction of a set', 'Mum baked a cake and cut it into 8 equal pieces.', '2026-11-06T00:00:00.000Z')
);

async function boot(page) {
  await page.addInitScript(seed => {
    try { localStorage.setItem('mathBankView', 'list'); localStorage.setItem('mathBankSort', 'bank'); } catch (_) {}
    window.__fx = { db: new Map(Object.entries(seed)), calls: [], claims: {}, user: null, authCb: null };
    window.__fx.user = {
      uid: 'teacher', email: 'chungzhikai@gmail.com', displayName: 'Mr Chung',
      providerData: [], isAnonymous: false,
      getIdTokenResult: async () => ({ claims: {} }),
      getIdToken: async () => 'token'
    };
  }, SEED);
  await page.goto(ORIGIN + '/index.html');
  await page.waitForFunction(() => document.getElementById('appShell')?.classList.contains('show'), null, { timeout: 20000 });
  await page.waitForTimeout(400);
  // On a phone the sidebar is folded away, so the nav item is clicked directly.
  await page.evaluate(() => document.querySelector('.nav-item[data-page="bank"]').click());
  await page.waitForSelector('#bankList .bank-item[data-bank-row]');
}
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false }); } };
const picks = page => page.evaluate(() => window.__bankPicks());
const shownIds = page => page.$$eval('#bankList [data-bank-row]', els => els.map(e => e.dataset.bankRow));
async function search(page, term) {
  await page.fill('#bankSearch', term);
  await page.waitForTimeout(80);
}
async function filter(page, id, value) {
  await page.selectOption('#' + id, value);
  await page.waitForTimeout(80);
}
const barText = async page => ((await page.textContent('#bankPickBar')) || '').replace(/\s+/g, ' ').trim();

// A read-only window on the selection, so the test checks the REAL state rather
// than what the screen claims. wsOrder is module-scoped, so it is read through
// the one thing that shows it to the user: the builder's own badges and count.
const EXPOSE = () => {
  window.__bankPicks = () => {
    const rows = [...document.querySelectorAll('#bankList [data-bank-row]')];
    return rows.filter(r => r.querySelector('[data-bank-check]')?.checked).map(r => r.dataset.bankRow);
  };
};

console.log('Question bank picking browser tests');

await scenario('☑️ ticks in the list survive a new search, a filter, a sort and a view switch', async page => {
  await page.addInitScript(EXPOSE);
  await boot(page);
  assert.equal(await page.isVisible('#bankSelectRow'), true, 'the select row is always there');
  assert.equal(await page.isVisible('#bankPickBar'), false, 'no bar until something is ticked');
  await search(page, 'excess');
  assert.deepEqual((await shownIds(page)).sort(), ['es1', 'es2', 'es3']);
  await page.click('[data-bank-check="es1"]');
  await page.click('[data-bank-main="es3"]');   // clicking the row ticks it too
  assert.match(await barText(page), /2 questions selected/);
  await shot(page, '1-two-ticked');
  // A NEW search: the two stay picked, and the bar says they are hidden, not lost.
  await search(page, 'ratio');
  assert.deepEqual((await shownIds(page)).sort(), ['ra1', 'ra2']);
  assert.match(await barText(page), /2 questions selected/);
  assert.match(await barText(page), /2 not shown by this search — still selected/);
  await page.click('[data-bank-check="ra2"]');
  assert.match(await barText(page), /3 questions selected/);
  // A filter on top, then off.
  await search(page, '');
  await filter(page, 'bankFilterLevel', 'P4');
  const p4 = await shownIds(page);
  assert.ok(p4.includes('es1') && !p4.includes('ra2'), 'P4 only: ' + p4);
  assert.equal(await page.isChecked('[data-bank-check="es1"]'), true, 'es1 is still ticked under the filter');
  await filter(page, 'bankFilterLevel', '');
  // Sort, then grid and back.
  await page.selectOption('#bankSortBy', 'title');
  await page.waitForTimeout(80);
  for (const id of ['es1', 'es3', 'ra2']) assert.equal(await page.isChecked(`[data-bank-check="${id}"]`), true, id + ' ticked after sort');
  await page.click('#bankViewToggle [data-bank-view="grid"]');
  await page.waitForSelector('#bankList .qb-tile');
  const tilesPicked = await page.$$eval('#bankList .qb-tile.picked', els => els.map(e => e.dataset.qbTile).sort());
  assert.deepEqual(tilesPicked, ['es1', 'es3', 'ra2'], 'the grid shows the same picks');
  // The badge is the PRINT position: es1 first, es3 second, ra2 third.
  const badge = await page.textContent('[data-qb-tile="ra2"] .qb-tile-check');
  assert.equal(badge.trim(), '3');
  await page.click('[data-qb-tile="fr1"]');   // a pick in the grid…
  await page.click('#bankViewToggle [data-bank-view="list"]');
  await page.waitForSelector('#bankList .bank-item[data-bank-row]');
  assert.equal(await page.isChecked('[data-bank-check="fr1"]'), true, '…is ticked in the list');
  assert.equal((await page.textContent('[data-bank-row="fr1"] .bank-item-order')).trim(), '4');
  assert.match(await barText(page), /4 questions selected/);
  await page.click('#bankViewToggle [data-bank-view="list"]');
});

await scenario('☑️ "Select all N shown" ticks only what is shown, is three-state, and unticks only what is shown', async page => {
  await page.addInitScript(EXPOSE);
  await boot(page);
  await page.click('[data-bank-check="fr1"]');           // a pick from ANOTHER search
  await filter(page, 'bankFilterConcept', 'Excess and Shortage');
  assert.match(await page.textContent('#bankSelectAllLabel'), /Select all 3 shown/);
  await page.click('[data-bank-check="es2"]');
  assert.equal(await page.evaluate(() => document.getElementById('bankSelectAll').indeterminate), true, 'some shown picked: a dash');
  await page.click('#bankSelectAll');
  assert.equal(await page.isChecked('#bankSelectAll'), true);
  assert.match(await page.textContent('#bankSelectAllLabel'), /All 3 shown selected/);
  assert.match(await barText(page), /4 questions selected/, 'three shown plus fr1');
  await shot(page, '2-select-all');
  await page.click('#bankSelectAll');                    // untick all SHOWN
  assert.match(await barText(page), /1 question selected/, 'fr1, from the other search, is kept');
  await filter(page, 'bankFilterConcept', '');
  assert.equal(await page.isChecked('[data-bank-check="fr1"]'), true);
});

await scenario('☑️ Shift-click ticks a range of what is shown', async page => {
  await page.addInitScript(EXPOSE);
  await boot(page);
  const ids = await shownIds(page);
  await page.click(`[data-bank-check="${ids[1]}"]`);
  await page.click(`[data-bank-check="${ids[4]}"]`, { modifiers: ['Shift'] });
  const ticked = await picks(page);
  assert.deepEqual(ticked, ids.slice(1, 5), 'rows 2 to 5 ticked');
  assert.match(await barText(page), /4 questions selected/);
});

await scenario('☑️ "Show selected only" narrows the list to the picks; Preview / Edit never tick anything', async page => {
  await page.addInitScript(EXPOSE);
  await boot(page);
  await page.click('[data-bank-check="ra1"]');
  await page.click('[data-bank-check="es2"]');
  await page.click('#bankPickBar [data-bank-onlypicked]');
  assert.deepEqual((await shownIds(page)).sort(), ['es2', 'ra1']);
  assert.equal(await page.isChecked('#bankOnlyPicked'), true, 'the row box agrees with the bar');
  assert.match(await barText(page), /Show all/);
  // Unticking in "selected only" takes the question off the list.
  await page.click('[data-bank-check="ra1"]');
  assert.deepEqual(await shownIds(page), ['es2']);
  await page.click('#bankOnlyPicked');
  assert.ok((await shownIds(page)).length === 7, 'all seven back');
  // The action buttons sit outside the pick target.
  await page.click('[data-bank-row="fr1"] [data-preview]');
  await page.waitForTimeout(200);
  await page.keyboard.press('Escape');
  const ov = await page.$$('.overlay.show');
  for (const o of ov) await o.evaluate(el => el.classList.remove('show'));
  assert.equal(await page.isChecked('[data-bank-check="fr1"]'), false, 'Preview did not tick the row');
});

await scenario('📝 Create worksheet opens the builder with the picks, in print order, numbered from the bar’s 🔢 box', async page => {
  await page.addInitScript(EXPOSE);
  await boot(page);
  await search(page, 'excess');
  await page.click('[data-bank-check="es3"]');
  await page.click('[data-bank-check="es1"]');
  await search(page, 'remainder');
  await page.click('[data-bank-check="rm1"]');
  // The bar's 🔢 box IS the builder's.
  await page.fill('#bankStartNumber', '21');
  await page.waitForTimeout(60);
  assert.equal(await page.inputValue('#wsStartNumber'), '21', 'written through to #wsStartNumber');
  assert.match(await barText(page), /Prints as Q21–Q23/);
  assert.equal((await page.textContent('[data-bank-row="rm1"] .bank-item-order')).trim(), '23');
  await shot(page, '3-bar-number-from');
  await page.click('#bankPickBar [data-bank-worksheet]');
  await page.waitForSelector('#page-worksheet.active');
  assert.equal(await page.isChecked('#wsOnlyPicked'), true, 'arrives showing the selection only');
  const cards = await page.$$eval('#wsQuestionGrid [data-ws-card]', els => els.map(e => e.dataset.wsCard));
  assert.deepEqual(cards, ['es3', 'es1', 'rm1'], 'print order is the order they were ticked');
  const orders = await page.$$eval('#wsQuestionGrid .ws-q-order', els => els.map(e => e.textContent.trim()));
  assert.deepEqual(orders, ['21', '22', '23']);
  assert.match(await page.textContent('#wsSelectedCount'), /3 selected/);
  const title = await page.inputValue('#wsTitle');
  assert.match(title, /Whole Numbers/, 'a title to start from: ' + title);
  await shot(page, '4-builder');
  // Untick "selected only" and the whole bank is there, picks still ticked.
  await page.click('#wsOnlyPicked');
  assert.equal(await page.$$eval('#wsQuestionGrid [data-ws-card]', els => els.length), 7);
  // Back to the bank: still three picked.
  await page.click('.nav-item[data-page="bank"]');
  await page.waitForSelector('#bankList .bank-item[data-bank-row]');
  assert.match(await barText(page), /3 questions selected/);
});

await scenario('✍️ Create practice starts practice on exactly the picks, in order', async page => {
  await page.addInitScript(EXPOSE);
  await boot(page);
  await page.click('[data-bank-check="ra2"]');
  await page.click('[data-bank-check="es2"]');
  await page.click('#bankPickBar [data-bank-practise]');
  await page.waitForSelector('#page-practice.active');
  await page.waitForTimeout(300);
  const body = (await page.textContent('#page-practice')).replace(/\s+/g, ' ');
  assert.match(body, /Ratio of ages|father’s age/, 'the first pick is the first question: ' + body.slice(0, 300));
});

await scenario('📱 on a phone the row and the bar fit with no sideways scroll', async page => {
  await page.addInitScript(EXPOSE);
  await boot(page);
  await page.click('[data-bank-check="es1"]');
  await page.click('[data-bank-check="ra1"]');
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(over <= 1, 'horizontal overflow: ' + over + 'px');
  await shot(page, '5-phone');
}, { width: 390, height: 844 });

await browser.close();
if (failed) { console.log(`\n${failed} scenario(s) failed`); process.exit(1); }
console.log('\nall bank picking scenarios passed');
