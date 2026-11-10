/* 🧩 EXPLANATION APPS — the pure half (v1.117.0).
 *
 * An explanation app is ONE self-contained HTML page a teacher attaches to a
 * question — pasted, uploaded as an .html file, generated with AI, or copied
 * from a 🧩 dependency chart — and a pupil meets it only AFTER their answer is
 * marked, beside the feedback, the answer key and the video. It is the Maths
 * twin of the Science portal's 🧩 Interactive app block (polymathlc/cer,
 * `question-apps.js`), with two differences that are deliberate:
 *
 *   • It is a QUESTION field (`q.explanationApps`), not a block. Every block in
 *     this app is printed, previewed, read aloud to the marker and copied into
 *     games; an app is none of those, and a block type nobody else knows about
 *     would be printed as an empty text block by every one of them.
 *   • It lives in the ADMIN-ONLY half of the bank (`QUESTION_KEY_FIELDS`). An
 *     app that walks a pupil through the question ends on its answer, so a
 *     pupil's browser receives it from the marking response (`markAttempt` /
 *     `markFromPhoto`) or the worksheet's shared solutions — never from a
 *     document they can read before answering.
 *
 * Everything here is pure: no Firebase, no DOM writes, no globals beyond
 * `window.ExplanationApps`. `tools/explanation-apps-tests.mjs` loads this very
 * file under Node, and `functions/index.js` carries its own copy of `clean`
 * (`cleanExplanationApps`) — the two must agree on the limits below.
 *
 * THE SANDBOX. Every app runs in `<iframe sandbox="allow-scripts">` with NO
 * `allow-same-origin`, inside a document whose FIRST element is a Content
 * Security Policy forbidding every network request. The four Polymath portals
 * share one origin and one localStorage holding the ChatGPT key, so a page a
 * teacher pasted from somewhere — or a model wrote — must never run as this
 * origin, and must not be able to phone home with what a pupil types into it.
 * The trusted head is parsed before any author content, so a later CSP in the
 * pasted page can only tighten this one, never relax it.
 */
