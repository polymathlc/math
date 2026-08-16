// Regression tests for DELETING SEVERAL VETTING QUESTIONS AT ONCE.
// Run with:
//     node tools/vetting-bulk-delete-tests.mjs            all cases
//     node tools/vetting-bulk-delete-tests.mjs <name>     one case
//
// It loads the REAL bulk-delete block out of index.html and runs it against a
// shimmed page. This is the most destructive button in the app — one press can
// clear the whole vetting list — and what makes it safe to offer at all is
// that every route goes to the 🗑️ Bin rather than destroying anything. Each
// way that can break is silent:
//
//  • THE BIN COPY MUST BE WRITTEN FIRST. Delete the vetting doc before the bin
//    write lands and a failed write has destroyed the question outright. The
//    order is the whole guarantee, and nothing on screen would show it had
//    been reversed.
//  • A FAILED BIN WRITE MUST LEAVE THE QUESTION ALONE — still in the list,
//    still in vetting, and reported. Dropping it from `vettingList` anyway
//    looks perfectly tidy and the question is back at the next sign-in.
//  • `deletedFrom` MUST SAY "vetting". Restore puts a question back where it
//    was deleted from, so a bulk-deleted draft restored to the BANK is an
//    unchecked question served to students by an undo.
//  • THE TICKS MUST BE PRUNED. A question approved into the bank while ticked
//    is no longer a thing to delete, and a stale id is how "3 selected"
//    outlives the cards it counted.
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

// The page these tests run against. Everything the real block reaches out to
// is here and nothing else, so a change to the block is the only thing that
// can move a result.
const FIXTURE = `
const BIN_KEEP_DAYS = 7;
let vettingList = [];
let _rapidJustAdded = new Set();
let renders = 0;
let admin = true;
const toasts = [];
const confirms = [];
// The order the two writes actually happened in, per question. This is the
// guarantee the whole feature rests on, so it is recorded rather than assumed.
const trail = [];
const binned = [];
let refuseBin = new Set();      // binMove throws for these — "the copy failed"
let refuseDrop = new Set();     // deleteVettingDoc throws for these

function $() { return null; }   // no bulk bar: the tests read state, not html
function canManageQuestions() { return admin; }
function confirm(msg) { confirms.push(msg); return true; }
async function binMove(q, from) {
  trail.push('bin:' + q.id);
  if (refuseBin.has(q.id)) throw new Error('bin write refused');
  binned.push({ id: q.id, deletedFrom: from });
  return { id: 'bin__' + q.id, deletedFrom: from };
}
async function deleteVettingDoc(id) {
  trail.push('drop:' + id);
  if (refuseDrop.has(id)) throw new Error('vetting delete refused');
}
function renderVettingList() { renders++; }
function toast(msg, kind) { toasts.push({ msg, kind }); }
// The block console.errors a delete it could not do, and several cases here
// make it fail on purpose. Recorded rather than printed, so a real failure
// still shows up as a FAILING CASE and not as noise scrolled past.
const logged = [];
const console = { error: e => logged.push(e), warn: e => logged.push(e), log: () => {} };
`;

const block = cut(
  '// Ticked ids. Deliberately not a flag on the question objects',
  '\n// =====================================================================\n// THE BIN — where a deleted question waits out its seven days.',
  'bulk delete block'
);

const mk = () => new Function(FIXTURE + block + `
return {
  logged: () => logged,
  state: () => ({ vettingList, binned, trail, toasts, confirms, renders,
                  selected: Array.from(_vetSelected), busy: _vetBulkBusy }),
  seed(list) { vettingList = list; },
  refuseBin(ids) { refuseBin = new Set(ids); },
  refuseDrop(ids) { refuseDrop = new Set(ids); },
  noAdmin() { admin = false; },
  prune: vetPruneSelection,
  selToggle: vetSelToggle, selAll: vetSelAll,
  deleteMany: vetDeleteMany,
  deleteSelected: vetDeleteSelected,
  deleteAll: vetDeleteAll,
};`)();

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error((what || 'value') + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
  }
};
const q = id => ({ id, title: id + ' question' });
const ids = list => list.map(x => x.id);
// The two buttons fire the batch from inside the confirm and do not await it.
const settle = () => new Promise(r => setTimeout(r, 0));
const seedThree = M => M.seed([q('a'), q('b'), q('c')]);

// ── nothing is destroyed: the bin copy goes first ───────────────────────────

test('the bin copy is written BEFORE the vetting doc is deleted', async () => {
  const M = mk(); seedThree(M);
  await M.deleteMany(['a', 'b']);
  eq(M.state().trail, ['bin:a', 'drop:a', 'bin:b', 'drop:b'], 'the write order');
});

test('every bulk-deleted question is filed as coming FROM VETTING', async () => {
  // Restore puts a question back where it was deleted from. Filed as "bank",
  // an undo would serve an unchecked draft straight to students.
  const M = mk(); seedThree(M);
  await M.deleteMany(['a', 'b', 'c']);
  M.state().binned.forEach(b => eq(b.deletedFrom, 'vetting', b.id + ' was filed as coming from the wrong place'));
});

