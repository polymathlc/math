// Run: node tools/vetting-export-hover-tests.mjs
// Real hover controller, iframe writer and preview packer; no Firebase writes.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const src = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
function cut(a, b) {
  const start = src.indexOf(a), end = src.indexOf(b, start + a.length);
  assert.ok(start >= 0 && end > start, a);
  return src.slice(start, end);
}
const hover = cut('var _vetPrintPeek = null;', 'function vetPreviewHtml(q)');
class El {
  constructor(tag = 'div') {
    this.tag = tag; this.children = []; this.style = {}; this.attrs = {};
    this.dataset = {}; this.listeners = {}; this.isConnected = true;
    this.classList = { toggle() {} };
  }
  setAttribute(k, v) { this.attrs[k] = v; }
  addEventListener(k, cb) { this.listeners[k] = cb; }
  appendChild(x) { this.children.push(x); return x; }
  remove() { this.isConnected = false; }
  contains(x) { return x === this || this.children.some(c => c.contains(x)); }
  querySelectorAll(selector) {
    const all = this.children.flatMap(c => [c, ...c.querySelectorAll('*')]);
    return selector === '*' ? all : all.filter(c => selector[0] === '.'
      ? (c.className || '').split(' ').includes(selector.slice(1)) : c.tag === selector);
  }
  querySelector(s) { return this.querySelectorAll(s)[0]; }
}
function harness() {
  const timers = new Map(), rendered = [], written = [], actions = [], listeners = {};
  let timerSeq = 0, author = true;
  const document = { activeElement: null, body: new El('body'), addEventListener: (k, cb) => { listeners[k] = cb; } };
  document.createElement = tag => {
    const host = new El(tag);
    if (tag === 'section') {
      host.offsetWidth = 680; host.offsetHeight = 600;
      Object.defineProperty(host, 'innerHTML', {set(html) {
        host.markup = html;
        host.appendChild(new El('strong'));
        for (let i=0;i<3;i++) host.appendChild(new El('button'));
        const status=host.appendChild(new El()); status.className='vet-print-peek-status';
        const stage=host.appendChild(new El()); stage.className='vet-print-peek-stage';
        stage.clientWidth=680; stage.clientHeight=450;
        const frame=stage.appendChild(new El('iframe')); frame.contentDocument=new El('document');
      }});
    }
    return host;
  };
  const window = {innerWidth:1200,innerHeight:800,addEventListener:(k,cb)=>{listeners[k]=cb;}};
  const factory = new Function('document','window','setTimeout','clearTimeout','canManageQuestions','wsBuildDocumentHtml','actions', `
    let vettingList=[];
    const escapeHtml=s=>String(s).replaceAll('&','&amp;').replaceAll('"','&quot;').replaceAll('<','&lt;').replaceAll('>','&gt;');
    const _wnyCachedNotes=()=>({cached:true}), wnyPrintOn=()=>false, akxPrintOn=()=>true;
    const wsOpenDocument=(qs,title,opts)=>actions.push(['full',qs[0].id,opts]);
    const vetEdit=id=>actions.push(['edit',id]);
    ${hover}
    return {show:vetPrintPeekShow,leave:vetPrintPeekLeave,keep:vetPrintPeekKeep,hide:vetPrintPeekHide,
      dismiss:vetPrintPeekDismiss,key:vetPrintPeekKeydown,button:vetPrintPeekButton,
      full:vetPrintPeekFull,edit:vetPrintPeekEdit,get state(){return _vetPrintPeek},set list(x){vettingList=x}};
  `);
  const api = factory(document, window, (cb,ms)=>{const id=++timerSeq;timers.set(id,{cb,ms});return id;}, id=>timers.delete(id), ()=>author,
    (qs,title,opts)=>{rendered.push({qs,title,opts});return '<p>exported</p>';},
    actions);
  function anchor(id) {
    const a=new El('button'); a.dataset.qid=id;
    a.getBoundingClientRect=()=>({left:1000,right:1030,top:300});
    a.focus=()=>{document.activeElement=a;api.show(a);};
    return a;
  }
  return {...api, api, document, timers, rendered, written, actions, listeners, anchor,
    set author(x){author=x}, async flush(){const jobs=[...timers.values()];timers.clear();await Promise.all(jobs.map(x=>x.cb()));}};
}
const Q = id => ({id,title:'Question '+id,blocks:[{type:'image',url:'diagram.png'},{type:'plainanswer',content:'The model answer'}]});

