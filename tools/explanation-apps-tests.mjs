// 🧩 Explanation apps (v1.117.0) — the pure half, and the wiring that keeps an
// app away from a pupil until their answer is marked.
//
//   node --test tools/explanation-apps-tests.mjs
//
// Every way this goes wrong is silent: an app left in the PUBLIC half of the
// bank hands every pupil the worked answer before they try; an iframe given
// `allow-same-origin` runs a pasted page as this origin, beside the ChatGPT key;
// a collectQuestion that forgets the field saves the question and loses the app;
// a server whose limits drift from the page's drops an app the editor accepted.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const A = require(path.join(repo, 'explanation-apps.js'));
const html = fs.readFileSync(path.join(repo, 'index.html'), 'utf8');
const fn = fs.readFileSync(path.join(repo, 'functions', 'index.js'), 'utf8');
const mod = (html.match(/<script type="module">([\s\S]*?)<\/script>/) || [])[1] || '';

const PAGE = '<!DOCTYPE html><html><head><title>Bar model: sharing sweets</title></head><body><canvas id="c"></canvas><script>let n=0;</script></body></html>';

// A function's source, cut out of a text by its name (to the matching brace).
function cut(src, name) {
  const at = src.search(new RegExp('(?:async\\s+)?function\\s+' + name + '\\s*\\('));
  assert.ok(at >= 0, name + ' is in the source');
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error('unbalanced ' + name);
}

// ---------------------------------------------------------------------------
// ⌨ Pasted code
// ---------------------------------------------------------------------------
test('a whole document is kept exactly as pasted', () => {
  const r = A.fromCode(PAGE);
  assert.equal(r.html, PAGE);
  assert.equal(r.kind, 'document');
  assert.equal(r.wrapped, false);
  assert.equal(r.cut, false);
});

test('a piece of HTML is put inside a page with a charset and a viewport', () => {
  const r = A.fromCode('<div id="bar"></div><button>Go</button>');
  assert.equal(r.kind, 'fragment');
  assert.equal(r.wrapped, true);
  assert.match(r.html, /^<!DOCTYPE html>/);
  assert.match(r.html, /<meta charset="utf-8">/);
  assert.match(r.html, /name="viewport"/);
  assert.match(r.html, /<div id="bar"><\/div><button>Go<\/button>/);
});

test('bare JavaScript runs inside a <script>, and a </script inside it cannot end the page early', () => {
  const r = A.fromCode('const s = "a</script>b";\ndocument.body.textContent = s;');
  assert.equal(r.kind, 'script');
  assert.match(r.html, /<script>\n/);
  assert.equal((r.html.match(/<\/script>/gi) || []).length, 1, 'only the wrapper closes the script: ' + r.html);
  assert.match(r.html, /<\\\/script>/);
});

test('a markdown fence and a byte-order mark are taken off', () => {
  assert.equal(A.fromCode('```html\n' + PAGE + '\n```').html, PAGE);
  assert.equal(A.fromCode('\uFEFF' + PAGE).html, PAGE);
  assert.equal(A.fromCode('```\n<p>hi</p>\n```').kind, 'fragment');
});

test('Windows line endings are normalised and empty input is nothing', () => {
  assert.doesNotMatch(A.fromCode('<p>a</p>\r\n<p>b</p>').html, /\r/);
  for (const v of ['', '   ', null, undefined, '```html\n```']) {
    const r = A.fromCode(v);
    assert.equal(r.html, '');
    assert.equal(r.kind, 'empty');
  }
});

test('code longer than an app can hold is cut AND says so', () => {
  const r = A.fromCode('<div>' + 'x'.repeat(A.HTML_MAX + 50) + '</div>');
  assert.equal(r.cut, true);
  assert.equal(r.html.length, A.HTML_MAX);
});

// ---------------------------------------------------------------------------
// 📂 Uploaded files
// ---------------------------------------------------------------------------
test('an .html file is accepted, and its <title> names the app', () => {
  const r = A.fromFile('sweets.html', PAGE.length, PAGE);
  assert.equal(r.problem, '');
  assert.equal(r.html, PAGE);
  assert.equal(A.titleFrom(r.html, 'sweets.html'), 'Bar model: sharing sweets');
});

