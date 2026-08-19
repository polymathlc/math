// Regression tests for NOVA PROTOCOL'S ART STORE.
// Run with:
//     node tools/art-store-tests.mjs            all cases
//     node tools/art-store-tests.mjs <name>     one case
//
// This app and the Science app (polymathlc/cer) share ONE Firebase project,
// one sign-in and therefore one admin uid, and Nova Protocol is a port of that
// app's Realm of Embers with the identifiers deliberately kept identical — so
// both games number their cards `c001`, `c002`, … and both name a battle
// avatar `<id>:av`. While they also shared ONE Firestore document, that made
// the two games one map with one set of keys, and it cost a complete set of
// Realm of Embers artwork:
//
//  • EVERY ART DOC REFERENCE MUST GO THROUGH `TCG_ART_DOC`. Put the literal
//    'tcgArt' back in any read or write and this app is sharing the Science
//    app's art store again — silently, and card by card, because a Nova
//    picture drawn into `c001` simply replaces the Ember one already there.
//    Nothing errors and nothing on screen says a thing.
//  • THE LEGACY DOCUMENT IS READ-ONLY. The Science app is still serving from
//    it, so writing to it or deleting out of it repeats the original fault
//    from the other direction.
//  • A RESET MUST BE SURGICAL — `deleteField()` under `{ merge: true }`, never
//    `setDoc({ overrides: {} })`. A whole-document overwrite takes every field
//    the document holds, including any this app did not put there. That single
//    call is what wiped both games at once.
//  • A FAILED READ IS NOT AN EMPTY STORE. An empty map looks exactly like a
//    wipe, so a reset offered on top of one clears a set the app cannot see.
//  • THE TWO APPS MUST UPLOAD TO DIFFERENT STORAGE FOLDERS. `mathImages/` here
//    and `cer-images/` there is the reason the pictures themselves survived
//    the wipe — only the index was lost.
import fs from 'fs';

const PAGE = new URL('../index.html', import.meta.url).pathname;
const src = fs.readFileSync(PAGE, 'utf8');

const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const cases = [];
const test = (name, fn) => cases.push({ name, fn });

// Everything between the art-store header and the AI art generator: the whole
// of the load / store / reset / adopt block and nothing else.
const artBlock = (() => {
  const a = src.indexOf("const TCG_ART_DOC = ");
  ok(a >= 0, 'TCG_ART_DOC is gone — the art store has no named document');
  const b = src.indexOf('AI ART GENERATOR', a);
  ok(b >= 0, 'end marker not found');
  return src.slice(a, b);
})();

// ── the document is this app's own ───────────────────────────────────────────

test('the art document is named, and is not the old shared one', () => {
  const own = /const TCG_ART_DOC = '([^']+)'/.exec(artBlock);
  const legacy = /const TCG_ART_DOC_LEGACY = '([^']+)'/.exec(artBlock);
  ok(own, 'TCG_ART_DOC is not a plain string constant');
  ok(legacy, 'TCG_ART_DOC_LEGACY is not a plain string constant');
  ok(own[1] !== legacy[1],
    'TCG_ART_DOC and TCG_ART_DOC_LEGACY name the SAME document (' + own[1] +
    ') — the two games are sharing one art map again');
  ok(legacy[1] === 'tcgArt',
    'TCG_ART_DOC_LEGACY must stay "tcgArt" — it is the document the Science app reads');
});

