# CLAUDE.md

Guidance for Claude when working in this repo.

## Apps
- `index.html` — **"Math Practice"**, the whole product in one file: question authoring
  (block editor, AI build-from-screenshot, image crop / touch-up, vetting → bank),
  student practice, worksheets, an RPG layer (hero, Dungeon, leaderboard) and
  **🌌 Nova Protocol**, the collectible card game. Markup, CSS and the entire
  application JavaScript live in this one file (one `<script type="module">`).
  - Functions referenced from inline `onclick`/`on*` handlers MUST be assigned to
    `window` near the bottom of the module — the module has its own scope.
- `game.html` — the standalone RPG preview.
- `functions/` — Cloud Functions (marking, hints, XP, admin claims). Anything a
  student could otherwise forge lives here, not in the browser.
- `firestore.rules` / `storage.rules` — **the Firebase project is SHARED with the
  Science app (`polymathlc/cer`)**. Deploying either file replaces the rules for the
  WHOLE project; paste the Science app's rules into the marked section first.

## Versioning convention — applies to EVERY change (do this every time)
1. **Bump the version.** Update `const APP_VERSION = 'vX.Y.Z'` (search `APP_VERSION`).
   Patch bump for fixes / small tweaks, minor bump for new features.
2. **Keep it visible.** The version renders in the sidebar footer for admins only.
   This is how the user confirms the latest build is actually deployed.
3. **Report it.** When summarising an update in chat, always state the new version
   number (e.g., "Shipped in **v1.12.0**").

The whole point: the user checks the version shown in the app's sidebar against the
number reported in chat to know whether the upload/deploy went through.

## Design convention — breathing space (applies to EVERY UI you build/touch)
- Give elements room to breathe: generous, consistent padding inside cards/banners,
  clear vertical spacing between title → description → meta → buttons, comfortable
  line-height. Never cram content edge-to-edge or stack lines tightly.
- Cards/banners are rounded rectangles constrained to a sensible max-width and
  centred — not a dense, full-bleed block.
- When the user says something is "too big/thick/messy", the fix is usually *more*
  whitespace and a tighter width, not shrinking fonts until it's cramped.
- Keep the spacing scale consistent across the whole app.

## The AI stack
The Science app (`polymathlc/cer`) and this app share ONE Firebase project
(`mathgen--app`), one App Check registration (reCAPTCHA v3) and one AI Logic
backend, so the model calls are byte-for-byte the same requests. Search
`AI ENGINE` for the block:
- `askGemini` / `askGeminiCached` — plain text calls. `thinkingLevel: "minimal"`;
  Gemini 3.x rejects the older numeric `thinkingBudget` with 400 INVALID_ARGUMENT.
- `askGeminiVision` — text + images/PDF, with model fallback and retry.
- `_parseAIJson` / `_repairAIJson` — the TOLERANT parser. `_repairAIJson` escapes
  unescaped inner quotes and raw newlines, closes an unterminated string, drops a
  dangling half-written key and balances brackets, so a TRUNCATED response still
  parses. Keep it in step with cer's copy.
- `generateImageDataUrlGemini` — image generation / editing (a reference PNG makes
  it an edit).
- The optional **ChatGPT engine** (`openAiActive`, `askOpenAI`,
  `openAiGenerateImageDataUrl`) is admin-only and device-local: the key lives in
  `localStorage` on one machine. When active it goes FIRST and falls back to Gemini
  on any failure, so a student with no key is never affected.

## 🌌 Nova Protocol — the trading card game
Ported whole from the Science app's Realm of Embers and re-themed as science
fiction (v1.12.0). `TCG_*` / `tcg*`, `DUEL_*` / `duel*`, `EMS_*` / `ems*`,
`ELG_*` / `elg*`. **The identifiers are deliberately unchanged from cer's** — that
is what lets a fix in one app be copied to the other. Only the *world* differs.

- **The world is an INTERGALACTIC WAR.** The **Nexus** is the lattice of jump-gates
  a machine at the galactic core — the **Singularity** — built and then went quiet
  inside; its broken reactor scattered **ignition cores** across a hundred thousand
  worlds. The alien **Xenocline Dominion** woke on the roads first; the human
  **Aegis Vanguard** arrived ninety generations late; Book Three is their war and
  the **Titan Accord** that ended it. Modes: 🎴 **Nexus Duel** (Hearthstone-style
  card duel), 🌋 **Orbital Siege** (lane defence), ⚔️ **Nova Legends** (arena
  survival), the Battle Arena and the infinite **Derelict**. The lore is 📜 **The
  Nexus Codex** (`TCG_LORE_SAGAS`) — 4 books, 31 illustrated pages.
  - **A chapter names its cast by exact card name** and the prose calls the same
    characters by their bare personal name, so a rename has to move both. The
    chapter `id` is the art slot (`lore:<saga>:<id>`) — rewrite a chapter around it,
    never rename it.
