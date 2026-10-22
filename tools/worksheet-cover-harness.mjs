// Shared setup for the Big M cover tests (worksheet-cover-tests.mjs and
// worksheet-cover-browser-tests.mjs): the REAL worksheet-cover.js, and the
// REAL cover, settings and document-builder code cut out of index.html, with
// everything they reach out to stubbed. Nothing here talks to Firebase.
import fs from 'node:fs';
import vm from 'node:vm';
import { parsePracticeLevel } from '../practice-mastery.js';

export const root = new URL('../', import.meta.url);
export const src = fs.readFileSync(new URL('index.html', root), 'utf8');
export const coverSrc = fs.readFileSync(new URL('worksheet-cover.js', root), 'utf8');

export const cut = (from, to, what) => {
  const a = src.indexOf(from);
  if (a < 0) throw new Error(what + ': "' + from + '" not found in index.html');
  const b = src.indexOf(to, a + from.length);
  if (b < 0) throw new Error(what + ': end marker not found');
  return src.slice(a, b);
};
// A fresh WorksheetCover, as the app page would load it from `href`.
export function loadCover(href = 'https://polymathlc.github.io/math/index.html') {
  const context = { URL, location: { href } };
  vm.runInNewContext(coverSrc, context);
  return context.WorksheetCover;
}
export const Cover = loadCover();

// The app's cover code (it sits inside the header block) and the document
// builder, with everything they reach out to stubbed.
export const headerBlock = cut('const WS_HEADER_ORG = "Polymath Learning Centre";',
  '// The footer that prints at the bottom LEFT of every sheet', 'header block');
const footerBlock = cut('const WS_COPYRIGHT =', '\n// How much blank working space', 'footer block');
const buildBlock = cut('async function wsBuildDocumentHtml(questions, title, opts) {',
  '\n// ---- Editing the header ON the preview', 'wsBuildDocumentHtml');
const editScriptBlock = cut('const WS_EDIT_HINT =', '// Print and Preview are the SAME document', 'edit script');
const printCssBlock = cut('function wsPrintCss() {', '// 📊 The marks record', 'wsPrintCss');
export const editorBlock = cut('// 🎨 EDIT COVER — the Big M cover\'s own editor (v1.106.0)',
  'window.wsEditCover = wsEditCover;', 'cover editor');

export function app({ cover = Cover, withLevels = true } = {}) {
  return new Function('WorksheetCover', 'parsePracticeLevel', `
    const escapeHtml = s => String(s == null ? "" : s).replace(/[&<>"']/g,
      c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    const WS_COVER_LOGO = "logo.png";
    const WS_LOGO_FALLBACK = "fallback.png";
    const wsHasMcqStub = 0;
    const qrSvgStub = '<svg viewBox="0 0 21 21" xmlns="http://www.w3.org/2000/svg"><rect width="21" height="21" fill="#fff"/><path d="M1 1h7v7H1z"/></svg>';
    const buildQrMap = async () => ({});
    const makeQrSvg = async () => qrSvgStub;
    const wsAppQrHtml = () => "";
    const wsQuestionChunkHtml = (q, n) => '<div class="ws-chunk" data-qid="' + escapeHtml(q.id) + '"><div class="ws-q-no">' + n + '.</div><div class="ws-q-body">' + escapeHtml(q.title || "") + '</div></div>';
    const wsAnswerKeyHtml = () => '<section class="ws-page ws-ak">KEY</section>';
    const wsScoreTableHtml = () => '<section class="ws-page">SCORES</section>';
    const wsHeadEstimateMm = () => 26;
    const pvsPreviewScriptHtml = () => "";
    const cpbPreviewEditHtml = () => "";
    const cpbBuildPsleDocumentHtml = async () => "PSLE";
    let currentUser = { uid: "teacher" };
    ${headerBlock}
    ${footerBlock}
    ${printCssBlock}
    ${editScriptBlock}
    ${buildBlock}
    return { wsCoverHtml, wsCoverPlainHtml, wsCoverIsSheet, wsCoverStyleOf, wsCoverLevel, wsCoverNoteFor,
      wsCoverDefaults, wsCoverSheetCss, wsHeaderHtml, wsBuildDocumentHtml, wsPrintCss, WS_HEADER_ORG, WS_COVER_KEYS, WS_HEADER_MAX };
  `)(cover, withLevels ? parsePracticeLevel : undefined);
}
// The editor's own reducer and its helpers, run without a DOM.
export function editor() {
  return new Function('WorksheetCover', 'parsePracticeLevel', `
    const escapeHtml = s => String(s == null ? "" : s);
    const WS_COVER_LOGO = "logo.png", WS_LOGO_FALLBACK = "fallback.png";
    let wsCoverSettings = null, wsBuilderOrg = null, _wsCoverOwner = null;
    ${headerBlock}
    ${editorBlock}
    return { wsCoverSettingsFrom, wsCoverAutoFor, wsCoverCleanText, wsCoverResetForUser,
      state: () => ({ wsCoverSettings, wsBuilderOrg, _wsCoverOwner }),
      set(s, o) { wsCoverSettings = s; wsBuilderOrg = o; } };
  `)(Cover, parsePracticeLevel);
}

