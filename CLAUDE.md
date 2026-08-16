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

## MCQ options are NUMBERED — 1) 2) 3) 4) (v1.30.0)
Never A / B / C / D. `mcqLabel(i)` → `"1)"` (a label sitting inline with the
option text) and `mcqNumber(i)` → `"1"` (the round badges, and prose like
"option 2" where a bracket would read as a typo) are the only two places the
label is made — point new option UI at them rather than formatting an index.
- **The label is DERIVED from the option's position and never stored.**
  `q.correctOption` is the 0-based index it always was, so every MCQ already in
  the bank re-labelled itself with no migration and no document changed. Do not
  introduce a stored label — an answer key written as "B" in a saved doc is
  exactly what this avoids.
- **`functions/index.js` carries its own copy** and the two MUST agree: the
  student reads the option off the screen and then reads the marker's feedback
  about it ("you chose option 4, but the correct answer is 2) 48 m"). A change
  here **needs a functions deploy**, not just a page upload.
- **Every AI prompt lists options the same way** and asks for the option
  *number*, so a generated `expected` / marking guide matches what everyone
  sees. Existing AI-built questions may still hold a letter in `expected` —
  that is teacher-owned free text, and the authoritative answer everywhere is
  `correctOption`.
- The card game's trainer, 🌋 Orbital Siege, ⚔️ Nova Legends and the syllabus
  ▶ Try panel were already numbering their options; this brought the editor,
  practice, worksheets, the answer key, the overview page, vetting and the duel
  into line with them.

## The AI stack
The Science app (`polymathlc/cer`) and this app share ONE Firebase project
(`mathgen--app`), one App Check registration (reCAPTCHA v3) and one AI Logic
backend, so the model calls are byte-for-byte the same requests. Search
`AI ENGINE` for the block:
- **`AI_MODEL` and `AI_THINK_MIN` move TOGETHER, and `_thinkingConfigFor` picks
  the shape PER MODEL** (v1.32.0). How much a model may think is configured
  differently on either side of the 3.x line and the fallback list deliberately
  **spans** it: `gemini-2.5-flash` takes a numeric `thinkingBudget` and 400s on
  a named level; 3.x takes the named level and 400s on the budget. `gemini-3.7-flash`
  then narrowed the named scale again, **dropping the `"minimal"` that 3.5/3.6
  accepted** — it is `low` / `medium` / `high`, so the floor is `AI_THINK_MIN`
  (`"low"`). A level a model does not know is **not a worse answer, it is a
  failed call**, so building one config for the whole request would break
  whichever model it was not written for. The `-1` "think as much as you need"
  budget the regen/checker paths pass maps to `"high"`.
  **`functions/index.js` carries its own copy** of all of this and the two must
  agree — a change there **needs a functions deploy**, not just a page upload —
  and so do `game.html` and the three sibling repos (`cer`, `english`, `anskey`).
- `askGemini` / `askGeminiCached` — plain text calls, primary model only, so
  they take `AI_THINK_MIN` directly rather than going through the per-model shape.
- `askGeminiVision` — text + images/PDF, with model fallback and retry. This is
  the one that spans the 3.x line, so its config is built inside the loop.