test('no art read or write names a document by literal', () => {
  // Only the two constants may carry a document name. Any other literal in a
  // doc() path is a call that has escaped the split.
  const bad = [...src.matchAll(/settings',\s*'([A-Za-z]+)'\s*\)/g)]
    .map(m => m[1]).filter(n => n === 'tcgArt' || n === 'novaArt');
  ok(bad.length === 0,
    'an art document is still addressed by literal: ' + bad.join(', ') +
    ' — every read and write must go through TCG_ART_DOC');
});

test('every art doc() call uses TCG_ART_DOC or the legacy constant', () => {
  const calls = [...src.matchAll(/'settings',\s*(TCG_ART_DOC(?:_LEGACY)?)\s*\)/g)].map(m => m[1]);
  ok(calls.length >= 6,
    'expected the art load, store, background repair, single reset, bulk reset ' +
    'and legacy read to address the store — found ' + calls.length);
  ok(calls.includes('TCG_ART_DOC'), 'nothing addresses this app\'s own art document');
  ok(calls.includes('TCG_ART_DOC_LEGACY'), 'nothing reads the legacy document to offer it back');
});

// ── the legacy document is never written ─────────────────────────────────────

test('the legacy art document is only ever read', () => {
  const writes = [...src.matchAll(/(setDoc|updateDoc|deleteDoc)\(\s*doc\([^)]*TCG_ART_DOC_LEGACY/g)];
  ok(writes.length === 0,
    'the old shared art store is written to by ' + writes.map(w => w[1]).join(', ') +
    ' — the Science app is still serving from that document');
});

test('adopting the legacy map copies, and copies only into empty slots', () => {
  const fn = artBlock.slice(artBlock.indexOf('async function tcgArtAdoptLegacy'));
  ok(/_tcgArtLegacyNew/.test(fn),
    'adopt no longer filters through _tcgArtLegacyNew — it would overwrite art already drawn');
  ok(/\{\s*merge:\s*true\s*\}/.test(fn), 'adopt does not merge — it would clear this app\'s own map');
  const filter = /function _tcgArtLegacyNew[\s\S]*?\n}/.exec(artBlock)[0];
  ok(/!\(_tcgArt && _tcgArt\[k\]\)/.test(filter),
    'the adopt filter no longer skips slots that already hold art');
});

// ── resets are surgical ──────────────────────────────────────────────────────

test('no whole-document overwrite of an art map exists anywhere', () => {
  const bad = [...src.matchAll(/setDoc\(\s*doc\([^;]*?\)\s*,\s*\{\s*overrides:\s*\{\s*\}\s*\}/g)];
  ok(bad.length === 0,
    'setDoc(..., { overrides: {} }) is back — a whole-document overwrite takes ' +
    'every field the document holds, which is the call that wiped both games');
});

test('reset ALL clears key by key, with deleteField, merging', () => {
  const fn = /async function tcgResetAllArt\(\)[\s\S]*?\n}/.exec(src);
  ok(fn, 'tcgResetAllArt is gone');
  const body = fn[0];
  ok(/deleteField\(\)/.test(body), 'reset ALL no longer uses deleteField()');
  ok(/\{\s*merge:\s*true\s*\}/.test(body), 'reset ALL no longer merges — it overwrites the document');
  ok(/TCG_ART_RESET_CHUNK/.test(body), 'reset ALL no longer chunks its writes');
});

test('a single-slot reset still deletes exactly one key', () => {
  const fn = /async function resetTcgArt\(id\)[\s\S]*?\n}/.exec(src);
  ok(fn, 'resetTcgArt is gone');
  ok(/\[id\]:\s*deleteField\(\)/.test(fn[0]), 'resetTcgArt no longer deletes by key');
  ok(/\{\s*merge:\s*true\s*\}/.test(fn[0]), 'resetTcgArt no longer merges');
});

// ── a failed read is not an empty store ──────────────────────────────────────

test('a failed art read is recorded, not swallowed', () => {
  const fn = /async function tcgLoadArt\(force\)[\s\S]*?\n}/.exec(src);
  ok(fn, 'tcgLoadArt is gone');
  ok(/_tcgArtLoadFailed = true/.test(fn[0]),
    'a failed art read no longer sets _tcgArtLoadFailed — an unreadable store ' +
    'is indistinguishable from a wiped one');
  ok(/_tcgArtLoadFailed = false/.test(fn[0]),
    'a successful read never clears _tcgArtLoadFailed, so one failure is permanent');
});

test('reset ALL refuses to run on a store it could not read', () => {
  const fn = /async function tcgResetAllArt\(\)[\s\S]*?\n}/.exec(src)[0];
  const guard = fn.indexOf('_tcgArtLoadFailed');
  const confirmAt = fn.indexOf('confirm(');
  ok(guard >= 0, 'reset ALL no longer checks _tcgArtLoadFailed');
  ok(guard < confirmAt, 'the unreadable-store guard must come before the confirm');
});

// ── the pictures live in this app's own Storage folder ───────────────────────

test('uploads go to this app\'s Storage folder, never the Science app\'s', () => {
  ok(/uploadDataUrlToStorage\(dataUrl, 'mathImages'\)/.test(src) || /'mathImages'/.test(src),
    'nothing uploads to mathImages/ any more');
  // A quoted literal, not the word — the comment above the art store explains
  // the split and names both folders.
  ok(!/['"`]cer-images/.test(src),
    'this app writes to cer-images/ — that is the Science app\'s Storage folder, ' +
    'and separate folders are why the pictures survived the wipe');
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
