// 🚦 TRAFFIC LIGHTS ON THE VETTING CARDS — checked, re-checked and fixed
// without opening the question.
//
// Loads the REAL block out of index.html and runs it against stubs. What these
// guard is silent in the app: a light that loses the check before it (only the
// newest kept), a green that still shows green after the answer it judged was
// changed, a check that writes into a question deleted while the model was
// working, a bulk run that fires forty AI calls at once, a quick edit that
// signs the teacher's own light against the OLD question, a check history that
// lands in the half of the bank a student can read, and the 👁 peek whose
// picture pills were handed to a frame that is not allowed to run them.
//
//   node tools/vetting-traffic-light-tests.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(here, "..", "index.html"), "utf8");
const src = html.slice(html.indexOf('<script type="module">'), html.lastIndexOf("</script>"));
const core = readFileSync(join(here, "..", "rapid-import", "functions", "core.js"), "utf8");

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
function cut(text, from, to, what) {
  const a = text.indexOf(from);
  if (a < 0) throw new Error("cannot find the start of " + what + ": " + from);
  const b = text.indexOf(to, a + from.length);
  if (b < 0) throw new Error("cannot find the end of " + what + ": " + to);
  return text.slice(a, b);
}
// The import signature, the real one — the light's "changed since" rests on it.
const sigSrc = cut(core, "export function signature(q) {", "\n}\n", "signature").replace("export function signature", "function mathImportSignature") + "\n}\n";
const aicSrc = cut(src, "var AIC_KEEP = 12;", "\n// =====================================================================\n// 🔍 ANSWER KEY CROSS-CHECK", "the 🚦 block");

function harness(o = {}) {
  const saves = [], toasts = [], renders = { list: 0, bar: 0 };
  const state = {
    admin: o.admin !== false, ready: o.ready !== false, vetting: o.vetting || [],
    saveOk: o.saveOk !== false, checker: o.checker || (async () => ({ verdict: "green", summary: "Fine.", issues: [] })),
    selected: new Set(o.selected || []), confirm: o.confirm !== false
  };
  const f = new Function("state", "saves", "toasts", "renders", `
    const escapeHtml = s => String(s).replace(/&/g,"&amp;").replace(/"/g,"&quot;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
    const mcqLabel = i => (i + 1) + ")";
    const canManageQuestions = () => state.admin;
    const aiReady = () => state.ready;
    const aiErrorMessage = e => (e && e.message) || String(e);
    const currentUser = { name: "Teacher" };
    const confirm = () => state.confirm;
    const $ = () => null;
    const document = { createElement: () => ({ querySelector: () => null }) };
    let vettingList = state.vetting;
    const _vetSelected = state.selected;
    let editorPanel = null;
    function setCheckAiState(s, d) { editorPanel = { s, d }; }
    function renderVettingList() { renders.list++; }
    function vetRenderBulkBar() { renders.bar++; }
    function toast(msg, type) { toasts.push([msg, type]); }
    async function saveVettingDoc(q) { if (!state.saveOk) throw new Error("offline"); saves.push(JSON.parse(JSON.stringify(q))); }
    async function aicRunCheck(q) {
      state.calls = (state.calls || 0) + 1;
      state.inFlight = (state.inFlight || 0) + 1;
      state.peak = Math.max(state.peak || 0, state.inFlight);
      try { return aicEntryFromResult(await state.checker(q), q); }
      finally { state.inFlight--; }
    }
    ${sigSrc}
    ${aicSrc}
    return {
      aicEntryFromResult, aicManualEntry, aicAppend, aicHistory, aicLatest, aicIsStale, aicLightOf,
      aicCardHtml, aicCheckVetting, aicCheckMany, aicQuickSave, aicQuickDraftFor, aicDeleteEntry,
      aicFilterHtml, aicBulkHtml, vetVisibleList, aicShowEditorLatest, aicSig,
      get list() { return vettingList; }, set list(v) { vettingList = v; },
      get filter() { return _vetLightFilter; }, set filter(v) { _vetLightFilter = v; },
      get bulk() { return _aicBulk; }, get editorChecks() { return editorAiChecks; },
      get editorPanel() { return editorPanel; }, quick: _vetQuickEdit, running: _aicRunning, AIC_KEEP, AIC_PAR
    };`);
  return { api: f(state, saves, toasts, renders), state, saves, toasts, renders };
}
const Q = (id, extra = {}) => Object.assign({
  id, title: "Question " + id, level: "P4",
  blocks: [{ id: "b1", type: "text", content: "Peter bought 3 shirts and 2 bags for $289." }],
  expected: "$68", markingGuide: "289 - 34 = 255; 255 / 5 = 51; 51 + 17 = 68"
}, extra);
const tick = () => new Promise(r => setTimeout(r, 0));

