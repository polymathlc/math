// Regression tests for 🔑 THE ANSWER KEY SCANNER.
// Run with:
//     node tools/answer-key-scan-tests.mjs            all cases
//     node tools/answer-key-scan-tests.mjs <name>     one case
//
// It loads the REAL reader, scorer and matcher out of index.html and runs them
// over synthetic photographs and a synthetic bank. Every way this can break is
// SILENT, and every one of them ends with a teacher's worked answer filed
// against a question it does not answer — on a card that renders perfectly and
// a question that looks finished:
//
//  • THE WRONG QUESTION. A shortlist that scores the wrong question first, a
//    model choice read out of range and rounded into a real one, or an auto-
//    attach that needs only ONE opinion instead of two.
//  • WORK DESTROYED. An answer key image somebody put there by hand replaced
//    without being asked, which is the one thing here that cannot be undone by
//    pressing ↩ Undo on a card that has already been dismissed.
//  • A STUDENT READING IT. The answer key is the one thing in this app a
//    student must never reach, so the gate is checked in THREE places rather
//    than one — a hidden nav item is not a lock.
//  • AN INVENTED QUESTION. A model asked to read a page of working will write
//    a plausible question for it if the prompt lets it, and that question is
//    then matched against the bank and files the page against the wrong one.
import fs from 'fs';

const PAGE = new URL('../index.html', import.meta.url).pathname;
const src = fs.readFileSync(PAGE, 'utf8');

const cut = (from, to, what) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(what + ': "' + from + '" not found in index.html');
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error(what + ': end marker "' + to + '" not found');
  return src.slice(a, b);
};

// The shared tokeniser and the similarity measure the scorer leans on. They
// live with the duplicate warning, and the whole point of _qTokenSet is that
// both features cut a question into words the same way.
const tokens = cut(
  '// _qTokenSet is the ONE tokeniser.',
  '\n// ── The editor\'s own duplicate warning',
  'tokeniser'
);

// The scanner itself, stopping before the wiring: that binds document
// listeners at module-evaluation time and this harness runs in plain Node
// with no DOM. Everything that decides anything is above that line.
const block = cut(
  '// =====================================================================\n// 🔑 THE ANSWER KEY SCANNER',
  '\n// ---- wiring ---',
  'scanner'
);

const FIXTURE = `
const console = { error(){}, warn(){}, log(){} };
let questionBank = [];
let currentUser = { role: "admin" };
function canManageQuestions() { return currentUser && currentUser.role === "admin"; }
function stripHtml(s) { return String(s || "").replace(/<[^>]*>/g, " "); }
function questionText(q) { return (q.blocks || []).filter(b => b.type === "text").map(b => stripHtml(b.content)).join(" "); }
function questionTopics(q) { return [q && q.topic, q && q.topic2].filter(Boolean); }
function adminTopicsLabel(q) { return questionTopics(q).join(", ") || "Math"; }
function mcqLabel(i) { return (i + 1) + ")"; }
function wsHasMcq(q) { return !!(q && Array.isArray(q.options) && q.options.length); }
function bankSearchHaystack(q) { return ((q.title || "") + " " + questionText(q)).toLowerCase(); }
function escapeHtml(s) { return String(s == null ? "" : s); }
function toast() {}
function aiReady() { return true; }
function navigateTo() {}
function closeOverlay() {}
function renderBank() {}
function $(){ return null; }
let localStorage = { _v: {}, getItem(k) { return k in this._v ? this._v[k] : null; }, setItem(k, v) { this._v[k] = String(v); } };

// The editor and the bank write, stubbed. The real loadQuestionIntoEditor
// CLEARS qEditReturn (every route in lands there), which is exactly why
// aksEditQuestion has to set it afterwards — so the stub clears it too.
let qEditReturn = null;
let _opened = [];
let _saved = [];
let _saveFails = false;
let _uploads = [];
let _keyBox = "";
function loadQuestionIntoEditor(q) { _opened.push(q.id); qEditReturn = null; aksCarrySet(null); }
async function saveQuestionDoc(q) { if (_saveFails) throw new Error("network"); _saved.push(JSON.parse(JSON.stringify(q))); }
async function uploadDataUrlToStorage(url, folder) { _uploads.push({ url, folder }); return "https://storage/" + folder + "/x.png"; }
function setAnswerKeyImage(url) { _keyBox = String(url || ""); }
`;