- **Two expansions, 101 cards.** `TCG_GEN1` (c001–c051, 51 xeno war-forms, *The
  Prime Index · Xenocline Dominion*) then `TCG_GEN2` (c052–c101, 50 defenders of
  humanity, *Aegis Vanguard · Rise of Humanity*). **Ids are positional and live in
  every student's save** (`s.cards`, `merges`, `levels`, `team`, the `tcgArt`
  overrides) — a new set must be APPENDED and gen 1 flattened first, or every
  collection re-points at different cards.
- **The top two tiers are KAIJU SCALE and the prompts say so.** 6★ is a
  kaiju-class titan, 7★ is a galaxy-scale apex power — three star-eating
  cybernetic void-drakes in gen 1 (`Solvorax Prime`, `Vhorrukhaal`, `Aeternax`)
  and the two kilometre-tall Titan Engines humanity built to stand in front of
  them (`Ferrovax Omega`, `Cryovast Aegis`). `_tcgTierMood` carries the scale and
  `TCG_ART_WORLD` demands a city, a fleet or a star in frame to measure it by —
  without something beside it, a model draws a big animal, not a titan.
  - **Say "void-drake", never "dragon".** `TCG_FANTASY_PROMPT_RE` flags the word
    and it drags the whole picture medieval; "cybernetic void-drake" gets the
    star-eater without the castle.
  - **An art note is a 6th column on a gen 1 row / an 8th on a gen 2 row**, and on
    a CREATURE it REPLACES the `TCG_EM_WORD` phrase (on a human it is added to the
    class look). That is how a row says which drake, at what size, eating what.
  - **`cls: 'titan'` on a gen 2 row sets `human: false`** so the Titan Engines go
    down the creature branch of `tcgCardArtPrompt`. Leave it off and the generator
    draws a person in armour instead of a war-engine.
- **Every name in the card tables is written for the ART GENERATOR.** Designations
  and strain names for the xenos (`Vexil-9`, `Sludgeform-04`, `Cogitor-Zero`), rank
  plus call-sign for the humans (`Castellan`, `Marshal`, `Archmagos`, `Arch-Psion`)
  — never a fantasy honorific, never an earthly animal. A name is half the prompt,
  so a "Sir" or a "Magus" in the table puts chainmail in the picture no matter what
  `TCG_ART_WORLD` says afterwards. The same rule binds `TCG_SKILLS`, `TCG_ARTIFACTS`
  and `DUEL_SPELLS`, which also feed prompts.
- **The Nexus Codex names its cast by NAME** (`cards: [...]` per chapter, resolved
  against `TCG_CARDS` by `tcgLoreCards`). Rename or retire a card and its chip
  silently disappears from the story page — so a rename has to be carried into
  `TCG_LORE_SAGAS` too. Chapter `id`s are the lore ART SLOT (`lore:<saga>:<id>`)
  and must never be renamed with the character.
- **Adding a skill `kind` touches FIVE places** and `tcgStats` **throws** if you miss
  one: `TCG_SKILLS`, `TCG_ROLE_MODS[kind]` (the one that throws), the arena
  resolver's chain in `_tcgAct`, `ELG_ROLE_BY_KIND` and `EMS_SKILL_FX[kind]`.
  `DUEL_ABILITIES` needs a row too — it fails silently to `strike` instead.
- **The questions are MATHS, and there are 800 of them** (`TCG_QUIZ`, v1.22.0) —
  MOE syllabus MCQs across every P4, P5 and P6 learning objective, replacing the
  science set this layer was ported in with. `_tcgQuizPool` **merges** them with
  the bank's own auto-gradable questions rather than using them as a fallback: a
  bank holding a dozen approved MCQs must not narrow the trainer, 🌋 Orbital
  Siege and ⚔️ Nova Legends back down to those dozen on repeat.
  - **Ids are POSITIONAL** — `tcgq:<index>`, stamped on by the `TCG_QUIZ_BY_LO`
    build loop — and they live in the per-student rotation (`tcgTrainServed_*`)
    and the daily points ledger (`ptsSeen`). APPEND rows and edit them in place;
    re-ordering or splicing one out of the middle re-points every stamp.
  - **Every row carries `lo`**, the syllabus objective id it assesses. That is
    what files it on the 📐 Syllabus page (`TCG_QUIZ_BY_LO` → `sylQuizFor`), and
    what caps it to the pupil's level through `qWithinStudentLevel`, the same
    gate the bank's questions go through. A row with no `lo` reaches no page.
  - They stay `db: false`, so they never write a `questionAttempts` row or a
    teacher-visible mark — a built-in question is practice, not an attempt.
