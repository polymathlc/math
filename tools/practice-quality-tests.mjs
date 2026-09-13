import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  evaluateQuestionQuality, buildQuestionQualitySummary, questionQualitySignature,
  questionHasUnresolvedStudentFlag, PRACTICE_QUALITY_VERSION
} from '../practice-quality.js';
import {signature as importSignature} from '../rapid-import/functions/core.js';

const q = extra => ({id: 'q1', title: 'A question', level: 'P4', blocks: [{type: 'text', content: 'What is 4 + 7?'}], ...extra});
const image = url => ({type: 'image', url});
const quality = extra => evaluateQuestionQuality(q(extra));
const summary = question => buildQuestionQualitySummary(question, {importSignature: importSignature(question)});
const checked = (state, extra = {}) => { const question = q(extra); question.autoCheck = {state, sig: importSignature(question), findings: [{title: 'Answer is 42', detail: 'Secret explanation'}]}; return question; };

test('ordinary questions do not need private answers or performance history', () => {
  assert.deepEqual(quality(), {eligible: true, tier: 'sound', penalty: 0, reasons: []});
  assert.equal(quality({attempts: 100, correctCount: 0, wrongCount: 100, successRate: 0}).tier, 'sound');
});

test('image-only and annotation questions are valid without exposed key fields', () => {
  for (const url of ['https://firebasestorage.googleapis.com/v0/b/math/o/abc?alt=media', '/figures/shape.svg', '../images/square.png', 'shape.webp', 'data:image/svg+xml,<svg></svg>', 'data:image/png;base64,iVBORw0KGgo=']) {
    assert.equal(quality({blocks: [image(url)]}).tier, 'sound', url);
    assert.equal(quality({blocks: [{...image(url), annotate: true}]}).tier, 'sound', url);
  }
});

test('empty and malformed visible question content cannot enter automatic practice', () => {
  for (const blocks of [undefined, null, {}, [], [null], [{type: 'text', content: {raw: 'x'}}], [{type: 'text', content: '  '}], [{type: 'objectivesBox', lines: 3}], [{type: 'text', content: '________...'}]]) {
    assert.equal(quality({blocks}).eligible, false, JSON.stringify(blocks));
  }
  assert.equal(evaluateQuestionQuality(null).eligible, false);
  assert.equal(quality({blocks: undefined, questionText: 'Not rendered by the actual question renderer'}).eligible, false);
});

test('legitimate blank answers, sequences, symbols and inequalities are not placeholders', () => {
  for (const content of ['Find the next number: 2, 4, 6, ...', '4 + ___ = 12', 'The number is unknown. Find x.', 'x<y and z>4', '□ + 4 = 9', 'Fill in the blanks: ____', 'Let TBD be a triangle.', 'p = 0.4 and q = 2.5', 'Sketch a diagram here.']) {
    assert.equal(quality({blocks: [{type: 'text', content}]}).tier, 'sound', content);
  }
});

test('specific unresolved authoring placeholders and unreadable replacement text are suspect', () => {
  for (const content of ['[Insert question here]', '{{QUESTION_TEXT}}', '[replace with diagram]', 'TODO: options', 'Lorem ipsum dolor sit amet', 'Find �� apples']) {
    assert.equal(quality({blocks: [{type: 'text', content}]}).tier, 'suspect', content);
  }
});

test('missing, expired or invalid diagram references are blocked even beside valid text', () => {
  for (const url of ['', 'javascript:alert(1)', 'file:///C:/picture.png', 'blob:https://example.com/expired', 'https://', 'data:text/html,x', 'data:image/png;base64,', 'data:image/png;base64,???', '<insert diagram>', 'undefined']) {
    const result = quality({blocks: [...q().blocks, image(url)]});
    assert.equal(result.eligible, false, url);
    assert.ok(result.reasons.some(r => r.startsWith('image-')), url);
  }
  assert.ok(quality({hasDiagram: true}).reasons.includes('image-missing'));
});

test('already observed image load failures block without making a network request', () => {
  const question = q({blocks: [image('https://example.com/diagram.png')]});
  assert.equal(evaluateQuestionQuality(question, {failedImageUrls: new Set(['https://example.com/diagram.png'])}).eligible, false);
  assert.equal(evaluateQuestionQuality(question).eligible, true, 'a transient failure is not stored globally');
});

