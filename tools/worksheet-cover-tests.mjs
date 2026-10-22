// Regression tests for THE BIG M COVER (v1.106.0) — worksheet-cover.js and the
// app code in index.html that prints it, edits it and saves it.
// Run with:
//     node tools/worksheet-cover-tests.mjs            all cases
//     node tools/worksheet-cover-tests.mjs <name>     cases whose name contains <name>
//
// It loads the REAL worksheet-cover.js and the REAL cover, settings and
// document-builder code out of index.html, and runs them against stubs. Every
// way this breaks is quiet — the sheet still prints, just wrongly:
//
//  • AN ICON ON A WORD. The 31 symbols are placed as percentages of the sheet,
//    and the text is sized from the sheet's width; they only miss each other
//    while both hold. The zones below are the design's own.
//  • TWO TITLES. The cover and the sheet header print the same title and the
//    same heading; they must carry the same `data-ws-edit` names, and a cover
//    setting must never be able to override either.
//  • A LEVEL THAT STOPS FOLLOWING. A pill or a "12 questions" line nobody
//    changed must not be frozen into the saved settings.
//  • A DOCUMENT THAT MOVED. Every print WITHOUT a cover must come out exactly
//    as it did before this cover existed.
//  • MARKUP THROUGH A SIDE DOOR. `bind` adds attributes and `qrSvg` adds an
//    SVG; neither may carry a script or an event handler onto paper.
import fs from 'node:fs';

