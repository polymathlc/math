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
assert.match(slicer, /--roster-only/);
assert.match(slicer, /isolated_source = _keep_largest_component/);
assert.match(slicer, /def _expanded_cell/);
assert.match(slicer, /def _keep_core_component/);

const app = await readFile(path.join(root, 'index.html'), 'utf8');
assert.match(app, /Never use a flat single-colour field or a gradient-only backdrop/);
assert.match(app, /one real story-world location/);
assert.match(app, /TCG_BUNDLED_ART_VERSION = '2026-08-31-scenes-4'/);

const cardUrlFunction = app.match(/function tcgArtUrl\(id\) \{[^\n]+/u)?.[0] || '';
const avatarUrlFunction = app.match(/function tcgAvatarUrl\(id\) \{[^\n]+/u)?.[0] || '';
assert.match(cardUrlFunction, /_tcgArt\[id\]/, 'card slots should prefer their card-art override');
assert.doesNotMatch(cardUrlFunction, /:av/, 'card slots must not fall back to a battle avatar');
assert.match(avatarUrlFunction, /_tcgArt\[id \+ ':av'\]/, 'battle slots should prefer their avatar override');
assert.doesNotMatch(avatarUrlFunction, /\|\| _tcgArt\[id\]/, 'battle slots must not fall back to full card art');

const siegeArtRule = app.match(/\.ems-art \{[^}]+\}/u)?.[0] || '';
assert.match(siegeArtRule, /width: 100%/);
assert.match(siegeArtRule, /height: 100%/);
assert.match(siegeArtRule, /object-fit: contain/);
assert.match(siegeArtRule, /object-position: center/);

console.log('Aetherfall card-scene assets and prompt rules are complete.');
