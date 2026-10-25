// Regression tests for ⚡ RAPID ADD TAKING PDFs — a PDF is EXPLODED INTO PAGES.
// Run with:
//     node tools/rapid-pdf-tests.mjs            all cases
//     node tools/rapid-pdf-tests.mjs <name>     one case
//
// It loads the REAL block out of app.js — rapidAddFiles, startRapidJob, the
// PDF queue and the page expander — and runs it against a fake pdf.js. Every
// failure this catches is SILENT: the pad still opens, files still queue,
// questions still land in vetting, and something is quietly wrong.
//
//  • A PDF SENT WHOLE still reads. It comes back with the wording of some of
//    the questions, no figure anywhere (there is no single page to measure a
//    rectangle on), and the tail of a long paper simply missing — a reply that
//    ran out of room does not error, it TRUNCATES.
//  • THE BATCH LEVEL read inside the render loop instead of at queue time
//    files the back half of a P3 paper at P4, the moment the author moves the
//    picker on while the pages are still rendering. Both halves look right.
//  • A PAGE CAP that stops counting leaves a 400-page book queueing four
//    hundred AI calls from one drop.
//  • A BLANK PAGE treated as a failure puts a red card on every cover sheet
//    and instruction page in the paper, and a wall of red cards is what makes
//    the one real red card get clicked past.
//  • TWO PDFs RENDERED AT ONCE is a canvas per page of both of them, held in
//    memory, on a school Chromebook.
import fs from 'fs';
import {assemblePage} from '../rapid-import/functions/core.js';

const APP = new URL('../index.html', import.meta.url).pathname;
const src = fs.readFileSync(APP, 'utf8');

const cut = (from, to, what) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(what + ': "' + from + '" not found in index.html');
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error(what + ': end marker not found');
  return src.slice(a, b);
};

