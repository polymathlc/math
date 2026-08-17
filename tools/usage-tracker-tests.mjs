// Regression tests for THE STUDENT USAGE TRACKER.
// Run with:
//     node tools/usage-tracker-tests.mjs            all cases
//     node tools/usage-tracker-tests.mjs <name>     one case
//
// It loads the REAL tracker out of the module in index.html and runs it over a
// synthetic log. Every failure here is SILENT — the overlay opens, the tables
// paint, the numbers look plausible, and a teacher acts on them:
//
//  • THE TWO SOURCES MUST MERGE. `mathPerformanceAttempts` is the marked
//    record; Nova Protocol's trainer, duel and Siege write to
//    `questionAttempts`. This page read the first only, so three whole modes
//    were invisible — the collection was being written and nothing on the
//    teacher's side ever read it. Drop either half and a pupil's work
//    disappears with nothing on screen to say a source is missing.
//  • THE GAP MUST BE MEASURED ACROSS BOTH. A pupil alternating between practice
//    and a game has gaps neither collection can see on its own, so measuring
//    within one source under-reports rapid-fire answering exactly where it is
//    most likely.
//  • A MODE THAT FALLS OUT OF THE LOG IS A CHILD'S WORK MADE INVISIBLE. An
//    unlabelled mode must still show, as its own raw string — never dropped,
//    and never merged with another unlabelled mode into one row.
//  • THE SERVER'S VERDICT WINS. It is what the marker actually decided; a
//    credit recomputed over it would let the tracker and the pupil's own
//    result screen disagree about the same attempt.
//  • THE FILTERS AND THE EXPORT MUST READ THE SAME WINDOW, or a teacher sends a
//    parent a report of work in a mode they had filtered away.
import fs from 'fs';

const HTML = new URL('../index.html', import.meta.url).pathname;
const html = fs.readFileSync(HTML, 'utf8');
const i = html.indexOf('<script type="module">');
const src = html.slice(i, html.indexOf('</script>', i));

const cut = (from, to, what) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(what + ': "' + from + '" not found in the module');
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error(what + ': end marker not found');
  return src.slice(a, b);
};

const FIXTURE = `
let questionBank = [];
const RAPID_SUBMIT_MS = 30 * 1000;
function escapeHtml(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function attemptTopicLabel(a) { return (Array.isArray(a.topics) && a.topics.length) ? a.topics.join(', ') : (a.topic || a.concept || ''); }
function studentTopicsLabel(q) { return (q && q.topic) || ''; }
`;

// The tracker's pure half — everything up to the renderer, which needs a DOM.
const block = cut('const USAGE_MODES = {', '\nfunction sutRender()', 'tracker');

const T = new Function(FIXTURE + block + `
return {
  usageMode, sutPerfMode, sutNormalise, sutVerdict, sutVisible, sutByMode, MODES: USAGE_MODES,
  seed(perf, game, bank) {
    questionBank = bank || [];
    _sut = { uid: 'u1', name: 'T', rows: sutNormalise(perf || [], game || []),
             mode: '', result: '', days: '', search: '', open: {} };
    return _sut.rows;
  },
  filter(k, v) { _sut[k] = v; },
  rows() { return _sut.rows; },
};`)();

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error((what || 'value') + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
  }
};

const DAY = 86400000;
const perf = (o) => Object.assign({
  id: 'p' + Math.random().toString(36).slice(2, 8), questionId: 'q1', questionTitle: 'Marked question',
  source: 'bank', verdict: 'correct', marks: 2, outOf: 2, credit: 1, xpAwarded: 10,
  createdAt: new Date(Date.now() - DAY).toISOString()
}, o);
const game = (o) => Object.assign({
  id: 'g' + Math.random().toString(36).slice(2, 8), questionId: 'q2', questionTitle: '',
  mode: 'tcg-siege', score: 1, totalBlanks: 1,
  timestamp: new Date(Date.now() - DAY)
}, o);

// ── the merge, which is the reason this exists ──────────────────────────────

test('BOTH sources land in one log', () => {
  const rows = T.seed([perf(), perf()], [game(), game(), game()], []);
  eq(rows.length, 5, 'every attempt from both collections');
  eq(rows.filter(r => r.src === 'marked').length, 2, 'marked submissions');
  eq(rows.filter(r => r.src === 'game').length, 3, 'game answers');
});

test('a game mode reaches the breakdown at all — the bug this feature fixes', () => {
  T.seed([perf()], [game({ mode: 'tcg-siege' }), game({ mode: 'tcg-duel' })], []);
  const by = T.sutByMode(T.sutVisible());
  ok(by.some(r => r.m.key === 'tcg-siege'), 'Orbital Siege must appear in the breakdown');
  ok(by.some(r => r.m.key === 'tcg-duel'), 'Nexus Duel must appear in the breakdown');
  eq(by.reduce((n, r) => n + r.n, 0), 3, 'the breakdown must account for every attempt');
});

