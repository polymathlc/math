// Exercise the production submit handler with deterministic marking and DOM
// boundaries; no Firebase account, AI call, or stored student data is needed.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { buildPracticeCatalog, createPracticeRun, recordPracticeServed, planPracticeQuestions } from '../practice-variety.js';
import * as mastery from '../practice-mastery.js';
import * as quality from '../practice-quality.js';

const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const cut = (from, to) => {
  const start = html.indexOf(from), end = html.indexOf(to, start + from.length);
  assert.ok(start >= 0 && end > start, `Production section exists: ${from}`);
  return html.slice(start, end);
};
const submission = cut('// ---- One submission per unchanged answer', '$("mcqWorkingToggle").addEventListener');
const mcqRenderer = cut('function renderMcqArea(q)', '// The answer to "draw and label this"');
const mcqResult = cut('function showMcqResult(selectedIdx, correctIdx)', 'function renderQuestion()');
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

function fixture({ mcq = false } = {}) {
  const events = [], calls = [], records = [], results = [], rewards = [], options = [];
  const classes = () => { const values = new Set(); return { add: (...v) => v.forEach(x => values.add(x)), remove: (...v) => v.forEach(x => values.delete(x)), contains: v => values.has(v), toggle: (v, on) => { on ? values.add(v) : values.delete(v); } }; };
  const elements = new Map();
  function element(id) {
    if (!elements.has(id)) elements.set(id, { id, value: '', textContent: '', disabled: false, hidden: false,
      style: {}, classList: classes(), listeners: {}, dataset: {}, focus() { events.push(['focus', id]); },
      addEventListener(type, fn) { this.listeners[type] = fn; },
      querySelectorAll() { return id === 'mcqOptions' ? options : []; }, querySelector() { return options[0]; }
    });
    return elements.get(id);
  }
  for (let i = 0; i < 4; i++) { const option = element('option' + i); option.dataset.i = String(i); options.push(option); }
  element('page-practice').classList.add('active');
  element('typedWorking').value = mcq ? '' : '40 + 2';
  element('finalAnswer').value = mcq ? '' : '42';
  const q = { id: 'peggy', title: "Peggy's Savings", level: 'P4', blocks: [{ type: 'text', content: 'A question' }], ...(mcq ? { options: ['42', '24', '4', '2'] } : {}) };
  const second = { id: 'colin', title: 'Another question', level: 'P4', blocks: [{ type: 'text', content: 'A second question' }] };
  const context = vm.createContext({
    ...mastery, ...quality, buildPracticeCatalog,
    console: { warn() {}, error() {} }, $: element, currentUser: { uid: 'student1', role: 'student' },
    questionBank: [q, second], qIndex: 0, strokes: [], current: null, textBoxes: [], canvasCssW: 800, canvasCssH: 600,
    solutionPhotoDataUrl: '', mcqSelected: mcq ? 0 : null, aiPracticeActive: false, lastEloChange: null,
    _practiceViewEpoch: 0, _practiceMarkBusy: null, _practiceMcqRevising: false, _practiceHistoryPending: false,
    _practiceExhausted: false, _practiceAutomatic: () => false,
    _practiceManual: false, studentLevel: 'P4', studentProgress: {}, studentLearningProfile: {},
    _studentFeedRevision: 0, _studentFeedContextCache: null, _studentGameSourceCache: null,
    _studentFailedImages: new Map(), canManageQuestions: () => context.currentUser?.role === 'admin',
    _tcgServedLoad: () => ({}),
    SYL_LO_BY_ID: {}, TCG_QUIZ: [], qReleased: () => true,
    _practiceMarkedSignatures: new Map(), _practicePhotoSignature: { url: null, hash: '' },
    questionSource: q => q?.generatedByAi ? 'generated' : 'bank',
    questionIsMcq: q => !!q?.options?.length, questionIsAnnotation: q => !!q?.annotation,
    solutionPhotoInlineMedia: () => context.solutionPhotoDataUrl ? { mimeType: 'image/png', data: context.solutionPhotoDataUrl.split(',')[1] } : null,
    exportWorkingPng: async () => { events.push(['export']); return 'data:image/png;base64,captured'; },
    markAttemptCall: async payload => { calls.push(payload); return { data: { verdict: { verdict: 'correct', marks: 2, outOf: 2 } } }; },
    clientMarkVerdict: async (question, payload) => { events.push(['fallback', question, payload]); return { verdict: 'correct', marks: 2, outOf: 2 }; },
    recordLearningAttempt: async (question, verdict) => { records.push([question.id, verdict]); return ''; },
    rpgOnMarked: (...args) => rewards.push(args), showResult: (...args) => results.push(args), hideResult: () => events.push(['hide']),
    maybeServePrerequisiteOnMiss: () => false, maybeServeEasierOnMiss: () => false, maybeServeVariantOnMiss: () => {},
    toast: (...args) => events.push(['toast', ...args]), markUnreachable: e => e.code === 'unavailable', serverErrorMessage: e => e.message,
    nextVisibleIndex: (from, delta) => from + delta < context.questionBank.length && from + delta >= 0 ? from + delta : -1,
    changeQuestion: delta => { events.push(['next', delta]); const next = context.qIndex + delta; if (next < context.questionBank.length) { context.qIndex = next; context._practiceViewEpoch++; } },
    mcqNumber: i => i + 1, escapeHtml: value => value
  });
  vm.runInContext(cut('function _studentSyllabus()', '// ---- Automatic practice:') + '\n'
    + mcqRenderer + '\n' + mcqResult + '\n' + submission, context);
  if (mcq) { context.renderMcqArea(q); context.mcqSelected = 0; }
  return { c: context, el: element, events, calls, records, results, rewards, options,
    submit: () => element('submitBtn').listeners.click(), refresh: () => context._practiceRefreshSubmit(),
    resetView(index = 0) { context.qIndex = index; context._practiceViewEpoch++; context._practiceMcqRevising = false; }
  };
}

