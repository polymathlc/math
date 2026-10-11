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
  return { QC_MAX_NODES, QC_CHECKS_MAX, QC_ROWH, qcKeyQ, qcKeyApp, qcParseKey, qcChartDocId, qcAppDocId,
           qcNormalizeChart, qcWouldCycle, qcChartPayload, qcSeedFromBoard, qcLayout, qcDepths,
           qcNormalizeApp, qcAppRequestShape, qcAppMetaLabel, qcAppHtmlFrom, qcDefaultBrief, qcAppPrompt,
           QC_APP_MODELS, QC_APP_SIZES };
`)();
// The frame attributes and the edge writer sit further down; cut them alone.
const W = new Function('M', `
  const { qcKeyQ, qcParseKey, qcWouldCycle } = M;
  const QC_COMMENT_MAX = 200;
  ${cutFrom(src, 'function qcAddEdge(', '\nfunction qcLinkComplete(', 'qcAddEdge')}
  ${cutFrom(src, 'function qcAppFrameAttrs(', '\nfunction qcOpenAppViewer(', 'qcAppFrameAttrs')}
  return { qcAddEdge, qcAppFrameAttrs };
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
test('the version is v1.93.0 or later', () => {
  const v = src.match(/const APP_VERSION = "v(\d+)\.(\d+)\.(\d+)/);
  ok(v && (Number(v[1]) > 1 || (Number(v[1]) === 1 && Number(v[2]) >= 93)), 'APP_VERSION is v1.93.0 or later');
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
