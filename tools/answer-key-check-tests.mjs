// Regression tests for the 🔍 ANSWER KEY CROSS-CHECK — two engines, at once.
// Run with:
//     node tools/answer-key-check-tests.mjs            all cases
//     node tools/answer-key-check-tests.mjs <name>     one case
//
// It loads the REAL comparison block out of index.html and runs it against a
// shimmed page. The models are the easy part; the dangerous part is the plain
// code that turns two answers into advice, because every way it breaks looks
// exactly like a working report:
//
//  • "DO THESE TWO AGREE" MUST BE A TEACHER'S ANSWER. Too loose ("24 m" vs
//    "24 cm" scored equal) and every row comes back green — the feature then
//    quietly certifies wrong keys, which is worse than not running it. Too
//    tight ("24" vs "24 m" scored different) and every row is amber, which is
//    a report nobody reads.
//  • THE DIRECTION MUST BE RIGHT. "Both engines disagree with your key" and
//    "both agree" are the same three strings compared two ways round. Reverse
//    it and the advice is confidently backwards.
//  • BOTH ENGINES MUST GET THE SAME PROMPT, AND THE GEMINI CALL MUST ACTUALLY
//    BE GEMINI. askGeminiVision routes through ChatGPT when the sidebar toggle
//    says so, so without skipOpenAi the two columns are the same model twice —
//    they would then agree with each other constantly and the whole
//    cross-check means nothing.
//  • THE WINDOW MUST NOT INVENT QUESTIONS. An undated question has no date to
//    place in "the past 24 hours"; letting it in makes the count on the button
//    disagree with what gets checked.
import fs from 'fs';

const PAGE = new URL('../index.html', import.meta.url).pathname;
const src = fs.readFileSync(PAGE, 'utf8');

const cut = (from, to, what) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(what + ': "' + from + '" not found in index.html');
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error(what + ': end marker not found');
  return src.slice(a, b);
};

// Everything the block reaches out to, and nothing else.
const FIXTURE = `
const escapeHtml = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const stripHtml = s => String(s == null ? "" : s).replace(/<[^>]*>/g, "").trim();
const mcqLabel = i => (i + 1) + ")";
function wsHasMcq(q) { return Array.isArray(q && q.options) && q.options.length >= 2; }
function questionTopics(q) { return (q && q.topics) || []; }
function adminTopicsLabel(q) { return (questionTopics(q) || []).join(", "); }
function aiErrorMessage(e) { return String((e && e.message) || e || ""); }
function parseAIJson(s) { return JSON.parse(s); }
function toast() {}
function confirm() { return true; }
function canManageQuestions() { return true; }
function closeOverlay() {}
function editQuestion() {}
function $() { return null; }             // no bank bar in the fixture
const localStorage = { getItem: () => null, setItem: () => {} };
let openAiKey = "sk-test", openAiModel = "gpt-5.6-sol";
function getOpenAiKey() { return openAiKey; }
function getOpenAiModel() { return openAiModel; }
let geminiRegenModels = [{}];
const AI_REGEN_MODEL = "gemini-3.7-flash";
const AI_REGEN_MODEL_NAMES = [AI_REGEN_MODEL];
let bankShown = [];
function _bankFilteredQuestions() { return bankShown; }
function _questionRecency(q) { const t = Date.parse((q && q.createdAt) || ""); return Number.isFinite(t) ? t : 0; }
async function imageUrlToInlineMedia() { return null; }
async function askOpenAI() { throw new Error("not used in these tests"); }
async function askGeminiVision() { throw new Error("not used in these tests"); }
function wsFind() { return null; }
function wsSavedQuestions() { return []; }
`;

const compareBlock = cut(
  'const AKC_PAR = 3;',
  '// ---- running a batch',
  'cross-check comparison block'
);
const entryBlock = cut(
  '// ---- the two ways in',
  '// One delegated handler each',
  'cross-check entry points'
);

const mk = () => new Function(FIXTURE + compareBlock + entryBlock + `
return {
  agree: akcAnswersAgree,
  units: akcUnits,
  numbers: akcNumbers,
  stated: akcStatedAnswer,
  agreesWithKey: akcAgreesWithKey,
  compare: akcCompare,
  prompt: akcPrompt,
  engines: akcEngines,
  recent: akcRecentQuestions,
  windowLabel: akcWindowLabel,
  tone: r => (r || {}).tone,
  seedBank(list) { bankShown = list; },
  noOpenAiKey() { openAiKey = ""; },
  noGemini() { geminiRegenModels = []; },
};`)();

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error((what || 'value') + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
  }
};
// An engine result in the shape akcAskEngine hands back.
const res = (engine, answer, over = {}) => Object.assign({
  engine, label: engine === 'openai' ? 'ChatGPT' : 'Gemini', model: 'm', ok: true,
  answer, optionNumber: null, working: '', stated: '', guide: 'ok', issues: [], confidence: 'high'
}, over);
const failed = (engine, error) => ({ engine, label: engine === 'openai' ? 'ChatGPT' : 'Gemini', model: 'm', ok: false, error, issues: [] });
const q = (over = {}) => Object.assign({ id: 'q1', title: 'Pancakes', blocks: [{ type: 'text', content: 'How much mixture?' }], expected: '24 m' }, over);

