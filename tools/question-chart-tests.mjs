// Regression tests for 🧩 QUESTION CHARTS — every question's own dependency
// chart of easier steps and visual apps. Run with:
//     node tools/question-chart-tests.mjs            all cases
//     node tools/question-chart-tests.mjs <name>     one case
//
// It loads the REAL qc* helpers out of index.html, and the REAL
// chartAppShape / chartAppHtml out of functions/index.js, and reads the
// wiring as text.
//
// Every failure here is silent:
//
//  • AN ANSWER IN A PUPIL-READABLE DOCUMENT. A chart lives in
//    `mathQuestionGraph`, which every signed-in pupil can read. A chart that
//    stored a question's wording or answer would undo the bank's split.
//  • A LOOP, OR A LINK THE WRONG WAY. A chart with a cycle has no top, and
//    every later phase walks it from the top.
//  • A GENERATED PAGE RUNNING AS THIS ORIGIN. The four portals share one
//    origin and one localStorage, which holds the ChatGPT key; an app frame
//    with allow-same-origin can read it.
//  • AN APP PROMPT THAT CARRIES THE ANSWER KEY to a page the pupil sees.
//  • A NEXT QUESTION TANGLED INTO THE STEPS (v1.94.0). ⏭ questions are tried
//    AFTER the question; an arrow to or from one would make a harder question
//    an "easier step", and the climb-back phase would walk into it.
//  • A CHART STEP THAT OUTLIVES ITS TRIP TO THE EDITOR. `qcSpawn` left set
//    puts the NEXT question saved anywhere onto this chart.
//  • A "FOUNDATIONAL" QUESTION THAT IS JUST THE QUESTION WITH SMALLER NUMBERS
//    (v1.95.0). The break-down prompt must ask for ONE PART per question,
//    chained, at the original's size — and nothing is saved before the
//    teacher has read the parts.
//  • A FOUNDATIONAL STEP IN ORDINARY PRACTICE (v1.96.0). A step made on a
//    chart is `foundationOf` the question above it; a pupil's load holds it
//    aside and it is served ONLY straight after a miss on that question.
import fs from 'fs';

const PAGE = new URL('../index.html', import.meta.url).pathname;
const FN = new URL('../functions/index.js', import.meta.url).pathname;
const RULES = new URL('../firestore.rules', import.meta.url).pathname;
const src = fs.readFileSync(PAGE, 'utf8');
const fnSrc = fs.readFileSync(FN, 'utf8');
const rules = fs.readFileSync(RULES, 'utf8');

const cutFrom = (text, from, to, what) => {
  const a = text.indexOf(from);
  if (a < 0) throw new Error(what + ': "' + from + '" not found');
  const b = text.indexOf(to, a + from.length);
  if (b < 0) throw new Error(what + ': end marker not found');
  return text.slice(a, b);
};

const M = new Function(`
  const graphPlainText = blocks => (blocks || []).map(b => (b && b.content) || "").join(" ").replace(/<[^>]+>/g, "").trim();
  ${cutFrom(src, '// 🧩 QUESTION CHARTS', '// ---- Firestore ----', 'qc helpers')}
  return { QC_MAX_NODES, QC_CHECKS_MAX, QC_ROWH, QC_COLW, QC_TIERS, qcTierOf, qcKeyQ, qcKeyApp, qcParseKey, qcChartDocId, qcAppDocId,
           qcNormalizeChart, qcWouldCycle, qcChartPayload, qcSeedFromBoard, qcLayout, qcDepths,
           qcNormalizeApp, qcAppRequestShape, qcAppMetaLabel, qcAppHtmlFrom, qcDefaultBrief, qcAppPrompt,
           QC_APP_MODELS, QC_APP_SIZES,
           QC_BREAK_MIN, QC_BREAK_MAX, qcBreakdownPrompt, qcBreakdownParts, qcBreakdownQuestion,
           qcStepTarget, qcStepsUnder, qcMoveStepOrder };
`)();
// The frame attributes and the edge writer sit further down; cut them alone.
const W = new Function('M', `
  const { qcKeyQ, qcParseKey, qcWouldCycle, qcTierOf, QC_MAX_NODES, QC_ROWH, QC_COLW, qcStepTarget } = M;
  const QC_COMMENT_MAX = 200;
  ${cutFrom(src, 'function qcAddEdge(', '\nfunction qcLinkComplete(', 'qcAddEdge')}
  ${cutFrom(src, 'function qcAppFrameAttrs(', '\nfunction qcOpenAppViewer(', 'qcAppFrameAttrs')}
  return { qcAddEdge, qcAttachNew, qcRelink, qcAppFrameAttrs };
`)(M);
const S = new Function(`
  ${cutFrom(fnSrc, 'const CHART_APP_MODELS', '\nconst CHART_APP_SLOT', 'server consts')}
  ${cutFrom(fnSrc, 'function chartAppShape(', '\nexport const generateChartApp', 'server helpers')}
  return { chartAppShape, chartAppHtml, CHART_APP_MAX_TOKENS };
`)();

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error((what || 'value') + ': got ' + g + ', wanted ' + w);
};

// ---- keys ---------------------------------------------------------------------
test('keys round-trip and junk is refused', () => {
  eq(M.qcParseKey(M.qcKeyQ('mq_1')), { type: 'q', id: 'mq_1' }, 'question key');
  eq(M.qcParseKey(M.qcKeyApp('ca_x')), { type: 'app', id: 'ca_x' }, 'app key');
  eq(M.qcParseKey('mq_1'), null, 'bare id');
  eq(M.qcParseKey('video:x'), null, 'unknown type');
  eq(M.qcChartDocId('mq_1'), 'chart__mq_1', 'chart doc id');
  eq(M.qcAppDocId('ca_x'), 'app__ca_x', 'app doc id');
});

