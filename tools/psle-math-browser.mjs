// 🎓 PSLE Papers in a real browser: index.html's own styles and markup, the
// shipped page block (cut out of index.html between its markers), the real
// psle-math.js — and a fake world of SYNTHETIC questions (no real paper).
// Checks a computer and a phone: the years and topics grids, a year's sheet
// and every action's door, trends, a pupil's progress, the teacher's Manage
// tab, the edit dialog and the exam clock.
//   PW=/path/to/playwright/index.mjs node tools/psle-math-browser.mjs [screenshot-dir]
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const pwPath = process.env.PW || process.env.PLAYWRIGHT_MODULE;
const { chromium } = pwPath ? await import(pwPath) : require('playwright');
const outDir = process.argv[2] || '';
if (outDir) fs.mkdirSync(outDir, { recursive: true });

const root = new URL('..', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const html = read('index.html');
const styles = [...html.slice(0, html.indexOf('<body')).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const cut = (a, b) => { const x = html.indexOf(a), y = html.indexOf(b, x + a.length); assert(x >= 0 && y > x, a); return html.slice(x, y); };
const pageMarkup = cut('<div class="page" id="page-psle">', '<div class="page" id="page-syllabus">');
const overlays = cut('<div class="overlay psle-overlay" id="psleOverlay"', '<div class="overlay" id="aiEngineOverlay">');
const glue = cut('// 🎓 PSLE MATH — THE PAPERS PAGE', '// 🎓 END PSLE MATH');
const imported = html.match(/import \{([^}]*)\} from "\.\/psle-math\.js/)[1].split(',').map(s => s.trim()).filter(Boolean);

// ---- The fake world ---------------------------------------------------------
const WORLD = String.raw`
var LOG = [];
var $ = id => document.getElementById(id);
var escapeHtml = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
var SYL_LO_BY_ID = {
  "P6.FR.1.1": { subKey: "FR", topic: "Four Operations" }, "P6.PCT.1.1": { subKey: "PCT", topic: "Percentage" },
  "P6.RAT.1.1": { subKey: "RAT", topic: "Ratio" }, "P6.RS.1.1": { subKey: "RS", topic: "Distance, Time and Speed" },
  "P6.ALG.1.1": { subKey: "ALG", topic: "Algebra" }, "P6.AV.1.1": { subKey: "AV", topic: "Area and Circumference of Circle" },
  "P6.AV.2.1": { subKey: "AV", topic: "Volume of Cube and Cuboid" }, "P5.AV.1.1": { subKey: "AV", topic: "Area of Triangle" },
  "P5.GEO.1.1": { subKey: "GEO", topic: "Angles" }, "P6.GEO.1.1": { subKey: "GEO", topic: "Special Quadrilaterals" },
  "P6.DRI.1.1": { subKey: "DRI", topic: "Pie Charts" }, "P5.DA.1.1": { subKey: "DA", topic: "Average of a Set of Data" },
  "P4.WN.1.1": { subKey: "WN", topic: "Factors and Multiples" }, "P4.DEC.1.1": { subKey: "DEC", topic: "Decimals up to 3 decimal places" }
};
var LO_IDS = Object.keys(SYL_LO_BY_ID);
function mkBank() {
  var out = [], years = [2025, 2024, 2023, 2022, 2021, 2020, 2019], k = 0;
  years.forEach(function (y) {
    for (var n = 1; n <= 30; n++) {
      var paper = n <= 18 ? "P1A" : "P1B";
      if (y === 2019 && (n === 22 || n > 24)) continue;   // a paper with a gap, for Manage
      out.push({ id: "q" + y + "a" + n, title: "Synthetic " + y + " P1 question " + n, level: "P6", los: [LO_IDS[(k++ * 7 + y) % LO_IDS.length]],
        blocks: [{ type: "text", content: "A synthetic test question number " + n + " for " + y + ". Find the value of the unknown." }],
        options: paper === "P1A" ? ["12", "15", "18", "21"] : undefined,
        psle: { year: String(y), paper: paper, n: n, marks: paper === "P1A" ? (n <= 10 ? 1 : 2) : 2, diff: n % 7 === 0 ? "hard" : n % 5 === 0 ? "easy" : undefined } });
    }
    for (var m = 1; m <= 15; m++) {
      out.push({ id: "q" + y + "p" + m, title: "Synthetic " + y + " Paper 2 question " + m, level: "P6", los: [LO_IDS[(k++ * 5 + y) % LO_IDS.length]],
        blocks: [{ type: "text", content: "(a) Part one of synthetic question " + m + ". [1]\n(b) Part two. [2]" }],
        psle: { year: String(y), paper: "P2", n: m, marks: m <= 5 ? 2 : 3 + (m % 3), marksGuess: y === 2025 && m > 12 ? true : undefined } });
    }
  });
  // Unfiled questions the detector should find.
  out.push({ id: "found1", title: "Q8 — synthetic", sourcePdf: "PSLE 2018 Paper 2.pdf", sourceQuestionNumber: "8", blocks: [{ type: "text", content: "Find the area. [4]" }] });
  out.push({ id: "found2", title: "Q9 — synthetic", sourcePdf: "PSLE 2018 Paper 2.pdf", sourceQuestionNumber: "9", blocks: [{ type: "text", content: "Find x." }] });
  out.push({ id: "plain1", title: "An ordinary bank question", blocks: [{ type: "text", content: "Nothing to do with PSLE." }] });
  return out;
}
var questionBank = mkBank();
var vettingList = [{ id: "v1", title: "Q3 — fresh from Rapid add", sourcePdf: "PSLE-2018-P1A — scan.pdf", sourceQuestionNumber: "3", options: ["1","2","3","4"], blocks: [{ type: "text", content: "Which is the largest?" }] }];
var currentUser = { uid: "u1", role: window.__ROLE || "student", name: "Test" };
var canManageQuestions = () => currentUser.role === "admin";
var _isEmployee = () => false;
var questionText = q => (q.blocks || []).map(b => b.content || "").join(" ");
var renderQuestionBlocksHtml = blocks => (blocks || []).map(b => "<p>" + escapeHtml(b.content || "") + "</p>").join("");
var mcqOptionsPreviewHtml = q => Array.isArray(q.options) ? "<ol class='opts'>" + q.options.map(o => "<li>" + escapeHtml(o) + "</li>").join("") + "</ol>" : "";
var toast = (m, t) => { LOG.push(["toast", m, t]); };
var navigateTo = p => { LOG.push(["nav", p]); document.querySelectorAll(".page").forEach(x => x.classList.toggle("active", x.id === "page-" + p)); if (typeof psleOnNavigate === "function") psleOnNavigate(p); };
var closeOverlay = id => $(id).classList.remove("show");
var _studentManualQuestions = qs => qs;
var _practiceSetMode = (on, qs) => LOG.push(["practise", qs.map(q => q.id)]);
var qIndex = 0;
var renderQuestion = () => {};
var CPB_META_DEFAULTS = { org: "POLYMATH" }; var cpbMeta = { org: "TEACHER'S OWN DRAFT" };
var wsBuildDocumentHtml = async (list, title, opts) => { LOG.push(["print", list.map(q => q.id), title, cpbMeta.exam, opts.paper.groups.map(g => g.book), opts.withAnswers]); return "<!doctype html><title>" + escapeHtml(title) + "</title><p>paper</p>"; };
var db = {}, doc = (...a) => a.join("/"), collection = (...a) => a.join("/");
var getDocs = async () => ({ forEach: fn => [
  { questionId: "q2025a1", verdict: "correct" }, { questionId: "q2025a2", credit: 0 }, { questionId: "q2025p6", marks: 1, outOf: 4 },
  { questionId: "q2024a3", verdict: "correct" }, { questionId: "q2024a4", credit: 0 }, { questionId: "q2024a5", credit: 0 } ].forEach(d => fn({ data: () => d })) });
var setDoc = async (path, data, opts) => { LOG.push(["setDoc", path, JSON.stringify(data), !!(opts && opts.merge)]); };
var deleteField = () => "<deleteField>";
var _bankOwnerOrThrow = () => "admin";
var saveVettingDoc = async q => LOG.push(["saveVetting", q.id, JSON.stringify(q.psle || null)]);
var rapidJobs = [];
var startRapidJob = (file, level, opts) => { LOG.push(["rapid", file.name, level, opts.release]); rapidJobs.push({ source: file.name }); return Promise.resolve({ queued: true }); };
var vetApprove = async id => LOG.push(["approve", id]);
var renderVettingList = () => {};
`;

const harness = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>${styles}</style><link rel="stylesheet" href="/psle-math.css"></head>
<body class="${'arcade-ui'}"><div class="main" style="padding:24px;">${pageMarkup}</div>${overlays}<div id="toast"></div>
<script>${WORLD}</script>
<script type="module">
import * as P from "/psle-math.js";
${imported.map(n => `window.${n} = P.${n};`).join('\n')}
const s = document.createElement("script");
s.textContent = ${JSON.stringify(glue)};
document.body.appendChild(s);
window.__ready = true;
</script></body></html>`;

const browser = await chromium.launch();
const failures = [];
async function run(role, viewport, label) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  page.on('pageerror', e => failures.push(label + ': ' + e.message));
  page.on('console', m => { if (m.type() === 'error') failures.push(label + ' console: ' + m.text()); });
  await page.route('http://psle.test/**', async r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/') return r.fulfill({ contentType: 'text/html', body: harness });
    const f = path.join(new URL(root).pathname, u.pathname);
    return r.fulfill({ contentType: u.pathname.endsWith('.css') ? 'text/css' : 'text/javascript', body: fs.readFileSync(f, 'utf8') });
  });
  await page.addInitScript(r => { window.__ROLE = r; }, role);
  await page.goto('http://psle.test/');
  await page.waitForFunction(() => window.__ready && typeof renderPslePage === 'function');
  await page.evaluate(() => navigateTo('psle'));
  await page.waitForSelector('.psle-pick-year');
  const shot = async name => { if (outDir) await page.screenshot({ path: path.join(outDir, `${label}-${name}.png`), fullPage: true }); };
  const noScrollX = async () => {
    const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (w > 1) console.error(await page.evaluate(() => [...document.querySelectorAll('#psleBody *')].filter(e => e.getBoundingClientRect().right > innerWidth + 1).slice(0, 8).map(e => e.tagName + '.' + e.className + ' ' + Math.round(e.getBoundingClientRect().right)).join('\n')));
    assert.ok(w <= 1, `${label}: the page scrolls sideways by ${w}px`);
  };

  // Years
  const years = await page.$$eval('.psle-pick-year .psle-pick-title', els => els.map(e => e.textContent));
  assert.deepEqual(years.slice(0, 3), ['2025', '2024', '2023'], 'newest first');
  await noScrollX();
  await shot('1-years');

  // A year's sheet
  await page.click('.psle-pick-year[data-year="2024"]');
  await page.waitForSelector('#psleOverlay.show');
  assert.match(await page.textContent('#psleSheetBody .psle-sheet-sub'), /45 questions/);
  assert.match(await page.evaluate(() => location.hash), /#psle\/2024/);
  await page.click('[data-psle-act="sheet-paper"][data-paper="P2"]');
  assert.match(await page.textContent('#psleSheetBody .psle-sheet-sub'), /15 questions/);
  await page.click('[data-psle-act="list"]');
  await page.waitForSelector('.psle-sheet-rows .psle-row');
  await page.click('.psle-sheet-rows .psle-row-main');
  await page.waitForSelector('.psle-row-preview');
  await shot('2-sheet');
  await page.click('[data-psle-act="pdf"]');
  await page.waitForTimeout(150);
  const printed = await page.evaluate(() => LOG.filter(x => x[0] === 'print').pop());
  assert.equal(printed[1].length, 15); assert.equal(printed[3], 'PSLE PAST PAPER'); assert.deepEqual(printed[4], ['p2']);
  assert.equal(await page.evaluate(() => cpbMeta.org), "TEACHER'S OWN DRAFT", 'the Custom Paper draft gets its meta back');
  for (const p of await ctx.pages()) if (p !== page) await p.close();

  // Exam clock
  await page.fill('[data-psle-input="exam-mins"]', '45');
  await page.dispatchEvent('[data-psle-input="exam-mins"]', 'input');
  await page.click('[data-psle-act="exam"]');
  await page.waitForSelector('#psleTimer:not([hidden])');
  assert.match(await page.textContent('#psleTimerClock'), /^4[45]:\d\d$/);
  const practised = await page.evaluate(() => LOG.filter(x => x[0] === 'practise').pop());
  assert.equal(practised[1].length, 15);
  await page.click('#psleTimerPause');
  assert.equal(await page.textContent('#psleTimerPause'), '▶');
  await page.evaluate(() => navigateTo('psle'));
  await shot('3-timer');
  page.once('dialog', d => d.accept());
  await page.click('[data-psle-timer="stop"]');
  await page.waitForSelector('#psleTimer[hidden]', { state: 'attached' });

  // Topics
  await page.click('[data-psle-act="tab"][data-tab="topics"]');
  await page.waitForSelector('.psle-pick-topic');
  await noScrollX();
  await shot('4-topics');
  await page.click('.psle-pick-topic[data-topic="circles"]');
  await page.waitForSelector('#psleOverlay.show');
  assert.match(await page.textContent('#psleSheetTitle'), /Circles/);
  await page.click('#psleSheetClose');

  // Trends
  await page.click('[data-psle-act="tab"][data-tab="trends"]');
  await page.waitForSelector('.psle-heat');
  await noScrollX();
  await shot('5-trends');

  // Search
  await page.fill('#psleSearch', '2023 p2 q7');
  await page.waitForFunction(() => /1 question found/.test(document.querySelector('#psleMain').textContent));
  await page.fill('#psleSearch', '');
  await page.waitForSelector('.psle-tabs');

  if (role === 'student') {
    await page.click('[data-psle-act="tab"][data-tab="progress"]');
    await page.waitForSelector('.psle-prog-head');
    assert.match(await page.textContent('.psle-prog-head'), /6\s*of \d+ tried/);
    assert.equal(await page.$('[data-tab="manage"]'), null, 'a pupil has no Manage tab');
    await noScrollX();
    await shot('6-progress');
  } else {
    await page.click('[data-psle-act="tab"][data-tab="manage"]');
    await page.waitForSelector('.psle-import');
    assert.match(await page.textContent('.psle-manage'), /PSLE questions found/);
    assert.match(await page.textContent('.psle-manage-table'), /missing Q22/);
    await noScrollX();
    await shot('6-manage');
    // Load a paper
    await page.selectOption('[data-psle-input="import-year"]', '2018');
    await page.selectOption('[data-psle-input="import-paper"]', 'P2');
    await page.setInputFiles('[data-psle-input="import-files"]', { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') });
    const rapid = await page.evaluate(() => LOG.filter(x => x[0] === 'rapid').pop());
    assert.deepEqual(rapid, ['rapid', 'PSLE-2018-P2 — scan.pdf', 'P6', '']);
    // File everything found
    await page.waitForSelector('[data-psle-act="file-all"]');
    await page.click('[data-psle-act="file-all"]');
    await page.waitForFunction(() => LOG.some(x => x[0] === 'saveVetting'));
    const writes = await page.evaluate(() => LOG.filter(x => x[0] === 'setDoc' || x[0] === 'saveVetting'));
    assert.ok(writes.some(w => w[0] === 'setDoc' && w[3] === true && /"psle":\{"year":"2018","paper":"P2","n":8,"marks":4\}/.test(w[2])), 'merge onto the public half');
    assert.ok(writes.some(w => w[0] === 'saveVetting' && /"P1A"/.test(w[2])), 'a vetting draft is saved whole');
    // Edit dialog
    await page.click('[data-psle-act="tab"][data-tab="years"]');
    await page.click('.psle-pick-year[data-year="2025"]');
    await page.click('[data-psle-act="list"]');
    await page.click('.psle-sheet-rows [data-psle-act="edit"]');
    await page.waitForSelector('#psleEditOverlay.show');
    await page.fill('#psleEdN', '2');
    await page.click('#psleEditSave');
    assert.match(await page.textContent('#psleEditErr'), /already filed/);
    await shot('7-edit');
    await page.fill('#psleEdN', '1');
    await page.selectOption('#psleEdDiff', 'hard');
    await page.click('#psleEditSave');
    await page.waitForSelector('#psleEditOverlay:not(.show)', { state: 'attached' });
  }
  await ctx.close();
}

await run('student', { width: 1280, height: 900 }, 'computer-student');
await run('admin', { width: 1280, height: 900 }, 'computer-admin');
await run('student', { width: 390, height: 844 }, 'phone-student');
await run('admin', { width: 390, height: 844 }, 'phone-admin');
await browser.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('psle browser checks passed' + (outDir ? ' — screenshots in ' + outDir : ''));