test("a verdict is normalised the way the editor always did it", () => {
  const { api } = harness();
  const q = Q("a");
  const g = api.aicEntryFromResult({ verdict: "GREEN", summary: " ok ", issues: [] }, q);
  ok(g.verdict === "green" && g.summary === "ok", "an explicit colour is trusted, whatever its case");
  ok(g.checks.scenario === "ok" && g.checks.answer === "ok", "a green with no per-part checks is all-ok");
  const a = api.aicEntryFromResult({ verdict: "purple", issues: ["x"] }, q);
  ok(a.verdict === "amber", "an unknown colour with issues becomes amber");
  const b = api.aicEntryFromResult({ verdict: "", checks: { answer: "issue", working: "weird" } }, q);
  ok(b.verdict === "amber" && b.checks.answer === "issue" && !("working" in b.checks), "a flagged part with no colour is amber, and only ok/issue survive");
  const many = api.aicEntryFromResult({ verdict: "red", issues: Array.from({ length: 20 }, (_, i) => "issue " + i) }, q);
  ok(many.issues.length === 8, "issues are capped at 8");
  ok(g.sig && g.sig === api.aicSig(q), "every check is signed with what it looked at");
  ok(g.kind === "ai" && g.by === "Teacher" && g.id && g.at, "it records who, when and an id to remove it by");
  ok(api.aicEntryFromResult(null, q).verdict === "green", "an empty reply is not a crash");
});

test("every check is kept, oldest first, up to AIC_KEEP — and nothing is mutated", () => {
  const { api } = harness();
  const q = Q("a");
  let list = [];
  const first = list;
  for (let i = 0; i < api.AIC_KEEP + 5; i++) list = api.aicAppend(list, api.aicManualEntry(q, i % 2 ? "red" : "green", "n" + i));
  ok(first.length === 0, "the list handed in is not changed");
  ok(list.length === api.AIC_KEEP, "capped at AIC_KEEP");
  ok(list[list.length - 1].summary === "n" + (api.AIC_KEEP + 4), "the newest is last");
  ok(api.aicAppend(list, { verdict: "blue" }).length === api.AIC_KEEP, "an entry with no real colour is not added");
  ok(api.aicAppend(null, api.aicManualEntry(q, "green")).length === 1, "a question with no history starts one");
});

test("the PDF import's own check is the first light, and an unfinished one is not a light", () => {
  const { api } = harness();
  const q = Q("a", { autoCheck: { state: "red", sig: "x", findings: [{ title: "Answer", detail: "should be 35" }] } });
  const h = api.aicHistory(q);
  ok(h.length === 1 && h[0].kind === "import" && h[0].verdict === "red", "autoCheck shows as a red import light");
  ok(h[0].issues[0] === "Answer: should be 35", "its findings become the light's issues");
  q.aiChecks = [api.aicManualEntry(q, "green", "fixed")];
  ok(api.aicLatest(q).kind === "manual", "a newer check is the one shown");
  ok(api.aicHistory(Q("b", { autoCheck: { state: "error" } })).length === 0, "an import check that could not finish is no light at all");
});

test("a light from before an edit is greyed as 'changed since'", () => {
  const { api } = harness();
  const q = Q("a");
  ok(api.aicLightOf(q) === "none", "no check, no light");
  q.aiChecks = [api.aicEntryFromResult({ verdict: "green" }, q)];
  ok(api.aicLightOf(q) === "green", "a fresh green is green");
  q.expected = "$51";
  ok(api.aicLightOf(q) === "stale", "the same green after the answer changed is stale");
  const html = api.aicCardHtml(q);
  ok(html.includes("vet-tl-stale") && html.includes("changed since this light"), "the card says so in words");
});