// akcStatedAnswer / akcAnswersAgree are the answer comparator the cross-check
// already owns and this feature reuses. They are pulled out of index.html the
// same way, so the scorer is tested against the real thing.
const akc = cut('function akcStatedAnswer(q) {', '\nfunction akcResultsAgree', 'answer comparator');

const M = new Function(FIXTURE + tokens + akc + block + `
return {
  readings: aksReadings,
  score: aksScore,
  shortlist: aksShortlist,
  sure: aksLocallySure,
  pickIndex: aksPickIndex,
  autoOk: aksAutoOk,
  readPrompt: aksReadPrompt,
  pickPrompt: aksPickPrompt,
  startJob: aksStartJob,
  edit: aksEditQuestion,
  saveVideo: aksSaveVideo,
  toggleVideo: aksToggleVideo,
  videoBox: aksVideoBoxHtml,
  actions: aksQuestionActionsHtml,
  carrySet: aksCarrySet,
  carry() { return _aksCarry; },
  editReturn() { return qEditReturn; },
  opened() { return _opened; },
  saved() { return _saved; },
  uploads() { return _uploads; },
  failSaves(on) { _saveFails = !!on; },
  rows() { return aksRows; },
  addRow(r) { aksRows.push(r); return r; },
  reset() { aksRows = []; _opened = []; _saved = []; _uploads = []; _saveFails = false; qEditReturn = null; _aksCarry = null; },
  seed(bank) { questionBank = bank || []; },
  setRole(r) { currentUser = { role: r }; },
  MIN: AKS_MIN_SCORE, SURE: AKS_SURE_SCORE, GAP: AKS_SURE_GAP, SHORT: AKS_SHORTLIST,
};`)();

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error((what || 'value') + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
  }
};

const q = (id, title, text, extra) => Object.assign(
  { id, title, blocks: [{ type: 'text', content: text }] }, extra || {});

const RIBBON = q('m1', 'Ribbon left over',
  'Aisha had a ribbon 4/5 m long. She cut off 1/3 of it to tie a parcel. What length of ribbon was left, in metres?',
  { expected: '8/15 m', topic: 'Fractions', level: 'P5' });
const PENS = q('m2', 'Pens sold on Tuesday',
  'A shop sold 240 pens on Monday and 3/8 as many on Tuesday. How many pens were sold on Tuesday?',
  { expected: '90', topic: 'Fractions', level: 'P5' });
const SPEED = q('m3', 'Car journey',
  'A car travelled 180 km in 3 hours. What was its average speed in km/h?',
  { expected: '60 km/h', topic: 'Speed', level: 'P6' });
const BANK = [RIBBON, PENS, SPEED];

// ── ① what comes back off the photograph ───────────────────────────────────

test('a page of several worked answers becomes several readings', () => {
  const r = M.readings({ keys: [
    { questionNumber: '7', working: '240 x 3/8', finalAnswer: '90' },
    { questionNumber: '8', working: '180 / 3', finalAnswer: '60 km/h' }
  ] });
  eq(r.length, 2, 'how many readings came back');
  eq(r[0].finalAnswer, '90');
  eq(r[1].questionNumber, '8');
});

test('a page holding ONE worked answer still comes back as a list', () => {
  eq(M.readings({ keys: [{ working: '240 x 3/8', finalAnswer: '90' }] }).length, 1);
});

test('a reply that forgot the wrapper is still read', () => {
  // The single-object shape has to keep working, or one model's tidier reply
  // is a photograph that silently reads as blank.
  eq(M.readings({ working: '180 / 3', finalAnswer: '60 km/h' }).length, 1);
});

