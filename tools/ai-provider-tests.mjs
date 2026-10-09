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
