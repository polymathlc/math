// Mock the real provider entry points; no API keys or paid calls are used.
import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import test from 'node:test';

const read = name => fs.readFileSync(new URL('../' + name, import.meta.url), 'utf8');
const app = read('index.html'), server = read('functions/index.js'), worker = read('rapid-import/functions/index.js');
function cut(source, from, to) {
  const a = source.indexOf(from), b = source.indexOf(to, a + from.length);
  assert.ok(a >= 0 && b > a, from);
  return source.slice(a, b);
}
const browserCore = cut(app, 'const AI_ENGINE_STORE =', '\n/* =====================================================================\n   🖼 THE IMAGE ENGINE');
const browserVision = cut(app, 'async function askGeminiVision(', '\nfunction extractInlineImage');
function browser({ saved = {}, signedIn = true, failures = {}, empty = [], direct = false, configDeferred } = {}) {
  const storage = new Map(Object.entries(saved)), calls = [], payloads = [];
  const context = vm.createContext({
    localStorage: { getItem: k => storage.get(k) || null, setItem: (k, v) => storage.set(k, v) },
    auth: { currentUser: signedIn ? { uid: 'pupil' } : null }, cloudFunctions: {},
    httpsCallable: (_, name) => async request => {
      const engine = name === 'askOpenAi' ? 'openai' : name === 'askKimi' ? 'kimi' : 'config';
      calls.push(engine); payloads.push({ engine, request });
      if (failures[engine]) throw new Error(failures[engine]);
      if (engine === 'config') return configDeferred ? await configDeferred : { data: { engine: 'openai', modelPolicyVersion: 'gpt-6.1-sol' } };
      return { data: { text: empty.includes(engine) ? '' : engine + ' answer' } };
    },
    fetch: async (url, options) => {
      const engine = url.includes('moonshot') ? 'kimi-direct' : 'openai-direct';
      calls.push(engine); const body = JSON.parse(options.body); payloads.push({ engine, request: body });
      if (failures[engine]) throw new Error(failures[engine]);
      return { ok: true, json: async () => ({ choices: [{ finish_reason: direct === 'truncated' ? 'length' : 'stop', message: { content: engine + ' answer' } }] }) };
    },
    geminiTextModels: [{ generateContent: async request => {
      calls.push('gemini'); payloads.push({ engine: 'gemini', request });
      if (failures.gemini) throw new Error(failures.gemini);
      return { response: { text: () => empty.includes('gemini') ? '' : 'gemini answer' } };
    } }],
    AI_TEXT_MODEL_NAMES: ['gemini-3.8-flash'], _thinkingConfigFor: (_, budget) => ({ thinkingLevel: budget < 0 ? 'high' : 'low' }),
    withAiRetry: run => run(), console: { warn() {} }, AbortSignal,
  });
  vm.runInContext(browserCore + browserVision + '\nglobalThis.api = { getAiEngine, getOpenAiModel, askGeminiVision, askOpenAI, askKimiEngine, syncAiEngineConfig, textEngineOrder };', context);
  return { api: context.api, calls, payloads, storage, context };
}