test('the log is chronological, so the two sources interleave', () => {
  const rows = T.seed(
    [perf({ createdAt: new Date(Date.now() - 3 * DAY).toISOString() }),
     perf({ createdAt: new Date(Date.now() - 1 * DAY).toISOString() })],
    [game({ timestamp: new Date(Date.now() - 2 * DAY) })], []);
  eq(rows.map(r => r.src), ['marked', 'game', 'marked'], 'they must interleave by time, not by source');
});

test('the gap is measured ACROSS both sources', () => {
  const t0 = Date.now() - DAY;
  const rows = T.seed([perf({ createdAt: new Date(t0).toISOString() })],
                      [game({ timestamp: new Date(t0 + 10000) })], []);
  eq(rows[0].gap, null, 'the first question has no previous one');
  eq(rows[1].gap, 10000, 'a game answer ten seconds after a marked one is a ten-second gap');
});

test('a failed GAME read still leaves the marked half readable', () => {
  const rows = T.seed([perf(), perf()], [], []);
  eq(rows.length, 2, 'the marked record must stand on its own');
});

// ── which mode a marked attempt was done in ────────────────────────────────

test('the finer fields are used when they are there', () => {
  eq(T.sutPerfMode({ via: 'photo', source: 'bank' }), 'photo', 'a photo submission');
  eq(T.sutPerfMode({ practiceMode: true, source: 'bank' }), 'ai-practice', 'AI practice');
});

test('an attempt written BEFORE those fields existed still names a mode', () => {
  // This is the compatibility promise: the log must never depend on a Cloud
  // Functions deploy having happened, or every attempt in the record so far
  // reads as blank.
  eq(T.sutPerfMode({ source: 'bank' }), 'marked', 'an old bank attempt');
  eq(T.sutPerfMode({ source: 'generated' }), 'generated', 'an old generated attempt');
  eq(T.sutPerfMode({ source: 'starter' }), 'starter', 'an old starter attempt');
  eq(T.sutPerfMode({}), 'marked', 'an attempt with nothing at all still names a mode');
});

// ── modes ───────────────────────────────────────────────────────────────────

test('a known mode is named, not printed raw', () => {
  eq(T.usageMode('tcg-siege').label, 'Orbital Siege', 'the Siege label');
  eq(T.usageMode('tcg-siege').group, 'game', 'the Siege group');
  eq(T.usageMode('marked').group, 'practice', 'marked practice groups as practice');
});

test('an UNKNOWN mode keeps its own string and is never merged away', () => {
  const a = T.usageMode('some-new-game'), b = T.usageMode('another-new-game');
  eq(a.label, 'some-new-game', 'an unlabelled mode must show as itself');
  ok(a.key !== b.key, 'two unlabelled modes must stay distinguishable');
  T.seed([], [game({ mode: 'some-new-game' }), game({ mode: 'another-new-game' })], []);
  eq(T.sutByMode(T.sutVisible()).length, 2, 'they must be two rows, not one');
});

test('every group is one the CSS can paint', () => {
  const allowed = ['practice', 'game', 'other'];
  Object.entries(T.MODES).forEach(([k, m]) => {
    ok(allowed.indexOf(m.group) >= 0, 'mode ' + k + ' has group "' + m.group + '", which has no chip colour');
    ok(m.label && m.icon, 'mode ' + k + ' is missing a label or icon');
  });
});

test('practice sorts ahead of the games, so a teacher reads the schoolwork first', () => {
  T.seed([perf()], [game(), game(), game()], []);
  eq(T.sutByMode(T.sutVisible())[0].m.group, 'practice',
     'practice must come first even when a game has more attempts');
});

// ── the result ──────────────────────────────────────────────────────────────

test("the SERVER's verdict wins over a recomputed credit", () => {
  // The marker decided "partial"; nothing here may overrule it, or the tracker
  // and the pupil's own result screen disagree about the same attempt.
  const rows = T.seed([perf({ verdict: 'partial', marks: 2, outOf: 2, credit: 1 })], [], []);
  eq(T.sutVerdict(rows[0]).key, 'partial', 'the marker had the last word');
});

test('a game answer with no verdict falls back to its credit at the 0.95 floor', () => {
  const rows = T.seed([], [game({ score: 1, totalBlanks: 1 }), game({ score: 0, totalBlanks: 1 })], []);
  eq(T.sutVerdict(rows[0]).key, 'correct', 'a right answer');
  eq(T.sutVerdict(rows[1]).key, 'wrong', 'a wrong answer');
});

