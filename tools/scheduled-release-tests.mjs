// Regression tests for ⏳ SCHEDULED RELEASE — a question that is IN the bank
// and not yet due.  Run with:  node tools/scheduled-release-tests.mjs
//
// The whole app is one file, so this reads the module out of index.html as
// TEXT and evaluates only the two sections it is about.
//
// ⚡ Rapid add can file a whole batch with a release date on it: the questions
// go into Vetting as they always did, are approved into the bank as they always
// were, and are simply not LOADED by a student's app until that morning. Every
// way that goes wrong is silent, and each one lands on a class:
//
//  • THE GATE IS THE LOAD, and it is the only one there is. `questionBank` IS
//    the practice list here — walked by index from half a dozen places — so
//    there is no per-pool chokepoint to census. Lose the one line in `loadBank`
//    and next term's paper is in front of a child this week, on a screen that
//    looks perfectly right, with nothing anywhere to say it happened.
//  • …AND IT MUST NOT BITE THE AUTHOR. Withhold it from an admin and the
//    question they just scheduled has vanished from their own bank, which reads
//    as a question that failed to save.
//  • A GATE THAT IS TOO EAGER is worse in the other direction: a value that is
//    not a day key, or a date that has already come round, must leave the
//    question behaving exactly as an unscheduled one. A question withheld from
//    a whole school for ever by a field nobody can read is the silent
//    disappearance this file spends its guards preventing.
//  • THE DAY IS SINGAPORE'S. Read it off the device and a paper is out a day
//    early on half the class's phones and a day late on the rest.
//  • A BATCH READ LATE is a batch filed wrong. A forty-page paper takes minutes
//    to render with the pad open the whole time, so the date has to be captured
//    when the file is QUEUED — the rule the batch level already follows.
//  • A SCHEDULE NOBODY CAN SEE is a schedule nobody can undo.
import fs from 'fs';

const HTML = new URL('../index.html', import.meta.url).pathname;
const src = fs.readFileSync(HTML, 'utf8');

const cut = (from, to, what) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(what + ': "' + from.slice(0, 46) + '" not found in index.html');
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error(what + ': end marker not found');
  return src.slice(a, b);
};

let fails = 0, ran = 0;
function ok(name, cond, extra) {
  ran++;
  if (cond) return;
  fails++;
  console.error('FAIL: ' + name + (extra ? '\n      ' + extra : ''));
}

/* ---------------- The REAL blocks, run as themselves ---------------- */
const core = cut('// ---- ⏳ Scheduled release — a question that is IN the bank and not yet due --',
                 'const QUESTION_KEY_FIELDS', 'core release block');
const pad = cut('// ---- 📅 The RELEASE DATE this batch is scheduled for ----------------------',
                '// ---- ⏳ Undoing it — the bar at the top of the Question Bank', 'rapid release block');

const store = {};
const shim = `
  const escapeHtml = s => String(s == null ? "" : s).replace(/[&<>"']/g,
    c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toasts = [];
  const toast = (m, k) => toasts.push([m, k]);
  const sessionStorage = {
    getItem: k => (k in __store ? __store[k] : null),
    setItem: (k, v) => { __store[k] = String(v); },
  };
  const $ = () => null;
`;
const api = new Function('__store', shim + core + pad + `
  return { RELEASE_TZ, RELEASE_DAY_RE, releaseDayKey, releaseToday, releaseDayFromNow,
           qReleaseOn, qScheduled, qReleased, qReleaseLabel, qReleaseDaysAway, qReleaseWhen,
           qReleaseChipHtml, RAPID_RELEASE_KEY, rapidRelease, setRapidRelease,
           rapidApplyRelease, toasts };
`)(store);

const TODAY = '2026-06-15';
const day = n => new Date(Date.parse(TODAY + 'T00:00:00+08:00') + n * 86400000)
  .toLocaleDateString('en-CA', { timeZone: 'Asia/Singapore' });

