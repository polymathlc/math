// 🔍± PICTURE SIZE, FROM A PREVIEW — the − / + pill on every preview picture,
// and the write-back to the bank when the preview closes.
//
// Loads the REAL block out of index.html and runs it against stubs. Every
// failure here is silent in the app: a pill that renders for a student is a
// control that writes to the bank from a hover; a write that fires on every
// press is four documents for one decision; a close that stops flushing is a
// size the teacher watched change and that never reached the bank; and a
// preview document handed no script is a sheet whose pictures cannot be
// resized at all, on a page that looks exactly as it should.
//
//   node tools/preview-picture-size-tests.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");
const src = html.slice(html.indexOf('<script type="module">'), html.lastIndexOf("</script>"));

let passed = 0, failed = 0;
const tests = [];
function ok(cond, msg) { if (cond) passed++; else { failed++; console.error("  ✗ " + msg); } }
function test(name, fn) { tests.push([name, fn]); }
async function runAll() {
  for (const [name, fn] of tests) {
    const before = failed;
    try { await fn(); if (failed === before) console.log("✓ " + name); else console.error("✗ " + name); }
    catch (e) { failed++; console.error("✗ " + name + "\n    " + (e && e.stack || e)); }
  }
  console.log(failed ? `\n❌ ${passed} passed, ${failed} failed` : `\n✅ ${passed} passed, 0 failed`);
  process.exit(failed ? 1 : 0);
}
function cut(from, to, what) {
  const a = src.indexOf(from);
  if (a < 0) throw new Error("cannot find the start of " + what + ": " + from);
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error("cannot find the end of " + what + ": " + to);
  return src.slice(a, b);
}