test('signed-in pupil with no browser key starts with GPT 6.1 Sol', async () => {
  const h = browser();
  assert.equal(h.api.getAiEngine(), 'openai');
  assert.equal(h.api.getOpenAiModel(), 'gpt-6.1-sol');
  assert.equal(await h.api.askGeminiVision('Read the picture', [{ mimeType: 'image/png', data: 'PICTURE' }]), 'openai answer');
  assert.deepEqual(h.calls, ['openai']);
  assert.equal(h.payloads[0].request.model, 'gpt-6.1-sol');
  assert.equal(h.payloads[0].request.reasoningEffort, 'low');
  assert.equal(h.payloads[0].request.media[0].data, 'PICTURE');
});
test('OpenAI failure automatically reaches Gemini', async () => {
  const h = browser({ failures: { openai: 'quota exceeded' } });
  assert.equal(await h.api.askGeminiVision('Work it out', []), 'gemini answer');
  assert.deepEqual(h.calls, ['openai', 'gemini']);
});
test('OpenAI and Gemini failures automatically reach Kimi', async () => {
  const h = browser({ failures: { openai: 'not deployed', gemini: 'quota exceeded' } });
  assert.equal(await h.api.askGeminiVision('Work it out', []), 'kimi answer');
  assert.deepEqual(h.calls, ['openai', 'gemini', 'kimi']);
});
test('empty responses activate both backups', async () => {
  const h = browser({ empty: ['openai', 'gemini'] });
  assert.equal(await h.api.askGeminiVision('Work it out', []), 'kimi answer');
});
test('all provider failures retain actionable provider names', async () => {
  const h = browser({ failures: { openai: 'missing key', gemini: 'busy', kimi: 'no credit' } });
  await assert.rejects(h.api.askGeminiVision('Work it out', []), /openai: missing key.*gemini: busy.*kimi: no credit/);
});
test('extended thinking uses the same Sol model with high effort', async () => {
  const h = browser(); await h.api.askGeminiVision('Check arithmetic', [], { thinkingBudget: -1 });
  assert.equal(h.payloads[0].request.model, 'gpt-6.1-sol');
  assert.equal(h.payloads[0].request.reasoningEffort, 'high');
});
test('none and minimal are normalised to the supported low effort', async () => {
  for (const reasoningEffort of ['none', 'minimal']) {
    const h = browser(); await h.api.askOpenAI('Calculate', [], { reasoningEffort });
    assert.equal(h.payloads[0].request.reasoningEffort, 'low');
  }
});
test('old defaults migrate once and later manual choices remain', () => {
  const h = browser({ saved: { sq_ai_engine: 'gemini', sq_openai_model: 'gpt-6-astra', sq_openai_model_gen: 'astra' } });
  assert.equal(h.api.getAiEngine(), 'openai'); assert.equal(h.api.getOpenAiModel(), 'gpt-6.1-sol');
  const manual = browser({ saved: { sq_ai_engine: 'gemini', sq_ai_engine_gen: 'sol61', sq_openai_model: 'gpt-6-astra', sq_openai_model_gen: 'sol61' } });
  assert.equal(manual.api.getAiEngine(), 'gemini'); assert.equal(manual.api.getOpenAiModel(), 'gpt-6-astra');
});
test('a delayed config response cannot apply the previous account’s preference', async () => {
  let resolve;
  const h = browser({ configDeferred: new Promise(r => { resolve = r; }) });
  const loading = h.api.syncAiEngineConfig();
  h.context.auth.currentUser = { uid: 'another-pupil' };
  resolve({ data: { engine: 'kimi', updatedBy: 'teacher' } });
  await loading;
  assert.equal(h.api.getAiEngine(), 'openai');
});
test('session memoisation keys include model, provider, account and options', async () => {
  const h = browser(), cache = new Map();
  h.context.sessionStorage = { getItem: key => cache.get(key) ?? null, setItem: (key, value) => cache.set(key, value) };
  let requests = 0;
  h.context.askGemini = async () => 'answer ' + (++requests);
  vm.runInContext(cut(app, 'function _aiHash(', '\nconst aiTextReady') + '\nglobalThis.cached = askGeminiCached;', h.context);
  assert.equal(await h.context.cached('Same prompt', { maxOutputTokens: 1000 }), 'answer 1');
  assert.equal(await h.context.cached('Same prompt', { maxOutputTokens: 1000 }), 'answer 1');
  h.storage.set('sq_openai_model', 'gpt-6-astra');
  assert.equal(await h.context.cached('Same prompt', { maxOutputTokens: 1000 }), 'answer 2');
  assert.equal(await h.context.cached('Same prompt', { maxOutputTokens: 2000 }), 'answer 3');
});
test('Gemini-only cross-check never silently compares the same OpenAI model', async () => {
  const h = browser(); await h.api.askGeminiVision('Independent check', [], { skipOpenAi: true });
  assert.deepEqual(h.calls, ['gemini']);
});
test('audio transcription stays on its audio-capable Gemini route', async () => {
  const h = browser(); await h.api.askGeminiVision('Transcribe', [{ mimeType: 'audio/wav', data: 'VOICE' }]);
  assert.deepEqual(h.calls, ['gemini']);
});
test('PDF attachments are preserved and never silently dropped by Kimi', async () => {
  const h = browser({ failures: { openai: 'failed', gemini: 'failed' } });
  await assert.rejects(h.api.askGeminiVision('Read pages', [{ mimeType: 'application/pdf', data: 'PAGES' }]), /Kimi accepts images/);
  assert.deepEqual(h.calls, ['openai', 'gemini']);
  assert.equal(h.payloads[0].request.media[0].data, 'PAGES');
});
test('direct OpenAI requests omit temperature and retain image/PDF content', async () => {
  const h = browser({ signedIn: false, saved: { sq_openai_key: 'test-key' } });
  await h.api.askOpenAI('Read it', [{ mimeType: 'image/png', data: 'IMAGE' }, { mimeType: 'application/pdf', data: 'PDF' }], { temperature: 0.2, json: true });
  const body = h.payloads[0].request;
  assert.equal(body.model, 'gpt-6.1-sol'); assert.equal(body.reasoning_effort, 'low');
  assert.equal('temperature' in body, false); assert.ok(body.max_completion_tokens >= 4096);
  assert.equal(body.messages[0].content[1].type, 'image_url'); assert.equal(body.messages[0].content[2].type, 'file');
  assert.equal(body.messages[0].content.at(-1).text, 'Reply with JSON only.');
});
test('truncated OpenAI output activates fallback rather than returning partial answers', async () => {
  const h = browser({ signedIn: false, direct: 'truncated', saved: { sq_openai_key: 'test-key' } });
  assert.equal(await h.api.askGeminiVision('Work it out', []), 'gemini answer');
});
test('Kimi K3 vision and thinking requests use its supported reasoning schema', async () => {
  const h = browser({ signedIn: false, saved: { sq_kimi_key: 'test-key' } });
  await h.api.askKimiEngine('Read the image', [{ mimeType: 'image/png', data: 'IMAGE' }], { temperature: 0.2, thinkingBudget: -1 });
  const body = h.payloads[0].request;
  assert.equal(body.model, 'kimi-k3'); assert.equal(body.reasoning_effort, 'high');
  assert.ok(body.max_completion_tokens >= 4096);
  for (const unsupported of ['max_tokens', 'temperature', 'top_p', 'thinking']) assert.equal(unsupported in body, false);
  assert.equal(body.messages[0].content[1].image_url.url, 'data:image/png;base64,IMAGE');
});
test('deliberately selected legacy Kimi models retain their compatible request shape', async () => {
  const h = browser({ signedIn: false, saved: { sq_kimi_key: 'test-key', sq_kimi_model: 'moonshot-v1-8k' } });
  await h.api.askKimiEngine('Compute', [], { temperature: 0.2 });
  const body = h.payloads[0].request;
  assert.equal(body.model, 'moonshot-v1-8k'); assert.equal(body.temperature, 0.2);
  assert.equal(body.max_tokens, 1024); assert.equal('max_completion_tokens' in body, false);
});