test('a BLANK page is no readings, never one empty one', () => {
  eq(M.readings({ keys: [] }).length, 0, 'an explicitly blank page');
  eq(M.readings({ keys: [{ questionNumber: '', working: '', finalAnswer: '' }] }).length, 0,
    'a reading with nothing on it is not something to match');
  eq(M.readings(null).length, 0);
  eq(M.readings('nonsense').length, 0);
});

test('every field is normalised to the shape the scorer reads', () => {
  const r = M.readings({ keys: [{ topics: 'Fractions', box_2d: [0, 0, 500, 500] }] })[0];
  ok(r === undefined || Array.isArray(r.topics), 'topics must never reach the scorer as a bare string');
});

// ── ② the prompt ────────────────────────────────────────────────────────────

test('the read prompt FORBIDS inventing the question', () => {
  const p = M.readPrompt();
  ok(/NEVER INVENT THE QUESTION/i.test(p),
    'nothing stops the model writing a plausible question for a page of bare working — ' +
    'and that invented question is then matched against the bank');
  ok(/"keys":\[\]/.test(p), 'the prompt never says what a blank page should return');
  ok(/box_2d/.test(p), 'no rectangle is asked for, so a page of four answers cannot be cut into four');
});

test('the pick prompt offers "none of them" as a real answer', () => {
  const p = M.pickPrompt([{ q: RIBBON, score: 0.5 }, { q: PENS, score: 0.3 }]);
  ok(/say 0/i.test(p) && /correct and useful/i.test(p),
    'a model given no way out picks the least-wrong question instead of refusing');
  ok(p.includes('Ribbon left over') && p.includes('Pens sold on Tuesday'), 'the candidates are named');
});

// ── ③ the scoring ───────────────────────────────────────────────────────────

test('working that names the question scores it top', () => {
  const read = { questionText: '', working: 'ribbon 4/5 m, cut off 1/3, length left', finalAnswer: '8/15 m', topics: [], level: '' };
  const list = M.shortlist(read, BANK);
  ok(list.length, 'nothing was shortlisted at all');
  eq(list[0].q.id, 'm1', 'the question the shortlist put first');
});

test('the FINAL ANSWER is a bonus, never the whole verdict', () => {
  // A bank holds dozens of questions whose answer is the same number, so an
  // answer that agrees must not be able to out-rank the actual wording.
  const read = { questionText: '', working: 'ribbon 4/5 m, cut off 1/3 of it, what is left', finalAnswer: '60 km/h', topics: [], level: '' };
  const list = M.shortlist(read, BANK);
  eq(list[0].q.id, 'm1', 'a matching answer on a different question out-ranked the right wording');
});

test('an answer-only match reaches the shortlist and can never LEAD it', () => {
  // The rule the multiplier exists for, from both sides: a page whose working
  // says nothing recognisable still surfaces the questions whose answer it
  // matches (so the model gets to look at them), and it lands nowhere near
  // being attached on its own.
  const read = { questionText: '', working: 'zzz qqq', finalAnswer: '60 km/h', topics: [], level: '' };
  const s = M.score(read, SPEED);
  ok(s >= M.MIN, 'an answer-only match fell off the shortlist altogether: ' + s);
  ok(s < M.SURE, 'an answer-only match could be attached without the model being asked: ' + s);
});

test('a matching answer really does lift a question', () => {
  const bare = { questionText: '', working: 'divided the distance by the time', finalAnswer: '', topics: [], level: '' };
  const withAns = Object.assign({}, bare, { finalAnswer: '60 km/h' });
  ok(M.score(withAns, SPEED) > M.score(bare, SPEED), 'the stated answer counted for nothing');
});