test("the card shows the newest light large and folds the rest — and escapes all of it", () => {
  const { api } = harness();
  const q = Q("a<\"x");
  q.aiChecks = [
    api.aicEntryFromResult({ verdict: "red", summary: "<img src=x onerror=alert(1)>", issues: ["<b>bad</b>"] }, q),
    api.aicEntryFromResult({ verdict: "green", summary: "Now fine" }, q)
  ];
  const closed = api.aicCardHtml(q);
  ok(closed.includes("Green light") && closed.includes("Now fine"), "the newest light is the headline");
  ok(closed.includes("Earlier checks (1) 🔴"), "the earlier ones are counted with their colours");
  ok(closed.includes("🚦 Check again"), "a checked question offers to check again");
  ok(!closed.includes("<img src=x"), "the earlier summary is not on the page until it is opened");
  ok(closed.includes('data-aic-run="a&lt;&quot;x"'), "the id is escaped into the attributes");
  const fresh = api.aicCardHtml(Q("n"));
  ok(fresh.includes("Not checked yet") && fresh.includes("🚦 Check with AI"), "an unchecked card says so and offers the check");
});

test("a card check appends to the history and saves through the vetting door", async () => {
  const q = Q("a", { aiChecks: [] });
  const h = harness({ vetting: [q], checker: async () => ({ verdict: "red", summary: "Bags are wrong", issues: ["answer should be $68"] }) });
  q.aiChecks = [h.api.aicManualEntry(q, "green", "looked fine")];
  const okRun = await h.api.aicCheckVetting("a");
  ok(okRun === true, "the check reports success");
  ok(h.saves.length === 1 && h.saves[0].aiChecks.length === 2, "saved once, with BOTH lights");
  ok(h.saves[0].aiChecks[1].verdict === "red", "the new light is last");
  ok(h.api.list[0].aiChecks.length === 2, "the list on screen holds the saved version");
  ok(!h.api.running.has("a"), "it is no longer marked as running");
  ok(h.toasts.some(t => t[0].includes("Red light")), "the verdict is announced");
});

test("a check that comes back after the list was re-read writes into the LIVE question", async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const h = harness({ vetting: [Q("a")], checker: async () => { await gate; return { verdict: "amber" }; } });
  const run = h.api.aicCheckVetting("a");
  await tick();
  h.api.list = [Q("a", { title: "Re-read title" })];   // loadVettingList replaced everything
  release();
  await run;
  ok(h.saves.length === 1 && h.saves[0].title === "Re-read title", "the write starts from the re-read question, not the stale copy");
  ok(h.api.list[0].aiChecks.length === 1, "and the re-read list gets the light");
});

test("a check on a question approved or deleted meanwhile writes nothing", async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const h = harness({ vetting: [Q("a")], checker: async () => { await gate; return { verdict: "green" }; } });
  const run = h.api.aicCheckVetting("a");
  await tick();
  h.api.list = [];
  release();
  ok(await run === false, "reported as not done");
  ok(h.saves.length === 0, "nothing was resurrected into vetting");
});

test("a failed check is shown on the card and saves nothing", async () => {
  const h = harness({ vetting: [Q("a")], checker: async () => { throw new Error("daily limit reached"); } });
  ok(await h.api.aicCheckVetting("a") === false, "reported as failed");
  ok(h.saves.length === 0, "nothing saved");
  ok(h.api.aicCardHtml(h.api.list[0]).includes("daily limit reached"), "the reason is on the card");
});

test("only an admin may check, and not while the AI is starting", async () => {
  const h = harness({ admin: false, vetting: [Q("a")] });
  ok(await h.api.aicCheckVetting("a") === false && !h.state.calls, "a non-admin is refused before any AI call");
  const h2 = harness({ ready: false, vetting: [Q("a")] });
  ok(await h2.api.aicCheckVetting("a") === false && !h2.state.calls, "no call before the AI is ready");
});

test("pressing 🚦 twice on one card is one check", async () => {
  let release;
  const gate = new Promise(r => { release = r; });
  const h = harness({ vetting: [Q("a")], checker: async () => { await gate; return { verdict: "green" }; } });
  const one = h.api.aicCheckVetting("a");
  const two = await h.api.aicCheckVetting("a");
  release(); await one;
  ok(two === false && h.state.calls === 1, "the second press does nothing while the first runs");
});