function backend({ configured = ['openai', 'gemini', 'kimi'], failed = [], preference = {}, elapsed = {} } = {}) {
  const calls = [], payloads = [], options = {};
  let clock = 10000;
  const context = vm.createContext({
    OPENAI_MODEL: 'gpt-6.1-sol', OPENAI_REASONING_RE: /^(gpt-[5-9]|o[1-9])/,
    OPENAI_MAX_OUTPUT: 32000, OPENAI_URL: 'https://api.openai.com/v1/chat/completions',
    KIMI_MODEL: 'kimi-k3', KIMI_MODEL_RE: /^(kimi|moonshot)[A-Za-z0-9._-]*$/, KIMI_SLOT: {}, KIMI_MAX_OUTPUT: 32000, KIMI_URL: 'https://api.moonshot.ai/v1/chat/completions',
    OPENAI_API_KEY: { value: () => configured.includes('openai') ? 'test-key' : '' },
    MOONSHOT_API_KEY: { value: () => configured.includes('kimi') ? 'test-key' : '' },
    AI_TEXT_MODELS: ['gemini-3.8-flash', 'gemini-2.5-flash'], thinkingConfigFor: () => ({ thinkingLevel: 'low' }),
    GoogleGenAI: class { models = { generateContent: async request => {
      calls.push('gemini'); payloads.push({ engine: 'gemini', request });
      clock += elapsed.gemini || 0;
      if (failed.includes('gemini')) throw new Error('gemini failed'); return { text: 'gemini answer' };
    } }; }, withAiRetry: run => run(),
    db: { doc: () => ({ get: async () => ({ exists: true, data: () => preference }) }) },
    fetch: async (url, request) => {
      const engine = url.includes('moonshot') ? 'kimi' : 'openai';
      calls.push(engine); payloads.push({ engine, request: JSON.parse(request.body) });
      clock += elapsed[engine] || 0;
      if (failed.includes(engine)) return { ok: false, status: 429, json: async () => ({}) };
      return { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: engine + ' answer' } }] }) };
    },
    OPENAI_OPTS: {}, KIMI_OPTS: {}, onCall: (opts, fn) => { options.callable = opts; return fn; },
    requireAuth: r => r.auth, isAdminAuth: a => a.token.admin === true,
    cleanText: x => String(x || ''), reserveOpenAiSlot: async () => {}, reserveBackupSlot: async () => {}, MAX_IMAGE_B64: 9500000, MAX_TOTAL_B64: 14000000,
    HttpsError: class extends Error { constructor(code, message) { super(message); this.code = code; } },
    AbortSignal, setTimeout, clearTimeout, Date: { now: () => clock }, console: { warn() {} },
  });
  const helper = cut(server, 'async function askGeminiOnly(', '\nfunction parseAIJson(raw)');
  const callable = cut(server, 'export const askOpenAi =', '\n// =====================================================================').replace('export const', 'const');
  const kimiCallable = cut(server, 'export const askKimi =', '\n// =====================================================================').replace('export const', 'const');
  vm.runInContext(helper + callable + kimiCallable + '\nglobalThis.api = { askGemini, askOpenAi, askKimi, effectiveAiEngine };', context);
  return { api: context.api, calls, payloads, options, get elapsed() { return clock - 10000; } };
}
test('server marking uses OpenAI first and reaches Kimi after Gemini failure', async () => {
  const h = backend({ failed: ['openai', 'gemini'] });
  assert.equal(await h.api.askGemini('gemini-key', 'Mark JSON', [{ mimeType: 'image/png', data: 'WORKING' }]), 'kimi answer');
  assert.deepEqual(h.calls, ['openai', 'gemini', 'gemini', 'kimi']);
  const body = h.payloads.at(-1).request;
  assert.equal(body.reasoning_effort, 'low'); assert.ok(body.max_completion_tokens >= 4096);
  assert.equal('max_tokens' in body, false); assert.equal('temperature' in body, false);
});
test('missing OpenAI server secret still permits Gemini marking', async () => {
  const h = backend({ configured: ['gemini'] });
  assert.equal(await h.api.askGemini('gemini-key', 'Mark JSON', []), 'gemini answer');
  assert.deepEqual(h.calls, ['gemini']);
});
test('implicit Gemini config migrates while deliberate teacher overrides remain', () => {
  const h = backend(); assert.equal(h.api.effectiveAiEngine({ engine: 'gemini' }), 'openai');
  assert.equal(h.api.effectiveAiEngine({ engine: 'gemini', updatedBy: 'teacher' }), 'gemini');
});
test('shared OpenAI callable honours validated teacher model/effort overrides', async () => {
  const h = backend();
  await h.api.askOpenAi({ auth: { uid: 'teacher', token: { admin: true } }, data: { prompt: 'Compute', model: 'gpt-6-astra', reasoningEffort: 'high', temperature: 0.1 } });
  const body = h.payloads[0].request; assert.equal(body.model, 'gpt-6-astra'); assert.equal(body.reasoning_effort, 'high'); assert.equal('temperature' in body, false);
});
test('pupils cannot choose a different billed model and explicit total budget stays exact', async () => {
  const h = backend();
  await h.api.askOpenAi({ auth: { uid: 'pupil', token: {} }, data: { prompt: 'Compute', model: 'gpt-6-astra', reasoningEffort: 'minimal', maxOutputTokens: 8000, exactOutputBudget: true } });
  const body = h.payloads[0].request; assert.equal(body.model, 'gpt-6.1-sol'); assert.equal(body.reasoning_effort, 'low'); assert.equal(body.max_completion_tokens, 8000);
});
test('any signed-in caller may ask for the cheaper light model, and nothing dearer', async () => {
  const h = backend();
  await h.api.askOpenAi({ auth: { uid: 'pupil', token: {} }, data: { prompt: 'Pick a topic', model: 'gpt-6-luna', temperature: 0.2 } });
  const body = h.payloads[0].request;
  assert.equal(body.model, 'gpt-6-luna'); assert.equal(body.reasoning_effort, 'low'); assert.equal('temperature' in body, false);
  await h.api.askOpenAi({ auth: { uid: 'pupil', token: {} }, data: { prompt: 'Compute', model: 'gpt-6-astra' } });
  assert.equal(h.payloads[1].request.model, 'gpt-6.1-sol');
  await h.api.askOpenAi({ auth: { uid: 'teacher', token: { admin: true } }, data: { prompt: 'Fix grammar', model: 'gpt-6-luna' } });
  assert.equal(h.payloads[2].request.model, 'gpt-6-luna');
});
test('shared Kimi K3 callable rejects unsupported sampling knobs and normalises effort', async () => {
  const h = backend();
  await h.api.askKimi({ auth: { uid: 'pupil', token: {} }, data: { prompt: 'Compute', reasoningEffort: 'minimal', temperature: 0.2, top_p: 0.4, thinking: { type: 'disabled' } } });
  const body = h.payloads[0].request;
  assert.equal(body.model, 'kimi-k3'); assert.equal(body.reasoning_effort, 'low'); assert.ok(body.max_completion_tokens >= 4096);
  for (const unsupported of ['max_tokens', 'temperature', 'top_p', 'thinking']) assert.equal(unsupported in body, false);
});
test('Kimi respects an explicit total completion budget', async () => {
  const h = backend();
  await h.api.askKimi({ auth: { uid: 'pupil', token: {} }, data: { prompt: 'Compute', maxOutputTokens: 8000, exactOutputBudget: true } });
  assert.equal(h.payloads[0].request.max_completion_tokens, 8000);
});
test('slow OpenAI and Gemini attempts still reserve time for Kimi', async () => {
  const h = backend({ failed: ['openai', 'gemini'], elapsed: { openai: 60000, gemini: 30000, kimi: 60000 } });
  assert.equal(await h.api.askGemini('key', 'Mark JSON', []), 'kimi answer');
  assert.deepEqual(h.calls, ['openai', 'gemini', 'gemini', 'kimi']);
  assert.ok(h.elapsed <= 210000);
  for (const request of h.payloads.filter(p => p.engine === 'gemini')) assert.ok(request.request.config.httpOptions.timeout <= 15000);
});
test('an exhausted chain deadline starts no further billable provider request', async () => {
  const h = backend();
  await assert.rejects(h.api.askGemini('key', 'Mark JSON', [], { deadline: 9999 }), /deadline exceeded/);
  assert.deepEqual(h.calls, []);
});

