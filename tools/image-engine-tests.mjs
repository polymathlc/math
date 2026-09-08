// 🖼 THE IMAGE ENGINE — ChatGPT Images 2.5 for every picture (v1.71.0)
//
// Loads the REAL image-engine block out of index.html against stubs, and the
// real validators out of functions/index.js, and pins the things that fail
// silently — the app draws a picture either way, and a picture that came out
// of the wrong model looks exactly like one that did not:
//
//  • the default model is gpt-image-2.5-flare, the dropdown leads with it, and
//    an id the dropdown no longer offers falls back to it;
//  • the one-shot LIFT off yesterday's default, and a deliberate re-pick after
//    it sticking;
//  • the ORDER: ChatGPT Images by the server's key, then a key in this browser,
//    then Gemini — regardless of the TEXT engine;
//  • the door FALLS THROUGH and, when everything refuses, names every route;
//  • a refusal about ONE picture does not close the route;
//  • the request shape: edits carry input_fidelity high, several references go
//    up as image[], transparent asks for png, xhigh is clamped on a legacy model;
//  • the census: no caller reaches the raw Gemini route or the browser-key
//    route except the door; _tcgGenOnce, askGeminiImageEdit and
//    generateEnhancedImageDataUrl all go through generateImageDataUrl;
//  • the server: the callable exists, pins the model to the 2.5 family, counts
//    on its own throttle fields, validates sizes and forces png under
//    transparent.
import fs from 'node:fs';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const fnsrc = fs.readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');

function section(text, from, to) {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a);
  if (a < 0 || b < 0) throw new Error('section not found: ' + from.slice(0, 40));
  return text.slice(a, b);
}
// The block, minus the raw Gemini route at its foot (stubbed below).
const block = section(src, "const OPENAI_IMAGE_DEFAULT_MODEL = ", '// THE RAW GEMINI ROUTE');

