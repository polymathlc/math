// Browser regression test for physical page layout. Uses synthetic questions only.
// PLAYWRIGHT_MODULE=/path/to/playwright node tools/psle-browser-tests.mjs /tmp/psle-qa
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const dir=path.resolve(process.argv[2] || '/tmp/psle-qa');
execFileSync(process.execPath,[new URL('./psle-paper-tests.mjs',import.meta.url).pathname,dir],{stdio:'inherit'});
const browser=await chromium.launch({headless:true});
let failures=[];
try {
  for(const file of ['psle-sample','psle-long','psle-mcq','psle-paper2']) {
    const page=await browser.newPage({viewport:{width:1000,height:1250}}), errors=[];
    page.on('pageerror', e=>errors.push(String(e)));
    await page.goto('file://'+path.join(dir,file+'.html'));
    await page.waitForFunction(()=>window.cpbReady === true,{},{timeout:15000});
    await page.pdf({path:path.join(dir,file+'.pdf'),format:'A4',preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
    // Snapshot the same pages at their physical preview sizes for visual review.
    const pages=page.locator('.cpb-exam-page');
    const n=await pages.count();
    for(let i=0;i<n;i++) if(i<3 || await pages.nth(i).getAttribute('class').then(x=>x.includes('cpb-is-cover'))) {
      await pages.nth(i).screenshot({path:path.join(dir,file+'-'+String(i+1).padStart(2,'0')+'.png')});
    }
    const measure=()=>[...document.querySelectorAll('.cpb-exam-page')].map((p,i)=>{
      const b=p.querySelector('.cpb-page-body'),r=b.getBoundingClientRect();
      const overflow=[...b.querySelectorAll('.ws-chunk,.cpb-cover,.cpb-cv-foot,.ws-ak-item,.ws-answer-final,.cpb-q-marks')].filter(x=>{
        const q=x.getBoundingClientRect();return q.bottom>r.bottom+2 || q.right>r.right+2 || q.left<r.left-2;
      }).map(x=>x.className);
      return {page:i+1,book:p.dataset.book,number:p.querySelector('.cpb-page-number').textContent,overflow,scroll:b.scrollHeight,height:b.clientHeight,questions:[...b.querySelectorAll('.ws-q-no')].map(x=>x.textContent)};
    });
    const screen=await page.evaluate(measure);
    await page.emulateMedia({media:'print'});
    const print=await page.evaluate(measure);
    fs.writeFileSync(path.join(dir,file+'-measurements.json'),JSON.stringify({screen,print,errors},null,2));
    try {
      assert.deepEqual(errors,[]);
      for(const data of [screen,print]) for(const row of data) {assert.deepEqual(row.overflow,[],file+' page '+row.page);assert(row.scroll<=row.height+2,file+' page '+row.page+' content overflow');}
      assert.deepEqual(screen.map(x=>x.questions),print.map(x=>x.questions));
      if(file==='psle-sample') {
        assert.equal(screen.flatMap(x=>x.questions).length,47);
        for(const book of ['a','b','p2']) {const rows=screen.filter(x=>x.book===book);assert.equal(rows.length%2,0);assert.equal(rows[0].number,'1');assert.equal(rows[1].number,'2');}
        assert.deepEqual(screen.filter(x=>x.book==='p2').flatMap(x=>x.questions),Array.from({length:17},(_,i)=>String(i+1)));
        assert.equal(await page.locator('.ws-answer-parts .ws-answer-final').count(),2);
        assert.equal(await page.locator('.cpb-as-row:not(.cpb-as-blank)').count(),15);
      }
      if(file==='psle-long') {
        const text=await page.locator('#cpbPages').innerText();
        for(let i=1;i<=28;i++) assert(text.includes('Line '+i+':'));
        assert(await page.locator('.cpb-continued').count()>0);
      }
      console.log(file+': '+n+' pages; no screen or print overflows');
    } catch(e) {failures.push(String(e)); console.error(e);}
    await page.close();
  }
} finally {await browser.close();}
assert.deepEqual(failures,[]);