/* ---------------- The day key is SINGAPORE's ---------------- */
ok('the timezone is Singapore', api.RELEASE_TZ === 'Asia/Singapore');
ok('a day key is YYYY-MM-DD', /^\d{4}-\d{2}-\d{2}$/.test(api.releaseToday()));
ok('half past midnight in Singapore on the 1st is the 1st',
   api.releaseDayKey(new Date('2026-01-01T00:30:00+08:00')) === '2026-01-01');
ok('half past eleven on the 31st is still the 31st',
   api.releaseDayKey(new Date('2025-12-31T23:30:00+08:00')) === '2025-12-31');
ok('11pm UTC on the 31st is already the 1st in Singapore',
   api.releaseDayKey(new Date('2025-12-31T23:00:00Z')) === '2026-01-01',
   'a day read off the device puts a paper out early for half the class');
ok('tomorrow is one day on', api.releaseDayFromNow(1) > api.releaseToday());

/* ---------------- ONE reader, and it is strict ---------------- */
ok('a day key is read back', api.qReleaseOn({ releaseOn: '2026-06-20' }) === '2026-06-20');
ok('no field at all is no schedule', api.qReleaseOn({}) === '');
ok('nothing at all is no schedule', api.qReleaseOn(null) === '');
ok('an ISO TIMESTAMP is not a day key', api.qReleaseOn({ releaseOn: '2026-06-20T00:00:00Z' }) === '');
ok('a Date object is not a day key', api.qReleaseOn({ releaseOn: new Date() }) === '');
ok('a number is not a day key', api.qReleaseOn({ releaseOn: 20260620 }) === '');
ok('a half-written date is not a day key', api.qReleaseOn({ releaseOn: '2026-6-2' }) === '');

/* ---------------- Scheduled vs released ---------------- */
ok('a date in the future is scheduled', api.qScheduled({ releaseOn: day(1) }, TODAY) === true);
ok('…and is therefore NOT released', api.qReleased({ releaseOn: day(1) }, TODAY) === false);
ok('TODAY is released, not scheduled', api.qScheduled({ releaseOn: TODAY }, TODAY) === false,
   'a question released today is a question with no schedule left');
ok('a date that has passed is released', api.qReleased({ releaseOn: day(-40) }, TODAY) === true);
ok('an unscheduled question is released', api.qReleased({ title: 'x' }, TODAY) === true);
ok('nothing at all is released', api.qReleased(null, TODAY) === true);
ok('an unreadable value is served, never withheld',
   api.qReleased({ releaseOn: 'next term' }, TODAY) === true &&
   api.qReleased({ releaseOn: new Date() }, TODAY) === true,
   'a question withheld by a value nobody can read never comes back');

/* ---------------- The words a person reads ---------------- */
ok('a label names the day', /\b2027\b/.test(api.qReleaseLabel('2027-01-12')));
ok('a label of a non-date is empty', api.qReleaseLabel('soon') === '');
ok('the label does not slip a day west of Singapore',
   /12/.test(api.qReleaseLabel('2027-01-12')) && !/11/.test(api.qReleaseLabel('2027-01-12')));
ok('one day away reads "tomorrow"', api.qReleaseWhen(day(1), TODAY) === 'tomorrow');
ok('twelve days away says so', api.qReleaseWhen(day(12), TODAY) === 'in 12 days');
ok('days away is a whole number of days', api.qReleaseDaysAway(day(9), TODAY) === 9);

/* ---------------- The badge ---------------- */
const chip = api.qReleaseChipHtml({ releaseOn: api.releaseDayFromNow(3) });
ok('a scheduled question wears a chip', /⏳/.test(chip) && /Releases/.test(chip));
ok('the chip says WHY it is not being served', /does not even load it/.test(chip),
   'this app withholds it at the LOAD, so the chip has to say that and not something softer');
ok('the chip says where to undo it', /Question Bank/.test(chip));
ok('the chip takes the class it is given', /class="vet-badge sched"/.test(api.qReleaseChipHtml({ releaseOn: api.releaseDayFromNow(3) }, 'vet-badge')));
ok('a released question wears none', api.qReleaseChipHtml({ releaseOn: '2001-01-01' }) === '');
ok('an unscheduled question wears none', api.qReleaseChipHtml({}) === '');
ok('the chip escapes what it prints', !/<script/i.test(api.qReleaseChipHtml({ releaseOn: '<script>' })));

