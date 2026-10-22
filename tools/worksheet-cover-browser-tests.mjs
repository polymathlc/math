// Browser regression test for THE BIG M COVER (v1.106.0): the REAL print
// document wsBuildDocumentHtml writes, on screen, on a phone and on paper, and
// the cover editor. Synthetic questions only; nothing talks to Firebase.
//
//   PLAYWRIGHT_MODULE=/path/to/playwright node tools/worksheet-cover-browser-tests.mjs [/tmp/cover-qa]
//
// What it holds the cover to:
//  • NO ICON ON A WORD — not on the logo, the pills, the heading, the title,
//    the bar, the line under it, the fields card (or its QR) or the footer —
//    for short and long titles, with and without the score box, the student
//    fields and the sheet QR, in every arrangement, at desktop and phone width
//    and in print.
//  • THE COVER IS THE WHOLE SHEET. On paper it is 210mm × 296.5mm on its own
//    margin-free page: the Big M reaches the very top-right corner of page 1,
//    while page 2 keeps its margins, and the cover never spills onto a second
//    sheet. (The corner check rasterises the PDF with poppler's pdftoppm; it is
//    skipped when that is missing unless COVER_REQUIRE_RASTER=1, as in CI.)
//  • A RETYPED TITLE RE-FITS on the owner's preview, and the sheet header
//    behind it takes the same title.
//  • THE EDITOR opens, takes every kind of change, previews it without an icon
//    on a word, and hands back what was chosen — or nothing on Cancel.
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { root, src, loadCover, app, headerBlock, editorBlock } from './worksheet-cover-harness.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const out = path.resolve(process.argv[2] || '/tmp/cover-qa');
fs.mkdirSync(out, { recursive: true });
const rootDir = new URL(root).pathname;
const MM = 96 / 25.4;

// ── a local origin serving the artwork, the script and the documents ────────
const docs = new Map();
const files = {
  '/worksheet-cover.js': 'text/javascript',
  '/arcade-ui.css': 'text/css',
  '/practice-mastery.js': 'text/javascript',
  '/practice-variety.js': 'text/javascript',
  '/assets/worksheet-covers/math-pixel-icons.png': 'image/png',
  '/assets/branding/polymath-learning-centre.png': 'image/png',
};
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (docs.has(url.pathname)) { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(docs.get(url.pathname)); return; }
  if (!files[url.pathname]) { res.writeHead(404).end(); return; }
  res.setHeader('Content-Type', files[url.pathname]);
  res.end(fs.readFileSync(path.join(rootDir, url.pathname.slice(1))));
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
// The cover script as the app page at this origin would load it, so every
// artwork URL in the documents points back here.
const A = app({ cover: loadCover(origin + '/index.html') });

const q = (id, level, title) => ({ id, level, title, blocks: [{ type: 'text', content: title }] });
const three = [q('a', 'P5', 'Find 3/4 of 120.'), q('b', 'P5', 'Express 0.35 as a fraction.'), q('c', 'P4', 'What is 20% of 85?')];
const variants = [
  { name: 'short-qr-owner', title: 'Ratio', qs: three, opts: { cover: true, fields: true, sheetUrl: 'https://polymathlc.github.io/math/?ws=ws1', headerEditId: 'ws1', headerOrg: 'Polymath Learning Centre' } },
  { name: 'long-title', title: 'Whole numbers, fractions, decimals,\npercentages, ratio and rate', qs: [q('d', 'P6', 'Revision.')],
    opts: { cover: true, fields: true, coverSettings: { subtitle: 'Revision paper for the end-of-year examination, Term 4', footer: 'Term 4 · Paper 2' } } },
  { name: 'very-long-title', title: 'Interactions between whole numbers, fractions, decimals, percentages, ratio, rate, speed and the four operations in multi-step problem sums', qs: three,
    opts: { cover: true, fields: true, headerOrg: 'Primary 6 Prelim Revision Programme 2026 · Jurong West Branch' } },
  { name: 'qr-no-score', title: 'Speed', qs: three, opts: { cover: true, fields: true, sheetUrl: 'https://polymathlc.github.io/math/?ws=ws2', coverSettings: { score: false } } },
  { name: 'qr-only', title: 'Angles', qs: three, opts: { cover: true, fields: false, sheetUrl: 'https://polymathlc.github.io/math/?ws=ws3' } },
  { name: 'no-score-no-qr', title: 'Area & perimeter', qs: three, opts: { cover: true, fields: true, coverSettings: { score: false, level: '' } } },
  { name: 'frame', title: 'Volume', qs: three, opts: { cover: true, fields: true, coverSettings: { layout: 'frame', opacity: 0.9, coverDesign: 'big-m' } } },
  { name: 'minimal', title: 'Pie charts', qs: three, opts: { cover: true, fields: true, coverSettings: { layout: 'minimal', facetOpacity: 0.4, coverDesign: 'big-m' } } },
  { name: 'largest-icons', title: 'Algebra', qs: [q('e', 'S1', 'Simplify 3x + 2x.')], opts: { cover: true, fields: true, sheetUrl: 'https://polymathlc.github.io/math/?ws=ws4', coverSettings: { scale: 1.4, opacity: 1, coverDesign: 'big-m' } } },
];
for (const v of variants) docs.set(`/doc/${v.name}.html`, await A.wsBuildDocumentHtml(v.qs, v.title, v.opts));
// A sheet with NO cover, to compare page 1 against.
docs.set('/doc/no-cover.html', await A.wsBuildDocumentHtml(three, 'Ratio', { cover: false, fields: true }));

