// =====================================================================
// 🎓 PSLE MATH — the papers engine (v1.0.0)
//
// The Science portal (polymathlc/cer) has 🎓 PSLE Papers: every question of
// every past PSLE Science paper, filed by year, booklet, topic and marks, with
// a simple view of big year and topic buttons that each open three actions
// (practise, Study Buddy, export). This is the same system for MATHEMATICS.
//
// WHERE THE DATA LIVES — and why it is not a settings document.
// The Science app keeps its paper list in `users/{admin}/settings/paperData`.
// This app shares that Firebase project, that sign-in and therefore that admin
// uid, so writing the same document from here would overwrite the Science
// papers (the Nova Protocol art store lost a whole set of pictures exactly
// that way — see CLAUDE.md). A new settings id would need a whole-project
// rules deploy. So a PSLE question here is simply a BANK QUESTION that carries
// one extra, student-readable field:
//
//     q.psle = { year: "2019", paper: "P1A" | "P1B" | "P2", n: 12, marks: 2,
//                diff?: "easy" | "moderate" | "hard", topic?: "<topic key>",
//                marksGuess?: true }
//
// Nothing about it is secret (it is printed on the paper itself), so it lives
// on the public half of the question and every pupil's browser can build the
// page from the bank it already loads. The answer stays where it always was.
//
// THIS FILE IS PURE. No DOM, no Firebase, no globals: every function takes
// what it needs and returns plain data, so tools/psle-math-tests.mjs can run
// all of it under node and the page (index.html, search `🎓 PSLE MATH`) is
// left with nothing but rendering and writing.
// =====================================================================

export const PSLE_VERSION = '1.0.0';

// ---------------------------------------------------------------------
// The papers. A PSLE Mathematics sitting is two papers; Paper 1 comes in two
// booklets. `book` is the Custom Paper printer's own section key (a / b / p2),
// which is what lets an exported PSLE paper print in the exam layout that
// page already draws — covers, section instructions, the Booklet A grid.
// ---------------------------------------------------------------------
export const PSLE_PAPERS = [
  { key: 'P1A', book: 'a', paper: 1, label: 'Paper 1 · Booklet A', short: 'P1 Booklet A', kind: 'mcq',
    blurb: 'Multiple choice · no calculator', icon: '🅰' },
  { key: 'P1B', book: 'b', paper: 1, label: 'Paper 1 · Booklet B', short: 'P1 Booklet B', kind: 'short',
    blurb: 'Short answers · no calculator', icon: '🅱' },
  { key: 'P2', book: 'p2', paper: 2, label: 'Paper 2', short: 'Paper 2', kind: 'long',
    blurb: 'Short and structured answers · calculator allowed', icon: '②' },
];
export const PSLE_PAPER_KEYS = PSLE_PAPERS.map(p => p.key);
const PAPER_BY_KEY = Object.fromEntries(PSLE_PAPERS.map(p => [p.key, p]));
export function pslePaper(key) { return PAPER_BY_KEY[String(key || '').toUpperCase()] || null; }
export function pslePaperOrder(key) { const i = PSLE_PAPER_KEYS.indexOf(String(key || '').toUpperCase()); return i < 0 ? 99 : i; }

// How long each part of the sitting runs, in minutes. Paper 1 (both booklets
// together) is one hour and Paper 2 is an hour and a half. A pupil can change
// the clock before it starts; these are only what it offers first.
export const PSLE_MINUTES = { P1: 60, P2: 90 };
// The first year the year pickers offer. Older papers can still be filed by
// typing the year — this is a convenience, not a limit.
export const PSLE_FIRST_YEAR = 2009;

export const PSLE_DIFFS = [
  { key: 'easy', label: 'Easy', colour: '#3a9e5f' },
  { key: 'moderate', label: 'Moderate', colour: '#d4882a' },
  { key: 'hard', label: 'Hard', colour: '#d94f4f' },
];
const DIFF_KEYS = PSLE_DIFFS.map(d => d.key);
export function psleDiffInfo(key) { return PSLE_DIFFS.find(d => d.key === key) || null; }

// ---------------------------------------------------------------------
// Topics. The MOE syllabus files a question under a sub-strand (WN, FR, …)
// and a topic inside it, and the bank already stores those ids on every
// question (`q.los`). A PSLE teacher talks in a slightly different grain —
// "Circles", "Speed", "Patterns" — so the page groups by THESE topics and
// reads them off the syllabus tags first, falling back to the question's own
// words only when it has no tag.
// ---------------------------------------------------------------------
export const PSLE_STRANDS = [
  { key: 'NA', name: 'Number and Algebra', colour: '#4a7c59' },
  { key: 'MG', name: 'Measurement and Geometry', colour: '#4a6fa5' },
  { key: 'ST', name: 'Statistics', colour: '#d4882a' },
];
const STRAND_BY_KEY = Object.fromEntries(PSLE_STRANDS.map(s => [s.key, s]));
export function psleStrand(key) { return STRAND_BY_KEY[key] || null; }