// ── would a teacher mark these two the same? ────────────────────────────────

test('the same answer written two ways agrees', () => {
  const M = mk();
  ok(M.agree('24 m', '24 m'), 'identical answers');
  ok(M.agree('24', '24 m'), 'a bare number against the same number with a unit');
  ok(M.agree('$12.50', '12.50 dollars'), 'a price written two ways');
  ok(M.agree('1,200 ml', '1200 ml'), 'a thousands separator');
  ok(M.agree('3 metres', '3 m'), 'a spelt-out unit');
  ok(M.agree('The answer is 18', '18'), 'a sentence around the number');
  ok(M.agree('(a) 12 (b) 30', '(a) 12  (b) 30'), 'a two-part answer');
});

test('a DIFFERENT unit is a disagreement, not a formatting difference', () => {
  // The whole point of the feature: 24 cm where the key says 24 m must reach
  // the teacher, and the numbers alone cannot tell those apart.
  const M = mk();
  ok(!M.agree('24 m', '24 cm'), 'metres against centimetres');
  ok(!M.agree('5 kg', '5 g'), 'kilograms against grams');
  ok(!M.agree('3 h', '3 min'), 'hours against minutes');
});

test('different numbers never agree', () => {
  const M = mk();
  ok(!M.agree('24', '42'), 'transposed digits');
  ok(!M.agree('12', '12.5'), 'a decimal');
  ok(!M.agree('(a) 12 (b) 30', '(a) 12 (b) 31'), 'one part differing');
  ok(!M.agree('12', '12 and 30'), 'a different count of numbers');
});

test('an empty answer agrees with nothing', () => {
  const M = mk();
  ok(!M.agree('', '24'), 'empty against a number');
  ok(!M.agree('24', ''), 'a number against empty');
  ok(!M.agree('', ''), 'two empties — nothing was checked, so nothing agreed');
});

// ── what the question says the answer is ────────────────────────────────────

test('an MCQ key is its option, numbered the way the student reads it', () => {
  const M = mk();
  const mcq = q({ options: ['12 m', '24 m', '48 m'], correctOption: 1, expected: '' });
  eq(M.stated(mcq), '2) 24 m', 'the stated MCQ answer');
});

test('an MCQ is compared by OPTION NUMBER, not by the words', () => {
  // Two options can read almost the same; the number is what was chosen.
  const M = mk();
  const mcq = q({ options: ['12 m', '24 m', '48 m'], correctOption: 1, expected: '' });
  eq(M.agreesWithKey(mcq, res('gemini', 'anything at all', { optionNumber: 2 })), true, 'the right option');
  eq(M.agreesWithKey(mcq, res('gemini', '24 m', { optionNumber: 3 })), false, 'the wrong option, right-looking text');
});

test('a question with no stated answer agrees with nothing either way', () => {
  const M = mk();
  eq(M.agreesWithKey(q({ expected: '' }), res('gemini', '24 m')), null, 'no key to agree with');
});

// ── the recommendation, and which way round it points ───────────────────────

test('both engines agreeing with the key is GREEN and says do nothing', () => {
  const M = mk();
  const c = M.compare(q(), [res('openai', '24 m'), res('gemini', '24 metres')]);
  eq(c.status, 'agree', 'status');
  eq(c.tone, 'good', 'tone');
  ok(/Nothing to do/i.test(c.rec), 'the recommendation: ' + c.rec);
});

test('both engines agreeing with EACH OTHER but not the key says change the key', () => {
  // The strongest signal the report can produce, and the exact opposite of the
  // case above — reversed, it tells a teacher to change a correct key.
  const M = mk();
  const c = M.compare(q({ expected: '24 m' }), [res('openai', '48 m'), res('gemini', '48 m')]);
  eq(c.status, 'key-wrong', 'status');
  eq(c.tone, 'bad', 'tone');
  ok(/change the answer key/i.test(c.rec), 'the recommendation: ' + c.rec);
  ok(c.rec.includes('48 m') && c.rec.includes('24 m'), 'both answers are named: ' + c.rec);
});

