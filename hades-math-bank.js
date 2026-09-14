// Hades uses only persisted, locally gradable bank MCQs. No generated or
// built-in fallback and no marking/AI service is part of this beta adapter.
import { buildPracticeMasteryContext, evaluatePracticeFit, parsePracticeLevel } from './practice-mastery.js';
import { evaluateQuestionQuality } from './practice-quality.js';
import { buildPracticeCatalog, planPracticeQuestions } from './practice-variety.js';

export function readHadesMathMcq(question, remote = false) {
  const q = question || {};
  const blocks = Array.isArray(q.blocks) ? q.blocks : [];
  const mcqBlocks = blocks.filter(block => block?.type === 'mcq');
  if (mcqBlocks.length > 1 || blocks.some(block => block && (
    ['answer', 'plainanswer', 'openLines', 'workingSpace', 'fillblank', 'answerLine'].includes(block.type)
    || (q.annotation && block.type === 'image' && block.annotate !== false)))) return null;
  if (Array.isArray(q.options) && q.options.length >= 2 && mcqBlocks.length) return null;
  let options = q.options, answer = q.correctOption;
  if (!Array.isArray(options) || (!remote && !Number.isInteger(answer))) {
    const block = mcqBlocks.find(b => Array.isArray(b.options));
    if (!block || typeof block.correctId !== 'string' || !block.correctId) return null;
    const matches = block.options.filter(option => option?.id === block.correctId);
    if (matches.length !== 1) return null;
    answer = block.options.findIndex(option => option?.id === block.correctId);
    options = block.options.map(option => option?.text);
  }
  if (remote && Array.isArray(q.options)) answer = null;
  if (options.length < 2 || options.length > 8 || answer < 0 || answer >= options.length) return null;
  if (!options.every(value => typeof value === 'string' && value.trim())) return null;
  if (new Set(options.map(value => value.normalize('NFC').trim().replace(/\s+/g, ' '))).size !== options.length) return null;
  return { options: options.slice(), answer, ...(remote && answer === null ? { grading: 'remote' } : {}) };
}

export function selectHadesMathBankRound({ bank = [], level, progress = {}, profile = {},
  uid = '', served = {}, excludedIds = [], syllabusById = {}, isReleased = () => true,
  qualityOptions = () => ({}), renderBlocks, renderOption = value => value,
  now = Date.now(), random = Math.random, remote = false } = {}) {
  if (!parsePracticeLevel(level).known || !uid || typeof renderBlocks !== 'function') return [];
  const questions = Array.isArray(bank) ? bank.filter(Boolean) : [];
  const catalog = buildPracticeCatalog(questions);
  const sound = new Map();
  for (const q of questions) {
    const quality = evaluateQuestionQuality(q, qualityOptions(q));
    if (quality.eligible && quality.tier === 'sound') sound.set(String(q.id), quality);
  }
  const context = buildPracticeMasteryContext({ studentLevel: level, progress, profile,
    bank: questions, catalog, syllabusById, now,
    excludeEvidenceIds: new Set(questions.filter(q => !sound.has(String(q.id))).map(q => String(q.id))) });
  const candidates = questions.flatMap(q => {
    const id = String(q.id || '');
    const mcq = readHadesMathMcq(q, remote);
    if (!id || !mcq || !sound.has(id) || !isReleased(q) || (q.status && q.status !== 'approved')) return [];
    const fit = evaluatePracticeFit(q, { context });
    return fit.eligible ? [{ q, mcq, fit, quality: sound.get(id), tie: random() }] : [];
  }).sort((a, b) => a.quality.penalty - b.quality.penalty || b.fit.score - a.fit.score || a.tie - b.tie);
  if (!candidates.length) return [];
  const run = { uid, served: Object.entries(served).filter(([, at]) => Number(at) > 0)
    .map(([id, at]) => ({ id, at: Number(at) })) };
  const freshIds = new Set(planPracticeQuestions(candidates.map(row => row.q), { bank: questions,
    catalog, progress, run, uid, now, onePerFamily: false, excludeIds: excludedIds }).questions.map(q => String(q.id)));
  const fresh = candidates.filter(row => freshIds.has(String(row.q.id)));
  // School year is an explicit priority before legacy numerical ratings or
  // randomization. A high old P3 rating must never disguise P3 work as P6.
  const stage = parsePracticeLevel(level).max;
  const currentGrade = fresh.filter(row => row.fit.diagnostic.level.max === stage);
  const gradePool = currentGrade.length ? currentGrade : fresh.filter(row =>
    row.fit.diagnostic.level.max === stage - 1 && row.fit.diagnostic.evidenceCount >= 3
      && row.fit.diagnostic.mastery < 0.55);
  if (!gradePool.length) return [];
  const cohort = gradePool.filter(row => row.fit.score >= gradePool[0].fit.score - 150)
    .sort((a, b) => a.tie - b.tie);
  const byId = new Map(cohort.map(row => [String(row.q.id), row]));
  const selected = planPracticeQuestions(cohort.map(row => row.q), { bank: questions, catalog,
    progress, run, uid, now, limit: 5, onePerFamily: true, excludeIds: excludedIds }).questions;
  if (selected.length !== 5) return [];
  return selected.map(q => {
    const { mcq } = byId.get(String(q.id));
    return { id: String(q.id), title: String(q.title || 'Math question'), topic: String(q.topic || 'Math'),
      html: renderBlocks(q), options: mcq.options.map(renderOption), answer: mcq.answer, ...(mcq.grading ? { grading: mcq.grading } : {}),
      explainHtml: typeof q.markingGuide === 'string' ? q.markingGuide : '', source: q };
  });
}
