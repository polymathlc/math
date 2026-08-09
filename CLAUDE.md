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

- **The world.** The Nexus, computed by one spark called the **Singularity**. Modes:
  🎴 **Nexus Duel** (Hearthstone-style card duel), 🌋 **Orbital Siege** (lane
  defence), ⚔️ **Nova Legends** (arena survival), the Battle Arena and the infinite
  **Derelict**. The lore is 📜 **The Nexus Codex** (`TCG_LORE_SAGAS`) — 4 books,
  31 illustrated pages.
- **Two expansions, 101 cards.** `TCG_GEN1` (c001–c051, 51 xeno war-forms, *The
  Prime Index · Xenocline Dominion*) then `TCG_GEN2` (c052–c101, 50 human heroes,
  *Aegis Vanguard · Rise of Humanity*). **Ids are positional and live in every
  student's save** (`s.cards`, `merges`, `levels`, `team`, the `tcgArt` overrides)
  — a new set must be APPENDED and gen 1 flattened first, or every collection
  re-points at different cards.
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