// ---- the ONE place a stored chart is believed ------------------------------------
test('a junk chart becomes a chart holding just its root', () => {
  const c = M.qcNormalizeChart(null, 'root');
  eq(Object.keys(c.nodes), ['q:root'], 'nodes');
  eq(c.edges, [], 'edges');
});
test('unknown fields are dropped: no wording, no answer reaches the document', () => {
  const c = M.qcNormalizeChart({ root: 'r', expected: '42', nodes: { 'q:r': { x: 1, y: 2, title: 'T', expected: '42', markingGuide: 'g' },
    'q:s': { x: 3.6, y: 'no', checks: '  finds   3/5  ', blocks: [{ content: 'x' }] } }, edges: [] }, 'r');
  const payload = M.qcChartPayload(c);
  const json = JSON.stringify(payload);
  ok(!/expected|markingGuide|blocks|title/.test(json), 'no question fields in ' + json);
  eq(payload.nodes['q:s'], { x: 4, y: 0, checks: 'finds 3/5' }, 'node shape');
  eq(Object.keys(payload).sort(), ['edges', 'kind', 'nodes', 'root', 'updatedAt', 'version'], 'payload keys');
});
test('edges: never from the root, never into an app, never repeated, never a loop', () => {
  const nodes = { 'q:r': {}, 'q:a': {}, 'q:b': {}, 'app:x': {} };
  const c = M.qcNormalizeChart({ nodes, edges: [
    { from: 'q:a', to: 'q:r' },
    { from: 'q:a', to: 'q:r' },            // repeat
    { from: 'q:r', to: 'q:b' },            // from the root
    { from: 'q:b', to: 'app:x' },          // into an app
    { from: 'app:x', to: 'q:a' },          // an app showing a step — fine
    { from: 'q:b', to: 'q:a' },            // fine
    { from: 'q:a', to: 'q:b' },            // closes a loop
    { from: 'q:zz', to: 'q:r' },           // a node that is not there
  ] }, 'r');
  eq(c.edges.map(e => e.from + '>' + e.to), ['q:a>q:r', 'app:x>q:a', 'q:b>q:a'], 'kept edges');
});
test('a chart is capped, but never loses its root', () => {
  const nodes = {};
  for (let i = 0; i < 100; i++) nodes['q:n' + i] = {};
  const c = M.qcNormalizeChart({ nodes }, 'root');
  ok(c.nodes['q:root'], 'root kept');
  ok(Object.keys(c.nodes).length <= M.QC_MAX_NODES + 1, 'capped at ' + Object.keys(c.nodes).length);
});
test('the checks line is one line and capped', () => {
  const c = M.qcNormalizeChart({ nodes: { 'q:s': { checks: 'a\n\nb ' + 'x'.repeat(900) } } }, 'r');
  ok(!/\n/.test(c.nodes['q:s'].checks), 'no newline');
  ok(c.nodes['q:s'].checks.length <= M.QC_CHECKS_MAX, 'capped');
});

// ---- the edge writer the page uses ----------------------------------------------------
test('qcAddEdge refuses each wrong link with a reason, and accepts a right one', () => {
  const chart = M.qcNormalizeChart({ nodes: { 'q:r': {}, 'q:a': {}, 'q:b': {}, 'app:x': {} } }, 'r');
  eq(W.qcAddEdge(chart, 'q:a', 'q:r', ''), '', 'step into root');
  ok(W.qcAddEdge(chart, 'q:r', 'q:a', ''), 'root as a from');
  ok(W.qcAddEdge(chart, 'q:a', 'app:x', ''), 'into an app');
  ok(W.qcAddEdge(chart, 'q:a', 'q:r', ''), 'repeat');
  eq(W.qcAddEdge(chart, 'q:b', 'q:a', ''), '', 'b towards a');
  ok(/loop/.test(W.qcAddEdge(chart, 'q:a', 'q:b', '')), 'a loop');
  eq(W.qcAddEdge(chart, 'app:x', 'q:b', ''), '', 'app shows b');
  eq(chart.edges.length, 3, 'three edges');
});

// ---- ⏭ next questions (v1.94.0) --------------------------------------------------------
test('a next question keeps its tier; junk tiers, apps and the root never get one', () => {
  const c = M.qcNormalizeChart({ nodes: {
    'q:r': { tier: 'harder' }, 'q:s': { tier: 'same' }, 'q:h': { tier: 'HARDER' },
    'q:j': { tier: 'impossible' }, 'app:x': { tier: 'same' } } }, 'r');
  eq(c.nodes['q:s'].tier, 'same', 'same');
  eq(c.nodes['q:h'].tier, 'harder', 'case folded');
  ok(!('tier' in c.nodes['q:r']), 'the root is never a next question');
  ok(!('tier' in c.nodes['q:j']), 'junk tier dropped');
  ok(!('tier' in c.nodes['app:x']), 'an app is never a next question');
  eq(M.qcChartPayload(c).nodes['q:s'], { x: 0, y: 0, checks: '', tier: 'same' }, 'stored shape');
  eq(M.qcChartPayload(c).nodes['q:j'], { x: 0, y: 0, checks: '' }, 'a plain step has no tier field at all');
});
test('a next question is never part of the step arrows, stored or drawn', () => {
  const c = M.qcNormalizeChart({ nodes: { 'q:r': {}, 'q:a': {}, 'q:n': { tier: 'harder' }, 'app:x': {} },
    edges: [{ from: 'q:n', to: 'q:r' }, { from: 'q:a', to: 'q:n' }, { from: 'app:x', to: 'q:n' }, { from: 'q:a', to: 'q:r' }] }, 'r');
  eq(c.edges.map(e => e.from + '>' + e.to), ['q:a>q:r'], 'only the real step survives');
  ok(/after the question/.test(W.qcAddEdge(c, 'q:n', 'q:r', '')), 'refused from a next question');
  ok(W.qcAddEdge(c, 'q:a', 'q:n', ''), 'refused into a next question');
  ok(W.qcAddEdge(c, 'app:x', 'q:n', ''), 'an app cannot point at one either');
  eq(c.edges.length, 1, 'nothing added');
});
test('qcAttachNew: a step goes under its target, a next question above the root', () => {
  const c = M.qcNormalizeChart({ nodes: { 'q:r': { x: 0, y: 0 }, 'q:a': { x: 0, y: 230 }, 'app:x': {}, 'q:n0': { tier: 'same' } },
    edges: [{ from: 'q:a', to: 'q:r' }] }, 'r');
  eq(W.qcAttachNew(c, 'b', { target: 'q:a' }), '', 'step under a');
  ok(c.edges.some(e => e.from === 'q:b' && e.to === 'q:a'), 'b → a');
  eq(c.nodes['q:b'].y, 230 + M.QC_ROWH, 'a row below its target');
  eq(W.qcAttachNew(c, 'c', { target: 'app:x' }), '', 'an app target falls back to the root');
  ok(c.edges.some(e => e.from === 'q:c' && e.to === 'q:r'), 'c → root');
  eq(W.qcAttachNew(c, 'd', { target: 'q:n0' }), '', 'a next-question target falls back to the root');
  ok(c.edges.some(e => e.from === 'q:d' && e.to === 'q:r'), 'd → root');
  eq(W.qcAttachNew(c, 'h', { tier: 'harder', target: 'q:a' }), '', 'next question');
  eq(c.nodes['q:h'].tier, 'harder', 'tier kept');
  eq(c.nodes['q:h'].y, -M.QC_ROWH, 'above the root');
  ok(!c.edges.some(e => e.from === 'q:h' || e.to === 'q:h'), 'no arrows');
  ok(W.qcAttachNew(c, 'r', {}), 'the root itself is refused');
  ok(W.qcAttachNew(c, 'a', {}), 'already on the chart');
  eq(M.qcNormalizeChart(c, 'r').edges.length, c.edges.length, 'everything survives normalising');
});
test('qcAttachNew refuses a full chart and leaves it untouched', () => {
  const nodes = { 'q:r': {} };
  for (let i = 1; i < M.QC_MAX_NODES; i++) nodes['q:n' + i] = {};
  const c = M.qcNormalizeChart({ nodes }, 'r');
  const before = JSON.stringify(c);
  ok(/up to/.test(W.qcAttachNew(c, 'extra', {})), 'refused');
  eq(JSON.stringify(c), before, 'untouched');
});
test('layout puts next questions on a row above the question, same level first', () => {
  const c = M.qcNormalizeChart({ nodes: { 'q:r': {}, 'q:a': {}, 'q:h': { tier: 'harder' }, 'q:s': { tier: 'same' } },
    edges: [{ from: 'q:a', to: 'q:r' }] }, 'r');
  M.qcLayout(c);
  eq(c.nodes['q:r'].y, 0, 'root');
  eq(c.nodes['q:h'].y, -M.QC_ROWH, 'harder above');
  eq(c.nodes['q:s'].y, -M.QC_ROWH, 'same above');
  ok(c.nodes['q:s'].x < c.nodes['q:h'].x, 'same level on the left');
  eq(c.nodes['q:a'].y, M.QC_ROWH, 'steps still below');
});