function build(storeInit) {
  return new Function(`
var _store = ${JSON.stringify(storeInit || {})};
var localStorage = {
  getItem: function (k) { return Object.prototype.hasOwnProperty.call(_store, k) ? _store[k] : null; },
  setItem: function (k, v) { _store[k] = String(v); },
  removeItem: function (k) { delete _store[k]; }
};
var AI_ENGINE_STORE = { engine: 'x_ai_engine', key: 'x_openai_key', model: 'x_openai_model', imageModel: 'x_openai_image_model', kimiKey: 'x_kimi_key', kimiModel: 'x_kimi_model', modelGen: 'x_openai_model_gen', imageEngine: 'x_ai_image_engine', imageGen: 'x_openai_image_gen' };
var _key = '';
function getOpenAiKey() { return _key; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
var geminiImageModels = [{}];
function _parseImageDataUrl(u) {
  var m = /^data:([^;,]+);base64,(.*)$/.exec(u || '');
  if (!m) return null;
  return { mime: m[1], bytes: Buffer.from(m[2], 'base64') };
}
var cloudFunctions = {};
var serverMode = 'ok', serverCalls = [];
function httpsCallable(_f, name) {
  return async function (payload) {
    serverCalls.push({ name: name, payload: payload });
    if (serverMode === 'precondition') { var e = new Error('functions/failed-precondition: No OpenAI key is configured on the server.'); e.code = 'functions/failed-precondition'; throw e; }
    if (serverMode === 'bad') { var e2 = new Error('functions/invalid-argument: bad size'); e2.code = 'functions/invalid-argument'; throw e2; }
    return { data: { b64: 'U0VSVkVS', mimeType: 'image/png', model: payload.model } };
  };
}
var fetchMode = 'ok', fetchCalls = [];
async function fetch(url, init) {
  fetchCalls.push({ url: url, init: init });
  if (fetchMode === 'unauth') return { ok: false, status: 401, json: async () => ({ error: { message: 'Incorrect API key provided' } }) };
  if (fetchMode === 'unsupported' && fetchCalls.length % 2 === 1) return { ok: false, status: 400, json: async () => ({ error: { message: 'Unknown parameter: input_fidelity' } }) };
  return { ok: true, json: async () => ({ data: [{ b64_json: 'S0VZ' }] }) };
}
var geminiMode = 'ok', geminiCalls = [];
async function generateImageDataUrlGemini(prompt, refs) {
  geminiCalls.push({ prompt: prompt, refs: refs });
  if (geminiMode === 'fail') throw new Error('Gemini quota exceeded');
  return 'data:image/png;base64,R0VNSU5J';
}
async function _urlToDataUrlRobust(u) { return 'data:image/png;base64,VVJM'; }
var console = { warn: function () {} };
// The green box writes into a DOM node; this is the smallest DOM that lets
// the harness read what it said. Timers are inert so the process can exit.
var announced = [], _badge = null;
var document = {
  body: { appendChild: function () {} },
  getElementById: function () { return _badge; },
  createElement: function () {
    var cls = new Set();
    _badge = {
      id: '', _t: '',
      classList: { add: function (c) { cls.add(c); }, remove: function (c) { cls.delete(c); }, contains: function (c) { return cls.has(c); } },
      setAttribute: function () {},
      set textContent(v) { this._t = v; announced.push(v); },
      get textContent() { return this._t; }
    };
    return _badge;
  }
};
var setTimeout = function () { return 0; }, clearTimeout = function () {};
` + block + `
return {
  store: _store,
  announced: announced,
  imageEngineDescribe: imageEngineDescribe,
  badge: function () { return _badge; },
  set key(v) { _key = v; },
  set gemini(v) { geminiImageModels = v ? [{}] : []; },
  set serverMode(v) { serverMode = v; },
  set fetchMode(v) { fetchMode = v; },
  set geminiMode(v) { geminiMode = v; },
  get serverCalls() { return serverCalls; },
  get fetchCalls() { return fetchCalls; },
  get last() { return imageLastCall; },
  get down() { return _aiDown; },
  resetDown: function () { Object.keys(_aiDown).forEach(function (k) { _aiDown[k] = 0; }); serverCalls.length = 0; fetchCalls.length = 0; geminiCalls.length = 0; },
  OPENAI_IMAGE_DEFAULT_MODEL, OPENAI_IMAGE_MODELS, OPENAI_IMAGE_25_RE, OPENAI_IMAGE_SUPERSEDED, OPENAI_IMAGE_GEN,
  getOpenAiImageModel, openAiImageModelOptionsHtml, aiImageEngineSetting, imageEngineOrder, imageOpenAiPossible,
  imageEngineReady, imageEngineLabel, _tcgArtEngineLabel, _imgRefsFrom, _imgQualityFor, generateImageDataUrl,
  imageRouteReport, _imgRouteFault
};
`)();
}

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; return; }
  fail++;
  console.log('  FAIL ' + name + (extra ? '\n       ' + extra : ''));
}
const run = (name, fn) => Promise.resolve().then(fn).catch(e => { fail++; console.log('  FAIL ' + name + ' threw: ' + (e && e.stack || e)); });

await run('model', () => {
  const api = build();
  ok('the default image model is ChatGPT Images 2.5 Flare', api.OPENAI_IMAGE_DEFAULT_MODEL === 'gpt-image-2.5-flare');
  ok('the dropdown leads with Flare and offers Sunburst second', api.OPENAI_IMAGE_MODELS[0].id === 'gpt-image-2.5-flare' && api.OPENAI_IMAGE_MODELS[1].id === 'gpt-image-2.5-sunburst');
  ok('the family regex takes both 2.5 models and their dated snapshots',
     ['gpt-image-2.5-flare', 'gpt-image-2.5-sunburst', 'gpt-image-2.5-flare-2026-09-08'].every(id => api.OPENAI_IMAGE_25_RE.test(id)) && !api.OPENAI_IMAGE_25_RE.test('gpt-image-2'));
  api.store.x_openai_image_model = 'gpt-image-9-nova';
  ok('an id the dropdown no longer offers is the DEFAULT, not a 404 on every picture', api.getOpenAiImageModel() === 'gpt-image-2.5-flare');
  api.store.x_openai_image_model = 'gpt-image-2.5-sunburst';
  ok('a deliberate Sunburst pick is honoured', api.getOpenAiImageModel() === 'gpt-image-2.5-sunburst');
  ok('the <select> is BUILT from the list, stored model selected', /value="gpt-image-2.5-sunburst" selected/.test(api.openAiImageModelOptionsHtml()));
  ok('every legacy default is on the superseded list and no 2.5 model is', ['gpt-image-1', 'gpt-image-1-mini', 'gpt-image-2'].every(id => api.OPENAI_IMAGE_SUPERSEDED.includes(id)) && !api.OPENAI_IMAGE_SUPERSEDED.some(id => api.OPENAI_IMAGE_25_RE.test(id)));
});

