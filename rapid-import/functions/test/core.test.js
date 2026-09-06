import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assemblePage,normaliseQuestion,parseReply,cropRect,signature} from '../core.js';
const q=(id,page,number='8')=>({id,sourceQuestionNumber:number,blocks:[{id:id+'_b',type:'text',content:id}],sourcePages:[{page,url:'https://example.test/'+page}]});
test('a three-page question is held and saved as one, with all source pages',()=>{
  const a=assemblePage(null,[{q:q('a',1),continuation:false}],false);
  assert.equal(a.ready.length,0);
  const b=assemblePage(a.pending,[{q:q('b',2),continuation:true}],false);
  assert.equal(b.ready.length,0);
  const c=assemblePage(b.pending,[{q:q('c',3),continuation:true}],true);
  assert.equal(c.ready.length,1);assert.equal(c.pending,null);
  assert.deepEqual(c.ready[0].blocks.map(b=>b.content),['a','b','c']);
  assert.deepEqual(c.ready[0].sourcePages.map(p=>p.page),[1,2,3]);
  assert.equal(c.ready[0].id,'a');
});
test('continuation followed by a new question keeps boundaries',()=>{
  const r=assemblePage(q('a',1),[{q:q('b',2),continuation:true},{q:q('c',2,'9'),continuation:false}],false);
  assert.equal(r.ready.length,1);assert.equal(r.ready[0].blocks.length,2);assert.equal(r.pending.id,'c');
});
test('conflicting numbers and orphan continuations are flagged, never silently merged',()=>{
  const r=assemblePage(q('a',1),[{q:q('b',2,'9'),continuation:true}],true);
  assert.equal(r.ready.length,2);assert.match(r.ready[1].importWarning,/could not/);
  assert.ok(assemblePage(null,[{q:q('x',1),continuation:true}],true).ready[0].importWarning);
});
test('blank page flushes pending and clears carry; PDFs never share carry',()=>{
  const a=assemblePage(q('a',1),[],false);assert.equal(a.ready.length,1);assert.equal(a.pending,null);
  assert.equal(assemblePage(null,[{q:q('b',1),continuation:false}],true).ready[0].blocks.length,1);
});
test('truncated and malformed AI replies fail instead of saving partial questions',()=>{
  assert.throws(()=>parseReply({candidates:[{finishReason:'MAX_TOKENS'}],text:'{"questions":[]}'}));
  assert.throws(()=>parseReply({candidates:[{finishReason:'STOP'}],text:'{"questions":[{"blocks":[]}]}'}));
  assert.deepEqual(parseReply({candidates:[{finishReason:'STOP'}],text:'{"questions":[]}'}),[]);
});
test('normalisation preserves Math answers, MCQ choices, level, release and source pages',()=>{
  const job={id:'job',createdAt:'now',createdBy:'Teacher',name:'paper.pdf',level:'P5',release:'2027-01-02'};
  const r=normaliseQuestion({title:'Question',topics:['Fractions'],questionText:'(b) Find the fraction.',expected:'1/2',markingGuide:'1 ÷ 2',options:['1/2','1/4'],correctOption:0},'q1',job,2,'page-url',['image-url']);
  assert.equal(r.blocks[0].content,'(b) Find the fraction.');assert.equal(r.expected,'1/2');assert.equal(r.markingGuide,'1 ÷ 2');
  assert.deepEqual(r.options,['1/2','1/4']);assert.equal(r.correctOption,0);assert.equal(r.level,'P5');
  assert.equal(r.releaseOn,job.release);assert.equal(r.blocks[1].url,'image-url');assert.equal(r.sourcePages[0].page,2);
});
test('an unknown correct option is flagged and never silently changed to the first option',()=>{
  const r=normaliseQuestion({questionText:'Choose',options:['1','2'],correctOption:8},'q',{},1,'url',[]);
  assert.equal(r.correctOption,null);assert.match(r.importWarning,/MCQ/);
});
test('continuations preserve answers, working and options arriving on a later page',()=>{
  const a={...q('a',1),expected:'(a) 10',markingGuide:'(a) 5 × 2'};
  const b={...q('b',2),expected:'(b) 20',markingGuide:'(b) 10 × 2',options:['10','20'],correctOption:1};
  const result=assemblePage(a,[{q:b,continuation:true}],true).ready[0];
  assert.equal(result.expected,'(a) 10\n(b) 20');assert.equal(result.markingGuide,'(a) 5 × 2\n(b) 10 × 2');
  assert.deepEqual(result.options,b.options);assert.equal(result.correctOption,1);
});
test('invalid image rectangles use fallback; valid crop is clamped',()=>{
  assert.equal(cropRect([900,500,100,600],1000,1000),null);
  assert.equal(cropRect([NaN,0,100,100],1000,1000),null);
  assert.deepEqual(cropRect([-20,10,1005,900],1000,500),{x:10,y:0,w:890,h:500});
});
test('question signature changes after an answer edit',()=>{
  const a=q('a',1), before=signature(a);a.blocks[0].content='changed';assert.notEqual(signature(a),before);
});
