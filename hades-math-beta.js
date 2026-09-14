import { installHadesDisplay } from './hades-display.js';
import { installHadesLearningParent } from './hades-learning-parent.js?v=2.2.1';
import { selectHadesMathBankRound } from './hades-math-bank.js';
import { questionQualitySignature } from './practice-quality.js';

const CSS = `
.hades-math-beta{position:fixed;inset:0;z-index:100000;display:flex;flex-direction:column;background:#080e1c;color:#eee8d7;font:15px/1.5 system-ui,sans-serif}.hades-math-bar{display:flex;gap:12px;flex-wrap:wrap;align-items:center;padding:10px 18px;border-bottom:1px solid #947b46;background:#11182a}.hades-math-bar h2{margin:0;font:700 20px Georgia,serif;flex:1}.hades-math-bar label{display:flex;gap:8px;align-items:center}.hades-math-bar select,.hades-math-bar button{border:1px solid #b59a61;border-radius:9px;min-height:42px;padding:8px 12px;background:#18243a;color:#fff;font:inherit;cursor:pointer}.hades-math-bar button:focus-visible,.hades-math-bar select:focus-visible{outline:3px solid #71eed7;outline-offset:3px}.hades-math-stage{flex:1;min-height:0;display:grid;place-items:center;overflow:hidden}.hades-math-stage iframe{width:100%;height:100%;border:0;display:block}.hades-math-intro{max-width:650px;padding:26px;text-align:center}.hades-math-intro h3{font:700 clamp(25px,5vw,40px) Georgia,serif;color:#edd59f}.hades-math-intro p{font-size:17px;line-height:1.7;color:#c7cfdf}.hades-math-note{margin:0;padding:5px 18px;color:#bfc8d8;background:#11182a;font-size:12px}@media(max-width:620px){.hades-math-bar{gap:8px;padding:8px}.hades-math-bar h2{font-size:17px;min-width:100%}.hades-math-bar label{flex:1}.hades-math-note{padding:5px 8px}}
`;

