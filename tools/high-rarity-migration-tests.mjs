import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');

function cut(a, b, label) {
  const start = src.indexOf(a), end = src.indexOf(b, start);
  if (start < 0 || end < 0) throw new Error('Could not find ' + label);
  return src.slice(start, end);
}
function ok(value, message) { if (!value) throw new Error(message); }
function eq(actual, expected, message) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(message + '\nexpected ' + e + '\nactual   ' + a);
}

const rosterBlock = cut('const TCG_GEN1 = {', '// Deterministic ±6% jitter', 'Aetherfall roster and migration ledger');
const M = new Function(rosterBlock + `
  return {
    cards: TCG_CARDS,
    byId: TCG_BY_ID,
    version: TCG_AETHERFALL_IDENTITY_VERSION,
    legacy: TCG_LEGACY_HIGH_RARITY,
    preserve: _tcgPreserveLegacyHighRarity
  };
`)();

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('the ledger covers every former 6★ and 7★ slot', () => {
  const ids = Object.keys(M.legacy);
  eq(ids, [
    'c043','c044','c045','c046','c047','c048','c049','c050','c051',
    'c094','c095','c096','c097','c098','c099','c100','c101'
  ], 'legacy high-rarity ids changed');
  eq(M.cards.filter(c => c.stars >= 6).map(c => c.id), ids,
    'a current 6★/7★ slot is not the same slot students already owned');
});

test('every old rare slot resolves to a named 6★ or 7★ Aetherfall card', () => {
  Object.entries(M.legacy).forEach(([id, oldName]) => {
    const card = M.byId[id];
    ok(card && card.stars >= 6, id + ' was deleted or demoted below 6★');
    ok(card.name && card.name !== oldName, id + ' did not receive its new Aetherfall identity');
    ok(card.skillId && card.skillName, id + ' has no Aetherfall ability');
  });
  eq(M.version, 'aetherfall-v1', 'identity migration version');
});

test('all owned quantities survive the identity swap exactly', () => {
  const saved = {}, expected = {};
  Object.keys(M.legacy).forEach((id, i) => { saved[id] = expected[id] = i + 1; });
  saved.c001 = 99; // the rare-card helper must not rewrite unrelated cards
  const cards = { c001: 99 };
  M.preserve(saved, cards);
  eq(cards, { c001: 99, ...expected }, 'owned high-rarity quantities');
});

test('the shipping hydrator invokes the rare-card safeguard and versions the save', () => {
  const hydration = cut('function tcgHydrateState(saved)', '\nfunction tcgState()', 'TCG hydration');
  ok(/_tcgPreserveLegacyHighRarity\(s\.cards, cards\)/.test(hydration),
    'the safeguard is not called when a student save loads');
  ok(/identityVersion:\s*TCG_AETHERFALL_IDENTITY_VERSION/.test(hydration),
    'the migrated save is not marked with the Aetherfall identity version');
  ok(/Object\.keys\(cards\)\.forEach\(id => \{[\s\S]*levels\[id\][\s\S]*lvlp\[id\]/.test(hydration),
    'training level/progress no longer follows the preserved card ids');
  ok(/Object\.keys\(cards\)\.forEach\(id => \{[\s\S]*merges\[id\]/.test(hydration),
    'merge levels no longer follow the preserved card ids');
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (error) { console.error('✗ ' + name + '\n  ' + error.message); process.exitCode = 1; }
}
console.log('\n' + passed + '/' + tests.length + ' passed');
