// Regression tests for THE EDITABLE WORKSHEET HEADER — the title and the line
// under it, retyped straight on the sheet's own preview.
// Run with:
//     node tools/worksheet-header-tests.mjs            all cases
//     node tools/worksheet-header-tests.mjs <name>     one case
//
// It loads the REAL header block and the REAL save function out of index.html
// and runs them against a shimmed page. Every way this breaks is silent — the
// preview looks the same and the printed sheet looks the same:
//
//  • THE EDITABLE HEADER MUST BE THE OWNER'S ONLY. A student can open the
//    teacher's sheet from the same list; a contenteditable header there is a
//    field that looks editable, isn't saveable, and prints somebody else's
//    title. `wsPreviewHeaderSave` re-checks ownership rather than trusting the
//    flag the preview window was built with an hour ago.
//  • THE COVER AND THE HEADER MUST CARRY THE SAME FIELD NAMES. They are the
//    same two values printed twice, so the preview updates both from one edit.
//    Rename one and the document silently prints two different titles.
//  • AN EMPTY LINE IS NOT A MISSING ONE. `headerOrg: ""` means the teacher
//    cleared it and the sheet prints nothing there; a sheet saved before the
//    field existed has no field at all and prints the default. Collapse the two
//    with `|| DEFAULT` and a cleared line comes back on the next print.
//  • A FAILED WRITE MUST PUT THE IN-MEMORY COPY BACK. The preview reverts on a
//    rejection, so a parent tab holding the new title while the database holds
//    the old one is two surfaces disagreeing with no way to tell which is real.
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

// Everything the two blocks reach out to, and nothing else.
const FIXTURE = `
const escapeHtml = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
const WS_COVER_LOGO = "logo.png";
const WS_LOGO_FALLBACK = "fallback.png";
let sheets = [];
let me = "teacher";
let refuseWrite = false;
let renders = 0;
const writes = [];
const toasts = [];
function wsFind(id) { return sheets.find(w => w.id === id) || null; }
function wsMine(ws) { return !!(ws && ws.ownerUid === me); }
function dgIsTest(ws) { return !!ws && ws.kind === "diagnostic"; }
async function persistWorksheet(ws) {
  if (refuseWrite) throw new Error("write refused");
  writes.push(JSON.parse(JSON.stringify(ws)));
}
function renderSavedWorksheets() { renders++; }
function renderDiagnosticPage() { renders++; }
function renderWorksheetOverview() { renders++; }
function toast(msg, kind) { toasts.push({ msg, kind }); }
function $() { return null; }        // no diagnostic page in the fixture
let _wvWs = null;
`;

const headerBlock = cut(
  'const WS_HEADER_ORG = "Polymath Learning Centre";',
  '// The footer that prints at the bottom LEFT of every sheet',
  'header block'
);
// The script the preview window carries — written by the app, run in the
// window it opened.
const scriptBlock = cut(
  'const WS_EDIT_HINT =',
  '// Print and Preview are the SAME document',
  'preview edit script'
);
const saveBlock = cut(
  '// ============ EDITING THE SHEET HEADER FROM ITS OWN PREVIEW ============',
  'window.wsPreviewHeaderSave = wsPreviewHeaderSave;',
  'header save block'
);

const mk = () => new Function(FIXTURE + headerBlock + scriptBlock + saveBlock + `
return {
  state: () => ({ sheets, writes, toasts, renders }),
  seed(list) { sheets = list; },
  asStudent() { me = "pupil"; },
  refuse() { refuseWrite = true; },
  save: wsPreviewHeaderSave,
  header: wsHeaderHtml,
  cover: wsCoverHtml,
  orgOf: wsHeaderOrgOf,
  script: wsHeaderEditScript,
  MAX: WS_HEADER_MAX,
  DEFAULT_ORG: WS_HEADER_ORG,
};`)();

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error((what || 'value') + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
  }
};
const sheet = (over = {}) => Object.assign({ id: 'ws1', title: 'Fractions', ownerUid: 'teacher', questionIds: ['q1'] }, over);
const rejects = async (fn, what) => {
  try { await fn(); } catch (e) { return e; }
  throw new Error(what);
};

// ── who may retype the header ───────────────────────────────────────────────

test('the OWNER may retype the title', async () => {
  const M = mk(); M.seed([sheet()]);
  const stored = await M.save('ws1', 'title', '  P5 Fractions  Paper 1 ');
  eq(stored, 'P5 Fractions Paper 1', 'what was stored');
  eq(M.state().sheets[0].title, 'P5 Fractions Paper 1', 'the in-memory copy');
  eq(M.state().writes.length, 1, 'writes');
});

test("a sheet the signed-in user does NOT own is refused", async () => {
  // A student can open the teacher's sheet from My Worksheets and press
  // Preview — the header must not be retitleable from there.
  const M = mk(); M.seed([sheet()]);
  M.asStudent();
  await rejects(() => M.save('ws1', 'title', 'Mine now'), 'a non-owner retitled somebody else\'s sheet');
  eq(M.state().sheets[0].title, 'Fractions', 'the title was changed anyway');
  eq(M.state().writes.length, 0, 'a non-owner reached the database');
});

test('a worksheet the tab no longer holds is refused', async () => {
  const M = mk(); M.seed([]);
  await rejects(() => M.save('ws1', 'title', 'Anything'), 'an unknown worksheet id was accepted');
});