// `subs` are the syllabus sub-strand keys a topic takes, and `topics` narrows
// that to syllabus topic names when one sub-strand feeds two of ours (AV is
// both "Area and Perimeter" and "Volume"). `words` is the fallback, weighted:
// a strong word (2) outranks two weak ones.
export const PSLE_TOPICS = [
  { key: 'whole', name: 'Whole Numbers', strand: 'NA', icon: '🔢', subs: ['WN'],
    words: [[/\bfactors?\b|\bmultiples?\b|\bprime\b|common multiple|highest common|lowest common/, 2],
            [/\bdigits?\b|place value|round(ed|ing)? (off )?to the nearest|\bestimate/, 2],
            [/\bproduct\b|\bquotient\b|\bremainder\b|\bsum of\b/, 1]] },
  { key: 'fractions', name: 'Fractions', strand: 'NA', icon: '🍕', subs: ['FR'],
    words: [[/\bfractions?\b|\bnumerator\b|\bdenominator\b|mixed number|improper fraction/, 2],
            [/\b\d+\s*\/\s*\d+\b|\bhalf of\b|\bquarter\b|of the remainder|of the rest/, 1]] },
  { key: 'decimals', name: 'Decimals', strand: 'NA', icon: '🔟', subs: ['DEC'],
    words: [[/\bdecimals?\b|decimal places?|\b\d+\.\d{2,3}\b/, 2]] },
  { key: 'percentage', name: 'Percentage', strand: 'NA', icon: '💯', subs: ['PCT'],
    words: [[/%|per ?cent|\bdiscount\b|\bgst\b|\binterest\b/, 2]] },
  { key: 'ratio', name: 'Ratio', strand: 'NA', icon: '⚖️', subs: ['RAT'],
    words: [[/\bratio\b|\b\d+\s*:\s*\d+\b/, 2], [/\bin the proportion\b/, 1]] },
  { key: 'rate', name: 'Rate', strand: 'NA', icon: '⏱', subs: ['RS'], topics: [/^rate$/i],
    words: [[/\bper (hour|minute|litre|kg|day|week)\b|\brate\b|\bcharges?\b|\btaps?\b/, 2]] },
  { key: 'speed', name: 'Speed', strand: 'NA', icon: '🚗', subs: ['RS'], topics: [/speed|distance/i],
    words: [[/\bspeed\b|km\/h|m\/min|m\/s\b|\bdistance\b.*\btime\b|\bset off\b|\boverto(ok|ake)\b/, 2]] },
  { key: 'algebra', name: 'Algebra', strand: 'NA', icon: '🔤', subs: ['ALG'],
    words: [[/\balgebraic\b|\bin terms of\b|\bexpression\b|\bsimplify\b|\bsolve\b.*\b[a-z]\s*=|\bevaluate\b/, 2],
            [/\b\d*[a-z]\s*[+−-]\s*\d+\b/, 1]] },
  { key: 'patterns', name: 'Patterns', strand: 'NA', icon: '🧩', subs: [],
    words: [[/\bpattern\b|figure \d+|\bnth\b|\bsequence\b|continues? (in )?this way/, 2]] },
  { key: 'measurement', name: 'Measurement & Money', strand: 'MG', icon: '📏', subs: ['MEA', 'MON'],
    words: [[/\bmass\b|\bkg\b|\blitres?\b|\bml\b|\bcapacity\b|\btime\b.*\b(a\.m\.|p\.m\.)|\$\s*\d/, 1]] },
  { key: 'area', name: 'Area & Perimeter', strand: 'MG', icon: '⬛', subs: ['AV'], topics: [/perimeter|area of triangle/i],
    words: [[/\barea\b|\bperimeter\b|cm²|m²|cm2\b|square (cm|m)\b|\bshaded\b/, 2]] },
  { key: 'circles', name: 'Circles', strand: 'MG', icon: '⭕', subs: ['AV'], topics: [/circle|circumference/i],
    words: [[/\bcircles?\b|\bsemicircles?\b|quarter circles?|\bradius\b|\bdiameter\b|\bcircumference\b|π|\bpi\b|22\/7|3\.14/, 3]] },
  { key: 'volume', name: 'Volume', strand: 'MG', icon: '🧊', subs: ['AV'], topics: [/volume|cube|cuboid/i],
    words: [[/\bvolume\b|\btank\b|\bcuboid\b|\bcubes?\b|cm³|cm3\b|\bwater level\b|\bcontainer\b/, 2]] },
  { key: 'angles', name: 'Angles', strand: 'MG', icon: '📐', subs: ['GEO'], topics: [/angle|perpendicular|parallel lines/i],
    words: [[/∠|\bangles?\b|\bdegrees?\b|°|\bfind the size\b/, 2]] },
  { key: 'shapes', name: 'Triangles & Quadrilaterals', strand: 'MG', icon: '🔷', subs: ['GEO'],
    topics: [/triangle|quadrilateral|parallelogram|rhombus|trapezium|rectangle|square|2d shapes/i],
    words: [[/\btriangles?\b|\bisosceles\b|\bequilateral\b|\bparallelogram\b|\brhombus\b|\btrapezium\b|\bquadrilateral\b/, 2]] },
  { key: 'solids', name: 'Nets, Solids & Symmetry', strand: 'MG', icon: '🎲', subs: ['GEO'], topics: [/nets?|3d|symmetry/i],
    words: [[/\bnets?\b|\bsymmetr|\bline of symmetry\b|\bprism\b|\bpyramid\b|\bsolid\b|\bfaces?\b|\bedges?\b/, 2]] },
  { key: 'graphs', name: 'Graphs & Charts', strand: 'ST', icon: '📊', subs: ['DRI'],
    words: [[/\bpie chart\b|\bbar graph\b|\bline graph\b|\btable\b|\bgraph\b|\bchart\b/, 2]] },
  { key: 'average', name: 'Average', strand: 'ST', icon: '➗', subs: ['DA'],
    words: [[/\baverage\b|\bmean\b/, 3]] },
  { key: 'other', name: 'Other topics', strand: '', icon: '•', subs: [], words: [] },
];
const TOPIC_BY_KEY = Object.fromEntries(PSLE_TOPICS.map(t => [t.key, t]));
export function psleTopic(key) { return TOPIC_BY_KEY[key] || TOPIC_BY_KEY.other; }
export function psleTopicKeys() { return PSLE_TOPICS.map(t => t.key); }

// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------
const str = v => String(v == null ? '' : v).trim();
const low = v => str(v).toLowerCase();
const int = v => { const n = Number(v); return Number.isFinite(n) ? Math.trunc(n) : NaN; };
export function psleNowYear(now) { return new Date(now == null ? Date.now() : now).getFullYear(); }

// A year is four digits between the first PSLE we would ever file and next
// year (a teacher filing a paper on results day is filing THIS year's).
export function psleValidYear(y, now) {
  const n = int(y);
  return Number.isInteger(n) && n >= 1990 && n <= psleNowYear(now) + 1 ? String(n) : '';
}
export function psleYearOptions(now) {
  const out = [];
  for (let y = psleNowYear(now); y >= PSLE_FIRST_YEAR; y--) out.push(String(y));
  return out;
}