test('MCQs are valid without private correctOption and open questions without options', () => {
  assert.equal(quality({options: ['11', '12', '13', '14']}).tier, 'sound');
  assert.equal(quality({options: [0, 1]}).tier, 'sound');
  assert.equal(quality({options: []}).tier, 'sound');
  assert.equal(quality({questionType: 'open'}).tier, 'sound');
});

test('broken or duplicate MCQ choices are blocked', () => {
  for (const options of ['11,12', ['11'], ['11', ' '], ['11', null], ['11', {}], ['11', '11'], [' 11 ', '11'], ['1) 11', '2) 11']]) {
    assert.equal(quality({options}).eligible, false, JSON.stringify(options));
  }
  assert.equal(quality({questionType: 'mcq', options: []}).eligible, false);
});

test('option normalization does not collapse meaningful math, case or units', () => {
  for (const options of [['m', 'M'], ['x²', 'x2'], ['0.5', '0.6'], ['1.5', '2.5'], ['x<y', 'x>y'], ['2 kg', '2 g'], ['1/2', '1/3']]) {
    assert.equal(quality({options}).tier, 'sound', JSON.stringify(options));
  }
});

test('table questions with blank answer cells or a separate blank grid remain valid', () => {
  assert.equal(quality({blocks: [{type: 'table', rows: [['Length', 'Width'], ['4', '']], header: true}]}).tier, 'sound');
  assert.equal(quality({blocks: [...q().blocks, {type: 'table', rows: [['', ''], ['', '']], header: false}]}).tier, 'sound');
  assert.equal(quality({blocks: [{type: 'table', rows: [[1, 2], [3, null]], caption: 'Find the missing number'}]}).tier, 'sound');
});

test('malformed tables are blocked and padded ragged rows only ask for review', () => {
  for (const rows of [undefined, [], {}, [['x'], null], [['x'], []], [['x'], [{value: '2'}]]]) {
    assert.equal(quality({blocks: [...q().blocks, {type: 'table', rows}]}).eligible, false, JSON.stringify(rows));
  }
  assert.equal(quality({blocks: [{type: 'table', rows: [['a', 'b'], ['c']]}]}).tier, 'suspect');
});

test('renderer truncation cannot silently remove question table data', () => {
  for (const rows of [Array.from({length: 41}, () => ['a']), [Array(13).fill('a')], [['a'.repeat(201)]]]) {
    assert.ok(quality({blocks: [{type: 'table', rows}]}).reasons.includes('table-truncated'));
  }
  const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  for (const [key, value] of [['TBL_ROWS_MAX', 40], ['TBL_COLS_MAX', 12], ['TBL_CELL_MAX', 200]]) {
    assert.match(html, new RegExp(`const ${key} = ${value};`), 'update quality limits when renderer limits change');
  }
});

test('contradictory marks are suspect, default and unfinished allocations are valid', () => {
  assert.equal(quality({marks: 4, partMarks: [1, 2]}).tier, 'suspect');
  assert.equal(quality({marks: -1}).tier, 'suspect');
  assert.equal(quality({marks: 'not a mark'}).tier, 'suspect');
  assert.equal(quality({marks: 0}).tier, 'sound');
  assert.equal(quality({marks: 4, partMarks: [1, 0]}).tier, 'sound');
  assert.equal(quality({marks: 4, partMarks: [1, 3]}).tier, 'sound');
});

test('whole-page diagram warnings and unresolved own reports rank below sound questions', () => {
  const good = quality();
  const flagged = evaluateQuestionQuality(q(), {studentFlagged: true});
  assert.equal(flagged.tier, 'suspect');
  assert.ok(flagged.penalty > good.penalty + 1000);
  assert.equal(quality({diagramWhole: true}).tier, 'suspect');
  assert.equal(quality({practiceQuarantined: true}).eligible, false);
});