const cases = [];
const test = (name, fn) => cases.push([name, fn]);
for (const [name, invalidate] of [
  ['unknown student level', f => { f.c.studentLevel = ''; }],
  ['question above the student level', f => { f.c.questionBank[0].level = 'P6'; }],
  ['unclassified question', f => { f.c.questionBank[0].level = ''; }],
  ['structurally broken question', f => { f.c.questionBank[0].options = ['2', '2']; }],
  ['teacher-quarantined question', f => { f.c.questionBank[0].practiceQuarantined = true; }]
]) test(`stale submit cannot mark ${name}`, async () => {
  const f = fixture(); invalidate(f); await f.submit();
  assert.equal(f.calls.length, 0); assert.equal(f.records.length, 0);
  assert.equal(f.events.filter(event => event[0] === 'export').length, 0, 'Rejected before capture or marking');
});
test('unchanged completed work advances once instead of creating another attempt', async () => {
  const f = fixture(); await f.submit();
  assert.equal(f.el('submitLabel').textContent, 'Next question ›');
  await f.submit();
  assert.equal(f.calls.length, 1); assert.equal(f.records.length, 1);
  assert.deepEqual(f.events.filter(e => e[0] === 'next'), [['next', 1]]);
});
test('lock is acquired before async capture and rapid double taps submit once', async () => {
  const f = fixture(), gate = deferred(); f.c.exportWorkingPng = () => gate.promise;
  const first = f.submit(); assert.equal(f.el('submitBtn').disabled, true);
  await f.submit(); assert.equal(f.calls.length, 0);
  gate.resolve('data:image/png;base64,first'); await first;
  assert.equal(f.calls.length, 1); assert.equal(f.records.length, 1);
});
test('a failed screenshot permits a real retry', async () => {
  const f = fixture(); f.c.exportWorkingPng = async () => { throw Error('capture failed'); };
  await f.submit(); assert.equal(f.el('submitBtn').disabled, false); assert.equal(f.calls.length, 0);
  f.c.exportWorkingPng = async () => 'data:image/png;base64,retry'; await f.submit(); assert.equal(f.calls.length, 1);
});
test('failed marking releases the lock without creating a learning attempt', async () => {
  const f = fixture(), original = f.c.markAttemptCall;
  f.c.markAttemptCall = async () => { throw Error('mark failed'); }; await f.submit();
  assert.equal(f.el('submitBtn').disabled, false); assert.equal(f.records.length, 0);
  f.c.markAttemptCall = original; await f.submit(); assert.equal(f.records.length, 1);
});
test('on-device fallback also locks the exact completed answer', async () => {
  const f = fixture(); f.c.markAttemptCall = async () => { throw Object.assign(Error('offline'), { code: 'unavailable' }); };
  await f.submit(); await f.submit();
  assert.equal(f.events.filter(e => e[0] === 'fallback').length, 1); assert.equal(f.records.length, 1);
});
test('failed on-device marking can be retried', async () => {
  const f = fixture(); f.c.markAttemptCall = async () => { throw Object.assign(Error('offline'), { code: 'unavailable' }); };
  const fallback = f.c.clientMarkVerdict; f.c.clientMarkVerdict = async () => { throw Error('AI offline'); };
  await f.submit(); assert.equal(f.records.length, 0); assert.equal(f.el('submitBtn').disabled, false);
  f.c.clientMarkVerdict = fallback; await f.submit(); assert.equal(f.records.length, 1);
});
test('post-mark learning failure never falls back or grades the same answer again', async () => {
  const f = fixture(); f.c.recordLearningAttempt = async () => { throw Object.assign(Error('save offline'), { code: 'unavailable' }); };
  await f.submit(); await f.submit();
  assert.equal(f.calls.length, 1); assert.equal(f.events.filter(e => e[0] === 'fallback').length, 0);
});
test('empty or invalid marking response does not lock an unmarked answer', async () => {
  const f = fixture(), original = f.c.markAttemptCall; f.c.markAttemptCall = async () => ({ data: { verdict: {} } });
  await f.submit(); assert.equal(f.records.length, 0); assert.equal(f.c._practiceMarkedSignatures.size, 0);
  f.c.markAttemptCall = original; await f.submit(); assert.equal(f.records.length, 1);
});
for (const [name, edit] of [
  ['typed working', f => { f.el('typedWorking').value += ' = 42'; }],
  ['final answer', f => { f.el('finalAnswer').value = '43'; }],
  ['pen working', f => { f.c.strokes.push({ points: [{ x: 80, y: 60 }] }); }],
  ['text box', f => { f.c.textBoxes.push({ editor: { innerHTML: '42' }, el: { style: { left: '40px', top: '60px' } } }); }],
  ['photo answer', f => { f.c.solutionPhotoDataUrl = 'data:image/png;base64,newphoto'; }]
]) test(`revising ${name} permits a new attempt`, async () => {
  const f = fixture(); await f.submit(); edit(f); f.refresh();
  assert.equal(f.el('submitLabel').textContent, '✓ Check revised answer'); assert.equal(f.el('submitBtn').disabled, false);
  await f.submit(); assert.equal(f.calls.length, 2);
});
test('rotation or resize of existing pen work is not a revised answer', async () => {
  const f = fixture(); f.c.strokes = [{ points: [{ x: 80, y: 60 }, { x: 160, y: 120 }] }]; await f.submit();
  f.c.canvasCssW = 400; f.c.canvasCssH = 300; f.c.strokes[0].points.forEach(p => { p.x /= 2; p.y /= 2; });
  f.refresh(); assert.equal(f.el('submitLabel').textContent, 'Next question ›');
  await f.submit(); assert.equal(f.calls.length, 1);
});
test('removing a temporary photo restores the already-marked original fingerprint', async () => {
  const f = fixture(); await f.submit(); f.c.solutionPhotoDataUrl = 'data:image/png;base64,temp'; f.refresh();
  f.c.solutionPhotoDataUrl = ''; f.refresh(); await f.submit(); assert.equal(f.calls.length, 1);
});
test('Back or rerender cannot regrade the same answer', async () => {
  const f = fixture(); await f.submit(); f.resetView(1); f.resetView(0); await f.submit(); assert.equal(f.calls.length, 1);
});
test('answer-key/video fields revealed by marking do not count as revised work', async () => {
  const f = fixture(); f.c.markAttemptCall = async payload => { f.calls.push(payload); return { data: {
    verdict: { verdict: 'correct' }, answerKeyImageUrl: 'https://example.com/key', videoExplanationUrl: 'https://example.com/video', annotationAnswers: [{ answerKey: '42' }]
  } }; }; await f.submit(); await f.submit(); assert.equal(f.calls.length, 1);
});
test('completed fingerprints are isolated by account', async () => {
  const f = fixture(); await f.submit(); f.c.currentUser = { uid: 'student2', role: 'student' }; f.c._practiceViewEpoch++;
  await f.submit(); assert.equal(f.calls.length, 2);
});
for (const [name, change] of [
  ['question navigation', f => f.resetView(1)],
  ['same-question rerender', f => f.resetView(0)],
  ['logout', f => { f.c.currentUser = null; }],
  ['another account', f => { f.c.currentUser = { uid: 'student2', role: 'student' }; }],
  ['leaving Practice', f => { f.el('page-practice').classList.remove('active'); }]
]) test(`${name} during capture does not send stale work`, async () => {
  const f = fixture(), gate = deferred(); f.c.exportWorkingPng = () => gate.promise;
  const pending = f.submit(); change(f); gate.resolve('data:image/png;base64,old'); await pending;
  assert.equal(f.calls.length, 0); assert.equal(f.results.length, 0); assert.equal(f.records.length, 0);
});
test('editing while capturing cancels submission instead of mixing old and new fields', async () => {
  const f = fixture(), gate = deferred(); f.c.exportWorkingPng = () => gate.promise;
  const pending = f.submit(); f.el('finalAnswer').value = '100'; gate.resolve('data:image/png;base64,old'); await pending;
  assert.equal(f.calls.length, 0); assert.equal(f.el('submitBtn').disabled, false);
});
test('navigation during server marking never paints the result on another question', async () => {
  const f = fixture(), gate = deferred(), entered = deferred(); f.c.markAttemptCall = payload => { f.calls.push(payload); entered.resolve(); return gate.promise; };
  const pending = f.submit(); await entered.promise; f.resetView(1);
  gate.resolve({ data: { verdict: { verdict: 'correct' } } }); await pending;
  assert.equal(f.results.length, 0); assert.equal(f.records.length, 0); assert.equal(f.rewards.length, 0);
  f.resetView(0); await f.submit(); assert.equal(f.calls.length, 1);
});
test('logout during marking cannot update another account or invoke fallback', async () => {
  const f = fixture(), gate = deferred(), entered = deferred(); f.c.markAttemptCall = () => { entered.resolve(); return gate.promise; };
  const pending = f.submit(); await entered.promise; f.c.currentUser = null;
  gate.reject(Object.assign(Error('offline'), { code: 'unavailable' })); await pending;
  assert.equal(f.records.length, 0); assert.equal(f.events.filter(e => e[0] === 'fallback').length, 0);
});
test('edits while marking preserve captured payload and do not show an old verdict', async () => {
  const f = fixture(), gate = deferred(), entered = deferred(); f.c.solutionPhotoDataUrl = 'data:image/png;base64,oldphoto';
  f.c.markAttemptCall = payload => { f.calls.push(payload); entered.resolve(); return gate.promise; };
  const pending = f.submit(); await entered.promise;
  f.el('finalAnswer').value = '99'; f.el('typedWorking').value = 'new work'; f.c.solutionPhotoDataUrl = 'data:image/png;base64,newphoto';
  gate.resolve({ data: { verdict: { verdict: 'correct' } } }); await pending;
  assert.equal(f.calls[0].finalAnswer, '42'); assert.equal(f.calls[0].typedWorking, '40 + 2'); assert.equal(f.calls[0].solutionPhoto.data, 'oldphoto');
  assert.equal(f.records.length, 1); assert.equal(f.results.length, 0); assert.equal(f.el('submitLabel').textContent, '✓ Check revised answer');
});
test('navigation during learning-save cannot show a stale verdict or reward UI', async () => {
  const f = fixture(), gate = deferred(), entered = deferred(); f.c.recordLearningAttempt = () => { entered.resolve(); return gate.promise; };
  const pending = f.submit(); await entered.promise; f.resetView(1);
  gate.resolve(''); await pending; assert.equal(f.results.length, 0); assert.equal(f.rewards.length, 0);
});
test('MCQ revision requires a different option and never regrades unchanged selection', async () => {
  const f = fixture({ mcq: true }); await f.submit(); assert.equal(f.el('reviseMcqBtn').hidden, false);
  f.el('reviseMcqBtn').listeners.click(); assert.equal(f.options[0].disabled, false);
  assert.equal(f.el('submitBtn').disabled, true); await f.submit(); assert.equal(f.calls.length, 1);
  f.options[1].listeners.click(); assert.equal(f.el('submitLabel').textContent, '✓ Check revised answer');
  await f.submit(); assert.equal(f.calls.length, 2); assert.equal(f.calls[1].selectedOption, 1);
  assert.equal(f.events.filter(e => e[0] === 'export').length, 0);
});
test('last question shows completed state until edited instead of re-marking', async () => {
  const f = fixture(); f.c.questionBank = [f.c.questionBank[0]]; await f.submit();
  assert.equal(f.el('submitBtn').disabled, true); assert.equal(f.el('submitLabel').textContent, 'Marked — edit to check again');
  f.el('finalAnswer').value = '43'; f.refresh(); assert.equal(f.el('submitBtn').disabled, false);
});