// ---------------------------------------------------------------------
// THE ONE NORMALISER. Everything that reads `q.psle` goes through here, so a
// half-written or hand-edited field can never put a question on the page in a
// shape the rest of the code does not expect. Unreadable → null (not PSLE).
// ---------------------------------------------------------------------
export function psleClean(meta, now) {
  if (!meta || typeof meta !== 'object') return null;
  const year = psleValidYear(meta.year, now);
  const paper = pslePaper(meta.paper) ? String(meta.paper).toUpperCase() : '';
  if (!year || !paper) return null;
  const out = { year, paper };
  const n = int(meta.n);
  if (Number.isInteger(n) && n >= 1 && n <= 60) out.n = n;
  const marks = int(meta.marks);
  if (Number.isInteger(marks) && marks >= 1 && marks <= 10) out.marks = marks;
  if (meta.marksGuess === true && out.marks) out.marksGuess = true;
  if (DIFF_KEYS.includes(meta.diff)) out.diff = meta.diff;
  if (meta.topic && TOPIC_BY_KEY[meta.topic] && meta.topic !== 'other') out.topic = meta.topic;
  return out;
}
export function psleOf(q, now) { return q ? psleClean(q.psle, now) : null; }
export function psleIsPsle(q, now) { return !!psleOf(q, now); }
export function psleSlotKey(meta) { return meta ? [meta.year, meta.paper, meta.n || '?'].join('|') : ''; }
export function psleLabel(meta, opts = {}) {
  if (!meta) return '';
  const p = pslePaper(meta.paper);
  const bits = [(opts.noPsle ? '' : 'PSLE ') + meta.year, p ? p.short : meta.paper];
  if (meta.n) bits.push('Q' + meta.n);
  return bits.join(' · ').trim();
}

// ---------------------------------------------------------------------
// Which topic a question belongs to. The admin's own override first, then the
// syllabus tags (read through `loOf`, the page's own lookup, so this file does
// not carry a second copy of the syllabus), then the question's words.
// ---------------------------------------------------------------------
export function psleTopicFromLo(lo) {
  if (!lo || !lo.subKey) return '';
  const candidates = PSLE_TOPICS.filter(t => t.subs.includes(lo.subKey));
  if (!candidates.length) return '';
  if (candidates.length === 1) return candidates[0].key;
  const name = str(lo.topic);
  const exact = candidates.find(t => (t.topics || []).some(re => re.test(name)));
  return exact ? exact.key : candidates[0].key;
}
export function psleTopicFromText(text) {
  const t = low(text);
  if (!t) return '';
  let best = '', score = 0;
  for (const topic of PSLE_TOPICS) {
    let s = 0;
    for (const [re, w] of topic.words || []) if (re.test(t)) s += w;
    if (s > score) { best = topic.key; score = s; }
  }
  return score >= 2 ? best : '';
}
export function psleTopicOf(q, opts = {}) {
  const meta = psleOf(q);
  if (meta && meta.topic) return meta.topic;
  const loOf = typeof opts.loOf === 'function' ? opts.loOf : null;
  if (loOf && Array.isArray(q && q.los)) {
    // Several tags → the one that appears most often among our topics; ties go
    // to the FIRST tag, which is the one the filing put first.
    const votes = {};
    let first = '';
    for (const id of q.los) {
      const key = psleTopicFromLo(loOf(id));
      if (!key) continue;
      if (!first) first = key;
      votes[key] = (votes[key] || 0) + 1;
    }
    const keys = Object.keys(votes);
    if (keys.length) return keys.sort((a, b) => (votes[b] - votes[a]) || (a === first ? -1 : b === first ? 1 : 0))[0];
  }
  const topics = [].concat(q && q.topics || [], q && q.topic || []).join(' ');
  const textOf = typeof opts.textOf === 'function' ? opts.textOf : (x => str(x && x.title));
  return psleTopicFromText(topics) || psleTopicFromText(textOf(q) + ' ' + str(q && q.title)) || 'other';
}

// ---------------------------------------------------------------------
// Reading a paper's NAME. Files arrive called anything — "PSLE 2019 Paper 1
// Booklet A.pdf", "2018 PSLE Maths P2 (with answers).pdf", "psle_math_2021_p1.pdf"
// — and the canonical name the importer stamps is "PSLE-2019-P1A — <original>".
// Returns { year, paper } where paper is '' when only the year could be read
// (a whole sitting in one file; the detector sorts it into booklets).
// ---------------------------------------------------------------------
export function psleCanonicalFileName(year, paper, original) {
  const y = psleValidYear(year);
  const p = pslePaper(paper) ? String(paper).toUpperCase() : 'ALL';
  const base = str(original).replace(/\.pdf$/i, '') || 'paper';
  return `PSLE-${y}-${p} — ${base}.pdf`;
}
export function psleParseSource(name, now) {
  const s = str(name);
  if (!s) return null;
  const canon = s.match(/PSLE-(\d{4})-(P1A|P1B|P2|ALL)\b/i);
  if (canon) {
    const year = psleValidYear(canon[1], now);
    if (!year) return null;
    const p = canon[2].toUpperCase();
    return { year, paper: p === 'ALL' ? '' : p, canonical: true };
  }
  const l = s.toLowerCase().replace(/[_]+/g, ' ');
  if (!/\bpsle\b/.test(l)) return null;
  const ym = l.match(/\b(19[9]\d|20\d\d)\b/);
  const year = ym ? psleValidYear(ym[1], now) : '';
  if (!year) return null;
  let paper = '';
  const p2 = /\bpaper\s*(2|ii|two)\b|\bp\s*2\b(?!\s*\d)/.test(l);
  const p1 = /\bpaper\s*(1|i|one)\b|\bp\s*1\b(?!\s*\d)/.test(l);
  const bkA = /\bbooklet\s*a\b|\bbk\s*a\b|\bp1\s*a\b|\bmcq\b/.test(l);
  const bkB = /\bbooklet\s*b\b|\bbk\s*b\b|\bp1\s*b\b/.test(l);
  if (p2 && !p1) paper = 'P2';
  else if (bkA && !bkB) paper = 'P1A';
  else if (bkB && !bkA) paper = 'P1B';
  else if (p1 && !p2) paper = 'P1';           // Paper 1, booklet unknown — options decide
  return { year, paper, canonical: false };
}

// The paper's own question number. Rapid add keeps it two ways: the PDF route
// stores `sourceQuestionNumber`, and a multi-question page prefixes the title
// with "Q12 — ". Either is believed; nothing else is guessed at.
export function psleQuestionNumber(q) {
  const raw = str(q && q.sourceQuestionNumber);
  let m = raw.match(/^(?:q(?:uestion)?\s*)?(\d{1,2})\b/i);
  if (m) return int(m[1]);
  const title = str(q && q.title);
  m = title.match(/^(?:q(?:uestion)?\s*\.?\s*)(\d{1,2})\b/i) || title.match(/^(\d{1,2})\s*[.)]\s/);
  if (m) return int(m[1]);
  m = title.match(/\bPSLE\b[^Q]*\bQ\s*(\d{1,2})\b/i);
  return m ? int(m[1]) : null;
}

