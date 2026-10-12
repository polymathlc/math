// Pure checks for the 📐 math diagram shapes in ✏️ Touch up.
//
// The geometry lives in index.html between `const MSHAPE_MAX` and the
// `// 📐 end of the pure geometry` marker, with no DOM access, so it can be
// lifted out and run here exactly as the browser runs it.
//
//   node tools/diagram-shapes-tests.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, '..', 'index.html'), 'utf8');
const a = html.indexOf('const MSHAPE_MAX');
const b = html.indexOf('// 📐 end of the pure geometry');
assert.ok(a > 0 && b > a, 'the pure shape section is marked in index.html');
const pure = html.slice(a, b);
const EXPORTS = [
  'MSHAPE_KINDS', 'MSHAPE_GROUPS', 'mshapeCreate', 'mshapeOps', 'mshapeOpsSvg', 'mshapeWorldPts',
  'mshapeSideLengths', 'mshapeAngleDeg', 'mshapeArea', 'mshapeAutoTicks', 'mshapeAutoRight',
  'mshapeAutoParallel', 'mshapeMakeFree', 'mshapeAdjSet', 'mshapeAdjHandles', 'mshapeClean',
  'mshapeCleanList', 'mshapeAngleText', 'mshapeThumbSvg', 'mshapeToWorld', 'mshapeToUnit', 'mshapeAspect',
  'mshapeRhombusRatio'
];
const api = new Function(pure + '\nreturn {' + EXPORTS.join(',') + '};')();

const ENV = { W: 1200, H: 900 };
let passed = 0, failed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log('  ✓ ' + name); }
  catch (e) { failed++; console.log('  ✗ ' + name + '\n      ' + (e && e.stack || e).toString().split('\n').slice(0, 4).join('\n      ')); }
};
const near = (x, y, tol, msg) => assert.ok(Math.abs(x - y) <= tol, (msg || '') + ` expected ${y} ± ${tol}, got ${x}`);
const make = (kind, f) => { const s = api.mshapeCreate(kind, 600, 450, 300, ENV); if (f) f(s); return s; };
const sides = s => api.mshapeSideLengths(api.mshapeWorldPts(s), true);
const angles = s => { const P = api.mshapeWorldPts(s); return P.map((_, i) => api.mshapeAngleDeg(P, i, true)); };
const texts = s => api.mshapeOps(s).ops.filter(o => o.t === 'text').map(o => o.s);
const sum = xs => xs.reduce((p, q) => p + q, 0);

console.log('📐 diagram shapes');

test('every kind in the gallery exists and creates without throwing', () => {
  const kinds = Object.keys(api.MSHAPE_KINDS);
  assert.ok(kinds.length >= 25, 'a big gallery: ' + kinds.length);
  const groups = new Set(api.MSHAPE_GROUPS.map(g => g[0]));
  for (const k of kinds) assert.ok(groups.has(api.MSHAPE_KINDS[k].group), k + ' sits in a gallery group');
  for (const k of kinds) {
    const s = make(k);
    const out = api.mshapeOps(s);
    assert.ok(Array.isArray(out.ops) && out.ops.length > 0, k + ' draws something');
    const svg = api.mshapeOpsSvg(out.ops);
    assert.ok(!/NaN|undefined/.test(svg), k + ' svg has no NaN/undefined');
    assert.ok(api.mshapeThumbSvg(k).indexOf('<svg') === 0, k + ' has a thumbnail');
  }
});

test('the user-requested shapes are all in the gallery', () => {
  ['rhombus', 'parallelogram', 'equilateral', 'isosceles', 'rightTri', 'triangle', 'circle', 'angle', 'square', 'rectangle', 'trapezium']
    .forEach(k => assert.ok(api.MSHAPE_KINDS[k], k));
});

test('equilateral triangle: three equal sides and three 60° angles', () => {
  const s = make('equilateral');
  const L = sides(s);
  near(L[0], L[1], 0.5); near(L[1], L[2], 0.5);
  angles(s).forEach(x => near(x, 60, 0.5, 'angle'));
});

test('equilateral stays equilateral after a resize (aspect locked)', () => {
  const s = make('equilateral');
  assert.ok(api.mshapeAspect(s) > 0, 'equilateral has a locked aspect');
  s.w *= 1.7; s.h = s.w * api.mshapeAspect(s);
  const L = sides(s);
  near(L[0], L[2], 0.5); near(L[1], L[2], 0.5);
});

test('isosceles triangle: two equal sides and two equal base angles', () => {
  const s = make('isosceles');
  const L = sides(s).slice().sort((x, y) => x - y);
  assert.ok(Math.abs(L[1] - L[2]) < 0.5 || Math.abs(L[0] - L[1]) < 0.5, 'two sides match: ' + L);
  const A = angles(s).slice().sort((x, y) => x - y);
  assert.ok(Math.abs(A[0] - A[1]) < 0.5 || Math.abs(A[1] - A[2]) < 0.5, 'two angles match: ' + A);
  near(sum(angles(s)), 180, 0.5);
});