test('online worker uses GPT 6.1 Sol and has three-provider image fallback', async () => {
  const calls = [], payloads = [];
  const context = vm.createContext({
    openaiKey: { value: () => 'test' }, kimiKey: { value: () => 'test' }, key: { value: () => 'test' },
    openaiModel: { value: () => 'gpt-6.1-sol' }, model: { value: () => 'gemini-2.5-flash' }, AbortSignal,
    fetch: async (url, options) => { const provider = url.includes('moonshot') ? 'kimi' : 'openai'; calls.push(provider); payloads.push(JSON.parse(options.body)); return provider === 'openai' ? { ok: false, status: 429 } : { ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: '{"answer":3}' } }] }) }; },
    GoogleGenAI: class { models = { generateContent: async () => { calls.push('gemini'); throw new Error('busy'); } }; },
  });
  vm.runInContext(cut(worker, 'async function ask(', '\nasync function checkQuestion(') + '\nglobalThis.ask = ask;', context);
  const result = await context.ask('Read the figure', ['IMAGE'], {});
  assert.deepEqual(calls, ['openai', 'gemini', 'kimi']); assert.equal(result.text, '{"answer":3}');
  assert.equal(payloads[0].model, 'gpt-6.1-sol'); assert.equal(payloads[0].reasoning_effort, 'medium');
  assert.equal(payloads[1].messages[0].content[1].image_url.url, 'data:image/jpeg;base64,IMAGE');
  assert.equal(payloads[1].reasoning_effort, 'high'); assert.equal(payloads[1].max_completion_tokens, 24000);
  assert.equal('max_tokens' in payloads[1], false); assert.equal('temperature' in payloads[1], false);
});