function useRealNavigation(f) {
  const q = f.c.questionBank[0];
  q.topic = 'Percentage';
  f.c.questionBank = [q, { ...q, id: 'peggy-variant', blocks: [{ type: 'text', content: 'A different numerical variant' }] },
    { id: 'colin', title: "Colin's Collection", level: 'P4', topic: 'Percentage', blocks: [{ type: 'text', content: 'Another story' }] }];
  let run = recordPracticeServed(createPracticeRun('student1'), q, Date.now(), 'student1');
  f.c._practiceAutomatic = () => true;
  f.c._practicePlan = (candidates, extra = {}) => planPracticeQuestions(candidates, {
    bank: f.c.questionBank, catalog: buildPracticeCatalog(f.c.questionBank), run, progress: {}, uid: 'student1', now: Date.now(), ...extra
  });
  f.c.passesVideoFilter = () => true;
  f.c.confirm = message => { f.events.push(['confirm', message]); return false; };
  f.c.renderQuestion = () => {
    f.c._practiceViewEpoch++;
    if (!f.c._practiceExhausted) run = recordPracticeServed(run, f.c.questionBank[f.c.qIndex], Date.now(), 'student1');
    f.el('typedWorking').value = ''; f.el('finalAnswer').value = ''; f.c.strokes = []; f.c.textBoxes = []; f.c.solutionPhotoDataUrl = '';
    f.refresh();
  };
  vm.runInContext(cut('function nextVisibleIndex(from, delta)', 'function renderVideoOnlyBtn()') + '\n'
    + cut('function changeQuestion(delta)', '$("prevBtn").addEventListener'), f.c);
}
test('real Next skips related variants after marking without a clear-working confirmation', async () => {
  const f = fixture(); useRealNavigation(f); await f.submit(); await f.submit();
  assert.equal(f.c.questionBank[f.c.qIndex].id, 'colin');
  assert.equal(f.calls.length, 1); assert.equal(f.records.length, 1);
  assert.equal(f.events.filter(e => e[0] === 'confirm').length, 0);
});
test('real Next still protects unmarked work with the existing confirmation', async () => {
  const f = fixture(); useRealNavigation(f); f.c.changeQuestion(1);
  assert.equal(f.c.qIndex, 0); assert.equal(f.events.filter(e => e[0] === 'confirm').length, 1);
});
test('real Next protects edits made after a previous marked answer', async () => {
  const f = fixture(); useRealNavigation(f); await f.submit(); f.el('typedWorking').value = 'Revised method';
  f.c.changeQuestion(1); assert.equal(f.c.qIndex, 0); assert.equal(f.events.filter(e => e[0] === 'confirm').length, 1);
});
test('real completion after final marked answer stays disabled through refresh', async () => {
  const f = fixture(); useRealNavigation(f); await f.submit(); await f.submit();
  f.el('finalAnswer').value = '15'; await f.submit();
  assert.equal(f.el('submitBtn').disabled, false); assert.equal(f.el('submitLabel').textContent, 'Finish practice round');
  await f.submit();
  assert.equal(f.c._practiceExhausted, true); assert.equal(f.el('submitBtn').disabled, true);
  assert.equal(f.el('submitLabel').textContent, 'Practice round complete');
  f.refresh(); assert.equal(f.el('submitBtn').disabled, true);
  assert.equal(f.events.filter(e => e[0] === 'confirm').length, 0); assert.equal(f.calls.length, 2);
});
test('exhausted automatic practice refuses even a direct stale submit invocation', async () => {
  const f = fixture(); f.c._practiceAutomatic = () => true; f.c._practiceExhausted = true; f.refresh();
  await f.submit(); assert.equal(f.calls.length, 0); assert.equal(f.el('submitBtn').disabled, true);
  assert.equal(f.el('submitLabel').textContent, 'Practice round complete');
});
test('opening fresh practice after an empty round re-enables submit with no marked history', async () => {
  const f = fixture(); f.c._practiceAutomatic = () => true; f.c._practiceExhausted = true; f.refresh();
  assert.equal(f.el('submitBtn').disabled, true);
  f.c._practiceExhausted = false; f.refresh(); assert.equal(f.el('submitBtn').disabled, false);
  await f.submit(); assert.equal(f.calls.length, 1);
});