test('right-angled triangle has one 90° corner and a right-angle box', () => {
  const s = make('rightTri');
  const A = angles(s);
  assert.ok(A.some(x => Math.abs(x - 90) < 0.5), 'a 90° corner: ' + A);
  near(sum(A), 180, 0.5);
  assert.ok((s.ang || []).some(m => m && m.m === 'right'), 'right box is on by default');
});

test('any triangle: angles always sum to 180° even after moving a vertex', () => {
  const s = make('triangle');
  near(sum(angles(s)), 180, 0.5);
  assert.ok(Array.isArray(s.free) && s.free.length === 3, 'any triangle has draggable corners');
  s.free[0] = [s.free[0][0] + 0.3, s.free[0][1] - 0.1];
  near(sum(angles(s)), 180, 0.5);
  const r = api.mshapeMakeFree(make('rightTri'));
  assert.equal(r.free.length, 3, 'a right triangle can be unlocked to free corners');
  near(sum(angles(r)), 180, 0.5);
});

test('square: four equal sides and four right angles', () => {
  const s = make('square');
  const L = sides(s);
  L.forEach(x => near(x, L[0], 0.5));
  angles(s).forEach(x => near(x, 90, 0.5));
});

test('rhombus: four equal sides; the angle parameter sets the narrow angle', () => {
  const s = make('rhombus');
  const L = sides(s);
  L.forEach(x => near(x, L[0], 0.6, 'side'));
  const s2 = make('rhombus', t => { t.p = Object.assign({}, t.p, { a: 70 }); t.h = t.w * api.mshapeRhombusRatio(70); });
  const A = angles(s2).map(Math.round).sort((x, y) => x - y);
  near(A[0], 70, 1); near(A[3], 110, 1);
  sides(s2).forEach(x => near(x, sides(s2)[0], 0.6));
});

test('parallelogram: opposite sides equal and opposite angles equal', () => {
  const s = make('parallelogram');
  const L = sides(s), A = angles(s);
  near(L[0], L[2], 0.5); near(L[1], L[3], 0.5);
  near(A[0], A[2], 0.5); near(A[1], A[3], 0.5);
  near(sum(A), 360, 0.5);
});

test('trapezium has one pair of parallel sides and angles summing to 360°', () => {
  const s = make('trapezium');
  const P = api.mshapeWorldPts(s);
  const d = (i, j) => [P[j][0] - P[i][0], P[j][1] - P[i][1]];
  const cross = (u, v) => u[0] * v[1] - u[1] * v[0];
  const a = d(0, 1), c = d(3, 2);
  near(cross(a, c), 0, 1e-6 * Math.hypot(...a) * Math.hypot(...c) + 0.5, 'top ∥ bottom');
  near(sum(angles(s)), 360, 0.5);
});

test('L-shape has a 270° reflex corner and all others 90°', () => {
  const s = make('lshape');
  const A = angles(s);
  assert.ok(A.some(x => Math.abs(x - 270) < 0.5), 'reflex corner: ' + A);
  near(sum(A), (A.length - 2) * 180, 0.5);
});

test('regular polygons have the textbook interior angles', () => {
  near(angles(make('pentagon'))[0], 108, 0.5);
  near(angles(make('hexagon'))[0], 120, 0.5);
  near(angles(make('octagon'))[0], 135, 0.5);
});

test('rotation keeps side lengths and angles', () => {
  const s = make('parallelogram');
  const L0 = sides(s), A0 = angles(s);
  s.rot = 37;
  sides(s).forEach((x, i) => near(x, L0[i], 0.5));
  angles(s).forEach((x, i) => near(x, A0[i], 0.5));
});

test('world/unit conversions round-trip', () => {
  const s = make('rectangle', t => { t.rot = 23; t.fx = true; });
  const w = api.mshapeToWorld(s, 0.2, -0.3);
  const u = api.mshapeToUnit(s, w[0], w[1]);
  near(u[0], 0.2, 1e-9); near(u[1], -0.3, 1e-9);
});

test('angle labels: plain numbers get a degree sign, letters stay as typed', () => {
  assert.equal(api.mshapeAngleText('65'), '65°');
  assert.equal(api.mshapeAngleText('x'), 'x');
  assert.equal(api.mshapeAngleText('40°'), '40°');
});