// Students use their profile level and the existing authenticated marker.
// Administrator preview remains separate from student learning history.
export function installHadesMathBeta(env) {
  const win = env.window || window, doc = win.document;
  let display = null;
  let overlay = null, frame = null, bridge = null, grade = '', state = null, priorFocus = null;
  const failedImages = new Map();
  const unavailableContent = new Map();
  const memory = new Map();
  const admin = () => env.getUser()?.role === 'admin';
  const allowed = () => !!env.getUser()?.uid && (admin() ? !!env.keysAvailable() : env.getUser()?.role === 'student' && typeof env.gradeQuestion === 'function');
  const identity = () => allowed() && grade ? String(env.getUser().uid) + (admin() ? ':hades-preview:' : ':hades-student:') + (admin() ? grade : env.getLevel()) : '';
  const storageKey = () => 'mathHadesBetaV1:' + identity();
  function loadState() {
    const key = storageKey(), previous = memory.get(key) || {};
    let raw = {}; try { raw = JSON.parse(win.localStorage.getItem(key) || '{}') || {}; } catch (_) {}
    const merge = (field, stamp) => {
      const result = {};
      for (const source of [previous[field], raw[field]]) {
        if (!source || typeof source !== 'object' || Array.isArray(source)) continue;
        for (const [id, value] of Object.entries(source)) {
          if (stamp(value) > (stamp(result[id]) || 0)) Object.defineProperty(result, id, { value, enumerable: true, writable: true, configurable: true });
        }
      }
      return result;
    };
    state = { shown: merge('shown', value => Number(value) || 0),
      progress: merge('progress', value => Date.parse(value?.lastAttemptAt) || 0),
      attempts: merge('attempts', value => Number(value) || 0) };
    // A complete day's rotation survives close/reopen, while storage remains bounded.
    const cutoff = Date.now() - 86400000;
    state.shown = Object.fromEntries(Object.entries(state.shown).filter(([, at]) => Number(at) > cutoff).slice(-2500));
    state.progress = Object.fromEntries(Object.entries(state.progress).slice(-2500));
    state.attempts = Object.fromEntries(Object.entries(state.attempts).filter(([, at]) => Number(at) > cutoff).slice(-2500));
    memory.set(key, state);
  }
  function saveState() { memory.set(storageKey(), state); try { win.localStorage.setItem(storageKey(), JSON.stringify(state)); } catch (_) {} }
  function close() {
    display?.destroy(); display = null;
    bridge?.destroy(); bridge = null; frame?.remove(); frame = null;
    overlay?.remove(); overlay = null; grade = ''; state = null;
    if (priorFocus?.isConnected) priorFocus.focus(); priorFocus = null;
  }
  function questions() {
    if (!allowed() || !grade || !state || (!admin() && grade !== env.getLevel())) return [];
    const bank = env.getBank();
    const unavailable = bank.filter(q => unavailableContent.get(String(q.id)) === questionQualitySignature(q)).map(q => String(q.id));
    return selectHadesMathBankRound({ bank, level: grade,
      progress: admin() ? state.progress : { ...(env.getProgress?.() || {}), ...state.progress }, profile: admin() ? {} : env.getProfile?.() || {}, uid: identity(), served: { ...(admin() ? {} : env.getServed?.() || {}), ...state.shown }, remote: !admin(),
      excludedIds: [...failedImages.keys(), ...unavailable], syllabusById: env.getSyllabus(), isReleased: env.isReleased,
      qualityOptions: q => { const base = env.qualityOptions(q); return { ...base,
        failedImageUrls: [...(base.failedImageUrls || []), ...(failedImages.get(String(q.id)) || [])] }; },
      renderBlocks: env.renderBlocks, renderOption: env.renderOption });
  }
  function start(select, stage) {
    if (!allowed()) { close(); return; }
    if (!admin()) select.value = env.getLevel();
    if (!/^P[1-6]$/.test(select.value)) { select.focus(); return; }
    bridge?.destroy(); frame?.remove(); grade = select.value; loadState(); stage.replaceChildren();
    frame = doc.createElement('iframe'); frame.title = 'Hades Math beta';
    frame.setAttribute('allow', 'autoplay; fullscreen'); frame.setAttribute('referrerpolicy', 'same-origin');
    bridge = installHadesLearningParent({ window: win, subject: 'Math', getFrame: () => frame,
      isAllowed: () => allowed() && (admin() || grade === env.getLevel()), isActive: () => !!overlay?.isConnected, getIdentity: identity,
      getQuestions: questions, gradeQuestion: request => env.gradeQuestion(request),
      markShown: q => { state.shown[q.id] = Date.now(); saveState(); if (!admin()) env.markShown?.(q); },
      recordAnswer: ({ question, correct, round, sessionId }) => {
        if (!allowed() || !state) return;
        const key = sessionId + ':' + round + ':' + question.id;
        if (state.attempts[key]) return;
        state.attempts[key] = Date.now();
        const old = state.progress[question.id] || {};
        state.progress[question.id] = { questionId: question.id, attempts: (Number(old.attempts) || 0) + 1,
          lastMarks: correct ? 1 : 0, lastOutOf: 1, lastVerdict: correct ? 'correct' : 'incorrect',
          lastAttemptAt: new Date().toISOString() };
        saveState();
      },
      onImageFailure: (q, url) => { const urls = failedImages.get(q.id) || new Set(); urls.add(url); failedImages.set(q.id, urls); },
      onQuestionUnavailable: q => { if (q.source) unavailableContent.set(q.id, questionQualitySignature(q.source)); },
      onExit: close });
    const url = new URL('./hades-game.html', win.location.href); url.searchParams.set('learning', '1'); url.searchParams.set('subject', 'math'); url.searchParams.set('v', '2.2.1');
    frame.src = url.href; stage.append(frame); frame.focus();
  }
  function open() {
    if (!allowed()) { env.notify('Sign in and wait for your question bank to load before playing Hades beta.'); return false; }
    close(); priorFocus = doc.activeElement;
    if (!doc.getElementById('hades-math-beta-style')) { const style = doc.createElement('style'); style.id = 'hades-math-beta-style'; style.textContent = CSS; doc.head.append(style); }
    overlay = doc.createElement('section'); overlay.className = 'hades-math-beta'; overlay.setAttribute('role', 'dialog'); overlay.setAttribute('aria-modal', 'true'); overlay.setAttribute('aria-label', 'Hades Math beta');
    overlay.innerHTML = '<header class="hades-math-bar"><h2>Hades · Math <span class="nav-beta">BETA</span></h2><label>Preview level <select aria-label="Hades preview level"><option value="">Choose level</option>'
      + Array.from({ length: 6 }, (_, i) => '<option value="P' + (i + 1) + '">P' + (i + 1) + '</option>').join('')
      + '</select></label><button type="button" data-start>Start preview</button><button type="button" data-fullscreen>Fullscreen</button><button type="button" data-close>Close</button></header>'
      + '<p class="hades-math-note">Admin beta · Five bank questions between chambers · 0/5: tiny consolation, no boon upgrade · 5/5: Heroic Lv 8 boon or +8 Pom levels · 8% life restored per correct answer</p>'
      + '<div class="hades-math-stage"><div class="hades-math-intro"><h3>Fight. Learn. Rise again.</h3><p>Choose a school level to test the complete adventure. Five fresh Math questions pause the action between chambers. Accurate answers heal your hero and improve your next boon.</p><p>This preview uses the question bank, with level, mastery, question quality and repeat checks. Preview progress stays separate from student results.</p></div></div>';
    const select = overlay.querySelector('select'), stage = overlay.querySelector('.hades-math-stage');
    if (!admin()) {
      overlay.querySelector('.hades-math-bar label').firstChild.textContent = 'School level ';
      select.disabled = true;
      overlay.querySelector('[data-start]').textContent = 'Play Hades';
      overlay.querySelector('.hades-math-note').textContent = 'BETA · Five Math questions between chambers · Each correct answer heals 8% life and improves your reward';
      overlay.querySelector('.hades-math-intro').innerHTML = '<h3>Your descent begins.</h3><p>Battle through the Underworld. Answer five questions at your school level to restore life and earn stronger divine powers.</p><p>Your school level and learning progress guide each sanctuary round.</p>';
    }
    const storedLevel = env.getLevel(); if (/^P[1-6]$/.test(storedLevel)) select.value = storedLevel;
    overlay.querySelector('[data-start]').onclick = () => start(select, stage);
    overlay.querySelector('[data-close]').onclick = close;
    select.onchange = () => {
      bridge?.destroy(); bridge = null; frame?.remove(); frame = null; grade = ''; state = null;
      stage.textContent = 'Press Start preview to begin at the selected school level.';
    };
    doc.body.append(overlay);
    display = installHadesDisplay({ container: overlay, button: overlay.querySelector('[data-fullscreen]'), window: win });
    select.focus(); return true;
  }
  return { open, close, getQuestions: questions };
}
