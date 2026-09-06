import fs from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
const src=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const worker=fs.readFileSync(new URL('../rapid-import/functions/index.js',import.meta.url),'utf8');
const cut=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i+a.length);assert.ok(i>=0&&j>i);return src.slice(i,j);};
function uploadHarness(){
 const calls=[],statuses=[],saved=new Map(),pending=[];
 let failFinish=false,uid='teacher',seq=0,check=true,engine='gemini',guidance='Initial guidance';
 const document={getElementById:()=>({checked:check})};
 const factory=new Function('document','localStorage','crypto','calls','statuses','pending','env',`
 let currentUser={uid:env.uid()},rapidJobs=[],_rapidCloudUploading=0,_rapidCloudUploadTail=Promise.resolve();
 const SYL_LOS=[{id:'P3.FR.1',level:'P3',text:'Fractions'},{id:'P5.RA.1',level:'P5',text:'Ratio'}];
 const sylAutoFileOn=()=>true,getAiEngine=()=>env.engine(),aiQuestionReadPrompt=()=>'Math prompt',genPreamble=()=>env.guidance();
 const updateRapidCounts=()=>{},renderVettingList=()=>{},setRapidStatus=s=>statuses.push(s);
 const setRapidJobState=(id,p)=>Object.assign(rapidJobs.find(j=>j.id===id),p);
 const removeRapidJob=id=>{rapidJobs=rapidJobs.filter(j=>j.id!==id)};
 const failRapidJob=(id,e)=>setRapidJobState(id,{status:'error',error:e.message});
 const _fileToBase64=async()=> 'JVBERg==';
 const _rapidCloudRefresh=async()=>{};
 const _rapidCloudCall=async(name,data)=>{
  calls.push({name,data:structuredClone(data)});
  if(name==='mathRapidImportFinish'&&env.failFinish())throw new Error('No acknowledgement');
  if(name==='mathRapidImportBegin') await new Promise(resolve=>pending.push(resolve));
  return {};
 };
 ${cut('function _rapidUploadPdf(', 'function rapidCloudReset()')}
 return {upload:_rapidUploadPdf,get count(){return _rapidCloudUploading},get jobs(){return rapidJobs},switchUser:()=>{currentUser={uid:'other'}}};
 `);
 const api=factory(document,{getItem:k=>saved.get(k),setItem:(k,v)=>saved.set(k,v),removeItem:k=>saved.delete(k)},{randomUUID:()=>String(++seq)},calls,statuses,pending,{uid:()=>uid,engine:()=>engine,guidance:()=>guidance,failFinish:()=>failFinish});
 return {api,calls,statuses,saved,pending,set failFinish(x){failFinish=x},changeSettings(){engine='openai';guidance='Later guidance';check=false}};
}
const pdf=name=>new File(['%PDF-test'],name,{type:'application/pdf',lastModified:1});
const tick=()=>new Promise(r=>setImmediate(r));
test('two PDFs queue once, capture settings and only acknowledge after finalisation',async()=>{
 const h=uploadHarness(),a=h.api.upload(pdf('one.pdf'),'P3','2030-01-02'),b=h.api.upload(pdf('two.pdf'),'P5','2030-02-02');
 h.changeSettings();assert.equal(h.api.count,2);await tick();
 assert.equal(h.calls.filter(c=>c.name==='mathRapidImportBegin').length,1);
 assert.equal(h.statuses.some(s=>/Safe to close/.test(s)),false);
 h.pending.shift()();await a;await tick();
 assert.ok(h.statuses.some(s=>/Other PDFs are still uploading/.test(s)));
 h.pending.shift()();await b;
 const begins=h.calls.filter(c=>c.name==='mathRapidImportBegin');
 assert.deepEqual(begins.map(c=>c.data.release),['2030-01-02','2030-02-02']);
 assert.deepEqual(begins.map(c=>c.data.syllabus[0].level),['P3','P5']);
 assert.ok(begins.every(c=>c.data.grounding==='Initial guidance'&&c.data.autoCheck&&c.data.engineOrder[0]==='gemini'));
 assert.equal(h.api.count,0);assert.equal(h.saved.size,0);assert.match(h.statuses.at(-1),/Safe to close/);
});
test('failed finalisation retains resumable ID and never reports safe to close',async()=>{
 const h=uploadHarness();h.failFinish=true;const done=h.api.upload(pdf('one.pdf'),'P3','');await tick();h.pending.shift()();await done;
 assert.equal(h.saved.size,1);assert.equal(h.api.jobs[0].status,'error');
 assert.equal(h.statuses.some(s=>/Safe to close/.test(s)),false);
});
test('account changes abort queued upload before further writes',async()=>{
 const h=uploadHarness();const done=h.api.upload(pdf('one.pdf'),'P3','');await tick();h.api.switchUser();h.pending.shift()();await done;
 assert.equal(h.calls.length,1);assert.match(h.api.jobs[0].error,/Account changed/);
});
test('same file selected twice while uploading is not queued twice',async()=>{
 const h=uploadHarness(),file=pdf('one.pdf');const a=h.api.upload(file,'P3',''),b=h.api.upload(file,'P3','');
 assert.equal(h.api.count,1);await tick();h.pending.shift()();await Promise.all([a,b]);
 assert.equal(h.calls.filter(c=>c.name==='mathRapidImportBegin').length,1);
});
test('worker namespace, publication and frontend calls stay in Math',()=>{
 assert.match(worker,/const JOBS = 'mathRapidImports'/);
 assert.match(worker,/users\/\$\{job.ownerUid\}\/mathVetting/);
 assert.ok(!worker.includes('cer-rapid/')&&!worker.includes('/vetting/'));
 for(const n of ['Status','Begin','Chunk','Finish','Retry'])assert.ok(src.includes("'mathRapidImport"+n+"'"));
 assert.match(src,/_rapidCloudUploading && !_rapidPdfBusy && !_rapidPdfQueue.length/);
});