test('side and angle labels are drawn, measured angles show the real value', () => {
  const s = make('isosceles', t => { t.side[1].t = '10 cm'; t.ang[0].t = 'x'; t.ang[0].m = 'arc'; t.ang[1].auto = true; });
  const T = texts(s);
  assert.ok(T.includes('10 cm'), 'side label: ' + T);
  assert.ok(T.includes('x'), 'angle label: ' + T);
  const base = Math.round(angles(s)[1]) + '°';
  assert.ok(T.includes(base), 'measured angle ' + base + ' in ' + T);
});

test('vertex names render when switched on', () => {
  const s = make('triangle', t => { t.showNames = true; t.names = 'PQR'; });
  const T = texts(s);
  ['P', 'Q', 'R'].forEach(n => assert.ok(T.includes(n), n));
});

test('auto tick marks match equal sides; auto parallel marks the parallel pair', () => {
  const r = make('rhombus');
  api.mshapeAutoTicks(r);
  const t = r.side.map(x => (x && x.ticks) || 0);
  assert.ok(t.every(x => x === t[0] && x > 0), 'all four rhombus sides ticked alike: ' + t);
  const p = make('parallelogram');
  api.mshapeAutoParallel(p);
  const par = p.side.map(x => (x && x.par) || 0);
  assert.equal(par[0], par[2]); assert.equal(par[1], par[3]);
  assert.ok(par[0] > 0 && par[1] > 0 && par[0] !== par[1], 'two different parallel pairs: ' + par);
});

test('auto right angles mark every 90° corner of a rectangle', () => {
  const s = make('rectangle');
  api.mshapeAutoRight(s);
  assert.equal(s.ang.filter(m => m && m.m === 'right').length, 4);
});

test('circle centre, radius and diameter labels', () => {
  const s = make('circle', t => { t.circ.centre = true; t.circ.radius = true; t.circ.rText = '7 cm'; t.circ.diam = true; t.circ.dText = '14 cm'; });
  const T = texts(s);
  ['O', '7 cm', '14 cm'].forEach(x => assert.ok(T.includes(x), x + ' in ' + T));
  assert.ok(api.mshapeOps(s).ops.some(o => o.t === 'dot'), 'centre dot');
});

test('semicircle centre letter sits above the diameter, clear of its label', () => {
  const s = make('semicircle', t => { t.circ.centre = true; t.circ.dText = '20 cm'; });
  const ops = api.mshapeOps(s).ops.filter(o => o.t === 'text');
  const O = ops.find(o => o.s === 'O'), D = ops.find(o => o.s === '20 cm');
  assert.ok(O && D, 'both labels drawn');
  assert.ok(O.y < D.y - 10, 'O above the diameter label');
});

test('narrow angle labels slide out between the arms', () => {
  const s = make('equilateral', t => { t.ang[0].auto = true; t.ang[0].m = 'arc'; });
  const P = api.mshapeWorldPts(s);
  const lab = api.mshapeOps(s).ops.find(o => o.t === 'text' && o.s === '60°');
  assert.ok(lab, 'label drawn');
  const dist = Math.hypot(lab.x - P[0][0], lab.y - P[0][1]);
  const font = lab.size;
  assert.ok(dist >= font * 1.8, 'pushed out far enough: ' + dist.toFixed(1) + ' vs font ' + font);
});

test('clean() drops junk and caps the list, keeping good shapes', () => {
  const good = make('square');
  const list = api.mshapeCleanList([good, null, { kind: 'nope' }, { kind: 'circle', cx: 'x' }, 42]);
  assert.ok(list.length >= 1 && list.length <= 2, 'kept the good ones: ' + list.length);
  assert.equal(list[0].kind, 'square');
  const many = Array.from({ length: 500 }, () => make('circle'));
  assert.ok(api.mshapeCleanList(many).length <= 120, 'capped');
  const round = api.mshapeCleanList(JSON.parse(JSON.stringify([good])))[0];
  assert.deepEqual(sides(round).map(Math.round), sides(good).map(Math.round), 'JSON round-trip keeps geometry');
});

test('svg output escapes label text', () => {
  const s = make('triangle', t => { t.side[0].t = '<b>&'; });
  const svg = api.mshapeOpsSvg(api.mshapeOps(s).ops);
  assert.ok(svg.indexOf('<b>') < 0 && svg.indexOf('&lt;b&gt;&amp;') >= 0, 'escaped');
});

test('adjust handles move the shape parameters within limits', () => {
  const s = make('parallelogram');
  const h = api.mshapeAdjHandles(s);
  assert.ok(Array.isArray(h) && h.length >= 1, 'parallelogram has a slant handle');
  const k = h[0].key;
  api.mshapeAdjSet(s, k, 1e6, 1e6);
  const out = api.mshapeOps(s);
  assert.ok(!/NaN/.test(api.mshapeOpsSvg(out.ops)), 'extreme drag stays finite');
});

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