// =====================================================================
// 🩺 WHY THE AI SAID NO + 🧑‍🏫 STAFF ARE NOT PUPILS (v1.109.0)
// ---------------------------------------------------------------------
// The day these were written, ⚡ Rapid add filled vetting with red cards
// saying "try a clearer screenshot" while the real reasons were: the
// teacher's own account had used the pupils' 120-a-day ChatGPT allowance,
// Gemini's prepaid credits were empty, and Kimi's server key was never set.
// Every failure below is SILENT: the card still appears, it just says the
// wrong thing, or the teacher is throttled like a pupil.
// =====================================================================
const SCREENSHOT_FAILURE = "openai: The backup AI's daily limit for this account has been reached — it will reset tomorrow. | gemini: AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/mathgen--app/models/gemini-2.5-flash:generateContent: [429 ] Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing. Learn more at https://ai.google.dev/gemini-api/docs/billing#prepay. (AI/fetch-error) | kimi: No Kimi key is configured on the server.";
const htmlEscape = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('the exact failure from the report reads as an OUTAGE, engine by engine', () => {
  const h = browser();
  const report = h.context.aiFailureReport(new Error(SCREENSHOT_FAILURE));
  assert.equal(report.outage, true, 'three empty accounts were blamed on the screenshot');
  assert.deepEqual(JSON.parse(JSON.stringify(report.engines.map(e => [e.engine, e.kind]))), [['openai', 'daily-cap'], ['gemini', 'billing'], ['kimi', 'not-configured']]);
  assert.match(report.engines[1].fix, /AI Studio/);
  assert.match(report.engines[2].fix, /MOONSHOT_API_KEY/);
  assert.match(report.engines[0].fix, /midnight, Singapore time/);
  assert.match(report.sentence, /No AI engine could answer/);
  assert.doesNotMatch(report.sentence, /clearer/);
  assert.equal(report.retryable, true);
});
test('a prepay 429 is BILLING, a bare 429 is BUSY — order matters', () => {
  const h = browser();
  assert.equal(h.context.aiFaultKind('[429] Your prepayment credits are depleted.'), 'billing');
  assert.equal(h.context.aiFaultKind('You exceeded your current quota, please check your plan and billing details.'), 'billing');
  assert.equal(h.context.aiFaultKind('[429] Too Many Requests'), 'busy');
  assert.equal(h.context.aiFaultKind('One request at a time — give it a couple of seconds.'), 'busy');
  assert.equal(h.context.aiFaultKind('Failed to fetch'), 'network');
  assert.equal(h.context.aiFaultKind('Incorrect API key provided: sk-…'), 'key-refused');
  assert.equal(h.context.aiFaultKind('Kimi accepts images; PDFs and audio need another provider.'), 'unsupported');
  assert.equal(h.context.aiFaultKind('OpenAI returned an incomplete or empty response.'), 'unreadable');
});
test('structured details beat the wording: a server refusal reason decides the kind', () => {
  const h = browser();
  assert.equal(h.context.aiFaultKind('anything at all', 'functions/resource-exhausted', { reason: 'daily-cap' }), 'daily-cap');
  assert.equal(h.context.aiFaultKind('anything at all', 'functions/resource-exhausted', { reason: 'interval' }), 'busy');
  assert.equal(h.context.aiFaultKind('anything at all', 'functions/failed-precondition'), 'not-configured');
});
test('one engine that LOOKED and could not read keeps the input in question', () => {
  const h = browser();
  const report = h.context.aiFailureReport(new Error('openai: OpenAI returned an incomplete or empty response. | gemini: [429] Your prepayment credits are depleted. | kimi: No Kimi key is configured on the server.'));
  assert.equal(report.outage, false);
  assert.equal(report.headline, 'The AI could not read this');
});
test('a single plain failure with no engine prefix still classifies', () => {
  const h = browser();
  const unreadable = h.context.aiFailureReport(new Error('the AI could not read a question out of that'));
  assert.equal(unreadable.outage, false);
  const offline = h.context.aiFailureReport(new Error('Failed to fetch'));
  assert.equal(offline.outage, true);
});
test('runTextEngines hangs the failures on its error IN PIECES, with code and details', async () => {
  const h = browser({ failures: { openai: "ChatGPT: this account's daily limit (120 calls) has been reached — it resets at midnight, Singapore time.", gemini: '[429] Your prepayment credits are depleted.', kimi: 'No Kimi key is configured on the server.' } });
  const err = await h.api.askGeminiVision('Read', []).then(() => null, e => e);
  assert.ok(err, 'the chain did not fail');
  assert.deepEqual(JSON.parse(JSON.stringify(err.engineFailures.map(f => f.engine))), ['openai', 'gemini', 'kimi']);
  // The sentence form is unchanged, so every caller written against it still reads it.
  assert.match(err.message, /openai: .*\| gemini: .*\| kimi: /);
  assert.equal(h.context.aiFailureReport(err).outage, true);
});
test('a failure wrapped on its way to the card still reads as the engines (PDF "Stopped at page")', () => {
  const h = browser();
  const inner = new Error(SCREENSHOT_FAILURE);
  const outer = new Error('Stopped at page 3 of 40. The incomplete question has not been published.', { cause: inner });
  const report = h.context.aiFailureReport(outer);
  assert.equal(report.outage, true);
  assert.equal(report.engines.length, 3);
  assert.match(report.raw, /Stopped at page 3/);
});
test('aiErrorMessage no longer calls three empty accounts "busy right now"', () => {
  const h = browser();
  vm.runInContext(cut(app, 'const AI_NOT_TRANSIENT_RE', '\n// A "model not found') + cut(app, 'function aiErrorMessage(e)', '\nasync function askGeminiVision(') + '\nglobalThis.aiErrorMessage = aiErrorMessage; globalThis.isTransientAiError = isTransientAiError;', h.context);
  const msg = h.context.aiErrorMessage(new Error(SCREENSHOT_FAILURE));
  assert.doesNotMatch(msg, /busy right now/);
  assert.match(msg, /No AI engine could answer/);
  // …and a lone network error keeps its old, specific wording.
  assert.match(h.context.aiErrorMessage(new Error('Failed to fetch')), /network problem/);
});
test('an account that is OUT is not retried as if it were busy', () => {
  const h = browser();
  vm.runInContext(cut(app, 'const AI_NOT_TRANSIENT_RE', '\n// A "model not found') + '\nglobalThis.isTransientAiError = isTransientAiError;', h.context);
  assert.equal(h.context.isTransientAiError(new Error('[429] Your prepayment credits are depleted.')), false);
  assert.equal(h.context.isTransientAiError(new Error("ChatGPT: this account's daily limit (120 calls) has been reached")), false);
  assert.equal(h.context.isTransientAiError(new Error('[429] Too Many Requests')), true);
  assert.equal(h.context.isTransientAiError(new Error('Failed to fetch')), true);
  // The server's copy is word for word the page's.
  const pageRe = /const AI_NOT_TRANSIENT_RE = (\/.*\/);/.exec(app)[1];
  const serverRe = /const AI_NOT_TRANSIENT_RE = (\/.*\/);/.exec(server)[1];
  assert.equal(serverRe, pageRe, 'the page and the server disagree about what is transient');
});
test('the breakdown renders every engine, escaped, with its fix and the raw text tucked away', () => {
  const h = browser();
  h.context.escapeHtml = htmlEscape;
  const html = h.context.aiFailureHtml(h.context.aiFailureReport(new Error(SCREENSHOT_FAILURE + ' <img src=x onerror=alert(1)>')));
  assert.equal((html.match(/class="ai-fault-row"/g) || []).length, 3);
  assert.match(html, /ChatGPT/); assert.match(html, /Gemini/); assert.match(html, /Kimi/);
  assert.match(html, /<details class="ai-fault-raw">/);
  assert.doesNotMatch(html, /<img src=x/, 'raw provider text reached the page unescaped');
});
test('the server one-call-at-a-time refusal is WAITED OUT, not counted as ChatGPT failing', async () => {
  const failures = { openai: 'One request at a time — give it a couple of seconds.' };
  const h = browser({ failures });
  let waits = 0;
  h.context.setTimeout = fn => { waits++; delete failures.openai; fn(); return 0; };
  assert.equal(await h.api.askGeminiVision('Read the page', [{ mimeType: 'image/png', data: 'PAGE' }]), 'openai answer');
  assert.deepEqual(h.calls, ['openai', 'openai'], 'the refused call fell to Gemini instead of waiting');
  assert.equal(waits, 1);
});
test('the wait is bounded — a refusal that never clears still reaches the next engine', async () => {
  const h = browser({ failures: { openai: 'One request at a time — give it a couple of seconds.' } });
  h.context.setTimeout = fn => { fn(); return 0; };
  assert.equal(await h.api.askGeminiVision('Read', []), 'gemini answer');
  assert.equal(h.calls.filter(c => c === 'openai').length, 1 + 3, 'AI_INTERVAL_RETRIES is not what bounds the wait');
});
test('a daily-cap refusal is NOT waited out — it goes straight to the next engine', async () => {
  const h = browser({ failures: { openai: "ChatGPT: this account's daily limit (120 calls) has been reached — it resets at midnight, Singapore time." } });
  let waits = 0; h.context.setTimeout = fn => { waits++; fn(); return 0; };
  assert.equal(await h.api.askGeminiVision('Read', []), 'gemini answer');
  assert.equal(waits, 0);
});