// The editor harness: the app's own stylesheet and the cover script.
const appCss = [...src.slice(0, src.indexOf('<body')).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(m => m[1]).join('\n');
docs.set('/editor.html', `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${appCss}</style><link rel="stylesheet" href="/arcade-ui.css"><script src="/worksheet-cover.js?v=1"></script></head><body><main style="padding:24px">Cover editor harness</main></body></html>`);

// ── geometry ────────────────────────────────────────────────────────────────
// Every icon against every word, measured as the browser laid them out.
// `scope` is the cover element to measure (a document may hold one cover; the
// editor holds one in its preview).
function iconHitsIn(scopeSelector) {
  return [...document.querySelectorAll(scopeSelector)].flatMap(cover => {
    const boxes = [...cover.querySelectorAll('.wc-logo,.wc-pill,.wc-fields,.wc-bar,.wc-qr')].map(el => ({ part: el.className, box: el.getBoundingClientRect() }))
      .concat([...cover.querySelectorAll('.wc-eyebrow,.wc-title,.wc-subtitle,.wc-footer')].flatMap(el => {
        const range = document.createRange(); range.selectNodeContents(el);
        return [...range.getClientRects()].map(box => ({ part: el.className, box }));
      }));
    return [...cover.querySelectorAll('.wc-icon')].flatMap(icon => {
      const box = icon.getBoundingClientRect();
      return boxes.filter(a => Math.min(box.right, a.box.right) - Math.max(box.left, a.box.left) > 1 && Math.min(box.bottom, a.box.bottom) - Math.max(box.top, a.box.top) > 1)
        .map(a => `${icon.dataset.icon} on ${a.part}`);
    });
  });
}
// The cover's pieces stay inside the cover, and its card stays in its band.
function layoutOf(scopeSelector) {
  const cover = document.querySelector(scopeSelector);
  const c = cover.getBoundingClientRect();
  const rel = el => { const b = el.getBoundingClientRect(); return { top: (b.top - c.top) / c.height * 100, bottom: (b.bottom - c.top) / c.height * 100, left: (b.left - c.left) / c.width * 100, right: (b.right - c.left) / c.width * 100 }; };
  const pick = sel => { const el = cover.querySelector(sel); return el ? rel(el) : null; };
  return { width: c.width, height: c.height, title: pick('.wc-title'), hero: pick('.wc-hero'), fields: pick('.wc-fields'), footer: pick('.wc-footer'), qr: pick('.wc-qr'),
    icons: cover.querySelectorAll('.wc-icon').length, imagesOk: [...cover.querySelectorAll('img')].every(i => i.complete && i.naturalWidth > 0) };
}
// The cover's own images: the logo and the symbol atlas. (The sheet header's
// logo is a stub here and is nobody's business in this test.)
async function ready(page) {
  await page.waitForFunction(() => [...document.querySelectorAll('.wc-cover img')].every(img => img.complete && img.naturalWidth > 0), null, { timeout: 15000 });
}
async function checkCover(page, label, scope = '.ws-cover-sheet .wc-cover.wc-m') {
  await ready(page);
  const hits = await page.evaluate(iconHitsIn, scope);
  const g = await page.evaluate(layoutOf, scope);
  if (hits.length) await page.screenshot({ path: path.join(out, `${label}-OVERLAP.png`), fullPage: true });
  assert.deepEqual(hits, [], `${label}: icons on words`);
  assert.ok(g.imagesOk, `${label}: the logo or the symbols did not load`);
  assert.ok(g.icons >= 16, `${label}: the backdrop is missing`);
  for (const part of ['title', 'hero', 'footer']) {
    const b = g[part];
    assert.ok(b && b.top >= -0.5 && b.bottom <= 100.5 && b.left >= -0.5 && b.right <= 100.5, `${label}: ${part} leaves the cover ${JSON.stringify(b)}`);
  }
  if (g.fields) {
    // The card stays in the band the design left for it, below the title block.
    assert.ok(g.fields.top >= g.hero.bottom - 0.5, `${label}: the card rides up into the title block`);
    assert.ok(g.fields.bottom <= g.footer.top + 0.5, `${label}: the card runs into the footer`);
    assert.ok(g.fields.top > 55, `${label}: the card has grown up into the icons above it (top ${g.fields.top.toFixed(1)}%)`);
  }
  if (g.qr) assert.ok(g.qr.top >= g.fields.top - 0.5 && g.qr.bottom <= g.fields.bottom + 0.5, `${label}: the QR leaves its card`);
  return g;
}

// A PDF page as RGB pixels, via poppler. null when pdftoppm is not installed.
function rasterPage(pdfPath, pageNo, dpi = 40) {
  let ppm;
  try { ppm = execFileSync('pdftoppm', ['-r', String(dpi), '-f', String(pageNo), '-l', String(pageNo), pdfPath], { maxBuffer: 64 * 1024 * 1024 }); }
  catch (e) { if (e.code === 'ENOENT') return null; throw e; }
  // Binary PPM: "P6\n<w> <h>\n255\n" then RGB bytes.
  let i = 0; const tokens = [];
  while (tokens.length < 4) {
    while (/\s/.test(String.fromCharCode(ppm[i]))) i++;
    let t = ''; while (!/\s/.test(String.fromCharCode(ppm[i]))) t += String.fromCharCode(ppm[i++]);
    tokens.push(t);
  }
  i++;
  const [, w, h] = tokens.map(Number);
  return { w, h, at: (x, y) => { const o = i + (y * w + x) * 3; return [ppm[o], ppm[o + 1], ppm[o + 2]]; } };
}
const isWhite = ([r, g, b]) => r > 248 && g > 248 && b > 248;
const pdfPages = buf => (buf.toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;

const browser = await chromium.launch({ headless: true });
const failures = [];
const step = async (name, fn) => {
  try { await fn(); console.log('  ✓ ' + name); }
  catch (e) { failures.push(name + ': ' + e.message); console.log('  ✗ ' + name + '\n      ' + String(e.message).split('\n').join('\n      ')); }
};
let rasterSkipped = false;
try {
  for (const v of variants) {
    await step(`${v.name}: clear of every word on screen, on a phone and on paper; one sheet`, async () => {
      const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
      const errors = [];
      page.on('pageerror', e => errors.push(String(e)));
      await page.goto(`${origin}/doc/${v.name}.html`);
      const screen = await checkCover(page, `${v.name}-screen`);
      assert.ok(Math.abs(screen.height / screen.width - 297 / 210) < 0.01, `${v.name}: the screen cover is not A4-shaped (${screen.width}×${screen.height})`);
      await page.locator('.ws-cover-sheet').screenshot({ path: path.join(out, `${v.name}-screen.png`) });
      await page.setViewportSize({ width: 390, height: 844 });
      await checkCover(page, `${v.name}-phone`);
      // Print: the cover is laid out on the whole 210mm sheet.
      await page.setViewportSize({ width: Math.round(210 * MM), height: 1200 });
      await page.emulateMedia({ media: 'print' });
      const paper = await checkCover(page, `${v.name}-print`);
      assert.ok(Math.abs(paper.width - 210 * MM) < 1, `${v.name}: the printed cover is ${paper.width}px wide, not 210mm`);
      assert.ok(Math.abs(paper.height - 296.5 * MM) < 1, `${v.name}: the printed cover is ${paper.height}px tall, not 296.5mm`);
      const named = await page.locator('.ws-cover-sheet').evaluate(el => getComputedStyle(el).page);
      assert.equal(named, 'ws-cover', 'the cover is not on its own named page');
      const pdfPath = path.join(out, `${v.name}.pdf`);
      const pdf = await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: false });
      await page.emulateMedia({ media: 'screen' });
      const pages = pdfPages(pdf);
      assert.equal(pages, 2, `${v.name}: expected the cover and one sheet of questions, got ${pages} pages`);
      const p1 = rasterPage(pdfPath, 1), p2 = rasterPage(pdfPath, 2);
      if (!p1) { rasterSkipped = true; }
      else {
        // The faceted M reaches the very corner of page 1 — no page margin…
        const corner = p1.at(p1.w - 2, 1);
        assert.ok(!isWhite(corner), `${v.name}: the top-right corner of the cover page is white ${corner} — the cover has page margins`);
        // …and page 2 keeps its 13mm margin there.
        assert.ok(isWhite(p2.at(p2.w - 2, 1)) && isWhite(p2.at(p2.w - 4, 4)), `${v.name}: page 2 lost its margins`);
      }
      assert.deepEqual(errors, [], `${v.name}: page errors`);
      await page.close();
    });
  }

  await step('a sheet with no cover is not touched: page 1 keeps its margins', async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
    await page.goto(`${origin}/doc/no-cover.html`);
    assert.equal(await page.locator('.ws-cover-sheet, .wc-cover').count(), 0, 'cover material on a sheet without a cover');
    await page.emulateMedia({ media: 'print' });
    const pdfPath = path.join(out, 'no-cover.pdf');
    const pdf = await page.pdf({ path: pdfPath, format: 'A4', preferCSSPageSize: true, printBackground: false });
    assert.equal(pdfPages(pdf), 1, 'one sheet');
    const p1 = rasterPage(pdfPath, 1);
    if (p1) assert.ok(isWhite(p1.at(p1.w - 2, 1)), 'page 1 lost its margin');
    await page.close();
  });

  await step('the owner retypes the title on the cover: it re-fits, and the header follows', async () => {
    const page = await browser.newPage({ viewport: { width: 1100, height: 1400 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${origin}/doc/short-qr-owner.html`);
    await ready(page);
    const title = page.locator('.ws-cover-sheet .wc-title[data-ws-edit="title"]');
    assert.equal(await title.getAttribute('contenteditable'), 'true', 'the cover title is not editable');
    const sizeOf = () => title.evaluate(el => el.style.getPropertyValue('--wc-title-size'));
    assert.equal(await sizeOf(), '8.8cqw');
    await title.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Fractions, decimals and percentages: the complete revision set');
    const typed = await sizeOf();
    assert.ok(parseFloat(typed) < 8.8, `the retyped title did not step down (${typed})`);
    await checkCover(page, 'retyped-title');
    await page.locator('.ws-head h1').click();     // blur the cover title
    // No app tab behind this window: it says so, and both copies carry the new title.
    await page.waitForFunction(() => /NOT saved/.test((document.getElementById('wsEditNote') || {}).textContent || ''));
    assert.equal(await page.locator('.ws-head h1').textContent(), 'Fractions, decimals and percentages: the complete revision set', 'the sheet header did not take the title');
    // The heading above the title is the same `org` field as the line under the header title.
    const org = page.locator('.ws-cover-sheet .wc-eyebrow[data-ws-edit="org"]');
    await org.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await page.locator('.ws-head h1').click();
    assert.equal(await page.locator('.ws-head-text p').textContent(), '', 'clearing the heading did not clear the header line');
    assert.ok(await org.isVisible(), 'a cleared heading must stay clickable');
    await page.locator('.ws-cover-sheet').screenshot({ path: path.join(out, 'retyped-title.png') });
    assert.deepEqual(errors, []);
    await page.close();
  });

  await step('the editor: every kind of change, previewed clear of the words, handed back', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${origin}/editor.html`);
    await page.evaluate(() => {
      window._result = WorksheetCover.edit({ subject: 'math', subjectLocked: true, coverDesign: WorksheetCover.design,
        title: 'Ratio', subheader: 'Polymath Learning Centre', level: 'P5', subtitle: '3 questions', footer: 'Primary Mathematics',
        header: 'Polymath Learning Centre', nameLabel: 'Name', dateLabel: 'Date', scoreLabel: 'Score', score: true, fields: true });
    });
    const dialog = page.locator('dialog.wc-editor[open]');
    await dialog.waitFor();
    await checkCover(page, 'editor-preview', 'dialog.wc-editor .wc-editor-preview .wc-cover.wc-m');
    assert.equal(await page.locator('[data-wc-input="subject"]').isDisabled(), true, 'the subject is locked to Mathematics');
    await page.locator('[data-wc-input="title"]').fill('Ratio and proportion: models and units');
    await page.locator('[data-wc-input="level"]').fill('P6');
    await page.locator('[data-wc-input="subtitle"]').fill('Before-and-after problems');
    assert.equal(await page.locator('[data-wc-input="scoreLabel"]').isDisabled(), false, 'the score label is off while the score box is on');
    await page.locator('[data-wc-input="score"]').uncheck();
    assert.equal(await page.locator('[data-wc-input="scoreLabel"]').isDisabled(), true, 'the score label can still be changed with no score box to label');
    await page.locator('[data-wc-input="layout"]').selectOption('frame');
    await page.locator('[data-wc-input="facetOpacity"]').evaluate(el => { el.value = '0.5'; el.dispatchEvent(new Event('input', { bubbles: true })); });
    // Text clicked and retyped in the preview itself counts too.
    const footer = page.locator('.wc-editor-preview [data-wc-field="footer"]');
    await footer.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('Term 3 practice');
    await page.keyboard.press('Enter');   // finishes the edit — every cover field is one line
    assert.equal(await footer.evaluate(el => el.innerText), 'Term 3 practice', 'Enter started a second line');
    await checkCover(page, 'editor-edited', 'dialog.wc-editor .wc-editor-preview .wc-cover.wc-m');
    assert.equal(await page.locator('.wc-editor-preview .wc-score').count(), 0, 'the score box is still in the preview');
    assert.equal(await page.locator('.wc-editor-preview .wc-icon').count(), 16, 'the edges-only arrangement');
    await dialog.screenshot({ path: path.join(out, 'editor.png') });
    await page.locator('.wc-editor [type=submit]').click();
    const r = await page.evaluate(() => window._result);
    assert.equal(r.title, 'Ratio and proportion: models and units');
    assert.equal(r.level, 'P6');
    assert.equal(r.subtitle, 'Before-and-after problems');
    assert.equal(r.footer, 'Term 3 practice');
    assert.equal(r.score, false);
    assert.equal(r.layout, 'frame');
    assert.equal(r.facetOpacity, 0.5);
    assert.equal(r.coverDesign, 'big-m');
    assert.equal(await page.locator('dialog.wc-editor').count(), 0, 'the dialog was not removed');
    // Cancel hands back nothing.
    await page.evaluate(() => { window._result = WorksheetCover.edit({ title: 'X' }); });
    await page.locator('dialog.wc-editor[open]').waitFor();
    await page.locator('.wc-editor-actions [data-wc-cancel]').click();
    assert.equal(await page.evaluate(() => window._result), null, 'Cancel saved something');
    // On a phone the form and the preview stack.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => { window._result = WorksheetCover.edit({ title: 'Speed', level: 'P6' }); });
    await page.locator('dialog.wc-editor[open]').waitFor();
    await checkCover(page, 'editor-phone', 'dialog.wc-editor .wc-editor-preview .wc-cover.wc-m');
    await page.locator('dialog.wc-editor[open]').screenshot({ path: path.join(out, 'editor-phone.png') });
    await page.keyboard.press('Escape');
    assert.equal(await page.evaluate(() => window._result), null, 'Escape saved something');
    assert.deepEqual(errors, []);
    await page.close();
  });

  // The app's own wsEditCover, cut out of index.html and run over the real
  // editor with the worksheet store stubbed: what it writes, what it ticks, and
  // what it refuses.
  await step('🎨 Cover in the app: saves the title, the heading and only what changed; refuses and rolls back', async () => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
    const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(`${origin}/editor.html`);
    await page.addScriptTag({ type: 'module', content: "import { parsePracticeLevel } from '/practice-mastery.js'; window.parsePracticeLevel = parsePracticeLevel; window._levels = true;" });
    await page.waitForFunction(() => window._levels === true);
    await page.evaluate(() => { document.querySelector('main').innerHTML = '<input id="wsTitle"><input type="checkbox" id="wsIncludeCover"><input type="checkbox" id="wsIncludeFields" checked><input type="checkbox" id="mwIncludeCover"><input type="checkbox" id="mwIncludeFields" checked>'; });
    await page.addScriptTag({ content: `
      const escapeHtml = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
      const WS_COVER_LOGO = "", WS_LOGO_FALLBACK = "";
      let wsCoverSettings = null, wsBuilderOrg = null, _wsCoverOwner = null, _wvWs = null;
      let currentUser = { uid: "teacher" };
      const $ = id => document.getElementById(id);
      const toasts = [], writes = [];
      let refuse = false, renders = 0;
      const bank = { a: { id: "a", level: "P5", title: "A" }, b: { id: "b", level: "P6", title: "B" }, c: { id: "c", level: "P4", title: "C" } };
      let sheets = [{ id: "ws1", title: "Fractions", ownerUid: "teacher", questionIds: ["a", "b"] }, { id: "ws2", title: "Theirs", ownerUid: "someone-else", questionIds: ["a"] }];
      // The builder's picks, read through the app's own wsSelectedQuestions
      // and wsQuestionById.
      let wsOrder = ["c"];
      const questionBank = Object.values(bank), studentGeneratedQuestions = [], foundationQuestions = {};
      function toast(msg, kind) { toasts.push({ msg, kind }); }
      function wsFind(id) { return sheets.find(w => w.id === id) || null; }
      function wsMine(ws) { return !!(currentUser && ws && ws.ownerUid === currentUser.uid); }
      function dgIsTest(ws) { return !!ws && ws.kind === "diagnostic"; }
      function wsSavedQuestions(ws) { return (ws.questionIds || []).map(id => bank[id]).filter(Boolean); }
      async function persistWorksheet(ws) { if (refuse) throw new Error("write refused"); writes.push(JSON.parse(JSON.stringify(ws))); }
      function renderSavedWorksheets() { renders++; }
      function renderDiagnosticPage() { renders++; }
      function renderWorksheetOverview() { renders++; }
      ${headerBlock}
      ${editorBlock}
      window._t = { get: () => ({ toasts, writes, renders, sheets, wsCoverSettings, wsBuilderOrg }), refuse(v) { refuse = v; }, become(uid) { currentUser = uid ? { uid } : null; } };
    ` });
    const dialogLoc = page.locator('dialog.wc-editor[open]');
    let phase = 'start';
    // Says which phase never got its dialog, and what the page said about it.
    const dialog = { waitFor: async () => {
      try { await dialogLoc.waitFor({ timeout: 5000 }); }
      catch (e) { throw new Error(`no editor in phase ${phase}: ` + JSON.stringify({ errors, toasts: await page.evaluate(() => window._t && window._t.get().toasts) })); }
    } };
    const val = sel => page.locator(sel).inputValue();
    const submit = () => page.locator('.wc-editor [type=submit]').click();

    phase = '①';
    // ① A saved sheet: the editor opens on what the sheet prints by itself.
    await page.evaluate(() => { window._p = wsEditCover('saved', 'ws1'); });
    await dialog.waitFor();
    assert.deepEqual([await val('[data-wc-input="title"]'), await val('[data-wc-input="subheader"]'), await val('[data-wc-input="level"]'), await val('[data-wc-input="subtitle"]'), await val('[data-wc-input="footer"]')],
      ['Fractions', 'Polymath Learning Centre', 'P6', '2 questions', 'Primary Mathematics'], 'what the editor opened on');
    assert.equal(await page.locator('[data-wc-input="subject"]').isDisabled(), true);
    await page.locator('[data-wc-input="title"]').fill('  Fractions   revision ');
    await page.locator('[data-wc-input="subheader"]').fill('');
    await page.locator('[data-wc-input="subtitle"]').fill('Mixed practice');
    await page.locator('[data-wc-input="score"]').uncheck();
    await submit();
    assert.equal(await page.evaluate(() => window._p), true, 'the save did not report success');
    let t = await page.evaluate(() => window._t.get());
    const saved = t.writes[t.writes.length - 1];
    assert.deepEqual({ title: saved.title, headerOrg: saved.headerOrg, cover: saved.cover }, { title: 'Fractions revision', headerOrg: '', cover: { subtitle: 'Mixed practice', score: false, coverDesign: 'big-m' } },
      'the saved worksheet — the level the questions give was NOT frozen into it');
    assert.equal(await page.locator('#mwIncludeCover').isChecked(), true, 'the reprint tick for a cover');
    assert.ok(t.renders > 0 && t.toasts.some(x => x.kind === 'success'), 'the list was not redrawn or nothing was said');

    phase = '②';
    // ② Somebody else's sheet: no editor at all.
    await page.evaluate(() => { window._p = wsEditCover('saved', 'ws2'); });
    assert.equal(await page.evaluate(() => window._p), false);
    assert.equal(await page.locator('dialog.wc-editor').count(), 0, 'an editor opened on the teacher\'s sheet');
    t = await page.evaluate(() => window._t.get());
    assert.match(t.toasts[t.toasts.length - 1].msg, /belongs to your teacher/);

    phase = '③';
    // ③ A refused write puts everything back.
    await page.evaluate(() => { window._t.refuse(true); window._p = wsEditCover('saved', 'ws1'); });
    await dialog.waitFor();
    assert.equal(await val('[data-wc-input="subtitle"]'), 'Mixed practice', 'the editor reopened on what was saved');
    assert.equal(await page.locator('[data-wc-input="score"]').isChecked(), false);
    await page.locator('[data-wc-input="title"]').fill('Something else');
    await page.locator('[data-wc-input="level"]').fill('P4');
    await submit();
    assert.equal(await page.evaluate(() => window._p), false);
    t = await page.evaluate(() => window._t.get());
    const ws1 = t.sheets.find(w => w.id === 'ws1');
    assert.deepEqual({ title: ws1.title, headerOrg: ws1.headerOrg, cover: ws1.cover }, { title: 'Fractions revision', headerOrg: '', cover: { subtitle: 'Mixed practice', score: false, coverDesign: 'big-m' } }, 'a refused write was not put back');
    assert.match(t.toasts[t.toasts.length - 1].msg, /Couldn't save the cover: write refused/);
    await page.evaluate(() => window._t.refuse(false));

    phase = '④';
    // ④ The builder: the heading is held for the print, the empty title box stays empty.
    await page.evaluate(() => { window._p = wsEditCover('builder'); });
    await dialog.waitFor();
    assert.deepEqual([await val('[data-wc-input="title"]'), await val('[data-wc-input="level"]'), await val('[data-wc-input="subtitle"]')], ['Math Worksheet', 'P4', '1 question']);
    await page.locator('[data-wc-input="subheader"]').fill('Jurong West');
    await submit();
    assert.equal(await page.evaluate(() => window._p), true);
    t = await page.evaluate(() => window._t.get());
    assert.deepEqual([t.wsCoverSettings, t.wsBuilderOrg], [{ coverDesign: 'big-m' }, 'Jurong West']);
    assert.equal(await page.locator('#wsTitle').inputValue(), '', 'the untouched title box was filled in');
    assert.equal(await page.locator('#wsIncludeCover').isChecked(), true);

    phase = '⑤';
    // ⑤ The account changes while the dialog is open: nothing is kept.
    await page.evaluate(() => { window._p = wsEditCover('builder'); });
    await dialog.waitFor();
    assert.equal(await val('[data-wc-input="subheader"]'), 'Jurong West', 'the builder\'s own heading');
    await page.locator('[data-wc-input="level"]').fill('P6');
    await page.evaluate(() => window._t.become('pupil'));
    await submit();
    assert.equal(await page.evaluate(() => window._p), false);
    t = await page.evaluate(() => window._t.get());
    assert.deepEqual(t.wsCoverSettings, { coverDesign: 'big-m' }, 'a cover was kept across an account switch');
    assert.match(t.toasts[t.toasts.length - 1].msg, /account changed/);
    assert.deepEqual(errors, []);
    await page.close();
  });
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
if (rasterSkipped) {
  const msg = 'pdftoppm is not installed, so the margin-free corner of page 1 was not checked';
  if (process.env.COVER_REQUIRE_RASTER === '1') failures.push(msg); else console.log('  ! ' + msg);
}
console.log(`\nScreenshots and PDFs: ${out}`);
if (failures.length) { console.log(`\n${failures.length} failed`); process.exit(1); }
console.log('PASS Big M cover: clear of every word in every variant, on screen, phone and paper; the whole sheet on its own margin-free page; retyped titles re-fit; the editor round-trips');