test('a failed BIN WRITE leaves the question in vetting, undeleted', async () => {
  const M = mk(); seedThree(M);
  M.refuseBin(['b']);
  await M.deleteMany(['a', 'b', 'c']);
  ok(!M.state().trail.includes('drop:b'), 'the vetting doc was deleted after the bin copy failed — the question is gone');
  eq(ids(M.state().vettingList), ['b'], 'a question that was never binned was dropped from the list');
  ok(M.state().toasts.some(t => t.kind === 'error'), 'a failed delete was reported as a success');
});

test('a failed VETTING DELETE leaves the question in the list', async () => {
  // The bin copy exists, the original would not go. Better a question in both
  // places than a list that has dropped one the database still holds.
  const M = mk(); seedThree(M);
  M.refuseDrop(['c']);
  await M.deleteMany(['a', 'b', 'c']);
  eq(ids(M.state().vettingList), ['c'], 'a question the database still holds was dropped from the list');
});

test('a batch that fails ENTIRELY changes nothing and never claims success', async () => {
  const M = mk(); seedThree(M);
  M.refuseBin(['a', 'b', 'c']);
  await M.deleteMany(['a', 'b', 'c']);
  eq(ids(M.state().vettingList), ['a', 'b', 'c'], 'the list');
  eq(M.state().binned, [], 'something reached the bin');
  ok(!M.state().toasts.some(t => t.kind === 'success'), 'a batch that deleted nothing claimed success');
});

test('a non-admin cannot bulk delete anything', async () => {
  const M = mk(); seedThree(M);
  M.noAdmin();
  await M.deleteMany(['a', 'b', 'c']);
  eq(M.state().trail, [], 'a non-admin reached the database');
  eq(ids(M.state().vettingList), ['a', 'b', 'c'], 'the list');
});

// ── the two buttons ─────────────────────────────────────────────────────────

test('DELETE ALL deletes the whole list', async () => {
  const M = mk(); seedThree(M);
  M.deleteAll(); await settle();
  eq(ids(M.state().binned).sort(), ['a', 'b', 'c'], 'what reached the bin');
  eq(M.state().vettingList, [], 'the list was not cleared');
});

test('DELETE ALL on an empty list confirms nothing and deletes nothing', () => {
  const M = mk(); M.seed([]);
  M.deleteAll();
  eq(M.state().confirms.length, 0, 'an empty list still asked for a confirmation');
  eq(M.state().binned, [], 'an empty list deleted something');
});

test('the confirm says how many go AND that the bin can undo it', () => {
  const M = mk(); seedThree(M);
  M.deleteAll();
  const msg = M.state().confirms[0];
  ok(/\b3\b/.test(msg), 'the confirm does not say how many go: ' + msg);
  ok(/Bin/.test(msg), 'the confirm does not say the delete is undoable: ' + msg);
});

test('DELETE SELECTED deletes exactly the ticked questions', async () => {
  const M = mk(); seedThree(M);
  M.selToggle('a', true); M.selToggle('c', true);
  M.deleteSelected(); await settle();
  eq(ids(M.state().binned).sort(), ['a', 'c'], 'what reached the bin');
  eq(ids(M.state().vettingList), ['b'], 'an unticked question was deleted');
});

test('DELETE SELECTED with nothing ticked deletes nothing', () => {
  const M = mk(); seedThree(M);
  M.deleteSelected();
  eq(M.state().confirms.length, 0, 'an empty selection asked for a confirmation');
  eq(M.state().binned, [], 'an empty selection deleted something');
});

// ── the selection ───────────────────────────────────────────────────────────

test('SELECT ALL ticks and unticks the whole list', () => {
  const M = mk(); seedThree(M);
  M.selAll(true);
  eq(M.state().selected.sort(), ['a', 'b', 'c'], 'select all');
  M.selAll(false);
  eq(M.state().selected, [], 'unticking select all left ticks behind');
});

test('a tick on a question that has LEFT the list is pruned', () => {
  // Approved into the bank, edited away, deleted singly — every route ends
  // here, which is what keeps a path added later safe.
  const M = mk(); seedThree(M);
  M.selAll(true);
  M.seed([q('a'), q('b')]);
  M.prune();
  eq(M.state().selected.sort(), ['a', 'b'], 'a tick outlived its question');
});

test('a deleted question is dropped from the selection too', async () => {
  const M = mk(); seedThree(M);
  M.selAll(true);
  await M.deleteMany(['a']);
  ok(!M.state().selected.includes('a'), 'a deleted question stayed ticked');
});

// ── guards ──────────────────────────────────────────────────────────────────

test('a second press while a batch is running is ignored', async () => {
  const M = mk(); seedThree(M);
  const first = M.deleteMany(['a', 'b']);
  await M.deleteMany(['c']);          // fired mid-batch
  await first;
  ok(!ids(M.state().binned).includes('c'), 'a second batch ran on top of the first');
});

test('the busy flag is cleared even when every delete fails', async () => {
  const M = mk(); seedThree(M);
  M.refuseBin(['a', 'b', 'c']);
  await M.deleteMany(['a', 'b', 'c']);
  eq(M.state().busy, null, 'the page was left stuck on "Moving … to the bin"');
});

test('the list is redrawn when a batch ends', async () => {
  const M = mk(); seedThree(M);
  await M.deleteMany(['a']);
  ok(M.state().renders > 0, 'the list was never redrawn');
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