- **The theme is ONE class on `<body>`.** `navigateTo` toggles `nova-protocol` and
  everything else is CSS: the tokens (`--surface` / `--border` / `--text` /
  `--primary`) are redefined inside `#page-tcg`, which re-skins every `.tcg-*`
  surface that was already using them. Don't fork a component to theme it.
  - **`body.nova-protocol .main` must keep `position: relative; z-index: 1`.** The
    galaxy and the starfield are `position: fixed` layers at `z-index: 0`, and a
    fixed positioned element paints ABOVE ordinary in-flow content — without that
    rule the tab bar and every other unpositioned element sits under the sky.
- **The art direction is SCIENCE FICTION, and every prompt says so** (v1.14.0).
  `TCG_ART_WORLD` is one paragraph — starships, powered armour of the
  space-marine kind, energy sabres, alien species and war-machines; **no**
  wizards, knights, dragons, castles, wands or robes — and **every** art prompt
  opens with it: card art, avatars, artifacts, hero portraits, the logo, set
  banners, pack frames, both FX sets and the lore plates. Naming the genre once
  is not enough: "science fiction" and "warrior" in the same prompt still
  produces a man in chainmail, so the fragment also gives each fantasy shape its
  replacement (a staff is a beam-lance, a robe is a hooded void-cloak over an
  exo-frame). Point new prompts at the fragment; never restate it.
  - `TCG_EM_WORD` is where a card's BODY comes from — the emoji is the only clue
    the row carries — so every entry is a xeno-form or a construct. An emoji with
    no entry falls through to "an unclassified alien war-form", never to a beast.
  - **`TCG_FANTASY_PROMPT_RE` is checked on the way out**, beside the
    chequerboard guard in `tcgGenArtImage`, and warns rather than refuses: it
    points at the table that needs rewording. The world fragment names the banned
    words in order to forbid them, so a scan must cut it out before testing the
    rest.
  - **♻️ Reset ALL art** (`tcgResetAllArt`) clears the whole `overrides` map so
    the set can be redrawn under the current direction. Press it *before* a
    redraw whenever the DIRECTION changes — redrawing alone leaves work drawn
    under the old direction sitting in the slots beside the new.
- **Nothing that stands on nothing may keep a background** — battle avatars,
  element projectile frames, booster-pack frames, artifacts, hero portraits and the
  logo. Enforced at GENERATION: `_screenRules` briefs one flat named chroma wall and
  `_screenKeyOut` keys exactly that hue. **Never ask a model for a transparent
  background** — it has no alpha channel, so it paints the word as a chequerboard or
  a plate. `TCG_BANNED_PROMPT_RE` flags the words. 🧼 Remove background is the
  manual override.
- **✏️ Touch up is the SAME editor as the question adder's.** `_annotOpenSrc(src,
  target, title)` opens it on any picture; `target` says where **Apply** writes it
  back — `{ blockId }` for a question's image block, `{ artSlot }` for a game art
  slot. Add a destination by adding a branch in `applyAnnotTool`, never by forking
  the tool.
  - **🗑️ Delete cuts pixels OUT, so the editor's canvas can be genuinely
    see-through** — 🪄 Wand the background, press Delete, Apply, and the slot gets
    a PNG with a transparent background, which is the manual twin of 🧼 Remove
    background. `_annot.hasAlpha` is the flag every "put something behind it" site
    asks first (`_annotScanAlpha` on the way in, set true by `annotSelDelete`):
    the hole Move leaves and the ground `_annotXformPreview` lays down are paper
    **white** on a scan and **another hole** on a cut-out. Paint white
    unconditionally anywhere in this editor and one rotate silently fills in
    every cut. The checkerboard under `#annotCanvas` is what makes the
    transparency visible, and its tile is sized from `_annotUpdateTransform` so
    it stays put on screen at any zoom.