test('the question NUMBER matches whole, so 1 never matches 12', () => {
  const twelve = q('m4', 'Q12 — Ribbon', 'A ribbon question', { topic: 'Fractions' });
  const read = { questionText: '', working: 'some working', finalAnswer: '', topics: [], level: '', questionNumber: '1' };
  const readTwelve = Object.assign({}, read, { questionNumber: '12' });
  ok(M.score(readTwelve, twelve) > M.score(read, twelve),
    '"1" scores a Q12 title as highly as "12" does — every key off a paper lands one question out');
});

test('a mis-read LEVEL or TOPIC narrows the search, it never excludes', () => {
  const read = { questionText: '', working: 'ribbon 4/5 m, cut off 1/3, length left', finalAnswer: '8/15 m', topics: ['Ratio'], level: 'P3' };
  const list = M.shortlist(read, BANK);
  ok(list.some(r => r.q.id === 'm1'), 'the right question was filtered out by a wrong level or topic');
});

test('the shortlist is capped and sorted best first', () => {
  const many = [];
  for (let i = 0; i < 40; i++) many.push(q('x' + i, 'Ribbon ' + i, 'Aisha had a ribbon and cut off some of it', { topic: 'Fractions' }));
  const list = M.shortlist({ questionText: '', working: 'Aisha ribbon cut off', finalAnswer: '', topics: [], level: '' }, many);
  ok(list.length <= M.SHORT, 'the shortlist blew past its cap: ' + list.length);
  for (let i = 1; i < list.length; i++) ok(list[i - 1].score >= list[i].score, 'the shortlist is not sorted');
});

test('a photograph that matches nothing shortlists nothing', () => {
  const list = M.shortlist({ questionText: '', working: 'photosynthesis chlorophyll stomata', finalAnswer: '', topics: [], level: '' }, BANK);
  eq(list.length, 0, 'unrelated working still produced candidates');
});

// ── ④ when the local score may decide on its own ────────────────────────────

test('SURE needs BOTH a strong score AND a clear gap', () => {
  ok(!M.sure([]), 'an empty shortlist read as sure');
  ok(!M.sure([{ score: M.SURE - 0.05 }]), 'a weak lone match read as sure');
  ok(M.sure([{ score: M.SURE + 0.1 }]), 'a strong lone match should be sure');
  // The case this exists for: two questions off the same paper, worded almost
  // alike, and one of them is the wrong one.
  ok(!M.sure([{ score: 0.6 }, { score: 0.55 }]),
    'a strong match with the runner-up right behind it read as sure — that is how a key lands on the twin');
  ok(M.sure([{ score: 0.6 }, { score: 0.2 }]), 'a strong match well clear of the field should be sure');
});

// ── ⑤ reading the model's choice ────────────────────────────────────────────

test('a choice OUTSIDE the list is 0 — never rounded into a real question', () => {
  eq(M.pickIndex({ choice: 9 }, 3), 0, 'choice 9 of 3');
  eq(M.pickIndex({ choice: 0 }, 3), 0);
  eq(M.pickIndex({ choice: -1 }, 3), 0);
  eq(M.pickIndex({ choice: 1.5 }, 3), 0, 'a fractional choice');
  eq(M.pickIndex({ choice: 'two' }, 3), 0, 'a worded choice');
  eq(M.pickIndex({}, 3), 0, 'no choice at all');
  eq(M.pickIndex(null, 3), 0);
});

test('a choice INSIDE the list is honoured', () => {
  eq(M.pickIndex({ choice: 2 }, 3), 2);
  eq(M.pickIndex({ choice: '3' }, 3), 3, 'a numeric string is a number');
});

// ── ⑥ what may be attached without being asked ──────────────────────────────

test('an UNSURE match is never attached automatically', () => {
  M.seed(BANK);
  ok(!M.autoOk({ status: 'ready', sure: false, match: { id: 'm1' } }),
    'a match nobody was sure of would file itself');
});

