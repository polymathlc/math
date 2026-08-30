// Regression tests for 🔍 THE FIGURE IS FOUND, CUT OUT AND CLEANED — the one
// door ⚡ Rapid add and ✨ Build with AI both take a screenshot's figure through,
// and for the objectives both of them file automatically.
// Run with:
//     node tools/screenshot-diagram-tests.mjs            all cases
//     node tools/screenshot-diagram-tests.mjs <name>     one case
//
// It loads the REAL functions out of index.html and runs them against stubs.
// Everything here fails SILENTLY — a question still lands in vetting or in the
// editor, and it is wrong in a way only the author notices much later:
//
//  • THE FIGURE GOES MISSING. Every step of the ladder falls back to the step
//    before it. A crop that failed must attach the WHOLE screenshot; a clean-up
//    that failed must keep the sharp crop. A question whose picture block is
//    empty prints as a question with a hole in it.
//  • …AND A MISSING CROP MUST SAY SO. A whole screenshot sitting in a picture
//    block looks exactly like a figure nobody has got round to cropping, which
//    on a vetting card reads as finished work.
//  • THE SECOND CUT EATS THE FIGURE. `_aiRefineCrop` exists to trim question
//    wording the rectangle took with it. Every one of its refusals — the model
//    saying "clean", a suspiciously small box, a box that is the whole picture,
//    a box that would throw 80% of the crop away — must return the crop
//    UNCHANGED, because a wrong second cut is worse than a generous first one.
//  • THE OBJECTIVES LAND ON THE WRONG QUESTION. Both halves arrive after an AI
//    call, by which time the author may have opened something else — so both
//    are abandoned unless the editor is still showing the question they were
//    read from.
import fs from 'fs';

const SRC = new URL('../index.html', import.meta.url).pathname;
const src = fs.readFileSync(SRC, 'utf8');

const cut = (from, to, what) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(`${what}: "${from}" not found — renamed?`);
  const b = src.indexOf(to, a);
  if (b < 0) throw new Error(`${what}: never closes`);
  return src.slice(a, b + to.length);
};

// ---- the refine pass, against a fake page ---------------------------------
const refineSrc = cut('async function _aiRefineCrop(dataUrl)', '\n}', '_aiRefineCrop');
function makeRefine(reply, opts = {}) {
  const calls = { n: 0 };
  const canvas = {
    width: 0, height: 0,
    getContext: () => ({ drawImage() {}, fillRect() {}, set imageSmoothingEnabled(v) {}, set imageSmoothingQuality(v) {}, set fillStyle(v) {} }),
    toDataURL: () => 'data:image/png;base64,SECONDCUT',
  };
  const fn = new Function('aiReady', 'askGeminiVision', 'parseAIJson', 'loadImage', 'document', 'console', 'calls',
    refineSrc + '\nreturn _aiRefineCrop;')(
    () => opts.aiReady !== false,
    async () => { calls.n++; return JSON.stringify(reply); },
    s => JSON.parse(s),
    async () => ({ naturalWidth: opts.W || 1000, naturalHeight: opts.H || 1000 }),
    { createElement: () => canvas },
    { warn() {} },
    calls);
  return { fn, calls };
}
const CROP = 'data:image/png;base64,FIRSTCUT';

// ---- the door itself, against stubs ---------------------------------------
const doorSrc = cut('async function autoDiagramIntoBlock(imgBlock, box, media, onStatus, opts)', '\n}', 'autoDiagramIntoBlock')
  + '\n' + cut('function autoDiagramNote(r)', '\n}', 'autoDiagramNote');
function makeDoor(stub = {}) {
  const state = {};
  const seen = { uploads: [], status: [] };
  const M = new Function('cropBox2dFromImage', '_aiRefineCrop', '_cleanToBlackAndWhite', 'uploadDataUrlToStorage', '_imgEnhanceState', 'console', 'seen',
    doorSrc + '\nreturn { autoDiagramIntoBlock, autoDiagramNote };')(
    stub.crop || (async () => CROP),
    stub.refine || (async d => d),
    stub.clean || (async d => d + '-BW'),
    stub.upload || (async d => { seen.uploads.push(d); return 'https://store/' + d.slice(-8); }),
    state, { warn() {} }, seen);
  return { M, state, seen };
}
const MEDIA = { mimeType: 'image/png', data: 'WHOLESCREENSHOT' };
const FULL = 'data:image/png;base64,WHOLESCREENSHOT';

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (c, what) => { if (!c) throw new Error(what); };
const eq = (got, want, what) => {
  if (got !== want) throw new Error((what || 'value') + ':\n           got  ' + JSON.stringify(got) + '\n           want ' + JSON.stringify(want));
};

// ---------------------------------------------------------------------
// the ladder — a figure is never silently lost
// ---------------------------------------------------------------------
test('the happy path: cut out, checked, cleaned, saved', async () => {
  const { M, state } = makeDoor();
  const blk = { id: 'b1' };
  const r = await M.autoDiagramIntoBlock(blk, [100, 100, 500, 500], MEDIA);
  ok(r.cropped, 'the crop must be reported');
  ok(r.cleaned, 'the clean-up must be reported');
  ok(blk.url, 'the block must end up with a picture');
  ok(state.b1 && state.b1.originalDataUrl === FULL,
     '↩ Use original must go back to the WHOLE screenshot');
});