## 🎬 Video amendments
A recorded explanation goes stale the moment a question is corrected, so the fix
is drawn OVER the film (`vo*`, `q.videoOverlays`) rather than cut into it: a note
or a scribble at a given second, at a given spot, for a given number of seconds.
- **Positions are FRACTIONS of the frame, never pixels.** The same video is shown
  in the practice panel, the worksheet overview and the share card at three
  sizes, and one authoring pass has to be right in all of them.
- **Overlays are gated exactly like the video** — `videoOverlays` is in
  `QUESTION_KEY_FIELDS`, because "the answer here should be 24" *is* an answer.
  That means students only get them via the marking / shared-solutions Cloud
  Functions, so `cleanVideoOverlays` in `functions/index.js` has to stay in step
  with `voClean` — **a change here needs a functions deploy**, not just a page
  upload.
- **`videoExplanationFrameHtml` is the ONLY place video markup is built**, and
  every caller must run `voBindIn(container)` after its `innerHTML` or the layer
  never starts. A video with no amendments emits no canvas and no frame id, so
  the well-tested embed is byte-for-byte what it always was.
- **An iframe never reports its playhead.** `kind: 'video'` (Dropbox, direct
  files) is exact. Google Drive is the one case worth fighting for: when a video
  HAS amendments the frame tries Drive's `directUrl` stream first and falls back
  to the `/preview` iframe on `error`, and an iframe player gets the ⏱ stopwatch
  the student starts by hand. Videos with no amendments never take that path.

## 📖 The worksheet overview page — 🎬 Solutions & videos
`?ws=<id>&owner=<uid>` **is** the page: `openWorksheetOverview` puts that address
in the bar (and `navigateTo` takes it out again on the way to any other page), so
the link a teacher shares, the sheet's QR and a refresh all land in the same
place. `wvLoadSolutions` gates it — an admin's own bank already holds the private
half, a student goes through `getWorksheetSolutions` and gets nothing when the
owner turned sharing off.
- **▶ The reel (`wvReel*`) is a PLAYLIST, not a concatenation.** The files live on
  Dropbox and Drive; nothing in a browser splices them without re-encoding. One
  player, one video at a time, advanced on `ended`.
- **Only a real `<video>` reports that it ended**, so only `kind: 'video'` hands
  over by itself — an embedded player (YouTube, a Drive preview) needs the Next
  button, which is why it is always on show.
- **A chip carries the question's number on the SHEET, not its index in the
  reel** — the numbers have to agree with the page you scroll to. Questions with
  no video are named in one line rather than silently missing.
- `wvReelShow` checks `_wvReel.idx === i` before advancing: a superseded player
  firing `ended` late must not drag a student back to where they were.

## 📝 Worksheets — the ✎ Questions drawer
A saved worksheet is an ordered **list of question ids**, so `wsEditOverlay`
(`wse*`) edits that list and nothing else. Both its columns share one row
component, `wseRowHtml` — expand to read the question, ✎ to edit it.
- **The drawer is not admin-only.** A student can own a worksheet and open it, so
  `wsePreviewHtml` gates the answer, the marking guide, the answer key and every
  ✎ button behind `canManageQuestions()`. The blocks themselves are the public
  half of the bank and are safe to show.
- **✎ Edit leaves the list and changes the QUESTION**, everywhere it is used —
  the one thing in this drawer that does. `qEditReturn` is what brings the
  teacher back: `wseEditQuestion` sets it *after* `loadQuestionIntoEditor`,
  because every entry into the editor clears it, and `qEditLeave` (Save **and**
  Cancel) consumes it. Clearing it on the way in is what stops a later,
  unrelated save bouncing to a worksheet someone abandoned an hour ago.

## 📐 The syllabus map
`MOE_SYLLABUS` is the **Content** column of the MOE Primary Mathematics Syllabus
(Primary 1 to 6, 2021), read out of the published PDF: 6 levels → strands →
sub-strands → topics → **240 learning objectives**. **Foundation is deliberately
excluded** — this app serves the standard syllabus, so a Foundation objective in
the tree would be one nobody here could ever fill.
- **A question carries `q.los`**, an array of objective ids. An id is
  `<level>.<sub-strand key>.<code>` — `P5.FR.2.6`. **Those ids live in the bank**,
  so the level letters, the sub-strand keys (`WN FR MON DEC PCT RAT RS ALG MEA AV
  GEO DRI DA`) and the codes are permanent: re-key or renumber anything and every
  tag points at a different objective. Append, never renumber.