(function (root) {
  "use strict";

  // ---- Limits — `cleanExplanationApps` in functions/index.js mirrors them ----
  const MAX_APPS = 3;                 // a question, not a gallery
  const HTML_MAX = 300000;            // characters per app (~300 KB, cer's cap)
  const TOTAL_MAX = 600000;           // all apps together: the key doc must stay under 1 MB
  const TITLE_MAX = 120;
  const BRIEF_MAX = 4000;
  const HEIGHT_MIN = 240, HEIGHT_MAX = 900, HEIGHT_DEFAULT = 560;
  const DEFAULT_TITLE = "Explore this question";
  const SOURCES = ["pasted", "uploaded", "generated", "chart"];
  const ID_RE = /^xa_[a-z0-9_]{4,40}$/;
  const CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; media-src data: blob:; connect-src 'none'; object-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'";

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  // UTF-8 bytes, which is what Firestore counts against its 1 MB.
  function byteLength(text) {
    const s = String(text == null ? "" : text);
    if (typeof TextEncoder === "function") return new TextEncoder().encode(s).length;
    let n = 0;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      n += c < 0x80 ? 1 : c < 0x800 ? 2 : (c >= 0xd800 && c < 0xdc00) ? (i++, 4) : 3;
    }
    return n;
  }
  function sizeLabel(text) {
    const b = byteLength(text);
    return b < 1024 ? b + " bytes" : (b / 1024).toFixed(b < 10240 ? 1 : 0) + " KB";
  }
  function normalizeHeight(value) {
    const n = Number(value);
    if (value === "" || value == null || !Number.isFinite(n)) return HEIGHT_DEFAULT;
    return Math.max(HEIGHT_MIN, Math.min(HEIGHT_MAX, Math.round(n)));
  }
  function cleanTitle(value) {
    const t = String(value == null ? "" : value).replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, TITLE_MAX);
    return t || DEFAULT_TITLE;
  }
  function newId() {
    return "xa_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 8);
  }
  function cleanId(value) {
    const id = String(value == null ? "" : value);
    return ID_RE.test(id) ? id : newId();
  }

  // ⌨ PASTED CODE becomes a page here, and only here. The same rules the
  // dependency chart's ⌨ Paste code tab has always used (`qcPastedAppHtml`):
  //   • a byte-order mark and a ```html fence around the code are taken off;
  //   • a whole document is kept exactly as it is;
  //   • a piece of HTML is put inside a page with a charset and a viewport;
  //   • text with no tag in it at all is JavaScript, put inside a <script>
  //     (with any </script in it escaped, or the page would end early).
  // Returns { html, wrapped, kind, cut } so the editor can SAY what it did —
  // a teacher who pasted twelve lines of script must not wonder where the
  // <html> around them came from.
  function fromCode(code) {
    let t = String(code == null ? "" : code).replace(/^﻿/, "").replace(/\r\n?/g, "\n").trim();
    const out = { html: "", wrapped: false, kind: "empty", cut: false };
    if (!t) return out;
    const fence = /^```[a-z0-9-]*[ \t]*\n([\s\S]*?)\n?```$/i.exec(t);
    if (fence) t = fence[1].trim();
    if (!t) return out;
    const head = '<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">';
    let html;
    if (/<!doctype html|<html[\s>]/i.test(t)) { html = t; out.kind = "document"; }
    else if (/<[a-z!][^>]*>/i.test(t)) { html = "<!DOCTYPE html>\n<html><head>" + head + "</head><body>\n" + t + "\n</body></html>"; out.kind = "fragment"; out.wrapped = true; }
    else { html = "<!DOCTYPE html>\n<html><head>" + head + "</head><body>\n<script>\n" + t.replace(/<\/script/gi, "<\\/script") + "\n</script>\n</body></html>"; out.kind = "script"; out.wrapped = true; }
    if (html.length > HTML_MAX) { html = html.slice(0, HTML_MAX); out.cut = true; }
    out.html = html;
    return out;
  }
  function pastedHtml(code) { return fromCode(code).html; }

  // A model asked for a page often wraps it in a fence or says a sentence
  // first. Take the document itself, or nothing (the chart's `qcAppHtmlFrom`).
  function fromModelText(text) {
    let t = String(text || "").trim();
    const fence = /```(?:html)?\s*([\s\S]*?)```/i.exec(t);
    if (fence && /<(?:!doctype|html|body|div|svg|script)/i.test(fence[1])) t = fence[1].trim();
    const start = t.search(/<!doctype html|<html[\s>]/i);
    if (start > 0) t = t.slice(start);
    const end = t.toLowerCase().lastIndexOf("</html>");
    if (end >= 0) t = t.slice(0, end + 7);
    if (!/<(?:html|body|div|svg|canvas|main)[\s>]/i.test(t)) return "";
    return t.slice(0, HTML_MAX);
  }

  // 📂 An UPLOADED file. Names and types are only hints (a teacher's laptop
  // calls an .html file anything), so the CONTENT decides: a page, a piece of
  // a page, or a script are all accepted through `fromCode`; a binary file —
  // a PDF, a picture, a Word document — is refused by name rather than being
  // "run" as a page full of mojibake.
  const FILE_EXT_OK = /\.(html?|xhtml|js|mjs|txt|svg)$/i;
  function fileProblem(name, size, text) {
    const n = String(name || "");
    if (Number(size) > HTML_MAX * 4) return "That file is too big for an app (" + Math.round(Number(size) / 1024) + " KB). An app must be under " + Math.round(HTML_MAX / 1000) + " KB.";
    if (/\.(pdf|docx?|pptx?|xlsx?|png|jpe?g|gif|webp|zip)$/i.test(n)) return "That is not a web page — choose an .html file (or a .js file) that holds the app.";
    const t = String(text == null ? "" : text);
    if (!t.trim()) return "That file is empty.";
    if (/[\u0000-\u0008\u000e-\u001a]/.test(t.slice(0, 4000))) return "That file is not text — choose an .html file that holds the app.";
    if (!FILE_EXT_OK.test(n) && !/<(?:!doctype|html|body|div|script|canvas|svg|main|style)\b/i.test(t)) return "That file does not look like an app — choose an .html file with the app's code in it.";
    return "";
  }
  function fromFile(name, size, text) {
    const problem = fileProblem(name, size, text);
    if (problem) return { html: "", problem, wrapped: false, kind: "empty", cut: false };
    const r = fromCode(text);
    if (byteLength(r.html) > HTML_MAX) return { html: "", problem: "That app is larger than " + Math.round(HTML_MAX / 1000) + " KB. Make it smaller (or move pictures out of it) and upload it again.", wrapped: false, kind: "empty", cut: false };
    return Object.assign(r, { problem: "" });
  }
  // A short title from the file's own <title>, else its name.
  function titleFrom(html, fallbackName) {
    const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(html || ""));
    const fromTag = m ? m[1].replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim() : "";
    if (fromTag) return cleanTitle(fromTag);
    const base = String(fallbackName || "").replace(/^.*[\\/]/, "").replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ").trim();
    return base ? cleanTitle(base.charAt(0).toUpperCase() + base.slice(1)) : DEFAULT_TITLE;
  }
  function looksRunnable(html) {
    return /<(?:script|canvas|svg|input|button|div|main|body|style)\b/i.test(String(html || ""));
  }

  // THE ONE place a stored list is believed. Unknown fields are dropped; a row
  // with no page is dropped; ids are made safe for an attribute; the count and
  // the total size are capped. An app over the cap is DROPPED, never cut —
  // half a page is a page with its closing </script> missing.
  function clean(list) {
    if (!Array.isArray(list)) return [];
    const out = [], seen = new Set();
    let total = 0;
    for (const raw of list) {
      if (out.length >= MAX_APPS) break;
      if (!raw || typeof raw !== "object") continue;
      const html = typeof raw.html === "string" ? raw.html.trim() : "";
      if (!html) continue;
      const bytes = byteLength(html);
      if (bytes > HTML_MAX || total + bytes > TOTAL_MAX) continue;
      let id = cleanId(raw.id);
      while (seen.has(id)) id = newId();
      seen.add(id);
      const app = { id, title: cleanTitle(raw.title), html, height: normalizeHeight(raw.height) };
      if (SOURCES.indexOf(raw.source) >= 0) app.source = raw.source;
      if (typeof raw.brief === "string" && raw.brief.trim()) app.brief = raw.brief.trim().slice(0, BRIEF_MAX);
      if (typeof raw.model === "string" && /^[a-z0-9.-]{2,40}$/i.test(raw.model)) app.model = raw.model;
      if (typeof raw.effort === "string" && /^[a-z]{2,10}$/i.test(raw.effort)) app.effort = raw.effort;
      if (typeof raw.size === "string" && /^[a-z]{2,12}$/i.test(raw.size)) app.size = raw.size;
      if (typeof raw.chartAppId === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(raw.chartAppId)) app.chartAppId = raw.chartAppId;
      if (typeof raw.updatedAt === "string" && raw.updatedAt.length <= 40) app.updatedAt = raw.updatedAt;
      total += bytes;
      out.push(app);
    }
    return out;
  }
  // What a PUPIL is handed: the page and how to show it. The brief, the model
  // and the chart link are the teacher's working notes.
  function forPupil(list) {
    return clean(list).map(a => ({ id: a.id, title: a.title, html: a.html, height: a.height }));
  }
  // Why a list could not be kept whole — said in the editor before Save.
  function problems(list) {
    const out = [];
    const rows = Array.isArray(list) ? list : [];
    const filled = rows.filter(a => a && String(a.html || "").trim());
    if (filled.length > MAX_APPS) out.push("A question holds up to " + MAX_APPS + " apps — remove " + (filled.length - MAX_APPS) + ".");
    let total = 0;
    filled.forEach((a, i) => {
      const b = byteLength(String(a.html).trim());
      total += b;
      if (b > HTML_MAX) out.push("App " + (i + 1) + " is " + sizeLabel(a.html) + " — an app must be under " + Math.round(HTML_MAX / 1000) + " KB.");
    });
    if (total > TOTAL_MAX) out.push("The apps together are " + Math.round(total / 1024) + " KB — together they must stay under " + Math.round(TOTAL_MAX / 1000) + " KB.");
    return out;
  }
  function sameList(a, b) {
    return JSON.stringify(clean(a)) === JSON.stringify(clean(b));
  }

  // ---- Rendering --------------------------------------------------------
  function sandboxDocument(html) {
    return '<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
      escapeHtml(CSP) + '"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + String(html || "") + "</body></html>";
  }
  // `opts.lazy` (default true) defers a frame that is off screen or hidden —
  // a worksheet of twenty questions does not start twenty apps at once.
  function frameHtml(app, opts) {
    const a = app || {};
    const o = opts || {};
    const h = normalizeHeight(o.height != null ? o.height : a.height);
    return '<iframe class="xa-frame" data-xa-frame="' + escapeHtml(a.id || "") + '" title="' + escapeHtml(cleanTitle(a.title)) +
      '" sandbox="allow-scripts" referrerpolicy="no-referrer"' + (o.lazy === false ? "" : ' loading="lazy"') +
      ' style="height:' + h + 'px" srcdoc="' + escapeHtml(sandboxDocument(a.html)) + '"></iframe>';
  }
  // One app as a pupil meets it: its title, ↻ Start again, ⤢ Bigger, the frame.
  function cardHtml(app, opts) {
    const a = app || {};
    const o = opts || {};
    const id = escapeHtml(a.id || "");
    return '<div class="xa-card" data-xa-card="' + id + '" data-xa-height="' + normalizeHeight(a.height) + '">' +
      '<div class="xa-card-head"><span class="xa-card-title">' + escapeHtml(cleanTitle(a.title)) + "</span>" +
      '<span class="xa-card-tools">' +
        '<button type="button" class="xa-tool" data-xa-restart="' + id + '" title="Start the app again from the beginning">↻ Start again</button>' +
        '<button type="button" class="xa-tool" data-xa-expand="' + id + '" aria-pressed="false" title="Make the app taller">⤢ Bigger</button>' +
      "</span></div>" +
      '<div class="xa-frame-wrap">' + frameHtml(a, { lazy: o.lazy }) + "</div></div>";
  }
  // Every app of a question, or "" when it has none. `opts.note` is a line
  // above the apps (the editor's preview says when a pupil will see them).
  function revealHtml(list, opts) {
    const apps = forPupil(list);
    if (!apps.length) return "";
    const o = opts || {};
    return (o.note ? '<div class="xa-note">' + escapeHtml(o.note) + "</div>" : "") +
      '<div class="xa-intro">' + (apps.length > 1 ? "Try these apps" : "Try this app") + " to see how the question works — change things, make a prediction and watch what happens.</div>" +
      apps.map(a => cardHtml(a, o)).join("");
  }
  // The whole feedback block for the surfaces that build their result in one
  // string (📸 Snap & Mark, the worksheet overview's solution).
  function feedbackBlockHtml(list, opts) {
    const body = revealHtml(list, opts);
    return body ? '<div class="feedback-block xa-reveal"><h4>🧩 Explore it — interactive</h4>' + body + "</div>" : "";
  }
  function summary(list) {
    const apps = clean(list);
    if (!apps.length) return "";
    return apps.length === 1 ? "🧩 1 app" : "🧩 " + apps.length + " apps";
  }

  // The brief a teacher starts from when asking AI for an explanation app.
  // The question itself rides in the PROMPT (the chart's `qcAppPrompt`), so an
  // edit to its wording still reaches the next ✨ Generate.
  function defaultBrief() {
    return [
      "This app is shown to the pupil AFTER their answer has been marked, as part of the explanation.",
      "Walk them through THIS question step by step with its own names, objects and numbers — never a different story or different numbers.",
      "Let them DO each step: drag or tap to build the bar model, make the equal groups or move the parts of the diagram, then show the number sentence for that step.",
      "End on the question's real answer and a one-line Key Takeaway about the method, so a pupil who got it wrong sees exactly where their working went off."
    ].join("\n");
  }
  // 🔁 Refine: the page as it stands, plus what the teacher wants changed.
  function refinePrompt(basePrompt, html, change) {
    return [
      String(basePrompt || ""),
      "",
      "THE CURRENT PAGE (keep everything that already works):",
      String(html || "").slice(0, HTML_MAX),
      "",
      "CHANGE IT LIKE THIS:",
      String(change || "").slice(0, BRIEF_MAX),
      "",
      "Return the WHOLE updated document, from <!DOCTYPE html> to </html>. No commentary, no markdown fence."
    ].join("\n");
  }

  const api = {
    MAX_APPS, HTML_MAX, TOTAL_MAX, TITLE_MAX, BRIEF_MAX, HEIGHT_MIN, HEIGHT_MAX, HEIGHT_DEFAULT, DEFAULT_TITLE, SOURCES, CSP,
    escapeHtml, byteLength, sizeLabel, normalizeHeight, cleanTitle, newId, cleanId,
    fromCode, pastedHtml, fromModelText, fileProblem, fromFile, titleFrom, looksRunnable,
    clean, forPupil, problems, sameList,
    sandboxDocument, frameHtml, cardHtml, revealHtml, feedbackBlockHtml, summary,
    defaultBrief, refinePrompt
  };
  root.ExplanationApps = Object.freeze(api);
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
