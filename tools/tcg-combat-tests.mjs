import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import {TCG_SIGNATURES,tcgSignature,tcgSignatureReady,tcgSignatureActions,tcgSignatureDamage} from '../tcg-combat-identity.js';
import {resolveTcgSignature} from '../tcg-combat-runtime.js';
const source=await readFile(new URL('../index.html',import.meta.url),'utf8');
const cards=vm.runInNewContext(source.slice(source.indexOf('const TCG_GEN1 ='),source.indexOf('const TCG_BY_ID'))+';TCG_CARDS');
const fn=name=>source.slice(source.indexOf('function '+name+'('),source.indexOf('\n}',source.indexOf('function '+name+'('))+2);
const unit=(hp=100,atk=30)=>({hp,maxHp:100,atk,def:0,card:cards[0],shield:0,uid:Math.random()+''});
test('all 101 saved roster IDs remain and every 6/7-star card has a distinct signature effect matrix',()=>{
  assert.equal(cards.length,101);assert.equal(cards[0].id,'c001');assert.equal(cards.at(-1).id,'c101');
  const apex=cards.filter(c=>c.stars>=6);assert.equal(apex.length,17);
  assert.deepEqual(Object.keys(TCG_SIGNATURES).sort(),Array.from(apex,c=>c.id).sort());
  assert.equal(new Set(apex.map(c=>JSON.stringify(tcgSignature(c).effects))).size,17);
  assert.equal(new Set(apex.map(c=>tcgSignature(c).name)).size,17);
  cards.forEach(c=>assert.ok(tcgSignature(c)?.desc));
});
test('signature cooldowns are per actor, dead actors cannot trigger, and Focus costs a real cadence step',()=>{
  for(const card of cards.filter(c=>c.stars>=6))for(const mode of ['arena','duel','siege','legends']){
    const a={...unit(),card},b={...unit(),card},normal=mode==='duel'?Math.max(2,tcgSignature(card).every-1):tcgSignature(card).every;
    for(let i=1;i<normal;i++)assert.equal(tcgSignatureReady(a,card,mode),false);
    assert.equal(tcgSignatureReady(a,card,mode),true);assert.equal(b.signatureCharge,undefined);
    for(let i=1;i<Math.max(2,normal-1);i++)assert.equal(tcgSignatureReady(b,card,mode,'focus'),false);
    assert.equal(tcgSignatureReady(b,card,mode,'focus'),true);
    b.hp=0;assert.equal(tcgSignatureReady(b,card,mode),false);
  }
});
test('targeting excludes fallen bodies, protects weak allies, and all-target effects are bounded to three',()=>{
  const card=cards.find(c=>c.id==='c100'),actor={...unit(),card},hurt=unit(10),dead=unit(0),foes=[unit(),unit(),unit(),unit()];
  const plan=tcgSignatureActions(card,actor,[actor,hurt,dead],foes,'shelter');
  assert.ok(!plan.some(x=>x.target===dead));assert.equal(plan.filter(x=>x.kind==='root').length,3);
  assert.equal(plan.find(x=>x.kind==='ward').target,hurt);assert.equal(plan.at(-1).target,actor);
});
test('boss health scaling is capped by attack rather than making high-health foes trivial',()=>{
  const boss={hp:500000,maxHp:1000000};
  assert.equal(tcgSignatureDamage('rend',100,boss,.72),132);
  assert.equal(tcgSignatureDamage('consume',100,boss,.65),125);
});
test('siphon heals only health actually removed, never shield absorption or overkill',()=>{
  const card=cards.find(c=>c.id==='c048'),actor={...unit(20),card,signatureCharge:2},target=unit(8),api={hit(t){t.hp=0;},heal(t,n){t.hp+=n;},present(){}};
  assert.equal(resolveTcgSignature('arena',actor,[actor],[target],api),true);assert.equal(actor.hp,28);
  actor.signatureCharge=2;target.hp=8;api.hit=()=>{};resolveTcgSignature('arena',actor,[actor],[target],api);assert.equal(actor.hp,28);
});
test('three-step proof applies multiple real hits and stops when the target falls',()=>{
  const card=cards.find(c=>c.id==='c047'),actor={...unit(),card,signatureCharge:2},target=unit(100),hits=[];
  resolveTcgSignature('arena',actor,[actor],[target],{hit(t,n,pierce){hits.push({n,pierce});t.hp-=n;},present(){}});
  assert.equal(hits.length,3);assert.equal(hits[2].pierce,true);assert.ok(target.hp<100);
});
test('actual Duel damage spends the barrier after Divine Shield and keeps death handling',()=>{
  let deaths=0;const ctx={duelRun:{},duelFx(){},duelKill(m){deaths++;m.dead=true;},Math};vm.createContext(ctx);vm.runInContext(fn('duelHurtMinion'),ctx);
  const m={hp:10,shield:true,signatureBarrier:4};assert.equal(ctx.duelHurtMinion(m,8),0);assert.equal(m.signatureBarrier,4);
  assert.equal(ctx.duelHurtMinion(m,8),4);assert.equal(m.hp,6);ctx.duelHurtMinion(m,10);assert.equal(deaths,1);
});
test('actual mode adapters preserve status immunity, original damage routes, and pause/hidden guards',()=>{
  let pulses=0,hits=0;const card=cards.find(c=>c.id==='c100'),actor={...unit(),card,signatureCharge:3};
  const enemy={...unit(),wardStatus:true};
  const ctx={document:{hidden:false,getElementById:()=>null},tcgSignature,resolveTcgSignature,TCG_ELEM_FX:{},tcgCombatEffects:{pulse(){pulses++;}},tcgMedia:{play(){}},emsRun:{paused:false,qPause:false,over:false},elgRun:null,emsHit(){hits++;},emsBanner(){}};
  vm.createContext(ctx);vm.runInContext(fn('tcgCombatStep'),ctx);
  ctx.tcgCombatStep('siege',actor,[actor],[enemy]);assert.equal(enemy.slow,undefined);assert.equal(pulses,1);assert.ok(actor.signatureBarrier>0);
  actor.signatureCharge=3;ctx.emsRun.paused=true;ctx.tcgCombatStep('siege',actor,[actor],[enemy]);assert.equal(actor.signatureCharge,3);
  ctx.emsRun.paused=false;ctx.document.hidden=true;ctx.tcgCombatStep('siege',actor,[actor],[enemy]);assert.equal(actor.signatureCharge,3);
});
test('Arena and Paragon resonance never reduce an existing shield or shorten its lifetime',()=>{
  for(const mode of ['arena','legends']){
    const actor={...unit(),card:cards.find(c=>c.id==='c044'),signatureCharge:20,shield:35,shieldT:8,x:0,y:0,base:{range:100,dmg:30}};
    const ctx={document:{hidden:false,getElementById:()=>null},tcgSignature,resolveTcgSignature,elgRun:actor,elgPassives:()=>({range:0}),
      TCG_ELEM_FX:{},tcgCombatEffects:{pulse(){}},tcgMedia:{play(){}},elgBanner(){},_tcgUnitEl:()=>null,_tcgRefreshUnit(){},_tcgLog(){},escapeHtml:String};
    vm.createContext(ctx);vm.runInContext(fn('tcgCombatStep'),ctx);
    ctx.tcgCombatStep(mode,actor,[actor],[]);assert.equal(actor.shield,35,mode+' retains the stronger active shield');assert.equal(actor.shieldT,8);
    actor.shield=28;actor.shieldT=2;actor.signatureCharge=20;
    ctx.tcgCombatStep(mode,actor,[actor],[]);assert.equal(actor.shield,30,mode+' still caps new resonance accumulation');
    if(mode==='legends')assert.equal(actor.shieldT,5);
  }
});