test('a question that ALREADY has an answer key is never overwritten automatically', () => {
  M.seed([Object.assign({}, RIBBON, { answerKeyImageUrl: 'https://example.com/old.png' }), PENS, SPEED]);
  ok(!M.autoOk({ status: 'ready', sure: true, match: { id: 'm1' } }),
    'work somebody put there by hand would be replaced without being asked');
  ok(M.autoOk({ status: 'ready', sure: true, match: { id: 'm2' } }),
    'a confident match on an empty slot should file itself — that is the whole feature');
});

test('a match on a question that has left the bank is not attached', () => {
  M.seed(BANK);
  ok(!M.autoOk({ status: 'ready', sure: true, match: { id: 'gone' } }));
});

test('a row that is not READY is never attached', () => {
  M.seed(BANK);
  ok(!M.autoOk({ status: 'saving', sure: true, match: { id: 'm1' } }));
  ok(!M.autoOk(null));
});

// ── ⑦ admin only, in three places ───────────────────────────────────────────

test('a student cannot start a scan, however they reached the page', () => {
  M.reset(); M.seed(BANK);
  M.setRole('student');
  M.startJob({ name: 'key.jpg', size: 1000, type: 'image/jpeg' });
  eq(M.rows().length, 0, 'a student account queued an answer key scan');
  M.setRole('admin');
  M.startJob({ name: 'key.jpg', size: 1000, type: 'image/jpeg' });
  eq(M.rows().length, 1, 'an admin could not queue one');
  M.reset();
});

test('the page itself is admin-gated in navigateTo, not only hidden', () => {
  ok(/"diagnostic", "answerkeys"\]\.includes\(page\) && !canManageQuestions\(\)/.test(src),
    'navigateTo does not rewrite the answer key page for a student — a bookmark walks straight in');
  ok(/nav-item admin-only" data-page="answerkeys"/.test(src),
    'the nav item is not marked admin-only');
});

// ── ⑧ the markup the wiring reaches for ─────────────────────────────────────

test('every element the block binds to exists in the markup', () => {
  for (const id of ['aksPad', 'aksCam', 'aksFile', 'aksCamBtn', 'aksPickBtn',
                    'aksClearBtn', 'aksAuto', 'aksPickSearch', 'aksPickList',
                    'aksList', 'aksStatus', 'aksPickOverlay',
                    'aksDoneCount', 'aksWaitCount', 'aksBusyCount']) {
    ok(src.includes('id="' + id + '"'), 'the markup has no #' + id + ' — the wiring throws on load');
  }
});

test('the gallery picker takes SEVERAL photographs', () => {
  ok(/id="aksFile"[^>]*multiple|multiple[^>]*id="aksFile"/.test(src),
    'the gallery input is not `multiple`, so a pile of keys has to be added one at a time');
});

// ── ⑨ the question itself, from the card (v1.60.0) ─────────────────────────
// ✎ Edit this question and 🎬 Video both WRITE to the question bank from a page
// whose whole point is that a student must never reach it, and both fail
// silently: an edit that opens nothing looks like a slow app, and a video link
// that did not save looks exactly like one that did.

const withKey = (extra) => Object.assign({ id: 'r1', status: 'ready', dataUrl: 'data:image/png;base64,AAA',
  match: { id: 'm1', title: 'Ribbon left over' }, read: {} }, extra || {});

test('✎ Edit opens the matched question and comes BACK to the scanner', () => {
  M.reset(); M.seed(BANK); M.setRole('admin');
  M.addRow(withKey());
  M.edit('r1');
  eq(M.opened(), ['m1'], 'the question the editor was opened on');
  eq(M.editReturn(), { page: 'answerkeys' },
    'Save and Cancel land on the bank instead — the pile of photographs, with rows still waiting, reads as thrown away');
});

test('the PHOTOGRAPH travels into the editor, unused and un-uploaded', () => {
  M.reset(); M.seed(BANK); M.setRole('admin');
  M.addRow(withKey());
  M.edit('r1');
  const c = M.carry();
  ok(c && c.dataUrl === 'data:image/png;base64,AAA', 'the editor was opened without the picture it was opened FOR');
  eq(c.used, false, 'a carried photograph must arrive un-used — the Save is what commits it');
  eq(M.uploads().length, 0, 'a photograph was uploaded merely by opening the editor — an orphan in Storage if the edit is abandoned');
});