await run('lift', () => {
  let api = build({ x_openai_image_model: 'gpt-image-1' });
  ok('a device carrying yesterday\'s default is lifted to Flare', api.store.x_openai_image_model === 'gpt-image-2.5-flare' && api.store.x_openai_image_gen === api.OPENAI_IMAGE_GEN);
  api = build({ x_openai_image_model: 'gpt-image-1', x_openai_image_gen: 'images25' });
  ok('a deliberate re-pick of a legacy model AFTER the lift sticks', api.store.x_openai_image_model === 'gpt-image-1');
  api = build({ x_openai_image_model: 'gpt-image-2.5-sunburst' });
  ok('a 2.5 pick is never touched by the lift', api.store.x_openai_image_model === 'gpt-image-2.5-sunburst');
});

await run('order', () => {
  const api = build();
  api.key = ''; api.gemini = true;
  ok('with nothing chosen and no key, the server leads and Gemini follows', api.imageEngineOrder().join() === 'imgServer,imgGemini', api.imageEngineOrder().join());
  api.key = 'sk-test';
  ok('a browser key sits BEHIND the server, ahead of Gemini', api.imageEngineOrder().join() === 'imgServer,imgKey,imgGemini', api.imageEngineOrder().join());
  api.store.x_ai_engine = 'gemini';
  ok('the TEXT engine has no say', api.imageEngineOrder()[0] === 'imgServer');
  api.store.x_ai_image_engine = 'gemini';
  ok('choosing the Gemini image model puts it first and keeps ChatGPT Images behind it', api.imageEngineOrder().join() === 'imgGemini,imgServer,imgKey', api.imageEngineOrder().join());
  api.store.x_ai_image_engine = 'nonsense';
  ok('an unreadable stored value is the default', api.aiImageEngineSetting() === 'openai');
  api.store.x_ai_image_engine = 'openai'; api.gemini = false;
  ok('no Gemini image model → no Gemini route, and the door still has ChatGPT Images', api.imageEngineOrder().join() === 'imgServer,imgKey');
  ok('imageEngineReady counts ChatGPT Images as an image model', api.imageEngineReady() === true);
  api.gemini = true;
  ok('skipOpenAi is Gemini and nothing else', api.imageEngineOrder({ skipOpenAi: true }).join() === 'imgGemini');
  ok('the label names ChatGPT Images and the model, and the Card Art name still answers', /ChatGPT Images · gpt-image-2\.5-flare/.test(api.imageEngineLabel()) && api._tcgArtEngineLabel() === api.imageEngineLabel());
});

await run('door', async () => {
  const api = build();
  api.key = 'sk-test'; api.gemini = true;
  let out = await api.generateImageDataUrl('a unit', {});
  ok('the server route answers first, on the 2.5 model', out === 'data:image/png;base64,U0VSVkVS' && api.last.route === 'imgServer' && api.serverCalls[0].payload.model === 'gpt-image-2.5-flare');
  api.resetDown(); api.serverMode = 'precondition';
  out = await api.generateImageDataUrl('a unit', {});
  ok('a server route that is not deployed hands over to the key in this browser', out === 'data:image/png;base64,S0VZ' && api.last.route === 'imgKey' && api.last.fellBack);
  ok('…and goes to the BACK of the order, never off it', api.imageEngineOrder().join() === 'imgKey,imgGemini,imgServer', api.imageEngineOrder().join());
  ok('the report says the function is not deployed yet', api.imageRouteReport().notes.some(n => /not switched on yet/.test(n)));
  api.resetDown(); api.serverMode = 'bad';
  await api.generateImageDataUrl('a unit', { size: '100x100' });
  ok('a refusal about ONE picture falls through without closing the route', api.last.route === 'imgKey' && !(api.down.imgServer > Date.now()));
  api.resetDown(); api.serverMode = 'precondition'; api.fetchMode = 'unauth';
  out = await api.generateImageDataUrl('a unit', {});
  ok('a refused browser key hands over to Gemini', out === 'data:image/png;base64,R0VNSU5J' && api.last.route === 'imgGemini' && api.down.imgKey > Date.now());
  api.resetDown(); api.geminiMode = 'fail';
  let err = null;
  try { await api.generateImageDataUrl('a unit', {}); } catch (e) { err = e; }
  ok('when EVERY route refuses the error names every route', err && /server key/.test(err.message) && /key in this browser/.test(err.message) && /Gemini image model/.test(err.message), err && err.message);
});

