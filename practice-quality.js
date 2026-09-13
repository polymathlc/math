// Deterministic checks only: no AI, network request, answer solving or performance-based verdict.
// A low success rate describes difficulty. It does not establish that a question is wrong.
export const PRACTICE_QUALITY_VERSION = 1;
const SEVERITY = Object.freeze({
  'content-missing': 'blocked', 'content-malformed': 'blocked',
  'image-missing': 'blocked', 'image-invalid': 'blocked', 'image-unavailable': 'blocked',
  'options-malformed': 'blocked', 'options-duplicate': 'blocked',
  'table-malformed': 'blocked', 'table-truncated': 'blocked',
  'answer-key-review': 'blocked', 'checked-issue': 'blocked', 'teacher-quarantine': 'blocked',
  'table-shape-review': 'suspect', 'placeholder-review': 'suspect',
  'text-review': 'suspect', 'metadata-review': 'suspect', 'diagram-review': 'suspect',
  'import-warning': 'suspect', 'checked-review': 'suspect', 'student-report': 'suspect', 'reported-review': 'suspect'
});
const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
// Do not apply NFKC, fold case, remove operators or strip supposed HTML here:
// x² and x2, m and M, and x<y are potentially different mathematical content.
const text = value => String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
const scalar = value => value == null || typeof value === 'string' || (typeof value === 'number' && Number.isFinite(value));
// Practice escapes authoring HTML rather than rendering it. Recognize only
// unmistakable markup: paired tags, void tags and tags with attributes. A bare
// comparison such as x<i>y or x<y and z>4 must keep its mathematical meaning.
function authoringText(value) {
  const raw = String(value ?? '');
  const names = 'p|div|span|br|b|strong|i|em|u|sup|sub|ul|ol|li|table|tbody|thead|tr|th|td|img|svg|path|script|style';
  const tag = new RegExp('<\\/?(?:' + names + ')(?:\\s+[^<>]*|\\s*\\/?)>', 'gi');
  const tags = raw.match(tag) || [];
  const markup = (tags.length > 0 && !raw.replace(tag, '').trim()) || tags.some(token => /^<\//.test(token)
    || /^<(?:br|img|path)\b/i.test(token) || /^<[a-z]+\s+\S/i.test(token));
  const entity = /&(?:nbsp|lt|gt|amp|quot|apos|#(?:0*160|x0*a0));/i.test(raw);
  const visible = (markup ? raw.replace(tag, '') : raw)
    .replace(/&(?:nbsp|#(?:0*160|x0*a0));/gi, ' ')
    .replace(/[\u200b-\u200d\u2060\ufeff]/g, '');
  return {visible, artifact: markup || entity};
}
const usableText = value => !!text(authoringText(value).visible).replace(/[\s_.…—–-]/g, '');
const placeholder = value => /\[(?:insert|replace with)\s+(?:question|diagram|image|table|text|options?)(?:\s+here)?\]|\{\{\s*(?:QUESTION_TEXT|INSERT_QUESTION|INSERT_DIAGRAM|INSERT_OPTIONS)\s*\}\}|\bLorem ipsum\b|^\s*(?:TODO|TBD):\s*(?:question|diagram|options?|text)\s*$/i.test(String(value ?? ''));

function hash(raw) {
  let a = 2166136261, b = 5381;
  for (let i = 0; i < raw.length; i++) {
    a = Math.imul(a ^ raw.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ raw.charCodeAt(i);
  }
  return `${raw.length}:${(a >>> 0).toString(36)}:${(b >>> 0).toString(36)}`;
}

// This fingerprint uses an explicit public-field projection. In particular it
// must NEVER hash correctOption, expected, markingGuide or annotation answers:
// hashing a small private answer space would still disclose those answers.
export function questionQualitySignature(question) {
  const q = object(question) ? question : {};
  const blocks = Array.isArray(q.blocks) ? q.blocks.map(block => {
    if (!object(block)) return null;
    return {type: block.type ?? null, content: block.content ?? null, url: block.url ?? null,
      annotate: block.annotate === true, rows: block.rows ?? null, caption: block.caption ?? null,
      header: block.header ?? null, lines: block.lines ?? null, label: block.label ?? null};
  }) : q.blocks ?? null;
  try {
    return hash(JSON.stringify([q.title ?? null, q.level ?? null, q.topic ?? null, q.topics ?? null,
      q.los ?? null, blocks, q.options ?? null, q.questionType ?? null,
      q.marks ?? null, q.partMarks ?? null, q.diagramWhole === true, q.hasDiagram === true,
      q.practiceQuarantined === true, q.qualityStatus ?? null]));
  } catch { return ''; }
}

function imageReason(value) {
  const url = String(value ?? '').trim();
  if (!url) return 'image-missing';
  if (/^blob:/i.test(url)) return 'image-unavailable'; // A saved blob expires with its creating page.
  if (/^data:/i.test(url)) {
    const m = /^data:image\/[a-z0-9.+-]+(?:;[^,]*)?,([\s\S]+)$/i.exec(url);
    if (!m || !m[1].trim()) return 'image-invalid';
    if (/;base64,/i.test(url) && !/^[a-z0-9+/\s]+={0,2}$/i.test(m[1])) return 'image-invalid';
    return '';
  }
  if (/^https?:\/\//i.test(url) || url.startsWith('//')) {
    try { const parsed = new URL(url.startsWith('//') ? `https:${url}` : url); return parsed.hostname ? '' : 'image-invalid'; }
    catch { return 'image-invalid'; }
  }
  // Relative image assets are legitimate. Other schemes and obvious placeholder
  // values are not loadable student diagrams. Availability needs an actual img error.
  if (/^[a-z][a-z0-9+.-]*:/i.test(url) || /[<>\u0000-\u001f]/.test(url)) return 'image-invalid';
  return /^(?:\.{0,2}\/)/.test(url) || /\.(?:png|jpe?g|gif|webp|svg|avif|bmp)(?:[?#].*)?$/i.test(url) ? '' : 'image-invalid';
}

function assessment(reasons) {
  const unique = [...new Set(reasons)].filter(reason => own(SEVERITY, reason)).sort();
  const tier = unique.some(reason => SEVERITY[reason] === 'blocked') ? 'blocked' : unique.length ? 'suspect' : 'sound';
  return {eligible: tier !== 'blocked', tier, penalty: tier === 'blocked' ? 100000 : tier === 'suspect' ? 10000 : 0, reasons: unique};
}

function structuralReasons(q, options) {
  const reasons = [];
  const noteText = value => {
    if (placeholder(value)) reasons.push('placeholder-review');
    if (authoringText(value).artifact) reasons.push('text-review');
    if ((String(value ?? '').match(/\uFFFD/g) || []).length >= 2) reasons.push('text-review');
  };
  let content = false, images = 0;
  const failedImages = new Set(options.failedImageUrls || []);
  if (!Array.isArray(q.blocks)) reasons.push('content-malformed');
  else for (const block of q.blocks) {
    if (!object(block)) { reasons.push('content-malformed'); continue; }
    if (block.type === 'objectivesBox') continue; // An answer workspace alone is not a question.
    if (block.type === 'image') {
      images++;
      const reason = imageReason(block.url);
      if (reason) reasons.push(reason);
      else content = true;
      if (failedImages.has(String(block.url ?? '').trim())) reasons.push('image-unavailable');
    } else if (block.type === 'table') {
      const rows = block.rows;
      if (!Array.isArray(rows) || !rows.length || rows.some(row => !Array.isArray(row) || !row.length || row.some(cell => !scalar(cell)))) {
        reasons.push('table-malformed'); continue;
      }
      // These are the renderer's tblRows/tblCell caps. Anything beyond them is
      // silently cut off in the existing renderer, so its data must be reviewed.
      if (rows.length > 40 || text(block.caption).length > 200 || rows.some(row => row.length > 12 || row.some(cell => text(cell).length > 200))) reasons.push('table-truncated');
      if (!scalar(block.caption)) reasons.push('table-malformed');
      if (new Set(rows.map(row => row.length)).size > 1) reasons.push('table-shape-review');
      for (const row of rows) for (const cell of row) { content ||= usableText(cell); noteText(cell); }
      content ||= usableText(block.caption);
      noteText(block.caption);
    } else {
      // The real renderer treats legacy block kinds as text via b.content.
      if (!scalar(block.content)) reasons.push('content-malformed');
      else { content ||= usableText(block.content || ''); noteText(block.content); }
    }
  }
  if (!content) reasons.push('content-missing');
  if (q.hasDiagram === true && !images) reasons.push('image-missing');
  const declaredMcq = String(q.questionType ?? '').toLowerCase() === 'mcq';
  const hasOptions = Array.isArray(q.options) && q.options.length > 0;
  if ((q.options != null && !Array.isArray(q.options)) || (declaredMcq && !hasOptions)) reasons.push('options-malformed');
  if (hasOptions) {
    if (q.options.length < 2 || q.options.some(option => !scalar(option) || !usableText(option))) reasons.push('options-malformed');
    else {
      const choices = q.options.map(option => text(option).replace(/^(?:\([1-9]\)|[1-9][.)])\s+/, ''));
      if (new Set(choices).size < choices.length) reasons.push('options-duplicate');
      q.options.forEach(noteText);
    }
  }
  // 0 is the existing "use default marks" setting; blank part marks are allowed
  // while a teacher allocates them. Only complete contradictory allocations flag.
  const marks = Number(q.marks);
  if (q.marks != null && q.marks !== '' && (!Number.isFinite(marks) || marks < 0 || marks > 99)) reasons.push('metadata-review');
  if (Array.isArray(q.partMarks) && q.partMarks.length) {
    const parts = q.partMarks.map(Number);
    if (parts.some(n => !Number.isFinite(n) || n < 0 || n > 20)
      || (marks > 0 && parts.every(n => n > 0) && parts.reduce((a,b) => a+b, 0) !== marks)) reasons.push('metadata-review');
  }
  if (q.diagramWhole === true) reasons.push('diagram-review');
  if (q.practiceQuarantined === true || q.qualityStatus === 'quarantined') reasons.push('teacher-quarantine');
  if (options.studentFlagged === true) reasons.push('student-report');
  return reasons;
}

export function evaluateQuestionQuality(question, options = {}) {
  const q = object(question) ? question : {};
  const reasons = structuralReasons(q, options);
  const summary = q.practiceQuality;
  const sig = questionQualitySignature(q);
  if (options.ignoreStoredSummary !== true && sig && object(summary)
    && summary.version === PRACTICE_QUALITY_VERSION && summary.signature === sig
    && Array.isArray(summary.reasonCodes)) {
    reasons.push(...summary.reasonCodes.filter(reason => own(SEVERITY, reason)));
  }
  return assessment(reasons);
}

// A student's own report contains no feedback text here, just the reported
// public revision and time. An edit clears that revision's report; a teacher's
// acknowledgment clears it only after every report for the revision is reviewed.
export function questionHasUnresolvedStudentFlag(question, report) {
  if (!object(report)) return false;
  const signature = questionQualitySignature(question);
  if (!signature || report.signature !== signature) return false;
  const summary = question?.practiceQuality;
  const reportedAt = typeof report.at === 'number' ? report.at : Date.parse(report.at);
  const reviewedAt = typeof summary?.reportsReviewedAt === 'number' ? summary.reportsReviewedAt : Date.parse(summary?.reportsReviewedAt);
  return !(summary?.version === PRACTICE_QUALITY_VERSION && summary.signature === signature
    && summary.reportCount === 0 && Number.isFinite(reportedAt) && Number.isFinite(reviewedAt)
    && reviewedAt >= reportedAt);
}

// Only the admin save path calls this while the private answer key is available.
// It consumes existing importer results; it never triggers or buys a new check.
// Pass mathImportSignature(q) so findings are used only for the checked revision.
export function buildQuestionQualitySummary(question, options = {}) {
  const q = object(question) ? question : {};
  const reasons = structuralReasons(q, {});
  if (text(q.importWarning)) reasons.push('import-warning');
  const check = q.autoCheck;
  if (object(check) && typeof options.importSignature === 'string' && options.importSignature
    && check.sig === options.importSignature) {
    if (check.state === 'red') reasons.push('checked-issue');
    if (check.state === 'amber') reasons.push('checked-review');
  }
  // Public MCQs deliberately omit this field. Its absence is not an error;
  // an explicitly present invalid private key is one the teacher must fix.
  if (Array.isArray(q.options) && q.options.length >= 2 && own(q, 'correctOption')
    && (!Number.isInteger(q.correctOption) || q.correctOption < 0 || q.correctOption >= q.options.length)) reasons.push('answer-key-review');
  const signature = questionQualitySignature(q);
  const previous = q.practiceQuality?.version === PRACTICE_QUALITY_VERSION && q.practiceQuality.signature === signature ? q.practiceQuality : {};
  // An ordinary admin save may happen before the flag inbox has loaded. Never
  // erase current report metadata just because that caller did not supply it.
  const countInput = own(options, 'unresolvedFlagCount') ? options.unresolvedFlagCount : previous.reportCount;
  const reportCount = Math.min(100000, Math.max(0, Math.floor(Number(countInput) || 0)));
  if (reportCount) reasons.push('reported-review');
  const ackInput = own(options, 'reportsReviewedAt') ? options.reportsReviewedAt : previous.reportsReviewedAt;
  const reportsReviewedAt = typeof ackInput === 'number' ? ackInput : Date.parse(ackInput);
  const result = assessment(reasons);
  return {version: PRACTICE_QUALITY_VERSION, signature, tier: result.tier, reasonCodes: result.reasons, reportCount,
    ...(reportCount === 0 && Number.isFinite(reportsReviewedAt) && reportsReviewedAt > 0 ? {reportsReviewedAt} : {})};
}