test('the eye is before the AI badge and is keyboard/touch accessible',()=>{
 const h=harness(),html=h.button({id:'a"<',title:'<title>'});
 assert.match(html,/data-qid="a&quot;&lt;"/);assert.match(html,/onfocus=/);assert.match(html,/onclick=/);
 assert.match(src,/\$\{vetPrintPeekButton\(q\)\}\$\{mathImportCheckBadge\(q\)\}/);
});
test('hover resolves the latest question and uses a sandboxed export iframe',async()=>{
 const h=harness(),a=h.anchor('a');h.api.list=[Q('a')];h.show(a);
 h.api.list=[{...Q('a'),title:'Latest edit'}];await h.flush();
 assert.equal(h.rendered[0].title,'Latest edit');assert.equal(h.rendered[0].opts.readOnly,true);
 assert.equal(h.rendered[0].opts.withAnswers,true);assert.deepEqual(h.actions,[]);
 const frame=h.api.state.host.querySelector('iframe');
 assert.equal(frame.srcdoc,'<p>exported</p>');assert.equal(frame.attrs.sandbox,'allow-same-origin');
 assert.equal(frame.style.width,'850px');assert.equal(a.attrs['aria-expanded'],'true');
});
test('leaving before hover delay avoids rendering; entering panel keeps it open',async()=>{
 const h=harness();h.api.list=[Q('a')];h.show(h.anchor('a'),{pointerType:'mouse'});h.leave();await h.flush();
 assert.equal(h.rendered.length,0);h.show(h.anchor('a'));await h.flush();
 h.leave();h.keep();await h.flush();assert.ok(h.api.state);
 h.leave();await h.flush();assert.equal(h.api.state,null);
});
test('Escape restores focus without reopening, full export and Edit use correct ID',async()=>{
 const h=harness(),a=h.anchor('a');h.api.list=[Q('a')];h.show(a);await h.flush();
 h.key({key:'Escape',preventDefault(){},stopPropagation(){}});await h.flush();
 assert.equal(h.api.state,null);assert.equal(h.document.activeElement,a);
 h.full('a');h.edit('a');assert.equal(h.actions[0][1],'a');assert.equal(h.actions[0][2].readOnly,false);
 assert.deepEqual(h.actions[1],['edit','a']);
});
test('touch, missing questions, detached elements and unauthorised users do not hover',async()=>{
 const h=harness();h.api.list=[Q('a')];h.show(h.anchor('a'),{pointerType:'touch'});await h.flush();
 h.show(h.anchor('missing'));await h.flush();const a=h.anchor('a');a.isConnected=false;h.show(a);await h.flush();
 h.author=false;h.show(h.anchor('a'));h.full('a');h.edit('a');await h.flush();
 assert.equal(h.rendered.length,0);assert.deepEqual(h.actions,[]);
});
test('navigation, refresh, resize and outside clicks dismiss the preview',async()=>{
 assert.match(src,/function navigateTo\(page\) \{\s*vetPrintPeekHide\(\)/);
 const h=harness();h.api.list=[Q('a')];h.show(h.anchor('a'));await h.flush();
 h.listeners.pointerdown({target:new El()});assert.equal(h.api.state,null);
 h.show(h.anchor('a'));await h.flush();h.listeners.resize();assert.equal(h.api.state,null);
});