test('a split where one engine backs the key is AMBER and names which', () => {
  const M = mk();
  const c = M.compare(q({ expected: '24 m' }), [res('openai', '24 m'), res('gemini', '48 m')]);
  eq(c.status, 'split', 'status');
  ok(/ChatGPT agrees with your key/.test(c.rec), 'the backer is named: ' + c.rec);
  ok(c.rec.includes('48 m'), 'the other answer is named: ' + c.rec);
});

test('three different answers is RED and says rework the question', () => {
  const M = mk();
  const c = M.compare(q({ expected: '24 m' }), [res('openai', '48 m'), res('gemini', '12 m')]);
  eq(c.status, 'split-none', 'status');
  eq(c.tone, 'bad', 'tone');
  ok(/rework/i.test(c.rec), 'the recommendation: ' + c.rec);
});

test('a flagged marking guide is reported even when the answer is right', () => {
  // "Check both the marking guide, workings and stated answer" — an agreed
  // answer must not swallow a wrong worked solution.
  const M = mk();
  const c = M.compare(q(), [res('openai', '24 m', { guide: 'issue' }), res('gemini', '24 m')]);
  eq(c.status, 'guide', 'status');
  eq(c.tone, 'warn', 'tone');
  ok(/marking guide/i.test(c.rec), 'the recommendation: ' + c.rec);
});

test('a question with NO key is called out, with the answer to write in', () => {
  const M = mk();
  const c = M.compare(q({ expected: '' }), [res('openai', '24 m'), res('gemini', '24 m')]);
  eq(c.status, 'no-key', 'status');
  ok(c.rec.includes('24 m'), 'the agreed answer is offered: ' + c.rec);
});

test('one engine alone is never reported as agreement', () => {
  // A second opinion is the entire product. One engine matching the key is
  // reassuring, not confirmation, and the report has to say which it is.
  const M = mk();
  const c = M.compare(q(), [res('gemini', '24 m'), failed('openai', 'network problem')]);
  eq(c.status, 'single', 'status');
  ok(/no second opinion/i.test(c.rec), 'the recommendation: ' + c.rec);
});

test('one engine alone DISAGREEING with the key is still raised', () => {
  const M = mk();
  const c = M.compare(q({ expected: '24 m' }), [res('gemini', '48 m'), failed('openai', 'no key saved')]);
  eq(c.status, 'single', 'status');
  // One status, two colours: a lone engine AGREEING with the key is amber, a
  // lone engine contradicting it is red, and only the comparison's own tone
  // can tell them apart — which is why nothing else may re-derive it.
  eq(c.tone, 'bad', 'a lone engine contradicting the key must not be soft-pedalled');
});

test('both engines failing is reported as NOT CHECKED, never as agreement', () => {
  const M = mk();
  const c = M.compare(q(), [failed('openai', 'network problem'), failed('gemini', 'overloaded')]);
  eq(c.status, 'failed', 'status');
  ok(/Neither engine/i.test(c.rec), 'the recommendation: ' + c.rec);
  ok(c.rec.includes('network problem') && c.rec.includes('overloaded'), 'both reasons are given: ' + c.rec);
});

test('an engine that answered nothing at all does not count as an engine', () => {
  const M = mk();
  const c = M.compare(q(), [res('openai', ''), res('gemini', '24 m')]);
  eq(c.status, 'single', 'an empty answer was counted as a second opinion');
});

// ── the prompt ──────────────────────────────────────────────────────────────

test('the prompt asks the engine to solve it BEFORE reading the key', () => {
  const M = mk();
  const p = M.prompt(q({ markingGuide: 'half of 750' }), '');
  ok(/FIRST work the question out/i.test(p), 'the independent-solve instruction is missing');
  ok(p.indexOf('own') > 0, 'the prompt does not ask for its own working');
  ok(p.includes('24 m'), 'the stated answer is not in the prompt');
  ok(p.includes('half of 750'), 'the marking guide is not in the prompt');
});

test('an MCQ prompt numbers its options and asks for the number', () => {
  const M = mk();
  const p = M.prompt(q({ options: ['12 m', '24 m'], correctOption: 1, expected: '' }), '');
  ok(p.includes('1) 12 m') && p.includes('2) 24 m'), 'the options are not numbered the way the student sees them');
  ok(/optionNumber/.test(p), 'the option number is not asked for');
});

// ── which engines run ───────────────────────────────────────────────────────

test('both engines are offered when both are available', () => {
  const M = mk();
  eq(M.engines().map(e => e.id), ['openai', 'gemini'], 'the engines');
});

