// Run the real browser import functions with fake AI, uploads and DOM controls.
// The fixtures deliberately put wording between two figures on different pages.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';
import { questionBlocks, diagramSourcesForQuestion, hasOrderedQuestionLayout } from '../rapid-import/functions/core.js';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
function fn(name, async = false) {
  const at = src.indexOf(`${async ? 'async ' : ''}function ${name}(`);
  assert.ok(at >= 0, `${name} exists`);
  return src.slice(at, src.indexOf('\n}', at) + 2);
}
const code = [
  fn('aiQuestionBlocks'), fn('aiQuestionLayoutWarning'), fn('questionFromAiData'), fn('populateEditorFromAi'), fn('mathImportSources'),
  fn('finishAiBuild', true), fn('aiQuestionReadPrompt'), fn('rapidPayloads'),
  fn('cpbReadMarks'), fn('cpbReadPartMarks'), fn('cpbFillDiagram', true),
  fn('cpbExtend', true), fn('cpbReadRun', true), fn('processRapidJob', true)
].join('\n');
const boxA = [150, 100, 350, 450], boxB = [500, 200, 850, 700];
const row = () => ({
  title: 'Two figures', level: 'P5', topics: ['Geometry'], concept: 'Comparison',
  questionText: 'Study the first figure. Compare with the second figure. Find the difference.',
  hasDiagram: true, diagramBox: [100, 100, 950, 950], page: 1,
  blocks: [
    { type: 'text', content: 'Study the first figure.' },
    { type: 'image', diagramBox: boxA, page: 1 },
    { type: 'text', content: 'Compare with the second figure.' },
    { type: 'image', diagramBox: boxB, page: 2 },
    { type: 'text', content: 'Find the difference.' }
  ], expected: '12 cm', markingGuide: 'Subtract the lengths.', options: ['12 cm', '14 cm'], correctOption: 0,
  marks: 2, partMarks: [1, 1], number: '8'
});
const order = blocks => blocks.map(b => b.type === 'text' ? b.content : 'IMAGE');
const expectedOrder = ['Study the first figure.', 'IMAGE', 'Compare with the second figure.', 'IMAGE', 'Find the difference.'];

function harness(rows = [row()]) {
  const state = { rows, calls: [], saved: [], controls: {}, renders: 0, notes: [], toasts: [], id: 0 };
  const api = new Function('mathQuestionBlocks', 'diagramSourcesForQuestion', 'hasOrderedQuestionLayout', 'state', `
    let editorBlocks = [], currentEditingId = 'old', pendingVariantOf = 'old';
    let editorLos = ['old'], editorVideoOverlays = [], _rapidAddedCount = 0;
    const currentUser = { name: 'Teacher' }, imgChoices = new Map();
    const _rapidJustAdded = new Set(), vettingList = [], CPB_BATCH = 6;
    const genBlockId = () => 'b' + (++state.id);
    const parseTopics = x => Array.isArray(x) ? x : String(x || '').split(',').filter(Boolean);
    const studentTopicLabel = x => x;
    const escapeHtml = x => String(x).replace(/&/g, '&amp;').replace(/</g, '&lt;');
    const $ = id => state.controls[id] || (state.controls[id] = { style: {} });
    const genPreamble = () => '';
    const sylAutoFileOn = () => false;
    const sylAutoFileEditor = async () => [];
    const sylAutoFileLos = async () => [];
    const sylEditorRender = () => {};
    const voSyncButton = () => {};
    const setAnswerKeyImage = () => {};
    const setEditorOptions = (...options) => { state.options = options; };
    const renderEditorBlocks = () => { state.renders++; };
    const aiFinishBar = m => state.notes.push(m);
    const toast = (message, kind) => state.toasts.push({ message, kind });
    const cpbNote = m => state.notes.push(m);
    const cpbRunPrompt = () => '';
    const imageFileToInlineMedia = async () => ({ mimeType: 'image/png', data: 'RAPID' });
    const askGeminiVision = async () => JSON.stringify({ questions: state.rows });
    const parseAIJson = JSON.parse;
    const _cleanToBlackAndWhite = async full => full;
    const uploadDataUrlToStorage = async full => 'stored:' + full;
    const rapidApplyLevel = (q, level) => { if (level) q.level = level; };
    const rapidApplyRelease = (q, release) => { if (release) q.releaseOn = release; };
    const _vetTagDuplicate = () => {};
    const saveVettingDoc = async q => { state.saved.push(q); };
    const setRapidJobState = () => {};
    const renderVettingList = () => {};
    const removeRapidJob = () => {};
    const updateRapidCounts = () => {};
    const setRapidStatus = m => state.notes.push(m);
    const failRapidJob = (id, error) => { throw error; };
    const autoDiagramNote = result => result.cropped ? 'cropped' : 'whole page';
    const console = { warn() {} };
    const autoDiagramIntoBlock = async (block, box, media, onStatus, options = {}) => {
      const call = { block, box, media, options };
      state.calls.push(call);
      if (state.onCrop) await state.onCrop(call);
      if (onStatus) onStatus('Finishing the old crop');
      if (state.failAt === state.calls.length) throw new Error('crop failed');
      const whole = !box;
      const backup = whole && options.sharePage ? await options.sharePage() : null;
      block.url = backup?.url || 'crop:' + media.data + ':' + (box?.[0] ?? 'whole');
      return { url: block.url, cropped: !whole, whole, cleaned: options.clean === true };
    };
    ${code}
    return {
      aiQuestionBlocks, questionFromAiData, populateEditorFromAi, finishAiBuild,
      aiQuestionReadPrompt, mathImportSources, cpbFillDiagram, cpbExtend, cpbReadRun, processRapidJob,
      editor: () => editorBlocks, switchEditor: () => { editorBlocks = []; }
    };
  `)(questionBlocks, diagramSourcesForQuestion, hasOrderedQuestionLayout, state);
  return { api, state };
}