// Marks printed ON the question: "[3]" after each part (summed), or "(3 marks)".
// Only a plausible total is believed (1 to 6 — no PSLE Maths question carries
// more), so a "[2016]" in a table of years is not read as marks.
export function psleMarksFromText(text) {
  const s = str(text);
  if (!s) return null;
  const brackets = [...s.matchAll(/\[\s*(\d)\s*(?:m(?:arks?)?)?\s*\]/gi)].map(m => int(m[1])).filter(n => n >= 1 && n <= 5);
  if (brackets.length) {
    const sum = brackets.reduce((a, b) => a + b, 0);
    if (sum >= 1 && sum <= 6) return sum;
  }
  const words = s.match(/\(\s*(\d)\s*marks?\s*\)/i);
  if (words) { const n = int(words[1]); if (n >= 1 && n <= 6) return n; }
  return null;
}
// What a question is worth when the paper does not say: Booklet A's first ten
// are 1 mark and the rest 2; Booklet B is 2 throughout; Paper 2's first five
// are 2 and the rest 4 (a GUESS — the longer ones are 3, 4 or 5 — and marked
// as such, so the admin page can ask for the real number).
export function psleDefaultMarks(paper, n) {
  const k = String(paper || '').toUpperCase();
  const num = int(n);
  if (k === 'P1A') return { marks: Number.isInteger(num) && num <= 10 ? 1 : 2, guess: false };
  if (k === 'P1B') return { marks: 2, guess: false };
  if (k === 'P2') return Number.isInteger(num) && num <= 5 ? { marks: 2, guess: false } : { marks: 4, guess: true };
  return { marks: 2, guess: true };
}

// ---------------------------------------------------------------------
// 🔎 THE DETECTOR — which questions already in the bank (or in vetting) came
// off a PSLE paper, and where on that paper they sit. It only PROPOSES; the
// page decides what to write. A proposal is { id, psle, confidence, reason,
// conflict? }:
//   high   — the paper and the number were both read off the source
//   medium — the number was read, the booklet was inferred (a whole-sitting
//            PDF, sorted by its options and by where its numbering restarts)
//   low    — no number could be read; it is listed but never filed blind
// A slot already taken (by a filed question or an earlier proposal) is a
// CONFLICT and is not filed automatically either — two questions claiming
// "2019 Paper 2 Q7" means one of them is wrong, and only a person can say which.
// ---------------------------------------------------------------------
export function psleDetect(questions, opts = {}) {
  const list = Array.isArray(questions) ? questions.filter(q => q && q.id) : [];
  const textOf = typeof opts.textOf === 'function' ? opts.textOf : (q => str(q && q.title));
  const sourceOf = typeof opts.sourceOf === 'function' ? opts.sourceOf : (q => str(q && q.sourcePdf));
  const now = opts.now;
  const taken = new Map();
  for (const q of list) {
    const m = psleOf(q, now);
    if (m && m.n) taken.set(psleSlotKey(m), q.id);
  }
  // Group the unfiled by where they came from.
  const groups = new Map();
  for (const q of list) {
    if (psleOf(q, now)) continue;
    const src = sourceOf(q);
    let parsed = psleParseSource(src, now), via = 'source';
    if (!parsed) { parsed = psleParseSource(q.title, now); via = 'title'; }
    if (!parsed) continue;
    const key = via === 'source' ? 'src:' + src : 'title:' + parsed.year + ':' + (parsed.paper || '');
    if (!groups.has(key)) groups.set(key, { parsed, via, items: [] });
    groups.get(key).items.push(q);
  }
  const out = [];
  for (const { parsed, via, items } of groups.values()) {
    // Paper order: page first (a PDF's own order), then when it was made, then
    // its number. That is the order the questions were printed in.
    const pageOf = q => { const p = Array.isArray(q.sourcePages) && q.sourcePages[0]; return p && Number(p.page) || 0; };
    const madeOf = q => { const c = q.createdAt; return typeof c === 'number' ? c : (c && c.seconds ? c.seconds * 1000 : Date.parse(c || '') || 0); };
    const sorted = items.slice().sort((a, b) => (pageOf(a) - pageOf(b)) || (madeOf(a) - madeOf(b))
      || ((psleQuestionNumber(a) || 0) - (psleQuestionNumber(b) || 0)));
    let run = 0, last = 0;
    for (const q of sorted) {
      const n = psleQuestionNumber(q);
      let paper = parsed.paper, confidence = n ? 'high' : 'low';
      const hasOptions = Array.isArray(q.options) && q.options.length >= 2;
      if (!paper || paper === 'P1') {
        // A whole sitting, or Paper 1 without a booklet: the numbering
        // restarting means Paper 2 has begun, and in Paper 1 the multiple
        // choice questions are Booklet A.
        if (!parsed.paper && n && last && n < last) run = 1;
        if (n) last = n;
        paper = (!parsed.paper && run === 1) ? 'P2' : (hasOptions ? 'P1A' : 'P1B');
        if (confidence === 'high') confidence = 'medium';
      }
      const text = textOf(q);
      const printed = psleMarksFromText(text);
      const def = psleDefaultMarks(paper, n);
      const meta = psleClean({ year: parsed.year, paper, n, marks: printed || def.marks, marksGuess: !printed && def.guess }, now);
      if (!meta) continue;
      const proposal = {
        id: q.id, psle: meta, confidence, canonical: !!parsed.canonical,
        reason: (via === 'source' ? 'Read off the file name' : 'Read off the title')
          + (confidence === 'medium' ? ', booklet worked out from the paper' : '')
          + (n ? '' : ' — no question number found'),
      };
      if (n) {
        const slot = psleSlotKey(meta);
        if (taken.has(slot)) proposal.conflict = taken.get(slot);
        else taken.set(slot, q.id);
      }
      out.push(proposal);
    }
  }
  return out.sort((a, b) => (Number(b.psle.year) - Number(a.psle.year))
    || (pslePaperOrder(a.psle.paper) - pslePaperOrder(b.psle.paper)) || ((a.psle.n || 99) - (b.psle.n || 99)));
}
// Which proposals may be written without a person looking: a number, no
// conflict, and not a guess at which question it is.
export function psleAutoFileable(proposal) {
  return !!(proposal && proposal.psle && proposal.psle.n && !proposal.conflict && proposal.confidence !== 'low');
}