await run('request shape', async () => {
  const api = build();
  api.key = 'sk-test'; api.gemini = true; api.serverMode = 'precondition';
  await api.generateImageDataUrl('redraw', { refDataUrls: ['data:image/png;base64,QUJD', 'data:image/jpeg;base64,REVG'], transparent: true });
  const fd = api.fetchCalls[0].init.body;
  ok('a reference makes it an EDIT, as multipart', /\/images\/edits$/.test(api.fetchCalls[0].url) && typeof fd.getAll === 'function');
  ok('several references go up as image[]', fd.getAll('image[]').length === 2);
  ok('input_fidelity is high on every edit, and the edit keeps the reference\'s shape', fd.get('input_fidelity') === 'high' && fd.get('size') === 'auto');
  ok('transparent asks for a transparent background on png', fd.get('background') === 'transparent' && fd.get('output_format') === 'png');
  ok('the server was offered the same edit', api.serverCalls[0].payload.images.length === 2 && api.serverCalls[0].payload.inputFidelity === 'high' && api.serverCalls[0].payload.background === 'transparent');
  api.resetDown();
  await api.generateImageDataUrl('draw', { media: { mimeType: 'image/png', data: 'QUJD' } });
  ok('the { mimeType, data } shape every enhance path builds is a reference too', api.fetchCalls[0].init.body.getAll('image').length === 1);
  api.resetDown();
  await api.generateImageDataUrl('draw', { quality: 'xhigh' });
  const body = JSON.parse(api.fetchCalls[0].init.body);
  ok('a generation is JSON on /generations at 1024x1024 with xhigh passed through to a 2.5 model', /\/images\/generations$/.test(api.fetchCalls[0].url) && body.size === '1024x1024' && body.quality === 'xhigh');
  ok('xhigh on a legacy model becomes high', api._imgQualityFor('gpt-image-1', 'xhigh') === 'high');
  api.resetDown(); api.fetchMode = 'unsupported';
  await api.generateImageDataUrl('draw', { refDataUrl: 'data:image/png;base64,QUJD' });
  ok('an "unknown parameter" 400 is retried once with the bare minimum', api.fetchCalls.length === 2 && !api.fetchCalls[1].init.body.get('input_fidelity'));
  ok('an invalid-argument is a fault of the PICTURE, a 401 of the ROUTE', api._imgRouteFault({ code: 'functions/invalid-argument' }) === false && api._imgRouteFault({ status: 401 }) === true);
});