test('a file with no <title> is named after the file', () => {
  assert.equal(A.titleFrom('<div></div>', 'C:\\Users\\zk\\equal-groups_app.html'), 'Equal groups app');
  assert.equal(A.titleFrom('', ''), A.DEFAULT_TITLE);
});

test('a .js file is run as a script, and an unnamed file is judged by what it holds', () => {
  assert.equal(A.fromFile('app.js', 30, 'console.log(1)').kind, 'script');
  assert.equal(A.fromFile('download', 30, '<div>bars</div>').problem, '');
  assert.match(A.fromFile('notes', 10, 'just words').problem, /does not look like an app/);
});

test('a PDF, a picture or a Word document is refused by NAME, not run as mojibake', () => {
  for (const n of ['paper.pdf', 'photo.JPG', 'notes.docx', 'pack.zip', 'img.webp']) {
    assert.match(A.fromFile(n, 100, '%PDF-1.4').problem, /not a web page/, n);
  }
  assert.match(A.fromFile('weird.html', 10, 'abc\u0000\u0001def').problem, /not text/);
  assert.match(A.fromFile('empty.html', 0, '   ').problem, /empty/);
});

test('a file far too big is refused before it is read into the editor', () => {
  assert.match(A.fileProblem('huge.html', A.HTML_MAX * 5, 'x'), /too big/);
  const r = A.fromFile('big.html', A.HTML_MAX + 10, '<div>' + 'é'.repeat(A.HTML_MAX / 2 + 10) + '</div>');
  assert.match(r.problem, /larger than/);
  assert.equal(r.html, '');
});

// ---------------------------------------------------------------------------
// ✨ What a model sends back
// ---------------------------------------------------------------------------
test('a model reply is cut down to the document inside it', () => {
  assert.equal(A.fromModelText('Here you go!\n```html\n' + PAGE + '\n```\nEnjoy.'), PAGE);
  assert.equal(A.fromModelText('Sure. ' + PAGE + ' Hope it helps'), PAGE);
  assert.equal(A.fromModelText('I cannot do that.'), '');
});