test('only current completed importer findings influence the public quality summary', () => {
  assert.equal(summary(checked('red')).tier, 'blocked');
  assert.equal(summary(checked('amber')).tier, 'suspect');
  for (const state of ['green', 'error', 'stale', undefined]) assert.equal(summary(checked(state)).tier, 'sound');
  const stale = checked('red'); stale.blocks[0].content = 'What is 8 + 7?';
  assert.equal(summary(stale).tier, 'sound');
  assert.equal(buildQuestionQualitySummary(checked('red')).tier, 'sound', 'no signature supplied means no check trusted');
  assert.equal(summary(q({importWarning: 'Private source details'})).tier, 'suspect');
});

test('invalid private MCQ index produces only a generic public review signal', () => {
  for (const correctOption of [null, -1, 8, '1', 1.5]) {
    assert.equal(summary(q({options: ['11', '12'], correctOption})).tier, 'blocked');
  }
  assert.equal(summary(q({options: ['11', '12'], correctOption: 0})).tier, 'sound');
  assert.equal(summary(q({options: ['11', '12']})).tier, 'sound');
});

test('public summaries and signatures cannot reveal private answers, findings or report text', () => {
  const a = q({options: ['11', '12'], correctOption: 0, expected: 'secret-one', markingGuide: 'secret-guide', blocks: [{...q().blocks[0], answerImg: 'secret-image', answerKey: 'secret-block-answer'}]});
  const b = {...a, correctOption: 1, expected: 'different', markingGuide: 'changed', blocks: [{...a.blocks[0], answerImg: 'changed', answerKey: 'changed'}]};
  assert.equal(questionQualitySignature(a), questionQualitySignature(b));
  assert.deepEqual(summary(a), summary(b));
  const generated = summary(checked('red', {expected: 'SECRET ANSWER'}));
  assert.deepEqual(Object.keys(generated).sort(), ['version', 'signature', 'tier', 'reasonCodes', 'reportCount'].sort());
  assert.doesNotMatch(JSON.stringify(generated), /SECRET|42|explanation|findings|expected|correctOption/);
});

test('stored public quality signals apply only to the same public content revision', () => {
  const question = checked('red'); question.practiceQuality = summary(question);
  delete question.autoCheck;
  assert.equal(evaluateQuestionQuality(question).tier, 'blocked');
  question.blocks[0].content = 'What is 9 + 7?';
  assert.equal(evaluateQuestionQuality(question).tier, 'sound');
  question.practiceQuality = {...question.practiceQuality, signature: questionQualitySignature(question), version: PRACTICE_QUALITY_VERSION + 1};
  assert.equal(evaluateQuestionQuality(question).tier, 'sound');
});

test('re-saving a repaired question does not perpetuate an obsolete summary', () => {
  const question = checked('red'); question.practiceQuality = summary(question);
  question.correctOption = 0; // A private answer change also invalidates the importer check.
  const next = summary(question);
  assert.equal(next.tier, 'sound');
  assert.deepEqual(next.reasonCodes, []);
});

test('only allowed generic reason codes are read from stored summaries', () => {
  const question = q(); question.practiceQuality = {version: 1, signature: questionQualitySignature(question), tier: 'blocked', reasonCodes: ['the secret answer is 42', 'constructor', 'toString']};
  assert.equal(evaluateQuestionQuality(question).tier, 'sound');
  assert.deepEqual(evaluateQuestionQuality(question).reasons, []);
});

test('teacher unresolved report counts deprioritize without exposing report details', () => {
  const question = q();
  question.practiceQuality = buildQuestionQualitySummary(question, {unresolvedFlagCount: 2, reportsReviewedAt: 1000});
  assert.equal(question.practiceQuality.reportCount, 2);
  assert.equal(question.practiceQuality.reportsReviewedAt, undefined, 'open reports cannot be acknowledged');
  assert.equal(evaluateQuestionQuality(question).tier, 'suspect');
  assert.equal(buildQuestionQualitySummary(question).reportCount, 2, 'ordinary save preserves unreviewed metadata');
  question.blocks[0].content = 'Edited question';
  assert.equal(buildQuestionQualitySummary(question).reportCount, 0, 'revision-bound metadata is stale after edit');
});

