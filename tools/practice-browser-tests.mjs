// Isolated browser regression: real Practice markup, styles and handlers,
// synthetic questions, and a deterministic marker. No live account or writes.
// npm install playwright; npx playwright install chromium
// Optional: PLAYWRIGHT_MODULE=<module path>, PLAYWRIGHT_BROWSER_CHANNEL=msedge
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(/^[A-Za-z]:[\\/]/.test(moduleName) ? pathToFileURL(moduleName).href : moduleName);
const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
  const start = html.indexOf(from), end = html.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `Production section exists: ${from}`);
  return html.slice(start, end);
};
const css = [...html.slice(0, html.indexOf('</head>')).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const markup = cut('<!-- ================= PRACTICE PAGE', '<!-- ================= CREATE PAGE');
const variety = fs.readFileSync(new URL('../practice-variety.js', import.meta.url), 'utf8').replace(/^export /gm, '');
const helpers = cut('// ---- Automatic practice: space repeated stories', 'function prioritizeReviewQuestions(');
const filters = cut('function questionHasVideo(q)', '// ---- Student MCQ');
const mcq = cut('function questionIsMcq(q)', '// The answer to "draw and label this"');
const annotation = cut('function applyAnnotationMode(q)', 'function renderQuestion()');
const renderer = cut('function renderQuestion()', '$("prevBtn").addEventListener');
const directQuestion = cut('function goPracticeQuestion(q)', 'function answerKeyPrintHtml(');
const submit = cut('// ---- One submission per unchanged answer', '$("mcqWorkingToggle").addEventListener');
const inputs = cut('$("typedWorking").addEventListener("input"', 'let cameraStream = null;');
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
page.setDefaultTimeout(10000);
await page.route('**/*', route => route.abort());
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const makeQuestion = (id, title, n = 1, mcq = false) => ({ id, title, topics: ['Percentage'], blocks: [{ type: 'text', content: `<p>${title}: What is ${n} + 1?</p>` }], ...(mcq ? { options: ['2', '3', '4', '5'] } : {}) });
async function setup({ questions, manual = false, progress = {} } = {}) {
  await page.goto('about:blank');
  await page.setContent(`<html><head><style>${css}</style></head><body><main>${markup}</main></body></html>`);
  await page.addScriptTag({ content: variety + '\n' + `
    const $ = id => document.getElementById(id);
    let currentUser = { uid: 'browser-student', role: 'student' };
    let questionBank = ${JSON.stringify(questions)}, qIndex = 0, studentProgress = ${JSON.stringify(progress)};
    let videoOnlyFilter = false, aiPracticeActive = false, lastEloChange = null, mcqSelected = null;
    let _practiceRun = createPracticeRun(currentUser.uid), _practiceManual = ${manual}, _practiceExhausted = false;
    let _practiceCatalogBank = null, _practiceCatalogLength = -1, _practiceCatalogValue = null;
    let _practiceViewEpoch = 0, _practiceMarkBusy = null, _practiceMcqRevising = false;
    const _practiceMarkedSignatures = new Map();
    let _practicePhotoSignature = { url: null, hash: '' };
    let strokes = [], redoStack = [], current = null, textBoxes = [], solutionPhotoDataUrl = '', canvasCssW = 800, canvasCssH = 680;
    const markerCalls = [], visibleResults = [], confirmations = [], notices = [];
    let markGate = null, captureGate = null;
    const questionSource = () => 'bank', questionIsAnnotation = () => false, mcqNumber = i => String(i + 1);
    const escapeHtml = s => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
    const studentTopicsLabel = q => q.topics?.join(', ') || '';
    const renderQuestionBlocksHtml = blocks => blocks.map(b => b.content || '').join('');
    const renderLearningProfile = () => {}, updateDifficultyChip = () => {}, renderAiPracticeBar = () => {}, setTool = () => {};
    const setupCanvasSize = () => {}, rpgQuestionChanged = () => {}, rpgOnMarked = () => {};
    const clearSolutionPhoto = () => { solutionPhotoDataUrl = ''; };
    const clearTextBoxes = () => { textBoxes = []; }, redraw = () => _practiceRefreshSubmit();
    const hideResult = () => $('result').classList.remove('show'), hideHint = () => {}, resetAskAi = () => {};
    const showResult = v => { visibleResults.push([questionBank[qIndex].id, v]); $('result').classList.add('show'); };
    const stopAiPractice = () => { aiPracticeActive = false; }, dueTime = p => Number(p?.nextReviewAt || 0);
    const navigateTo = () => { _practiceViewEpoch++; };
    const prioritizeReviewQuestions = () => { const next = _practicePlan(questionBank, { limit: 1 }).questions[0]; _practiceExhausted = !next; if (next) qIndex = questionBank.indexOf(next); };
    const toast = (...args) => notices.push(args), confirm = message => { confirmations.push(message); return true; };
    const exportWorkingPng = async () => captureGate ? await captureGate.promise : 'data:image/png;base64,synthetic';
    const solutionPhotoInlineMedia = () => null;
    const markAttemptCall = async payload => { markerCalls.push(payload); if (markGate) await markGate.promise; return { data: { verdict: { verdict: 'correct' }, correctOption: payload.selectedOption, progress: { nextReviewAt: Date.now() + 86400000 } } }; };
    const recordLearningAttempt = async (q, v, progress) => { studentProgress[q.id] = { ...progress, lastAttemptAt: Date.now() }; return ''; };
    const markUnreachable = () => false, serverErrorMessage = e => e.message;
    const clientMarkVerdict = () => { throw Error('Unexpected fallback'); };
    const maybeServePrerequisiteOnMiss = () => false, maybeServeEasierOnMiss = () => false, maybeServeVariantOnMiss = () => false;
  ` + '\n' + helpers + '\n' + filters + '\n' + mcq + '\n' + annotation + '\n' + renderer + '\n' + directQuestion + '\n' + submit + '\n' + inputs + `
    $('prevBtn').addEventListener('click', () => changeQuestion(-1));
    $('nextBtn').addEventListener('click', () => changeQuestion(1));
    window.practiceFixture = {
      state: () => ({ id: questionBank[qIndex]?.id, calls: markerCalls.length, confirmations, visibleResults, exhausted: _practiceExhausted, manual: _practiceManual, notices }),
      chooseQuestion(id) { goPracticeQuestion(questionBank.find(q => q.id === id)); },
      gate(kind) { let release; const promise = new Promise(resolve => { release = resolve; }); const gate = { promise, release }; if (kind === 'mark') markGate = gate; else captureGate = gate; },
      release(kind) { if (kind === 'mark') { markGate.release(); markGate = null; } else { captureGate.release('data:image/png;base64,synthetic'); captureGate = null; } }
    };
    renderQuestion();
  ` });
}
async function state() { return page.evaluate(() => window.practiceFixture.state()); }
async function screenshot(name) {
  const directory = process.env.PRACTICE_SCREENSHOT_DIR;
  if (!directory) return;
  fs.mkdirSync(directory, { recursive: true });
  await page.screenshot({ path: path.join(directory, name + '.png'), fullPage: true });
}
async function markWritten() {
  await page.locator('#finalAnswer').fill('42');
  await page.locator('#submitBtn').click();
  await page.waitForFunction(() => !document.getElementById('submitLabel').textContent.includes('progress'));
}

try {
  const peggy = makeQuestion('p1', "Peggy's Savings", 1), variant = makeQuestion('p2', "Peggy's Savings", 2), colin = makeQuestion('c1', "Colin's Collection", 3);
  await setup({ questions: [peggy, variant, colin] });
  assert.equal(await page.locator('#reviseMcqBtn').isVisible(), false);
  await markWritten();
  assert.match(await page.locator('#submitLabel').innerText(), /Next question/);
  await page.locator('#submitBtn').click();
  assert.equal((await state()).id, 'c1', 'Next skips the related Peggy variant');
  assert.equal((await state()).calls, 1, 'Next does not mark unchanged work again');
  assert.equal((await state()).confirmations.length, 0, 'A marked answer advances without a discard prompt');
  await markWritten();
  assert.match(await page.locator('#submitLabel').innerText(), /Finish practice round/);
  await page.locator('#submitBtn').click();
  assert.equal((await state()).exhausted, true);
  assert.equal(await page.locator('#submitBtn').isDisabled(), true);
  assert.match(await page.locator('#qBody').innerText(), /end of this practice round/);
  await screenshot('practice-round-complete');
  await page.locator('#practiceFindMoreBtn').click();
  assert.equal((await state()).exhausted, true, 'Find available cannot instantly restart a completed pool');
  await page.locator('#prevBtn').click();
  assert.equal((await state()).exhausted, false);
  assert.equal(await page.locator('#padCanvas').isVisible(), true, 'Back restores the writing surface');
  assert.notEqual(await page.locator('#padCanvas').evaluate(el => getComputedStyle(el).pointerEvents), 'none');
  await page.locator('#nextBtn').click();
  assert.equal((await state()).exhausted, true);
  await page.evaluate(() => window.practiceFixture.chooseQuestion('p1'));
  assert.equal((await state()).id, 'p1');
  assert.equal((await state()).manual, true);
  assert.equal(await page.locator('#padCanvas').isVisible(), true, 'Explicitly chosen work restores writing after completion');
  console.log('PASS browser: automatic family spacing, one marking, completion and no immediate restart');

  await setup({ questions: [peggy, variant, colin], manual: true, progress: { c1: { nextReviewAt: Date.now() - 60000 } } });
  await page.locator('#nextBtn').click();
  assert.equal((await state()).id, 'p2', 'Explicit worksheet order stays intact even if a later question is overdue');
  console.log('PASS browser: explicit worksheet order');

  await setup({ questions: [makeQuestion('m1', "Peggy's Savings", 1, true), colin] });
  assert.equal(await page.locator('#reviseMcqBtn').isVisible(), false);
  await page.locator('.mcq-option').nth(0).click();
  await page.locator('#submitBtn').click();
  await page.waitForFunction(() => document.getElementById('submitLabel').textContent.includes('Next question'));
  assert.equal(await page.locator('#reviseMcqBtn').isVisible(), true);
  assert.equal(await page.locator('.mcq-option').nth(0).isDisabled(), true);
  await page.locator('#reviseMcqBtn').click();
  assert.equal(await page.locator('#submitBtn').isDisabled(), true, 'Same option cannot be re-marked');
  assert.equal(await page.locator('#reviseMcqBtn').isVisible(), false);
  await page.locator('.mcq-option').nth(1).click();
  assert.match(await page.locator('#submitLabel').innerText(), /Check revised answer/);
  await screenshot('practice-mcq-revised');
  await page.locator('#submitBtn').click();
  await page.waitForFunction(() => document.getElementById('submitLabel').textContent.includes('Next question'));
  assert.equal((await state()).calls, 2);
  console.log('PASS browser: MCQ reveal, revise, changed answer and unchanged guard');

  await setup({ questions: [peggy, colin] });
  await page.locator('#finalAnswer').fill('42');
  await page.evaluate(() => window.practiceFixture.gate('capture'));
  await page.locator('#submitBtn').click();
  assert.equal(await page.locator('#submitBtn').isDisabled(), true);
  await page.locator('#submitBtn').dispatchEvent('click');
  await page.evaluate(() => window.practiceFixture.release('capture'));
  await page.waitForFunction(() => document.getElementById('submitLabel').textContent.includes('Next question'));
  assert.equal((await state()).calls, 1, 'Overlapping taps cause one request');
  await page.locator('#finalAnswer').fill('43');
  assert.match(await page.locator('#submitLabel').innerText(), /Check revised answer/);
  console.log('PASS browser: early capture lock and real input revision');

  await setup({ questions: [peggy, colin] });
  await page.locator('#finalAnswer').fill('42');
  await page.evaluate(() => window.practiceFixture.gate('mark'));
  await page.locator('#submitBtn').click();
  await page.waitForFunction(() => window.practiceFixture.state().calls === 1);
  await page.locator('#nextBtn').click();
  await page.evaluate(() => window.practiceFixture.release('mark'));
  await page.waitForFunction(() => !document.getElementById('submitBtn').disabled);
  assert.equal((await state()).id, 'c1');
  assert.equal((await state()).visibleResults.length, 0, 'Old verdict never appears on next question');
  console.log('PASS browser: navigation during marking');
  assert.deepEqual(errors, [], 'No browser errors');
} finally {
  await browser.close();
}
