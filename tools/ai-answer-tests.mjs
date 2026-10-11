// ✨ Answer with AI (v1.101.0): the answer and marking guide are written from
// the question AS IT IS NOW. Reads index.html as text and runs the pure half.
//   node tools/ai-answer-tests.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (!c) throw new Error(m || 'assertion failed'); };
const eq = (a, b, m) => ok(a === b, (m || '') + ' — got ' + JSON.stringify(a) + ', want ' + JSON.stringify(b));
const test = (name, fn) => { try { fn(); pass++; console.log('  ✓ ' + name); } catch (e) { fail++; console.log('  ✗ ' + name + '\n      ' + e.message); } };
const cut = (from, to) => { const a = src.indexOf(from); const b = src.indexOf(to, a + from.length); if (a < 0 || b < 0) throw new Error('cut: ' + from); return src.slice(a, b); };

const M = new Function(`
  const mcqLabel = i => (i + 1) + ")";
  const blocksPlainText = (blocks, sep) => (blocks || []).map(b => b.type === 'table' ? (b.rows || []).map(r => r.join(' | ')).join('\\n') : (b.content || '')).filter(Boolean).join(sep || ' ');
  ${cut('const QAA_IMG_MAX', '\nvar qaaBusy')}
  return { qaaPrompt, qaaFromReply, QAA_IMG_MAX };
`)();

console.log('answer with AI tests');
const Q = { title: 'Pens', level: 'P4', blocks: [{ type: 'text', content: 'Mr Chung needs 6 pens. What is the least he needs to spend?' }, { type: 'table', rows: [['Packet', 'Price'], ['2 pens', '$3']] }],
  expected: 'STALE-96', markingGuide: '48 ÷ 8 = 6 packets' };

test('the prompt carries the question as it is now, tables included', () => {
  const p = M.qaaPrompt(Q, '');
  ok(/Mr Chung needs 6 pens/.test(p), 'wording');
  ok(/2 pens \| \$3/.test(p), 'the table');
  ok(/exactly as it is written now/.test(p), 'told to solve it as it stands');
});
test('the stale answer and marking guide are never shown to the model', () => {
  const p = M.qaaPrompt(Q, '');
  ok(!/STALE-96|48 ÷ 8/.test(p), p);
});
test('an MCQ lists its options numbered 1) 2) and asks for the number', () => {
  const p = M.qaaPrompt(Object.assign({}, Q, { options: ['$6', '$9', '$12'] }), '');
  ok(/1\) \$6\n2\) \$9\n3\) \$12/.test(p), 'numbered');
  ok(/NUMBER of the correct option/.test(p));
  ok(!/multiple-choice question\. The options/.test(M.qaaPrompt(Q, '')), 'no options block on an open question');
});
test('the picture note is passed through', () => {
  ok(/Attached: 1 picture/.test(M.qaaPrompt(Q, 'Attached: 1 picture from this question.\n')));
});
test('the reply reader keeps a short answer, a guide line per step, and a valid option', () => {
  const r = M.qaaFromReply({ answer: '  $9 ', markingGuide: '6 ÷ 2 = 3 packets\\n 3 × $3 = $9 \n\nAnswer: $9', optionNumber: 2, confidence: 'HIGH' }, 3);
  eq(r.answer, '$9'); eq(r.guide, '6 ÷ 2 = 3 packets\n3 × $3 = $9\nAnswer: $9'); eq(r.option, 1); eq(r.confidence, 'high');
});
test('the reply reader refuses an option outside the list, and junk', () => {
  eq(M.qaaFromReply({ answer: 'x', optionNumber: 7 }, 3).option, -1, 'out of range');
  eq(M.qaaFromReply({ answer: 'x', optionNumber: 0 }, 3).option, -1, 'zero');
  eq(M.qaaFromReply({ answer: 'x', optionNumber: 1 }, 0).option, -1, 'no options');
  eq(M.qaaFromReply({ answer: 'x', optionNumber: '2.5' }, 3).option, -1, 'not a whole number');
  const j = M.qaaFromReply(null, 0); eq(j.answer, ''); eq(j.guide, '');
  eq(M.qaaFromReply({ answer: null, markingGuide: null }, 0).answer, '', 'null is not the word "null"');
  eq(M.qaaFromReply({ confidence: 'very' }, 0).confidence, '', 'unknown confidence');
});
test('the button is in the Correct answer field and wired', () => {
  ok(/<input id="qExpectedInput"[^]*?id="qAiAnswerBtn"[^]*?<\/div><\/div>/.test(src.slice(src.indexOf('<input id="qExpectedInput"'), src.indexOf('<input id="qExpectedInput"') + 700)), 'button beside the answer');
  ok(/\$\("qAiAnswerBtn"\)\.addEventListener\("click", qaaAnswerWithAi\)/.test(src), 'wired');
});
test('it reads the editor through collectQuestion and drops a stale reply', () => {
  const fn = cut('async function qaaAnswerWithAi(', '\n$("qAiAnswerBtn")');
  ok(/const q = collectQuestion\(\)/.test(fn), 'reads what Save writes');
  ok(/if \(owner !== editorBlocks\) return;/.test(fn), 'a reply for another question is dropped');
  ok(/canManageQuestions\(\)/.test(fn), 'authors only');
  ok(/qaaUndo = \{ owner, expected:/.test(fn), 'undo is kept before writing');
});
test('the state is var, because resetEditor() runs during module evaluation', () => {
  ok(/\nvar qaaBusy = false;/.test(src) && /\nvar qaaUndo = null;/.test(src));
  ok(src.indexOf('qaaUndo = null; if (typeof qaaStatus === "function")') > 0, 'resetEditor clears it');
});
test('the version is v1.101.0 or later', () => {
  const v = src.match(/const APP_VERSION = "v(\d+)\.(\d+)\.(\d+)/);
  ok(v && (Number(v[1]) > 1 || Number(v[2]) >= 101), 'APP_VERSION');
});
console.log(`\n${pass}/${pass + fail} passed`);
process.exit(fail ? 1 : 0);
