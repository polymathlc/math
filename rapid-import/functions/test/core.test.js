import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assemblePage,normaliseQuestion,parseReply,cropRect,signature,diagramBoxesForQuestion,diagramSourcesForQuestion} from '../core.js';
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
test('ordered pictures stay between their wording, including an uncropped fallback',()=>{
  const first=[100,100,300,400],last=[600,100,850,400];
  const payload={questionText:'Read the graph. (a) Find x. (b) Find y.',hasDiagram:true,blocks:[
    {type:'text',content:'Read the graph.'},{type:'image',diagramBox:first},
    {type:'text',content:'(a) Find x.'},{type:'image',diagramBox:null},
    {type:'text',content:'(b) Find y.'},{type:'image',diagramBox:last}]};
  assert.deepEqual(diagramBoxesForQuestion(payload),[first,null,last]);
  const r=normaliseQuestion(payload,'q',{},1,'page',['first','page','last']);
  assert.deepEqual(r.blocks.map(b=>b.type),['text','image','text','image','text','image']);
  assert.deepEqual(r.blocks.filter(b=>b.type==='image').map(b=>b.url),['first','page','last']);
  assert.equal(new Set(r.blocks.map(b=>b.id)).size,6);
});
test('incomplete ordered text keeps the full question and all diagrams, with a warning',()=>{
  const payload={questionText:'(a) First part. (b) Second part.',blocks:[
    {type:'text',content:'(a) First part.'},{type:'image',diagramBox:[1,2,300,400]}]};
  const boxes=diagramBoxesForQuestion(payload);
  assert.equal(boxes.length,1);
  const r=normaliseQuestion(payload,'q',{},1,'page',['image']);
  assert.equal(r.blocks[0].content,payload.questionText);
  assert.equal(r.blocks[1].url,'image');assert.match(r.importWarning,/placement/);
});
test('a text-only layout cannot silently remove a required figure',()=>{
  const payload={questionText:'Read the diagram.',hasDiagram:true,blocks:[{type:'text',content:'Read the diagram.'}]};
  assert.deepEqual(diagramBoxesForQuestion(payload),[null]);
  const r=normaliseQuestion(payload,'q',{},1,'page',['page']);
  assert.equal(r.blocks[1].url,'page');assert.match(r.importWarning,/placement/);
});
test('ordered continuation blocks retain the preceding image and every later part',()=>{
  const payload={questionText:'Stem. Part (a).',blocks:[{type:'text',content:'Stem.'},{type:'image',diagramBox:null},{type:'text',content:'Part (a).'}]};
  const a=normaliseQuestion(payload,'a',{},1,'page1',['figure1']);
  const b=normaliseQuestion({...payload,questionText:'Part (b). Finish.',blocks:[{type:'text',content:'Part (b).'},{type:'image',diagramBox:null},{type:'text',content:'Finish.'}]},'b',{},2,'page2',['figure2']);
  const result=assemblePage(a,[{q:b,continuation:true}],true).ready[0];
  assert.deepEqual(result.blocks.map(b=>b.content||b.url),['Stem.','figure1','Part (a).','Part (b).','figure2','Finish.']);
  assert.equal(result.sourcePages.length,2);
});
test('an incomplete layout cannot discard an additional legacy diagram',()=>{
  const boxes=[[100,100,300,400],[500,100,700,400]];
  const payload={questionText:'Read both.',diagramBoxes:boxes,blocks:[{type:'text',content:'Read both.'},{type:'image',diagramBox:boxes[0]}]};
  assert.deepEqual(diagramBoxesForQuestion(payload),boxes);
  const r=normaliseQuestion(payload,'q',{},1,'page',['first','second']);
  assert.deepEqual(r.blocks.filter(b=>b.type==='image').map(b=>b.url),['first','second']);
  assert.match(r.importWarning,/placement/);
});
test('separate source pages and loose multiple figures survive legacy union boxes',()=>{
  const one=[100,100,300,400],two=[500,100,700,400];
  const payload={questionText:'Full text.',diagramBox:[0,0,900,900],page:3,blocks:[
    {type:'Text',text:'Full text.'},{type:'Image',diagramBox:one,page:1},{type:'image',diagramBox:two,page:2}]};
  assert.deepEqual(diagramSourcesForQuestion(payload),[{diagramBox:one,page:1},{diagramBox:two,page:2}]);
  payload.blocks[0].text='Partial';
  assert.deepEqual(diagramSourcesForQuestion(payload),[{diagramBox:one,page:1},{diagramBox:two,page:2}]);
  payload.diagramBoxes=[one,two];
  assert.deepEqual(diagramSourcesForQuestion(payload),[{diagramBox:one,page:1},{diagramBox:two,page:2}],
    'matching legacy boxes must not erase the individual source pages');
});
test('a placement warning remains visible when the answer option also needs review',()=>{
  const payload={questionText:'Full wording.',options:['A','B'],correctOption:-1,
    blocks:[{type:'text',content:'Partial'}]};
  const q=normaliseQuestion(payload,'q',{},1,'page',[]);
  assert.match(q.importWarning,/placement/);assert.match(q.importWarning,/MCQ/);
});