- `_parseAIJson` / `_repairAIJson` — the TOLERANT parser. It handles the two
  opposite failures separately, and both are real:
  - **Too little.** `_repairAIJson` escapes unescaped inner quotes and raw
    newlines, closes an unterminated string, drops a dangling half-written key
    and balances brackets, so a TRUNCATED response still parses.
  - **Too much** (v1.29.1). A model asked for JSON often puts something AFTER
    the value — a second object, a stray closing ``` fence the leading-fence
    strip can't reach, a line of commentary — and `JSON.parse` then fails on the
    whole string with *"Unexpected non-whitespace character after JSON"* even
    though the value at the front is fine. `_jsonFirstValueEnd` finds where that
    first value closes (tracking strings, so a `{` inside one can't close it
    early) and the front is parsed alone. Repair cannot fix this: there is
    nothing missing.
  - `parseAIJson` / `repairAIJsonText` is a SECOND copy of the same pair, used by
    the question-building paths. A fix to one belongs in both — and in cer's copy.
- **A caller that can check its own results should not die on a parse error.**
  `sylSuggestLos` reads objective ids straight out of the raw text with a regex
  when the JSON is unreadable: every id is validated against `SYL_LO_BY_ID`
  anyway, so the fallback can only ever yield REAL objectives.
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
- **The questions are MATHS, and there are 1 600 of them** (`TCG_QUIZ`, v1.27.0)
  — MOE syllabus MCQs across every P4, P5 and P6 learning objective, replacing
  the science set this layer was ported in with. Written as two sets of 800,
  twelve to fourteen per objective over the same 129 objectives.
  - **Which POSITION holds the answer is kept level** — 400 each of A/B/C/D per
    set. Nothing shuffles `q.opts` at render (every caller maps it straight into
    buttons in array order), so a lopsided set teaches guessing, not maths. `_tcgQuizPool` **merges** them with
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
  - **📥 Import to bank** (`sylImportQuizToBank`, v1.23.0) writes the whole set
    into the bank as REAL questions, so they reach worksheets, the practice
    queue and the marking record too. Ids are derived from the positional qid
    (`tcgq:<n>` → **`tcgq_<n>`**), which is what makes a second press rewrite
    the same 1 600 documents instead of minting a copy of every one.
    - **The prefix is a DEDUPE KEY in two places**, and both are load-bearing:
      `_tcgBankQuestions` skips `tcgq_<n>` (in the games the built-in row is
      canonical — it carries the rotation's qid and stays `db: false`), and
      `sylQuizFor` drops a row whose twin is in the bank (or every badge on the
      map doubles the moment an admin imports).
    - The answer goes in the ADMIN-ONLY half: `correctOption`, `expected` and
      the worked explanation in `markingGuide`. `blocks` and `options` are
      student-readable, so an explanation showing the working may never be
      written into a block.
    - It calls `saveQuestionDoc` and nothing else — not the editor's
      `notifyQuestionSubscribers` (800 notifications) or `graphOnQuestionSaved`.
  - **A bank question keeps its MCQ on the QUESTION** (`options` +
    `correctOption`), which is what the editor writes — there is no `mcq` block
    type. `correctOption` is a `QUESTION_KEY_FIELD`, so `_tcgBankQuestions`
    only ever yields anything for an admin. That is the point: a student's
    browser must not hold the answer to a question they can be marked on, which
    is why the built-in pool has to stand on its own.
- **6★ and 7★ shoot DIFFERENTLY, not just harder** (`TCG_APEX_PATHS`, v1.24.0).
  Thirteen apex signatures fly one of five paths in 🌋 Orbital Siege — 🌀 an
  orbital ring that circles the body it reaches, 🪃 a boomerang, ↔️ a to-and-fro
  sweep, 🏹 a piercing lance and 🔥 a flamethrower jet.
  - **Keyed on `skillId`, gated on `stars >= 6`.** SkillIds are shared down the
    tiers — a 1★ Servitor Whelp is `aegis` too — so the gate is what stops it
    inheriting the Grand Castellan's weapon. `chorus` and `aegis` are absent on
    purpose: a Field medic and a Wall never call `emsFire`, so a path on either
    would be a tooltip promising something the battlefield never does.
  - **A path is MOTION only.** What a hit does is still the unit's mode, so an
    orbiting poisoner still poisons. `emsApexMove` moves, `emsShotStrike` is the
    one contact function every shot in the game shares.
  - **Two damage multipliers per path, and that is not redundancy.** `dmg` is
    for a mode that stopped at the first body; `dmgMulti` for one that already
    reached past it (`splash` / `pierce` / `chrono` — see `tcgModeMultiHit`).
    Tuned on the single-target number alone, the extra passes left Aeternax and
    Thalgrath measurably WEAKER than before they had a signature. Every apex
    card now sits between 0.96× and 2.00× of its own pre-path output.
  - **One apex projectile per defender at a time** (the `s.owner` gate in the
    fire step). A sweep lives 3.2s; without it a unit firing every second ran
    three at once and a single 7★ held the lane alone.
  - **The burst is spent on first contact** (`s.burst`). An ordinary splash shot
    already bursts once, because it dies there — saying it explicitly is what
    stops a sweep carpet-bombing three lanes on each of its five passes.
  - `laneOff` is a FRACTIONAL lane handed to `emsPositionUnit`, which is how the
    ring swings above and below its host and a flame jet fans out.
  - **⚔️ Nova Legends flies the same five** (`elgFireApex` / `elgApexMove`,
    v1.25.0), off `r.apex` resolved once at `elgStart` — the hero is one card,
    so it cannot change mid-run. The identity table is shared; the GEOMETRY is
    per-game (`ELG_APEX_REACH`, `ELG_ORBIT_*`, `ELG_FLAME_*`), because the two
    games have completely different enemy density and one set of numbers cannot
    serve both. `elgFireApex` takes the hero's multi-shot count — drop it and a
    whole skill node silently stops working for every apex hero.

## ⚔️ Nova Legends — the skill wheel (v1.28.0)
Each role's tree is **~55 nodes over 6 rings**: 21-22 hand-written notables
(`ELG_TREES`, with `ELG_REQS` naming each one's parent) plus `ELG_SMALL_TIERS`
generated passives fanned around them. Three separate things decide whether it
is readable, and the old layout got all three wrong at once:
- **`ELG_SMALL_TIERS` is NOT flat** (`[3,5,7,8,7,4]`). Ring 1 is the shortest
  circle on the wheel and ring 4 is three times longer, so an even split
  crushed the inner rings while the outer ones sat half empty.
- **Node size is a fraction of the MAP, not a fixed px** (`--nsz:
  clamp(26px, 4.6cqw, 48px)` on `.elg-tree-map.radial`, which carries
  `container-type: inline-size`). The ring radii are percentages, so a fixed
  46px node stopped matching them the moment the window narrowed — at the old
  720px cap the radial gap between rings was 45px against a 46px node, so
  every ring overlapped the one outside it however few nodes were on either.
  Everything inside the wheel (heart, icon, level pill) scales off `--nsz`.
- **`ELG_RING`/`ELG_RING0`/`ELG_NODE_SPAN` are the geometry.** `ELG_RING` is
  the radial gap and must stay wider than a node; `ELG_NODE_SPAN` is the width
  one node claims along its ring, turned into an angle per ring by dividing by
  that ring's radius — which is why an outer ring can hold branches closer to
  their parents than an inner one.
- **A node is placed under its PARENT, then pushed apart** — not evenly spaced
  from an arbitrary start, which is what made every link cross its neighbours.
  The ring degrades to even spacing only when it is too full to do better.
- **Generated smalls attach to whichever parent has the FEWEST children.** A
  fixed stride (`(i * 3 + tier) % prev.length`) lands on the same parents
  repeatedly whenever the stride and the ring size share a factor; once a node
  is drawn sitting under its own parent, that piling bunches the branches into
  one quarter of the wheel.
- The map is bounded by `82vh` as well as by width (it is square, so an
  unbounded width pushes the bottom rings off-screen) and never shrinks below
  500px — `.elg-tree-maprail` scrolls instead of letting the rings merge.

### Extra projectiles and chain jumps (v1.28.0)
- **`fx: { shots: n }` adds n projectiles to every auto-attack.** It is in
  `ELG_UNIQUE_FX`, so each node is max level 1 and stacking means taking
  another node. Every role has one; striker and arcanist reach 4 shots total.
- **They fly as a FAN** (`elgFanAngle`), not the old random jitter, which read
  as a misfire past three shots. `ELG_FAN_MAX` caps the spread: wider than
  that and the outer shots miss a single target, so more projectiles would
  mean *less* damage to the thing in front of you.
- **`elgFireApex` uses the same fan** and still takes the multi-shot count —
  drop that argument and every apex hero silently stops firing extras.
- **`fx: { chain: n }` adds jumps to EVERY chain active** (`Arc Cascade`). It
  is read once, in the `a.kind === 'chain'` branch of `elgUseSkill`, as
  `a.jumps + (p.chain | 0)` — added, not multiplied, so one point is worth the
  same on a small chain as on a big one. A new `chain` key also has to be
  declared in the `elgPassives` accumulator or it never totals.

## ⚔️ Nova Legends — the swarm (v1.26.0)
Waves are `ELG_SWARM_COUNT`× the old horde (wave 1 fields **~167**), each body a
third the size of a full enemy, with a tenth the hit points and double the old
scratch for damage. The four numbers move TOGETHER — change one alone and the
mode breaks:
- **A multiplied horde at the old HP is a wave that never ends** (the clear
  gate wants `!enemies.length`), so `ELG_SWARM_HP` came with the count.
- **`ELG_SWARM_COUNT` is fractional (`10 / 3`)** — `elgWaveCount` rounds, so
  never treat its result as an exact product or index anything by it.
- **Enemies have no separation from one another.** They always overlapped;
  with fifty it was invisible. A hundred and sixty bodies all walk to the same
  35px contact ring and STACK inside it, and every body in there swings on its
  own timer. `ELG_SWARM_HITCAP` is a shared bucket of landed hits per second
  for the swarm — bosses and kings sit outside it and always connect. Without
  it the hero dies in the first second of every wave, whatever its stats. The
  bucket is NOT retuned when `ELG_SWARM_DMG` moves: the cap is a rate of hits,
  so doubling the damage doubles incoming DPS, which is the point.
- **`ELG_MAX_ALIVE` caps live bodies, not wave size.** The queue waits. It is
  what bounds the DOM, the frame cost and the O(shots × enemies) sweep — wave
  20 is a thousand strong.
- **A swarm member does not stop a projectile** (the `!e.swarm` term in the
  shot collision). A bolt that stops at the first body is one kill per shot,
  and one kill per shot against a hundred and sixty is a wave that never ends —
  the mode would be unplayable for every hero that has not bought pierce.
  Bosses still catch a shot, so pierce is still worth having.
- **A swarm member wears its own CARD ART** (v1.26.0) — the same keyed cut-out
  a boss gets, via `elgSpriteArt`, sized from `e.r` through `--sz`. What it
  still does NOT get: a health bar (fixed 26px, it would dwarf a 25px enemy),
  a `star7` class (that rule outweighs the swarm's own and would blow a
  rank-and-file body up to legend size), a status skin, or `will-change` (a
  couple of hundred compositor layers is a GPU-memory problem). `e.bar` is
  looked up ONCE at creation for the ones that keep a bar.
  - `.elg-unit.swarm .elg-sprite` must stay **after** `.elg-unit.foe
    .elg-sprite` — the selectors weigh the same, so only order decides it — and
    carries ONE `drop-shadow`, not the chained pair everything else uses.
- **`elgPop` and `elgImpactFx` are rationed** (`ELG_POP_MAX`, `ELG_HITFX_MAX`),
  and swarm deaths skip the popup entirely. Each carries a timer, and a lance
  through forty bodies would otherwise start dozens at once.
- `e.r` is the single source of truth for size: gameplay reads it, and the body
  is drawn at `e.r * ELG_SPRITE_K`. The old sprite sizes were CSS literals that
  only coincidentally matched the radius. `ELG_SPRITE_K` runs a shade over the
  radius on purpose — keyed card art carries empty margin around its silhouette.
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

## 🗑️ The Bin — deleting a question is a MOVE (v1.34.0)
Both delete buttons — 📋 Vetting's `🗑 Delete` (`vetDelete`) and the Question
Bank's `Delete` (`removeQuestion`) — write a bin copy FIRST and only then drop
the question, so a failed write leaves it exactly where it was. `bin*` is the
prefix; the page is `#page-bin`, admin-only, and it restores to wherever the
question was deleted FROM.
- **The bin lives in `users/{uid}/mathVetting`, flagged `binned`**, and that is
  load-bearing rather than a shortcut. `firestore.rules` is shared with the
  Science app, so a new subcollection would fall through to the default deny and
  cost a **whole-project rules deploy** for one feature — the same trap the
  pupil's level dodges by living on `mathLearningProfile`. `mathVetting` is
  already admin-only on BOTH read and write, which a binned question needs: it
  still carries its answer key.
- **A bin entry is a WRAPPER, not a question** — `{ id, binned, deletedAt,
  deletedFrom, deletedBy, question }`. The doc id is `bin__<question id>`, so it
  can never collide with a live vetting draft of the same question, and
  `question.id` is the real id `binRestore` writes back to. `loadVettingList`
  reads the collection ONCE and sorts the two shapes apart — `vettingList` never
  sees a binned entry, so the 📋 badge and ✅ Approve all are unaffected.
- **`deletedFrom` decides where Restore puts it**, never what looks sensible: a
  draft that was still being checked goes back to Vetting (students must not
  meet it because someone un-deleted it), a live question goes back to the bank.
- **The 7 days are swept client-side, by the admin's own load** —
  `binPurgeExpired` runs from `loadVettingList` and again on every
  `renderBinList`. There is no scheduled function, and adding one would be a
  functions deploy for something only the admin can see anyway.
- **An entry with no readable `deletedAt` is never swept.** A date that will not
  parse is not a reason to destroy someone's question; the badge says so and
  🗑 Empty the bin still clears it.
- Restoring calls `saveQuestionDoc` / `saveVettingDoc`, so the public/private
  split is re-applied on the way back in — a restored question is not a
  pre-split doc. Deleting never touched Storage, so diagrams and answer-key
  images survive the round trip untouched.

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
- **⚡ Rapid add and the paper import file themselves** (`sylAutoFileLos`,
  v1.33.0). Both drop questions straight into Vetting without an editor stop, so
  ✨ Suggest is never pressed on them — thirty screenshots used to be thirty
  untagged questions on a map that exists to show what is covered. Auto-filing
  runs the *same* `sylSuggestLos` call as the button, per question, as it lands.
  - **It can never fail its caller.** A question that could not be filed is still
    a question worth keeping, so every path swallows its error and returns `[]`;
    `processRapidJob` starts the call and awaits it at the BOTTOM, so it overlaps
    the diagram crop and upload and costs the job no extra wall-clock.
  - **It never overwrites objectives that are already there** — the flag is
    "unfiled", not "re-file".
  - **The vetting card shows what was filed** (📐 badges, or a *No objective*
    warning beside the existing *No answer key* / *Diagram missing* ones). Filing
    without an editor stop is only safe because the result is visible before
    ✅ Approve; ✎ Edit opens the editor with the tags already in place.
  - **The paper import files AFTER the questions have landed**, not inside the
    import (`rapidAutoFileBatch` → `sylAutoFileMany`, `SYL_AUTOFILE_PAR` at a
    time), re-saving each vetting doc as its own call returns. Forty more AI
    calls must not be something the teacher waits on. `_rapidFilingIds` is what
    lets a card say *Filing…* instead of looking like one that matched nothing.
  - The switch is on the Rapid add pad, default ON, device-local in
    `localStorage`. `openRapidAdd` reads it — **never at module-evaluation
    time**, because the helpers sit in the syllabus block at the END of the
    module (the same temporal-dead-zone trap as `var editorLos`).
- **The map counts the card game's questions too** (v1.22.0). `sylQuizFor(loId)`
  reads `TCG_QUIZ_BY_LO`, and the badge, the sub-strand tally, the *Only gaps*
  filter and the coverage headline all add it to the bank's own — a P4–P6
  objective is never shown as a gap a student can already practise. They are NOT
  bank questions (no marking guide, no answer key, no attempt record), so the
  ▶ Try panel (`sylQuiz*`, its own overlay reusing the `.tcg-quiz-*` skin) only
  teaches the working — and it deliberately **pays nothing**: the faucet lives
  inside the games, never on a page a student can reopen at will.
  - …until an admin presses **📥 Import to bank** in the coverage card, which
    makes them ordinary bank questions and retires the card-game panel for
    every objective it covered. See `sylImportQuizToBank` under Nova Protocol.

## 🩺 Diagnostic tests (v1.29.0)
A diagnostic test **IS a saved worksheet** — same `users/{uid}/mathWorksheets`
collection, same doc shape — carrying two extra fields: `kind: 'diagnostic'` and
`segments: [{ lo, questionIds }]`. That is the whole trick: printing, preview,
✍️ Practise, the ✎ Questions drawer, the overview page and the student's own
📄 My Worksheets list all work on one **unchanged**, and **no `firestore.rules`
deploy is needed** — which matters, because that file is shared with the Science
app. `dg*` is the prefix; the page is `#page-diagnostic`, admin-only.
- **`questionIds` stays the flat, ordered, authoritative list**; `segments` only
  records which objective each id was picked under. Sheet order IS print order,
  so a question's number on the paper is its index in `questionIds` — and those
  same numbers are the report's column headings.
- **`dgTestSegments` resolves drift at READ time**, the way `qLos` does. The ✎
  Questions drawer edits `questionIds` and knows nothing about segments, so an
  id with no segment falls back to the question's own first `los` tag and then
  to an "Unfiled" group. Never try to keep the two lists in sync by hand.
- **The FIRST attempt on each question is the diagnosis** (`dgReduceAttempts`).
  A re-try after the objective has been taught measures the teaching, not what
  the pupil walked in knowing, so it must never rewrite the report; the retry
  count is kept and shown (`2×`).
- **Results come from `users/{uid}/mathPerformanceAttempts`** — the
  server-written record, so a mark cannot be forged — read per student with
  `where('questionId','in', chunk)` in tens. No `orderBy`, so no composite index
  is needed. The games' own `questionAttempts` rows are deliberately NOT read: a
  question answered inside Nova Protocol is practice, not a test sitting.
- **A skipped question counts as a miss on the student's row AND in the class
  average**, because the two numbers are printed side by side and have to agree.
  What a skip must not do is hide — `missing` is reported beside every bar.
  Students who never sat the paper are excluded from the class figures entirely
  and hidden behind the *Show students who haven't sat it* toggle.
- **📊 The marks record** (`wsScoreTableHtml`, v1.31.0) is a page at the back of
  the exported paper: one row per question under the objective it tests, a ✓/✗
  pair, a marks box, an objective subtotal and a grand total. **One mark per
  question, subtotalled per objective** — the same arithmetic `dgReportModel`
  does, so a teacher marking on the grid and a teacher reading the on-screen
  report cannot disagree.
  - `opts.scoreTable` on `wsBuildDocumentHtml` is the ONLY diagnostic-shaped
    thing the worksheet builder knows about, and it is a plain
    `[{ code, text, items: [{ n, title }] }]`. An ordinary worksheet passes
    nothing and the page is not emitted.
  - **The rows are numbered off the questions ACTUALLY PRINTED**
    (`dgScoreSegments` walks the resolved question list, not `questionIds`).
    `wsSavedQuestions` drops an id whose question has left the bank, so
    numbering from the test's own list puts the grid out of step with the paper
    the moment one goes missing.
  - The flag (`includeScoreTable`) is a property of the TEST, so 🖨️ Print from
    📄 My Worksheets honours it too — the same test must not come out
    differently depending on which button was pressed. A test saved before the
    field existed reads a missing flag as ON, like the other extras.
- **`dgReportModel` is the single source of the numbers.** The table, the
  per-objective bars, the written breakdown, the CSV and the printed report are
  all rendered from that one object, so no two of them can disagree.
- The page re-renders from state on every change, so it uses **one delegated
  click/change handler** on `#diagnosticBody` rather than per-element listeners.

## The pupil's level — the cap on which questions the games ask (v1.27.0)
A pupil practises at their own level and everything BELOW it, never above: P4
meets P4, P5 meets P4–P5, P6 meets the whole P4–P6 set. Revision downwards is
the point — a P6 pupil who has forgotten how to round to the nearest 1000
should still be asked.
- **`qWithinStudentLevel` is the whole gate**, and it bites INSIDE the games
  only: both halves of `_tcgQuizPool` (the bank's auto-gradable questions and
  the built-in `TCG_QUIZ` rows) run through it and nothing else does. The 📐
  Syllabus map stays browsable at every level on purpose — reading ahead is not
  being tested on it.
- **`qLevelCeiling` takes the HIGHEST level a question declares**, across its
  own `level` field and the front of every `los` tag. Highest, not lowest: a
  question tagged across two levels is as hard as its hardest objective, and the
  promise is that a P4 pupil never meets P5 content.
- **No level declared → not withheld.** A bank whose questions were never
  levelled would otherwise vanish from the games the moment a pupil chooses a
  level. Admins and guests are never capped either (`studentLevelsAllowed`
  returns null) — a full pool beats a silently empty one.
- **The level is IN the `_tcgBuiltIn` cache key**, not just the uid. Keyed on
  the uid alone, a pupil who changes level mid-session keeps the old pool until
  a reload.
- **It lives on `mathLearningProfile`, not a settings doc of its own.** The
  rules allow-list `users/{uid}/settings/{docId}` writes BY DOCUMENT ID, and
  `firestore.rules` is shared with the Science app — a new id would cost a
  whole-project rules deploy for one string. Mirrored onto
  `studentProfiles/{uid}` so the teacher sees it on the Student Results roster.
- It changes WHICH questions are asked, never how much they pay — see the
  economy rules below — so re-declaring a level cannot be farmed for points.

## ⚡ Rapid add on a PHONE (v1.35.0)
The pad was a paste target and nothing else, so on a phone it was **a box that
could not be filled**: no Ctrl/⌘+V, nothing on the clipboard to paste, nothing
to drag. The camera and the gallery are the way in there.
- **`(pointer: coarse)` is the whole gate**, in the CSS (`.rapid-desk` /
  `.rapid-touch`) and in `rapidTouch()` for the JS half. On a mouse the pad is
  the box it always was — same wording, same paste, same drop, same hover-paste
  — and a touchscreen laptop driven by a trackpad reports a FINE pointer, so it
  keeps the paste pad too.
- **Both routes end at `startRapidJob`**, the ONE queue entry point, so a photo
  is read, cropped, filed on the syllabus map and dropped into Vetting exactly
  as a pasted screenshot is. Do not give the phone its own pipeline.
- **The picker's `value` is cleared BEFORE the files are queued.** An `<input
  type=file>` still holding last time's file fires no `change` for the same
  photo picked twice, so the second tap does nothing at all — a button that
  looks like it works and does not.
- A camera photo needs no shrinking step of its own: `imageFileToInlineMedia`
  already caps every image at 1800px and re-encodes it as JPEG on the way to the
  model, so the phone route inherits that for free.

## The subject switcher — four apps, one student (v1.36.0)

`SUBJECT_APPS` / `subject*` in the module, plus `#subjectSwitch` and the
`.subject-*` CSS. A pill in the **top-right of every page** naming the subject
you are in; click it and the other three are one tap away.

Polymath teaches four subjects through four separate apps — this one,
`polymathlc/english`, `polymathlc/chinese` and `polymathlc/cer` — and they share
a Firebase project and a sign-in and **nothing else**: four question banks, four
sets of progress, four syllabuses. A pupil taught three of them had one bookmark
per subject on a school Chromebook, and the subject they never bookmarked is the
one they stopped using.

- **It is a LINK, not a router.** Four `<a href>`s and no JS navigation: each app
  stays reachable at its own URL exactly as before, nothing here redirects or
  gates anything, and middle-click / open-in-new-tab behave the way a pupil
  expects — which a `location.href =` handler would quietly break.
- **The URLs are RELATIVE (`../cer/`), and that is load-bearing.** The four are
  GitHub Pages project sites — `polymathlc.github.io/{math,english,chinese,cer}`
  — so they are sibling folders on one host, and a relative hop resolves there,
  on a local checkout with the four repos side by side, and on a custom domain
  later, without this file ever naming a host. An absolute
  `https://polymathlc.github.io/…` works perfectly until the centre moves to a
  domain of its own and then sends every pupil back to the old one.
- **Science lives at `../cer/`** — the repo name, not the subject name.
  `../science/` is a 404 for the whole school at once and reads as a link
  somebody forgot to finish.
- **`SUBJECT_KEY` says which of the four THIS app is**, and it is the ONE line
  that differs between the repos — the rest of the block is identical in all
  four, so a fix copies straight across (the same reason the Nova Protocol
  identifiers are unchanged from cer's). `subjectCurrent()` falls back to the
  first entry, so a `SUBJECT_KEY` naming nothing does not throw: it labels this
  app as the wrong subject and offers a link back to where you already are.
- **The menu is built from `SUBJECT_APPS`**, never written out in the markup, and
  the current subject is shown and MARKED rather than dropped — a menu that
  silently omits where you are leaves a pupil unable to tell which app they are
  looking at. It is a `<div>` rather than an `<a>`, because a link back to the
  page you are on reloads the app and loses whatever was half-typed.
- **It is turned on from `enterApp`**, the one function every signed-in path goes
  through, and hidden until then or it floats over the login card.
- **`z-index: 150` sits in a deliberate gap**: above the sidebar (100) and the
  sticky `.topbar` (40) so it is always reachable, below every `.overlay` (300)
  so a dialog covers it, and below the two announcement banners (1200/1201),
  which are top-centre and unaffected.
- **`.topbar` gives up its right-hand corner** (`padding-right`), because that is
  where the hero chip, the bell, the flag inbox and the AI badge live and the
  switcher floats over them. The block is fixed to the viewport rather than
  dropped into `.topbar-actions` so that it stays byte-for-byte the one the
  other three portals carry — they have no global top bar at all.
- Run **`node tools/subject-level-tests.mjs`** after touching any of it.

## ⚡ Rapid add: the level a BATCH is filed at (v1.36.0)

`rapidLevel` / `setRapidLevel` / `rapidApplyLevel` / `rapidLevelOptions`, and the
`#rapidLevelWrap` picker above the pad. An author working through a pile of
screenshots is nearly always working through ONE year's paper, and the AI was
choosing the level one screenshot at a time from the wording alone.

- **`q.level` IS a real field here**, so the batch level is simply STAMPED on —
  unlike the three language portals, where a level is read off the topic and the
  same feature has to narrow the topic list instead.
- **It is stamped BEFORE `sylAutoFileLos` runs**, not after. That call scopes its
  objective search to `q.level`, so setting the level first is what makes the
  objectives come back from the year the author asked for.
- **`rapidApplyLevel` also filters `q.los`**, and that half is not decoration:
  **`qLevelCeiling` takes the MAX** over the level field and the front of every
  objective tag, so one P6 objective on a question stamped P5 makes it a P6
  question again — while the level badge on the vetting card still reads P5.
  Objectives at or BELOW the level are all kept, because revision downwards is
  the point; an id that names no level is kept too, since `qLos` already
  validates ids and this must not become a second, blunter filter.
- **It runs TWICE on the rapid path** — once before the filing call and once on
  what came back — because the filing is what writes `los`.
- **The paper import shares the pad, so it shares the level.** `handleBulkPaper`
  captures it once before the read, tells the model the paper is that year, and
  stamps every question; `rapidAutoFileBatch` takes the level too and re-applies
  the ceiling guard inside its per-question callback, before the re-save.
- **The level is captured as the file is QUEUED** (`startRapidJob`), never read
  inside the job: the pad stays open while the AI reads, and an author who
  queues a P3 paper and switches the picker for the next one must not have the
  first land at P4 because it finished second.
- **It lives in `sessionStorage`** — a batch is one sitting, so it survives a
  reload mid-pile and is back to "Any level" in a new tab or tomorrow. A level
  that persisted for a week would be the one an author set last Tuesday and
  never noticed again.
- **The options come from `SYL_LEVELS`**, read at OPEN time and never at module
  evaluation — the syllabus block sits at the END of the module, the same
  temporal-dead-zone trap as `var editorLos` and `sylAutoFileOn`.
- The chosen level is named back in the status line and on the job card.
- Run **`node tools/subject-level-tests.mjs`** after touching any of it.

## Clearing the vetting list — deleting several at once (v1.37.0)

`_vetSelected` / `vetDeleteMany` / `vetRenderBulkBar` (search `DELETING SEVERAL
VETTING QUESTIONS AT ONCE`), plus the tick box on every vetting card, the
`#vetBulkBar` above the list and **🗑 Delete all** beside ✅ Approve all.

The vetting list is where a whole BAD BATCH lands — forty screenshots off the
wrong paper, a paper imported twice, a set the model made a mess of. Clearing
that one card at a time is forty confirm dialogs, which is why it gets left
instead, and a vetting list nobody clears is one nobody reads either.

- **Every route goes through `vetDelete`'s rule: delete is a MOVE TO THE BIN.**
  `binMove(q, "vetting")` is awaited BEFORE the vetting doc goes, so a failed
  write leaves the question exactly where it was and nothing here can destroy
  work. That order is what makes a one-press "delete all" safe to offer at all —
  the undo is the 🗑️ Bin for 7 days, and `deletedFrom: "vetting"` is what puts
  each one back in **vetting** rather than serving an unchecked draft to
  students from the bank.
- **The deletes are one at a time and AWAITED.** A batch has to be able to
  report that four of forty would not go, and those four stay on screen rather
  than being taken off a list they are still in.
- **The selection is PRUNED on every render** (`vetPruneSelection`). A ticked
  question approved into the bank, edited away or deleted singly is not a thing
  to delete; doing it in the renderer rather than in each of those paths is what
  covers a path added later.
- **The ticks live in a `Set` of ids, never as a flag on the question** — those
  objects are replaced wholesale by every re-read, which would drop the tick.
- **`.vet-pick` must set `appearance: auto`** — Tailwind's preflight sets it to
  `none`, which leaves an invisible white square where the control should be.
- Run **`node tools/vetting-bulk-delete-tests.mjs`** after touching any of it.

## "You may already have this one" — the duplicate warning (v1.38.0)

`_dupFind` / `_vetTagDuplicate` / `checkEditorDuplicate` / `dupWatchKick`
(search `YOU MAY ALREADY HAVE THIS ONE`), plus the `#dupWarnBanner` at the top
of the question editor and the ⚠ badge on a vetting card.

One matcher, asked from three places: the badge on a Rapid add / paper import
card, the live banner in the editor, and the confirm on 💾 Save. It is a
**prompt to look, never a verdict** — nothing here ever refuses to save.

- **It used to be asked from the two Rapid paths and nowhere else.** A question
  typed into the editor by hand was checked against nothing at all, so the only
  way to notice a duplicate was to remember one.
- **The banner is LIVE and the SAVE asks as well.** The banner sits at the top
  of a long editor and the Save button is at the bottom, so the confirm is the
  backstop. The listener is **ONE delegated pair on `#page-create`** rather than
  a binding per field — the editor rebuilds its own DOM continuously — and
  `renderEditorBlocks` kicks it too, because a builder writing blocks
  programmatically fires no `input` event.
- **The VETTING LIST is searched as well as the bank**, and every message names
  which through `_dupWhereLabel`. The commonest duplicate of all is the same
  screenshot read twice in one sitting, and both copies are then in vetting.
- **`_vetSim` is JACCARD — shared over the UNION — not containment.** It was
  `shared / Math.min(a.size, b.size)`, which cannot tell a duplicate from a
  shared stem: two questions built on one scenario have almost the whole of the
  shorter inside the longer, so containment scored them ~100% however
  differently they ended. Survivable while the only consumer was a badge;
  not once it raises a banner and a confirm on every save. It is also the
  measure the other three portals use, so all four now agree.
- **`_vetTokens` counts the TITLE and the MCQ OPTIONS, not just the body.** A
  math question is mostly digits and stock words, and two questions sharing a
  stem but offering different choices are not the same question.
- **The banner's 👁 button ASKS before it leaves** (`_dupOpenOriginal`). The
  banner is on screen while the author is mid-compose, so opening the twin
  replaces the draft they are looking at.
- Run **`node tools/duplicate-warning-tests.mjs`** after touching any of it.

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
- After touching **the subject switcher** or **⚡ Rapid add's batch level**, run
  `node tools/subject-level-tests.mjs`. It is the only harness in this repo and
  it reads the module out of `index.html` as text. Both failures are silent: a
  url pointing at the wrong folder does not error, it loads the WRONG subject's
  app (and `../science/` is a 404 — the folder is `cer`), while an absolute url
  is the same failure delayed until the centre moves domain. On the level side,
  `qLevelCeiling` takes the MAX over `q.level` and every objective tag, so a
  question stamped P5 that keeps one P6 objective is a P6 question wearing a P5
  badge.
- After touching **the vetting list's bulk delete** (`_vetSelected`,
  `vetDeleteMany`, `vetPruneSelection`, `vetRenderBulkBar`, `vetDeleteAll`,
  `vetDeleteSelected`), run `node tools/vetting-bulk-delete-tests.mjs`. One
  press can clear the whole list, and the guarantee that makes that safe — the
  bin copy written and awaited BEFORE the vetting doc is deleted, filed as
  coming from vetting so Restore puts it back there — fails silently in every
  direction. Reverse the order and a failed write has destroyed the question;
  file it as coming from the bank and an undo serves an unchecked draft to
  students.
- After touching **the duplicate warning** (`_dupFind`, `_vetSim`,
  `_vetTokens`, `_vetTagDuplicate`, `checkEditorDuplicate`, `dupWatchKick`,
  `DUP_MIN_SIM`), run `node tools/duplicate-warning-tests.mjs`. It fails
  silently in both directions and the app works perfectly either way: too tight
  and it never fires, too loose and it fires on every save — which makes it a
  warning nobody reads, and the real duplicate goes through behind it. The
  harness pins both, plus the title and the options counting, and the vetting
  list being searched at all.
- Commit messages and pushed artifacts must not contain the model identifier.