// Everything the block reaches for. The point of the harness is the ROUTING
// and the BOOK-KEEPING, so the AI read, the DOM and pdf.js itself are stubs —
// but `startRapidJob` and the expander are the app's own.
const FIXTURE = `
let rapidJobs = [];
let vettingList=[];const _rapidJustAdded=new Set();let _rapidAddedCount=0;
const SAVED=[];
async function saveVettingDoc(q){SAVED.push(q);}
function _rapidCloudEnabled(){return false;}
let _rapidSeq = 0;
const PDF_PAGE_MAX_SIDE = 2000;
const LOG = { toasts: [], status: [], read: [] };
// The app's own failure path logs; the harness drives it on purpose, so the
// stack traces are noise that hides the one line that matters.
const console = { error() {}, warn() {}, log() {} };
let LEVEL = '';
function rapidLevel() { return LEVEL; }
// 📅 The batch's RELEASE DATE rides the same rails as its level — captured at
// the door, carried to every page — so the expander cannot be run without it.
let RELEASE = '';
function rapidRelease() { return RELEASE; }
function qReleaseLabel(on) { return String(on || ''); }
function toast(m, k) { LOG.toasts.push({ m, k }); }
function setRapidStatus(m) { LOG.status.push(m); }
function updateRapidCounts() {}
function renderVettingList() {}
function setRapidJobState(id, patch) { const j = rapidJobs.find(x => x.id === id); if (j) Object.assign(j, patch); }
function removeRapidJob(id) { rapidJobs = rapidJobs.filter(j => j.id !== id); }
function _dataUrlToBlob() { return new Blob(['x'], { type: 'image/jpeg' }); }
// The fake reader. Each page is answered from PAGES, keyed by the page number
// carried in the job's source line, so a test can make page 2 blank and page 3
// throw and still know which is which.
let PAGES = {};
let LIVE = 0, PEAK = 0;
const OUTAGE = "openai: The backup AI's daily limit for this account has been reached — it will reset tomorrow. | gemini: AI: Error fetching from https://firebasevertexai.googleapis.com/v1beta/projects/mathgen--app/models/gemini-2.5-flash:generateContent: [429 ] Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing. (AI/fetch-error) | kimi: No Kimi key is configured on the server.";
const GARBLED = "openai: OpenAI returned an incomplete or empty response. | gemini: Gemini returned an empty response. | kimi: Kimi returned an incomplete or empty response.";
function escapeHtml(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
let ADMIN = true;
function _isAdmin() { return ADMIN; }
async function processRapidJob(jobId, file, batchLevel, opts) {
  const o = opts || {};
  LIVE++; PEAK = Math.max(PEAK, LIVE);
  // Two ticks of real asynchrony, so an expander that fired every page at once
  // would really have them all in flight here at the same moment.
  await new Promise(r => setTimeout(r, 0));
  await new Promise(r => setTimeout(r, 0));
  LIVE--;
  const m = /page (\\d+) of/.exec(o.source || '');
  const p = m ? Number(m[1]) : 0;
  LOG.read.push({ page: p, level: batchLevel, release: o.release || '', source: o.source || '', blankOk: !!o.blankOk, name: file && file.name });
  const answer = PAGES[p] === undefined ? 1 : PAGES[p];
  if (answer === 'throw') { failRapidJob(jobId, new Error('unreadable')); return undefined; }
  // 🩺 Every engine refused before reading anything — the morning this was
  // written. The REAL processRapidJob hands a PDF page's failure back to its
  // paper ({ failed, error }) and fails a screenshot's own card; so does this.
  if (answer === 'outage' || answer === 'garbled') {
    const err = new Error(answer === 'outage' ? OUTAGE : GARBLED);
    if (o.deferSave) { removeRapidJob(jobId); return { failed: true, error: err }; }
    failRapidJob(jobId, err); return undefined;
  }
  if (answer === 0) {
    if (!o.blankOk) { failRapidJob(jobId, new Error('the AI returned nothing readable')); return undefined; }
    removeRapidJob(jobId);
    return { blank: true };
  }
  removeRapidJob(jobId);
  return { added: answer, questions: Array.from({length:answer},(_,i)=>({id:'q'+p+'_'+i,blocks:[{type:'text',content:'Question'}],sourcePages:[],sourceQuestionNumber:String(p*10+i)})) };
}
// pdf.js, faked. NUMPAGES is what the "document" claims; RENDERED records the
// order pages were rasterised in.
let NUMPAGES = 3;
const RENDERED = [];
let DESTROYED = 0;
async function _loadPdfJs() {
  return {
    getDocument() {
      return { promise: Promise.resolve({
        numPages: NUMPAGES,
        async getPage(p) { return { cleanup() {} , _p: p }; },
        destroy() { DESTROYED++; }
      }) };
    }
  };
}
async function _pdfRenderPage(page) { RENDERED.push(page._p); return { mimeType: 'image/jpeg', data: 'AAAA' }; }
function pdfFile(name, bytes) {
  const f = new File([new Uint8Array(bytes || 8)], name, { type: 'application/pdf' });
  return f;
}
function imgFile(name) { return new File([new Uint8Array(4)], name, { type: 'image/png' }); }
function reset() {
  vettingList=[];SAVED.length=0;rapidJobs = []; _rapidSeq = 0; LOG.toasts = []; LOG.status = []; LOG.read = [];
  PAGES = {}; NUMPAGES = 3; RENDERED.length = 0; DESTROYED = 0; LEVEL = ''; RELEASE = ''; LIVE = 0; PEAK = 0; ADMIN = true;
  _rapidPdfQueue = []; _rapidPdfBusy = false;
}
`;

const section = [
  // 🩺 The REAL failure reader, so a card's outage / unreadable split is the
  // app's own and not a guess written into this file.
  cut('const AI_ENGINE_LABELS =', '\n/* A refusal that only means "not this second"', 'AI failure report'),
  cut('const RAPID_PDF_MAX_PAGES', '\n// `opts` is what a PDF PAGE carries in', 'rapid pdf block'),
  // …and the REAL red card and the strip above it.
  cut('function rapidErrorCardHtml(job)', '\n// One placeholder card in the vetting list per screenshot still being read', 'rapid error card'),
  FIXTURE
].join('\n');