test('no usable rectangle → the WHOLE screenshot, and it SAYS so', async () => {
  const { M } = makeDoor({ crop: async () => null });
  const blk = { id: 'b1' };
  const r = await M.autoDiagramIntoBlock(blk, null, MEDIA);
  ok(!r.cropped, 'a failed crop must not report itself as cropped');
  ok(blk.url, 'the figure must never be lost — the whole screenshot goes on instead');
  ok(/WHOLE screenshot/i.test(M.autoDiagramNote(r)), 'the author must be told it is the whole screenshot');
  ok(/by hand/i.test(M.autoDiagramNote(r)), 'the author must be told what to do about it');
});

test('a crop that THREW is the same as no crop', async () => {
  const { M } = makeDoor({ crop: async () => { throw new Error('canvas tainted'); } });
  const blk = { id: 'b1' };
  const r = await M.autoDiagramIntoBlock(blk, [1, 1, 900, 900], MEDIA);
  ok(!r.cropped && blk.url, 'a thrown crop must still leave a picture on the question');
});

test('a clean-up that failed keeps the SHARP CROP, not nothing', async () => {
  const { M, seen } = makeDoor({ clean: async d => d });   // the real one returns its input on failure
  const blk = { id: 'b1' };
  const r = await M.autoDiagramIntoBlock(blk, [1, 1, 500, 500], MEDIA);
  ok(r.cropped, 'the crop still happened');
  ok(!r.cleaned, 'a clean-up that changed nothing must not claim it did');
  ok(seen.uploads.includes(CROP), 'the sharp crop must be what is uploaded');
});

test('an upload that failed leaves the block alone and says so', async () => {
  const { M } = makeDoor({ upload: async () => { throw new Error('storage refused'); } });
  const blk = { id: 'b1', url: '' };
  const r = await M.autoDiagramIntoBlock(blk, [1, 1, 500, 500], MEDIA);
  eq(blk.url, '', 'a failed upload must not write a broken url onto the question');
  ok(/by hand/i.test(M.autoDiagramNote(r)), 'a picture that could not be attached must be named');
});

test('the whole screenshot is only re-uploaded when there IS a crop', async () => {
  const a = makeDoor();
  await a.M.autoDiagramIntoBlock({ id: 'b1' }, [1, 1, 500, 500], MEDIA);
  ok(a.seen.uploads.includes(FULL), 'a cropped question needs the original for ↩ Use original');
  const b = makeDoor({ crop: async () => null });
  await b.M.autoDiagramIntoBlock({ id: 'b1' }, null, MEDIA);
  eq(b.seen.uploads.length, 1, 'the whole screenshot must not be uploaded twice when it IS the picture');
});

test('the author is told what is happening, step by step', async () => {
  const { M } = makeDoor();
  const said = [];
  await M.autoDiagramIntoBlock({ id: 'b1' }, [1, 1, 500, 500], MEDIA, m => said.push(m));
  ok(said.length >= 3, 'each slow step must report itself');
  ok(said.some(s => /stray question text/i.test(s)), 'the second cut must be visible — it is an AI call');
  ok(said.some(s => /black & white/i.test(s)), 'the clean-up must be visible — it is a slow AI call');
});

test('no picture block is not an error', async () => {
  const { M } = makeDoor();
  const r = await M.autoDiagramIntoBlock(null, [1, 1, 500, 500], MEDIA);
  ok(!r.cropped && !r.url, 'a question with no figure asks for nothing');
});

// ---------------------------------------------------------------------
// the second cut refuses far more often than it cuts
// ---------------------------------------------------------------------
test('"clean" means leave it alone', async () => {
  const { fn } = makeRefine({ clean: true });
  eq(await fn(CROP), CROP, 'a clean crop must come back untouched');
});

test('a suspiciously small box is refused', async () => {
  const { fn } = makeRefine({ clean: false, box_2d: [400, 400, 500, 500] });
  eq(await fn(CROP), CROP, 'a box under 150/1000 on a side must be refused');
});

test('a box that is the whole picture is refused', async () => {
  const { fn } = makeRefine({ clean: false, box_2d: [5, 5, 995, 995] });
  eq(await fn(CROP), CROP, 'a box covering the whole crop has nothing to cut');
});

test('a box that would throw most of the crop away is refused', async () => {
  // 400x400 of a 1000x1000 crop is 16% — under the one-fifth floor.
  const { fn } = makeRefine({ clean: false, box_2d: [300, 300, 700, 700] });
  eq(await fn(CROP), CROP, 'a second cut that discards >80% is cutting the figure, not the wording');
});

test('a real trim IS applied', async () => {
  const { fn } = makeRefine({ clean: false, box_2d: [200, 20, 980, 980] });
  ok((await fn(CROP)).includes('SECONDCUT'), 'a sentence above the figure must actually be cut off');
});