// ---------------------------------------------------------------------------
// The ONE cleaner
// ---------------------------------------------------------------------------
test('clean keeps known fields only, and makes ids safe and unique', () => {
  const out = A.clean([
    { id: 'xa_abcd_1', title: '  Sweets  ', html: PAGE, height: 9999, source: 'uploaded', evil: '<script>', brief: 'b', model: 'gpt-6.1-sol', effort: 'high', size: 'rich', chartAppId: 'app_1', updatedAt: '2026-11-11T00:00:00Z' },
    { id: 'xa_abcd_1', html: '<p>two</p>', height: 'abc', source: 'hacker' },
    { id: '"><img onerror=1>', html: '<p>three</p>', height: 100 }
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(Object.keys(out[0]).sort(), ['brief', 'chartAppId', 'effort', 'height', 'html', 'id', 'model', 'size', 'source', 'title', 'updatedAt'].sort());
  assert.equal(out[0].title, 'Sweets');
  assert.equal(out[0].height, A.HEIGHT_MAX);
  assert.equal(out[1].height, A.HEIGHT_DEFAULT);
  assert.equal(out[1].source, undefined, 'an unknown source is not believed');
  assert.equal(out[2].height, A.HEIGHT_MIN);
  assert.notEqual(out[1].id, out[0].id, 'a repeated id is replaced');
  for (const a of out) assert.match(a.id, /^xa_[a-z0-9_]{4,40}$/);
});

test('clean drops rows with no page, stops at MAX_APPS, and never cuts an app in half', () => {
  const rows = [null, 'x', { html: '' }, { html: '   ' }, { html: '<p>1</p>' }, { html: '<p>2</p>' }, { html: '<p>3</p>' }, { html: '<p>4</p>' }];
  assert.equal(A.clean(rows).length, A.MAX_APPS);
  assert.deepEqual(A.clean('nope'), []);
  const big = '<div>' + 'x'.repeat(A.HTML_MAX) + '</div>';
  assert.deepEqual(A.clean([{ html: big }]), [], 'an app over the cap is DROPPED');
  const half = '<div>' + 'x'.repeat(A.HTML_MAX - 20) + '</div>';
  const two = A.clean([{ html: half }, { html: half }, { html: half }]);
  assert.equal(two.length, 2, 'the total cap keeps the key doc under 1 MB');
  assert.ok(two.every(a => a.html === half), 'nothing was cut');
});

test('forPupil hands over the page and nothing of the teacher\'s notes', () => {
  const out = A.forPupil([{ html: PAGE, brief: 'secret plan', model: 'gpt-6.1-sol', chartAppId: 'app_1', source: 'generated', title: 'T' }]);
  assert.deepEqual(Object.keys(out[0]).sort(), ['height', 'html', 'id', 'title']);
});

test('problems() says, before Save, why a list cannot be kept whole', () => {
  assert.deepEqual(A.problems([{ html: PAGE }]), []);
  const four = [1, 2, 3, 4].map(i => ({ html: '<p>' + i + '</p>' }));
  assert.match(A.problems(four).join(' '), /up to 3 apps — remove 1/);
  const big = { html: 'x'.repeat(A.HTML_MAX + 1) };
  assert.match(A.problems([big]).join(' '), /must be under 300 KB/);
  const half = { html: 'x'.repeat(A.HTML_MAX - 1) };
  assert.match(A.problems([half, half, half]).join(' '), /together they must stay under 600 KB/);
});

test('sizes are counted in UTF-8 bytes, which is what Firestore counts', () => {
  assert.equal(A.byteLength('abc'), 3);
  assert.equal(A.byteLength('é'), 2);
  assert.equal(A.byteLength('分'), 3);
  assert.equal(A.byteLength('🧩'), 4);
  assert.equal(A.sizeLabel('abc'), '3 bytes');
  assert.match(A.sizeLabel('x'.repeat(3000)), /KB$/);
});

test('sameList and summary', () => {
  const a = [{ id: 'xa_same_1', html: '<p>a</p>' }];
  assert.ok(A.sameList(a, [{ id: 'xa_same_1', html: '<p>a</p>' }]));
  assert.ok(!A.sameList(a, []));
  assert.equal(A.summary([]), '');
  assert.equal(A.summary(a), '🧩 1 app');
  assert.equal(A.summary([...a, { html: '<p>b</p>' }]), '🧩 2 apps');
});

// ---------------------------------------------------------------------------
// The sealed frame
// ---------------------------------------------------------------------------
test('every frame is sandboxed WITHOUT allow-same-origin, with the CSP first', () => {
  const f = A.frameHtml({ id: 'xa_frame_1', title: 'A "quoted" <title>', html: PAGE, height: 400 });
  assert.match(f, /sandbox="allow-scripts"/);
  assert.doesNotMatch(f, /allow-same-origin/);
  assert.match(f, /referrerpolicy="no-referrer"/);
  assert.match(f, /style="height:400px"/);
  assert.match(f, /loading="lazy"/);
  assert.doesNotMatch(A.frameHtml({ html: PAGE }, { lazy: false }), /loading=/);
  assert.match(f, /title="A &quot;quoted&quot; &lt;title&gt;"/);
  const doc = A.sandboxDocument(PAGE);
  const csp = doc.indexOf('Content-Security-Policy'), body = doc.indexOf(PAGE);
  assert.ok(csp > 0 && csp < body, 'the CSP is parsed before any author content');
  assert.match(A.CSP, /connect-src 'none'/);
  assert.match(A.CSP, /default-src 'none'/);
  assert.match(A.CSP, /form-action 'none'/);
  // The page goes into srcdoc ESCAPED — no raw quote can end the attribute.
  const src = /srcdoc="([^"]*)"/.exec(f)[1];
  assert.ok(src.includes('&lt;canvas'), 'escaped');
  assert.ok(!src.includes('<'), 'nothing raw inside the attribute');
});

test('the pupil\'s card carries ↻ Start again and ⤢ Bigger, and the reveal says what to do', () => {
  const c = A.cardHtml({ id: 'xa_card_1', title: 'T', html: PAGE });
  assert.match(c, /data-xa-restart="xa_card_1"/);
  assert.match(c, /data-xa-expand="xa_card_1"/);
  assert.match(c, /class="xa-card"/);
  assert.equal(A.revealHtml([]), '');
  assert.equal(A.feedbackBlockHtml(null), '');
  assert.match(A.revealHtml([{ html: PAGE }]), /Try this app/);
  assert.match(A.revealHtml([{ html: PAGE }, { html: '<p>b</p>' }]), /Try these apps/);
  assert.match(A.revealHtml([{ html: PAGE }], { note: 'Only after <marking>' }), /Only after &lt;marking&gt;/);
  assert.match(A.feedbackBlockHtml([{ html: PAGE }]), /^<div class="feedback-block xa-reveal"><h4>🧩 Explore it — interactive<\/h4>/);
});

