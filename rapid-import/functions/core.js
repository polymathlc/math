// Shared by the browser fallback and the durable Math worker. No Firebase/DOM dependencies.
export const MAX_PDF_BYTES = 40 * 1024 * 1024;
export const CHUNK_BYTES = 3 * 1024 * 1024;
export const MAX_PAGES = 60;
export function parseReply(response) {
  if (response.candidates?.[0]?.finishReason !== 'STOP') throw new Error('AI response incomplete; retrying without saving partial questions.');
  const parsed = JSON.parse(response.text);
  if (!Array.isArray(parsed.questions) || parsed.questions.some(q => !q || typeof q.questionText !== 'string' || !q.questionText.trim())) throw new Error('AI did not return complete Math questions.');
  return parsed.questions;
}
export function cropRect(box, width, height) {
  if (!Array.isArray(box) || box.length !== 4 || !box.every(Number.isFinite)) return null;
  const [y1,x1,y2,x2] = box.map(n => Math.max(0, Math.min(1000, n)));
  const x = Math.floor(x1 * width / 1000), y = Math.floor(y1 * height / 1000);
  const w = Math.min(width - x, Math.ceil((x2-x1)*width/1000));
  const h = Math.min(height - y, Math.ceil((y2-y1)*height/1000));
  return w >= 5 && h >= 5 ? {x,y,w,h} : null;
}
export function normaliseQuestion(payload, id, job, page, sourceUrl, imageUrls) {
  const topics = [...new Set((Array.isArray(payload.topics) ? payload.topics : [payload.topic || '']).map(String).map(s=>s.trim()).filter(Boolean))];
  const blocks = [{id:id+'_text',type:'text',content:payload.questionText.trim()}];
  for (const [i,url] of imageUrls.entries()) blocks.push({id:id+'_image'+i,type:'image',url,scale:1});
  const q = {id,title:String(payload.title || 'Untitled'),level:job.level || String(payload.level || ''),
    topics,topic:topics.join(', '),concept:String(payload.concept || ''),blocks,
    expected:String(payload.expected || ''),markingGuide:String(payload.markingGuide || ''),los:[],
    videoExplanationUrl:'',answerKeyImageUrl:'',createdAt:job.createdAt,createdBy:job.createdBy,
    sourcePdf:job.name,sourcePages:[{page,url:sourceUrl}],rapidImportId:job.id,
    sourceQuestionNumber:String(payload.sourceQuestionNumber || payload.number || '').replace(/^q\s*/i,'').replace(/\s*\([a-z]\).*$/i,'').trim().slice(0,40)};
  if (Array.isArray(payload.options) && payload.options.length >= 2) {
    q.options=payload.options.map(String);
    q.correctOption=Number.isInteger(payload.correctOption) && payload.correctOption >= 0 && payload.correctOption < q.options.length ? payload.correctOption : null;
    if(q.correctOption===null) q.importWarning='The correct MCQ option could not be determined. Check before approving.';
  }
  if(job.release) q.releaseOn=job.release;
  return q;
}
export function assemblePage(pending, entries, isLast) {
  const ready=[];
  let carry=pending;
  for(let i=0;i<entries.length;i++) {
    const {q,continuation}=entries[i];
    const sameNumber=!carry?.sourceQuestionNumber || !q.sourceQuestionNumber || carry.sourceQuestionNumber===q.sourceQuestionNumber;
    if(i===0 && continuation && carry && sameNumber) {
      carry={...carry,blocks:[...carry.blocks,...q.blocks],sourcePages:[...(carry.sourcePages||[]),...(q.sourcePages||[])],
        expected:[carry.expected,q.expected].filter(Boolean).join('\n'),
        markingGuide:[carry.markingGuide,q.markingGuide].filter(Boolean).join('\n'),
        los:[...new Set([...(carry.los||[]),...(q.los||[])])]};
      if(q.options?.length && !carry.options?.length){carry.options=q.options;carry.correctOption=q.correctOption;}
      else if(q.options?.length && JSON.stringify(q.options)!==JSON.stringify(carry.options)) carry.importWarning='Options differ across continuation pages. Check against the source.';
      if(q.diagramWhole) carry.diagramWhole=true;
      if(q.importWarning) carry.importWarning=q.importWarning;
    } else {
      if(carry) ready.push(carry);
      carry=q;
      if(continuation) carry.importWarning='Continuation could not be matched safely. Check the preceding page.';
    }
  }
  if(isLast || !entries.length){if(carry) ready.push(carry);carry=null;}
  return {ready,pending:carry};
}
export function signature(q) {
  const raw=JSON.stringify([q.title,q.blocks,q.expected,q.markingGuide,q.options,q.correctOption]);
  let h=5381;for(let i=0;i<raw.length;i++) h=((h<<5)+h+raw.charCodeAt(i))|0;
  return raw.length+':'+(h>>>0).toString(36);
}
