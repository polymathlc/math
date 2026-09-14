// Real shipping TCG engines, renderers and event handlers. Only the account,
// question-bank boundary and remote persistence are replaced with fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import http from 'node:http';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const moduleName=process.env.PLAYWRIGHT_MODULE||'playwright';
const {chromium}=await import(/^[A-Za-z]:[\\/]/.test(moduleName)?pathToFileURL(moduleName).href:moduleName);
const html=fs.readFileSync(path.join(root,'index.html'),'utf8').replace(/\r\n/g,'\n');
const region=html.slice(html.indexOf('const TCG_ELEMENTS ='),html.indexOf('// BACKGROUND KNOCK-OUT'));
const css=[...html.slice(0,html.indexOf('</head>')).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m=>m[1]).join('\n');
const fixture=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><link rel="stylesheet" href="/tcg-combat.css"></head><body class="nova-protocol"><div id="fixture-controls" style="padding:24px"><button id="play" onclick="elgOpen()">Play Paragon Run</button><button id="siege" onclick="fixture.siege()">Manafront Siege</button><button id="duel" onclick="duelOpen()">Convergence Duel</button><button id="arena" onclick="fixture.arena()">Rift Arena</button></div><main id="page-tcg"><div id="tcgBody"></div></main><script type="module">
import {createTcgMedia} from '/tcg-media.js';
import {tcgSignature} from '/tcg-combat-identity.js';
import {resolveTcgSignature,createTcgEffects} from '/tcg-combat-runtime.js';
const $=id=>document.getElementById(id), currentUser={uid:'tcg-browser-fixture',role:'admin',displayName:'Test Explorer'}, adminUid='fixture-teacher', studentLevel='P6';
let rpgState={gold:10000,tcg:null}, questionBank=[], studentProgress={};
const SYL_LO_BY_ID={},db={},APP_VERSION='test', GAME_TEST_WRITES=[];
const _isAdmin=()=>true,escapeHtml=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const doc=(...x)=>x,collection=(...x)=>x,setDoc=async(...x)=>{GAME_TEST_WRITES.push(x);},getDoc=async()=>({exists:()=>false,data:()=>({})}),getDocs=async()=>({docs:[]}),rpgSave=()=>{},rpgPublishLeaderboard=()=>{},showToast=()=>{};
const qWithinStudentLevel=()=>true,qReleased=()=>true,serverTimestamp=()=>0,rpgName=()=> 'Test Explorer',tcgOpenFreePack=()=>{},annotPasteFromClipboard=()=>{};
${region}
// Remote reads and persistence are the only mode-owned functions replaced.
tcgLoadArt=async()=>{};tcgRenderBody=()=>{};tcgUpdateGoldChip=()=>{};elgBank=()=>{};emsBank=()=>{};duelBank=()=>{};
_tcgQuizPool=()=>[]; _tcgServedLoad=()=>({});
const state=tcgHydrateState(null);state.cards=Object.fromEntries(TCG_CARDS.map(c=>[c.id,1]));state.levels=Object.fromEntries(TCG_CARDS.map(c=>[c.id,30]));state.merges={};state.team=['c050','c100','c101'];state.duel.hero=DUEL_HERO_DEFAULT;rpgState.tcg=state;
window.fixture={
 state(){return {legends:elgRun&&{sp:elgRun.sp,path:elgRun.signaturePath,paused:elgRun.paused,qPause:elgRun.qPause,hp:elgRun.hp,shots:elgRun.shots.length},sound:tcgMedia.settings,fx:tcgCombatEffects.size,writes:GAME_TEST_WRITES.length};},
 hero(id){elgStart(id);},siege(){emsLaunch(emsSquadSaved());},
 pulse(){const r=elgRun;r.signatureCharge=20;r.qPause=false;r.paused=false;r.enemies=[{id:1,card:TCG_BY_ID.c051,x:r.x+80,y:r.y,r:18,hp:10000,maxHp:10000,speed:15,dmg:4,swing:3}];tcgCombatStep('legends',r,[r],r.enemies);elgRender();},
 seed(){const r=elgRun;r.spawnQ=[];r.enemies=[];r.wave=2;r.breather=99;r.qT=0;for(let i=0;i<14;i++){elgSpawn({card:TCG_CARDS[15+i],boss:i===0});}r.enemies.forEach((e,i)=>{e.x=r.x+Math.cos(i)*140;e.y=r.y+Math.sin(i)*110;e.hp=1000;e.maxHp=1000;});elgRender();},
 tree(){elgRun.sp=3;elgOpenTree();},
 close(){elgClose();emsClose();duelClose();tcgCloseBattle();},
 arena(){void tcgRunBattle(['c050','c100','c101'],{name:'Test Explorer',team:['c050','c100','c101']},{name:'The Rift Sentinels',tcgTeam:['c043','c094','c095'],level:30,levels:{},merges:{}});},
 siegeSeed(){if(!emsRun)return;emsRun.qPause=false;emsRun.paused=false;emsRun.breather=99;emsRun.mana=400;for(const[id,lane]of [['c050',0],['c044',1],['c100',2]]){emsRun.sel=id;emsPlace(lane,1);}for(let i=0;i<6;i++)emsSpawnEnemy({boss:i===0});emsRun.enemies.forEach((e,i)=>{e.x=4+(i%3)*.8;e.lane=i%5;});emsRender();},
 duelSeed(){const r=duelRun;if(!r)return;r.busy=false;for(const[side,ids]of [['P',['c050','c100']],['E',['c043','c095']]]){_duelSide(side).board=ids.map(id=>duelSummon(duelMakeHandCard(id,side,20),side));}_duelSide('P').board.forEach(m=>{m.canAttack=true;m.attacked=false;m.rushOnly=false;});duelRender();},
 damage(){const m={uid:'test',card:TCG_BY_ID.c043,hp:20,maxHp:20,signatureBarrier:5};duelHurtMinion(m,8);return m.hp;}
};
window.ready=true;
</script></body></html>`;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  if(url.pathname==='/fixture'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end(fixture);return;}
  const file=path.resolve(root,'.'+decodeURIComponent(url.pathname));
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try {const data=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.webp')?'image/webp':'application/octet-stream');res.end(data);}catch{res.writeHead(404).end();}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_BROWSER_CHANNEL?{channel:process.env.PLAYWRIGHT_BROWSER_CHANNEL}:{})});
const page=await browser.newPage({viewport:{width:1440,height:1050}}),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>{errors.push(e.message);console.error('Browser:',e.stack);});
const shots=process.env.TCG_SCREENSHOTS||process.env.GAME_SCREENSHOTS;
async function screenshot(name){if(shots){fs.mkdirSync(shots,{recursive:true});await page.screenshot({path:path.join(shots,name+'.png'),fullPage:true});}}
let checks=0;const check=(v,message)=>{assert.ok(v,message);checks++;};
try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/fixture');
 await page.waitForFunction(()=>window.ready);check(errors.length===0,errors.join('\n'));
 await page.locator('#play').click();await page.evaluate(()=>fixture.hero('c050'));await page.evaluate(()=>fixture.seed());
 check(await page.locator('#elgOverlay .tcg-audio-controls').count()===1,'sound controls visible');
 await page.waitForTimeout(300);await screenshot('math-paragon-battle');
 await page.evaluate(()=>fixture.tree());check(await page.locator('.tcg-path-choice').count()===2,'both signature branches reachable');
 await page.locator('.tcg-path-choice').first().click();check((await page.evaluate(()=>fixture.state())).legends.path==='focus','actual choice persists for run');
 check((await page.evaluate(()=>fixture.state())).legends.sp===2,'uses existing skill point');
 await screenshot('math-paragon-tree-desktop');
 await page.setViewportSize({width:390,height:844});await screenshot('math-paragon-tree-mobile');
 check(await page.locator('.tcg-path-choice').first().evaluate(n=>n.getBoundingClientRect().width<=window.innerWidth),'mobile branch fits');
 await page.locator('.elg-tree-foot button').click();await page.evaluate(()=>fixture.pulse());
 await page.locator('#elgPauseBtn').click();let current=await page.evaluate(()=>fixture.state());check(current.legends.paused,'pause uses real handler');check(current.sound.voices===0&&current.fx===0,'pause clears sound and signature effects');
 await page.locator('[data-tcg-audio="toggle"]').click();check((await page.evaluate(()=>fixture.state())).sound.enabled===false,'mute toggles');
 await page.locator('[data-tcg-audio="volume"]').fill('55');check((await page.evaluate(()=>fixture.state())).sound.volume===.55,'volume updates');
 await page.evaluate(()=>fixture.close());check((await page.evaluate(()=>fixture.state())).sound.voices===0,'exit leaves no audio');
 await page.setViewportSize({width:1440,height:1050});await page.locator('#siege').click();await page.waitForFunction(()=>document.getElementById('emsField'));await page.waitForTimeout(400);await page.evaluate(()=>fixture.siegeSeed());await screenshot('math-manafront-siege');
 check(await page.locator('#emsOverlay .tcg-audio-controls').count()===1,'siege has shared sound controls');await page.evaluate(()=>fixture.close());
 await page.locator('#duel').click();await page.waitForFunction(()=>document.querySelector('#duelShell .duel-top'));await page.evaluate(()=>fixture.duelSeed());await screenshot('math-convergence-duel');
 check(await page.locator('#duelOverlay .tcg-audio-controls').count()===1,'duel uses same audio settings');check(await page.evaluate(()=>fixture.damage())===17,'live duel consumes numeric barrier');await page.evaluate(()=>fixture.close());
 await page.locator('#arena').click();await page.waitForFunction(()=>document.getElementById('tcgbStage'));await page.waitForTimeout(400);await screenshot('math-rift-arena');check(await page.locator('#tcgBattleOverlay .tcg-audio-controls').count()===1,'arena controls visible');await page.evaluate(()=>fixture.close());
 await page.reload();await page.waitForFunction(()=>window.ready);current=await page.evaluate(()=>fixture.state());check(current.sound.enabled===false&&current.sound.volume===.55,'preferences survive reload');
 await page.emulateMedia({reducedMotion:'reduce'});await page.locator('#play').click();await page.evaluate(()=>fixture.hero('c101'));await page.evaluate(()=>fixture.pulse());await page.waitForTimeout(180);check((await page.evaluate(()=>fixture.state())).fx===0,'reduced-motion effect expires');await page.evaluate(()=>fixture.close());
 check(errors.length===0,errors.join('\n'));check((await page.evaluate(()=>fixture.state())).writes===0,'no remote persistence from visual tests');
 console.log('PASS '+checks+' production TCG browser checks');
}finally{await browser.close();await new Promise(r=>server.close(r));}
