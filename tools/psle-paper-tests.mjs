// Real model + export regression checks for the uploaded 2023 PSLE layout.
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
  const OBJBOX_DEFAULT_LINES = 3;
  ${cut('const IMAGE_SCALE_MIN', 'const CLUE_TOPIC_WORDS')}
  ${cut('const WS_LINES_MIN', 'function wsPrintCss()')}
  ${cut('function wsPrintCss()', '// 📊 The marks record')}
  ${cut('// 🅰 TWO MODES — an exam paper, or an ordinary worksheet', '// ---- The draft survives the window')}
  ${cut('function cpbIndexGridHtml()', '// 📝 THE WORKSHEET.')}
  ${cut('const CPB_EDITOR_FIELDS', 'function cpbEditQuestion(')}
  ${cut('function cpbLibRow(r)', '// The shelf is read out')}
  function cpbRender() {}
  return { cpbLayout, cpbMarks, cpbSetBook, cpbSetMarks, cpbPaperOpts, cpbBuildPsleDocumentHtml, cpbMarkRuns, cpbCarryOver, cpbLibRow,
    set(qs, meta = {}) { cpbQuestions = qs; cpbMeta = meta; }, get() { return cpbQuestions; } };
`)();
const text = content => ({type:'text',content});
const mcq = (id, marks=0) => ({id,title:'Rounding',marks, options:['20 000','21 000','21 300','22 000'],correctOption:1, blocks:[text('Round 21 345 to the nearest thousand.')], _cpbBook:'a'});
const written = (id, book, marks) => ({id,title:'Written problem',_cpbBook:book,marks,expected:'42',blocks:[text('Find the value of 1705 − 27.')]});
const A=Array.from({length:15},(_,i)=>mcq('a'+i));
const B=Array.from({length:15},(_,i)=>written('b'+i,'b',0));
// Reference Paper 2: five 2-mark short answers followed by 12 questions totalling 45.
const p2Marks=[2,2,2,2,2,3,4,4,3,4,4,4,4,4,4,4,3];
const P=p2Marks.map((m,i)=>written('p'+i,'p2',m));
api.set([...A,...B,...P]);
let lay=api.cpbLayout(), marks=api.cpbMarks();
assert.deepEqual([marks.a,marks.b,marks.p2,marks.total,marks.wantTotal],[20,25,55,100,100]);
assert.equal(lay.numbers.b0,'16');assert.equal(lay.numbers.b14,'30');assert.equal(lay.numbers.p0,'1');assert.equal(lay.numbers.p16,'17');
assert.equal(new Set(lay.list.map(q=>q.id)).size,47);
assert.equal(api.cpbLibRow({nP2:17}).nP2,17);
assert.equal(api.cpbLibRow({}).nP2,0);
api.cpbSetMarks('a0',3); assert.equal(api.cpbMarks().a,22);
api.cpbSetMarks('a0',0); assert.equal(api.cpbMarks().a,20);
api.cpbSetMarks('a0',-1); assert.equal(api.get()[0].marks,0);
api.cpbSetBook('b0','p2');assert.equal(api.cpbLayout().p2[0].id,'b0');
api.cpbSetBook('b0','b');
const saved=JSON.parse(JSON.stringify(api.get()));api.set(saved);assert.equal(api.cpbLayout().p2.length,17);
const edited={id:'p0',blocks:[text('Updated')]}; api.cpbCarryOver(edited,P[0]);assert.equal(edited._cpbBook,'p2');assert.equal(edited.marks,2);
api.set(saved,{mode:'worksheet'});lay=api.cpbLayout();assert.equal(lay.p2.length,0);assert.equal(lay.numbers.p0,'31');assert.equal(lay.list[15].id,'b0');
const meta={code:'PLC/1',code2:'PLC/2',year:'2026',answerKey:true};api.set(saved,meta);
let out=api.cpbPaperOpts();assert.equal(out.opts.paper.groups.length,3);assert(out.opts.paper.noBracketIds.has('a0'));
let html=await api.cpbBuildPsleDocumentHtml(out.list,'PSLE format sample',out.opts);
assert(html.includes('PAPER 1'));assert(html.includes('PAPER 2'));assert(html.includes('1 hour 30 minutes'));
assert(html.includes('calculators is NOT allowed'));assert(html.includes('approved calculator is allowed'));
assert(html.includes('Questions 1 to 10 carry 1 mark each. Questions 11 to 15 carry 2 marks each.'));
assert(html.includes('Questions 16 to 20 carry 1 mark each.'));
assert(html.includes('Paper 2 · Q1'));assert(html.includes('Paper 1 · Booklet A · Q1'));
assert(html.includes('<span>Ans:</span>'));assert(!html.includes('class="ws-mcq-answer"'));
assert(html.includes('<span class="l">(1)</span>'));
assert.equal((html.match(/data-cpb-cover>/g)||[]).length,3);
api.set([mcq('a')],{...meta,mcqOnPaper:true,answerKey:false});out=api.cpbPaperOpts();
const onPaper=await api.cpbBuildPsleDocumentHtml(out.list,'MCQ',out.opts);assert(onPaper.includes('class="ws-mcq-answer"'));assert(!out.opts.paper.tail);
api.set([written('p','p2',5)],{...meta,org:'<script>bad()</script>',answerKey:false});out=api.cpbPaperOpts();
const onlyP2=await api.cpbBuildPsleDocumentHtml(out.list,'Paper 2',out.opts);assert.equal(out.opts.paper.groups.length,1);assert(!onlyP2.includes('<script>bad()'));assert(onlyP2.includes('&lt;script&gt;bad()'));
if(process.argv[2]) {
  const dir=path.resolve(process.argv[2]);fs.mkdirSync(dir,{recursive:true});
  // A complete fixture with diagrams, fractions, multipart questions and all covers.
  const diagram='data:image/svg+xml;base64,'+Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="440" height="220"><path d="M40 190 L210 25 L400 190 Z" fill="none" stroke="black" stroke-width="2"/><text x="200" y="20" font-size="18">A</text><text x="20" y="210" font-size="18">B</text><text x="405" y="210" font-size="18">C</text></svg>').toString('base64');
  saved[1].blocks=[text('What is the missing number?\n6 3/4 = ____ / 4')];
  saved[16].blocks=[text('ABC is an equilateral triangle. Find angle ABC.'),{type:'image',url:diagram,scale:.65}];
  saved[36].blocks=[text('A tank holds 120 litres of water.\n(a) Find 1/4 of this volume.\n(b) How much water remains?')];
  api.set(saved,meta);out=api.cpbPaperOpts();html=await api.cpbBuildPsleDocumentHtml(out.list,'PSLE format sample',out.opts);
  fs.writeFileSync(path.join(dir,'psle-sample.html'),html);
  const long=written('long','p2',5);long.blocks=[text(Array.from({length:28},(_,i)=>'Line '+(i+1)+': Mei buys ribbon in lengths of 70 cm. Each bow uses 12 cm. The leftover ribbon cannot be joined.').join('\n'))];
  api.set([long,written('next','p2',2)],{...meta,answerKey:false});out=api.cpbPaperOpts();
  fs.writeFileSync(path.join(dir,'psle-long.html'),await api.cpbBuildPsleDocumentHtml(out.list,'Long question',out.opts));
  fs.writeFileSync(path.join(dir,'psle-mcq.html'),onPaper);fs.writeFileSync(path.join(dir,'psle-paper2.html'),onlyP2);
}
console.log('PSLE model, marks, section moves, persistence, numbering, covers, answer sheet and answer key checks passed.');
