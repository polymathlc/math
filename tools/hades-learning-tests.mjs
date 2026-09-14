import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {createHadesLearningController, hadesLearningReward, validHadesQuestions} from '../hades-learning-parent.js';
const question = id => ({id,html:'<p>Compare the labelled diagram '+id+'</p>',options:['A','B','C','D'],answer:1,topic:'Living things'});
function fixture(overrides={}) {
  const messages=[],marked=[],records=[]; let identity='admin:P6',active=true;
  const source={postMessage(message,origin){messages.push({message,origin});}};
  const options={origin:'https://example.test',subject:'Science',getFrame:()=>({contentWindow:source}),
    getIdentity:()=>identity,isAllowed:()=>true,isActive:()=>active,makeSessionId:()=> 'session-1',
    getQuestions:async()=>[1,2,3,4,5].map(n=>question('q'+n)),markShown:q=>marked.push(q.id),recordAnswer:r=>records.push(r),
    presentQuestions:async({questions,grade})=>{for(let i=0;i<5;i++)await grade(i,questions[i].answer,2500);return true;},...overrides};
  const controller=createHadesLearningController(options);
  const send=data=>controller.handleMessage({origin:options.origin,source,data});
  const hello=()=>send({type:'HADES_HELLO',requestId:'hello-1'});
  const round=(n=1,requestId='round-'+n)=>send({type:'HADES_ROUND_REQUEST',requestId,sessionId:'session-1',round:n});
  return {controller,source,messages,marked,records,send,hello,round,setIdentity:v=>{identity=v;},setActive:v=>{active=v;}};
}
test('five-score reward mapping is bounded and deterministic',()=>{
  assert.deepEqual([0,1,2,3,4,5].map(hadesLearningReward),[
    {correct:0,total:5,healPercent:0,boonTier:'common'},{correct:1,total:5,healPercent:8,boonTier:'common'},
    {correct:2,total:5,healPercent:16,boonTier:'rare'},{correct:3,total:5,healPercent:24,boonTier:'rare'},
    {correct:4,total:5,healPercent:32,boonTier:'epic'},{correct:5,total:5,healPercent:40,boonTier:'heroic'}]);
  for(const n of [-1,6,1.5,'5',NaN])assert.throws(()=>hadesLearningReward(n));
});
test('only distinct complete MCQs enter a five-question round',()=>{
  const q=question('a');
  assert.equal(validHadesQuestions([q,q,{...q,id:'b',answer:-1},{...q,id:'c',options:['']}]).length,1);
  assert.equal(validHadesQuestions(Array.from({length:10},(_,i)=>question(String(i)))).length,5);
});
test('matching origin, exact iframe, role, request and session are required',async()=>{
  const f=fixture();
  await f.controller.handleMessage({origin:'https://evil.test',source:f.source,data:{type:'HADES_HELLO',requestId:'h'}});
  await f.controller.handleMessage({origin:'https://example.test',source:{},data:{type:'HADES_HELLO',requestId:'h'}});
  await f.send({type:'HADES_HELLO',requestId:'<script>'});assert.equal(f.messages.length,0);
  await f.hello();
  await f.send({type:'HADES_ROUND_REQUEST',requestId:'q',sessionId:'forged',round:1});
  await f.round(2); assert.equal(f.records.length,0);
  f.setActive(false);await f.round();assert.equal(f.records.length,0);
  const denied=fixture({isAllowed:()=>false});await denied.hello();assert.equal(denied.messages.length,0);
});
test('host grades exactly five, hides keys and reserves the whole set',async()=>{
  const f=fixture();await f.hello();await f.round();
  assert.deepEqual(f.marked,['q1','q2','q3','q4','q5']);assert.equal(f.records.length,5);
  assert.ok(f.records.every(r=>r.correct && r.ms===2500 && r.sessionId==='session-1'));
  const result=f.messages.at(-1).message;assert.equal(result.type,'HADES_ROUND_RESULT');assert.equal(result.healPercent,40);
  assert.ok(f.messages.every(r=>r.origin==='https://example.test'));
  assert.equal(JSON.stringify(f.messages).includes('options'),false);assert.equal(JSON.stringify(f.messages).includes('answer'),false);
  assert.equal(f.messages[0].message.profileKey,'science:admin:P6');
});
test('repeat handshake and completed round retry never regrade or duplicate rewards',async()=>{
  const f=fixture();await f.hello();await f.round();await f.hello();await f.round(1,'retry');
  assert.equal(f.records.length,5);assert.equal(f.controller.getState().nextRound,2);
  assert.equal(f.messages.at(-1).message.requestId,'retry');assert.equal(f.messages.at(-1).message.correct,5);
});
test('empty, duplicate or incomplete pools block instead of using filler',async()=>{
  for(const pool of [[],[question('x'),question('x')],[1,2,3,4].map(i=>question(String(i)))]){
    const f=fixture({getQuestions:async()=>pool});await f.hello();await f.round();
    assert.equal(f.messages.at(-1).message.type,'HADES_ROUND_BLOCKED');assert.equal(f.records.length,0);assert.equal(f.marked.length,0);
  }
});
test('concurrent requests, double choice and forged indices cannot add extra answers',async()=>{
  let finish;const f=fixture({presentQuestions:async({grade})=>{
    assert.equal(await grade(4,1,2000),null);
    const first=grade(0,1,2000),duplicate=grade(0,1,2000);await first;assert.equal(await duplicate,null);
    return await new Promise(resolve=>{finish=resolve;});
  }});await f.hello();const running=f.round();await new Promise(resolve=>setTimeout(resolve,0));
  await f.round(1,'duplicate');assert.equal(f.records.length,1);finish(true);await running;
  assert.equal(f.messages.at(-1).message.type,'HADES_ROUND_BLOCKED');
});
test('profile change during bank load invalidates stale work',async()=>{
  let resolve;const f=fixture({getQuestions:()=>new Promise(r=>{resolve=r;})});await f.hello();const running=f.round();
  f.setIdentity('other:P3');resolve([1,2,3,4,5].map(i=>question(String(i))));await running;
  assert.equal(f.records.length,0);assert.equal(f.marked.length,0);assert.equal(f.messages.some(m=>m.message.type==='HADES_ROUND_RESULT'),false);
  await f.hello();assert.equal(f.messages.some(m=>m.message.type==='HADES_INVALIDATE'),true);
});
test('abandonment and image failure grant no transition or reward',async()=>{
  const f=fixture({presentQuestions:async({grade})=>{await grade(0,1,2000);return false;}});await f.hello();await f.round();
  assert.equal(f.records.length,1);assert.equal(f.messages.at(-1).message.type,'HADES_ROUND_BLOCKED');
  assert.equal(f.controller.getState().nextRound,1);
});
test('explicit invalidation retires the old session immediately',async()=>{
  const f=fixture();await f.hello();f.controller.invalidate('Changed grade');await f.round();
  assert.equal(f.messages.at(-1).message.type,'HADES_INVALIDATE');assert.equal(f.records.length,0);assert.equal(f.controller.getState(),null);
});