test('only the two header fields may be written', async () => {
  // This is a door another window calls through: it saves the header, not
  // whatever field name arrives.
  const M = mk(); M.seed([sheet()]);
  await rejects(() => M.save('ws1', 'questionIds', 'x'), 'an arbitrary field was accepted');
  await rejects(() => M.save('ws1', 'ownerUid', 'pupil'), 'the owner could be reassigned');
  eq(M.state().writes.length, 0, 'a rejected field still wrote');
});

// ── what gets stored ────────────────────────────────────────────────────────

test('a title cleared to nothing falls back rather than printing headless', async () => {
  const M = mk(); M.seed([sheet()]);
  const stored = await M.save('ws1', 'title', '   ');
  eq(stored, 'Math Worksheet', 'an emptied title');
  eq(M.state().sheets[0].title, 'Math Worksheet', 'the in-memory copy');
});

test('an emptied title on a DIAGNOSTIC falls back to the test default', async () => {
  const M = mk(); M.seed([sheet({ kind: 'diagnostic' })]);
  eq(await M.save('ws1', 'title', ''), 'Diagnostic Test', 'an emptied test title');
});

test('the line under the title MAY be emptied, and stays empty', async () => {
  const M = mk(); M.seed([sheet()]);
  eq(await M.save('ws1', 'org', '   '), '', 'what was stored');
  eq(M.state().sheets[0].headerOrg, '', 'the in-memory copy');
  // "cleared" and "never set" must not be the same thing on the way back out.
  eq(M.orgOf(M.state().sheets[0]), '', 'a cleared line came back as the default');
  eq(M.orgOf(sheet()), M.DEFAULT_ORG, 'a sheet saved before the field existed lost the default');
});

test('a header line is capped — it is a line, not a paragraph', async () => {
  const M = mk(); M.seed([sheet()]);
  const stored = await M.save('ws1', 'title', 'x'.repeat(400));
  eq(stored.length, M.MAX, 'the stored length');
});

test('a failed write puts the in-memory copy BACK', async () => {
  const M = mk(); M.seed([sheet()]);
  M.refuse();
  await rejects(() => M.save('ws1', 'title', 'Never saved'), 'a refused write reported success');
  eq(M.state().sheets[0].title, 'Fractions', 'the app tab kept a title the database never took');
});

test('the surfaces that print the title are redrawn', async () => {
  const M = mk(); M.seed([sheet()]);
  await M.save('ws1', 'title', 'Renamed');
  ok(M.state().renders > 0, 'the saved-worksheet list was never redrawn');
});

// ── the markup ──────────────────────────────────────────────────────────────

const fields = html => [...html.matchAll(/data-ws-edit="([a-z]+)"/g)].map(m => m[1]);

test('the header is plain text unless the caller asked for an editable one', () => {
  const M = mk();
  const plain = M.header('Fractions', false, '', M.DEFAULT_ORG, false);
  ok(!/contenteditable/.test(plain), 'a non-editable header carried contenteditable');
  ok(plain.includes('Fractions'), 'the title is missing from the header');
  ok(plain.includes(M.DEFAULT_ORG), 'the line under the title is missing');
});

test('an editable header offers exactly the title and the line under it', () => {
  const M = mk();
  eq(fields(M.header('Fractions', false, '', M.DEFAULT_ORG, true)).sort(), ['org', 'title'], 'the editable fields');
});

test('the COVER carries the SAME field names as the header', () => {
  // Both are the same two values printed twice — the preview updates every
  // element carrying a field name, so a rename here prints two titles.
  const M = mk();
  eq(fields(M.cover('Fractions', '3 questions', false, '', M.DEFAULT_ORG, true)).sort(),
     fields(M.header('Fractions', false, '', M.DEFAULT_ORG, true)).sort(),
     'the cover and the header disagree about the field names');
});

test('the header prints the org it was given, not a constant', () => {
  const M = mk();
  ok(M.header('T', false, '', 'Raffles Girls Primary', false).includes('Raffles Girls Primary'), 'a per-sheet line was ignored');
  ok(!M.cover('T', '', false, '', '', false).includes(M.DEFAULT_ORG), 'a cleared line printed the default anyway');
});

test('a typed header is escaped on the way into the document', () => {
  const M = mk();
  const html = M.header('<script>x</script>', false, '', '"quoted"', true);
  ok(!/<script>/.test(html), 'a title went into the sheet as markup');
  ok(html.includes('&lt;script&gt;'), 'the title was not escaped');
});

test('the edit script names the worksheet it is editing, and calls the opener', () => {
  const M = mk();
  const s = M.script('ws1');
  ok(s.includes('"ws1"'), 'the preview does not know which worksheet it is editing');
  ok(s.includes('opener'), 'the preview has no way back to the app tab');
  ok(s.includes('wsPreviewHeaderSave'), 'the preview calls nothing');
});

// ── the wiring, read as text ────────────────────────────────────────────────
// Both print paths must hand the id over ONLY for a sheet the user owns; the
// flag decides whether the preview is editable at all.

test('both print paths gate the editable header on ownership', () => {
  const gates = src.match(/headerEditId:\s*wsMine\((ws|test)\)\s*\?\s*\1\.id\s*:\s*""/g) || [];
  eq(gates.length, 2, 'the ownership gate is missing from a print path');
});

test('both print paths hand over the sheet\'s own header line', () => {
  const orgs = src.match(/headerOrg:\s*wsHeaderOrgOf\((ws|test)\)/g) || [];
  eq(orgs.length, 2, 'a print path ignores the sheet\'s saved header line');
});

test('the save function is on window — the preview reaches it as opener.<name>', () => {
  ok(/window\.wsPreviewHeaderSave\s*=\s*wsPreviewHeaderSave;/.test(src),
     'the module has its own scope, so the preview would find nothing to call');
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
