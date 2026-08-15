// Regression tests for THE SUBJECT SWITCHER and ⚡ RAPID ADD'S BATCH LEVEL.
// Run with:
//     node tools/subject-level-tests.mjs            all cases
//     node tools/subject-level-tests.mjs <name>     one case
//
// The whole app is one file, so this reads the module out of index.html as
// TEXT and evaluates only the two sections it is about. It is the first
// harness in this repo; the house rule (extract the module, `node --check`)
// still applies and this does not replace it.
//
// Both features fail SILENTLY, in opposite directions, and neither throws:
//
//  • THE SWITCHER is four links. A url pointing at the wrong folder does not
//    error — it loads a working app, the WRONG subject's, and a pupil who
//    lands in Science when they pressed English reads that as the app being
//    broken. The Science one is the trap: its repo, and therefore its folder,
//    is `cer`, so the obvious `../science/` is a 404 for every pupil at once.
//  • AN ABSOLUTE url is the slower version of the same failure. It works
//    perfectly today and pins all four apps to github.io on the day the centre
//    moves to a domain of its own.
//  • THE BATCH LEVEL stamps `q.level`, which is a real field here — but
//    `qLevelCeiling` takes the MAX over that field AND the front of every
//    `los` tag, so one P6 objective on a question stamped P5 makes it a P6
//    question again while its level badge still reads P5. That is the whole
//    reason `rapidApplyLevel` filters the tags as well as writing the field.
import fs from 'fs';

const HTML = new URL('../index.html', import.meta.url).pathname;
const src = fs.readFileSync(HTML, 'utf8');

const cut = (from, to, what) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(what + ': "' + from + '" not found in index.html');
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error(what + ': end marker not found');
  return src.slice(a, b);
};

const FIXTURE = `
const SYL_LEVELS = ['P1','P2','P3','P4','P5','P6'];
function escapeHtml(s) { return String(s == null ? '' : s); }
`;

const section = [
  cut('const SUBJECT_KEY =', '\n// The menu is BUILT from SUBJECT_APPS', 'subject table'),
  cut('function rapidApplyLevel(q, level)', '\nfunction startRapidJob(file)', 'level stamp'),
  FIXTURE
].join('\n');

const M = new Function(section +
  '\nreturn { SUBJECT_KEY, SUBJECT_APPS, subjectCurrent, rapidApplyLevel, SYL_LEVELS };')();

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error((what || 'value') + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
  }
};

// ── the switcher: four links that have to go where they say ─────────────────

test('all four subjects are listed, once each', () => {
  eq(M.SUBJECT_APPS.length, 4, 'there are not four subjects');
  const keys = M.SUBJECT_APPS.map(s => s.key).sort();
  eq(keys, ['chinese', 'english', 'math', 'science'], 'the four subject keys');
  eq(new Set(keys).size, 4, 'two subjects share a key — the menu would mark the wrong one "You are here"');
});

test('every subject has something to show and somewhere to go', () => {
  M.SUBJECT_APPS.forEach(s => {
    ok(s.ico && s.ico.trim(), s.key + ' has no icon — the narrow pill is icon-only, so it would show nothing at all');
    ok(s.label && s.label.trim(), s.key + ' has no label');
    ok(s.sub && s.sub.trim(), s.key + ' has no sub-title');
    ok(s.url && s.url.trim(), s.key + ' has no url');
  });
});

test('THIS app knows which of the four it is', () => {
  // subjectCurrent falls back to SUBJECT_APPS[0], so a SUBJECT_KEY that matches
  // nothing does not throw — it just labels the app as the wrong subject and
  // offers a link back to the app you are already in.
  eq(M.SUBJECT_KEY, 'math', 'SUBJECT_KEY is not this app');
  ok(M.SUBJECT_APPS.find(s => s.key === M.SUBJECT_KEY), 'SUBJECT_KEY names no subject in SUBJECT_APPS');
  eq(M.subjectCurrent().key, M.SUBJECT_KEY, 'subjectCurrent() fell through to the first entry');
});

