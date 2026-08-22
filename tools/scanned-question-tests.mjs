// Regression tests for 📷 A QUESTION THAT CAME OFF A PHOTOGRAPH.
// Run with:  node tools/scanned-question-tests.mjs
//
// The Scan app (`polymathlc/scan`) writes straight into this app's vetting
// list, and one word — `source: "scan"` — is the whole contract between two
// repositories that cannot see each other. Every way this goes wrong is
// silent, and the damage lands on a question a class then sits:
//
//  • THE WORD ITSELF. Rename the value and the card still arrives, still
//    renders and still approves — it simply stops being purple and stops
//    saying where it came from. Nothing throws on either side.
//  • ONE PREDICATE, TWO CONSUMERS. The class on the card and the badge in its
//    meta row must read the same test, or a card is purple with no badge
//    (which reads as a styling bug) or badged with no outline (which is the
//    warning made invisible).
//  • THE CSS ORDER IS THE RANKING. `.is-new`, `.is-scan` and `.is-picked`
//    weigh exactly the same, so only their order in the stylesheet decides
//    which border a ticked card shows. Put `.is-scan` last and the author
//    cannot see what they are about to delete.
//  • IT MUST BE LOUD. A scanned question has no diagram and no topic — and a
//    topic is what decides the level here. Shown like every other draft it is
//    approved at the same speed as one somebody typed and checked.
import fs from 'fs';

const SRC = new URL('../index.html', import.meta.url).pathname;
const src = fs.readFileSync(SRC, 'utf8');

const cut = (from, to, what) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(what + ': "' + from.slice(0, 40) + '" not found in index.html');
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error(what + ': end marker not found');
  return src.slice(a, b);
};

// The REAL predicate, run as itself.
const block = cut(
  '// 📷 A QUESTION THAT CAME OFF A PHOTOGRAPH',
  'function vetPreviewHtml(q) {',
  'scanned-question block');
const api = new Function(block + `
  return { SCANNED_SOURCE, vetIsScanned };
`)();

// The renderer, read as text: it is far too entangled with the page to run,
// and what has to hold here is which predicate it asks and what it emits.
const render = cut('function renderVettingList() {', '\n// Approve = move', 'renderVettingList');

let fails = 0, ran = 0;
function ok(name, cond, extra) {
  ran++;
  if (cond) return;
  fails++;
  console.error('FAIL: ' + name + (extra ? '\n      ' + extra : ''));
}

/* ---------- The contract word ---------- */
ok("the field's value is the word the Scan app writes", api.SCANNED_SOURCE === 'scan');
ok('a scanned question is recognised', api.vetIsScanned({ source: 'scan' }) === true);
ok('an ordinary hand-typed draft is not', api.vetIsScanned({ title: 'x' }) === false);
ok('another app’s source is not', api.vetIsScanned({ source: 'rapid' }) === false);
ok('nothing at all is not', api.vetIsScanned(null) === false && api.vetIsScanned(undefined) === false);

/* ---------- One predicate, two consumers ---------- */
ok('the renderer asks the predicate rather than the field',
   /const scanned = vetIsScanned\(q\)/.test(render));
ok('the card is marked', /scanned \? " is-scan" : ""/.test(render));
ok('the badge is drawn from the same test', /const scanBadge = scanned/.test(render));
ok('…and it really reaches the meta row', /\$\{scanBadge\}/.test(render));

/* ---------- The CSS order is the ranking ---------- */
const iNew = src.indexOf('.vet-card.is-new');
const iScan = src.indexOf('.vet-card.is-scan');
const iPick = src.indexOf('.vet-card.is-picked');
ok('all three outlines exist', iNew > 0 && iScan > 0 && iPick > 0);
ok('where it came from beats merely being new', iNew < iScan);
ok('a card ticked for deletion outranks it', iScan < iPick);

/* ---------- It must be loud ---------- */
const rule = src.slice(iScan, src.indexOf('}', iScan));
ok('the outline is purple', /#a855f7/.test(rule), rule);
ok('the badge is purple too', /\.vet-badge\.scan \{[^}]*#f3e8ff/.test(src));
ok('the badge says which app it came from', /📷 From the Scan app/.test(render));
ok('…and what still has to be done to it before it is approved',
   /diagram/i.test(render.slice(render.indexOf('const scanBadge'), render.indexOf('const picked'))));

console.log((fails ? '✗ ' : '✓ ') + (ran - fails) + '/' + ran + ' checks passed');
process.exit(fails ? 1 : 0);
