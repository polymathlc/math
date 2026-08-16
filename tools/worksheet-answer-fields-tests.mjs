// Regression tests for THE PRINTED ANSWER FIELDS — one per part, and never
// spilling onto the next page.
// Run with:
//     node tools/worksheet-answer-fields-tests.mjs            all cases
//     node tools/worksheet-answer-fields-tests.mjs <name>     one case
//
// It loads the REAL sizing and answer-field block out of index.html and runs
// it against a shimmed page. Both halves fail silently — the sheet prints,
// it just prints wrong, and nobody finds out until a class is sitting in
// front of it:
//
//  • THE ANSWER FIELD MUST NOT OUTGROW THE PAGE. Working space is asked for
//    in millimetres and a page only has so many. Ask for more than is left
//    and the browser breaks the question wherever it likes, which strands the
//    "Answer: ____" line at the top of the next page under nothing at all.
//    The cap has to account for the question's own height — its pictures
//    above all — and for every answer row, not just one.
//  • A QUESTION IN PARTS NEEDS AN ANSWER FIELD PER PART. Three answers cannot
//    be written on one line. The parts are READ OFF the wording, so the
//    reader has to be strict in both directions: miss them and (a), (b), (c)
//    share one blank; imagine them and an ordinary question prints three.
//  • THE MARKERS ARE ONLY MARKERS AT THE START OF A LINE, IN SEQUENCE FROM
//    (a). "…the area (a) in cm² …" is prose. stripHtml reads through
//    textContent, which welds paragraphs together — so the line breaks have to
//    survive into the text the reader sees, or no marker is at a line start.
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

// Everything the block reaches out to, and nothing else. stripHtml is the real
// one's behaviour in a browser: tags dropped, text kept, newlines preserved.
const FIXTURE = `
const escapeHtml = s => String(s == null ? "" : s)
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
function stripHtml(s) { return String(s == null ? "" : s).replace(/<[^>]*>/g, "").trim(); }
function wsHasMcq(q) { return Array.isArray(q && q.options) && q.options.length >= 2; }
function questionIsAnnotation(q) {
  return ((q && q.blocks) || []).some(b => b && b.type === "image" && b.annotate && (b.url || "").trim());
}
`;

const block = cut(
  'const WS_LINES_MIN = 3,',
  'function wsQuestionChunkHtml',
  'answer field + sizing block'
);

const M = new Function(FIXTURE + block + `
return {
  parts: wsQuestionParts,
  blank: wsAnswerBlankHtml,
  work: wsWorkingSpaceMm,
  body: wsBodyEstimateMm,
  rows: wsAnswerRowsMm,
  lines: wsAnswerLines,
  imgMm: wsEffectiveImgMm,
  head: wsHeadEstimateMm,
  PAGE: WS_PAGE_WORK_MM, MIN: WS_WORK_MIN_MM, ROW: WS_ANSWER_ROW_MM,
  IMG: WS_IMG_MM, IMGMIN: WS_IMG_MIN_MM,
};`)();

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error((what || 'value') + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
  }
};
const text = html => ({ type: 'text', content: html });
const img = (over = {}) => Object.assign({ type: 'image', url: 'https://x/y.png' }, over);
const q = (blocks, over = {}) => Object.assign({ id: 'q1', title: 'Q', blocks }, over);

// The question in the screenshot that started this: three parts, each on its
// own paragraph, under a diagram.
const THREE_PARTS = q([
  text('<p>The figure below is not drawn to scale. ABEF is a parallelogram and BCDE is a trapezium.</p>'),
  img(),
  text('<p>(a) Find &ang;BCD.</p><p>(b) Find &ang;ABE.</p><p>(c) Find &ang;BEF.</p>')
], { markingGuide: 'x'.repeat(400) });

// ── an answer field per part ────────────────────────────────────────────────

test('three parts on three lines are read as three parts', () => {
  eq(M.parts(THREE_PARTS), ['a', 'b', 'c'], 'the parts');
});

test('parts separated by <br> are read too', () => {
  eq(M.parts(q([text('(a) Find the area.<br>(b) Find the perimeter.')])), ['a', 'b'], 'the parts');
});

test('a bare "a)" without brackets counts', () => {
  eq(M.parts(q([text('<p>a) Find x.</p><p>b) Find y.</p>')])), ['a', 'b'], 'the parts');
});

test('each part gets its own labelled answer field', () => {
  const html = M.blank(THREE_PARTS);
  eq((html.match(/ws-answer-final/g) || []).length, 3, 'answer rows');
  ok(html.includes('Answer (a):') && html.includes('Answer (b):') && html.includes('Answer (c):'),
     'the rows are not labelled with their parts: ' + html);
});