test('Duel cleanse releases an attack withheld by turn-start freeze without granting extra attacks',()=>{
  const actor={...unit(),card:cards.find(c=>c.id==='c046'),signatureCharge:20,frozen:0};
  const ally={...unit(80),frozen:1,canAttack:false,ab:{kw:[]},rushOnly:false},side={board:[actor,ally],cap:1};
  const ctx={document:{hidden:false,getElementById:()=>null},tcgSignature,resolveTcgSignature,duelRun:{},_duelSide:()=>side,DUEL_MANA_CAP:10,
    duelSfxPlay(){},duelDraw(){},TCG_ELEM_FX:{},tcgCombatEffects:{pulse(){}},tcgMedia:{play(){}},duelLog(){},_duelMinionEl:()=>null};
  vm.createContext(ctx);for(const name of ['duelBeginTurn','duelCanAttack','tcgCombatStep'])vm.runInContext(fn(name),ctx);
  ctx.duelBeginTurn('P');assert.equal(ally.frozen,0);assert.equal(ctx.duelCanAttack(ally),false);
  ctx.tcgCombatStep('duel',actor,[actor,ally],[]);assert.equal(ctx.duelCanAttack(ally),true);assert.equal(ally.signatureFrozenTurn,false);
  ally.attacked=true;ally.canAttack=false;actor.signatureCharge=20;
  ctx.tcgCombatStep('duel',actor,[actor,ally],[]);assert.equal(ctx.duelCanAttack(ally),false);
  for(const kw of [[],['rush'],['charge']]){
    Object.assign(ally,{frozen:1,signatureFrozenTurn:false,canAttack:false,attacked:false,justPlayed:true,ab:{kw},rushOnly:kw.includes('rush')});
    actor.signatureCharge=20;ctx.tcgCombatStep('duel',actor,[actor,ally],[]);
    assert.equal(ctx.duelCanAttack(ally),kw.length>0,'summoning readiness '+JSON.stringify(kw));
    assert.equal(ally.rushOnly,kw.includes('rush'),'cleanse preserves Rush targeting');
  }
});