/* ---------- 🖼 the green box ---------- */
await run('badge', async () => {
  // A picture comes out whichever model drew it, so the ONE thing that tells
  // the teacher which one did is the box. It must name the ROUTE and the
  // MODEL, fire once per picture, and never fire on a failure.
  const api = build({});
  ok('the server route is described with its model and "server key"', api.imageEngineDescribe('imgServer', 'gpt-image-2.5-flare') === 'ChatGPT Images · gpt-image-2.5-flare · server key');
  ok('the browser-key route says the key is on this device', api.imageEngineDescribe('imgKey', 'gpt-image-2.5-sunburst') === 'ChatGPT Images · gpt-image-2.5-sunburst · key on this device');
  ok('the Gemini route is named Gemini with its model', api.imageEngineDescribe('imgGemini', 'gemini-3.5-flash-image') === 'Gemini · gemini-3.5-flash-image');
  ok('a route with no model recorded falls back to the chosen ChatGPT model, never a blank', api.imageEngineDescribe('imgServer', '') === 'ChatGPT Images · gpt-image-2.5-flare · server key' && api.imageEngineDescribe('imgGemini', '') === 'Gemini · image model');
  // The server answered: the box carries the model the SERVER reported.
  api.resetDown(); api.serverMode = 'ok';
  await api.generateImageDataUrl('draw a beaker');
  ok('a picture from the server raises the box', api.announced.length === 1 && /^🖼 Picture generated by ChatGPT Images · gpt-image-2\.5-flare · server key$/.test(api.announced[0]), api.announced.join(' | '));
  ok('the door records the model beside the route', api.last.route === 'imgServer' && api.last.model === 'gpt-image-2.5-flare' && api.last.engine === 'openai' && api.last.fellBack === false);
  ok('the box is on screen', api.badge() && api.badge().classList.contains('show') && api.badge().id === 'imgEngineBadge');
  // The same model again within the hold stacks a ×N rather than a second box.
  await api.generateImageDataUrl('draw a second beaker');
  ok('a repeat within the hold is ONE box with a count', api.announced.length === 2 && /server key ×2$/.test(api.announced[1]), api.announced.join(' | '));
  // The server refused and the browser key drew: the box says so, and says it fell back.
  api.announced.length = 0; api.resetDown(); api.serverMode = 'precondition'; api.key = 'sk-test'; api.fetchMode = 'ok';
  await api.generateImageDataUrl('draw a lever');
  ok('a picture from the browser key names the device route and the fallback', api.announced.length === 1 && /ChatGPT Images · gpt-image-2\.5-flare · key on this device \(after another route refused\)/.test(api.announced[0]), api.announced.join(' | '));
  ok('the fallback is recorded on the last call', api.last.route === 'imgKey' && api.last.fellBack === true && api.last.engine === 'openai');
  // Everything ChatGPT refused and Gemini drew.
  api.announced.length = 0; api.resetDown(); api.serverMode = 'precondition'; api.fetchMode = 'unauth'; api.gemini = true; api.geminiMode = 'ok';
  await api.generateImageDataUrl('draw a circuit');
  ok('a picture from Gemini is announced as Gemini', api.announced.length === 1 && /^🖼 Picture generated by Gemini · /.test(api.announced[0]) && /\(after another route refused\)$/.test(api.announced[0]), api.announced.join(' | '));
  ok('the engine on the last call is gemini', api.last.route === 'imgGemini' && api.last.engine === 'gemini');
  // Nothing drew: no box, and the failure names every route.
  api.announced.length = 0; api.resetDown(); api.serverMode = 'precondition'; api.fetchMode = 'unauth'; api.geminiMode = 'fail';
  let threw = false;
  try { await api.generateImageDataUrl('draw nothing'); } catch (e) { threw = true; }
  ok('a failure raises NO box', threw && api.announced.length === 0, api.announced.join(' | '));
  ok('a failure leaves no model on the record', api.last.route === '' && api.last.model === '' && api.last.engine === '');
  // The model a REFUSED route left behind never reaches the box for the route that answered.
  ok('the door clears the route model before every attempt', /_imgRouteModel = '';\s*\/\/ never let a route that REFUSED/.test(src));
  // The block's own wiring.
  ok('the server route records the model the server reported', /_imgRouteModel = \(typeof d\.model === 'string' && d\.model\) \? d\.model : model;/.test(src));
  ok('the browser-key route records the model it asked for', /_imgRouteModel = model; \/\/ the id this browser's key is about to ask for/.test(src));
  ok('the raw Gemini route records the id by its index in the list', /_imgRouteModel = AI_IMAGE_MODELS\[i\] \|\|/.test(src));
  ok('the box is its own element, not the bottom-centre toast', /el\.id = 'imgEngineBadge'/.test(src) && /#imgEngineBadge \{ position: fixed; right: 24px; bottom: 24px;/.test(src));
  ok('the box is a fixed green, never the theme primary', /#imgEngineBadge \{[^}]*background: #15803d;/.test(src) && !/#imgEngineBadge \{[^}]*var\(--primary\)/.test(src));
  ok('the box is held long enough to read a model id', /const IMG_BADGE_MS = 6500;/.test(src));
  ok('the box never prints', /@media print \{ #imgEngineBadge \{ display: none !important; \} \}/.test(src));
  ok('the dialog reports the last picture through the same describer', /imageEngineDescribe\(imageLastCall\.route, imageLastCall\.model\)/.test(src));
});

/* ---------- the census ---------- */
{
  const lines = src.split('\n');
  const callers = (re, allow) => lines.map((l, i) => ({ l, i })).filter(x => re.test(x.l) && !/^\s*(\/\/|\*|\/\*)/.test(x.l) && !/`[^`]*(geminiImageModels|generateImageDataUrlGemini)[^`]*`/.test(x.l) && !allow(x.l)).map(x => (x.i + 1) + ': ' + x.l.trim());
  const rawGemini = callers(/generateImageDataUrlGemini\(/, l => /^async function generateImageDataUrlGemini/.test(l.trim()) || /return generateImageDataUrlGemini\(prompt, _imgRefsFrom\(opts\)\)/.test(l));
  ok('generateImageDataUrlGemini is reached ONLY from inside the door', rawGemini.length === 0, rawGemini.join('\n       '));
  const rawKey = callers(/openAiGenerateImageDataUrl\(/, l => /^async function openAiGenerateImageDataUrl/.test(l.trim()) || /return openAiGenerateImageDataUrl\(prompt, opts\)/.test(l));
  ok('openAiGenerateImageDataUrl is reached ONLY from inside the door', rawKey.length === 0, rawKey.join('\n       '));
  const models = callers(/geminiImageModels/, l => /^(let|const) geminiImageModels/.test(l.trim()) || /geminiImageModels = AI_IMAGE_MODELS\.map/.test(l) || /const imageAiReady = /.test(l) || /return geminiImageModels\.length \? \['imgGemini'\]|!geminiImageModels\.length\) throw|for \(const model of geminiImageModels\)|for \(let i = 0; i < geminiImageModels\.length; i\+\+\)|const model = geminiImageModels\[i\];|function imageEngineReady/.test(l));
  ok('nothing reaches the Gemini image models except the raw route and the readiness checks', models.length === 0, models.join('\n       '));
  const at = src.indexOf('async function _tcgGenOnce');
  const tcg = src.slice(at, src.indexOf('\n}\n', at));
  ok('the Nova Protocol art generator goes through the door', /generateImageDataUrl\(prompt, \{ refDataUrl/.test(tcg) && !/openAiActive\(\)/.test(tcg));
  const ed = src.indexOf('async function askGeminiImageEdit');
  const edit = src.slice(ed, src.indexOf('\n}\n', ed));
  ok('askGeminiImageEdit is an adapter over the door', /await generateImageDataUrl\(prompt, \{ media:/.test(edit) && !/geminiImageModels/.test(edit));
  const en = src.indexOf('async function generateEnhancedImageDataUrl');
  const enh = src.slice(en, src.indexOf('\n}\n', en));
  ok('every enhance path goes through the door', /return await generateImageDataUrl\(prompt, \{ media: list \}\)/.test(enh));
  ok('the chat toggle no longer decides who draws', !/openAiActive\(\) \? 'ChatGPT · '/.test(src));
  ok('the callable is the function this repo deploys', /httpsCallable\(cloudFunctions, 'openAiImage'/.test(src));
  ok('the dialog offers the picture engine, ChatGPT Images checked', /name="aiImageEngineChoice" value="openai" checked/.test(src) && /name="aiImageEngineChoice" value="gemini"/.test(src));
  ok('the dropdown in the markup leads with Flare, selected', /<option value="gpt-image-2\.5-flare" selected>/.test(src) && /<option value="gpt-image-2\.5-sunburst">/.test(src));
  ok('the dropdown is rebuilt from the list when the dialog opens', /imgSel\.innerHTML = openAiImageModelOptionsHtml\(getOpenAiImageModel\(\)\);/.test(src));
  ok('the dialog saves the picture engine', /localStorage\.setItem\(AI_ENGINE_STORE\.imageEngine, imgEng\);/.test(src));
  ok('the store carries the two new slots', /imageEngine: 'sq_ai_image_engine', imageGen: 'sq_openai_image_gen'/.test(src));
  ok('no API key is committed', !/sk-[A-Za-z0-9]{20,}/.test(src) && !/sk-[A-Za-z0-9]{20,}/.test(fnsrc));
  ok('the version was bumped', /const APP_VERSION = "v1\.72\./.test(src));
}

/* ---------- the server ---------- */
{
  ok('the callable exists and carries the OpenAI secret', /export const openAiImage = onCall\(OPENAI_OPTS/.test(fnsrc));
  ok('the server\'s default is Flare', /const OPENAI_IMAGE_MODEL = "gpt-image-2\.5-flare";/.test(fnsrc));
  ok('the server counts on its OWN throttle fields', /day: "openAiImgDay", count: "openAiImgCount", last: "lastOpenAiImgAt"/.test(fnsrc) && /reserveBackupSlot\(auth\.uid, OPENAI_IMAGE_SLOT\)/.test(fnsrc));
  ok('a missing key is named as a deploy step', /openAiImage[\s\S]{0,1500}failed-precondition", "No OpenAI key is configured on the server\."/.test(fnsrc));
  ok('several references go up as image[], with input_fidelity', /refs\.length > 1 \? "image\[\]" : "image"/.test(fnsrc) && /fields\.input_fidelity = fidelity/.test(fnsrc));
  ok('xhigh and max are accepted', /const OPENAI_IMAGE_QUALITIES = \["low", "medium", "high", "xhigh", "max", "auto"\];/.test(fnsrc));
  // The pure validators, run for real.
  const helpers = section(fnsrc, 'const OPENAI_IMAGE_URL =', 'export const openAiImage');
  const H = new Function(`class HttpsError extends Error { constructor(code, msg) { super(msg); this.code = code; } }
    var FormData = globalThis.FormData, Blob = globalThis.Blob, Buffer = globalThis.Buffer;
    ` + helpers + `
    return { openAiImageSize, openAiImageChoice, openAiImageModelFor, OPENAI_IMAGE_MODEL_RE, openAiImageForm };`)();
  ok('a client naming a 2.5 model gets it', H.openAiImageModelFor('gpt-image-2.5-sunburst') === 'gpt-image-2.5-sunburst' && H.openAiImageModelFor('gpt-image-2.5-flare-2026-09-08') === 'gpt-image-2.5-flare-2026-09-08');
  ok('a client naming anything else gets Flare', H.openAiImageModelFor('gpt-image-1') === 'gpt-image-2.5-flare' && H.openAiImageModelFor('gpt-6-astra') === 'gpt-image-2.5-flare' && H.openAiImageModelFor('') === 'gpt-image-2.5-flare');
  ok('the standard sizes and auto pass', H.openAiImageSize('1024x1024') === '1024x1024' && H.openAiImageSize('auto') === 'auto' && H.openAiImageSize('') === '1024x1024' && H.openAiImageSize('1536x864') === '1536x864');
  const refuses = s => { try { H.openAiImageSize(s); return false; } catch (e) { return e.code === 'invalid-argument'; } };
  ok('a side not divisible by 16 is refused by name', refuses('100x100'));
  ok('an aspect ratio past 3:1 is refused', refuses('3200x512'));
  ok('a size above 3840x2160 is refused', refuses('4096x2304'));
  ok('a nonsense size is refused', refuses('big'));
  ok('a quality off the list is refused, and an empty one is the default', (() => { try { H.openAiImageChoice('ultra', ['low', 'high'], 'high', 'Q'); return false; } catch (e) { return e.code === 'invalid-argument' && H.openAiImageChoice('', ['low', 'high'], 'high', 'Q') === 'high'; } })());
  ok('transparent forces png', /if \(background === "transparent" && outputFormat === "jpeg"\) outputFormat = "png";/.test(fnsrc));
  const fd = H.openAiImageForm({ model: 'm', prompt: 'p', n: 1 }, [{ mimeType: 'image/png', data: 'QUJD' }, { mimeType: 'image/jpeg', data: 'REVG' }]);
  ok('the multipart form carries every reference', fd.getAll('image[]').length === 2 && fd.get('model') === 'm');
}

console.log(`image-engine tests: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
