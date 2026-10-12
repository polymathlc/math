// 📐 Math diagram shapes in ✏️ Touch up & label, in a REAL browser on the
// REAL page (v1.104.0). The Firebase stand-ins are the question-chart
// harness's, copied so the two files can change independently — except
// Storage, which here RECORDS what was uploaded, so the test can look at the
// picture Apply actually saved.
//
// The whole of index.html is loaded and its own module runs. Only Firebase is
// replaced — by small in-memory stand-ins served in place of the gstatic SDK
// files — so the sign-in path, the sidebar lockdown, the navigation guard, the
// ⏱️ pill and a question saved from the editor are all the production code.
// Nothing leaves the machine: every other request is aborted.
//
//   npm install playwright   (or PLAYWRIGHT_MODULE=<path to playwright>)
//   node tools/diagram-shapes-browser-tests.mjs
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
    // A scenario that sets fx.allowAnon gets the anonymous guest a printed QR signs in as.
    export async function signInAnonymously() {
      if (!fx.allowAnon) throw new Error('anonymous sign-in is off');
      fx.calls.push({ op: 'anon' });
      fx.user = { uid: 'anon1', email: null, displayName: null, isAnonymous: true, providerData: [],
        getIdTokenResult: async () => ({ claims: {} }), getIdToken: async () => 'token' };
      if (fx.authCb) await fx.authCb(fx.user);
      return { user: fx.user };
    }
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
    // fx.denyAnon: rules that refuse a reader who is not signed in.
    export async function getDoc(ref) {
      if (fx.denyAnon && !fx.user) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
      return snap(ref.path, fx.db.get(ref.path));
    }
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
  'firebase-storage.js': `export function getStorage() { return {}; } export function ref(_s, p) { return { p }; }
    export async function uploadString(r, data) { const fx = window.__fx; fx.uploads = fx.uploads || []; fx.uploads.push({ path: r.p, data }); return {}; }
    export async function getDownloadURL(r) { return 'https://example.invalid/' + encodeURIComponent(r.p); }`
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
    // The QR library: a stand-in whose "code" carries the text it encodes, so a test can read the link.
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('qrcode-generator')) return route.fulfill({ status: 200, contentType: 'text/javascript',
      body: 'export default function qrcode() { return { addData(t) { this.t = t; }, make() {}, createSvgTag() { return \'<svg class="fakeqr" data-qr="\' + encodeURIComponent(this.t) + \'"></svg>\'; } }; }' });
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
const SHOTS = process.env.MS_SHOTS || '';
const shot = async (page, name) => { if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png') }); } };
const TEACHER = { uid: 'teacher', email: 'chungzhikai@gmail.com', displayName: 'Mr Chung' };

// The Create Question editor with one empty picture block, and the blank
// 📐 sheet opened on it.
async function openBlankSheet(page, fmt = 'wide') {
  await boot(page, TEACHER);
  await page.evaluate(() => document.querySelector('.nav-item[data-page="create"]').click());
  await page.waitForSelector('#addImageBtn');
  await page.click('#addImageBtn');
  await page.waitForSelector('[data-annot-blank][data-fmt="' + fmt + '"]');
  await page.click('[data-annot-blank][data-fmt="' + fmt + '"]');
  await page.waitForSelector('#annotOverlay.show');
  await page.waitForSelector('#annotShapeBar.show');
  await page.waitForTimeout(250);
}
// The gallery is the ＋ tab of the side panel; adding a shape turns to ✎.
async function addShape(page, label) {
  if (!(await page.isVisible('#annotShapeGallery'))) await page.click('.ms-tab[data-mstab="add"]');
  const exact = new RegExp('^\\s*' + label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$');
  await page.locator('#annotShapeGallery .ms-gbtn', { hasText: exact }).first().click();
  await page.waitForTimeout(40);
}
const shapeCount = page => page.$$eval('#annotShapeSvg g[data-ms]', els => els.length);
const svgTexts = page => page.$$eval('#annotShapeSvg text', els => els.map(e => e.textContent));
const centreOf = async (page, sel) => {
  const b = await page.locator(sel).first().boundingBox();
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
};
const drag = async (page, from, to) => {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(from.x + (to.x - from.x) * i / 8, from.y + (to.y - from.y) * i / 8);
  await page.mouse.up();
  await page.waitForTimeout(60);
};
// Dark pixels in a data URL — how much line work a saved picture carries.
const inkIn = (page, dataUrl) => page.evaluate(async url => {
  const img = new Image(); img.src = url; await img.decode();
  const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
  const x = c.getContext('2d'); x.drawImage(img, 0, 0);
  const d = x.getImageData(0, 0, c.width, c.height).data;
  let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100 && d[i + 1] < 100 && d[i + 2] < 100 && d[i + 3] > 200) n++;
  return n;
}, dataUrl);

console.log('diagram shapes browser tests');

await scenario('a blank sheet opens with the shape gallery, every kind on it', async (page, errors) => {
  await openBlankSheet(page);
  assert.equal(await page.textContent('#annotOverlay .overlay-head h3'), '📐 Draw a diagram');
  const n = await page.$$eval('#annotShapeGallery .ms-gbtn', els => els.length);
  assert.ok(n >= 29, 'gallery buttons: ' + n);
  for (const label of ['Equilateral', 'Isosceles', 'Right-angled', 'Any triangle', 'Rhombus', 'Parallelogram', 'Trapezium', 'Circle', 'Semicircle', 'Cuboid', 'Angle'])
    assert.ok(await page.locator('#annotShapeGallery .ms-gbtn', { hasText: label }).count(), 'gallery has ' + label);
  assert.ok(await page.isVisible('.annot-tool.active[data-atool="shape"]'), 'the Shapes tool is chosen');
  // The panel is BESIDE the picture: both are on screen at once.
  const stage = await page.locator('#annotStage').boundingBox(), bar = await page.locator('#annotShapeBar').boundingBox();
  assert.ok(bar.x >= stage.x + stage.width - 2, 'panel to the right of the picture');
  assert.ok(stage.y + stage.height <= 900, 'the picture is not pushed off the screen');
  await shot(page, '1-gallery');
  assert.deepEqual(errors, []);
});

await scenario('a rhombus lands selected and takes a side length and an angle label', async (page, errors) => {
  await openBlankSheet(page);
  await addShape(page, 'Rhombus');
  assert.equal(await shapeCount(page), 1);
  assert.ok(await page.$$eval('#annotShapeSvg .ms-h', els => els.length) >= 5, 'handles drawn');
  assert.ok(await page.$('#annotShapeSvg [data-ms-h="a:slant"]'), 'the yellow re-shape diamond');
  // Four equal-side ticks come with a rhombus.
  const ticks = await page.$$eval('#annotShapeSvg g[data-ms] polyline', els => els.length);
  assert.ok(ticks >= 4, 'tick marks: ' + ticks);
  await page.fill('#msIn_s0', '12 cm');
  await page.selectOption('#annotShapeProps .ms-tbl select >> nth=0', 'arc');
  await page.fill('#msIn_a0', '60');
  const t = await svgTexts(page);
  assert.ok(t.includes('12 cm'), 'side label drawn: ' + t);
  assert.ok(t.includes('60°'), 'the degree sign is added: ' + t);
  await shot(page, '2-rhombus');
  assert.deepEqual(errors, []);
});

await scenario('a shape drags, turns, and ↶ Undo puts it back', async (page, errors) => {
  await openBlankSheet(page);
  await addShape(page, 'Rectangle');
  const before = await page.$eval('#annotShapeSvg g[data-ms] polygon:not(.ms-hit)', el => el.getAttribute('points'));
  const c = await centreOf(page, '#annotShapeSvg .ms-hit');
  await drag(page, c, { x: c.x + 120, y: c.y + 40 });
  const moved = await page.$eval('#annotShapeSvg g[data-ms] polygon:not(.ms-hit)', el => el.getAttribute('points'));
  assert.notEqual(moved, before, 'moved');
  const knob = await centreOf(page, '#annotShapeSvg [data-ms-h="rot"]');
  await drag(page, knob, { x: knob.x + 160, y: knob.y + 120 });
  const turn = Number(await page.inputValue('#annotShapeProps input[type=number]'));
  assert.notEqual(turn, 0, 'turned: ' + turn);
  await page.keyboard.press('Control+z');
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(60);
  const back = await page.$eval('#annotShapeSvg g[data-ms] polygon:not(.ms-hit)', el => el.getAttribute('points'));
  assert.equal(back, before, 'two undos put it back');
  assert.deepEqual(errors, []);
});

await scenario('a square stays square however its corner is dragged', async (page, errors) => {
  await openBlankSheet(page);
  await addShape(page, 'Square');
  assert.equal(await page.$('#annotShapeSvg [data-ms-h="r:e"]'), null, 'no edge handles on a locked shape');
  const h = await centreOf(page, '#annotShapeSvg [data-ms-h="r:se"]');
  await drag(page, h, { x: h.x + 140, y: h.y + 20 });
  const lens = await page.$$eval('#annotShapeProps .ms-tbl .ms-meas', els => els.map(e => e.textContent).filter(t => /px$/.test(t)).map(t => parseInt(t, 10)));
  assert.equal(lens.length, 4);
  assert.ok(Math.max(...lens) - Math.min(...lens) <= 1, 'four equal sides: ' + lens);
  assert.deepEqual(errors, []);
});

await scenario('any triangle: its corners drag one at a time, and Measure writes the real angles', async (page, errors) => {
  await openBlankSheet(page);
  await addShape(page, 'Any triangle');
  const v = await centreOf(page, '#annotShapeSvg [data-ms-h="v:0"]');
  await drag(page, v, { x: v.x - 90, y: v.y - 30 });
  await page.click('#annotShapeProps button:has-text("Measure all angles")');
  const degs = (await svgTexts(page)).filter(t => /°$/.test(t)).map(t => parseInt(t, 10));
  assert.equal(degs.length, 3, 'three angles: ' + degs);
  const sum = degs.reduce((a, b) => a + b, 0);
  assert.ok(sum >= 179 && sum <= 181, 'they add to 180: ' + degs);
  assert.deepEqual(errors, []);
});

await scenario('a right-angled triangle carries its box; Delete removes a shape; Flatten burns and Undo restores', async (page, errors) => {
  await openBlankSheet(page);
  await addShape(page, 'Right-angled');
  await addShape(page, 'Circle');
  assert.equal(await shapeCount(page), 2);
  await page.keyboard.press('Delete');
  assert.equal(await shapeCount(page), 1, 'Delete removed the selected circle');
  const blankInk = await page.evaluate(() => { const c = document.getElementById('annotCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) n++; return n; });
  assert.equal(blankInk, 0, 'nothing burned in yet');
  await page.click('#annotShapeFoot button:has-text("Flatten")');
  assert.equal(await shapeCount(page), 0);
  const ink = await page.evaluate(() => { const c = document.getElementById('annotCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) n++; return n; });
  assert.ok(ink > 500, 'lines burned into the canvas: ' + ink);
  await page.keyboard.press('Control+z');
  await page.waitForTimeout(60);
  assert.equal(await shapeCount(page), 1, 'one undo brings the live shape back');
  const after = await page.evaluate(() => { const c = document.getElementById('annotCanvas'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0; for (let i = 0; i < d.length; i += 4) if (d[i] < 100) n++; return n; });
  assert.equal(after, 0, '... and takes the burned lines off the canvas');
  assert.deepEqual(errors, []);
});

await scenario('Apply saves the shapes into the picture, and reopening brings them back live', async (page, errors) => {
  await openBlankSheet(page);
  await addShape(page, 'Isos. trapezium');
  await page.fill('#msIn_s0', '20 cm');
  await addShape(page, 'Angle');
  await shot(page, '3-before-apply');
  await page.click('#annotOverlay .overlay-foot .btn-primary');
  await page.waitForFunction(() => (window.__fx.uploads || []).length > 0);
  await page.waitForSelector('#annotOverlay.show', { state: 'hidden' });
  const up = await page.evaluate(() => window.__fx.uploads[window.__fx.uploads.length - 1].data);
  assert.ok(await inkIn(page, up) > 800, 'the saved picture has the shapes in it');
  // The block now has a picture; ✏️ Touch up on it opens with the shapes live.
  await page.waitForSelector('[data-annot-open]');
  await page.click('[data-annot-open]');
  await page.waitForSelector('#annotOverlay.show');
  await page.waitForTimeout(300);
  assert.equal(await shapeCount(page), 2, 'both shapes came back live');
  assert.ok((await svgTexts(page)).includes('20 cm'));
  assert.ok(await page.isVisible('.annot-tool.active[data-atool="shape"]'));
  await shot(page, '4-reopened');
  assert.deepEqual(errors, []);
});

await scenario('labels drag, D picks the tool, and the other tools ignore the shapes', async (page, errors) => {
  await openBlankSheet(page);
  await addShape(page, 'Parallelogram');
  await page.fill('#msIn_s0', '9 m');
  const lab = await centreOf(page, '#annotShapeSvg text.ms-label');
  await drag(page, lab, { x: lab.x + 60, y: lab.y + 50 });
  const lo = await page.evaluate(() => document.querySelector('#annotShapeSvg text.ms-label').getAttribute('x'));
  assert.ok(Math.abs(Number(lo) - 0) > 0);
  assert.ok(await page.isVisible('#annotShapeProps button:has-text("Label places")'), 'a dragged label can be put back');
  await page.keyboard.press('e');
  assert.equal(await page.isVisible('#annotShapeBar'), false, 'the panel hides with another tool');
  assert.equal(await page.$eval('#annotShapeSvg', el => getComputedStyle(el).pointerEvents), 'none', 'and the layer stops taking the pointer');
  assert.equal(await shapeCount(page), 1, 'the shape is still on show');
  await page.keyboard.press('d');
  assert.ok(await page.isVisible('#annotShapeBar'), 'D brings the shapes back');
  assert.deepEqual(errors, []);
});

await scenario('every kind in the gallery inserts without an error', async (page, errors) => {
  await openBlankSheet(page);
  const n = await page.$$eval('#annotShapeGallery .ms-gbtn', els => els.length);
  for (let i = 0; i < n; i++) {
    await page.click('.ms-tab[data-mstab="add"]');
    await page.click('#annotShapeGallery .ms-gbtn >> nth=' + i);
  }
  assert.equal(await shapeCount(page), n);
  await shot(page, '5-everything');
  assert.deepEqual(errors, []);
});

await browser.close();
if (failed) { console.log(failed + ' diagram shapes browser scenario(s) FAILED'); process.exit(1); }
console.log('all diagram shapes browser scenarios passed');