test('the carry is CLEARED by every other route into the editor', () => {
  // Set it, then open a question the way the bank does. The real
  // loadQuestionIntoEditor calls aksCarrySet(null); the stub mirrors it.
  M.reset(); M.seed(BANK); M.setRole('admin');
  M.addRow(withKey());
  M.edit('r1');
  ok(M.carry(), 'nothing was carried at all');
  loadFromBank();
  ok(!M.carry(),
    'the last photograph is still on the banner over a question it has nothing to do with — and one press files somebody else\'s working as its answer key');
});
function loadFromBank() { M.carrySet(null); }

test('the source really does clear the carry on both routes', () => {
  // The two calls the test above can only mimic. Lose either and the banner
  // outlives the question it belongs to.
  const load = src.slice(src.indexOf('function loadQuestionIntoEditor(q) {'), src.indexOf('function collectQuestion()'));
  ok(/aksCarrySet\(null\)/.test(load), 'loadQuestionIntoEditor does not clear the carried photograph');
  const reset = src.slice(src.indexOf('function resetEditor() {'), src.indexOf('$("clearQBtn")'));
  ok(/aksCarrySet\(null\)/.test(reset), 'resetEditor does not clear the carried photograph');
});

test('✎ Edit is refused for a student, in the HANDLER', () => {
  M.reset(); M.seed(BANK); M.addRow(withKey());
  M.setRole('student');
  M.edit('r1');
  eq(M.opened().length, 0, 'a student account opened the admin editor from a scanner card');
  M.setRole('admin');
});

test('✎ Edit on a question that has left the bank opens nothing', () => {
  M.reset(); M.seed(BANK); M.setRole('admin');
  M.addRow(withKey({ match: { id: 'gone', title: 'Deleted' } }));
  M.edit('r1');
  eq(M.opened().length, 0, 'the editor was opened on a question that is no longer there');
});

test('🎬 the video link is written to the matched question', async () => {
  M.reset(); M.seed(BANK.map(q => Object.assign({}, q))); M.setRole('admin');
  M.addRow(withKey({ videoDraft: 'https://youtu.be/abc' }));
  await M.saveVideo('r1');
  eq(M.saved().length, 1, 'nothing was written');
  eq(M.saved()[0].id, 'm1', 'the question that was written to');
  eq(M.saved()[0].videoExplanationUrl, 'https://youtu.be/abc');
});

test('a FAILED write puts the question back the way it was', async () => {
  const bank = BANK.map(q => Object.assign({}, q, { videoExplanationUrl: 'https://old/video' }));
  M.reset(); M.seed(bank); M.setRole('admin');
  M.addRow(withKey({ videoDraft: 'https://youtu.be/new' }));
  M.failSaves(true);
  await M.saveVideo('r1');
  eq(bank[0].videoExplanationUrl, 'https://old/video',
    'the bank in memory now claims a video the database has never heard of — every screen shows it until the page is reloaded');
  M.failSaves(false);
});

test('🎬 is refused for a student, and refused on a question that has gone', async () => {
  M.reset(); M.seed(BANK.map(q => Object.assign({}, q))); M.setRole('student');
  M.addRow(withKey({ videoDraft: 'https://youtu.be/abc' }));
  await M.saveVideo('r1');
  eq(M.saved().length, 0, 'a student account wrote a video link into the question bank');
  M.setRole('admin');
  M.reset(); M.seed(BANK.map(q => Object.assign({}, q)));
  M.addRow(withKey({ match: { id: 'gone', title: 'Deleted' }, videoDraft: 'https://youtu.be/abc' }));
  await M.saveVideo('r1');
  eq(M.saved().length, 0, 'a video link was written to a question that is no longer in the bank');
});