class El {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = { _v: {}, setProperty(k, v) { this._v[k] = v; }, getPropertyValue(k) { return this._v[k] || ""; } }; this.textContent = ""; this.className = ""; this.disabled = false; }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; }
  appendChild(c) { this.children.push(c); return c; }
  all() { return this.children.flatMap(c => [c, ...c.all()]); }
  matches(sel) {
    if (sel === "img") return this.tag === "img";
    if (sel[0] === ".") return this.className.split(" ").includes(sel.slice(1));
    const m = sel.match(/^\[data-pvs-q="([^"]*)"\]\[data-pvs-b="([^"]*)"\]$/);
    if (m) return this.attrs["data-pvs-q"] === m[1] && this.attrs["data-pvs-b"] === m[2];
    throw new Error("selector not supported by the stub: " + sel);
  }
  querySelectorAll(sel) { return this.all().filter(c => c.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
function wrapFor(qid, bid) {
  const w = new El("div"); w.setAttribute("data-pvs-q", qid); w.setAttribute("data-pvs-b", bid);
  w.appendChild(new El("img"));
  const l = w.appendChild(new El("span")); l.className = "pvs-label";
  const a = w.appendChild(new El("button")); a.className = "pvs-btn";
  const b = w.appendChild(new El("button")); b.className = "pvs-btn";
  return w;
}
function harness(o = {}) {
  const doc = new El("document"); doc.head = new El("head"); doc.body = new El("body");
  doc.getElementById = id => doc.head.children.find(c => c.id === id) || null;
  doc.createElement = tag => new El(tag);
  doc.querySelectorAll = sel => (sel === "iframe" ? (o.frames || []) : doc.body.querySelectorAll(sel));
  const timers = new Map(); let seq = 0;
  const saves = [], toasts = [], synced = [];
  const state = { admin: o.admin !== false, bank: o.bank || [], vetting: o.vetting || [], saveOk: o.saveOk !== false };
  const f = new Function("document", "window", "setTimeout", "clearTimeout", "saveQuestionDoc", "saveVettingDoc", "toast", "syncImageScaleUi", "state", `
    const escapeHtml = s => String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const canManageQuestions = () => state.admin;
    let questionBank = state.bank, vettingList = state.vetting;
    let currentEditingId = null, editorBlocks = [];
    ${cut("const IMAGE_SCALE_MIN = 0.3;", "\nconst VULGAR_FRACTIONS", "the scale helpers")}
    ${cut("const PVS_IDLE_MS", "\ntry { window.addEventListener(\"pagehide\"", "the pvs block")}
    return { pvsFind, pvsBarHtml, pvsStep, pvsPreviewStep, pvsFlush, pvsPreviewScriptHtml, pvsPreviewRun, dirty: _pvsDirty,
      set admin(v) { state.admin = v; }, set editing(v) { currentEditingId = v.id; editorBlocks = v.blocks; } };
  `);
  const api = f(doc, { addEventListener() {} },
    (cb, ms) => { const id = ++seq; timers.set(id, { cb, ms }); return id; }, id => timers.delete(id),
    async q => { if (!state.saveOk) throw new Error("refused"); saves.push({ where: "bank", id: q.id, scale: q.blocks[0].scale }); },
    async q => { if (!state.saveOk) throw new Error("refused"); saves.push({ where: "vetting", id: q.id, scale: q.blocks[0].scale }); },
    (m, t) => toasts.push([m, t]), id => synced.push(id), state);
  const fire = () => { const list = Array.from(timers.entries()); timers.clear(); list.forEach(([, t]) => t.cb()); };
  return { api, doc, saves, toasts, synced, timers, fire, state };
}
const Q = (id, scale) => ({ id, title: "Q " + id, blocks: [{ id: "b1", type: "image", url: "x.png", ...(scale != null ? { scale } : {}) }, { id: "b2", type: "text", content: "hi" }] });
const tick = () => new Promise(r => setTimeout(r, 0));
const near = (a, b) => Math.abs(a - b) < 1e-9;

test("the pill renders for an admin on a saved question, and for nobody else", () => {
  const h = harness({ bank: [Q("a")] });
  const html = h.api.pvsBarHtml(Q("a"), Q("a").blocks[0]);
  ok(/pvsStep\('a','b1',-1\)/.test(html) && /pvsStep\('a','b1',1\)/.test(html), "the two buttons are not wired");
  ok(/event\.stopPropagation\(\)/.test(html), "a press would also fire the tile the preview sits on");
  ok(/qbHoverKeep\(\)/.test(html) && /qbHoverLeave\(\)/.test(html), "the pill does not keep the hover card open while the pointer is on it");
  ok(h.api.pvsBarHtml({ id: null, blocks: [] }, Q("a").blocks[0]) === "", "a draft with no id got a pill it cannot write for");
  h.api.admin = false;
  ok(h.api.pvsBarHtml(Q("a"), Q("a").blocks[0]) === "", "a STUDENT got the pill");
  ok(h.api.pvsPreviewScriptHtml() === "", "a student's preview document was handed the script");
});

test("the handlers refuse anyone who is not an admin, and a question that is gone", () => {
  const h = harness({ bank: [Q("a")], admin: false });
  ok(h.api.pvsStep("a", "b1", 1) === null && h.state.bank[0].blocks[0].scale === undefined, "a non-admin changed a picture");
  h.api.admin = true;
  ok(h.api.pvsStep("zzz", "b1", 1) === null && h.toasts.length === 1, "a question that is not there was not refused with a word");
});

test("+ and − step through the editor's OWN step and clamp, and the label comes back", () => {
  const h = harness({ bank: [Q("a")] });
  ok(h.api.pvsStep("a", "b1", 1) === "110%" && near(h.state.bank[0].blocks[0].scale, 1.1), "+ did not step 10% from the default 100%");
  ok(h.api.pvsStep("a", "b1", -1) === "100%", "− did not step back");
  for (let i = 0; i < 20; i++) h.api.pvsStep("a", "b1", 1);
  ok(near(h.state.bank[0].blocks[0].scale, 1.5), "+ ran past IMAGE_SCALE_MAX: " + h.state.bank[0].blocks[0].scale);
  for (let i = 0; i < 40; i++) h.api.pvsStep("a", "b1", -1);
  ok(near(h.state.bank[0].blocks[0].scale, 0.3), "− ran below IMAGE_SCALE_MIN: " + h.state.bank[0].blocks[0].scale);
  ok(h.api.dirty.get("a") === "bank", "the question was not marked dirty for the flush");
});

test("every copy of the picture is repainted together, and the editor copy follows", () => {
  const frameDoc = new El("document"); frameDoc.body = new El("body"); frameDoc.querySelectorAll = s => frameDoc.body.querySelectorAll(s);
  const h = harness({ bank: [Q("a")], frames: [{ contentDocument: frameDoc }] });
  const w1 = h.doc.body.appendChild(wrapFor("a", "b1"));
  const w2 = frameDoc.body.appendChild(wrapFor("a", "b1"));
  const editorBlocks = [{ id: "b1", type: "image", url: "x.png", scale: 1 }];
  h.api.editing = { id: "a", blocks: editorBlocks };
  h.api.pvsStep("a", "b1", 1);
  ok(w1.children[0].style.getPropertyValue("--question-image-width") === "110%" && w2.children[0].style.getPropertyValue("--question-image-width") === "110%", "a copy of the picture kept its old size");
  ok(w1.children[1].textContent === "110%", "the label did not follow");
  ok(near(editorBlocks[0].scale, 1.1) && h.synced.includes("b1"), "the editor copy still holds the old size — Save there would put it back");
  const h2 = harness({ bank: [Q("a")] });
  const other = [{ id: "b1", type: "image", url: "x.png", scale: 1 }];
  h2.api.editing = { id: "DIFFERENT", blocks: other };
  h2.api.pvsStep("a", "b1", 1);
  ok(other[0].scale === 1, "a DIFFERENT question open in the editor was resized because it shares a block id");
});

test("nothing is written on a press; the flush writes each touched question ONCE through the right door", async () => {
  const h = harness({ bank: [Q("a")], vetting: [Q("v")] });
  h.api.pvsStep("a", "b1", 1); h.api.pvsStep("a", "b1", 1); h.api.pvsStep("v", "b1", -1);
  ok(h.saves.length === 0, "a press wrote to the bank");
  await h.api.pvsFlush(); await tick();
  ok(h.saves.length === 2, "expected one write per question, got " + h.saves.length);
  const bank = h.saves.find(s => s.id === "a"), vet = h.saves.find(s => s.id === "v");
  ok(bank && bank.where === "bank" && near(bank.scale, 1.2), "the bank question did not go through saveQuestionDoc with the size pressed to");
  ok(vet && vet.where === "vetting", "the vetting question did not go through saveVettingDoc");
  ok(h.api.dirty.size === 0 && h.toasts.some(t => t[1] === "ok"), "the flush did not clear or did not say so");
});

test("a write that threw keeps the question dirty and says so; a deleted question is skipped", async () => {
  const h = harness({ bank: [Q("a")], saveOk: false });
  h.api.pvsStep("a", "b1", 1);
  await h.api.pvsFlush(); await tick();
  ok(h.api.dirty.get("a") === "bank" && h.toasts.some(t => t[1] === "error"), "a refused write was forgotten or not reported");
  const h2 = harness({ bank: [Q("a")] });
  h2.api.pvsStep("a", "b1", 1); h2.state.bank.length = 0;
  await h2.api.pvsFlush(); await tick();
  ok(h2.saves.length === 0, "a deleted question was resurrected by the flush");
});

test("a surface with no close of its own is flushed after the idle timer", async () => {
  const h = harness({ bank: [Q("a")] });
  h.api.pvsStep("a", "b1", 1);
  ok(h.timers.size === 1, "no idle timer was armed");
  h.fire(); await tick();
  ok(h.saves.length === 1, "the idle timer did not write");
});

test("the preview-document script is self-contained and talks back through pvsPreviewStep", () => {
  const h = harness({ bank: [Q("a")] });
  const script = h.api.pvsPreviewScriptHtml();
  ok(/^<script>\(function pvsPreviewRun\(css\)/.test(script) && /<\/script>$/.test(script), "the script is not serialised as a self-invoking function: " + script.slice(0, 60));
  const body = h.api.pvsPreviewRun.toString();
  ok(/window\.opener/.test(body) && /window\.parent/.test(body), "a window.open preview or an iframe peek cannot reach the app tab");
  ok(/ws-noprint/.test(body), "the pills would print");
  ok(/pvs-over/.test(body), "the pills sit in the flow and change the measured sheet");
  ok(/pagehide/.test(body) && /pvsFlush/.test(body), "closing the preview window does not write the sizes back");
  ok(!/\b(pvsFind|_pvsBlock|escapeHtml|toast)\(/.test(body.replace(/host\.pvs\w+/g, "")), "the serialised script reaches for a function that does not exist in the preview document");
});

test("the census: the ONE block renderer, the preview surfaces and every close", () => {
  const rb = cut("function renderQuestionBlockHtml(b, q) {", "\nfunction renderQuestionBlocksHtml", "renderQuestionBlockHtml");
  ok(rb.indexOf("pvsBarHtml(q, b)") >= 0, "the image branch renders no pill");
  ok(/return pill \? `<div data-pvs-q=/.test(rb), "the pill is not wrapped with the attributes the repaint needs");
  ok(src.indexOf("function renderQuestionBlocksHtml(blocks, q) {") >= 0, "renderQuestionBlocksHtml does not pass the question through");
  for (const fn of ["_qbHoverOpen", "_dupCompareSide", "toggleWsPreview", "wsePreviewHtml"]) {
    const body = cut("function " + fn + "(", "\nfunction ", fn);
    ok(/renderQuestionBlocksHtml\(q\.blocks \|\| \[\], q\)/.test(body), fn + " renders the question without the pill");
  }
  for (const fn of ["questionPreviewHtml", "wsQuestionChunkHtml", "renderPractice"]) {
    const a = src.indexOf("function " + fn + "("); if (a < 0) continue;
    const body = src.slice(a, src.indexOf("\nfunction ", a + 10));
    ok(!/renderQuestionBlocksHtml\([^)]*, q\)/.test(body), fn + " is a student or print surface and must NOT carry the pill");
  }
  ok(/pvsPreviewScriptHtml\(\)/.test(cut("async function wsBuildDocumentHtml(", "\nfunction wsHeaderEditScript(", "wsBuildDocumentHtml")), "the preview document is not handed the script");
  ok(/opts\.autoPrint \|\| opts\.edit === "cpb" \? "" : pvsPreviewScriptHtml\(\)/.test(src), "a print-only document or a Custom Paper preview is handed the script");
  for (const fn of ["qbHoverHide", "closeOverlay", "vetPrintPeekHide"]) {
    const a = src.indexOf("function " + fn + "("); ok(a >= 0, fn + " missing");
    const body = src.slice(a, src.indexOf("\nfunction ", a + 10));
    ok(/pvsFlush\(\)/.test(body), fn + " closes without writing the picture sizes back");
  }
  ok(/if \(e\.target === o\) \{ o\.classList\.remove\("show"\); pvsFlush\(\); \}/.test(src), "a dialog closed by clicking its backdrop does not flush");
  for (const fn of ["pvsStep", "pvsPreviewStep", "pvsFlush", "qbHoverKeep", "qbHoverLeave"]) ok(src.indexOf("window." + fn + " = " + fn + ";") >= 0, fn + " is not on window");
  ok(/tile\.addEventListener\("mouseleave", qbHoverLeave\)/.test(src), "leaving a tile still hides the card at once — the pill can never be reached");
  ok(!/\.qb-hover-card \{[^}]*pointer-events: none/.test(html), "the hover card still refuses the pointer — the pill cannot be pressed");
});

runAll();