/* ---------------- The pad remembers a batch, not a fortnight ---------------- */
ok('the pad stores under its own key', api.RAPID_RELEASE_KEY === 'mathRapidRelease',
   'the four portals share one origin, so a shared key would be one portal setting another one’s batch');
api.setRapidRelease(api.releaseDayFromNow(4));
ok('a future date is kept', api.rapidRelease() === api.releaseDayFromNow(4));
api.setRapidRelease('');
ok('clearing it releases immediately', api.rapidRelease() === '');
api.setRapidRelease('2019-01-01');
ok('a date in the past is refused', api.rapidRelease() === '',
   'a pad left open overnight would stamp yesterday onto the morning batch');
ok('…and the author is told rather than left guessing', api.toasts.some(t => /after today/i.test(t[0])));
api.setRapidRelease('rubbish');
ok('a value that is not a date is refused', api.rapidRelease() === '');
store[api.RAPID_RELEASE_KEY] = '2019-05-05';   // a stale batch, read back next morning
ok('a stored date that has come round reads as none', api.rapidRelease() === '');

/* ---------------- The ONE writer ---------------- */
const stamp = iso => { const q = { id: 'q' }; api.rapidApplyRelease(q, iso); return q.releaseOn; };
ok('a future day key is stamped', stamp(api.releaseDayFromNow(5)) === api.releaseDayFromNow(5));
ok('no date writes NO field', stamp('') === undefined && stamp(null) === undefined && stamp(undefined) === undefined,
   'an unscheduled batch must leave the question byte-for-byte what it was');
ok('today writes no field', stamp(api.releaseToday()) === undefined);
ok('a date in the past writes no field', stamp('2001-01-01') === undefined);
ok('a value that is not a day key writes no field', stamp('next term') === undefined && stamp(20260101) === undefined);
ok('it never throws on a missing question', api.rapidApplyRelease(null, '2030-01-01') === null);

/* ---------------- THE GATE — the load, and only the load ---------------- */
{
  const load = cut('async function loadBank(uid) {', '\nfunction isPermissionError', 'loadBank');
  ok('a student does not load a question that is not out yet',
     /if \(!canManageQuestions\(\) && !qReleased\(q\)\) return;/.test(load),
     'this is the ONLY gate — lose it and next term’s paper is in front of a child this week');
  ok('…and it sits BEFORE the question is pushed',
     load.indexOf('!qReleased(q)') < load.indexOf('questionBank.push(q);'));
  ok('an AUTHOR keeps it', /!canManageQuestions\(\)/.test(load),
     'withheld from the admin too, the question they just scheduled reads as one that failed to save');
  ok("it is NOT in the answer-key half of the document",
     !/QUESTION_KEY_FIELDS = \[[^\]]*releaseOn/.test(src),
     'the student’s own client is what has to act on it, so it has to be in the half they are sent');
}

/* ---------------- The batch is captured ONCE and carried ---------------- */
const door = cut('function rapidAddFiles(files, how) {', 'function _rapidQueuePdf(', 'rapidAddFiles');
ok('the ONE DOOR reads the release date synchronously', /const release = rapidRelease\(\);/.test(door));
ok('…and hands it to every job it starts',
   (door.match(/startRapidJob\(file, level, \{ release \}\)/g) || []).length === 2);
ok('the queue tells the author a date is on the batch', /released/.test(door));

const startJob = cut('function startRapidJob(file, level, opts) {', '\nasync function processRapidJob', 'startRapidJob');
ok('startRapidJob captures the date on the same footing as the level',
   /const rel = \(o\.release === undefined \|\| o\.release === null\) \? rapidRelease\(\) : o\.release;/.test(startJob),
   'a caller that passes none must still behave exactly as it always did');
ok('the job card carries it', /release: rel,/.test(startJob));
ok('it is handed ON to the job rather than re-read there',
   /processRapidJob\(jobId, file, lv, Object\.assign\(\{\}, o, \{ release: rel \}\)\)/.test(startJob));