test('question and editor retain every figure between its surrounding wording', () => {
  const { api, state } = harness();
  const q = api.questionFromAiData(row());
  assert.deepEqual(order(q.blocks), expectedOrder);
  assert.equal(new Set(q.blocks.map(b => b.id)).size, 5);
  assert.equal(q.expected, '12 cm');
  assert.equal(q.markingGuide, 'Subtract the lengths.');
  assert.deepEqual(q.options, ['12 cm', '14 cm']);
  assert.equal(q.correctOption, 0);
  api.populateEditorFromAi(row());
  assert.deepEqual(order(api.editor()), expectedOrder);
  assert.equal(state.controls.qExpectedInput.value, '12 cm');
});

test('legacy replies still create an image slot and malformed layouts keep all wording and images', () => {
  const { api } = harness();
  assert.deepEqual(order(api.questionFromAiData({ questionText: 'Original text', hasDiagram: true }).blocks), ['Original text', 'IMAGE']);
  const broken = row();
  broken.blocks[2].content = 'Only part of the wording';
  const q = api.questionFromAiData(broken);
  assert.deepEqual(order(q.blocks), [broken.questionText, 'IMAGE', 'IMAGE']);
  assert.deepEqual(diagramSourcesForQuestion(broken).map(s => s.diagramBox), [boxA, boxB]);
  assert.match(q.importWarning, /Picture placement could not be read safely/);
  assert.match(api.mathImportSources(q), /Picture placement could not be read safely/, 'warning remains visible without PDF source links');
  assert.equal(api.mathImportSources({}), '');
});

test('Build with AI visibly asks for placement review when it falls back from a malformed layout', async () => {
  const { api, state } = harness();
  const broken = row();
  broken.blocks[2].content = 'Missing words';
  api.populateEditorFromAi(broken);
  await api.finishAiBuild(broken, { mimeType: 'image/png', data: 'SCREENSHOT' }, true);
  assert.equal(state.toasts.at(-1).kind, 'error');
  assert.match(state.toasts.at(-1).message, /Check the picture positions against the source/);
});

test('Build with AI fills every image slot using its own rectangle', async () => {
  const { api, state } = harness();
  api.populateEditorFromAi(row());
  await api.finishAiBuild(row(), { mimeType: 'image/png', data: 'SCREENSHOT' }, true);
  assert.deepEqual(state.calls.map(c => c.box), [boxA, boxB]);
  assert.equal(api.editor().filter(b => b.type === 'image' && b.url).length, 2);
  assert.deepEqual(order(api.editor()), expectedOrder);
});

test('switching questions while a crop is pending stops the remaining crops', async () => {
  const { api, state } = harness();
  api.populateEditorFromAi(row());
  state.onCrop = () => api.switchEditor();
  await api.finishAiBuild(row(), { mimeType: 'image/png', data: 'OLD' }, true);
  assert.equal(state.calls.length, 1);
  assert.deepEqual(api.editor(), []);
  assert.equal(state.renders, 1, 'only the initial editor render ran');
  assert.deepEqual(state.notes, [], 'late crop status must not repaint the new editor');
});

test('a failed Build with AI image does not skip later figures', async () => {
  const { api, state } = harness();
  api.populateEditorFromAi(row());
  state.failAt = 1;
  await api.finishAiBuild(row(), { mimeType: 'image/png', data: 'SCREENSHOT' }, true);
  assert.equal(state.calls.length, 2);
  assert.equal(api.editor()[1].url, '');
  assert.match(api.editor()[3].url, /^crop:/);
});