// ---------------------------------------------------------------------
// Sorting and the index the whole page is drawn from
// ---------------------------------------------------------------------
export function psleCompare(a, b) {
  const ma = a.meta || psleOf(a), mb = b.meta || psleOf(b);
  if (!ma || !mb) return ma ? -1 : mb ? 1 : 0;
  return (Number(mb.year) - Number(ma.year)) || (pslePaperOrder(ma.paper) - pslePaperOrder(mb.paper))
    || ((ma.n || 99) - (mb.n || 99));
}
// In PAPER order: one year ascending inside, the way the paper is printed.
export function psleSortForPaper(entries) {
  return entries.slice().sort((a, b) => {
    const ma = a.meta, mb = b.meta;
    return (Number(ma.year) - Number(mb.year)) || (pslePaperOrder(ma.paper) - pslePaperOrder(mb.paper))
      || ((ma.n || 99) - (mb.n || 99));
  });
}

export function psleBuildIndex(questions, opts = {}) {
  const now = opts.now;
  const entries = [];
  for (const q of Array.isArray(questions) ? questions : []) {
    const meta = psleOf(q, now);
    if (!meta) continue;
    const marks = meta.marks || psleDefaultMarks(meta.paper, meta.n).marks;
    entries.push({ q, id: q.id, meta, marks, topic: psleTopicOf(q, opts) });
  }
  entries.sort(psleCompare);
  const years = new Map(), topics = new Map();
  for (const e of entries) {
    if (!years.has(e.meta.year)) years.set(e.meta.year, { year: e.meta.year, count: 0, marks: 0, papers: {}, topics: {} });
    const y = years.get(e.meta.year);
    y.count++; y.marks += e.marks;
    const p = y.papers[e.meta.paper] || (y.papers[e.meta.paper] = { count: 0, marks: 0 });
    p.count++; p.marks += e.marks;
    y.topics[e.topic] = (y.topics[e.topic] || 0) + e.marks;
    if (!topics.has(e.topic)) {
      const t = psleTopic(e.topic);
      topics.set(e.topic, { key: t.key, name: t.name, icon: t.icon, strand: t.strand, count: 0, marks: 0, years: {} });
    }
    const t = topics.get(e.topic);
    t.count++; t.marks += e.marks;
    t.years[e.meta.year] = (t.years[e.meta.year] || 0) + 1;
  }
  const topicOrder = psleTopicKeys();
  return {
    entries,
    byId: new Map(entries.map(e => [e.id, e])),
    years: [...years.values()].sort((a, b) => Number(b.year) - Number(a.year)),
    topics: [...topics.values()].sort((a, b) => topicOrder.indexOf(a.key) - topicOrder.indexOf(b.key)),
    total: entries.length,
    marks: entries.reduce((n, e) => n + e.marks, 0),
  };
}
export function psleEntriesFor(index, sel = {}) {
  let list = index && index.entries ? index.entries : [];
  if (sel.year) list = list.filter(e => e.meta.year === String(sel.year));
  if (sel.paper) {
    const want = String(sel.paper).toUpperCase();
    list = list.filter(e => want === 'P1' ? e.meta.paper !== 'P2' : e.meta.paper === want);
  }
  if (sel.topic) list = list.filter(e => e.topic === sel.topic);
  if (sel.diff) list = list.filter(e => e.meta.diff === sel.diff);
  if (Array.isArray(sel.ids)) { const s = new Set(sel.ids); list = list.filter(e => s.has(e.id)); }
  return psleSortForPaper(list);
}
// The strands as they appear on the page, each with its topics in order.
export function psleTopicGroups(index) {
  const groups = PSLE_STRANDS.map(s => ({ key: s.key, name: s.name, colour: s.colour, topics: [] }));
  const other = { key: '', name: 'Other topics', colour: '#7a756d', topics: [] };
  for (const t of (index && index.topics) || []) {
    const g = groups.find(x => x.key === t.strand) || other;
    g.topics.push(t);
  }
  return groups.concat(other).filter(g => g.topics.length);
}

// The numbers a section is MISSING, between 1 and the highest one filed. This
// claims nothing about how long the real paper was — it only says that a paper
// with Q1–Q9 and Q11 filed is missing Q10, which is what the admin can act on.
export function psleGaps(index, year) {
  const out = {};
  for (const p of PSLE_PAPERS) {
    const ns = psleEntriesFor(index, { year, paper: p.key }).map(e => e.meta.n).filter(Boolean);
    if (!ns.length) continue;
    // P1 Booklet B carries on from Booklet A's numbering, so it starts after A.
    let start = 1;
    if (p.key === 'P1B') {
      const aNs = psleEntriesFor(index, { year, paper: 'P1A' }).map(e => e.meta.n).filter(Boolean);
      start = aNs.length ? Math.max(...aNs) + 1 : Math.min(...ns);
    }
    const have = new Set(ns), missing = [];
    for (let i = start; i <= Math.max(...ns); i++) if (!have.has(i)) missing.push(i);
    const dupes = ns.filter((n, i) => ns.indexOf(n) !== i);
    if (missing.length || dupes.length) out[p.key] = { missing, dupes: [...new Set(dupes)] };
  }
  return out;
}