import { root, src, coverSrc, cut, loadCover, Cover, editorBlock, app, editor } from './worksheet-cover-harness.mjs';

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error((what || 'value') + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
  }
};
const icons = html => [...html.matchAll(/class="wc-icon" data-icon="([^"]+)" data-crop="([^"]+)"[^>]*style="left:([\d.]+)%;top:([\d.]+)%;width:([\d.]+)%/g)]
  .map(([, id, crop, left, top, width]) => ({ id, crop: crop.split(',').map(Number), left: +left, top: +top, width: +width }));
const q = (id, level, title = 'Q ' + id) => ({ id, level, title, blocks: [{ type: 'text', content: title }] });

// ── the artwork ─────────────────────────────────────────────────────────────

test('the atlas is a square 4 × 4 sheet of pixel maths symbols with transparency', () => {
  const png = fs.readFileSync(new URL('assets/worksheet-covers/math-pixel-icons.png', root));
  eq(png.subarray(1, 4).toString(), 'PNG', 'signature');
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20);
  eq([w, h], [672, 672], 'atlas size');
  eq(png[25], 6, 'colour type (RGBA)');
  eq(Cover.atlasCells.math.size, w, 'declared atlas size');
  eq(Cover.atlasCells.math.x, [0, 168, 336, 504, 672], 'column seams');
  eq(Cover.atlasCells.math.y, [0, 168, 336, 504, 672], 'row seams');
  const logo = fs.readFileSync(new URL('assets/branding/polymath-learning-centre.png', root));
  eq(logo.subarray(1, 4).toString(), 'PNG', 'logo signature');
  eq([logo.readUInt32BE(16), logo.readUInt32BE(20)], [2681, 1957], 'the logo is the size the cover reserves for it');
});

test('artwork URLs resolve next to the script, wherever the app is served', () => {
  const at = loadCover('https://polymathlc.github.io/math/index.html?q=1#x');
  eq(at.atlas.math, 'https://polymathlc.github.io/math/assets/worksheet-covers/math-pixel-icons.png', 'atlas');
  eq(at.logoUrl, 'https://polymathlc.github.io/math/assets/branding/polymath-learning-centre.png', 'logo');
  const local = loadCover('http://127.0.0.1:8080/index.html');
  ok(local.atlas.math.startsWith('http://127.0.0.1:8080/assets/'), 'a local server serves its own artwork');
});

test('every subject is Mathematics — the pill, the artwork and the editor', () => {
  for (const s of [undefined, '', 'science', 'Primary Science', 'math']) eq(Cover.subject(s), 'math', 'subject(' + s + ')');
  const html = Cover.render({ title: 'Fractions', subject: 'science' });
  ok(html.includes('<span class="wc-pill wc-pill-subject">Mathematics</span>'), 'the subject pill');
  ok(html.includes('math-pixel-icons.png') && !/science/i.test(html), 'only maths artwork');
});

test('the backdrop: 31 small icons using all 16 symbols, textures and the faceted M', () => {
  const html = Cover.render({ title: 'Fractions' });
  const list = icons(html);
  eq(list.length, 31, 'icons');
  eq(new Set(list.map(i => i.id)).size, 16, 'distinct symbols');
  eq(new Set(list.map(i => i.crop.join(','))).size, 16, 'distinct atlas crops');
  list.forEach(i => {
    ok(i.width <= 6, i.id + ' is not small');
    ok(i.left >= 0 && i.left + i.width <= 100 && i.top >= 0 && i.top <= 97, i.id + ' leaves the sheet');
    const [x, y, w, h] = i.crop;
    ok([x, y, w, h].every(Number.isInteger) && x >= 0 && y >= 0 && x + w <= 672 && y + h <= 672 && w === 168 && h === 168, i.id + ' crop');
  });
  eq(new Set(list.map(i => Math.floor(i.top / 25))).size, 4, 'icons reach all four quarters of the sheet');
  eq((html.match(/<svg class="wc-facets" viewBox="0 0 794 320"/g) || []).length, 1, 'one faceted M');
  eq((html.match(/<svg class="wc-textures"/g) || []).length, 1, 'one texture layer');
  ok((html.match(/<circle\b/g) || []).length >= 6, 'bubbles');
  ok((html.match(/<polygon\b/g) || []).length >= 12, 'polygons and facets');
  ok(/--wc-art-opacity:0.38;--wc-texture-opacity:0.6;--wc-facet-opacity:1/.test(html), 'the faint backdrop the design was approved at');
  ok(/image-rendering:pixelated/.test(Cover.printStyles), 'the symbols stay pixel-sharp');
  ok(!Cover.printStyles.includes('background-image:'), 'artwork must print with background graphics off');
});

test('no icon sits on the title block or the student-fields card', () => {
  // In the design's coordinates the text column runs from 7% to 93% across,
  // the title block from 30% to 50% down and the fields card from 61% to 77%.
  for (const layout of ['scattered', 'frame', 'minimal']) {
    icons(Cover.render({ title: 'Fractions', layout })).forEach(i => {
      const inColumn = i.left + i.width > 7.05 && i.left < 92.95;
      if (!inColumn) return;
      const bottom = i.top + i.width * (210 / 297) * 1.2;
      ok(!(i.top < 50.5 && bottom > 30.2), `${layout}: ${i.id} would sit on the title block`);
      ok(!(i.top < 77 && bottom > 61.5), `${layout}: ${i.id} would sit on the student fields`);
    });
  }
});

test('arrangements are smaller sets of the same design', () => {
  for (const [layout, n] of [['scattered', 31], ['frame', 16], ['minimal', 16], ['corners', 31], ['exam', 31]]) {
    eq(icons(Cover.render({ artworkLayout: layout })).length, n, layout);
  }
  eq(icons(Cover.decoration('math', { layout: 'minimal' })).length, 16, 'decoration() takes the same arrangements');
});

test('a cover saved before the design was approved takes the faint backdrop', () => {
  ok(/--wc-art-scale:0.8;--wc-art-opacity:0.38;--wc-texture-opacity:0.6/.test(Cover.render({ artworkOpacity: .72, artworkTextureOpacity: .65, artworkScale: .8 })), 'legacy strengths dropped');
  ok(/--wc-art-opacity:0.5;--wc-texture-opacity:0.6;--wc-facet-opacity:0.4/.test(Cover.render({ coverDesign: Cover.design, artworkOpacity: .5, artworkFacetOpacity: .4 })), 'chosen strengths kept');
  ok(/--wc-art-scale:1;--wc-art-opacity:0.15/.test(Cover.render({ coverDesign: Cover.design, scale: 'bad', opacity: -1 })), 'out-of-range values are clamped');
  // At 1.4 the corner symbol beside the logo turns into it (the browser test
  // measures every size), so 1.35 is as large as the icons go — and the
  // editor's slider stops there too.
  ok(/--wc-art-scale:1.35;/.test(Cover.render({ scale: 9 })), 'icons larger than 1.35');
  ok(coverSrc.includes('data-wc-input="scale" min="0.6" max="${M_SCALE_MAX}"') && /M_SCALE_MAX = 1\.35/.test(coverSrc), 'the slider goes past 1.35');
});

// ── the words on it ─────────────────────────────────────────────────────────

test('the layout: logo, pills, heading, title, bar, line, card and footer', () => {
  const html = Cover.render({ title: 'Fractions', subheader: 'Polymath Learning Centre', subtitle: '12 questions', level: 'P5', header: 'Polymath Learning Centre', footer: 'Primary Mathematics' });
  ok(/^<div class="wc-cover wc-m" data-cover-subject="math" data-cover-design="big-m">/.test(html), 'the cover element');
  ok(/<img class="wc-logo"[^>]*width="2681" height="1957"/.test(html), 'the logo reserves its box');
  ok(html.includes('<span class="wc-pill wc-pill-level">P5</span><span class="wc-pill wc-pill-subject">Mathematics</span>'), 'the pills');
  ok(html.includes('<div class="wc-eyebrow">Polymath Learning Centre</div>'), 'the heading above the title');
  ok(html.includes('<h1 class="wc-title" style="--wc-title-size:8.8cqw">Fractions</h1>'), 'the title');
  ok(/<div class="wc-bar"><\/div><p class="wc-subtitle" style="--wc-subtitle-size:2.93cqw">12 questions<\/p>/.test(html), 'the bar and the line under it');
  for (const label of ['Name', 'Date', 'Score']) ok(html.includes(`<div class="wc-field-label">${label}</div>`), label + ' label');
  ok(!/>Class</.test(html), 'the approved card asks for Name and Date only');
  ok(html.includes('<span class="wc-org">Polymath Learning Centre</span><span class="wc-dot"> · </span><span class="wc-note">Primary Mathematics</span>'), 'the footer');
  ok(html.includes('polymathlc.com.sg'), 'the website');
});

test('missing pieces leave nothing behind', () => {
  const bare = Cover.render({ title: 'Heat', footer: '' });
  ok(!bare.includes('wc-pill-level') && !bare.includes('wc-subtitle') && !bare.includes('wc-dot') && !bare.includes('wc-eyebrow'), 'no empty pill, line, heading or dot');
  const noScore = Cover.render({ title: 'Heat', score: false });
  ok(!noScore.includes('wc-score') && !/>Score</.test(noScore), 'no score box when it is off');
  ok(noScore.includes('<div class="wc-fields wc-no-score">'), 'Name and Date share the row');
  ok(!Cover.render({ title: 'Heat', fields: false }).includes('wc-fields'), 'no card without student fields');
});

test('a long title steps down so the title block keeps its room', () => {
  const size = t => +Cover.render({ title: t }).match(/--wc-title-size:([\d.]+)cqw/)[1];
  eq(size('Ratio'), 8.8, 'a short title');
  ok(size('Fractions, decimals\n& percentages') < 8.8, 'two long lines step down');
  const long = size('Whole numbers, fractions, decimals, percentages, ratio and rate: the revision paper');
  ok(long <= 6 && long >= 4.5, 'a very long title: ' + long);
  eq(Cover.titleSize('Ratio'), 8.8, 'titleSize agrees with render');
  eq(Cover.titleSize('Whole numbers, fractions, decimals, percentages, ratio and rate: the revision paper'), long, 'titleSize agrees on a long title');
});

test('the preview re-fit script carries the same sizes as render()', () => {
  const s = Cover.fitScript();
  ok(s.startsWith('<script>(function fitRun(cfg)') && s.endsWith('<\/script>'), 'a self-contained script');
  ok(s.includes('"sizes":[8.8,7.6,6.6,5.8,5.1,4.5]') && s.includes('"em":0.62') && s.includes('"lh":1.05'), 'the same steps');
  ok(s.includes('MutationObserver') && s.includes("'--wc-title-size'"), 'it watches the title and sets its size');
  ok(!/<\/script>[\s\S]*<\/script>/.test(s), 'one script element');
});

test('everything typed is escaped', () => {
  const html = Cover.render({ title: '<img onerror="bad()">', header: 'A & B', subheader: '"q"', footer: '<b>', level: '<i>', fields: false, className: 'ws-x <bad>' });
  ok(!html.includes('<img onerror') && html.includes('&lt;img onerror='), 'the title');
  ok(html.includes('A &amp; B') && html.includes('&quot;q&quot;') && html.includes('&lt;b&gt;') && html.includes('&lt;i&gt;'), 'every field');
  ok(!html.includes(' <bad>') && html.includes('wc-m ws-x"'), 'class names are filtered');
});

test('bind adds attributes and classes, never markup or handlers', () => {
  const html = Cover.render({ title: 'T', subheader: '', bind: {
    title: { className: 'ws-edit bad<x>', attrs: { 'data-ws-edit': 'title', contenteditable: 'true', onclick: 'bad()', style: 'color:red', class: 'x', src: 'y', 'Bad Name': 1, 'data-ph': '"><script>' } },
    subheader: { className: 'ws-edit', attrs: { 'data-ws-edit': 'org', 'data-ph': 'Heading above the title' } },
    level: 'not-an-object',
  } });
  ok(/<h1 class="wc-title ws-edit" data-ws-edit="title" contenteditable="true" data-ph="&quot;&gt;&lt;script&gt;" style="--wc-title-size:8.8cqw">T<\/h1>/.test(html), 'the bound title: ' + html.match(/<h1[^>]*>/)[0]);
  ok(!/onclick|color:red|src="y"|Bad Name|bad<x>/.test(html), 'refused attributes stayed out');
  ok(html.includes('<div class="wc-eyebrow ws-edit" data-ws-edit="org" data-ph="Heading above the title"></div>'), 'an EMPTY bound heading is still drawn, to type back into');
  ok(!html.includes('wc-pill-level'), 'a binding that is not an object binds nothing');
});

test('the QR is drawn only when it is an SVG, inside the card band', () => {
  const svg = '<svg viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';
  const withQr = Cover.render({ title: 'T', qrSvg: svg, qrCaption: 'Scan\nme' });
  ok(withQr.includes('<div class="wc-fields wc-has-qr">') && withQr.includes(`<div class="wc-qr">${svg}<div class="wc-qr-cap">Scan\nme</div></div></div>`), 'the QR is the card\'s third column');
  ok(Cover.render({ title: 'T', qrSvg: svg, score: false }).includes('<div class="wc-fields wc-no-score wc-has-qr">'), 'with no score box');
  ok(Cover.render({ title: 'T', qrSvg: svg, fields: false }).includes(`<div class="wc-fields wc-qr-only"><div class="wc-qr">${svg}</div></div>`), 'a card of its own without student fields');
  for (const bad of ['<img src=x onerror=alert(1)>', '<svg onload="bad()"></svg>', '<svg><script>bad()</script></svg>', 'svg', 42]) {
    ok(!Cover.render({ title: 'T', qrSvg: bad }).includes('wc-qr'), 'refused: ' + bad);
  }
  for (const rule of ['.wc-cover.wc-m .wc-fields.wc-has-qr{grid-template-columns:', '.wc-cover.wc-m .wc-qr{grid-column:3;grid-row:1/span 2', '.wc-cover.wc-m .wc-no-score .wc-qr{grid-row:1}', '.wc-cover.wc-m .wc-fields.wc-qr-only{']) {
    ok(Cover.printStyles.includes(rule), 'missing rule ' + rule);
  }
});

test('the editor offers every field and stays Mathematics', () => {
  const html = Cover.render({ editable: true, title: 'Ratio' });
  for (const f of ['level', 'subheader', 'title', 'subtitle', 'header', 'footer', 'nameLabel', 'dateLabel', 'scoreLabel']) ok(html.includes(`data-wc-field="${f}"`), f);
  ok(!Cover.render({ title: 'T', score: false, editable: true }).includes('data-wc-field="scoreLabel"'), 'no score label without a score box');
  ok(/<select data-wc-input="subject"><option value="math">Mathematics<\/option><\/select>/.test(coverSrc), 'the subject list is Mathematics only');
});

// ── the app's cover ─────────────────────────────────────────────────────────

test('the app prints the Big M as a sheet of its own, with the same field names as the header', () => {
  const A = app();
  const html = A.wsCoverHtml('Fractions', '3 questions', false, '', A.WS_HEADER_ORG, true);
  ok(A.wsCoverIsSheet(html), 'it is the full-bleed sheet');
  ok(html.startsWith('<section class="ws-cover-sheet" data-cover-design="big-m"><div class="wc-cover wc-m ws-cover-m"'), 'the sheet wraps the cover');
  const fields = h => [...h.matchAll(/data-ws-edit="([^"]+)"/g)].map(m => m[1]).sort();
  eq(fields(html), fields(A.wsHeaderHtml('Fractions', false, '', A.WS_HEADER_ORG, true)), 'the cover and the header disagree about the field names');
  ok(/<div class="wc-eyebrow ws-edit" contenteditable="true" spellcheck="false" data-ws-edit="org" data-ph="Heading above the title"[^>]*>Polymath Learning Centre<\/div>/.test(html), 'the org is the heading above the title');
  ok(/<h1 class="wc-title ws-edit"[^>]*data-ws-edit="title"[^>]*>Fractions<\/h1>/.test(html), 'the title is retypeable');
  ok(html.includes('<p class="wc-subtitle" style="--wc-subtitle-size:2.93cqw">3 questions</p>'), 'the line under it counts the questions');
  const plain = A.wsCoverHtml('Fractions', '', false, '', A.WS_HEADER_ORG, false);
  ok(!/contenteditable|data-ws-edit/.test(plain), 'a cover that is not the owner\'s is not editable');
});

test('a cleared heading prints no heading — not the default', () => {
  const A = app();
  const html = A.wsCoverHtml('T', '', false, '', '', false);
  ok(!html.includes('wc-eyebrow'), 'the heading above the title came back');
  ok(A.wsCoverHtml('T', '', false, '', '', true).includes('data-ws-edit="org" data-ph="Heading above the title" title="Click to retype this — it is saved to the worksheet"></div>'), 'on the owner\'s preview it is empty and typeable');
  ok(A.wsCoverHtml('T', '', false, '', 'Raffles Girls Primary', false).includes('>Raffles Girls Primary</div>'), 'a per-sheet heading is printed');
});

test('the level pill follows the questions, and a saved level wins', () => {
  const A = app();
  eq(A.wsCoverLevel([q('a', 'P4'), q('b', 'P6'), q('c', 'P5')]), 'P6', 'the highest level');
  eq(A.wsCoverLevel([q('a', ''), q('b', 'hard'), q('c', 'P4 / Secondary')]), '', 'nothing readable, no pill');
  eq(A.wsCoverLevel([q('a', 'S1'), q('b', 'P6')]), 'S1', 'secondary outranks primary');
  eq(A.wsCoverLevel(null), '', 'no questions');
  eq(app({ withLevels: false }).wsCoverLevel([q('a', 'P5')]), '', 'without the level reader there is simply no pill');
  ok(A.wsCoverHtml('T', '', false, '', '', false, null, 'P5').includes('<span class="wc-pill wc-pill-level">P5</span>'), 'the pill');
  ok(A.wsCoverHtml('T', '', false, '', '', false, null, 'P5').includes('<span class="wc-note">Primary Mathematics</span>'), 'the footer follows the level');
  ok(A.wsCoverHtml('T', '', false, '', '', false, { level: 'P6 Prelim' }, 'P5').includes('>P6 Prelim</span>'), 'a saved level wins');
  ok(!A.wsCoverHtml('T', '', false, '', '', false, { level: '' }, 'P5').includes('wc-pill-level'), 'a cleared level stays cleared');
  eq([A.wsCoverNoteFor('P3'), A.wsCoverNoteFor('s2'), A.wsCoverNoteFor('JC1'), A.wsCoverNoteFor('')], ['Primary Mathematics', 'Secondary Mathematics', '', ''], 'footer notes');
});

test('saved settings can change the cover but never its title or heading', () => {
  const A = app();
  const html = A.wsCoverHtml('Real title', '4 questions', false, '', 'Real heading', false,
    { title: 'Forged', subheader: 'Forged heading', bind: { title: { attrs: { onclick: 'x' } } }, qrSvg: '<svg></svg>', className: 'x',
      subtitle: 'Fractions and decimals', footer: 'Term 4', header: 'Polymath Jurong', nameLabel: 'Pupil', score: false, layout: 'frame', opacity: 0.5, coverDesign: 'big-m' });
  ok(html.includes('>Real title</h1>') && html.includes('>Real heading</div>'), 'the worksheet\'s own title and heading');
  ok(!/Forged|onclick/.test(html), 'a setting overrode the title, heading or binding');
  ok(!html.includes('wc-qr'), 'a setting added a QR');
  ok(html.includes('>Fractions and decimals</p>') && html.includes('>Term 4</span>') && html.includes('>Polymath Jurong</span>') && html.includes('>Pupil</div>'), 'the text settings');
  ok(html.includes('wc-no-score') && icons(html).length === 16 && html.includes('--wc-art-opacity:0.5'), 'the score box and the artwork');
  eq(Object.keys(A.wsCoverStyleOf({ title: 1, subheader: 2, bind: {}, qrSvg: 's', level: 'P5', score: false, nested: { a: 1 }, opacity: 0.4 })).sort(), ['level', 'opacity', 'score'], 'only the cover keys');
  ok(!A.WS_COVER_KEYS.includes('title') && !A.WS_COVER_KEYS.includes('subheader'), 'the key list itself');
});

test('the sheet QR moves onto the cover, and the cover and header never both carry it', async () => {
  const A = app();
  const html = await A.wsBuildDocumentHtml([q('a', 'P5')], 'Ratio', { cover: true, fields: true, sheetUrl: 'https://x.test/?ws=1' });
  eq((html.match(/<svg viewBox="0 0 21 21"/g) || []).length, 1, 'one QR on the whole document');
  ok(html.indexOf('wc-qr') > 0 && html.indexOf('wc-qr') < html.indexOf('class="ws-sheet"'), 'it is on the cover');
  ok(html.includes('📱 Scan for every\nquestion, video\n&amp; answer'), 'with its caption');
  const off = await A.wsBuildDocumentHtml([q('a', 'P5')], 'Ratio', { cover: true, fields: false, sheetUrl: 'https://x.test/?ws=1' });
  ok(off.includes('wc-qr-only'), 'without student fields it gets a card of its own');
});

test('the document: the cover sheet goes in front of the footer table', async () => {
  const A = app();
  const html = await A.wsBuildDocumentHtml([q('a', 'P4'), q('b', 'P6')], 'Fractions', { cover: true, fields: true, headerOrg: 'Polymath Learning Centre', headerEditId: 'ws1' });
  const sheet = html.indexOf('<section class="ws-cover-sheet"'), table = html.indexOf('<div class="ws-sheet"><table class="ws-doc">');
  ok(sheet > 0 && table > sheet, 'the cover precedes the sheet');
  ok(!/<tr[^>]*><td><section class="ws-cover-sheet"/.test(html) && !html.includes('<section class="ws-page ws-cover">'), 'the cover is not a table section');
  ok(/<tbody><tr><td><section class="ws-page"><div class="ws-head">/.test(html), 'the sheet still starts with its header, with no page break before it');
  ok(html.includes('<span class="wc-pill wc-pill-level">P6</span>') && html.includes('>2 questions</p>'), 'the level and the count');
  ok(html.includes('@page ws-cover { size: A4 portrait; margin: 0; }') && html.includes('page: ws-cover;'), 'the margin-free cover page');
  ok(html.includes('height: 296.5mm') && html.includes('width: 210mm'), 'the cover is the whole sheet');
  ok(html.includes(Cover.printStyles), 'the cover\'s own styles travel with it');
  ok(html.includes('<script>(function fitRun(cfg)'), 'the owner\'s preview re-fits a retyped title');
  ok(html.indexOf('(function fitRun') > html.indexOf('var WID = "ws1"'), '…after the edit script');
  const notOwner = await A.wsBuildDocumentHtml([q('a')], 'Fractions', { cover: true, fields: true });
  ok(!notOwner.includes('fitRun') && !notOwner.includes('data-ws-edit'), 'nothing editable on anybody else\'s copy');
});

test('the saved cover reaches the document', async () => {
  const A = app();
  const html = await A.wsBuildDocumentHtml([q('a', 'P5')], 'Ratio', { cover: true, fields: true,
    coverSettings: { level: 'P5 / P6', subtitle: 'Ratio and proportion', score: false, layout: 'minimal' } });
  ok(html.includes('>P5 / P6</span>') && html.includes('>Ratio and proportion</p>') && html.includes('wc-no-score') && icons(html).length === 16, 'the settings');
});

test('every print WITHOUT a Big M cover is the document it always was', async () => {
  const A = app();
  for (const opts of [{ cover: false, fields: true }, { fields: false, withAnswers: true }, { cover: false, headerEditId: 'ws1' }]) {
    const html = await A.wsBuildDocumentHtml([q('a', 'P5')], 'Ratio', opts);
    // (The sheet's own stylesheet has always carried the plain cover's rules.)
    ok(!/ws-cover-sheet|wc-cover|wc-m\b|@page ws-cover|fitRun|<section class="ws-page ws-cover">/.test(html), 'cover material in a document without a cover: ' + JSON.stringify(opts));
    ok(html.includes('<style>' + A.wsPrintCss() + '</style>'), 'the stylesheet is the sheet\'s own and nothing else');
    ok(/<style>[\s\S]*<\/style><\/head>\n    <body><div class="ws-printbar ws-noprint">[\s\S]*<\/div><div class="ws-sheet">/.test(html), 'the body is the bar then the sheet');
  }
  // …and when worksheet-cover.js never loaded, the plain cover is the table's
  // first section exactly as before.
  const P = app({ cover: null });   // (undefined would take the default)
  const html = await P.wsBuildDocumentHtml([q('a', 'P5')], 'Ratio', { cover: true, fields: true });
  ok(html.includes('<tbody><tr><td><section class="ws-page ws-cover">') && html.includes('ws-cover-inner'), 'the plain cover, first in the table');
  ok(!/wc-cover|@page ws-cover|fitRun/.test(html), 'no Big M material without the script');
  eq(P.wsCoverHtml('T', 's', false, '', 'O', true), P.wsCoverPlainHtml('T', 's', false, '', 'O', true), 'the fallback is the plain cover');
});

// ── the editor's reducer ────────────────────────────────────────────────────

test('what the editor saves is only what the teacher changed', () => {
  const E = editor();
  const auto = E.wsCoverAutoFor([q('a', 'P5'), q('b', 'P5')]);
  eq(auto, { level: 'P5', subtitle: '2 questions', footer: 'Primary Mathematics' }, 'what the sheet prints by itself');
  const untouched = E.wsCoverSettingsFrom({ title: 'Ratio', subheader: 'Polymath Learning Centre', level: 'P5', subtitle: '2 questions', footer: 'Primary Mathematics',
    header: 'Polymath Learning Centre', nameLabel: 'Name', dateLabel: 'Date', scoreLabel: 'Score', score: true, fields: true,
    layout: 'scattered', scale: 1, opacity: 0.38, textureOpacity: 0.6, facetOpacity: 1, artworkScale: 1, subject: 'math' }, auto);
  eq(untouched, { coverDesign: 'big-m' }, 'an untouched cover stores nothing but its stamp');
  const changed = E.wsCoverSettingsFrom({ level: '  S1 ', subtitle: 'Algebra\n basics', footer: 'Secondary Mathematics', header: 'Polymath Jurong', nameLabel: '', scoreLabel: 'Marks',
    score: false, layout: 'frame', scale: 9, opacity: 0.5049, textureOpacity: -1, facetOpacity: 'x', title: 'X', subheader: 'Y', qrSvg: '<svg>', bind: {} }, auto);
  eq(changed, { level: 'S1', subtitle: 'Algebra basics', header: 'Polymath Jurong', scoreLabel: 'Marks', score: false, layout: 'frame', scale: 1.35, opacity: 0.5, textureOpacity: 0, coverDesign: 'big-m' },
    'the changes, cleaned and clamped — and the footer that already follows the new level is left out');
  eq(E.wsCoverSettingsFrom({ level: '', subtitle: '', footer: '' }, auto), { level: '', subtitle: '', coverDesign: 'big-m' }, 'a cleared pill and line stay cleared (and a pill-less sheet has no note to clear)');
  eq(E.wsCoverSettingsFrom({ level: 'P5', subtitle: '2 questions', footer: '' }, auto), { footer: '', coverDesign: 'big-m' }, 'a cleared note stays cleared');
  eq(E.wsCoverCleanText('  a\n\tb  '), 'a b', 'one line');
  eq(E.wsCoverCleanText('x'.repeat(500)).length, 120, 'a header line, not a paragraph');
});

test('the builder\'s cover belongs to the signed-in user', () => {
  const E = editor();
  E.wsCoverResetForUser({ uid: 'teacher' });
  E.set({ level: 'P6', coverDesign: 'big-m' }, 'Jurong');
  E.wsCoverResetForUser({ uid: 'teacher' });
  eq(E.state().wsBuilderOrg, 'Jurong', 'the same user keeps it');
  E.wsCoverResetForUser({ uid: 'pupil' });
  eq([E.state().wsCoverSettings, E.state().wsBuilderOrg], [null, null], 'another user starts clean');
  E.set({ level: 'P6' }, '');
  E.wsCoverResetForUser(null);
  eq(E.state().wsCoverSettings, null, 'signing out drops it');
});

// ── the wiring, read as text ────────────────────────────────────────────────

test('the page loads the cover script before the app module, and both builder buttons exist', () => {
  const tag = src.indexOf('<script src="worksheet-cover.js?v=1"></script>'), mod = src.indexOf('<script type="module">');
  ok(tag > 0 && tag < mod, 'worksheet-cover.js must be a classic script in front of the module');
  ok(src.includes('id="wsIncludeCover"') && src.includes('id="wsEditCoverBtn"'), 'the cover tick and its 🎨 Edit cover button');
  ok(src.includes('$("wsEditCoverBtn").addEventListener("click", () => wsEditCover("builder"))'), 'the button opens the editor');
});

test('🎨 Cover is offered only on a sheet the user owns, and saves to the sheet', () => {
  const card = cut('function renderSavedWorksheets() {', '// ---- The worksheet overview page', 'saved cards');
  ok(/\$\{wsMine\(ws\) \? `<button class="btn btn-ghost btn-sm" data-ws-cover=/.test(card), 'the button sits inside the owner-only block');
  ok(card.includes('wsEditCover("saved", b.dataset.wsCover)'), 'the button opens the editor on that sheet');
  ok(editorBlock.includes('if (!wsMine(ws)) { toast("That worksheet belongs to your teacher"'), 'the editor re-checks ownership itself');
  ok(/ws\.cover = next; ws\.title = newTitle; ws\.headerOrg = newOrg;\s+try \{\s+await persistWorksheet\(ws\);/.test(editorBlock), 'it writes the cover, the title and the heading together');
  ok(editorBlock.includes('if (was[k] === undefined) delete ws[k]; else ws[k] = was[k];'), 'a failed write puts the in-memory copy back');
  ok(editorBlock.includes('!== owner) { toast("The account changed'), 'an account switch mid-edit saves nothing');
});

test('every print path hands its cover settings over', () => {
  ok(/coverSettings: wsCoverSettings,\s+\.\.\.\(typeof wsBuilderOrg === "string" \? \{ headerOrg: wsBuilderOrg \} : \{\}\)/.test(cut('function wsCurrentOptions() {', '\n}', 'builder options')), 'the builder');
  ok(cut('async function openSavedWorksheet(id, autoPrint) {', '\n// ============ EDITING THE SHEET HEADER', 'reprint').includes('po.coverSettings = ws.cover || null;'), 'a saved sheet');
  ok(cut('async function dgPrintTest(id, autoPrint) {', '\nasync function dgPrintDraft', 'diagnostic').includes('coverSettings: test.cover || null,'), 'a diagnostic');
  ok(cut('function wsRelatedBuild(ids, title, o) {', '\nfunction wsCurrentTitle', 'related').includes('coverSettings: o.coverSettings || null,'), 'the related booklet asks for it');
  ok(cut('function qcBookletDocumentOpts(plan, title, o) {', '\n// 🧪 { qid', 'booklet').includes('coverSettings: o.coverSettings || null,'), '…and the booklet passes it on');
  const save = cut('async function saveCurrentWorksheet() {', '\nfunction wsFind(id)', 'save');
  ok(save.includes('if (opts.coverSettings) ws.cover = Object.assign({}, opts.coverSettings);') && save.includes('if (typeof opts.headerOrg === "string") ws.headerOrg = opts.headerOrg;'), 'saving keeps the builder\'s cover — and never writes undefined');
  ok(cut('async function loadSavedWorksheets() {', '\n  const seen', 'load').includes('wsCoverResetForUser(currentUser);'), 'a new sign-in drops the last user\'s builder cover');
});

// ── run ─────────────────────────────────────────────────────────────────────
const only = process.argv[2];
let failed = 0, ran = 0;
for (const c of cases) {
  if (only && !c.name.includes(only)) continue;
  ran++;
  try { await c.fn(); console.log('  ✓ ' + c.name); }
  catch (e) { failed++; console.log('  ✗ ' + c.name + '\n      ' + e.message); }
}
console.log(`\n${ran - failed}/${ran} passed`);
if (failed || !ran) process.exit(1);