const M = new Function('assembleMathPdfPage',section + `
return {
  rapidAddFiles, startRapidJob, _rapidExpandPdf, _rapidPageFile,
  RAPID_PDF_MAX_PAGES, RAPID_PDF_PAR,
  LOG, RENDERED, SAVED, reset, failRapidJob,
  retryRapidJob, retryAllRapidJobs, dismissAllRapidErrors, rapidErrorCardHtml, rapidRetryStripHtml,
  setAdmin: v => { ADMIN = v; },
  setLevel: v => { LEVEL = v; },
  setRelease: v => { RELEASE = v; },
  setPages: v => { PAGES = v; },
  setNumPages: n => { NUMPAGES = n; },
  jobs: () => rapidJobs,
  destroyed: () => DESTROYED,
  queueLen: () => _rapidPdfQueue.length,
  peak: () => PEAK,
  pdfFile, imgFile,
  idle: () => new Promise(r => setTimeout(r, 0))
};`)(assemblePage);

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const ok = (cond, what) => { if (!cond) throw new Error(what); };
const eq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want)) {
    throw new Error((what || 'value') + ': got ' + JSON.stringify(got) + ', wanted ' + JSON.stringify(want));
  }
};
const settle = async () => { for (let i = 0; i < 200; i++) await new Promise(r => setTimeout(r, 0)); };

// ── the source itself: the shape that cannot be checked by running it ────────

test('a PDF is turned away from the model INSIDE startRapidJob', () => {
  // The door above it sorts files too, but the door is one caller. This is the
  // guard that a caller added next month cannot walk past — and walking past it
  // is not an error, it is a paper read with every figure missing.
  const body = cut('function startRapidJob(file, level, opts)', '\n// `opts` is what a PDF PAGE carries in', 'startRapidJob');
  ok(/application\/pdf/.test(body), 'startRapidJob no longer recognises a PDF');
  ok(body.indexOf('_rapidQueuePdf') < body.indexOf('processRapidJob('), 'a PDF reaches the reader before it is turned away');
});