test('own report stays until a later acknowledgment for the same revision with no open reports', () => {
  const question = q(), report = {signature: questionQualitySignature(question), at: 2000};
  assert.equal(questionHasUnresolvedStudentFlag(question, report), true);
  question.practiceQuality = buildQuestionQualitySummary(question, {unresolvedFlagCount: 0, reportsReviewedAt: 1000});
  assert.equal(questionHasUnresolvedStudentFlag(question, report), true);
  question.practiceQuality = buildQuestionQualitySummary(question, {unresolvedFlagCount: 1, reportsReviewedAt: 3000});
  assert.equal(questionHasUnresolvedStudentFlag(question, report), true);
  question.practiceQuality = buildQuestionQualitySummary(question, {unresolvedFlagCount: 0, reportsReviewedAt: 3000});
  assert.equal(questionHasUnresolvedStudentFlag(question, report), false);
  assert.equal(questionHasUnresolvedStudentFlag(question, {...report, at: 4000}), true);
  question.blocks[0].content = 'Edited question';
  assert.equal(questionHasUnresolvedStudentFlag(question, report), false);
});

test('assessment never mutates source content or performs IO', () => {
  const question = checked('amber');
  const before = JSON.stringify(question);
  evaluateQuestionQuality(question, {studentFlagged: true}); summary(question);
  assert.equal(JSON.stringify(question), before);
  const module = fs.readFileSync(new URL('../practice-quality.js', import.meta.url), 'utf8');
  assert.doesNotMatch(module, /\b(?:fetch|XMLHttpRequest|httpsCallable|askGemini|askOpenAI)\s*\(/);
});

test('markup-only and invisible stems or MCQ options are not usable questions', () => {
  for (const content of ['<p><br></p>', '<div><span> </span></div>', '<b></b>', '<p>', '<br/>', '&nbsp;', '&#160;', '&#xA0;', '\u200b\u200c\u200d\u2060\ufeff', '<img src="">']) {
    const result = quality({blocks: [{type: 'text', content}]});
    assert.equal(result.eligible, false, content);
    assert.ok(result.reasons.includes('content-missing'), content);
    assert.ok(quality({options: ['5', content]}).reasons.includes('options-malformed'), content);
  }
});

test('escaped rich-text and inline diagram artifacts are reviewed without damaging inequalities', () => {
  for (const content of ['<p>Find 4 + 7.</p>', 'Find the area: <img src="diagram.png">', 'Find the area: <img src="">', 'x &lt; y', '<span class="question">Find x.</span>']) {
    const result = quality({blocks: [{type: 'text', content}]});
    assert.equal(result.tier, 'suspect', content);
    assert.ok(result.reasons.includes('text-review'), content);
  }
  for (const content of ['x<i>y', 'x<y and z>4', 'p<q and r>s', 'A number < 5 is less than 5.', 'Find x² + x2.', '4 + ___ = 12']) {
    assert.equal(quality({blocks: [{type: 'text', content}]}).tier, 'sound', content);
  }
});

test('zero is valid in choices and tables but a numeric zero-only text block renders empty', () => {
  assert.equal(quality({blocks: [{type: 'text', content: 0}]}).eligible, false);
  assert.equal(quality({blocks: [{type: 'text', content: '0'}]}).eligible, true);
  assert.equal(quality({options: [0, 1]}).tier, 'sound');
  assert.equal(quality({blocks: [{type: 'table', rows: [[0, 1], [2, '']]}]}).tier, 'sound');
});

test('table captions must be renderable without dropping data', () => {
  for (const caption of [{raw: 'Missing data'}, ['First', 'Second']]) {
    assert.ok(quality({blocks: [{type: 'table', rows: [['x', 'y']], caption}]}).reasons.includes('table-malformed'));
  }
  assert.ok(quality({blocks: [{type: 'table', rows: [['x', 'y']], caption: 'a'.repeat(201)}]}).reasons.includes('table-truncated'));
  assert.equal(quality({blocks: [{type: 'table', rows: [['x', 'y']], caption: 'a'.repeat(200)}]}).tier, 'sound');
  assert.equal(quality({blocks: [...q().blocks, {type: 'table', rows: [['', ''], ['', '']], caption: ''}]}).tier, 'sound');
});