test('Custom Paper reads each image from its own page and shares that page for fallback', async () => {
  const input = row();
  input.blocks[3].diagramBox = null;
  const { api, state } = harness([input]);
  const made = [];
  await api.cpbReadRun([
    { mimeType: 'image/png', data: 'PAGE1' }, { mimeType: 'image/png', data: 'PAGE2' }
  ], { enhance: 1, onBatch() {}, onDone: q => made.push(q) });
  assert.deepEqual(state.calls.map(c => c.media.data), ['PAGE1', 'PAGE2']);
  assert.deepEqual(state.calls.map(c => c.box), [boxA, null]);
  assert.deepEqual(state.calls.map(c => c.options.clean), [true, false]);
  assert.match(made[0].blocks[3].url, /PAGE2$/);
  assert.equal(made[0].diagramWhole, true);
  assert.deepEqual(order(made[0].blocks), expectedOrder);
  assert.deepEqual(made[0].partMarks, [1, 1]);
});

test('an explicit invalid figure page never crops those coordinates from another screenshot', async () => {
  for (const badPage of [0, 1.5, 99, 'unknown']) {
    const input = row();
    input.blocks[3].page = badPage;
    const { api, state } = harness([input]);
    const made = [];
    await api.cpbReadRun([
      { mimeType: 'image/png', data: 'PAGE1' }, { mimeType: 'image/png', data: 'PAGE2' }
    ], { onBatch() {}, onDone: q => made.push(q) });
    assert.equal(state.calls[1].box, null, `page ${badPage} must not produce a successful crop`);
    assert.equal(made[0].diagramWhole, true);
    assert.match(made[0].importWarning, /source page could not be identified/);
  }
});

test('legacy figure without its own page uses the question page', async () => {
  const input = { questionText: 'Read the graph.', hasDiagram: true, diagramBox: boxA, page: 2 };
  const { api, state } = harness([input]);
  await api.cpbReadRun([
    { mimeType: 'image/png', data: 'PAGE1' }, { mimeType: 'image/png', data: 'PAGE2' }
  ], { onBatch() {} });
  assert.equal(state.calls[0].media.data, 'PAGE2');
  assert.deepEqual(state.calls[0].box, boxA);
});

test('continuation text stays after the previous figure and all new figures survive', async () => {
  const { api, state } = harness();
  const first = { blocks: [{ id: 't', type: 'text', content: 'Previous page' }, { id: 'i', type: 'image', url: 'old' }] };
  state.failAt = 1;
  await api.cpbExtend(first, row(), { mimeType: 'image/png', data: 'NEXT' }, null, { left: 0 });
  assert.deepEqual(order(first.blocks), ['Previous page', 'IMAGE', ...expectedOrder]);
  assert.equal(state.calls.length, 2, 'a failed first crop must not skip the second');
  assert.equal(first.blocks[3].url, '', 'failed images remain visibly missing for review');
  assert.match(first.blocks[5].url, /^crop:/);
  assert.equal(first.expected, '12 cm');
});

test('Rapid Add saves all ordered figures and preserves PDF source and release data', async () => {
  const { api, state } = harness();
  const result = await api.processRapidJob('job', {}, 'P6', {
    deferSave: true, pageNo: 7, sourcePdf: 'paper.pdf', source: 'page 7', release: '2026-09-20'
  });
  const q = result.questions[0];
  assert.deepEqual(order(q.blocks), expectedOrder);
  assert.deepEqual(state.calls.map(c => c.box), [boxA, boxB]);
  assert.equal(q.blocks.filter(b => b.type === 'image' && b.url).length, 2);
  assert.equal(q.sourceQuestionNumber, '8');
  assert.equal(q.sourcePdf, 'paper.pdf');
  assert.equal(q.sourcePages[0].page, 7);
  assert.equal(q.level, 'P6');
  assert.equal(q.releaseOn, '2026-09-20');
  assert.equal(state.saved.length, 0, 'PDF assembly owns the deferred save');
});

test('reader asks for source order, all labels, separate figure boxes and per-image pages', () => {
  const { api } = harness();
  const prompt = api.aiQuestionReadPrompt(false, true, true, { images: 2 });
  assert.match(prompt, /printed reading order/);
  assert.match(prompt, /EVERY image block its own/);
  assert.match(prompt, /Include ALL/);
  assert.match(prompt, /DIFFERENT pages/);
  assert.match(prompt, /NEVER one rectangle per option/);
});