test('an ordinary question still gets exactly one unlabelled answer field', () => {
  const html = M.blank(q([text('<p>Find the area of the rectangle.</p>')]));
  eq((html.match(/ws-answer-final/g) || []).length, 1, 'answer rows');
  ok(/<span>Answer:<\/span>/.test(html), 'the single row grew a part label: ' + html);
});

// ── what is NOT a part ──────────────────────────────────────────────────────

test('a marker mid-sentence is prose, not a part', () => {
  eq(M.parts(q([text('<p>Give the area (a) in cm² and (b) in m².</p>')])), [], 'mid-sentence markers');
});

test('a lone (a) with no (b) is not a question in parts', () => {
  eq(M.parts(q([text('<p>(a) Find the total.</p>')])), [], 'a single marker');
});

test('markers out of sequence stop at the break', () => {
  // (a) then (c): only (a) is found in order, and one part is no parts.
  eq(M.parts(q([text('<p>(a) Find x.</p><p>(c) Find z.</p>')])), [], 'out-of-sequence markers');
});

test('parts must be in reading order', () => {
  // (b) printed above (a) is not two parts to answer in order — the reader
  // walks forward only, so it finds (a) and then nothing after it.
  eq(M.parts(q([text('<p>(b) Find y.</p><p>(a) Find x.</p>')])), [], 'reversed markers');
});

test('an MCQ never gets part fields — its options ARE the answer space', () => {
  eq(M.parts(q([text('<p>(a) Find x.</p><p>(b) Find y.</p>')], { options: ['1', '2'], correctOption: 0 })), [], 'an MCQ');
});

test('an annotation question never gets part fields — the diagram is the answer', () => {
  eq(M.parts(q([text('<p>(a) Mark X.</p><p>(b) Mark Y.</p>'), img({ annotate: true })])), [], 'an annotation question');
});

test('a question with no text at all has no parts', () => {
  eq(M.parts(q([img()])), [], 'a picture-only question');
});

// ── it has to fit the page ──────────────────────────────────────────────────

// The question printed in the screenshot that started this: a diagram, a lot
// of wording and two parts, printed FIRST on the sheet — so the sheet header
// was above it, eating room nothing had accounted for. Its two answer fields
// came out on page 2 under nothing at all.
const PANCAKES = q([
  text('<p>Charlie poured pancake mixture into two types of containers with different capacities as shown below.</p>'),
  text('<p>He poured half the mixture into big containers and the other half of it into small containers. He filled the containers to the brim. Charlie used 24 more small containers than big containers.</p>'),
  text('<p>(a) How many big containers did Charlie use?</p>'),
  text('<p>(b) How much pancake mixture was there?</p>'),
  img()
], { markingGuide: 'x'.repeat(500) });

// How tall the question really prints, using the picture height it will really
// be given — and what is really left of the page once whatever sits above it
// has taken its share.
const height = (Q, reserve) => M.body(Q, M.imgMm(Q, reserve)) + M.work(Q, reserve) + M.rows(Q);
const room = (reserve) => M.PAGE - (reserve || 0);
const fits = (Q, reserve) => height(Q, reserve) <= room(reserve);

test('the question that spilled now fits on one page', () => {
  ok(fits(THREE_PARTS), `still over the page: ${height(THREE_PARTS)} > ${room()}`);
});

test('the FIRST question fits UNDER the sheet header, which is the reported bug', () => {
  // Every question but the first starts on a page of its own share, because
  // .ws-chunk refuses to break and is moved whole. Question 1 does not: the
  // header prints above it. Handing it a whole page's worth is exactly why the
  // first question on a sheet was the one whose answer field kept landing on
  // page 2.
  const head = M.head({ fields: true, qr: true });
  ok(head > 0, 'the header reserves nothing at all');
  ok(fits(PANCAKES, head), `the pancake question still spills: ${height(PANCAKES, head)} > ${room(head)}`);
  ok(fits(THREE_PARTS, head), `the parts question still spills under a header: ${height(THREE_PARTS, head)} > ${room(head)}`);
});

test('a question that fits gets LESS working space under the header, not a longer page', () => {
  // The room the header takes has to come out of the blank area. If it came out
  // of nothing, the question would simply run over — which is the bug.
  const head = M.head({ fields: true });
  ok(M.work(PANCAKES, head) < M.work(PANCAKES, 0), 'the header bought no space back from the working area');
  ok(M.work(PANCAKES, head) >= M.MIN, 'the working area fell through its floor');
});