// ---- the ➕ / ⏭ trip through the editor (v1.94.0), read as text ------------------------------
test('➕ opens a copy in the editor, never the list, and the copy is a NEW question', () => {
  ok(/else if \(act === "addstep"\) qcSpawnEditor\(key, ""\);/.test(src), 'node ➕ opens the editor');
  ok(/on\("qcAddStepBtn", \(\) => qcSpawnEditor\(qcKeyQ\(qcRoot\), ""\)\);/.test(src), 'toolbar ➕ opens the editor');
  ok(/else if \(act === "pickstep"\) qcOpenPicker\(key, ""\);/.test(src), 'the bank list is still a door');
  const fn = cutFrom(src, 'function qcSpawnEditor(', '\nfunction qcSpawnSync(', 'qcSpawnEditor');
  ok(/if \(!_isAdmin\(\)\)/.test(fn), 'teacher only');
  ok(/loadQuestionIntoEditor\(copy\);[\s\S]*currentEditingId = null;/.test(fn), 'the copy can never overwrite its source');
  ok(/setAnswerKeyImage\(""\)/.test(fn) && /qVideoInput"\)\.value = ""/.test(fn) && /editorVideoOverlays = \[\]/.test(fn), 'the original\'s worked picture, video and amendments are dropped');
  ok(/qEditReturn = \{ page: "qchart" \};/.test(fn), 'save and cancel come back to the chart');
  ok(fn.indexOf('loadQuestionIntoEditor(copy)') < fn.indexOf('qcSpawn = {'), 'qcSpawn is set AFTER the editor clears it');
  ok(!/pendingVariantOf/.test(fn), 'no variantOf: a harder next question must never be served as a retry');
});
test('qcSpawn is var and cleared on every route into the editor', () => {
  ok(/\nvar qcSpawn = null;/.test(src), 'var, because resetEditor runs during module evaluation');
  const reset = cutFrom(src, 'function resetEditor() {', '\n}', 'resetEditor');
  ok(/qcSpawn = null; qcSpawnSync\(\);/.test(reset), 'resetEditor clears it');
  const load = cutFrom(src, 'function loadQuestionIntoEditor(q) {', '\n}', 'loadQuestionIntoEditor');
  ok(/qcSpawn = null; qcSpawnSync\(\);/.test(load), 'loadQuestionIntoEditor clears it');
  const sync = cutFrom(src, 'function qcSpawnSync() {', '\n}', 'qcSpawnSync');
  ok(/if \(!sp\) \{ bar\.hidden = true; bar\.innerHTML = ""; return; \}/.test(sync), 'nothing but the DOM is touched when there is no trip');
});
test('a save joins the chart once, and only for a new question by the teacher', () => {
  ok(/graphOnQuestionSaved\(q, isNewQuestion\);\n    const qcSaid = qcOnQuestionSaved\(q, isNewQuestion\);/.test(src), 'the save handler hands it over');
  ok(/if \(qcSaid\) toast\(qcSaid\.text, qcSaid\.tone\);/.test(src), 'and says where it went');
  const fn = cutFrom(src, 'function qcOnQuestionSaved(', '\n}', 'qcOnQuestionSaved');
  ok(/const sp = qcSpawn;\n  qcSpawn = null;/.test(fn), 'consumed before anything can fail');
  ok(/if \(!sp \|\| !q \|\| !isNew \|\| !_isAdmin\(\)\) return null;/.test(fn), 'new + teacher only');
  ok(/qcAttachNew\(chart, q\.id, \{ target: sp\.target, tier: sp\.tier \}\)/.test(fn), 'through the one attach door');
});
test('the bar\'s 🔄 is the editor\'s own regenerator, one at a time', () => {
  ok(/if \(\$\("regenQBtn"\)\.disabled\) return;[\s\S]{0,140}regenerateQuestionVariant\(r\.dataset\.qcRegen\);/.test(src), 'guarded, same door');
  ok(/bar\.querySelectorAll\("\[data-qc-regen\]"\)\.forEach\(b => \{ b\.disabled = !!busy; \}\);/.test(src), 'goes busy with it');
  ok(/<div class="qc-spawn" id="qcSpawnBar" hidden><\/div>/.test(src), 'the bar is in the editor');
});

// ---- 🧩 foundational questions (v1.95.0) ----------------------------------------------------
const SRC = { title: 'Fruit tarts', level: 'P4', topic: 'Whole numbers', text: 'Xiao Ming bought 7 boxes of fruit tarts. Each box contained 24. She placed them equally on 4 trays. (a) How many? (b) How many on each tray?', expected: '(a) 168 (b) 42', markingGuide: '7 × 24 = 168; 168 ÷ 4 = 42' };
test('the break-down prompt asks for ONE PART per question, chained, at the original size', () => {
  const p = M.qcBreakdownPrompt(SRC, '');
  ok(p.includes(SRC.text), 'the question');
  ok(/NOT the same problem with smaller numbers/.test(p), 'not smaller numbers');
  ok(/ONE short question for each step/.test(p), 'one part each');
  ok(/between 2 and 5 questions/.test(p), 'how many');
  ok(/Chain the numbers/.test(p) && /must equal the earlier question's answer exactly/.test(p), 'chained');
  ok(/not because the numbers are small/.test(p), 'original size');
  ok(/SAME new person and objects/.test(p), 'one new story');
  ok(/Never write "from part \(a\)"/.test(p), 'each stands alone');
  ok(/Xiao Hua bought 8 packets of candies[\s\S]*Xiao Hua has 176 candies/.test(p), 'Zhi Kai\'s worked example');
  ok(/"parts":\[\{"title"/.test(p) && /"checks"/.test(p), 'reply shape');
  ok(!/attached figure/.test(p), 'no figure line without a figure');
  ok(!/REJECTED/.test(p), 'no fix note on a first try');
});
test('the prompt numbers MCQ options, names a figure, and carries a fix note', () => {
  const p = M.qcBreakdownPrompt(Object.assign({}, SRC, { options: ['168', '42', '28'], correctOption: 1, hasDiagram: true }), 'only one part came back');
  ok(/Options: 1\) 168; 2\) 42; 3\) 28 \(the correct one is option 2\)/.test(p), 'numbered, never lettered');
  ok(/attached figure[\s\S]*put every value a question needs into its words/.test(p), 'figure line');
  ok(/REJECTED because: only one part came back/.test(p), 'fix note');
});
test('qcBreakdownParts reads parts, trims and caps, and refuses a single part', () => {
  eq(M.qcBreakdownParts(null), [], 'junk');
  eq(M.qcBreakdownParts({ parts: [{ questionText: 'Only one' }] }), [], 'one part is just the question again');
  const two = M.qcBreakdownParts([{ question: '  A?  ', answer: ' 1 ', working: 'w', skill: 'adds\n  two numbers' }, { title: 'B', questionText: 'B?', expected: '2' }, { title: 'empty' }, 'junk']);
  eq(two.length, 2, 'bare array, aliases, the blank one dropped');
  eq(two[0], { title: 'Part 1', questionText: 'A?', expected: '1', markingGuide: 'w', checks: 'adds two numbers' }, 'first');
  eq(two[1].title, 'B', 'own title kept');
  const many = M.qcBreakdownParts({ parts: Array.from({ length: 9 }, (_, i) => ({ questionText: 'Q' + i, checks: 'x'.repeat(500) })) });
  eq(many.length, M.QC_BREAK_MAX, 'capped');
  eq(many[0].checks.length, M.QC_CHECKS_MAX, 'checks capped to one line');
});
test('a part becomes an ordinary bank question: root level and topics, no variant, no checks', () => {
  const q = M.qcBreakdownQuestion({ title: 'Packets', questionText: 'Q?', expected: '176', markingGuide: '8 × 22', checks: 'multiplies' },
    { level: 'P5', topics: ['Ratio', 'Whole numbers'], los: ['P5.RAT.1.1'], variantOf: 'x', concept: 'secret' }, 'mq_1', '2026-10-11T00:00:00.000Z', 'Mr Chung');
  eq(q.id, 'mq_1'); eq(q.level, 'P5'); eq(q.topics, ['Ratio', 'Whole numbers']); eq(q.topic, 'Ratio, Whole numbers');
  eq(q.blocks, [{ id: 'mq_1_b1', type: 'text', content: 'Q?' }], 'one text block');
  eq(q.expected, '176'); eq(q.markingGuide, '8 × 22');
  eq(q.los, [], 'filed on its own words later, not the root\'s objectives');
  ok(!('variantOf' in q), 'never a variant: practice must not serve it as the retry');
  ok(!('checks' in q), 'the checks line belongs on the chart node');
  eq(q.concept, '', 'the root\'s concept is not copied');
  eq(M.qcBreakdownQuestion({ questionText: 'Q' }, { topic: 'A, B' }, 'id', 't', '').topics, ['A', 'B'], 'topics from the string');
});
test('qcAttachNew puts several steps side by side on the row under the target', () => {
  const c = M.qcNormalizeChart({ nodes: { 'q:r': { x: 100, y: 0 } } }, 'r');
  eq(W.qcAttachNew(c, 'a', {}), ''); eq(W.qcAttachNew(c, 'b', {}), ''); eq(W.qcAttachNew(c, 'c', {}), '');
  eq([c.nodes['q:a'].x, c.nodes['q:b'].x, c.nodes['q:c'].x], [100, 100 + M.QC_COLW, 100 + 2 * M.QC_COLW], 'in order, a column apart');
  ok([c.nodes['q:a'], c.nodes['q:b'], c.nodes['q:c']].every(n => n.y === M.QC_ROWH), 'one row down');
});
test('the break-down flow: teacher only, checked, nothing saved before Add, stale replies dropped', () => {
  const open = cutFrom(src, 'function qcOpenBreakdown(', '\nfunction qcBreakClose(', 'qcOpenBreakdown');
  ok(/if \(!_isAdmin\(\)\)/.test(open), 'teacher only');
  ok(!/saveQuestionDoc/.test(cutFrom(src, 'function qcOpenBreakdown(', '\nasync function qcBreakAdd(', 'before Add')), 'nothing is saved before Add');
  const gen = cutFrom(src, 'async function qcBreakGenerate(', '\nfunction qcBreakRender(', 'qcBreakGenerate');
  ok(/qcBreakdownParts\(parseAIJson\(reply\)\)/.test(gen), 'the one reader');
  ok(/verifyGeneratedQuestion\(/.test(gen), 'the ordinary checker');
  ok((gen.match(/if \(!live\(\)\) return;/g) || []).length >= 3, 'a stale reply is dropped at every await');
  const add = cutFrom(src, 'async function qcBreakAdd(', '\n}\n', 'qcBreakAdd');
  ok(/if \(!_isAdmin\(\)\)/.test(add), 'teacher only in the handler');
  ok(/qcBreakdownQuestion\(/.test(add) && /await saveQuestionDoc\(q\);/.test(add), 'the one builder, the one save door');
  ok(/qcAttachNew\(chart, q\.id, \{ target: st\.target \}\)/.test(add), 'the one attach door, as a step');
  ok(/\.checks = String\(p\.checks/.test(add), 'checks on the node');
  ok(!/pendingVariantOf|variantOf/.test(add), 'no variant link');
  ok(/else if \(act === "breakdown"\) qcOpenBreakdown\(key\);/.test(src), 'node 🧩');
  ok(/on\("qcBreakBtn", \(\) => qcOpenBreakdown\(qcKeyQ\(qcRoot\)\)\);/.test(src), 'toolbar 🧩');
  ok(/breakOv\.querySelectorAll\("\[data-close\]"\)\.forEach\(b => b\.addEventListener\("click", \(\) => \{ qcBreakRun\+\+; qcBreak = null; \}\)\);/.test(src), 'closing drops the reply on its way');
  ok(/if \(document\.activeElement && list\.contains\(document\.activeElement\)\) \{ st\.stale = true; return; \}/.test(src), 'never rebuilt under the caret');
});

// ---- 🔒 foundational steps only after a miss (v1.96.0) ----------------------------------------
const F = new Function(`
  ${cutFrom(src, 'function qIsFoundation(', '\n    });\n}', 'qIsFoundation')}
    });
  }
  return { qIsFoundation, foundationStepsFor };
`)();
test('qIsFoundation is strict: only a real id that is not the question\'s own', () => {
  ok(F.qIsFoundation({ id: 'a', foundationOf: 'q1' }), 'flagged');
  ok(!F.qIsFoundation({ id: 'a' }), 'no field');
  ok(!F.qIsFoundation({ id: 'a', foundationOf: '  ' }), 'blank');
  ok(!F.qIsFoundation({ id: 'a', foundationOf: 'a' }), 'its own id');
  ok(!F.qIsFoundation({ id: 'a', foundationOf: true }), 'not a string');
  ok(!F.qIsFoundation({ id: 'a', foundationOf: ['q1'] }), 'not a string');
  ok(!F.qIsFoundation(null), 'null');
});
test('foundationStepsFor gives that question\'s unmastered steps in the order they were made', () => {
  const pool = {
    b: { id: 'b', foundationOf: 'q1', createdAt: '2026-10-11T10:00:02Z' },
    a: { id: 'a', foundationOf: 'q1', createdAt: '2026-10-11T10:00:01Z' },
    c: { id: 'c', foundationOf: 'q1', createdAt: '2026-10-11T10:00:03Z' },
    x: { id: 'x', foundationOf: 'q9', createdAt: '2026-10-11T10:00:00Z' },
    n: { id: 'n', createdAt: '2026-10-11T10:00:00Z' }
  };
  eq(F.foundationStepsFor('q1', pool).map(q => q.id), ['a', 'b', 'c'], 'solving order');
  eq(F.foundationStepsFor('q1', pool, q => q.id === 'b').map(q => q.id), ['a', 'c'], 'mastered ones skipped');
  eq(F.foundationStepsFor('q2', pool), [], 'another question has none');
  eq(F.foundationStepsFor('q1', null), [], 'no pool');
});
test('a pupil\'s load holds foundational steps aside; an author keeps them', () => {
  const load = cutFrom(src, 'async function loadBank(uid) {', '\n    if (canManageQuestions()) {', 'loadBank');
  ok(/foundationQuestions = \{\};/.test(load), 'emptied on every load');
  ok(/if \(!canManageQuestions\(\) && qIsFoundation\(q\)\) \{\n\s*foundationQuestions\[String\(q\.id\)\] = q;\n\s*return;\n\s*\}\n\s*questionBank\.push\(q\);/.test(load), 'held aside, not pushed');
  const keys = src.match(/const QUESTION_KEY_FIELDS = \[[^\]]*\]/);
  ok(keys && !/foundationOf/.test(keys[0]), 'foundationOf stays in the student-readable half');
});
test('a miss serves the steps first, and they reach a pupil nowhere else', () => {
  ok(/if \(!maybeServeFoundationOnMiss\(q, v\) && !maybeServePrerequisiteOnMiss\(q, v\)/.test(src), 'first in the miss chain');
  const fn = cutFrom(src, 'function maybeServeFoundationOnMiss(', '\nfunction maybeServeEasierOnMiss(', 'maybeServeFoundationOnMiss');
  ok(/=== "correct"\) return false;/.test(fn), 'never on a correct answer');
  ok(/_practiceAutomatic\(\)/.test(fn), 'a pupil\'s automatic practice only');
  ok(/foundationStepsFor\(q\.id, foundationQuestions,/.test(fn), 'the held steps of THIS question');
  ok(/questionBank\.splice\(qIndex \+ 1, 0, \.\.\.steps\)/.test(fn), 'straight after it, all of them in order');
  // Every READ of the held steps: the miss handler, and a sheet the teacher
  // built by hand. A third reader is a third way a step reaches a pupil.
  const reads = src.split('\n').filter(l => /foundationQuestions/.test(l) && !/^\s*\/\//.test(l) && !/foundationQuestions(\[String\(q\.id\)\])? = /.test(l));
  eq(reads.map(l => l.trim()), ['|| foundationQuestions[String(id)]', 'const steps = foundationStepsFor(q.id, foundationQuestions, x => questionMastered(studentProgress[x.id]));'], 'the only readers');
});
test('every step made ON a chart is born foundational; a next question and a bank pick are not', () => {
  const collect = cutFrom(src, 'function collectQuestion() {', '\n$("saveQBtn")', 'collectQuestion');
  ok(/existing\.foundationOf \|\| \(!currentEditingId && qcSpawn && !qcSpawn\.tier && qcSpawn\.target \? qcParseKey\(qcSpawn\.target\)\.id : ""\)/.test(collect), '➕ step flagged, ⏭ not, an edit keeps it');
  const q = M.qcBreakdownQuestion({ questionText: 'Q' }, { id: 'q1', level: 'P5' }, 'mq_9', 't', '');
  eq(q.foundationOf, 'q1', '🧩 parts are foundations of the question they came from');
  const add = cutFrom(src, 'async function qcBreakAdd(', '\n}\n', 'qcBreakAdd');
  ok(/const root = graphFindQ\(qcParseKey\(st\.target\)\.id\) \|\| graphFindQ\(st\.root\) \|\| \{\};/.test(add), 'the step 🧩 was pressed on');
  ok(!/foundationOf/.test(cutFrom(src, 'function qcAddStep(', '\n}', 'qcAddStep')), '📚 bank picks are left alone');
});
test('the 🔒 toggle is the teacher\'s, writes one field and rolls back', () => {
  const fn = cutFrom(src, 'async function qcToggleFoundation(', '\nfunction qcRemoveNode(', 'qcToggleFoundation');
  ok(/if \(!_isAdmin\(\)\)/.test(fn), 'teacher only');
  ok(/setDoc\(doc\(db, "users", _bankOwnerOrThrow\(\), "mathQuestions", q\.id\), \{ foundationOf: on \? parent : deleteField\(\) \}, \{ merge: true \}\)/.test(fn), 'one field, merged');
  ok(/catch \(e\) \{\n\s*if \(prev === undefined\) delete q\.foundationOf; else q\.foundationOf = prev;/.test(fn), 'rolled back');
  ok(/else if \(act === "found"\) qcToggleFoundation\(key\);/.test(src), 'wired');
});

// ---- every question from the chart page (v1.97.0) ---------------------------------------------
test('＋ New question rides on qcSpawn, returns to the chart, and becomes a chart of its own', () => {
  const fn = cutFrom(src, 'function qcNewQuestion(', '\nfunction qcEditQuestion(', 'qcNewQuestion');
  ok(/if \(!_isAdmin\(\)\)/.test(fn), 'teacher only');
  ok(fn.indexOf('resetEditor()') < fn.indexOf('qEditReturn = { page: "qchart" }') && fn.indexOf('navigateTo("create")') < fn.indexOf('qcSpawn = {'), 'set AFTER the editor is cleared');
  ok(/qcSpawn = \{ newRoot: true,/.test(fn), 'a new-root trip');
  const saved = cutFrom(src, 'function qcOnQuestionSaved(', '\n}', 'qcOnQuestionSaved');
  ok(/if \(sp\.newRoot\) \{\n[\s\S]*qcRoot = String\(q\.id\);/.test(saved), 'opens its own chart');
  ok(/qcSpawn && !qcSpawn\.tier && qcSpawn\.target \?/.test(src), 'a new main question is never flagged foundational');
});
test('✏️ edits in the real editor and comes back; the chart page is a front door', () => {
  const fn = cutFrom(src, 'function qcEditQuestion(', '\n}', 'qcEditQuestion');
  ok(/loadQuestionIntoEditor\(q\);[\s\S]*qEditReturn = \{ page: "qchart" \};/.test(fn), 'return set after the editor clears it');
  ok(/else if \(act === "editq"\) qcEditQuestion\(key\);/.test(src), 'wired');
  const page = cutFrom(src, 'function renderQuestionChartPage() {', '\n}', 'renderQuestionChartPage');
  ok(!/!qcRoot\) \{ navigateTo\("bank"\)/.test(page), 'no bounce to the bank without a question');
  ok(/data-page="qchart"/.test(src.match(/<div class="nav-item admin-only" data-page="qchart"[^>]*>/)[0]), 'a teacher-only nav item');
  ok(/if \(qcPickerOpenMode\) \{ closeOverlay\("qcPickerOverlay"\); openQuestionChart\(q\.id\); \}/.test(src), '📂 opens, never adds');
});

// ---- ◀ ▶ order and drag-to-relink (v1.98.0) -----------------------------------------------------
const ORD = () => M.qcNormalizeChart({ nodes: {
  'q:r': { x: 0, y: 0 }, 'q:a': { x: 0, y: 230 }, 'q:b': { x: 290, y: 230 }, 'q:c': { x: 580, y: 230 },
  'q:d': { x: 0, y: 460 }, 'app:x': { x: 870, y: 230 }, 'q:n': { x: 0, y: -230, tier: 'harder' } },
  edges: [{ from: 'q:b', to: 'q:r' }, { from: 'q:a', to: 'q:r' }, { from: 'q:c', to: 'q:r' }, { from: 'q:d', to: 'q:a' }, { from: 'app:x', to: 'q:r' }] }, 'r');
test('steps are done left to right; apps and next questions are not steps', () => {
  const c = ORD();
  eq(M.qcStepsUnder(c, 'q:r'), ['q:a', 'q:b', 'q:c'], 'by x, not by when they were linked');
  eq(M.qcStepsUnder(c, 'q:a'), ['q:d'], 'a step\'s own steps');
  eq(M.qcStepTarget(c, 'q:d'), 'q:a'); eq(M.qcStepTarget(c, 'q:r'), '', 'the root leads nowhere'); eq(M.qcStepTarget(c, 'app:x'), '', 'an app is not a step');
});
test('◀ ▶ swap a step with its neighbour, and refuse at the ends', () => {
  const c = ORD();
  eq(M.qcMoveStepOrder(c, 'q:b', -1), 'q:r');
  eq(M.qcStepsUnder(c, 'q:r'), ['q:b', 'q:a', 'q:c'], 'b first now');
  eq(M.qcMoveStepOrder(c, 'q:b', -1), '', 'already first');
  eq(M.qcMoveStepOrder(c, 'q:c', 1), '', 'already last');
  eq(M.qcMoveStepOrder(c, 'q:d', 1), '', 'an only step has nothing to swap with');
  const s = M.qcNormalizeChart({ nodes: { 'q:r': {}, 'q:a': { x: 5, y: 9 }, 'q:b': { x: 5, y: 9 } }, edges: [{ from: 'q:a', to: 'q:r' }, { from: 'q:b', to: 'q:r' }] }, 'r');
  const first = M.qcStepsUnder(s, 'q:r')[0];
  M.qcMoveStepOrder(s, first, 1);
  ok(M.qcStepsUnder(s, 'q:r')[1] === first, 'stacked cards still swap');
});
test('a step dropped on another question is re-linked there; a loop or a next question is refused', () => {
  const c = ORD();
  eq(W.qcRelink(c, 'q:c', 'q:a'), { why: '', from: 'q:r' });
  ok(c.edges.some(e => e.from === 'q:c' && e.to === 'q:a') && !c.edges.some(e => e.from === 'q:c' && e.to === 'q:r'), 'moved, old arrow gone');
  const before = JSON.stringify(c.edges);
  ok(/loop/.test(W.qcRelink(c, 'q:a', 'q:d').why), 'a step cannot go under its own step');
  ok(W.qcRelink(c, 'q:a', 'q:n').why, 'never under a next question');
  ok(W.qcRelink(c, 'q:r', 'q:a').why, 'the question itself is not a step');
  eq(JSON.stringify(c.edges), before, 'a refusal changes nothing');
  eq(W.qcRelink(c, 'q:c', 'q:a').same, true, 'dropping on its own question is no change');
});
test('pupils get a question\'s steps in the teacher\'s order', () => {
  const pool = {
    a: { id: 'a', foundationOf: 'q1', createdAt: '1' }, b: { id: 'b', foundationOf: 'q1', createdAt: '2', foundationRank: 1 },
    c: { id: 'c', foundationOf: 'q1', createdAt: '3', foundationRank: 0 }, d: { id: 'd', foundationOf: 'q1', createdAt: '0', foundationRank: 'x' }
  };
  eq(F.foundationStepsFor('q1', pool).map(q => q.id), ['c', 'b', 'd', 'a'], 'ranked first by rank, then the rest as made');
  const fn = cutFrom(src, 'async function qcAfterStepMove(', '\n}\n', 'qcAfterStepMove');
  ok(/if \(!_isAdmin\(\)\) return;/.test(fn), 'teacher only');
  ok(/qcStepsUnder\(chart, t\)\.forEach\(\(k, i\) =>/.test(fn), 'the rank IS the left-to-right position');
  ok(/q\.foundationOf\.trim\(\) !== String\(tid\)/.test(fn), 'only steps held back for THAT question');
  ok(/moved\.foundationOf = qcParseKey\(toTarget\)\.id;/.test(fn), 'a held-back step moved under another question follows it');
  ok(/\{ merge: true \}/.test(fn), 'merged, one field at a time');
  ok(/else if \(act === "left" \|\| act === "right"\) qcMoveStep\(key, act === "left" \? -1 : 1\);/.test(src), '◀ ▶ wired');
  const keys = src.match(/const QUESTION_KEY_FIELDS = \[[^\]]*\]/);
  ok(!/foundationRank/.test(keys[0]), 'the rank stays in the student-readable half');
});

// ---- seeding from the board -------------------------------------------------------------
test('a new chart starts from the board: prerequisites, easier and harder', () => {
  const c = M.qcSeedFromBoard('r', [
    { from: 'p1', to: 'r', kind: 'prereq', comment: 'fraction of a quantity' },
    { from: 'r', to: 'e1', kind: 'easier' },
    { from: 'h1', to: 'r', kind: 'harder' },
    { from: 'd1', to: 'r', kind: 'duplicate' },        // not a step
    { from: 'r', to: 'x', kind: 'prereq' },            // r is the prerequisite there
    { from: 'p1', to: 'r', kind: 'prereq' },           // repeat
    { from: 'v1', to: 'r', kind: 'variant' },          // legacy duplicate
  ]);
  eq(Object.keys(c.nodes).sort(), ['q:e1', 'q:h1', 'q:p1', 'q:r'], 'nodes');
  eq(c.nodes['q:p1'].checks, 'fraction of a quantity', 'arrow note becomes the checks line');
  ok(c.edges.every(e => e.to === 'q:r'), 'all into the root');
  eq(M.qcNormalizeChart(c, 'r').edges.length, 3, 'survives normalising');
});
test('no board links: just the root', () => {
  eq(Object.keys(M.qcSeedFromBoard('r', []).nodes), ['q:r'], 'nodes');
});

// ---- layout -------------------------------------------------------------------------------
test('layout puts the question on top and steps a row per depth, loose nodes last', () => {
  const c = M.qcNormalizeChart({ nodes: { 'q:r': {}, 'q:a': {}, 'q:b': {}, 'q:c': {}, 'q:loose': {} },
    edges: [{ from: 'q:a', to: 'q:r' }, { from: 'q:b', to: 'q:r' }, { from: 'q:c', to: 'q:a' }] }, 'r');
  M.qcLayout(c);
  eq(c.nodes['q:r'].y, 0, 'root row');
  eq(c.nodes['q:a'].y, M.QC_ROWH, 'depth 1');
  eq(c.nodes['q:b'].y, M.QC_ROWH, 'depth 1');
  eq(c.nodes['q:c'].y, 2 * M.QC_ROWH, 'depth 2');
  eq(c.nodes['q:loose'].y, 3 * M.QC_ROWH, 'loose row');
  ok(c.nodes['q:a'].x !== c.nodes['q:b'].x, 'siblings apart');
});

// ---- apps ------------------------------------------------------------------------------------
test('an app needs a page or an https link — nothing else', () => {
  eq(M.qcNormalizeApp({ title: 't' }, 'a'), null, 'nothing');
  eq(M.qcNormalizeApp({ url: 'http://x.org' }, 'a'), null, 'http');
  eq(M.qcNormalizeApp({ url: 'javascript:alert(1)' }, 'a'), null, 'javascript');
  eq(M.qcNormalizeApp({ url: 'https://polymathlc.github.io/fractions/' }, 'a').url, 'https://polymathlc.github.io/fractions/', 'https');
  const both = M.qcNormalizeApp({ url: 'https://x.org', html: '<html><body>hi</body></html>' }, 'a');
  eq(both.url, '', 'a generated page wins and the link is dropped');
  eq(M.qcNormalizeApp({ html: '<html></html>', model: 'gpt-9', effort: 'huge', size: 'giant' }, 'a').model, '', 'unknown model');
});
test('generator settings: Luna has no effort, unknowns fall to Sol / medium / standard', () => {
  eq(M.qcAppRequestShape('gpt-6-luna', 'max', 'rich'), { model: 'gpt-6-luna', effort: '', size: 'rich' }, 'luna');
  eq(M.qcAppRequestShape('gpt-6.1-sol', 'xhigh', 'compact'), { model: 'gpt-6.1-sol', effort: 'xhigh', size: 'compact' }, 'sol');
  eq(M.qcAppRequestShape('gpt-4o', 'nope', 'giant'), { model: 'gpt-6.1-sol', effort: 'medium', size: 'standard' }, 'unknowns');
  eq(Object.keys(M.QC_APP_MODELS), ['gpt-6.1-sol', 'gpt-6-luna'], 'the two models asked for');
  eq(Object.keys(M.QC_APP_SIZES), ['compact', 'standard', 'rich'], 'sizes');
});
test('the page is taken out of a fenced or chatty reply, and a non-page is refused', () => {
  const page = '<!DOCTYPE html><html><body><div>x</div></body></html>';
  eq(M.qcAppHtmlFrom('```html\n' + page + '\n```'), page, 'fenced');
  eq(M.qcAppHtmlFrom('Here is your app:\n' + page + '\nEnjoy!'), page, 'chatty');
  eq(M.qcAppHtmlFrom('Sorry, I cannot help with that.'), '', 'refusal');
});
test('server and page extract the same page from the same reply', () => {
  const samples = ['```html\n<!DOCTYPE html><html><body><main>a</main></body></html>\n```',
    'Sure!\n<html><body><svg></svg></body></html> bye', 'no page here', '<div class="x">just a div</div>'];
  samples.forEach(s => eq(S.chartAppHtml(s), M.qcAppHtmlFrom(s), 'parity on ' + JSON.stringify(s.slice(0, 20))));
});
test('the server decides the budget: Luna runs at low effort, nothing exceeds the cap', () => {
  eq(S.chartAppShape({ model: 'gpt-6-luna', effort: 'max', size: 'rich' }).effort, 'low', 'luna effort');
  eq(S.chartAppShape({ model: 'evil-model' }).model, 'gpt-6.1-sol', 'unknown model');
  eq(S.chartAppShape({ size: '__proto__' }).size, 'standard', 'prototype key');
  const big = S.chartAppShape({ model: 'gpt-6.1-sol', effort: 'max', size: 'rich' });
  ok(big.budget <= S.CHART_APP_MAX_TOKENS, 'clamped');
  ok(S.chartAppShape({ size: 'compact', effort: 'low' }).budget < S.chartAppShape({ size: 'rich', effort: 'low' }).budget, 'size grows the budget');
  ok(S.chartAppShape({ size: 'standard', effort: 'low' }).budget < S.chartAppShape({ size: 'standard', effort: 'high' }).budget, 'effort grows the budget');
});
test('the app brief and prompt never carry the answer key', () => {
  const q = { title: 'Sharing money', level: 'P5', blocks: [{ type: 'text', content: 'Ali has $240.' }],
    expected: 'SECRET-ANSWER-96', markingGuide: 'SECRET-GUIDE', answerKeyImageUrl: 'https://secret.example/key.png' };
  const brief = M.qcDefaultBrief(q, 'finds 3/5 of a quantity');
  const prompt = M.qcAppPrompt({ title: 'Fractions', brief, level: q.level, size: 'standard' });
  ok(!/SECRET|secret\.example/.test(brief + prompt), 'leaked: ' + prompt);
  ok(/Ali has \$240/.test(brief), 'the question wording is there as context');
  ok(/Never solve the original exam question/.test(prompt), 'told not to solve it');
  ok(/no network and no storage/.test(prompt), 'told about the sandbox');
});

// ---- wiring read as text ----------------------------------------------------------------
test('no app frame ever gets allow-same-origin', () => {
  const frames = src.match(/<iframe[^>]*qc-app-frame[^>]*>/g) || [];
  ok(frames.length >= 1, 'the preview frame is in the markup');
  frames.forEach(f => ok(/sandbox="allow-scripts"/.test(f) && !/allow-same-origin/.test(f), f));
  eq(W.qcAppFrameAttrs({ html: '<html></html>' }).sandbox, 'allow-scripts', 'generated page');
  ok(!/allow-same-origin/.test(W.qcAppFrameAttrs({ url: 'https://x.org' }).sandbox), 'linked page');
  const block = cutFrom(src, '// 🧩 QUESTION CHARTS', '\n// NOVA PROTOCOL', 'qc block');
  ok(!/allow-same-origin"\)|sandbox", "[^"]*allow-same-origin/.test(block), 'no code path adds it');
});
test('the chart page is the teacher\'s, and loads on sign-in', () => {
  ok(/"graph", "qchart", "diagnostic"/.test(src), 'qchart is on navigateTo\'s author-only list');
  ok(/if \(page === "qchart"\) renderQuestionChartPage\(\);/.test(src), 'navigateTo renders it');
  ok(/await qcLoadAll\(user\.uid\);/.test(src), 'the admin branch loads charts');
  ok(/function openQuestionChart\(qid\) \{\n  if \(!_isAdmin\(\)\)/.test(src), 'opening checks _isAdmin');
  ok(/async function qcSaveNow\(\) \{[\s\S]{0,120}if \(!_isAdmin\(\)/.test(src), 'saving checks _isAdmin');
  ok(/data-qchart=/.test(src) && /data-act="qchart"/.test(src) && /id="qcEditorChartBtn"/.test(src), 'bank, board and editor buttons');
});
test('the server generator is teacher-only, on its own throttle, with a long timeout', () => {
  const fn = cutFrom(fnSrc, 'export const generateChartApp', '\n});', 'generateChartApp');
  ok(/if \(!isAdminAuth\(auth\)\) throw new HttpsError\("permission-denied"/.test(fn), 'admin check');
  ok(/reserveBackupSlot\(auth\.uid, CHART_APP_SLOT\)/.test(fn), 'own throttle');
  ok(/day: "chartAppDay"/.test(fnSrc), 'own fields');
  ok(/const CHART_APP_OPTS = \{[^}]*timeoutSeconds: 540/.test(fnSrc), 'nine minutes');
  ok(!/^export function/m.test(fnSrc), 'no plain function exports (the deploy reads every export)');
});
test('charts and apps live under rules that already exist', () => {
  ok(/match \/mathQuestionGraph\/\{docId\} \{\s*allow read: if signedIn\(\);\s*allow write: if isAdmin\(\) && isOwner\(uid\);/.test(rules), 'mathQuestionGraph rule');
  ok(/const QC_DOC_PREFIX = "chart__";/.test(src) && /const QC_APP_PREFIX = "app__";/.test(src), 'prefixes');
  ok(!/"mathQuestionCharts"|"mathChartApps"/.test(src), 'no new collection that would need a rules deploy');
});
test('the version is v1.98.0 or later', () => {
  const v = src.match(/const APP_VERSION = "v(\d+)\.(\d+)\.(\d+)/);
  ok(v && (Number(v[1]) > 1 || (Number(v[1]) === 1 && Number(v[2]) >= 98)), 'APP_VERSION is v1.98.0 or later');
});

// ---- runner ------------------------------------------------------------------------------------------
const only = process.argv[2];
let fail = 0, ran = 0;
for (const c of cases) {
  if (only && !c.name.includes(only)) continue;
  ran++;
  try { c.fn(); console.log('  ✓ ' + c.name); }
  catch (e) { fail++; console.log('  ✗ ' + c.name + '\n      ' + e.message); }
}
console.log(`\n${ran - fail}/${ran} passed`);
process.exit(fail ? 1 : 0);
