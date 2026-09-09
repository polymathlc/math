// Real model + export regression checks for the 2026 Nan Hua exam layout.
// The reference is the P6 Maths Prelim 2026 Nan Hua paper — see docs/psle-exam-format.md.
// node tools/psle-paper-tests.mjs [output-directory]
// With an output directory, writes synthetic (not student) fixtures for browser QA.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const cut = (a,b) => { const x=src.indexOf(a), y=src.indexOf(b,x+a.length); assert(x>=0 && y>x,a); return src.slice(x,y); };
const api = new Function(`
  const escapeHtml = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const stripHtml = s => String(s).replace(/<[^>]*>/g,'');
  const wsHasMcq = q => Array.isArray(q?.options) && q.options.length >= 2;
  const questionIsAnnotation = q => (q?.blocks || []).some(b => b.annotate);
  const annotBlocksOf = q => (q?.blocks || []).filter(b => b.annotate);
  const mcqLabel = i => (i+1)+')', mcqNumber = i => String(i+1);
  const objBoxAutoHtml = () => '', objBoxHeightMm = () => 30;
  const canManageQuestions = () => true;
  const OBJBOX_DEFAULT_LINES = 3;
  ${cut('const IMAGE_SCALE_MIN', 'const CLUE_TOPIC_WORDS')}
  ${cut('const WS_LINES_MIN', 'function wsPrintCss()')}
  ${cut('function wsPrintCss()', '// 📊 The marks record')}
  ${cut('// 🅰 TWO MODES — an exam paper, or an ordinary worksheet', '// ---- The draft survives the window')}
  ${cut('function cpbIndexGridHtml()', '// 📝 THE WORKSHEET.')}
  ${cut('const CPB_EDITOR_FIELDS', 'function cpbEditQuestion(')}
  ${cut('function cpbLibRow(r)', '// The shelf is read out')}
  ${cut('function cpbReadMarks(row)', '// The figure, through the ONE door')}
  function cpbRender() {}
  return { cpbLayout, cpbMarks, cpbSetBook, cpbSetMarks, cpbPaperOpts, cpbBuildPsleDocumentHtml, cpbMarkRuns, cpbCarryOver, cpbLibRow, cpbUseReferenceFormat, cpbMetaGet,
    cpbPaper2Split, cpbPartMarks, cpbReadPartMarks, cpbReadMarks, cpbPaginateDocument, CPB_REF, CPB_P2_SHORT,
    set(qs, meta = {}) { cpbQuestions = qs; cpbMeta = meta; }, get() { return cpbQuestions; } };
`)();
const text = content => ({type:'text',content});
const mcq = (id, marks=0) => ({id,title:'Rounding',marks, options:['20 000','21 000','21 300','22 000'],correctOption:1, blocks:[text('Round 21 345 to the nearest thousand.')], _cpbBook:'a'});
const written = (id, book, marks) => ({id,title:'Written problem',_cpbBook:book,marks,expected:'42',blocks:[text('Find the value of 1705 − 27.')]});
const A=Array.from({length:18},(_,i)=>mcq('a'+i));
const B=Array.from({length:12},(_,i)=>written('b'+i,'b',0));
// The reference's printed Paper 2 allocations, Q1–Q15: five 2s, then
// [3][3][4][3][4][4][4][5][5][5] — 10 + 40 = 50, as its cover says.
const p2Marks=api.CPB_REF.p2Allocations;
assert.deepEqual(p2Marks,[2,2,2,2,2,3,3,4,3,4,4,4,5,5,5]);
assert.equal(p2Marks.reduce((a,b)=>a+b,0),50);
const P=p2Marks.map((m,i)=>written('p'+i,'p2',m));
// Q7, Q8, Q9 print a mark against each part — [1]+[2], [1]+[1]+[2], [1]+[2].
P[6].partMarks=[1,2]; P[7].partMarks=[1,1,2]; P[8].partMarks=[1,2];
P[6].blocks=[text('A rectangular piece of paper is folded along the dotted line BC as shown.\n(a) Find ∠BFG.\n(b) Find ∠FCD.')];
P[7].blocks=[text('The graph shows the fee a trampoline park charges.\n(a) How much would the park charge for 10 minutes?\n(b) Sarah paid $40. How long did she spend there?\n(c) What is the smallest fee two visitors could pay in total?')];
api.set([...A,...B,...P]);
let lay=api.cpbLayout(), marks=api.cpbMarks();
// 18 + 12 + 15 questions, 26 + 24 + 50 marks — the whole paper, section for section.
assert.deepEqual([marks.nA,marks.nB,marks.nP2,marks.nP2Short,marks.nP2Long],[18,12,15,5,10]);
assert.deepEqual([marks.a,marks.b,marks.p2,marks.p2Short,marks.p2Long,marks.total,marks.wantTotal],[26,24,50,10,40,100,100]);
assert.deepEqual([marks.needMcq,marks.needOpen,marks.needOpenQ,marks.needPaper2,marks.needPaper2Q],[0,0,0,0,0]);
assert.deepEqual([marks.wantMcq,marks.wantOpenQ,marks.wantOpen,marks.wantPaper2Q,marks.wantPaper2],[18,12,24,15,50]);
assert.equal(lay.numbers.b0,'19');assert.equal(lay.numbers.b11,'30');assert.equal(lay.numbers.p0,'1');assert.equal(lay.numbers.p14,'15');
assert.equal(new Set(lay.list.map(q=>q.id)).size,45);
assert.equal(api.cpbLibRow({nP2:15}).nP2,15);
assert.equal(api.cpbLibRow({}).nP2,0);
// The section counts are measured in QUESTIONS as well as marks: a Booklet B
// of eight 3-mark questions is 24 marks and four questions short.
api.set([...A,...Array.from({length:8},(_,i)=>written('x'+i,'b',3)),...P]);
marks=api.cpbMarks();assert.equal(marks.b,24);assert.equal(marks.needOpen,0);assert.equal(marks.needOpenQ,4);
api.set([...A,...B,...P]);
// Paper 2 splits into its two sections in ONE place: the first five at 2
// marks are the short section; anything else is the bracketed kind.
const alloc=q=>q.marks;
assert.deepEqual(api.cpbPaper2Split(P,alloc).short.map(q=>q.id),['p0','p1','p2','p3','p4']);
assert.equal(api.cpbPaper2Split(P,alloc).long.length,10);
assert.equal(api.cpbPaper2Split(P.slice(0,4),alloc).short.length,0);
assert.equal(api.cpbPaper2Split([written('z','p2',3),...P.slice(1)],alloc).short.length,0);
assert.equal(api.cpbPaper2Split([],alloc).long.length,0);
// Part marks are believed only when they are plausible AND add up.
assert.deepEqual(api.cpbPartMarks(P[7],4),[1,1,2]);
assert.equal(api.cpbPartMarks(P[7],5),null);
assert.equal(api.cpbPartMarks({partMarks:[1,'x']},2),null);
assert.equal(api.cpbPartMarks({},3),null);
assert.deepEqual(api.cpbReadPartMarks({partMarks:['1','2']}),[1,2]);
assert.equal(api.cpbReadPartMarks({partMarks:[3]}),null);
assert.equal(api.cpbReadPartMarks({partMarks:[1,99]}),null);
assert.equal(api.cpbReadPartMarks({}),null);
assert.equal(api.cpbReadMarks({marks:'1998'}),0);
// Re-weighting a question by hand drops a part split that no longer adds up.
api.cpbSetMarks('p6',5);assert.equal(api.get().find(q=>q.id==='p6').partMarks,undefined);
api.cpbSetMarks('p6',3);api.get().find(q=>q.id==='p6').partMarks=[1,2];
api.cpbSetMarks('p8',3);assert.deepEqual(api.get().find(q=>q.id==='p8').partMarks,[1,2]);
assert.equal(api.cpbMarks().total,100);
api.cpbSetMarks('a0',3); assert.equal(api.cpbMarks().a,28);
api.cpbSetMarks('a0',0); assert.equal(api.cpbMarks().a,26);
api.cpbSetMarks('a0',-1); assert.equal(api.get()[0].marks,0);
api.cpbSetBook('b0','p2');assert.equal(api.cpbLayout().p2[0].id,'b0');
api.cpbSetBook('b0','b');
const saved=JSON.parse(JSON.stringify(api.get()));api.set(saved);assert.equal(api.cpbLayout().p2.length,15);
const edited={id:'p0',blocks:[text('Updated')]}; api.cpbCarryOver(edited,P[0]);assert.equal(edited._cpbBook,'p2');assert.equal(edited.marks,2);
api.set(saved,{mode:'worksheet'});lay=api.cpbLayout();assert.equal(lay.p2.length,0);assert.equal(lay.numbers.p0,'31');assert.equal(lay.list[18].id,'b0');
api.set(saved,{targetMcq:15,targetOpen:25,targetPaper2:55,duration:'custom time',name:'Saved mock'});
assert.equal(api.cpbMetaGet('duration'),'custom time');
api.cpbUseReferenceFormat();
assert.deepEqual(['targetMcq','targetOpenQ','targetOpen','targetPaper2Q','targetPaper2','duration','duration2'].map(api.cpbMetaGet),[18,12,24,15,50,'1 hour 10 minutes','1 hour 20 minutes']);
assert.deepEqual(['classLabel','date'].map(api.cpbMetaGet),['Class','']);
assert.equal(api.cpbMetaGet('name'),'Saved mock');assert.deepEqual(api.get(),saved);
const meta={code:'0008/1',code2:'0008/2',year:'2026',exam:'PRELIMINARY EXAMINATION',level:'PRIMARY SIX',classLabel:'Teaching Group',date:'20 August 2026',answerKey:true};api.set(saved,meta);
let out=api.cpbPaperOpts();assert.equal(out.opts.paper.groups.length,3);assert(out.opts.paper.noBracketIds.has('a0'));
let html=await api.cpbBuildPsleDocumentHtml(out.list,'Nan Hua format sample',out.opts);
// The three covers, in the reference's words.
assert.equal((html.match(/data-cpb-cover>/g)||[]).length,3);
assert(html.includes('PAPER 1'));assert(html.includes('PAPER 2'));assert(html.includes('(BOOKLET A)'));assert(html.includes('(BOOKLET B)'));
assert(html.includes('PRELIMINARY EXAMINATION 2026'));assert(html.includes('PRIMARY SIX'));
assert(html.includes('Total Time for Booklets A and B: 1 hour 10 minutes'));assert(html.includes('Time: 1 hour 20 minutes'));
assert(html.includes('INSTRUCTIONS TO CANDIDATES'));
assert(html.includes('Write your name and index number in the space provided.'));
assert(html.includes('Shade your answers in the Optical Answer Sheet (OAS) provided.'));
assert(html.includes('Use dark blue or black ball point pen to write your answers in the space provided for each question.'));
assert(html.includes('Do not use correction tape / fluid / highlighter.'));
assert.equal((html.match(/The use of calculators is <b><u>NOT<\/u><\/b> allowed\./g)||[]).length,2,'Booklets A and B forbid calculators');
assert.equal((html.match(/The use of calculators is allowed\./g)||[]).length,1,'Paper 2 allows them');
assert(!html.includes('PASTE YOUR BARCODE LABEL HERE'));assert.equal((html.match(/cpb-cv-index"/g)||[]).length,1,'the PSLE index grid is gone from the covers and left on the answer sheet alone');
assert.equal((html.match(/Teaching Group: <span class="cpb-cv-class-rule">/g)||[]).length,3);
assert.equal((html.match(/Date : <u>20 August 2026<\/u>/g)||[]).length,3);
assert.equal((html.match(/data-cpb-count><\/div>/g)||[]).length,3,'every cover carries a page count');
// The Marks Obtained tables: Booklet B's lists every section with the marks
// ACTUALLY allocated, Paper 2's is the one-row version; Booklet A has none.
assert.equal((html.match(/Marks Obtained<\/div>/g)||[]).length,2);
assert(html.includes('<th colspan="2">Section</th><th>Maximum Marks</th><th>Marks Obtained</th>'));
assert(html.includes('<td>Booklet A</td><td class="cpb-cv-marks-n">26</td>'));
assert(html.includes('<td>Booklet B</td><td class="cpb-cv-marks-n">24</td>'));
assert(html.includes('colspan="2">Paper 2</td><td class="cpb-cv-marks-n">50</td>'));
assert(html.includes('<td colspan="2">Total</td><td class="cpb-cv-marks-n">100</td>'));
assert(html.includes('<th>Section</th><th>Maximum Marks</th><th>Actual Marks</th>'));
// The section instructions above each run of questions.
assert(html.includes('Questions 1 to 10 carry 1 mark each. Questions 11 to 18 carry 2 marks each. For each question, four options are given. One of them is the correct answer. Make your choice (1, 2, 3 or 4) and shade your answer on the Optical Answer Sheet (OAS).'));
assert(html.includes('(26 marks)'));
assert(html.includes('Questions 19 to 30 carry 2 marks each. Show your working clearly and write your answers in the spaces provided. For questions which require units, give your answers in the units stated.'));
assert(html.includes('(24 marks)'));
assert(html.includes('Questions 1 to 5 carry 2 marks each. Show your working clearly'));assert(html.includes('(10 marks)'));
assert(html.includes('For questions 6 to 15, show your working clearly and write your answers in the spaces provided. The number of marks available is shown in brackets [ ] at the end of each question or part-question.'));
assert(html.includes('(40 marks)'));
// Brackets on the Ans line in Paper 2's second section — per part where the
// page printed them — and nowhere in Booklet B or Paper 2's first section.
assert(html.includes('<span>Ans: (a)</span><i></i> <b class="cpb-part-marks">[1]</b>'));
assert(html.includes('<span>Ans: (b)</span><i></i> <b class="cpb-part-marks">[2]</b>'));
assert(html.includes('<span>Ans: (c)</span><i></i> <b class="cpb-part-marks">[2]</b>'));
assert(html.includes('<span>Ans:</span><i></i> <b class="cpb-part-marks">[4]</b>'));
// Ten bracketed questions: Q7 in 2 parts and Q8 in 3 print a bracket per part (5), Q9's split is
// dropped because its wording has no parts so it prints its total (1), the other seven print one
// each (7) — 13 brackets, plus the one CSS rule that styles them.
assert.equal((html.match(/cpb-part-marks/g)||[]).length,14);
assert.equal((html.match(/<b class="cpb-part-marks">\[2\]<\/b>/g)||[]).length,2,'brackets are printed in the bracketed section alone — Booklet B and Q1–5 carry none');
assert.equal((html.match(/class="cpb-q-marks"/g)||[]).length,0,'a written question carries its bracket on the Ans line, not under it');
// A score box beside every written question, none beside an MCQ.
assert.equal((html.match(/class="cpb-score"/g)||[]).length,27);
assert(html.includes('Please do not write in the margin.'));assert(html.includes('cpb-has-margin'));
assert(html.includes('Paper 2 · Q1'));assert(html.includes('Paper 1 · Booklet B · Q19'));assert(!html.includes('Paper 1 · Booklet A · Q1'),'Booklet A is keyed as a grid, not list rows');
assert(html.includes('<span>Ans:</span><i></i>'));assert(!html.includes('class="ws-mcq-answer"'));
assert(html.includes('<span class="l">(1)</span>'));
// The answer key opens with the Booklet A grid: Q1…Q18 over the option chosen.
assert(html.includes('class="cpb-key-grid"'));assert(html.includes('<th>Q1</th>'));assert(html.includes('<th>Q18</th>'));assert(!html.includes('<th>Q19</th>'));
assert.equal((html.match(/<td>2<\/td>/g)||[]).length,18,'every fixture MCQ keys option 2');
assert(html.includes('0008/1(A)'));assert(html.includes('0008/1(B)'));assert(html.includes('0008/2'));
api.set([mcq('a')],{...meta,mcqOnPaper:true,answerKey:false});out=api.cpbPaperOpts();
const onPaper=await api.cpbBuildPsleDocumentHtml(out.list,'MCQ',out.opts);assert(onPaper.includes('class="ws-mcq-answer"'));assert(!out.opts.paper.tail);
assert(onPaper.includes('Write your answer in the box provided for each question.'));assert(onPaper.includes('write it in the box provided.'));
assert(!onPaper.includes('Marks Obtained'),'Booklet A alone has no marks table');
// An empty date prints a rule to fill in; a Paper 1 with only Booklet B lists no Booklet A row.
api.set([written('b','b',2)],{...meta,date:'',answerKey:false});out=api.cpbPaperOpts();
const onlyB=await api.cpbBuildPsleDocumentHtml(out.list,'B',out.opts);
assert(onlyB.includes('Date : <span class="cpb-cv-date-rule"></span>'));assert(!onlyB.includes('<td>Booklet A</td>'));assert(onlyB.includes('rowspan="1">Paper 1</td><td>Booklet B</td><td class="cpb-cv-marks-n">2</td>'));
assert(onlyB.includes('<td colspan="2">Total</td><td class="cpb-cv-marks-n">2</td>'));
// Fewer than five Paper 2 questions is one bracketed section, with no 2-mark opener.
api.set([written('q1','p2',2),written('q2','p2',3)],{...meta,answerKey:false});out=api.cpbPaperOpts();
const shortP2=await api.cpbBuildPsleDocumentHtml(out.list,'P2',out.opts);
assert(shortP2.includes('For questions 1 to 2, show your working clearly'));assert(!shortP2.includes('carry 2 marks each'));assert(shortP2.includes('[2]</b>'));assert(shortP2.includes('[3]</b>'));
api.set([written('p','p2',5)],{...meta,org:'<script>bad()</script>',answerKey:false});out=api.cpbPaperOpts();
const onlyP2=await api.cpbBuildPsleDocumentHtml(out.list,'Paper 2',out.opts);assert.equal(out.opts.paper.groups.length,1);assert(!onlyP2.includes('<script>bad()'));assert(onlyP2.includes('&lt;script&gt;bad()'));
if(process.argv[2]) {
  const dir=path.resolve(process.argv[2]);fs.mkdirSync(dir,{recursive:true});
  // A complete fixture with diagrams, fractions, multipart questions and all covers.
  const diagram='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="440" height="220"><path d="M40 190 L210 25 L400 190 Z" fill="none" stroke="black" stroke-width="2"/><text x="200" y="20" font-size="18">A</text><text x="20" y="210" font-size="18">B</text><text x="405" y="210" font-size="18">C</text></svg>').toString('base64');
  saved[1].blocks=[text('What is the missing number?\n6 3/4 = ____ / 4')];
  saved[19].blocks=[text('ABC is an equilateral triangle. Find angle ABC.'),{type:'image',url:diagram,scale:.65}];
  saved[36].blocks=[text('A tank holds 120 litres of water.\n(a) Find 1/4 of this volume.\n(b) How much water remains?')];
  api.set(saved,meta);out=api.cpbPaperOpts();html=await api.cpbBuildPsleDocumentHtml(out.list,'Nan Hua format sample',out.opts);
  fs.writeFileSync(path.join(dir,'psle-sample.html'),html);
  const long=written('long','p2',5);long.blocks=[text(Array.from({length:28},(_,i)=>'Line '+(i+1)+': Mei buys ribbon in lengths of 70 cm. Each bow uses 12 cm. The leftover ribbon cannot be joined.').join('\n'))];
  api.set([long,written('next','p2',2)],{...meta,answerKey:false});out=api.cpbPaperOpts();
  fs.writeFileSync(path.join(dir,'psle-long.html'),await api.cpbBuildPsleDocumentHtml(out.list,'Long question',out.opts));
  fs.writeFileSync(path.join(dir,'psle-mcq.html'),onPaper);fs.writeFileSync(path.join(dir,'psle-paper2.html'),onlyP2);
}
console.log('Nan Hua 2026 model: section counts, marks, part marks, section moves, persistence, numbering, covers, margin boxes, answer sheet and answer key checks passed.');
