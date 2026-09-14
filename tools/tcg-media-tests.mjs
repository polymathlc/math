import test from 'node:test';
import assert from 'node:assert/strict';
import {createTcgMedia} from '../tcg-media.js';

function fixture(saved = {}) {
  const store=new Map(Object.entries(saved)), listeners=new Map(), contexts=[];
  globalThis.localStorage={getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)};
  globalThis.document={hidden:false,addEventListener:(k,f)=>listeners.set(k,f),removeEventListener:k=>listeners.delete(k)};
  const param=()=>({value:0,setValueAtTime(){},linearRampToValueAtTime(){},exponentialRampToValueAtTime(){}});
  globalThis.AudioContext=class {
    constructor(){this.currentTime=0;this.state='running';this.destination={};this.nodes=[];contexts.push(this);}
    createGain(){const n={gain:param(),connect(){},disconnect(){n.disconnected=true;}};this.nodes.push(n);return n;}
    createOscillator(){const n={frequency:param(),connect(){},disconnect(){n.disconnected=true;},start(){n.started=true;},stop(){n.stopped=true;}};this.nodes.push(n);return n;}
    async resume(){this.state='running';}async close(){this.state='closed';}
  };
  return {store,listeners,contexts};
}
test('audio waits for user activation, never downloads assets, and bounds concurrent voices',async()=>{
  const f=fixture(), media=createTcgMedia();
  assert.equal(f.contexts.length,0);assert.equal(media.play('attack'),false);
  await media.unlock(); assert.equal(f.contexts.length,1);
  for(const cue of ['attack','hit','skill','heal','shield','level','wave'])media.play(cue);
  assert.ok(media.settings.voices<=12);assert.ok(media.settings.voices>0);
  const n=media.settings.voices;media.play('attack');assert.equal(media.settings.voices,n,'same-frame repeats throttled');
  media.stop();assert.equal(media.settings.voices,0);
  assert.ok(f.contexts[0].nodes.filter(x=>x.frequency).every(x=>x.stopped&&x.disconnected));
  media.destroy();assert.equal(f.contexts[0].state,'closed');
});
test('mute survives reload, preserves volume, and stops every queued oscillator',async()=>{
  const f=fixture({pref:JSON.stringify({enabled:true,volume:.7})});
  const media=createTcgMedia({storageKey:'pref'});await media.unlock();media.play('victory');
  media.setEnabled(false);assert.equal(media.settings.voices,0);assert.equal(media.play('hit'),false);
  assert.deepEqual(JSON.parse(f.store.get('pref')),{enabled:false,volume:.7});
  const reload=createTcgMedia({storageKey:'pref'});assert.equal(reload.settings.enabled,false);assert.equal(reload.settings.volume,.7);
  await reload.unlock();assert.equal(f.contexts.length,1,'muted reload never creates a second context');
  media.destroy();reload.destroy();
});
test('hidden document stops tails and destroy unregisters handlers',async()=>{
  const f=fixture(), media=createTcgMedia();await media.unlock();media.play('victory');
  document.hidden=true;f.listeners.get('visibilitychange')();assert.equal(media.settings.voices,0);assert.equal(media.play('attack'),false);
  media.destroy();assert.equal(f.listeners.size,0);
});
test('legacy mute, corrupt/blocked storage and unavailable audio remain safe',async()=>{
  fixture({old:'0'});const old=createTcgMedia({legacyMuteKey:'old'});assert.equal(old.settings.enabled,false);old.destroy();
  fixture();globalThis.localStorage={getItem(){throw Error('blocked');},setItem(){throw Error('blocked');}};
  delete globalThis.AudioContext;const media=createTcgMedia();assert.equal(await media.unlock(),false);assert.doesNotThrow(()=>media.setEnabled(false));media.destroy();
});
test('delegated controls update persisted volume and synthetic events cannot unlock sound',async()=>{
  const f=fixture(),handlers=new Map(),root={querySelectorAll:()=>[],addEventListener:(k,h)=>handlers.set(k,h),removeEventListener:k=>handlers.delete(k)};
  const media=createTcgMedia();media.installControls(root);media.installControls(root);assert.equal(handlers.size,3);
  const toggle={target:{closest:()=>true},isTrusted:false};handlers.get('click')(toggle);handlers.get('click')(toggle);assert.equal(f.contexts.length,0);
  handlers.get('input')({target:{matches:()=>true,value:'55'},isTrusted:false});assert.equal(media.settings.volume,.55);
  handlers.get('keydown')({isTrusted:true});await Promise.resolve();assert.equal(f.contexts.length,1);
  media.destroy();assert.equal(handlers.size,0);
});
