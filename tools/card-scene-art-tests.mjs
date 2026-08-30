import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sceneDir = path.join(root, 'assets', 'aetherfall', 'source', 'card-scenes');
const cardsDir = path.join(root, 'assets', 'aetherfall', 'cards');
const avatarsDir = path.join(root, 'assets', 'aetherfall', 'avatars');

const scenes = (await readdir(sceneDir)).filter(name => name.endsWith('.png'));
assert.equal(scenes.length, 12, 'the shared lore-location library must contain 12 scene plates');
for (const name of scenes) {
  assert.ok((await stat(path.join(sceneDir, name))).size > 100_000, `${name} is unexpectedly small`);
}

const cards = (await readdir(cardsDir)).filter(name => name.endsWith('.webp'));
const avatars = (await readdir(avatarsDir)).filter(name => name.endsWith('.webp'));
assert.equal(cards.length, 101, 'all 101 card-art slots must be filled');
assert.equal(avatars.length, 101, 'all 101 battle-avatar slots must remain filled');

for (const name of cards) {
  const header = await readFile(path.join(cardsDir, name));
  assert.equal(header.subarray(0, 4).toString('ascii'), 'RIFF', `${name} is not a WebP RIFF file`);
  assert.equal(header.subarray(8, 12).toString('ascii'), 'WEBP', `${name} is not a WebP file`);
}

const slicer = await readFile(path.join(root, 'tools', 'slice-aetherfall-assets.py'), 'utf8');
assert.match(slicer, /AETHARI_SCENES/);
assert.match(slicer, /MANA_SCENES/);
assert.match(slicer, /apex-seraphine-scene\.png/);
assert.match(slicer, /--cards-only/);

const app = await readFile(path.join(root, 'index.html'), 'utf8');
assert.match(app, /Never use a flat single-colour field or a gradient-only backdrop/);
assert.match(app, /one real story-world location/);

console.log('Aetherfall card-scene assets and prompt rules are complete.');