// ---------------------------------------------------------------------
// 📊 TRENDS — which topics carry the marks, year by year.
// Each cell is the topic's SHARE of that year's marks, so a year with half its
// papers filed is not drawn as a year in which everything was tested less.
// `hot` compares the last three years with everything before them.
// ---------------------------------------------------------------------
export function psleTrends(index, opts = {}) {
  const years = ((index && index.years) || []).map(y => y.year).sort((a, b) => Number(a) - Number(b));
  const yearMarks = Object.fromEntries(((index && index.years) || []).map(y => [y.year, y.marks]));
  const recentN = opts.recent || 3;
  const recent = new Set(years.slice(-recentN));
  const rows = ((index && index.topics) || []).map(t => {
    const cells = years.map(y => {
      const marks = (index.entries || []).filter(e => e.topic === t.key && e.meta.year === y).reduce((n, e) => n + e.marks, 0);
      const share = yearMarks[y] ? marks / yearMarks[y] : 0;
      return { year: y, marks, share };
    });
    const avg = list => list.length ? list.reduce((n, c) => n + c.share, 0) / list.length : 0;
    const rc = cells.filter(c => recent.has(c.year)), older = cells.filter(c => !recent.has(c.year));
    const trend = older.length && rc.length ? avg(rc) - avg(older) : 0;
    return { key: t.key, name: t.name, icon: t.icon, strand: t.strand, total: t.marks, cells,
      share: index.marks ? t.marks / index.marks : 0, everyYear: cells.every(c => c.marks > 0), trend };
  }).sort((a, b) => b.total - a.total);
  const maxShare = Math.max(0, ...rows.flatMap(r => r.cells.map(c => c.share)));
  return { years, rows, maxShare,
    hot: rows.filter(r => r.trend > 0.02).sort((a, b) => b.trend - a.trend).slice(0, 3),
    cooling: rows.filter(r => r.trend < -0.02).sort((a, b) => a.trend - b.trend).slice(0, 3),
    staples: rows.filter(r => r.everyYear && years.length >= 2).slice(0, 5) };
}

// ---------------------------------------------------------------------
// 📄 PRINTING. The Custom Paper printer wants groups (a / b / p2), a number
// per question and a mark per question. One sitting keeps the paper's OWN
// numbers; a mixed set (a topic across several years) is renumbered straight
// through, with Paper 2 restarting at 1 the way the real paper does — two
// "Question 7"s on one sheet would be unanswerable.
// ---------------------------------------------------------------------
export function pslePrintPlan(entries) {
  const sorted = psleSortForPaper(entries || []);
  const years = new Set(sorted.map(e => e.meta.year));
  const keep = years.size === 1 && sorted.every(e => e.meta.n)
    && new Set(sorted.map(e => psleSlotKey(e.meta))).size === sorted.length;
  const groups = [], numbers = {}, allocations = {};
  let p1 = 0, p2 = 0;
  for (const p of PSLE_PAPERS) {
    const list = sorted.filter(e => e.meta.paper === p.key);
    if (!list.length) continue;
    groups.push({ book: p.book, paper: p.key, questions: list.map(e => e.q) });
    for (const e of list) {
      numbers[e.id] = keep ? e.meta.n : (p.key === 'P2' ? ++p2 : ++p1);
      allocations[e.id] = e.marks;
    }
  }
  const totals = { marks: sorted.reduce((n, e) => n + e.marks, 0), count: sorted.length };
  return { list: sorted.map(e => e.q), groups, numbers, allocations, keepNumbers: keep, totals };
}