- `SYL_LOS` / `SYL_LO_BY_ID` are built once at load and are what the page, both
  pickers, the search and the AI prompt read — nothing else walks the tree.
  `qLos(q)` drops a tag whose objective no longer exists at READ time rather than
  deleting it, so a mistaken edit to the tree loses nothing.
- **Two pickers, and they are not the same job.** `loPickerOverlay` picks the
  OBJECTIVES for one question (in the editor; nothing is written until Apply).
  `qTagOverlay` picks the QUESTIONS for one objective (on the Syllabus page; each
  tick writes immediately, because a teacher filing thirty questions should not
  have to remember to save).
- **Tagging writes `los` and nothing else** (`sylSaveLos` → `setDoc(…, { los },
  { merge: true })` on the public half). The answer key lives in its own document
  and is never in hand on that page, so re-saving the whole question there could
  only ever lose something. `los` is not in `QUESTION_KEY_FIELDS`, so it stays in
  the student-readable doc — which is what lets a student browse the map.
- **`var editorLos`, not `let`** — the syllabus block sits at the END of the
  module and `resetEditor()` runs during module evaluation, so a `let` would still
  be in its temporal dead zone and the whole app would fail to start.
- ✨ **Suggest** sends the question plus the objectives for its own level (the
  whole syllabus when it has no level) and reads the reply through
  `_parseAIJson`, so a truncated response still parses. Ids the model invents are
  dropped; the result is re-sorted into syllabus order.
- **The map counts the card game's questions too** (v1.22.0). `sylQuizFor(loId)`
  reads `TCG_QUIZ_BY_LO`, and the badge, the sub-strand tally, the *Only gaps*
  filter and the coverage headline all add it to the bank's own — a P4–P6
  objective is never shown as a gap a student can already practise. They are NOT
  bank questions (no marking guide, no answer key, no attempt record), so the
  ▶ Try panel (`sylQuiz*`, its own overlay reusing the `.tcg-quiz-*` skin) only
  teaches the working — and it deliberately **pays nothing**: the faucet lives
  inside the games, never on a page a student can reopen at will.

## The game economy — every faucet is gated
🪙 points buy booster packs, so **no repeatable button may ever pay**. Every faucet
is behind one of: answering a question (`rpgAwardGameQuestion`, which has the
rushed-answer and wrong-run guards), a game credit (`_spendCredit` — 1 per 5
questions answered), or a once-a-day claim.
- **A duel pays nothing for winning.** `rpgAwardGameQuestion` inside `duelAnswer` is
  the only faucet there, which is what keeps the mode free to play.
- **⚡ The energy bar** pays a free 💠 Gold Pack every `ENERGY_PER_PACK` (50) correct
  answers, and fills only from an answer that already paid out. The pack is banked
  UNOPENED and claimed on the Packs tab — the reveal ceremony must not fire on top
  of the question the student is mid-way through.
- **No question inside a game is timed for reward.** Speed is measured only for the
  rushed-answer guard. Pressure comes from the game state (the horde walking on the
  gate), never from a clock on the stem.

## The leaderboards
`gameLeaderboard/{uid}`, one document per student, written with `{ merge: true }`
from two different code paths — **keep the merge or one path wipes the other's
fields**. Tabs: 📅 This Month / 🗓️ Last Month / ⭐ All-Time (XP, server-written),
🌌 **Nova** (questions answered correctly INSIDE the games, top 6) and 🎴 **Duel**
(duel questions × accuracy **counted twice**, top 3).
- **Squaring accuracy is what stops a board being won on volume.** Re-check
  900-questions-at-35% against 400-at-88% if you retune `SCORE_ACC_WEIGHT`.
- **Never rank a board on a currency-derived stat** — points buy things, so such a
  board can be climbed without answering anything.
- Adding a prize board means touching `rpgBoardXp`, `RPG_BOARD_TOP_N`,
  `rpgPrizeBadge`, `rpgRowClass` and `BOARD_BAN_SCOPES`, or bans and prizes leak.
- **A leaderboard is a promise: announce a change before it lands.** The prize lines
  on the Leaderboard page state the current rule in one sentence — keep them in step
  with the code.

## House rules
- After editing `index.html`, validate the module: extract the
  `<script type="module">` body to a `.mjs` file and run `node --check` on it.
- Commit messages and pushed artifacts must not contain the model identifier.
