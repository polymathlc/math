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
const levelMarkup = cut('<div class="sidebar-level student-only"', '<button class="logout-btn"');
// Keep each production module's private constants in its own scope. The
// browser runs the real exported policies, with no Firebase/AI dependency.
function browserModule(name) {
  const source = fs.readFileSync(new URL(`../${name}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const names = [...source.matchAll(/^export (?:function|const) (\w+)/gm)].map(match => match[1]);
  const body = source.replace(/^import .*?;\n/gm, '').replace(/^export /gm, '');
  return `const { ${names.join(', ')} } = (() => {\n${body}\nreturn { ${names.join(', ')} }; })();`;
}
const policies = ['practice-variety.js', 'practice-mastery.js', 'practice-quality.js'].map(browserModule).join('\n');
const helpers = cut('// ---- Student question feeding:', 'function prioritizeReviewQuestions(');
const prioritizer = cut('function prioritizeReviewQuestions(', 'function updateDifficultyChip(');
const levels = cut('function renderStudentLevel()', 'async function loadStudentGeneratedQuestions(')
  + cut('function studentLevelsAllowed()', 'const IMG_AUTO_MAX_PCT');
const gamePool = cut('function _tcgQuizPool()', 'function _tcgShuffle(');
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
const makeQuestion = (id, title, n = 1, mcq = false) => ({ id, title, level: 'P4', topics: ['Percentage'], blocks: [{ type: 'text', content: `${title}: What is ${n} + 1?` }], ...(mcq ? { options: ['2', '3', '4', '5'] } : {}) });
async function setup({ questions, manual = false, progress = {}, level = 'P4', profile = {} } = {}) {
  await page.goto('about:blank');
  await page.setContent(`<html><head><style>${css}</style></head><body><aside id="sidebar">${levelMarkup}</aside><main>${markup}</main></body></html>`);
  await page.addScriptTag({ content: policies + '\n' + `
    const hadesMathBeta = { close() {} };
    let pirateRiftCloses = 0, grandLineCloses = 0;
    const pirateRiftPortal = { close() { pirateRiftCloses++; } };
    const grandLinePortal = { close() { grandLineCloses++; } };
    const $ = id => document.getElementById(id);
    let currentUser = { uid: 'browser-student', role: 'student' };
    let questionBank = ${JSON.stringify(questions)}, qIndex = 0, studentProgress = ${JSON.stringify(progress)};
    let studentLevel = ${JSON.stringify(level)}, studentLearningProfile = ${JSON.stringify(profile)};
    const STUDENT_LEVELS = ['P4', 'P5', 'P6'], SYL_LO_BY_ID = {}, TCG_QUIZ = [];
    let _practiceEmptyReason = 'round', _studentFeedRevision = 0, _studentFeedContextCache = null;
    let _studentGameSourceCache = null, _studentAdminFlagsLoaded = false, _studentPrivateKeysLoaded = false;
    const _studentFailedImages = new Map(), flagNotifications = [];
    let videoOnlyFilter = false, aiPracticeActive = false, lastEloChange = null, mcqSelected = null;
    let _practiceRun = createPracticeRun(currentUser.uid), _practiceManual = ${manual}, _practiceExhausted = false;
    let _practiceCatalogBank = null, _practiceCatalogLength = -1, _practiceCatalogValue = null;
    let _practiceViewEpoch = 0, _practiceMarkBusy = null, _practiceMcqRevising = false;
    const _practiceMarkedSignatures = new Map();
    let _practicePhotoSignature = { url: null, hash: '' };
    let strokes = [], redoStack = [], current = null, textBoxes = [], solutionPhotoDataUrl = '', canvasCssW = 800, canvasCssH = 680;
    const markerCalls = [], visibleResults = [], confirmations = [], notices = [], writes = [];
    const storage = new Map(), servedGames = {};
    const localStorage = { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value) };
    const canManageQuestions = () => currentUser?.role === 'admin', _isAdmin = canManageQuestions;
    const qReleased = q => q.releaseOn !== 'future', tcgQuizLevel = q => q.level || '';
    const _tcgServedLoad = () => servedGames;
    const _tcgBankQuestions = () => questionBank.map(q => ({ id: q.id, feedSource: q }));
    const _tcgBuiltInQuestions = () => [];
    const db = {}, doc = (...args) => args, setDoc = async (...args) => writes.push(args);
    const mathImportSignature = q => q.testImportSignature || '';
    const parseTimeMs = value => typeof value === 'number' ? value : Date.parse(value) || 0;
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
    const toast = (...args) => notices.push(args), confirm = message => { confirmations.push(message); return true; };
    const showToast = toast;
    const exportWorkingPng = async () => captureGate ? await captureGate.promise : 'data:image/png;base64,synthetic';
    const solutionPhotoInlineMedia = () => null;
    const markAttemptCall = async payload => { markerCalls.push(payload); if (markGate) await markGate.promise; return { data: { verdict: { verdict: 'correct' }, correctOption: payload.selectedOption, progress: { nextReviewAt: Date.now() + 86400000 } } }; };
    const recordLearningAttempt = async (q, v, progress) => { studentProgress[q.id] = { ...progress, lastAttemptAt: Date.now() }; return ''; };
    const markUnreachable = () => false, serverErrorMessage = e => e.message;
    const clientMarkVerdict = () => { throw Error('Unexpected fallback'); };
    const maybeServePrerequisiteOnMiss = () => false, maybeServeEasierOnMiss = () => false, maybeServeVariantOnMiss = () => false;
  ` + '\n' + helpers + '\n' + prioritizer + '\n' + levels + '\n' + gamePool + '\n' + filters + '\n' + mcq + '\n' + annotation + '\n' + renderer + '\n' + directQuestion + '\n' + submit + '\n' + inputs + `
    $('prevBtn').addEventListener('click', () => changeQuestion(-1));
    $('nextBtn').addEventListener('click', () => changeQuestion(1));
    window.practiceFixture = {
      state: () => ({ id: questionBank[qIndex]?.id, level: studentLevel, calls: markerCalls.length, confirmations, visibleResults, exhausted: _practiceExhausted, manual: _practiceManual, notices, pirateRiftCloses, grandLineCloses }),
      chooseQuestion(id) { goPracticeQuestion(questionBank.find(q => q.id === id)); },
      changeLevel: saveStudentLevel,
      candidates(manual = false) { return _studentFeedCandidates(questionBank, { manual }).questions.map(q => q.id); },
      staleView(id) { qIndex = questionBank.findIndex(q => q.id === id); _practiceExhausted = false; renderQuestion(); },
      gameRun() { return { pool: questionBank.map(q => ({ id: q.id, feedSource: q })), poolI: 0, feedLevel: studentLevel, feedUid: currentUser.uid }; },
      gameNext(run) { const q = _studentNextGameQuestion(run); if (q) servedGames[q.id] = Date.now(); return q?.id || null; },
      gate(kind) { let release; const promise = new Promise(resolve => { release = resolve; }); const gate = { promise, release }; if (kind === 'mark') markGate = gate; else captureGate = gate; },
      release(kind) { if (kind === 'mark') { markGate.release(); markGate = null; } else { captureGate.release('data:image/png;base64,synthetic'); captureGate = null; } }
    };
    $('studentLevelSelect').addEventListener('change', event => saveStudentLevel(event.target.value));
    renderStudentLevel();
    if (!${manual}) prioritizeReviewQuestions();
    renderQuestion();
  ` });
}
async function state() { return page.evaluate(() => window.practiceFixture.state()); }
async function screenshot(name) {
  const directory = process.env.PRACTICE_QA_DIR || process.env.PRACTICE_SCREENSHOT_DIR;
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
  const p5 = { ...makeQuestion('p5', 'Higher level problem', 5), level: 'P5' };
  const p6 = { ...makeQuestion('p6', 'Sixth year problem', 6), level: 'P6' };
  await setup({ questions: [p6, p5, peggy, colin], level: '' });
  assert.match(await page.locator('#qBody').innerText(), /Choose My level to begin/);
  assert.equal(await page.locator('#submitBtn').isDisabled(), true);
  await page.locator('#practiceFindMoreBtn').click();
  assert.equal(await page.locator('#studentLevelSelect').evaluate(el => document.activeElement === el), true);
  await page.locator('#studentLevelSelect').selectOption('P4');
  assert.equal((await state()).level, 'P4');
  assert.equal((await state()).pirateRiftCloses, 1, 'Changing school level closes any Pirate Rift expedition');
  assert.equal((await state()).grandLineCloses,1,'school level change closes Grand Line');
  assert.equal((await state()).id, 'p1');
  assert.deepEqual(await page.evaluate(() => window.practiceFixture.candidates()), ['p1', 'c1']);
  await page.evaluate(() => window.practiceFixture.chooseQuestion('p6'));
  assert.equal((await state()).id, 'p1', 'A direct question link cannot bypass the school level');
  await screenshot('practice-level-matched');
  console.log('PASS browser: unknown level requires selection and P4 rejects P5/P6 direct questions');

  await setup({ questions: [peggy, p5, p6, colin], manual: true });
  await page.locator('#nextBtn').click();
  assert.equal((await state()).id, 'c1', 'Manual worksheet Next skips questions above the learner');
  await page.locator('#prevBtn').click();
  assert.equal((await state()).id, 'p1', 'Back also applies the school level gate');
  console.log('PASS browser: explicit worksheet and Back preserve the school level cap');

  await setup({ questions: [p6, p5, peggy, colin], level: 'P6' });
  assert.equal((await state()).id, 'p6');
  await page.evaluate(() => { window.cachedGameRun = window.practiceFixture.gameRun(); });
  await page.locator('#studentLevelSelect').selectOption('P4');
  assert.equal((await state()).id, 'p1', 'Changing level replaces an unsuitable Practice question immediately');
  const gameIds = await page.evaluate(() => Array.from({ length: 5 }, () => window.practiceFixture.gameNext(window.cachedGameRun)));
  assert.deepEqual(gameIds.filter(Boolean).sort(), ['c1'], 'Cached games recheck the level and cannot repeat the question just shown in Practice');
  assert.equal(gameIds.at(-1), null);
  console.log('PASS browser: level changes recheck Practice and a cached game pool; exhausted games stop');

  const introduction = makeQuestion('intro', 'First skill warmup', 15);
  const copy = { ...peggy, id: 'p1-copy', title: 'Renamed savings task' };
  await setup({ questions: [introduction, peggy, variant, copy, colin] });
  const distinctGameIds = await page.evaluate(() => {
    const run = window.practiceFixture.gameRun();
    return Array.from({ length: 5 }, () => window.practiceFixture.gameNext(run));
  });
  assert.deepEqual(distinctGameIds.filter(Boolean), ['p1', 'c1'], 'Games space numerical variants and renamed exact copies, including Practice history');
  await setup({ questions: [introduction, peggy, variant, copy, colin], progress: {
    p1: { lastAttemptAt: new Date().toISOString(), nextReviewAt: new Date(Date.now() + 86400000).toISOString(), lastVerdict: 'correct' }
  } });
  const dueGameIds = await page.evaluate(() => {
    const run = window.practiceFixture.gameRun();
    return Array.from({ length: 5 }, () => window.practiceFixture.gameNext(run));
  });
  assert.deepEqual(dueGameIds.filter(Boolean), ['c1'], 'Games honour saved review dates and recent related-question cooldowns');
  console.log('PASS browser: automatic games share Practice family, exact-copy and saved-review scheduling');

  const suspect = { ...makeQuestion('suspect', 'Diagram awaiting review', 7), diagramWhole: true };
  const broken = { ...makeQuestion('broken', 'Broken options', 8), options: ['2', '2', '3', '4'] };
  const hard = { ...makeQuestion('hard', 'An advanced challenge', 9), difficulty: 2200 };
  await setup({ questions: [p6, suspect, broken, hard, peggy] });
  assert.equal((await state()).id, 'p1');
  assert.deepEqual(await page.evaluate(() => window.practiceFixture.candidates()), ['p1'], 'Only a sound question within the skill target is automatically fed');
  await setup({ questions: [p6, suspect, broken, hard] });
  assert.equal((await state()).exhausted, true);
  assert.match(await page.locator('#qBody').innerText(), /No suitable questions are ready/);
  await page.locator('#practiceFindMoreBtn').click();
  assert.equal((await state()).exhausted, true, 'An empty eligible pool cannot fall back to unsafe or overly difficult work');
  assert.equal((await state()).calls, 0, 'Feeding and quality decisions make no marking or AI requests');
  await screenshot('practice-no-suitable-questions');
  console.log('PASS browser: sound, skill-matched questions win and an unsafe-only pool stays empty');

  await setup({ questions: [peggy, p6] });
  await page.evaluate(() => window.practiceFixture.staleView('p6'));
  assert.equal((await state()).exhausted, true, 'Recovering an invalid view must not repeat a question already served');
  await setup({ questions: [peggy, p6], progress: { p1: { lastAttemptAt: new Date().toISOString(), nextReviewAt: new Date(Date.now() + 86400000).toISOString() } } });
  await page.evaluate(() => window.practiceFixture.staleView('p6'));
  assert.equal((await state()).exhausted, true, 'Recovery also preserves saved future review dates');
  console.log('PASS browser: automatic recovery retains served history and saved review dates');

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