test('a long marking guide can never buy more paper than a page has', () => {
  // The working allowance is sized from the model answer; on its own it would
  // ask for the maximum however tall the question already is.
  const big = q([text('x'.repeat(1200)), img(), img()], { markingGuide: 'y'.repeat(2000) });
  ok(M.work(big) === M.MIN, 'a huge question kept a huge working area: ' + M.work(big));
});

test('a picture is reserved its full height, not ignored', () => {
  // A picture is the biggest thing on a printed question and the one the old
  // sizing knew nothing about — which is why a question with a diagram was
  // exactly the kind that spilled.
  const body = 'Find the shaded area. ' + 'w'.repeat(600);
  const withImgs = q([text(body), img(), img()], { markingGuide: 'z'.repeat(600) });
  const without = q([text(body)], { markingGuide: 'z'.repeat(600) });
  ok(M.body(withImgs) - M.body(without) >= 2 * M.IMG, 'a picture is under-reserved, which is how the answer field spills');
  ok(M.work(withImgs) < M.work(without), 'the pictures bought no space back from the working area');
});

test('an ordinary question keeps its picture at FULL size', () => {
  // The shrink is a last resort. A question with room must print exactly the
  // diagram it always printed, or every sheet in the school quietly changes.
  eq(M.imgMm(q([text('Find x.'), img()]), 0), M.IMG, 'an ordinary diagram was shrunk for no reason');
  eq(M.imgMm(PANCAKES, M.head({ fields: true })), M.IMG, 'the pancake diagram was shrunk when it did not need to be');
});

test('the WORKING SPACE gives way before the diagram does', () => {
  // The order things give way in is the whole rule: the picture takes its room
  // out of the blank area first, and only shrinks once there is no blank area
  // left to take.
  const tight = q([text('x'.repeat(700)), img(), img()], { markingGuide: 'y'.repeat(900) });
  ok(M.imgMm(tight, 0) < M.IMG, 'the diagram never gave way on a question that cannot fit');
  // At the floor, give or take the millimetre or so that rounding the picture
  // height DOWN hands back — that slack going to the student's blank area
  // rather than to the picture is the right way round.
  ok(M.work(tight, 0) < M.MIN + 2, 'the diagram shrank while blank space was still going spare: ' + M.work(tight, 0));
  ok(fits(tight, 0), 'the shrunken diagram still did not buy the question onto one page');
});

test('a diagram is never shrunk below what can be read', () => {
  // The one place the one-page promise gives way, deliberately and last: an
  // unreadable diagram is worse than a slightly long question.
  const huge = q([text('x'.repeat(2400)), img(), img(), img()], { markingGuide: 'y'.repeat(2000) });
  ok(M.imgMm(huge, 0) >= M.IMGMIN, 'a diagram was squeezed past the point of being readable');
});

test('an annotation question keeps its taller picture', () => {
  // It is answered ON the diagram and has no working area to trade, so its own
  // cap stands and this sizing must not touch it.
  const annot = q([text('Label the shape.'), img({ annotate: true })]);
  eq(M.imgMm(annot, 0), M.IMG, 'an annotation diagram was shrunk by the working-space maths');
});

test('every answer row is paid for, not just the first', () => {
  const one = q([text('Find x.')], { markingGuide: 'z'.repeat(600) });
  eq(M.rows(THREE_PARTS), M.ROW * 3, 'three parts reserve three rows');
  eq(M.rows(one), M.ROW, 'one answer reserves one row');
});

test('a short question still gets a generous working area', () => {
  // The cap must only ever bite on a question that is genuinely too tall —
  // shrinking every sheet to fit the worst case would be its own bug.
  const short = q([text('Find 24 × 7.')], { markingGuide: 'z'.repeat(400) });
  ok(M.work(short) > 60, 'an ordinary question lost its working space: ' + M.work(short));
});

test('the working area never goes below its floor', () => {
  const huge = q([img(), img(), img()], { markingGuide: 'z'.repeat(3000) });
  ok(M.work(huge) >= M.MIN, 'the working area went below the floor: ' + M.work(huge));
});

// ── the wiring, read as text ────────────────────────────────────────────────

test('the working area and the answer rows are ONE unbreakable box', () => {
  // The last line of defence: a question that still cannot fit takes its
  // answer rows with it to the next page instead of leaving them behind.
  const css = cut('.ws-answer-box {', '.ws-work {', 'answer box css');
  ok(/break-inside: avoid/.test(css) && /page-break-inside: avoid/.test(css),
     'the answer blank can be separated from its working space again');
});

test('the chunk asks for the answer fields of ITS OWN question', () => {
  ok(/\$\{wsAnswerBlankHtml\(q\)\}/.test(src),
     'wsAnswerBlankHtml is called without the question, so no question can have parts');
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