test('Science lives at ../cer/ — the folder is the REPO name, not the subject', () => {
  eq(M.SUBJECT_APPS.find(s => s.key === 'science').url, '../cer/', 'the Science url');
  eq(M.SUBJECT_APPS.find(s => s.key === 'math').url, '../math/');
  eq(M.SUBJECT_APPS.find(s => s.key === 'english').url, '../english/');
  eq(M.SUBJECT_APPS.find(s => s.key === 'chinese').url, '../chinese/');
});

test('every url is RELATIVE — no host is baked into the app', () => {
  M.SUBJECT_APPS.forEach(s => {
    ok(!/^[a-z]+:/i.test(s.url), s.key + ': "' + s.url + '" names a protocol');
    ok(!/^\/\//.test(s.url), s.key + ': "' + s.url + '" is protocol-relative, which still pins the host');
    ok(s.url.startsWith('../'), s.key + ': "' + s.url + '" is not a sibling-folder hop');
    ok(s.url.endsWith('/'), s.key + ': "' + s.url + '" should end in / so the folder index is served');
  });
});

// ── the batch level ────────────────────────────────────────────────────────

test('the level is stamped on the question', () => {
  const q = { level: 'P3' };
  M.rapidApplyLevel(q, 'P5');
  eq(q.level, 'P5', 'the batch level did not overwrite what the AI read');
});

test('no level chosen changes nothing at all', () => {
  const q = { level: 'P3', los: ['P6.FR.2.6'] };
  M.rapidApplyLevel(q, '');
  eq(q.level, 'P3', 'an unlevelled batch overwrote the level the AI read');
  eq(q.los, ['P6.FR.2.6'], 'an unlevelled batch dropped an objective');
});

test('an objective ABOVE the level is dropped', () => {
  // qLevelCeiling takes the MAX over the level field and every tag, so one P6
  // objective silently makes a question stamped P5 a P6 question — and the
  // level badge on the vetting card still reads P5.
  const q = { los: ['P5.FR.2.6', 'P6.ALG.1.1', 'P4.WN.3.2'] };
  M.rapidApplyLevel(q, 'P5');
  eq(q.los, ['P5.FR.2.6', 'P4.WN.3.2'], 'a higher-level objective survived the batch level');
});

test('objectives AT or BELOW the level are all kept', () => {
  // Revision downwards is the point — a P5 question may legitimately assess a
  // P3 objective, and dropping it would lose the filing for no reason.
  const q = { los: ['P1.WN.1.1', 'P3.FR.2.1', 'P5.RAT.1.1'] };
  M.rapidApplyLevel(q, 'P5');
  eq(q.los, ['P1.WN.1.1', 'P3.FR.2.1', 'P5.RAT.1.1'], 'a valid objective was thrown away');
});

test('an objective id that names no level is kept', () => {
  // Never drop filing on something merely unrecognised — qLos already
  // validates ids against the syllabus, and this must not be a second, blunter
  // filter that silently unfiles a question.
  const q = { los: ['weird-id', 'P6.ALG.1.1'] };
  M.rapidApplyLevel(q, 'P5');
  eq(q.los, ['weird-id'], 'an unrecognised id was dropped, or the P6 one was kept');
});

test('a question with no objectives at all survives', () => {
  const q = {};
  M.rapidApplyLevel(q, 'P5');
  eq(q.level, 'P5');
  eq(q.los, undefined, 'an empty objective list was invented');
});

test('every level the picker offers is one rapidApplyLevel accepts', () => {
  // The picker is built from SYL_LEVELS, and qLevelCeiling matches /P[1-6]/ —
  // a level in the list that the ceiling cannot read is one whose questions
  // are never capped for anybody.
  M.SYL_LEVELS.forEach(lv => {
    ok(/^P[1-6]$/.test(lv), 'SYL_LEVELS holds "' + lv + '", which qLevelCeiling cannot read');
    const q = { los: ['P6.ALG.1.1'] };
    M.rapidApplyLevel(q, lv);
    eq(q.level, lv, 'level ' + lv + ' did not stamp');
  });
});

// ── runner ───────────────────────────────────────────────────────────────────

const only = process.argv[2];
let passed = 0, failed = 0;
for (const c of cases) {
  if (only && c.name !== only) continue;
  try { c.fn(); console.log('  ok   ' + c.name); passed++; }
  catch (err) { console.log('  FAIL ' + c.name + '\n         ' + err.message); failed++; }
}
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
