import { selectGrandLineMathBankRound } from './grand-line-math-bank.js';
import { questionQualitySignature } from './practice-quality.js';

export function createGrandLineMathAdapter(env) {
  const memory=new Map(),failedImages=new Map(),unavailable=new Map();
  const storage=env.storage||globalThis.localStorage;
  function state(ctx) {
    if(memory.has(ctx.identity))return memory.get(ctx.identity);
    let data={};try{data=JSON.parse(storage.getItem('grandLineMathV1:'+ctx.profileKey)||'{}')||{};}catch{}
    const clean=value=>value&&typeof value==='object'&&!Array.isArray(value)?value:{};
    const result={shown:clean(data.shown),progress:clean(data.progress),attempts:clean(data.attempts)};memory.set(ctx.identity,result);return result;
  }
  function save(ctx){const data=state(ctx),cutoff=Date.now()-86400000;data.shown=Object.fromEntries(Object.entries(data.shown).filter(([,at])=>Number(at)>cutoff).slice(-2500));data.attempts=Object.fromEntries(Object.entries(data.attempts).filter(([,at])=>Number(at)>cutoff).slice(-2500));data.progress=Object.fromEntries(Object.entries(data.progress).slice(-2500));try{storage.setItem('grandLineMathV1:'+ctx.profileKey,JSON.stringify(data));}catch{}}
  return {
    getQuestions(ctx){const data=state(ctx),bank=env.getBank();return selectGrandLineMathBankRound({bank,level:ctx.level,
      progress:ctx.admin?data.progress:{...(env.getProgress?.()||{}),...data.progress},profile:ctx.admin?{}:env.getProfile?.()||{},
      uid:ctx.identity,served:{...(ctx.admin?{}:env.getServed?.()||{}),...data.shown},remote:!ctx.admin,
      excludedIds:[...failedImages.keys(),...bank.filter(q=>unavailable.get(String(q.id))===questionQualitySignature(q)).map(q=>String(q.id))],
      syllabusById:env.getSyllabus(),isReleased:env.isReleased,qualityOptions:q=>{const base=env.qualityOptions(q);return {...base,failedImageUrls:[...(base.failedImageUrls||[]),...(failedImages.get(String(q.id))||[])]};},
      renderBlocks:env.renderBlocks,renderOption:env.renderOption});},
    gradeQuestion:env.gradeQuestion,
    markShown(q,ctx){state(ctx).shown[q.id]=Date.now();save(ctx);if(!ctx.admin)env.markShown?.(q);},
    recordAnswer({question,correct,round,sessionId,ms},ctx){const data=state(ctx),key=sessionId+':'+round+':'+question.id;if(data.attempts[key])return;data.attempts[key]=Date.now();const old=data.progress[question.id]||{};data.progress[question.id]={questionId:question.id,attempts:(Number(old.attempts)||0)+1,lastMarks:correct?1:0,lastOutOf:1,lastVerdict:correct?'correct':'incorrect',lastAttemptAt:new Date().toISOString()};save(ctx);if(!ctx.admin)env.awardPoints?.(question.id,correct,ms);},
    onImageFailure(q,url){const list=failedImages.get(q.id)||new Set();list.add(url);failedImages.set(q.id,list);},
    onQuestionUnavailable:q=>{if(q.source)unavailable.set(q.id,questionQualitySignature(q.source));}
  };
}