test("many at once run AIC_PAR at a time and can be stopped", async () => {
  const ids = ["a", "b", "c", "d", "e", "f"];
  const h = harness({ vetting: ids.map(id => Q(id)), checker: async () => { await new Promise(r => setTimeout(r, 5)); return { verdict: "green" }; } });
  await h.api.aicCheckMany(ids);
  ok(h.state.calls === ids.length, "every question was checked once");
  ok(h.state.peak <= h.api.AIC_PAR, "never more than AIC_PAR in flight (peak " + h.state.peak + ")");
  ok(h.api.bulk === null, "the run is over");
  ok(h.toasts.some(t => /Checked 6/.test(t[0]) && t[0].includes("🟢 6")), "the summary counts the lights");

  const h2 = harness({ vetting: ids.map(id => Q(id)), checker: async () => { await new Promise(r => setTimeout(r, 5)); return { verdict: "red" }; } });
  const run = h2.api.aicCheckMany(ids);
  await tick();
  h2.api.bulk.stop = true;
  await run;
  ok(h2.state.calls < ids.length, "Stop leaves the rest unchecked (" + h2.state.calls + " of " + ids.length + ")");
  ok(h2.toasts.some(t => t[0].startsWith("Stopped.")), "and says it stopped");
});

test("a big batch asks first", async () => {
  const ids = Array.from({ length: 30 }, (_, i) => "q" + i);
  const h = harness({ vetting: ids.map(id => Q(id)), confirm: false });
  await h.api.aicCheckMany(ids);
  ok(!h.state.calls, "declining the confirm runs nothing");
});

test("✏️ quick edit saves the fixed answer and signs the teacher's light against the NEW question", async () => {
  const q = Q("a", { options: ["$51", "$68"], correctOption: 0 });
  const h = harness({ vetting: [q] });
  const d = h.api.aicQuickDraftFor(q);
  d.expected = "$68"; d.correctOption = 1; d.markingGuide = "fixed working"; d.title = "  ";
  d.verdict = "green"; d.note = "checked against the paper";
  await h.api.aicQuickSave("a", false);
  const saved = h.saves[0];
  ok(saved.expected === "$68" && saved.correctOption === 1 && saved.markingGuide === "fixed working", "the fields are saved");
  ok(saved.title === "Untitled", "a blank title is not saved blank");
  ok(saved.aiChecks.length === 1 && saved.aiChecks[0].kind === "manual" && saved.aiChecks[0].summary === "checked against the paper", "the teacher's own light is added");
  ok(h.api.aicLightOf(h.api.list[0]) === "green", "and it is CURRENT, not 'changed since'");
  ok(!h.api.quick.has("a"), "the quick edit closes on save");
});

test("✏️ save & check runs the check on the SAVED version", async () => {
  const seen = [];
  const h = harness({ vetting: [Q("a")], checker: async q => { seen.push(q.expected); return { verdict: "green" }; } });
  h.api.aicQuickDraftFor(h.api.list[0]).expected = "$70";
  await h.api.aicQuickSave("a", true);
  await new Promise(r => setTimeout(r, 5));
  ok(seen[0] === "$70", "the checker saw the new answer");
  ok(h.api.aicLightOf(h.api.list[0]) === "green", "and the light is current");
});

test("a quick edit that fails to save stays open with the teacher's typing", async () => {
  const h = harness({ vetting: [Q("a")], saveOk: false });
  h.api.aicQuickDraftFor(h.api.list[0]).expected = "$1";
  await h.api.aicQuickSave("a", false);
  ok(h.api.quick.has("a") && h.api.quick.get("a").expected === "$1", "the draft is kept");
  ok(h.api.list[0].expected === "$68", "the list still shows what is saved");
});

test("a light can be removed; the import's own cannot", async () => {
  const q = Q("a", { autoCheck: { state: "amber" } });
  const h = harness({ vetting: [q] });
  q.aiChecks = [h.api.aicManualEntry(q, "red", "wrong"), h.api.aicManualEntry(q, "green", "fine")];
  await h.api.aicDeleteEntry("a", q.aiChecks[0].id);
  ok(h.saves[0].aiChecks.length === 1 && h.saves[0].aiChecks[0].summary === "fine", "the chosen light is gone");
  ok(!h.api.aicCardHtml(Object.assign({}, q, { aiChecks: [] })).includes('data-aic-entry="autoCheck"'), "the import light has no ✕");
});