// ── the server's allowance ────────────────────────────────────────────
function allowance({ start = Date.parse('2026-10-25T10:00:00Z') } = {}) {
  const store = new Map();
  let now = start;
  const context = vm.createContext({
    ADMIN_EMAILS: ['chungzhikai@gmail.com', 'abigail.yew@stanfordmanpower.com'], EMPLOYEE_EMAILS: ['pkeertana21@gmail.com'],
    HttpsError: class extends Error { constructor(code, message, details) { super(message); this.code = code; this.details = details; } },
    statsRef: uid => uid,
    db: { runTransaction: async fn => fn({
      get: async uid => ({ exists: store.has(uid), data: () => ({ ...store.get(uid) }) }),
      set: (uid, data) => store.set(uid, { ...(store.get(uid) || {}), ...data })
    }) },
    Date: class extends Date { constructor(...a) { super(...(a.length ? a : [now])); } static now() { return now; } },
    MIN_OPENAI_INTERVAL_MS: 1500, DAILY_OPENAI_CAP: 120, DAILY_OPENAI_STAFF_CAP: 3000,
    Number, Math, String
  });
  vm.runInContext(cut(server, 'const BACKUP_DAY_OFFSET_MS', '\nconst OPENAI_SLOT = {') + '\n' + cut(server, 'const OPENAI_SLOT = {', '\nfunction reserveOpenAiSlot') + '\nglobalThis.api = { reserveBackupSlot, backupAllowance, isStaffAuth, backupDayKey, backupDayResetsAt, OPENAI_SLOT };', context);
  return { api: context.api, store, tick: ms => { now += ms; }, set: t => { now = t; } };
}
const PUPIL = { uid: 'pupil', token: { email: 'kid@example.com', email_verified: true } };
const TEACHER = { uid: 'teacher', token: { admin: true, email: 'chungzhikai@gmail.com', email_verified: true } };
const TEACHER_NO_CLAIM = { uid: 'teacher', token: { email: 'chungzhikai@gmail.com', email_verified: true } };
const EMPLOYEE = { uid: 'emp', token: { employee: true } };
const SPOOF = { uid: 'spoof', token: { email: 'chungzhikai@gmail.com', email_verified: false } };