test('every route into the pad goes through the ONE door', () => {
  for (const fn of ['rapidPickFiles', 'rapidPaste', 'rapidDrop']) {
    const body = cut('function ' + fn + '(', '\n}\n', fn);
    ok(/rapidAddFiles\(/.test(body), fn + ' does not hand its files to rapidAddFiles');
    ok(!/startRapidJob\(/.test(body), fn + ' queues a job itself — a route with its own pipeline is a route that drifts');
  }
});

test('the paste route reads FILES, not just image mime types', () => {
  // A PDF copied in Explorer or Finder arrives as kind "file". Matching on
  // `type.startsWith("image/")` alone makes "paste a pile of PDFs" a paste that
  // silently does nothing at all.
  const body = cut('function rapidPaste(e)', '\nfunction rapidDrop', 'rapidPaste');
  ok(/kind !== ['"]file['"]/.test(body) || /kind === ['"]file['"]/.test(body), 'rapidPaste does not look at the clipboard item kind');
  ok(/application\/pdf/.test(body), 'rapidPaste does not accept a pasted PDF');
});

test('a blank page is an outcome, not a failure', () => {
  const body = cut('async function processRapidJob(jobId, file, batchLevel, opts)', '\n// Turn one AI reading into a question object', 'processRapidJob');
  ok(/o\.blankOk/.test(body), 'processRapidJob does not honour blankOk — every cover page becomes a red card');
  ok(/blank: true/.test(body), 'processRapidJob does not report a blank page back to the PDF feeder');
  ok(/return \{ added: added\.length, questions: added \}/.test(body), 'processRapidJob does not report how many questions it added');
  ok(/rapidPayloads\(/.test(body), 'processRapidJob reads one question out of a whole page again');
  // Every question on a multi-question page must end up with SOMETHING in its
  // picture slot. An empty one reaches Vetting wearing "Diagram missing", and
  // the only way back is to go and find the paper again.
  ok(/sharePage/.test(body), 'a multi-question page no longer falls back to the whole page — its questions land with an empty picture slot');
  ok(/_cleanToBlackAndWhite/.test(body) && /_pagePromise/.test(body), 'the whole page is not prepared ONCE and shared — five questions would each pay to clean the same sheet');
  ok(/diagramWhole/.test(body), 'a question wearing the whole page is not marked, so its card reads as finished work');
});

// ── the door ────────────────────────────────────────────────────────────────

test('the door captures the batch level ONCE for the whole drop', async () => {
  M.reset();
  M.setLevel('P3');
  M.rapidAddFiles([M.imgFile('a.png'), M.imgFile('b.png')], 'drop');
  M.setLevel('P4');                       // the author moves the picker on
  await settle();
  eq(M.LOG.read.map(r => r.level), ['P3', 'P3'], 'the level was re-read per file');
});

test('images and PDFs in one drop are both taken', async () => {
  M.reset();
  M.setNumPages(2);
  M.rapidAddFiles([M.imgFile('a.png'), M.pdfFile('paper.pdf')], 'drop');
  await settle();
  eq(M.LOG.read.filter(r => !r.source).length, 1, 'the image was not queued');
  eq(M.LOG.read.filter(r => r.source).length, 2, 'the PDF pages were not queued');
});

test('a file that is neither is refused, and says so', async () => {
  M.reset();
  const n = M.rapidAddFiles([new File([new Uint8Array(2)], 'notes.txt', { type: 'text/plain' })], 'drop');
  eq(n, 0, 'a text file was accepted');
  ok(M.LOG.toasts.length, 'nothing was said about the refused file');
  await settle();
});

// ── the expander ────────────────────────────────────────────────────────────

test('every page of the PDF is queued, in the paper\'s own order', async () => {
  M.reset();
  M.setNumPages(5);
  await M._rapidExpandPdf(M.pdfFile('paper.pdf'), '');
  await settle();
  eq(M.RENDERED, [1, 2, 3, 4, 5], 'the pages were not rendered in order');
  eq(M.LOG.read.map(r => r.page), [1, 2, 3, 4, 5], 'the pages were not read in order');
});

test('the batch level is carried to EVERY page', async () => {
  M.reset();
  M.setNumPages(4);
  await M._rapidExpandPdf(M.pdfFile('paper.pdf'), 'P5', '');
  await settle();
  eq(M.LOG.read.map(r => r.level), ['P5', 'P5', 'P5', 'P5'], 'a page landed at a different level from the rest of its paper');
});

// 📅 The batch's release date is the level's twin: read once at the door, and
// carried the whole way down. A forty-page paper takes minutes to render with
// the pad open the whole time, so a page that re-read the picker would land at
// whatever the author had changed it to by then — and both halves of the paper
// would look perfectly right on their own cards.
test('the batch RELEASE DATE is carried to EVERY page', async () => {
  M.reset();
  M.setNumPages(4);
  await M._rapidExpandPdf(M.pdfFile('paper.pdf'), '', '2030-01-12');
  await settle();
  eq(M.LOG.read.map(r => r.release), ['2030-01-12', '2030-01-12', '2030-01-12', '2030-01-12'],
     'a page of the paper was not held back with the rest of it');
});

test('a PDF dropped on the pad carries the date it was dropped with', async () => {
  M.reset();
  M.setNumPages(2);
  M.setRelease('2030-02-02');
  M.rapidAddFiles([M.pdfFile('paper.pdf')], 'drop');
  // The picker is moved WHILE the paper renders — the exact race the capture
  // at the door exists for.
  M.setRelease('2031-09-09');
  await settle();
  eq(M.LOG.read.map(r => r.release), ['2030-02-02', '2030-02-02'],
     'the paper picked up a date set after it was queued');
});

test('a paper dropped with NO date behaves byte-for-byte as it always did', async () => {
  M.reset();
  M.setNumPages(2);
  M.rapidAddFiles([M.pdfFile('paper.pdf')], 'drop');
  await settle();
  eq(M.LOG.read.map(r => r.release), ['', ''], 'an unscheduled paper picked up a date from somewhere');
});

test('every page is told a blank page is allowed', async () => {
  M.reset();
  M.setNumPages(3);
  await M._rapidExpandPdf(M.pdfFile('paper.pdf'), '');
  await settle();
  ok(M.LOG.read.every(r => r.blankOk), 'a PDF page would file a red card for having nothing on it');
});

test('a page names its paper and its page number', async () => {
  M.reset();
  M.setNumPages(2);
  await M._rapidExpandPdf(M.pdfFile('2023 SA2.pdf'), '');
  await settle();
  ok(/2023 SA2\.pdf/.test(M.LOG.read[0].source), 'the page does not name its paper');
  ok(/page 1 of 2/.test(M.LOG.read[0].source), 'the page does not name which page it is');
});

test('the page cap holds, and the author is told', async () => {
  M.reset();
  M.setNumPages(M.RAPID_PDF_MAX_PAGES + 25);
  await M._rapidExpandPdf(M.pdfFile('book.pdf'), '');
  await settle();
  eq(M.LOG.read.length, 0, 'oversized paper partially imported');
  ok(M.jobs().some(j=>/Split it/.test(j.error)), 'missing explicit split instruction');
});

test('no more than RAPID_PDF_PAR pages are ever in flight', async () => {
  // A page is an AI call. Forty of them fired at once is a rate limit, not a
  // fast import — and the failures it causes are read as "the PDF could not be
  // read" rather than "we asked for too much at once".
  M.reset();
  M.setNumPages(12);
  await M._rapidExpandPdf(M.pdfFile('paper.pdf'), '');
  await settle();
  eq(M.LOG.read.length, 12, 'not every page was read');
  ok(M.peak() <= M.RAPID_PDF_PAR, 'pages in flight peaked at ' + M.peak() + ', over the cap of ' + M.RAPID_PDF_PAR);
  ok(M.RAPID_PDF_PAR >= 1 && M.RAPID_PDF_PAR <= 4, 'RAPID_PDF_PAR is outside anything a school connection would survive');
});

test('a failed page stops the paper without publishing its incomplete tail', async () => {
  M.reset();M.setNumPages(4);M.setPages({1:0,2:3,3:'throw',4:1});
  await M._rapidExpandPdf(M.pdfFile('paper.pdf'),'');
  eq(M.LOG.read.map(r=>r.page),[1,2,3],'read past a broken boundary');
  eq(M.SAVED.length,2,'incomplete final question on page 2 was published');
  ok(M.jobs().some(j=>/Stopped at page 3/.test(j.error)), 'missing actionable failure');
});

test('the PDF job card is taken down when the paper is done', async () => {
  M.reset();
  M.setNumPages(2);
  await M._rapidExpandPdf(M.pdfFile('paper.pdf'), '');
  await settle();
  eq(M.jobs().length, 0, 'a spinner was left on screen after the paper finished');
  eq(M.destroyed(), 1, 'the PDF document was never released');
});

test('a PDF that cannot be opened leaves ONE red card, not silence', async () => {
  M.reset();
  M.setNumPages(0);
  await M._rapidExpandPdf(M.pdfFile('broken.pdf'), '');
  await settle();
  eq(M.jobs().filter(j => j.status === 'error').length, 1, 'an unopenable PDF vanished without a card');
});

test('two PDFs are rendered one at a time', async () => {
  M.reset();
  M.setNumPages(2);
  M.rapidAddFiles([M.pdfFile('a.pdf'), M.pdfFile('b.pdf')], 'drop');
  // One is in flight, the other is waiting its turn.
  eq(M.queueLen(), 1, 'both PDFs started rendering at once');
  await settle();
  eq(M.LOG.read.length, 4, 'the second PDF never ran');
});

test('a page file carries the paper and the page in its NAME', () => {
  const f = M._rapidPageFile({ mimeType: 'image/jpeg', data: 'AAAA' }, '2023 CA1.pdf', 7);
  ok(/2023 CA1/.test(f.name || ''), 'the page file does not name its paper');
  ok(/7/.test(f.name || ''), 'the page file does not name its page');
  ok(!/\.pdf/i.test(f.name || ''), 'the page file still calls itself a PDF');
});

// ── 🩺 ↻ failures that say WHY, and can be run again (v1.109.0) ──────────────
//
// The report this was written for: a vetting list of red cards reading "try a
// clearer screenshot" when no AI engine had looked at any of them — ChatGPT's
// allowance used, Gemini's credits empty, Kimi's key unset. Each failure here
// is silent: a card still appears, it just blames the picture, or a stopped
// forty-page paper can only be dropped in again from page 1.

test('an outage card does NOT tell the author to take a clearer screenshot', async () => {
  M.reset();
  M.setPages({ 0: 'outage' });
  M.rapidAddFiles([M.imgFile('q.png')], 'paste');
  await settle();
  const card = M.jobs().find(j => j.status === 'error');
  ok(card, 'the failure left no card');
  ok(card.outage, 'three empty accounts were read as a bad screenshot');
  const html = M.rapidErrorCardHtml(card);
  ok(!/clearer/i.test(html), 'the outage card still blames the screenshot');
  ok(/is-outage/.test(html), 'the outage card is drawn as an ordinary red error');
  ok(/MOONSHOT_API_KEY/.test(html) && /AI Studio/.test(html) && /midnight, Singapore time/.test(html), 'the card does not name the fix for each engine');
  ok(/data-rapid-retry=/.test(html), 'the outage card offers no ↻ Retry');
  ok(/data-rapid-engine=/.test(html), 'the teacher is not offered 🧠 AI Engine on an outage');
  ok(/No AI engine could answer/.test(M.LOG.status.at(-1) || ''), 'the pad status still says the screenshot could not be read');
});

test('an employee is not offered 🧠 AI Engine (she cannot open it)', async () => {
  M.reset(); M.setAdmin(false);
  M.setPages({ 0: 'outage' });
  M.rapidAddFiles([M.imgFile('q.png')], 'paste');
  await settle();
  const html = M.rapidErrorCardHtml(M.jobs()[0]);
  ok(!/data-rapid-engine=/.test(html), 'a button to a page the employee cannot open was drawn');
  ok(/data-rapid-retry=/.test(html), 'the employee lost ↻ Retry with it');
});

test('a screenshot an engine LOOKED at and could not read is still a red card with the old advice', async () => {
  M.reset();
  M.setPages({ 0: 'garbled' });
  M.rapidAddFiles([M.imgFile('q.png')], 'paste');
  await settle();
  const card = M.jobs()[0];
  ok(card && card.status === 'error' && !card.outage, 'an unreadable screenshot was called an outage');
  const html = M.rapidErrorCardHtml(card);
  ok(/clearer screenshot/.test(html) && /is-error/.test(html), 'the genuine unreadable case lost its advice');
  ok(/data-rapid-retry=/.test(html), 'an unreadable screenshot cannot be retried');
});

test('↻ Retry runs a screenshot again with the level and date it was QUEUED with', async () => {
  M.reset();
  M.setLevel('P3'); M.setRelease('2030-01-12');
  M.setPages({ 0: 'outage' });
  M.rapidAddFiles([M.imgFile('q.png')], 'paste');
  await settle();
  const card = M.jobs().find(j => j.status === 'error');
  M.setLevel('P5'); M.setRelease('2031-02-02');          // the pad moves on
  M.setPages({ 0: 1 });                                   // …and the engine comes back
  ok(M.retryRapidJob(card.id), 'retry refused a retryable card');
  await settle();
  const reads = M.LOG.read.filter(r => !r.source);
  eq(reads.length, 2, 'the screenshot was not read again');
  eq([reads[1].level, reads[1].release], ['P3', '2030-01-12'], 'the retry picked up the pad\'s live settings');
  eq(M.jobs().filter(j => j.status === 'error').length, 0, 'the red card stayed up after a good retry');
});

test('↻ Retry all reruns every retryable card, in the order they were pasted', async () => {
  M.reset();
  M.setPages({ 0: 'outage' });
  M.rapidAddFiles([M.imgFile('a.png'), M.imgFile('b.png'), M.imgFile('c.png')], 'paste');
  await settle();
  eq(M.jobs().filter(j => j.status === 'error').length, 3, 'not every screenshot left a card');
  const strip = M.rapidRetryStripHtml();
  ok(/Retry all \(3\)/.test(strip), 'the strip does not offer to retry all three');
  ok(/waiting for an AI engine/.test(strip), 'the strip calls an outage "could not be read"');
  M.setPages({ 0: 1 });
  M.LOG.read.length = 0;
  eq(M.retryAllRapidJobs(), 3, 'retry all did not rerun all three');
  await settle();
  eq(M.LOG.read.map(r => r.name), ['a.png', 'b.png', 'c.png'], 'retry all ran them out of order');
  eq(M.jobs().length, 0, 'cards were left behind after retry all');
});

test('Dismiss all clears the failed cards and leaves the running ones alone', async () => {
  M.reset();
  M.setPages({ 0: 'outage' });
  M.rapidAddFiles([M.imgFile('a.png'), M.imgFile('b.png')], 'paste');
  await settle();
  M.jobs().push({ id: 'busy_1', status: 'processing' });
  M.dismissAllRapidErrors();
  eq(M.jobs().map(j => j.id), ['busy_1'], 'dismiss all touched a card that was still working');
});

test('a paper that stops on an empty account RESUMES at that page — nothing read twice, nothing lost', async () => {
  M.reset();
  M.setNumPages(5);
  M.setLevel('P4');
  M.setPages({ 3: 'outage' });
  await M._rapidExpandPdf(M.pdfFile('2025 SA2.pdf'), 'P4', '2030-03-03');
  await settle();
  eq(M.LOG.read.map(r => r.page), [1, 2, 3], 'the paper read past the page that failed');
  const cards = M.jobs().filter(j => j.status === 'error');
  eq(cards.length, 1, 'one stop left ' + cards.length + ' cards');
  const card = cards[0];
  ok(card.outage, 'the paper\'s card blames the paper for an outage');
  ok(/Stopped at page 3 of 5/.test(card.error), 'the card does not say where it stopped');
  eq(card.retry && card.retry.resume && card.retry.resume.startPage, 3, 'the retry would not pick up at page 3');
  ok(/↻ Retry from page 3/.test(M.rapidErrorCardHtml(card)), 'the button does not say where it picks up');
  ok(/Pages 1–2 are done/.test(card.sub || ''), 'the card does not say what is already in vetting');
  const savedBefore = M.SAVED.map(q => q.id);
  M.setPages({});                                       // credits topped up
  M.setLevel('P6');                                     // the picker moved on meanwhile
  ok(M.retryRapidJob(card.id), 'the paper could not be retried');
  await settle();
  eq(M.LOG.read.map(r => r.page), [1, 2, 3, 3, 4, 5], 'pages already in vetting were read (and paid for) again');
  ok(M.LOG.read.slice(3).every(r => r.level === 'P4' && r.release === '2030-03-03'), 'the resumed pages lost the batch level or date');
  const ids = M.SAVED.map(q => q.id);
  eq(new Set(ids).size, ids.length, 'a question was published twice across the resume');
  eq(ids.length, 5, 'the question held open across the page break was lost in the resume');
  ok(savedBefore.every(id => ids.includes(id)), 'questions from before the stop went missing');
  eq(M.jobs().length, 0, 'the resumed paper left a card behind');
  ok(/picked up again at page 3/.test(M.LOG.status.at(-1) || ''), 'the finish line does not say it was a resume');
});

test('a paper that stops on page 1 retries from page 1 — and says nothing is in vetting yet', async () => {
  M.reset();
  M.setNumPages(2);
  M.setPages({ 1: 'outage' });
  await M._rapidExpandPdf(M.pdfFile('p.pdf'), '', '');
  await settle();
  const card = M.jobs().find(j => j.status === 'error');
  eq(card.retry.resume.startPage, 1);
  ok(!/Pages 1–0/.test(card.sub || ''), 'the card claims pages 1–0 are done');
  ok(/↻ Retry<\/button>|↻ Retry"|>↻ Retry</.test(M.rapidErrorCardHtml(card)), 'a page-1 stop is labelled as a resume');
});

test('a retried paper waits its turn in the ONE PDF queue', async () => {
  M.reset();
  M.setNumPages(2);
  M.setPages({ 2: 'outage' });
  await M._rapidExpandPdf(M.pdfFile('a.pdf'), '', '');
  await settle();
  const card = M.jobs().find(j => j.status === 'error');
  M.setPages({});
  M.rapidAddFiles([M.pdfFile('b.pdf')], 'drop');        // b is rendering…
  M.retryRapidJob(card.id);                             // …so a waits behind it
  eq(M.queueLen(), 1, 'the retried paper started rendering alongside another one');
  await settle();
  eq(M.jobs().length, 0, 'one of the papers never finished');
});

test('a PDF that cannot be opened, or is too long, offers NO retry (it would fail the same way)', async () => {
  M.reset();
  M.setNumPages(0);
  await M._rapidExpandPdf(M.pdfFile('broken.pdf'), '');
  M.setNumPages(M.RAPID_PDF_MAX_PAGES + 1);
  await M._rapidExpandPdf(M.pdfFile('book.pdf'), '');
  await settle();
  const cards = M.jobs().filter(j => j.status === 'error');
  eq(cards.length, 2);
  ok(cards.every(c => !c.retry), 'an unopenable or oversized PDF offered ↻ Retry');
  ok(cards.every(c => !/data-rapid-retry=/.test(M.rapidErrorCardHtml(c))), 'the button was drawn anyway');
});

test('a failed PDF PAGE hands its failure to its paper instead of leaving its own card', () => {
  const body = cut('async function processRapidJob(jobId, file, batchLevel, opts)', '\n// Turn one AI reading into a question object', 'processRapidJob');
  ok(/if \(o\.deferSave\) \{[\s\S]*?return \{ failed: true, error: err \};/.test(body), 'a page failure no longer goes back to its paper — two cards per stop, and the page card cannot resume');
  const starter = cut('function startRapidJob(file, level, opts)', '\n// `opts` is what a PDF PAGE carries in', 'startRapidJob');
  ok(/retry: o\.deferSave \? null/.test(starter), 'a PDF page carries its own retry — retried alone it would publish half a question');
});

test('the red card never prints raw provider text unescaped', async () => {
  M.reset();
  const job = { id: 'x"><script>', status: 'error', title: '<b>t</b>', error: '<img src=x onerror=alert(1)>', sub: '<i>s</i>', level: '<u>P3</u>' };
  const html = M.rapidErrorCardHtml(job);
  ok(!/<img src=x/.test(html) && !/<script>/.test(html) && !/<b>t<\/b>/.test(html) && !/<u>P3/.test(html), 'unescaped text reached the card');
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