test('a missing ChatGPT key leaves Gemini running alone rather than nothing', () => {
  const M = mk();
  M.noOpenAiKey();
  eq(M.engines().map(e => e.id), ['gemini'], 'the engines');
});

// ── the "past N hours" window ───────────────────────────────────────────────

const hoursAgo = h => new Date(Date.now() - h * 3600000).toISOString();

test('the window takes questions from inside it and leaves the rest', () => {
  const M = mk();
  M.seedBank([
    { id: 'a', createdAt: hoursAgo(0.5) },
    { id: 'b', createdAt: hoursAgo(5) },
    { id: 'c', createdAt: hoursAgo(40) }
  ]);
  eq(M.recent(1).map(x => x.id), ['a'], 'the past hour');
  eq(M.recent(6).map(x => x.id), ['a', 'b'], 'the past 6 hours');
  eq(M.recent(0).map(x => x.id), ['a', 'b', 'c'], 'any time');
});

test('an undated question is only ever in the "any time" window', () => {
  const M = mk();
  M.seedBank([{ id: 'a', createdAt: hoursAgo(1) }, { id: 'old' }]);
  eq(M.recent(24).map(x => x.id), ['a'], 'an undated question was dated by guesswork');
  eq(M.recent(0).map(x => x.id), ['a', 'old'], 'any time');
});

test('the window reads the bank as the eye sees it', () => {
  // The button counts what _bankFilteredQuestions returns, so a filtered bank
  // cannot check a question that is not on screen.
  const M = mk();
  M.seedBank([{ id: 'only', createdAt: hoursAgo(1) }]);
  eq(M.recent(24).map(x => x.id), ['only'], 'the checked set');
});

// ── the wiring, read as text ────────────────────────────────────────────────

test('both engines are asked the SAME prompt, at the same time', () => {
  ok(/Promise\.all\(engines\.map\(e =>\s*\n\s*akcAskEngine\(e, prompt, media\)/.test(src),
     'the two engines are no longer run together off one prompt');
});

test('the Gemini call really is Gemini', () => {
  // askGeminiVision routes through ChatGPT when the sidebar toggle says so —
  // without skipOpenAi both columns would be the same model twice.
  const block = cut('async function akcAskEngine', '\nasync function akcCheckQuestion', 'akcAskEngine');
  ok(/skipOpenAi: true/.test(block), 'the Gemini side can be silently answered by ChatGPT');
});

test('the ChatGPT key is read from the slots the OTHER portals write', () => {
  // The four apps are sibling folders on one GitHub Pages origin, so they
  // share a localStorage. A key pasted into Science has to be the key this app
  // reads, or the cross-check silently runs with ONE engine and reports it as
  // "no second opinion" forever — which looks like a working feature.
  const block = cut('const AI_ENGINE_STORE =', '\n(function _aiEngineAdoptLegacySettings', 'the engine store');
  ok(/sq_ai_engine/.test(block) && /sq_openai_key/.test(block), 'the shared slot names have drifted');
  ok(/sq_openai_model/.test(block) && /sq_openai_image_model/.test(block), 'the shared model slots have drifted');
});

test('adopting the old key never overwrites the shared one', () => {
  // A stale key left in this app\'s own slot must not sign the other three
  // apps out in order to rescue this one.
  const block = cut('function _aiEngineAdoptLegacySettings', '\n\n', 'the legacy adoption');
  ok(/if \(had && !localStorage\.getItem\(AI_ENGINE_STORE\[k\]\)\)/.test(block),
     'the migration writes over a slot that already has something in it');
});

test('no API key is committed to the page', () => {
  // These are public static sites served to every student. A key in here is a
  // key handed to the school.
  ok(!/sk-[A-Za-z0-9_-]{20,}/.test(src), 'an OpenAI-shaped secret is checked into index.html');
});

test('the report never writes an answer key', () => {
  const block = cut('const AKC_PAR = 3;', '// ---- the two ways in', 'the cross-check block');
  ok(!/saveQuestionDoc|setDoc|updateDoc|deleteDoc/.test(block),
     'the cross-check writes to the database — it is a report, and a model that is confidently wrong must not be able to overwrite a key');
});

// ── runner ───────────────────────────────────────────────────────────────────

const only = process.argv[2];
let passed = 0, failed_ = 0;
for (const c of cases) {
  if (only && c.name !== only) continue;
  try { await c.fn(); console.log('  ok   ' + c.name); passed++; }
  catch (err) { console.log('  FAIL ' + c.name + '\n         ' + err.message); failed_++; }
}
console.log(`\n${passed} passed, ${failed_} failed`);
process.exit(failed_ ? 1 : 0);