test('a part-right answer is its own verdict, not a wrong one', () => {
  const rows = T.seed([perf({ verdict: '', marks: 1, outOf: 2, credit: 0.5 })], [], []);
  eq(T.sutVerdict(rows[0]).key, 'partial', 'half marks is part right');
});

test('credit cannot leave the 0..1 range however it arrives', () => {
  const rows = T.seed([perf({ credit: 4 }), perf({ credit: -2 })], [], []);
  eq(rows[0].credit, 1, 'an over-award clamps to full');
  eq(rows[1].credit, 0, 'a negative clamps to nothing');
});

// ── filters and the window the export shares ───────────────────────────────

test('the mode filter narrows to exactly that mode', () => {
  T.seed([perf()], [game({ mode: 'tcg-siege' }), game({ mode: 'tcg-duel' })], []);
  T.filter('mode', 'tcg-siege');
  const v = T.sutVisible();
  eq(v.length, 1, 'rows left standing');
  eq(v[0].mode, 'tcg-siege', 'the mode that survived');
  T.filter('mode', '');
});

test('the date window keeps today and drops last month', () => {
  T.seed([perf({ createdAt: new Date().toISOString() }),
          perf({ createdAt: new Date(Date.now() - 40 * DAY).toISOString() })], [], []);
  T.filter('days', '7');
  eq(T.sutVisible().length, 1, 'the last seven days');
  T.filter('days', '');
  eq(T.sutVisible().length, 2, 'all time puts them back');
});

test('the search reads the question and its topic', () => {
  T.seed([perf({ questionTitle: 'Fractions of a whole', topic: 'Fractions' }),
          perf({ questionId: 'zz', questionTitle: 'Speed and distance', topic: 'Rate' })], [], []);
  T.filter('search', 'speed');
  eq(T.sutVisible().length, 1, 'matched by title');
  T.filter('search', 'fractions');
  eq(T.sutVisible().length, 1, 'matched by topic');
  T.filter('search', '');
});

test('the filters compose rather than override one another', () => {
  T.seed([], [game({ mode: 'tcg-siege', score: 1 }), game({ mode: 'tcg-siege', score: 0 }),
              game({ mode: 'tcg-duel', score: 1 }),
              game({ mode: 'tcg-siege', score: 1, timestamp: new Date(Date.now() - 40 * DAY) })], []);
  T.filter('mode', 'tcg-siege'); T.filter('result', 'correct'); T.filter('days', '7');
  eq(T.sutVisible().length, 1, 'Siege + correct + this week');
  T.filter('mode', ''); T.filter('result', ''); T.filter('days', '');
});

// ── the question a row is about ─────────────────────────────────────────────

test('the title comes from the BANK, so a game attempt that stored none names it', () => {
  const rows = T.seed([], [game({ questionId: 'q9', questionTitle: '' })],
                      [{ id: 'q9', title: 'Ratio and proportion', topic: 'Ratio' }]);
  eq(rows[0].title, 'Ratio and proportion', 'the resolved title');
  eq(rows[0].topic, 'Ratio', 'the resolved topic');
  eq(rows[0].gone, false, 'it is still in the bank');
});

test('the LIVE bank title wins over the one frozen on the attempt', () => {
  const rows = T.seed([perf({ questionId: 'q9', questionTitle: 'Old wording' })], [],
                      [{ id: 'q9', title: 'New wording' }]);
  eq(rows[0].title, 'New wording', 'an edited question must not show its old title forever');
});

test('a question deleted since is SAID to be gone, never dropped from the log', () => {
  const rows = T.seed([perf({ questionId: 'vanished', questionTitle: 'Old question' })], [], []);
  eq(rows[0].gone, true, 'it must be flagged as removed');
  eq(rows[0].title, 'Old question', 'the stamped title still stands in');
  eq(T.sutVisible().length, 1, 'the work was still done — the row must stay');
});

test('a row with no title at all is still identifiable', () => {
  const rows = T.seed([], [game({ questionId: 'abcdef123456', questionTitle: '' })], []);
  ok(rows[0].title.includes('abcdef'), 'it must fall back to the id, never to a blank cell');
});

// ── run ─────────────────────────────────────────────────────────────────────

const only = process.argv[2];
let pass = 0, fail = 0;
for (const c of cases) {
  if (only && c.name !== only) continue;
  try { c.fn(); pass++; console.log('  ✅ ' + c.name); }
  catch (e) { fail++; console.log('  ❌ ' + c.name + '\n       ' + e.message); }
}
console.log('\n' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