test('the box opens holding the link the question ALREADY has', () => {
  M.reset(); M.setRole('admin');
  const q = Object.assign({}, RIBBON, { videoExplanationUrl: 'https://old/video' });
  M.seed([q, PENS, SPEED]);
  const row = M.addRow(withKey());
  M.toggleVideo('r1');
  ok(row.videoOpen, 'the box did not open');
  eq(row.videoDraft, 'https://old/video',
    'the box opens EMPTY over a question that has a video — one press of save then wipes it');
  ok(M.videoBox(row, q).includes('https://old/video'), 'the open box does not show the link it is editing');
});

test('what is being TYPED survives the card being rebuilt', () => {
  // Another photograph finishing in the background re-renders every card. The
  // draft lives on the row, so a half-typed link is still there afterwards.
  M.reset(); M.setRole('admin'); M.seed(BANK);
  const row = M.addRow(withKey({ videoOpen: true, videoDraft: 'https://youtu.be/half' }));
  ok(M.videoBox(row, RIBBON).includes('https://youtu.be/half'),
    'the box is rendered from the question rather than from the draft — every background render wipes what is being typed');
  ok(/const keep = act && act\.id/.test(src) && /setSelectionRange\(keepAt, keepAt\)/.test(src),
    'aksRender does not put the caret back, so a rebuild mid-sentence drops the cursor out of the box');
  ok(/data-aks-video-draft/.test(src) && /videoDraft: i\.value/.test(src),
    'nothing writes the keystrokes onto the row, so there is no draft to survive anything');
});

test('a card that has been FILED still offers the question', () => {
  // The moment a key lands is exactly when the teacher thinks of the video that
  // goes with it, and the done card used to offer only Undo and Dismiss.
  const done = src.slice(src.indexOf('if (row.status === "attached") {'), src.indexOf('const q = row.match ? questionBank.find'));
  ok(/aksQuestionActionsHtml\(row\)/.test(done), 'a filed card no longer offers ✎ Edit or 🎬 Video');
  ok(/aksVideoBoxHtml\(row, done\)/.test(done), 'the video box cannot be opened on a filed card');
});

test('a card with NO match offers neither — there is nothing to edit', () => {
  const html = M.videoBox({ id: 'r1', videoOpen: true }, null);
  eq(html, '', 'a video box was drawn for a photograph that has not found a question');
});

test('qEditLeave comes back to a plain page', () => {
  const leave = src.slice(src.indexOf('function qEditLeave() {'), src.indexOf('function wseRender()'));
  ok(/back && back\.page/.test(leave) && /navigateTo\(back\.page\)/.test(leave),
    'Save on a question opened from the scanner lands on the bank — the pile it came from is gone from view');
});

test('the banner and its buttons are really in the markup', () => {
  for (const id of ['qScanCarry', 'qScanCarryImg', 'qScanCarryNote', 'qScanCarryUse', 'qScanCarryBack']) {
    ok(src.includes('id="' + id + '"'), 'the markup has no #' + id + ' — the banner is dead on arrival');
  }
  ok(/id="qScanCarry"[^>]*hidden/.test(src),
    'the banner is not hidden by default, so every question opened from the bank wears an empty answer-key banner');
});

test('the banner sits where the two fields it is FOR are', () => {
  const carry = src.indexOf('id="qScanCarry"');
  const video = src.indexOf('id="qVideoInput"');
  const key = src.indexOf('id="answerKeyZone"');
  ok(carry > 0 && carry < video && video < key,
    'the banner is not above the video link and the answer key image — the teacher lands on it and has to go looking');
});

// ── runner ───────────────────────────────────────────────────────────────────

const only = process.argv[2];
let passed = 0, failed = 0;
for (const c of cases) {
  if (only && c.name !== only) continue;
  try { await c.fn(); console.log('  ok   ' + c.name); passed++; }
  catch (err) { console.log('  FAIL ' + c.name + '\n         ' + err.message); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