test('the AI brief asks for THIS question solved, and Refine keeps the page', () => {
  const b = A.defaultBrief();
  assert.match(b, /AFTER their answer has been marked/);
  assert.match(b, /never a different story or different numbers/);
  const p = A.refinePrompt('BASE', PAGE, 'bigger buttons');
  assert.ok(p.startsWith('BASE'));
  assert.ok(p.includes(PAGE));
  assert.match(p, /CHANGE IT LIKE THIS:\nbigger buttons/);
  assert.match(p, /Return the WHOLE updated document/);
});

// ---------------------------------------------------------------------------
// The page's wiring
// ---------------------------------------------------------------------------
test('index.html loads the helper as a CLASSIC script, before the module', () => {
  const tag = html.indexOf('<script src="explanation-apps.js?v=');
  const modAt = html.indexOf('<script type="module">');
  assert.ok(tag > 0 && tag < modAt, 'loaded in the head, before the app module');
  const v = (html.match(/explanation-apps\.js\?v=([\d.]+)/) || [])[1];
  const app = (mod.match(/const APP_VERSION = ['"]v([\d.]+)/) || [])[1];
  assert.equal(v, app, 'the ?v= follows APP_VERSION so a release reaches every browser');
});

test('explanationApps lives in the ADMIN-ONLY half of the bank', () => {
  const keys = (mod.match(/const QUESTION_KEY_FIELDS = \[([\s\S]*?)\]/) || [])[1] || '';
  assert.match(keys, /"explanationApps"/);
});

test('the editor loads, resets and SAVES the apps', () => {
  assert.match(cut(mod, 'resetEditor'), /xaEditorSet\(\[\]\)/);
  assert.match(cut(mod, 'loadQuestionIntoEditor'), /xaEditorSet\(q\.explanationApps\)/);
  assert.match(cut(mod, 'collectQuestion'), /explanationApps: xaEditorCollect\(\)/);
  assert.match(cut(mod, 'qcSpawnEditor'), /xaEditorSet\(\[\]\)/, 'a copy made from a chart starts with no app');
  assert.ok(/"explanationApps"/.test((mod.match(/const CPB_EDITOR_FIELDS = new Set\(\[([\s\S]*?)\]/) || [])[1] || ''), 'a Custom Paper edit carries the apps');
});

test('the state is var (resetEditor runs during module evaluation)', () => {
  for (const v of ['xaEditorApps', 'xaBusy', 'xaPreviewed', 'xaUploadTarget']) {
    assert.match(mod, new RegExp('\\bvar ' + v + '\\b'), v);
    assert.doesNotMatch(mod, new RegExp('\\b(?:let|const) ' + v + '\\b'), v);
  }
});

test('a pupil is shown the apps in showResult — after marking — and the marker\'s reply carries them', () => {
  assert.match(cut(mod, 'showResult'), /xaShowReveal\(/);
  assert.match(mod, /if \(Array\.isArray\(out\.explanationApps\)\) q\.explanationApps = out\.explanationApps;/);
  assert.match(html, /id="xaRevealBlock"[^>]*style="display:none;"/);
  assert.match(cut(mod, 'aiMarkRenderResult'), /xaFeedbackBlockHtml\(out\.explanationApps\)/);
  assert.match(cut(mod, 'wvSolutionBodyHtml'), /xaFeedbackBlockHtml\(s\.explanationApps\)/);
});

test('the editor never runs a frame with allow-same-origin anywhere on the page', () => {
  const frames = html.match(/sandbox="[^"]*"/g) || [];
  for (const f of frames) if (/xa/.test(f)) assert.doesNotMatch(f, /allow-same-origin/);
  assert.doesNotMatch(cut(mod, 'xaPreviewHtml'), /<iframe/, 'the editor preview draws the shared frameHtml');
  assert.match(cut(mod, 'xaPreviewHtml'), /A\.frameHtml\(/);
});

test('the file picker is cleared BEFORE the file is read, and uploads are author-only', () => {
  assert.match(mod, /fileIn\.value = "";\s*\/\/ cleared BEFORE reading/);
  assert.match(cut(mod, 'xaReadFile'), /canManageQuestions\(\)/);
  assert.match(cut(mod, 'xaRunAi'), /canManageQuestions\(\)/);
  assert.match(html, /id="xaFileInput"[^>]*class="xa-file"|class="xa-file"[^>]*id="xaFileInput"/);
  assert.doesNotMatch(html.match(/<input[^>]*id="xaFileInput"[^>]*>/)[0], /\shidden[\s>]/, 'visually hidden, never `hidden`');
});

test('a reply for a question no longer in the editor is dropped', () => {
  const run = cut(mod, 'xaRunAi');
  assert.match(run, /xaEditorApps !== list \|\| !xaFind\(id\)/);
});

// ---------------------------------------------------------------------------
// The server's copy
// ---------------------------------------------------------------------------
const serverClean = (() => {
  const consts = ['EXPLANATION_APPS_MAX', 'EXPLANATION_APP_HTML_MAX', 'EXPLANATION_APPS_TOTAL_MAX'].map(n => {
    const m = fn.match(new RegExp('const ' + n + ' = (\\d+);'));
    assert.ok(m, n);
    return 'const ' + n + ' = ' + m[1] + ';';
  }).join('\n');
  const cleanText = 'function cleanText(v, n) { return String(v == null ? "" : v).slice(0, n); }';
  // eslint-disable-next-line no-new-func
  return new Function(consts + '\n' + cleanText + '\n' + cut(fn, 'cleanExplanationApps') + '\nreturn cleanExplanationApps;')();
})();

test('the server\'s limits are the page\'s limits', () => {
  assert.equal(Number(fn.match(/const EXPLANATION_APPS_MAX = (\d+)/)[1]), A.MAX_APPS);
  assert.equal(Number(fn.match(/const EXPLANATION_APP_HTML_MAX = (\d+)/)[1]), A.HTML_MAX);
  assert.equal(Number(fn.match(/const EXPLANATION_APPS_TOTAL_MAX = (\d+)/)[1]), A.TOTAL_MAX);
});

test('the server sends a pupil ONLY id, title, html and height, and drops what it cannot send whole', () => {
  const out = serverClean([
    { id: 'xa_srv_ok1', title: 'T', html: PAGE, height: 2000, brief: 'notes', model: 'gpt-6.1-sol', chartAppId: 'a' },
    { html: '' },
    { html: 'x'.repeat(A.HTML_MAX + 1) },
    { id: 'xa_srv_ok1', html: '<p>b</p>', height: 10 },
    { html: '<p>c</p>' },
    { html: '<p>d</p>' }
  ]);
  assert.equal(out.length, 3);
  assert.deepEqual(Object.keys(out[0]).sort(), ['height', 'html', 'id', 'title']);
  assert.equal(out[0].height, A.HEIGHT_MAX);
  assert.equal(out[1].height, A.HEIGHT_MIN);
  assert.notEqual(out[1].id, out[0].id);
  assert.deepEqual(serverClean(undefined), []);
  assert.deepEqual(serverClean([{ html: PAGE }], 10), [], 'a budget smaller than the app sends nothing rather than half');
});

test('whatever the page saves, the server sends back unchanged', () => {
  const saved = A.clean([{ html: PAGE, title: 'Sweets', height: 480 }, { html: '<div>two</div>', height: 700 }]);
  const sent = serverClean(saved);
  assert.deepEqual(sent, A.forPupil(saved));
});

test('the marker and the worksheet\'s shared solutions carry the apps — and the helper is not exported', () => {
  assert.match(fn, /explanationApps: cleanExplanationApps\(q\.explanationApps\),/);
  assert.match(fn, /cleanExplanationApps\(data\.explanationApps, appBudget\)/);
  assert.match(fn, /let appBudget = WORKSHEET_APPS_BUDGET;/);
  assert.doesNotMatch(fn, /export\s+(?:const|function)\s+cleanExplanationApps/, 'the deploy reads every export as a function');
});