test('the teacher is staff by claim AND by verified address; an unverified address is a pupil', () => {
  const a = allowance().api;
  assert.equal(a.isStaffAuth(TEACHER), true);
  assert.equal(a.isStaffAuth(TEACHER_NO_CLAIM), true, 'a teacher whose claim was never granted is throttled like a pupil');
  assert.equal(a.isStaffAuth(EMPLOYEE), true);
  assert.equal(a.isStaffAuth(PUPIL), false);
  assert.equal(a.isStaffAuth(SPOOF), false, 'an unverified copy of the teacher\'s address got the staff allowance');
  assert.equal(a.isStaffAuth(undefined), false);
});
test('pupils keep 120 a day and the gap; staff get their own allowance and no gap', () => {
  const a = allowance().api;
  assert.deepEqual({ ...a.backupAllowance(a.OPENAI_SLOT, PUPIL) }, { staff: false, cap: 120, interval: 1500 });
  assert.deepEqual({ ...a.backupAllowance(a.OPENAI_SLOT, TEACHER) }, { staff: true, cap: 3000, interval: 0 });
  assert.deepEqual({ ...a.backupAllowance(a.OPENAI_SLOT, undefined) }, { staff: false, cap: 120, interval: 1500 }, 'no auth must fail SAFE, as a pupil');
});
test('two of the teacher\'s calls in the same instant both go through (two PDF pages in parallel)', async () => {
  const h = allowance();
  await h.api.reserveBackupSlot('teacher', h.api.OPENAI_SLOT, TEACHER);
  await h.api.reserveBackupSlot('teacher', h.api.OPENAI_SLOT, TEACHER);
  assert.equal(h.store.get('teacher').openAiCount, 2);
});
test('a pupil\'s second call inside the gap is refused WITH a reason the page can act on', async () => {
  const h = allowance();
  await h.api.reserveBackupSlot('pupil', h.api.OPENAI_SLOT, PUPIL);
  h.tick(400);
  const err = await h.api.reserveBackupSlot('pupil', h.api.OPENAI_SLOT, PUPIL).then(() => null, e => e);
  assert.equal(err.code, 'resource-exhausted');
  assert.equal(err.details.reason, 'interval');
  assert.equal(err.details.retryAfterMs, 1100);
});
test('the 121st pupil call is refused; the teacher\'s 121st is not', async () => {
  const h = allowance();
  h.store.set('pupil', { openAiDay: '2026-10-25', openAiCount: 120, lastOpenAiAt: 0 });
  h.store.set('teacher', { openAiDay: '2026-10-25', openAiCount: 120, lastOpenAiAt: 0 });
  const err = await h.api.reserveBackupSlot('pupil', h.api.OPENAI_SLOT, PUPIL).then(() => null, e => e);
  assert.equal(err.details.reason, 'daily-cap');
  assert.equal(err.details.cap, 120);
  assert.match(err.message, /^ChatGPT: .*daily limit \(120 calls\).*midnight, Singapore time/);
  assert.equal(await h.api.reserveBackupSlot('teacher', h.api.OPENAI_SLOT, TEACHER), 121);
});
test('the staff cap still holds — a runaway loop is bounded', async () => {
  const h = allowance();
  h.store.set('teacher', { openAiDay: '2026-10-25', openAiCount: 3000, lastOpenAiAt: 0 });
  const err = await h.api.reserveBackupSlot('teacher', h.api.OPENAI_SLOT, TEACHER).then(() => null, e => e);
  assert.equal(err.details.reason, 'daily-cap'); assert.equal(err.details.staff, true); assert.equal(err.details.cap, 3000);
});
test('the day is SINGAPORE\'S: it turns over at midnight here, not 8 am', async () => {
  const h = allowance();
  assert.equal(h.api.backupDayKey(Date.parse('2026-10-25T15:59:59Z')), '2026-10-25');   // 23:59:59 SGT
  assert.equal(h.api.backupDayKey(Date.parse('2026-10-25T16:00:00Z')), '2026-10-26');   // 00:00 SGT
  assert.equal(h.api.backupDayResetsAt(Date.parse('2026-10-25T10:21:00Z')), '2026-10-25T16:00:00.000Z');
  // A pupil capped yesterday (Singapore) has a fresh allowance at 00:30 SGT, before 8 am.
  h.store.set('pupil', { openAiDay: '2026-10-25', openAiCount: 120, lastOpenAiAt: 0 });
  h.set(Date.parse('2026-10-25T16:30:00Z'));
  assert.equal(await h.api.reserveBackupSlot('pupil', h.api.OPENAI_SLOT, PUPIL), 1);
  assert.equal(h.store.get('pupil').openAiDay, '2026-10-26');
});
test('every throttled callable passes the CALLER to the throttle', () => {
  for (const site of ['reserveOpenAiSlot(auth.uid, auth)', 'reserveBackupSlot(auth.uid, KIMI_SLOT, auth)', 'reserveBackupSlot(auth.uid, OPENAI_IMAGE_SLOT, auth)', 'reserveBackupSlot(auth.uid, CHART_APP_SLOT, auth)']) {
    assert.ok(server.includes(site), site + ' is missing — that door throttles the teacher like a pupil');
  }
  assert.equal((server.match(/reserveBackupSlot\(auth\.uid, [A-Z_]+\)/g) || []).length, 0, 'a call site still omits the caller');
});
test('the backup engines still count on SEPARATE fields, and staff never get less than pupils', () => {
  const slots = {};
  for (const name of ['OPENAI_SLOT', 'KIMI_SLOT', 'OPENAI_IMAGE_SLOT', 'CHART_APP_SLOT']) {
    const m = new RegExp('const ' + name + ' = \\{([\\s\\S]*?)\\};').exec(server);
    assert.ok(m, name + ' not found');
    const field = k => (new RegExp(k + ': "([^"]+)"').exec(m[1]) || [])[1];
    slots[name] = [field('day'), field('count'), field('last')];
    assert.ok(/label: "/.test(m[1]), name + ' has no label — its refusal would not say which engine refused');
  }
  const all = Object.values(slots).flat();
  assert.equal(new Set(all).size, all.length, 'two backup engines share a counter field');
  const num = n => Number((new RegExp('const ' + n + ' = (\\d+);').exec(server) || [])[1]);
  assert.ok(num('DAILY_OPENAI_STAFF_CAP') >= num('DAILY_OPENAI_CAP'));
  assert.ok(num('DAILY_KIMI_STAFF_CAP') >= num('DAILY_KIMI_CAP'));
  assert.ok(num('DAILY_OPENAI_IMAGE_STAFF_CAP') >= num('DAILY_OPENAI_IMAGE_CAP'));
});