test('signature specialisation is run-only, requires a point, and never purchases both branches',()=>{
  const r={sp:1,over:false,card:cards[0]},ctx={elgRun:r,document:{getElementById:()=>({})},tcgMedia:{play(){}},elgRenderTree(){},elgHud(){}};
  vm.createContext(ctx);vm.runInContext(fn('tcgChooseSignature'),ctx);ctx.tcgChooseSignature('focus');assert.equal(r.sp,0);assert.equal(r.signaturePath,'focus');
  r.sp=10;ctx.tcgChooseSignature('shelter');assert.equal(r.sp,10);assert.equal(r.signaturePath,'focus');
});
test('all 17 high-star signatures change actual combat state in all four shipping adapters',()=>{
  for(const card of cards.filter(c=>c.stars>=6)) for(const mode of ['arena','duel','siege','legends']){
    const actor={...unit(40),card,signatureCharge:20,charge:0,skillThresh:3,cool:2,cds:{beam:5},x:0,y:0,base:{dmg:30,range:400},tree:{},p:{atk:30},shield:0};
    const foes=[unit(80),unit(60),unit(50)].map((e,i)=>({...e,id:i,x:30+i*20,y:0,r:10,maxHp:100,wardStatus:false}));
    const ctx={document:{hidden:false,getElementById:()=>null},Math,tcgSignature,resolveTcgSignature,TCG_ELEM_FX:{},tcgCombatEffects:{pulse(){}},tcgMedia:{play(){}},_tcgUnitEl:()=>null,_duelMinionEl:()=>null,
      escapeHtml:String,_tcgLog(){},_tcgHitFx(){},_tcgHealFx(t,n){if(!t.curse)t.hp=Math.min(t.maxHp,t.hp+n);},_tcgPopup(){},_tcgRefreshUnit(){},_tcgTryRevive(){},tcgElemMult:()=>1,
      duelRun:{},duelFx(){},duelKill(t){t.dead=true;},duelLog(){},emsRun:{paused:false,qPause:false,over:false,defenders:[actor],gate:100},EMS_GATE_HP:100,emsImpact(){},emsBanner(){},emsSyncHud(){},
      elgRun:actor,elgPassives:()=>({range:0}),elgPop(){},elgDropNode(){},elgBanner(){},elgHeal(n){actor.hp=Math.min(actor.maxHp,actor.hp+n);}};
    vm.createContext(ctx);for(const name of ['_tcgDamage','duelHurtMinion','emsHit','elgDamage','tcgCombatStep'])vm.runInContext(fn(name),ctx);
    const before=JSON.stringify([actor,...foes]);ctx.tcgCombatStep(mode,actor,[actor],foes);
    assert.notEqual(JSON.stringify([actor,...foes]),before,card.id+' '+mode);
    assert.equal(actor.signatureCharge,0,card.id+' pulse discharged');
    assert.ok([actor,...foes].every(x=>Number.isFinite(x.hp)),card.id+' finite health');
  }
});
test('closing and replacing an Arena session during its lunge cancels late hits and resonance',async()=>{
  let release,hits=0,pulses=0;const gate=new Promise(r=>{release=r;}),session={};
  const actor={...unit(),charge:0,skill:{kind:'strike'},strat:{},stun:0},target=unit();
  const ctx={_tcgBattle:session,_tcgUnitEl:()=>null,_tcgAllyByStrat:a=>a[0],_tcgTargetByStrat:()=>target,
    _tcgLunge:()=>gate,_tcgDamage:()=>{hits++;return{};},_tcgHitFx(){},tcgCombatStep(){pulses++;},_tcgLog(){},tcgSleep:async()=>{},_tcgUnlunge(){},tcgShortName:()=>'',escapeHtml:String};
  vm.createContext(ctx);vm.runInContext('async '+fn('_tcgAct'),ctx);const pending=ctx._tcgAct({},actor,[actor],[target]);ctx._tcgBattle={};release();await pending;
  assert.equal(hits,0);assert.equal(pulses,0);
});
test('Paragon signatures cannot reach enemies outside the hero weapon range',()=>{
  const card=cards.find(c=>c.id==='c045'),actor={...unit(),card,signatureCharge:20,x:0,y:0,base:{dmg:30,range:100}},foe={...unit(),x:900,y:0,r:10};let damage=0;
  const ctx={document:{hidden:false},elgRun:actor,elgPassives:()=>({range:0}),tcgSignature,resolveTcgSignature,elgDamage(){damage++;}};
  vm.createContext(ctx);vm.runInContext(fn('tcgCombatStep'),ctx);ctx.tcgCombatStep('legends',actor,[actor],[foe]);assert.equal(damage,0);
});
test('all gameplay entry points use the shared audio lifecycle and reachable descriptions',()=>{
  for(const name of ['emsClose','emsTogglePause','emsOpenQuiz','elgClose','elgTogglePause','elgOpenTree','elgOpenQuiz','tcgCloseBattle','duelClose','duelOpenQuiz'])assert.match(fn(name),/tcgCombatStop\(\)/);
  for(const mode of ['arena','duel','siege','legends'])assert.ok(source.includes("tcgCombatStep('"+mode+"'"));
  assert.match(fn('elgRenderTree'),/tcgCombatTreeHtml\(r\)/);assert.match(fn('duelSfxOn'),/tcgMedia.settings.enabled/);
  assert.match(source,/tcg-combat.css\?v=1/);assert.match(source,/APP_VERSION = "v\d+\.\d+\.\d+(?: · \d{4}-\d{2}-\d{2})?"/);
});