ok('a PDF carries the date into the PDF queue',
   /_rapidQueuePdf\(file,[\s\S]{0,220}o\.release === undefined \|\| o\.release === null\) \? rapidRelease\(\) : o\.release\)/.test(startJob));

const expand = cut('async function _rapidExpandPdf(file, level, release) {', '\nfunction startRapidJob(', '_rapidExpandPdf');
ok('every page of a PDF is queued with the batch date', /^\s*release,$/m.test(expand),
   'a forty-page paper takes minutes, and the picker is live the whole time');
const queue = cut('function _rapidQueuePdf(', 'async function _rapidExpandPdf', '_rapidQueuePdf');
ok('the PDF queue stores the date', /_rapidPdfQueue\.push\(\{ file, level, release \}\)/.test(queue));
ok('…and the pump forwards it', /_rapidExpandPdf\(next\.file, next\.level, next\.release\)/.test(queue));

const job = cut('async function processRapidJob(jobId, file, batchLevel, opts) {', '\n// Turn one AI reading into a question object', 'processRapidJob');
ok('EVERY question the page held is stamped', /rapidApplyRelease\(q, o\.release\);/.test(job));
ok('the stamp happens beside the level', job.indexOf('rapidApplyLevel(q, batchLevel);') < job.indexOf('rapidApplyRelease(q, o.release);'));

const bulk = cut('async function handleBulkPaper(file) {', '\nwindow.addEventListener("beforeunload"', 'handleBulkPaper');
ok('the 📄 paper import captures the date once, before the read', /const batchRelease = rapidRelease\(\);/.test(bulk));
ok('…and stamps every question the paper held', /rapidApplyRelease\(q, batchRelease\);/.test(src));

/* ---------------- The badge is on every author surface ---------------- */
{
  const vet = cut('function renderVettingList() {', '\nasync function vetApprove', 'renderVettingList');
  ok('the vetting card shows the schedule', /qReleaseChipHtml\(q, "vet-badge"\)/.test(vet));
  const bank = cut('function renderBank() {', '\nasync function removeQuestion', 'renderBank');
  ok('the bank list card shows it', /qReleaseChipHtml\(q\)/.test(bank));
  ok('the ⏳ bar is painted whenever the bank is', /renderBankScheduled\(\)/.test(bank));
  const tile = cut('function bankTileHtml(q) {', '\nfunction renderBankTiles', 'bankTileHtml');
  ok('the bank grid tile shows it', /qReleaseChipHtml\(q\)/.test(tile));
}

/* ---------------- Undoing it ---------------- */
{
  const undo = cut('async function bankSetRelease(id, iso) {', 'function bankAfterRelease', 'bankSetRelease');
  ok('only an author may move a release date', /if \(!canManageQuestions\(\)\) return false;/.test(undo),
     'it writes to the bank, and a bar that is never drawn for a student is not a lock');
  ok('a write that did not land is rolled back', /if \(prev === undefined\) delete q\.releaseOn; else q\.releaseOn = prev;/.test(undo),
     'a page that has released a question the database still holds back looks right until the next sign-in');
  ok('it looks in the vetting list too', /vettingList\.find/.test(undo),
     'a batch is very often still in vetting when the teacher comes looking');
  const rows = cut('function bankScheduledRows() {', 'function renderBankScheduled', 'bankScheduledRows');
  ok('the bar lists both lists', /take\(questionBank, "bank"\);/.test(rows) && /take\(vettingList, "vetting"\);/.test(rows));
  ok('soonest first', /localeCompare/.test(rows));
}

/* ---------------- Nothing new to run, nothing new to deploy ---------------- */
ok('this writes no collection of its own', !/scheduledReleases|releaseQueue/.test(src),
   'a release here is not an event — the comparison simply starts coming out the other way');

console.log((fails ? '✗ ' : '✓ ') + (ran - fails) + '/' + ran + ' scheduled-release checks passed');
process.exit(fails ? 1 : 0);