test('junk from the model changes nothing', async () => {
  for (const reply of [{}, { clean: false }, { clean: false, box_2d: [1, 2, 3] }, { clean: false, box_2d: ['a', 'b', 'c', 'd'] }, { clean: false, box_2d: [0, 0, 2000, 2000] }]) {
    const { fn } = makeRefine(reply);
    eq(await fn(CROP), CROP, 'an unusable reply must leave the crop alone: ' + JSON.stringify(reply));
  }
});

test('with no AI at all the crop is handed straight back', async () => {
  const { fn, calls } = makeRefine({ clean: false, box_2d: [200, 20, 980, 980] }, { aiReady: false });
  eq(await fn(CROP), CROP, 'no model means no second cut');
  eq(calls.n, 0, 'and no call billed for it');
});

// ---------------------------------------------------------------------
// the wiring
// ---------------------------------------------------------------------
test('there is ONE door, and both readers take it', () => {
  ok(/⚡ Rapid add and ✨ Build with AI both go through it/.test(src) || src.includes('autoDiagramIntoBlock'),
     'the door must exist');
  const uses = (src.match(/await autoDiagramIntoBlock\(/g) || []).length;
  ok(uses >= 2, `both ⚡ Rapid add and ✨ Build with AI must call the door (found ${uses})`);
  // Nothing may crop a screenshot behind the door's back.
  const raw = (src.match(/await cropBox2dFromImage\(/g) || []).length;
  eq(raw, 1, 'cropBox2dFromImage must be reached through the door and nowhere else');
});

test('✨ Build with AI actually asks for the rectangle', () => {
  ok(/aiQuestionReadPrompt\(source\.isPdf, wantBox\)/.test(src),
     'the build read must pass wantBox, or there is no rectangle to crop with');
  ok(/const wantBox = !source\.isPdf/.test(src),
     'a PDF has no single page to measure a rectangle on');
});

test('the background work is abandoned if the author moves on', () => {
  const at = src.indexOf('async function finishAiBuild');
  ok(at > 0, 'finishAiBuild is missing');
  const body = src.slice(at, at + 1800);
  ok((body.match(/editorBlocks !== owner/g) || []).length >= 2,
     'BOTH the picture and the objectives must check the editor is still showing this question');
  ok(/const owner = editorBlocks/.test(body), 'the owning array must be captured before the first await');
});

test('a built question does not inherit the last one\'s objectives', () => {
  const at = src.indexOf('function populateEditorFromAi(d)');
  ok(at > 0, 'populateEditorFromAi is missing');
  const body = src.slice(at, at + 900);
  ok(/editorLos = \[\]/.test(body), 'the editor objectives must be cleared for a freshly read question');
  ok(/pendingVariantOf = null/.test(body), 'a build straight after a regenerate must not be filed as a variant');
});

test('auto-filing never overwrites objectives that are already there', () => {
  const at = src.indexOf('async function sylAutoFileEditor');
  ok(at > 0, 'sylAutoFileEditor is missing');
  const body = src.slice(at, at + 1200);
  ok(/if \(editorLos\.length\) return \[\]/.test(body), 'objectives already picked must never be replaced');
  ok(/sylAutoFileOn\(\)/.test(body), 'the author must be able to switch auto-filing off');
  ok(/catch/.test(body), 'it must never fail its caller — a question is worth keeping unfiled');
});

test('the progress bar can actually hide itself', () => {
  // `display: flex` on the class outweighs the browser's own [hidden] rule, so
  // without this the bar is on screen on every question, for ever.
  ok(/\.ai-finish-bar\[hidden\]\s*\{\s*display:\s*none/.test(src),
     '.ai-finish-bar[hidden] must set display:none, or the bar never goes away');
  ok(/<div class="ai-finish-bar" id="aiFinishBar" hidden>/.test(src),
     'the bar must start hidden — it belongs to a build that has not happened yet');
});

test('the clean-up prompt is a repair, not a redraw', () => {
  const at = src.indexOf('const _BW_ENHANCE_PROMPT');
  ok(at > 0, '_BW_ENHANCE_PROMPT is missing');
  const body = src.slice(at, at + 1400);
  ok(/SCAN_SOURCE_PROMPT/.test(body), 'it must open by saying the picture is a scan, or the model redraws the damage faithfully');
  ok(/BLACK-AND-WHITE/.test(body), 'the point of the pass is black-and-white line work');
  ok(/do NOT restyle, rearrange, add or remove anything/i.test(body), 'nothing about the figure may change');
  ok(/same aspect ratio/i.test(body), 'the aspect ratio must be pinned');
});

// ---------------------------------------------------------------------
const only = process.argv[2];
let pass = 0, fail = 0;
for (const c of cases) {
  if (only && c.name !== only) continue;
  try { await c.fn(); pass++; console.log('  ✓ ' + c.name); }
  catch (e) { fail++; console.log('  ✗ ' + c.name + '\n      ' + e.message); }
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
