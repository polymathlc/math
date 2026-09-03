import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const src = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const loreDir = path.join(root, 'assets', 'aetherfall', 'lore');

function ok(value, message) { if (!value) throw new Error(message); }
function eq(actual, expected, message) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(message + '\nexpected ' + e + '\nactual   ' + a);
}
function cut(a, b, label) {
  const start = src.indexOf(a), end = src.indexOf(b, start);
  if (start < 0 || end < 0) throw new Error('Could not find ' + label);
  return src.slice(start, end);
}

const loreLiteral = cut('const TCG_LORE_SAGAS = ', '\nconst TCG_LORE_NEXT', 'lore sagas').trim().replace(/^const TCG_LORE_SAGAS = /, '').replace(/;$/, '');
const sagas = new Function('return (' + loreLiteral + ')')();
const expected = sagas.flatMap(saga => saga.chapters.map(ch => saga.key + '-' + ch.id + '.webp')).sort();
const actual = fs.readdirSync(loreDir).filter(name => name.endsWith('.webp')).sort();

const tests = [];
function test(name, fn) { tests.push([name, fn]); }

test('every one of the 20 Chronicle pages has a bundled watercolor', () => {
  eq(actual, expected, 'bundled lore filenames');
  eq(actual.length, 20, 'watercolor page count');
  actual.forEach(name => ok(fs.statSync(path.join(loreDir, name)).size > 20_000, name + ' is empty or only a placeholder'));
});

test('the reader falls back to bundled lore art', () => {
  const fn = cut('function tcgLoreArtUrl(', '\nfunction tcgLoreSagaFor', 'lore art resolver');
  ok(/tcgBundledLoreUrl\(sagaKey, chapterId\)/.test(fn), 'bundled watercolor is not used by the reader');
  ok(/_tcgArt/.test(fn), 'admin art overrides no longer take priority');
  ok(/TCG_BUNDLED_LORE_VERSION/.test(src), 'bundled watercolor URLs are not cache-versioned');
});

test('future redraws request traditional watercolor instead of generic digital painting', () => {
  const fn = cut('function tcgLoreArtPrompt(', '\nasync function _tcgGenLoreArt', 'lore prompt');
  ok(/WATERCOLOUR/.test(fn) && /cold-pressed cotton paper/.test(fn), 'watercolor medium is missing from the redraw prompt');
  ok(/paper grain/.test(fn) && /pigment blooms/.test(fn) && /granulation/.test(fn), 'physical watercolor texture is underspecified');
  ok(/never a screenshot, cartoon, glossy digital concept painting or 3D render/.test(fn), 'digital-render avoidance is missing');
});

let passed = 0;
for (const [name, fn] of tests) {
  try { fn(); passed++; console.log('✓ ' + name); }
  catch (error) { console.error('✗ ' + name + '\n  ' + error.message); process.exitCode = 1; }
}
console.log('\n' + passed + '/' + tests.length + ' passed');