test('real worksheet export freezes ink and text before asynchronous image loading', async () => {
  const source = cut('async function exportWorkingPng() {', '\n// =====================================================================\n// PRACTICE — render question');
  const gate = deferred(), rendered = [], canvases = [];
  const ink = { width: 800, height: 600, ink: 'original ink' };
  const elements = { worksheetSurface: { getBoundingClientRect: () => ({ width: 800, height: 600 }) }, worksheetContent: {}, typedWorking: { value: '' } };
  const context = vm.createContext({ console, $: id => elements[id], canvas: ink, dpr: 1, textBoxes: [{ html: 'original text' }],
    questionBank: [{ id: 'old-question' }, { id: 'new-question' }], qIndex: 0, window: { devicePixelRatio: 1 },
    document: { createElement: () => {
      const created = { width: 0, height: 0, getContext: () => ({
        setTransform() {}, drawImage(image) { if (image === ink) created.ink = image.ink; else rendered.push(image.ink || image); }
      }), toDataURL: () => 'data:image/png;base64,snapshot' };
      canvases.push(created); return created;
    } },
    prepareWorksheetClone: () => gate.promise,
    buildTextLayerSvgHtml: () => context.textBoxes[0].html,
    drawWorksheetGrid() {}, drawPlainQuestionFallback: (...args) => rendered.push(['fallback', args[2].id]),
    loadImage: async image => image, svgDataUrl: svg => svg
  });
  vm.runInContext(source, context);
  const pending = context.exportWorkingPng();
  ink.ink = 'new ink'; context.textBoxes = [{ html: 'new text' }]; context.qIndex = 1;
  gate.resolve('<p>original question</p>');
  await pending;
  assert.ok(rendered.includes('original ink')); assert.ok(!rendered.includes('new ink'));
  assert.ok(rendered.some(item => typeof item === 'string' && item.includes('original text')));
  assert.ok(!rendered.some(item => typeof item === 'string' && item.includes('new text')));
  assert.equal(canvases[0].ink, 'original ink');
});

let failed = 0;
for (const [name, fn] of cases) {
  try { await fn(); console.log('PASS ' + name); }
  catch (error) { failed++; console.error('FAIL ' + name + '\n' + error.stack); }
}
console.log(`${cases.length - failed}/${cases.length} practice submission checks passed`);
if (failed) process.exitCode = 1;