test("the 🚦 filter shows only the cards with that light", () => {
  const h = harness();
  const a = Q("a"), b = Q("b"), c = Q("c"), d = Q("d");
  a.aiChecks = [h.api.aicEntryFromResult({ verdict: "red" }, a)];
  b.aiChecks = [h.api.aicEntryFromResult({ verdict: "green" }, b)];
  c.aiChecks = [h.api.aicEntryFromResult({ verdict: "green" }, c)]; c.expected = "changed";
  h.api.list = [a, b, c, d];
  const pick = v => { h.api.filter = v; return h.api.vetVisibleList().map(q => q.id).join(","); };
  ok(pick("all") === "a,b,c,d", "all");
  ok(pick("red") === "a", "red");
  ok(pick("green") === "b", "green (the stale one is not green any more)");
  ok(pick("stale") === "c", "changed since");
  ok(pick("none") === "d", "not checked");
  h.api.filter = "all";
  const f = h.api.aicFilterHtml();
  ok(f.includes("🔴 Red (1)") && f.includes("Not checked (1)"), "the filter counts each light");
  ok(h.api.aicBulkHtml(0).includes("Check unchecked (2)"), "'unchecked' means no light OR changed since");
});

test("a question opened in the editor brings its lights with it", () => {
  const h = harness();
  const q = Q("a");
  q.aiChecks = [h.api.aicEntryFromResult({ verdict: "red", issues: ["x"] }, q), h.api.aicManualEntry(q, "amber", "maybe")];
  h.api.aicShowEditorLatest(q);
  ok(h.api.editorChecks.length === 2 && h.api.editorChecks !== q.aiChecks, "a COPY of the history is loaded");
  ok(h.api.editorPanel && h.api.editorPanel.s === "warn", "the newest light shows in the editor panel");
  h.api.aicShowEditorLatest(Q("b"));
  ok(h.api.editorChecks.length === 0, "a question with none starts empty");
});

test("the wiring in index.html", () => {
  ok(/const QUESTION_KEY_FIELDS = \[[^\]]*"aiChecks"/.test(src), "aiChecks is answer-key material — the admin-only half of the bank");
  ok(/if \(Array\.isArray\(editorAiChecks\) && editorAiChecks\.length\) q\.aiChecks = editorAiChecks\.slice\(-AIC_KEEP\);/.test(src), "a save from the editor carries the history");
  ok(/function resetEditor\(\)[\s\S]*?editorAiChecks = \[\];\n\}/.test(src), "a cleared editor forgets it");
  ok(/clearCheckAiPanel\(\);\n  aicShowEditorLatest\(q\);/.test(src), "loading a question shows its lights");
  ok(/const entry = await aicRunCheck\(q\);\n    \/\/ Kept with the question/.test(src), "the editor's 🚦 goes through the ONE check");
  ok(src.includes("${aicCardHtml(q)}") && src.includes("aicBindCard(list);") && src.includes("aicBindQuickEdit(list);"), "every vetting card carries a light, bound");
  ok(src.includes("const shown = vetVisibleList();") && /vetVisibleList\(\)\.forEach\(q => \{ if \(on\) _vetSelected\.add/.test(src), "the list and Select all follow the filter");
  ok(src.includes("aicBindBulk();"), "the bulk bar's 🚦 buttons are bound");
});

test("the 👁 peek's pictures get − / + / Auto from THIS tab, not from a script the sandbox blocks", () => {
  ok(/frame\.setAttribute\('sandbox','allow-same-origin'\)/.test(src), "the frame is still sandboxed without scripts");
  ok(/frame\.onload = \(\) => \{[\s\S]*?pvsDecorateDoc\(frame\.contentDocument\)/.test(src), "its load hangs the pills from the parent");
  const deco = cut(src, "function pvsDecorateDoc(doc) {", "\ntry { window.addEventListener(\"pagehide\"", "pvsDecorateDoc");
  ok(deco.includes("pvsStep(found.q.id, bid, -1)") && deco.includes("pvsStep(found.q.id, bid, 1)") && deco.includes("pvsReset(found.q.id, bid)"), "the buttons call this tab's step and reset");
  ok(deco.includes("b.onclick = e =>") && !/setAttribute\("onclick"/.test(deco), "bound as functions, never as inline handlers the frame would have to run");
  ok(deco.includes('wrap.setAttribute("data-pvs-q"') && deco.includes('wrap.setAttribute("data-pvs-b"'), "each picture is wrapped so pvsPaint repaints it");
  ok(deco.includes("if (!doc || !pvsAllowed()) return 0;"), "only an author gets them");
  ok(/function pvsReset\(qid, bid\) \{[\s\S]*?delete block\.scale;/.test(src), "Auto deletes the size rather than inventing one");
  ok(src.includes("window.pvsReset = pvsReset;") && src.includes("window.pvsPreviewReset = pvsPreviewReset;"), "Auto is reachable from inline pills and the preview window");
});

runAll();
