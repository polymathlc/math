import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pw = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(pw) ? pathToFileURL(pw).href : pw);
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
function cut(from, to) { const a = html.indexOf(from), b = html.indexOf(to, a + from.length); assert.ok(a >= 0 && b > a); return html.slice(a, b); }
const renderer = cut('const escapeHtml =', 'const CLUE_TOPIC_WORDS =') + cut('const TBL_ROWS_MAX =', '// Text pasted into the window');
const fixture = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><button id="open">Open beta</button><script type="module">
import {installHadesMathBeta} from '/hades-math-beta.js';
${renderer}
window.user={uid:'browser-admin',role:'admin'};window.keysLoaded=true;window.notices=[];window.studentLevel='';window.markCalls=0;window.cloudSeen={};window.historyReadyFlag=false;
const names=['Orchid garden','Harbour voyage','Maple trees','Lantern festival','Amber staircase','Emerald mosaic','Saffron kitchen','Crystal palace','Willow park','Copper necklace','Silver orchard','Coral reef'];
const bank=names.map((title,i)=>({id:'bank-'+i,title,level:'P6',topic:'Fractions',blocks:[
{type:'text',content:'Find 1/2 + '+(i+1)+'/4. Compare x^2 and sqrt(9).\\n(a) Use the labelled diagram.'},
{type:'image',url:new URL('/diagram.svg',location.href).href},
{type:'table',caption:'Lengths',header:true,rows:[['Label','Length'],['A','1/2 m'],['B','3/4 m']]}],
options:[i+3,i+2,i+4,i+5].map(value=>value+'/4'),correctOption:0,markingGuide:'Use a common denominator.'}));
window.app=installHadesMathBeta({getUser:()=>user,getLevel:()=>studentLevel,getBank:()=>user.role==='student'?bank.map(({correctOption,markingGuide,...q})=>q):bank,gradeQuestion:async ({choice})=>{markCalls++;return {correct:choice===0,answer:0,explainHtml:'Checked by the marker.'};},keysAvailable:()=>keysLoaded,getSyllabus:()=>({}),isReleased:()=>true,qualityOptions:()=>({}),renderBlocks:q=>renderQuestionBlocksHtml(q.blocks),renderOption:renderMathBlock,notify:m=>notices.push(m),historyReady:async()=>historyReadyFlag,getServed:()=>cloudSeen,hasSeen:q=>!!cloudSeen[q.id],claimQuestions:async rows=>{if(rows.some(q=>cloudSeen[q.id]))return false;rows.forEach(q=>cloudSeen[q.id]=Date.now());return true;}});
document.getElementById('open').onclick=()=>app.open();window.ready=true;
</script></body></html>`;
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  res.setHeader('Cache-Control', 'no-store');
  if (url.pathname === '/') { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(fixture); return; }
  if (url.pathname === '/hades-game.html') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><script>window.messages=[];addEventListener("message",e=>messages.push(e.data));window.send=d=>parent.postMessage(d,location.origin);</script>'); return; }
  if (url.pathname === '/diagram.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="380" height="110" viewBox="0 0 380 110"><path d="M20 80H170V20Z" fill="#c6ebea" stroke="#295b6c" stroke-width="3"/><text x="185" y="62" font-size="26">A = 1/2 m</text></svg>'); return; }
  const file = path.resolve(root, '.' + url.pathname);
  if (!file.startsWith(root + path.sep) || !file.endsWith('.js')) { res.writeHead(404).end(); return; }
  try { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(file)); } catch (_) { res.writeHead(404).end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_BROWSER_CHANNEL ? { channel: process.env.PLAYWRIGHT_BROWSER_CHANNEL } : {}) });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
  await page.goto('http://127.0.0.1:' + server.address().port); await page.waitForFunction(() => window.ready);
  await page.locator('#open').click(); await page.getByRole('button', { name: 'Start preview', exact: true }).click();
  assert.equal(await page.locator('.hades-math-stage iframe').count(), 0, 'a school level is required');
  await page.getByLabel('Hades preview level').selectOption('P6'); await page.getByRole('button', { name: 'Start preview', exact: true }).click();
  await page.waitForFunction(() => !!document.querySelector('.hades-math-stage iframe')?.contentWindow?.send);
  let frame = page.frames().find(item => item.url().includes('/hades-game.html'));
  assert.match(frame.url(), /learning=1&subject=math/);
  const fresh = await page.evaluate(() => app.getQuestions().map(q => q.id)); assert.equal(fresh.length, 5);
  await frame.evaluate(() => send({ type: 'HADES_HELLO', requestId: 'math-preview' }));
  await frame.waitForFunction(() => messages.at(-1)?.type === 'HADES_READY');
  const sessionId = await frame.evaluate(() => messages.at(-1).sessionId);
  assert.match(await frame.evaluate(() => messages.at(-1).profileKey), /math:browser-admin:hades-preview:P6/);
  await frame.evaluate(sessionId => send({ type: 'HADES_ROUND_REQUEST', requestId: 'round-1', sessionId, round: 1 }), sessionId);
  await page.locator('.hades-learning-dialog').waitFor(); await page.waitForFunction(() => !document.querySelector('.hades-learning-option').disabled);
  assert.equal(await page.locator('.hades-learning-stem table').count(), 1);
  assert.equal(await page.locator('.hades-learning-stem img').count(), 1);
  assert.equal(await page.locator('.hades-learning-stem .math-sqrt').count(), 1);
  assert.equal(await page.locator('.hades-learning-stem sup').textContent(), '2');
  const geometry = await page.evaluate(() => {
    const frac = document.querySelector('.hades-learning-stem .math-frac'), n = frac.querySelector('.num'), d = frac.querySelector('.den'), dialog = document.querySelector('.hades-learning-dialog').getBoundingClientRect();
    return { num: n.textContent, den: d.textContent, numY: n.getBoundingClientRect().y, denY: d.getBoundingClientRect().y,
      bar: parseFloat(getComputedStyle(n).borderBottomWidth), left: dialog.left, right: dialog.right, width: innerWidth };
  });
  assert.equal(geometry.num, '1'); assert.equal(geometry.den, '2'); assert.ok(geometry.denY > geometry.numY && geometry.bar > 0);
  assert.ok(geometry.left >= 0 && geometry.right <= geometry.width);
  const shots = process.env.HADES_SCREENSHOTS;
  if (shots) { fs.mkdirSync(shots, { recursive: true }); await page.screenshot({ path: path.join(shots, 'math-sanctuary-mobile.png'), fullPage: true }); }
  for (let i = 0; i < 5; i++) {
    await page.locator('.hades-learning-option').first().click();
    if (i === 4) assert.match(await page.locator('.hades-learning-reward').textContent(), /Heroic: next scalable boon Lv 8, or Pom \+8 levels/);
    await page.getByRole('button', { name: i === 4 ? 'Claim sanctuary reward' : 'Next question', exact: true }).click();
  }
  await frame.waitForFunction(() => messages.at(-1)?.type === 'HADES_ROUND_RESULT');
  assert.equal(await frame.evaluate(() => messages.at(-1).healPercent), 40);
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('mathHadesBetaV1:browser-admin:hades-preview:P6')));
  assert.equal(Object.keys(saved.shown).length, 5); assert.equal(Object.keys(saved.progress).length, 5); assert.equal(Object.keys(saved.attempts).length, 5);
  const next = await page.evaluate(() => app.getQuestions().map(q => q.id)); assert.equal(next.length, 5);
  assert.ok(next.every(id => !saved.shown[id]));
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => { window.savedStorageMethods = [Storage.prototype.getItem, Storage.prototype.setItem];
    Storage.prototype.getItem = Storage.prototype.setItem = () => { throw new Error('Storage blocked'); }; });
  await page.locator('#open').click(); await page.getByLabel('Hades preview level').selectOption('P6');
  await page.getByRole('button', { name: 'Start preview', exact: true }).click();
  const memoryNext = await page.evaluate(() => app.getQuestions().map(q => q.id));
  assert.equal(memoryNext.length, 5); assert.ok(memoryNext.every(id => !saved.shown[id]), 'rotation survives reopening when persistent storage is blocked');
  await page.evaluate(() => { [Storage.prototype.getItem, Storage.prototype.setItem] = window.savedStorageMethods; });
  await page.getByLabel('Hades preview level').selectOption('P4'); assert.equal(await page.locator('iframe').count(), 0, 'changed level removes the old game');
  await page.getByRole('button', { name: 'Start preview', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => app.getQuestions()), [], 'P4 cannot consume the P6 bank');
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.evaluate(() => { user.role = 'student'; user.uid = 'browser-student'; keysLoaded = false; studentLevel = 'P6'; });
  await page.locator('#open').click();
  assert.equal(await page.getByLabel('Hades preview level').isDisabled(),true);
  assert.match(await page.locator('.hades-math-bar h2').textContent(),/BETA/);
  await page.getByRole('button',{name:'Play Hades',exact:true}).click();
  await page.waitForFunction(() => !!document.querySelector('.hades-math-stage iframe')?.contentWindow?.send);
  frame = page.frames().find(item => item.url().includes('/hades-game.html'));
  assert.deepEqual(await page.evaluate(()=>app.getQuestions()),[], 'No student questions appear before account history is ready');
  assert.equal(await page.evaluate(()=>Object.keys(cloudSeen).length),0, 'Admin preview never enters student account history');
  await page.evaluate(()=>historyReadyFlag=true);
  const studentRows=await page.evaluate(()=>app.getQuestions());
  assert.equal(studentRows.length,5);assert.ok(studentRows.every(q=>q.grading==='remote' && q.answer===null));
  assert.equal(await page.evaluate(()=>Object.keys(cloudSeen).length),5, 'The whole five-question round is committed before delivery');
  await frame.evaluate(()=>send({type:'HADES_HELLO',requestId:'student'}));
  await frame.waitForFunction(()=>messages.at(-1)?.type==='HADES_READY');
  const studentSession=await frame.evaluate(()=>messages.at(-1).sessionId);
  await page.getByRole('button',{name:'Fullscreen',exact:true}).click();
  await frame.evaluate(sessionId=>send({type:'HADES_ROUND_REQUEST',requestId:'student-round',sessionId,round:1}),studentSession);
  await page.locator('.hades-learning-dialog').waitFor();
  for(let i=0;i<5;i++){
    await page.locator('.hades-learning-option').first().click();
    await page.getByRole('button',{name:i===4?'Claim sanctuary reward':'Next question',exact:true}).click();
  }
  await frame.waitForFunction(()=>messages.at(-1)?.type==='HADES_ROUND_RESULT');
  assert.equal(await page.evaluate(()=>markCalls),5);
  assert.equal(await frame.evaluate(()=>messages.at(-1).healPercent),40);
  assert.equal(await frame.evaluate(()=>JSON.stringify(messages).includes('correctOption')),false);
  assert.equal(await page.evaluate(()=>Object.keys(cloudSeen).length),10, 'A new round skips every question reserved in the previous request');
  assert.deepEqual(await page.evaluate(()=>app.getQuestions()),[], 'The final two unseen questions cannot be padded with repeated work');
  await page.getByRole('button',{name:'Exit fullscreen',exact:true}).click();
  await page.evaluate(()=>studentLevel='P4');
  assert.deepEqual(await page.evaluate(()=>app.getQuestions()),[]);
  await page.getByRole('button',{name:'Close',exact:true}).click();
  await page.evaluate(() => { user.role = 'admin'; keysLoaded = false; }); await page.locator('#open').click(); assert.equal(await page.locator('.hades-math-beta').count(), 0);
  assert.deepEqual(errors, []); console.log('Math Hades browser passed: production fractions, roots, exponents, diagrams/tables, five-question scoring, grade revalidation, beta gates and persistent rotation.');
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
