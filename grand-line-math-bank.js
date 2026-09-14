// Grand Line selects exactly three real Math bank MCQs with the released
// Hades grade, mastery, quality and cross-mode family-spacing policy.
import { buildPracticeMasteryContext, evaluatePracticeFit, parsePracticeLevel } from './practice-mastery.js';
import { evaluateQuestionQuality } from './practice-quality.js';
import { buildPracticeCatalog, planPracticeQuestions } from './practice-variety.js';

import { readHadesMathMcq } from './hades-math-bank.js';

export function selectGrandLineMathBankRound({ bank = [], level, progress = {}, profile = {},
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
    progress, run, uid, now, limit: 3, onePerFamily: true, excludeIds: excludedIds }).questions;
  if (selected.length !== 3) return [];
  return selected.map(q => {
    const { mcq } = byId.get(String(q.id));
    return { id: String(q.id), title: String(q.title || 'Math question'), topic: String(q.topic || 'Math'),
      html: renderBlocks(q), options: mcq.options.map(renderOption), answer: mcq.answer, ...(mcq.grading ? { grading: mcq.grading } : {}),
      explainHtml: typeof q.markingGuide === 'string' ? q.markingGuide : '', source: q };
  });
}