// ---------------------------------------------------------------------
// ⏱ THE EXAM CLOCK. The real sitting's time when the set IS a sitting; for
// anything else, a minute and a half a mark (the PSLE's own rate across both
// papers), never less than ten minutes.
// ---------------------------------------------------------------------
export function psleExamMinutes(entries) {
  const list = entries || [];
  if (!list.length) return 0;
  const papers = new Set(list.map(e => e.meta.paper));
  const years = new Set(list.map(e => e.meta.year));
  if (years.size === 1) {
    const hasP1 = papers.has('P1A') || papers.has('P1B'), hasP2 = papers.has('P2');
    const marks = list.reduce((n, e) => n + e.marks, 0);
    // Only a (nearly) complete paper earns the real clock.
    if (hasP1 && !hasP2 && marks >= 40) return PSLE_MINUTES.P1;
    if (hasP2 && !hasP1 && marks >= 40) return PSLE_MINUTES.P2;
    if (hasP1 && hasP2 && marks >= 80) return PSLE_MINUTES.P1 + PSLE_MINUTES.P2;
  }
  const marks = list.reduce((n, e) => n + e.marks, 0);
  return Math.max(10, Math.ceil(marks * 1.5));
}
export function psleFormatClock(ms) {
  const total = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  const h = Math.floor(total / 3600), m = Math.floor((total % 3600) / 60), s = total % 60;
  const pad = n => String(n).padStart(2, '0');
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
// The clock's state is a plain object so it can survive a reload in
// sessionStorage: { startedAt, minutes, pausedAt?, pausedMs, label, ids }.
export function psleTimerRemaining(t, now) {
  if (!t || !t.startedAt || !t.minutes) return 0;
  const at = t.pausedAt || (now == null ? Date.now() : now);
  const used = at - t.startedAt - (t.pausedMs || 0);
  return t.minutes * 60000 - used;
}
export function psleTimerPause(t, now) {
  if (!t || t.pausedAt) return t;
  return Object.assign({}, t, { pausedAt: now == null ? Date.now() : now });
}
export function psleTimerResume(t, now) {
  if (!t || !t.pausedAt) return t;
  const at = now == null ? Date.now() : now;
  const out = Object.assign({}, t, { pausedMs: (t.pausedMs || 0) + (at - t.pausedAt) });
  delete out.pausedAt;
  return out;
}
export function psleTimerValid(t) {
  return !!(t && typeof t === 'object' && Number(t.startedAt) > 0 && Number(t.minutes) > 0 && Number(t.minutes) <= 300);
}

// ---------------------------------------------------------------------
// 📈 A PUPIL'S PROGRESS, read off their own marked attempts
// (`mathPerformanceAttempts`, written by the server, so a tick here cannot be
// forged). The BEST attempt is the one that counts — this is revision, and a
// question got right on the second go has been learnt. Right is a credit of
// 0.95 or better, the same floor the usage tracker uses; part-right is any
// credit above zero.
// ---------------------------------------------------------------------
export const PSLE_RIGHT_AT = 0.95;
export function psleAttemptCredit(a) {
  if (!a) return null;
  const v = low(a.verdict);
  if (v === 'correct') return 1;
  if (Number.isFinite(Number(a.credit)) && a.credit !== null && a.credit !== '') return Math.max(0, Math.min(1, Number(a.credit)));
  const outOf = Number(a.outOf) || 0;
  if (outOf > 0) return Math.max(0, Math.min(1, (Number(a.marks) || 0) / outOf));
  if (v === 'partial') return 0.5;
  if (v === 'incorrect' || v === 'wrong') return 0;
  return null;
}
export function psleProgress(attempts) {
  const byId = {};
  for (const a of Array.isArray(attempts) ? attempts : []) {
    const id = str(a && a.questionId);
    if (!id) continue;
    const c = psleAttemptCredit(a);
    const cur = byId[id] || (byId[id] = { tries: 0, best: null, status: 'tried' });
    cur.tries++;
    if (c != null && (cur.best == null || c > cur.best)) cur.best = c;
  }
  for (const r of Object.values(byId)) {
    r.status = r.best == null ? 'tried' : r.best >= PSLE_RIGHT_AT ? 'right' : r.best > 0 ? 'part' : 'wrong';
  }
  return byId;
}
export function psleProgressSummary(entries, progress) {
  const list = entries || [];
  let done = 0, right = 0, marksRight = 0, marksDone = 0;
  for (const e of list) {
    const p = progress && progress[e.id];
    if (!p) continue;
    done++; marksDone += e.marks;
    if (p.status === 'right') right++;
    if (p.best != null) marksRight += p.best * e.marks;
  }
  return {
    total: list.length, done, right,
    pctDone: list.length ? Math.round(done / list.length * 100) : 0,
    pctRight: done ? Math.round(right / done * 100) : 0,
    score: marksDone ? Math.round(marksRight / marksDone * 100) : null,
  };
}
// The topics to practise next: lowest score first, over topics the pupil has
// actually tried at least `min` questions of (one wrong answer is not a weak
// topic). Untried topics are returned separately — a gap is not a weakness.
export function psleWeakTopics(index, progress, min = 2) {
  const rows = [], untried = [];
  for (const t of (index && index.topics) || []) {
    const entries = index.entries.filter(e => e.topic === t.key);
    const s = psleProgressSummary(entries, progress);
    if (s.done >= min) rows.push(Object.assign({ key: t.key, name: t.name, icon: t.icon }, s));
    else if (!s.done) untried.push({ key: t.key, name: t.name, icon: t.icon, total: s.total });
  }
  rows.sort((a, b) => (a.score - b.score) || (b.total - a.total));
  return { weak: rows.filter(r => r.score < 75).slice(0, 4), strong: rows.filter(r => r.score >= 85).slice(-3).reverse(), untried };
}

// ---------------------------------------------------------------------
// 🔍 SEARCH over the PSLE questions. Every word must appear (in the title, the
// wording, the topic name or the label, e.g. "2019 p2 q7"), so typing more
// narrows rather than widens.
// ---------------------------------------------------------------------
export function psleSearch(entries, term, textOf) {
  const words = low(term).split(/\s+/).filter(Boolean);
  if (!words.length) return (entries || []).slice();
  const tx = typeof textOf === 'function' ? textOf : (q => str(q && q.title));
  return (entries || []).filter(e => {
    const p = pslePaper(e.meta.paper);
    const hay = low([
      e.q.title, tx(e.q), psleTopic(e.topic).name, e.meta.year, e.meta.paper, p && p.label, p && p.short,
      'q' + (e.meta.n || ''), e.meta.paper === 'P2' ? 'p2 paper 2' : 'p1 paper 1', e.meta.diff || '',
    ].join(' '));
    return words.every(w => hay.includes(w));
  });
}

// ---------------------------------------------------------------------
// ✏️ The admin's edit form, validated in one place. Returns the cleaned meta
// or the reason it cannot be saved; a slot another question holds is refused
// rather than silently doubled.
// ---------------------------------------------------------------------
export function psleEditValidate(input, opts = {}) {
  const year = psleValidYear(input && input.year, opts.now);
  if (!year) return { ok: false, error: 'Choose the year of the paper.' };
  const paper = pslePaper(input.paper) ? String(input.paper).toUpperCase() : '';
  if (!paper) return { ok: false, error: 'Choose Paper 1 Booklet A, Booklet B or Paper 2.' };
  const n = int(input.n);
  if (!Number.isInteger(n) || n < 1 || n > 60) return { ok: false, error: 'The question number should be between 1 and 60.' };
  const marks = int(input.marks);
  if (!Number.isInteger(marks) || marks < 1 || marks > 6) return { ok: false, error: 'Marks should be between 1 and 6.' };
  const meta = psleClean({ year, paper, n, marks, diff: input.diff, topic: input.topic }, opts.now);
  const slot = psleSlotKey(meta);
  const clash = (opts.others || []).find(q => q && q.id !== opts.id && psleSlotKey(psleOf(q, opts.now) || null) === slot);
  if (clash) return { ok: false, error: `${psleLabel(meta)} is already filed (“${str(clash.title) || clash.id}”). Untag that one first.`, clash: clash.id };
  return { ok: true, meta };
}

// ---------------------------------------------------------------------
// 🔗 DEEP LINKS. `#psle` opens the page; `#psle/2019` a year; `#psle/2019/p2`
// a paper; `#psle/topic/circles` a topic; `#psle/trends` the trends tab. The
// student dashboard and a teacher's WhatsApp message can both point straight
// at a paper.
// ---------------------------------------------------------------------
export function psleParseHash(hash) {
  const h = str(hash).replace(/^#/, '');
  if (!/^psle\b/i.test(h)) return null;
  const parts = h.split('/').slice(1).map(s => decodeURIComponent(s).trim()).filter(Boolean);
  if (!parts.length) return { view: 'home' };
  const head = parts[0].toLowerCase();
  if (head === 'trends' || head === 'manage' || head === 'search' || head === 'topics' || head === 'years' || head === 'progress') return { view: head };
  if (head === 'topic' && parts[1] && TOPIC_BY_KEY[parts[1].toLowerCase()]) return { view: 'topic', topic: parts[1].toLowerCase() };
  const year = psleValidYear(parts[0]);
  if (year) {
    const p = parts[1] ? parts[1].toUpperCase() : '';
    return { view: 'year', year, paper: pslePaper(p) || p === 'P1' ? p : '' };
  }
  return { view: 'home' };
}
export function psleHash(sel) {
  if (!sel || sel.view === 'home' || !sel.view) return '#psle';
  if (sel.view === 'year' && sel.year) return '#psle/' + sel.year + (sel.paper ? '/' + String(sel.paper).toLowerCase() : '');
  if (sel.view === 'topic' && sel.topic) return '#psle/topic/' + sel.topic;
  return '#psle/' + sel.view;
}

// =====================================================================
// 📥 ADDING QUESTIONS — a whole PDF, or one screenshot per question (v1.114.0)
//
// The page takes two kinds of file and they are NOT the same job:
//   • a PDF is a whole booklet. Rapid add explodes it into pages, reads every
//     question on every page, and keeps the paper's own number on each one
//     (`sourceQuestionNumber`), so the detector can file it on sight.
//   • a SCREENSHOT is one question the teacher cut out of a paper. Nothing
//     on it says which question it is (a single question is read without its
//     printed number), so its number is ASSIGNED when it is queued — the
//     teacher says "starting at Q7" and the screenshots take 7, 8, 9… in the
//     order they were picked, never in the order the AI happened to finish.
// Everything here is pure: the page decides WHEN, these decide WHAT.
// =====================================================================

// Which of the two a file is. Anything else is turned away by name, so a
// .docx dropped by mistake says so instead of disappearing.
export function psleFileKind(file) {
  if (!file) return '';
  const type = low(file.type);
  const name = low(file.name);
  if (type === 'application/pdf' || /\.pdf$/.test(name)) return 'pdf';
  if (type.startsWith('image/') || /\.(png|jpe?g|gif|webp|heic|heif|bmp)$/.test(name)) return 'image';
  return '';
}

// Sort a pile of files into the two routes, keeping each route in the order
// the files were given (the order IS the question order for screenshots).
export function psleSplitFiles(files) {
  const out = { pdfs: [], images: [], other: [] };
  for (const f of Array.from(files || [])) {
    const k = psleFileKind(f);
    if (k === 'pdf') out.pdfs.push(f);
    else if (k === 'image') out.images.push(f);
    else if (f) out.other.push(f);
  }
  return out;
}

// Where a PDF is filed. A file already named after its paper — "PSLE 2019
// Paper 2.pdf", "psle_2021_p1_booklet_b.pdf" — is believed over the pickers,
// because the pickers are whatever was left selected from the LAST paper,
// and a whole paper filed under the wrong year is forty questions to re-file
// by hand. `fromName` lets the page say which one it used.
export function psleImportTarget(fileName, fallback = {}, now) {
  const fbYear = psleValidYear(fallback.year, now);
  const fbPaper = (pslePaper(fallback.paper) || String(fallback.paper).toUpperCase() === 'ALL')
    ? String(fallback.paper).toUpperCase() : 'P1A';
  const src = psleParseSource(fileName, now);
  if (!src || !src.year) return { year: fbYear, paper: fbPaper, fromName: false };
  // "Paper 1" with no booklet is a whole Paper 1 — the booklets are worked
  // out from the options, which is exactly what ALL does.
  let paper = src.paper === 'P1' ? 'ALL' : (src.paper || '');
  if (!paper) paper = src.canonical ? 'ALL' : (fbPaper || 'ALL');
  return { year: src.year, paper, fromName: true, yearFromName: true, paperFromName: !!src.paper || src.canonical };
}

// Every slot already taken in one year and paper, read through the ONE
// normaliser so a half-written field never counts.
export function psleTakenNumbers(questions, year, paper, now) {
  const y = psleValidYear(year, now), p = String(paper || '').toUpperCase();
  const taken = new Set();
  for (const q of Array.isArray(questions) ? questions : []) {
    const m = psleOf(q, now);
    if (m && m.n && m.year === y && m.paper === p) taken.add(m.n);
  }
  return taken;
}

// The number the next screenshot should take: the FIRST gap from Q1. A
// teacher working through a paper in order gets 1, 2, 3…; one who skipped a
// question earlier is offered the one they skipped, not the one after the
// highest — which is where a missing Q6 is otherwise never noticed.
export function psleNextNumber(questions, year, paper, now) {
  const taken = psleTakenNumbers(questions, year, paper, now);
  for (let n = 1; n <= 60; n++) if (!taken.has(n)) return n;
  return 60;
}

// The numbers a batch of screenshots will take, from `start`, in order.
// Numbers already held are NOT skipped silently: the page is told which ones
// collide so it can say so before anything is read (`clashes`).
export function psleShotNumbers(count, start, taken) {
  const k = Math.max(0, Math.min(60, int(count) || 0));
  let s = int(start);
  if (!Number.isInteger(s) || s < 1) s = 1;
  const numbers = [], clashes = [];
  for (let i = 0; i < k; i++) {
    const n = Math.min(60, s + i);
    numbers.push(n);
    if (taken && typeof taken.has === 'function' && taken.has(n)) clashes.push(n);
  }
  return { numbers, clashes, next: Math.min(60, s + k) };
}

// The field a screenshot's question is filed with. The marks printed on the
// question win; otherwise the paper's rule, marked as a guess where it is one
// (Paper 2's longer questions), exactly as the PDF route does.
export function psleShotMeta({ year, paper, n, text } = {}, now) {
  const printed = psleMarksFromText(text);
  const def = psleDefaultMarks(paper, n);
  const meta = { year, paper, n, marks: printed || def.marks };
  if (!printed && def.guess) meta.marksGuess = true;
  return psleClean(meta, now);
}

// Who already holds a slot (other than `exceptId`), or ''.
export function psleSlotHolder(questions, meta, exceptId, now) {
  const m = psleClean(meta, now);
  if (!m || !m.n) return '';
  const key = psleSlotKey(m);
  for (const q of Array.isArray(questions) ? questions : []) {
    if (!q || q.id === exceptId) continue;
    const o = psleOf(q, now);
    if (o && psleSlotKey(o) === key) return q.id;
  }
  return '';
}

// One line saying what is happening to a batch, for the progress panel.
// `shots` are the page's own screenshot tasks: { status: queued|reading|filed|failed }.
export function psleShotSummary(shots) {
  const list = Array.isArray(shots) ? shots : [];
  const count = s => list.filter(x => x && x.status === s).length;
  const c = { queued: count('queued'), reading: count('reading'), filed: count('filed'), failed: count('failed'), total: list.length };
  c.busy = c.queued + c.reading;
  const bits = [];
  if (c.reading) bits.push(c.reading + ' being read');
  if (c.queued) bits.push(c.queued + ' waiting');
  if (c.filed) bits.push(c.filed + ' filed');
  if (c.failed) bits.push(c.failed + ' could not be read');
  c.text = bits.join(' · ');
  return c;
}
