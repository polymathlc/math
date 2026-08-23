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
  - **`askOpenAi` is the whole family's BACKUP AI, and it is here because of
    where a key can safely live.** Every Polymath app answers through Gemini
    on the shared `mathgen--app` project, so when that project's billing cap
    is hit they all die at once and identically. ChatGPT is the second engine;
    the Science portal, the Scan app and the three other portals each carry a
    browser-side `askOpenAI` reading a key out of `localStorage`, which
    rescues the teacher's laptop and **no student's phone** — and a key cannot
    be shipped in those pages instead, because they are public static sites
    served to every student's browser. So the key is a Firebase secret
    (`OPENAI_API_KEY`) behind this callable, and a browser only ever asks.
    - **It needs `firebase functions:secrets:set OPENAI_API_KEY` and a deploy**
      before it answers. Until then it returns `failed-precondition`, named
      precisely so the calling app can tell "not set up yet" (a deploy) from
      "the key was refused" (a bill) — the apps print those as different
      sentences, and one that reported both as *AI error* would send the
      teacher looking in the wrong place.
    - **The guards are all here rather than in any page, because it is the
      centre's own OpenAI bill**: sign-in required, the model chosen
      SERVER-side (a client that could name a model could name an expensive
      one), the same image caps the marking call uses, `MIN_OPENAI_INTERVAL_MS`
      between calls and `DAILY_OPENAI_CAP` a day per account.
    - **`reserveOpenAiSlot` uses its OWN fields** (`openAiDay` / `openAiCount`
      / `lastOpenAiAt`) on the server stats document. Sharing `dailyKey` /
      `dailyCount` with the marking cap would let a scanned paper spend a
      student's marking allowance, and they would be told they had finished
      for the day by a limit they had never reached.
    - The gap between calls is deliberately small (a scan sends its pages up
      in batches, back to back, and a 15-second interval would break a run of
      one paper); the DAILY cap is what actually bounds the bill.
    - `polymathlc/scan` calls it through `askOpenAiServer` — **ship a change to
      the argument shape in both repos together.**
- `firestore.rules` / `storage.rules` — **the Firebase project is SHARED with the
  Science app (`polymathlc/cer`)**. Deploying either file replaces the rules for the
  WHOLE project; paste the Science app's rules into the marked section first.
  - They also carry the rules for the **Scan app** (`polymathlc/scan`), which has no
    rules file of its own — one shared file, one source of truth. Three blocks:
    `users/{uid}/scanMistakes` (a student's own mistake book), `scanPapers`
    (a worksheet made out of it, read by `cer/mistakes.html`) and
    `scan-mistakes/{uid}/…` in Storage (the cropped figures).
  - **`mail/{mailId}` is no longer admin-only on create**, and the widening is
    deliberately narrow: `mailToSelf()` lets a signed-in user enqueue a message
    **only to the address on their own token**, with no other fields on the
    document. That is what lets the Scan app email a student the link to their
    own worksheet without a backend. Reading the queue back stays admin-only —
    it is every address the centre has ever written to. Do not relax the `to`
    comparison: taking it off the token and onto the document is what would turn
    this into an open relay.

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

## 🎯 The siege squad — three per role, chosen before the gate opens (v1.49.0)

`EMS_SQUAD_PER_ROLE` / `emsSquadClean` / `emsSquadDefault` / `emsSquadSaved` /
`emsSquadStore` / `emsOpenSquad` / `emsLaunch` (search `CHOOSING A SQUAD`), plus
the `.ems-pick-*` CSS and `siege.squad` on the save.

A collection past 200 cards turned 🌋 Orbital Siege's deck column into a scroll:
six shelves, forty tiles on some of them, and a wave walking on the gate while
the student hunts for the medic they meant to deploy. Shelving by role was the
first half of that fix; this is the second — **a run is fought with a SQUAD
chosen before it starts**, at most three from each role, so the deck is a dozen
tiles that all fit without scrolling.

- **It is a FILTER on the deck and nothing else.** Every unit is still owned,
  still levels, still fights in the arena, a duel and ⚔️ Nova Legends. What the
  squad decides is which of them are on the bench for this siege.
- **The cap is PER ROLE, never a flat total.** "Three of each" is a line-up a
  student can reason about; a flat eighteen is the same hunt with a shorter
  list, and it lets somebody field eighteen attackers and no medic — which is
  the mess this exists to end, wearing a tidier heading.
- **`emsSquadClean` is the ONE place the cap and the ownership test are
  applied**, and every read goes through it: the saved squad, the pick screen's
  ⚔️ Start, and the run itself. A card merged away, sold, or carried in from
  another account's save drops out rather than sitting on the bench as a tile
  that costs mana and deploys nothing.
- **A squad is never EMPTY.** The deck column is the only way to deploy
  anything, so an empty one is a game that renders perfectly and cannot be
  played. `emsSquadDefault` fields the best three of every role (by
  `tcgCardPower`, so BOTH progression tracks count), `emsSquadSaved` falls back
  to it, and `emsRenderDeck` falls back to it again.
- **The squad is REMEMBERED** on `siege.squad`, so a student who has settled on
  a line-up is not made to re-pick it every run. `tcgHydrateState` is a
  **WHITELIST**, so that field has to stay in its `siege` literal or it is
  dropped on the next load — and it validates OWNERSHIP only: the per-role cap
  is applied on the way out, because the `EMS_*` constants sit far below the
  hydrator (the same temporal-dead-zone trap as `var editorLos`).
- **The pick screen is its own overlay, shown BEFORE the battlefield exists.**
  The field, the FX preload and the wave timer all start on ⚔️ Start
  (`emsLaunch`, which is the old `emsOpen` body), so nothing is running behind a
  student who is still choosing.
- **A full role REFUSES a fourth rather than swapping one out.** Which of the
  three to drop is the student's decision, and a silent replacement takes a unit
  off the bench they never asked to lose.
- It reuses the deck column's own tiles (`.ems-role` / `.ems-role-grid` /
  `.ems-card`) rather than forking a second set, so a unit looks the same being
  chosen as it does being deployed — and it carries the same 👁, which is how a
  student reads what a unit does in the Siege before committing to it.
- ↻ **Play again** keeps the squad (it is the same fight); 🎴 **Change squad** on
  the result card goes back to the picker, because a siege that just fell is
  exactly when a student knows what they wanted instead.
- **`polymathlc/cer` carries the same block** for 🌋 Ember Siege — keep the two
  in step.
- Run **`node tools/siege-squad-tests.mjs`** after touching any of it.

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

## 🎨 Nova Protocol's art store is this app's OWN document (v1.47.0)

`TCG_ART_DOC` / `TCG_ART_DOC_LEGACY` / `TCG_ART_RESET_CHUNK` / `_tcgArtLoadFailed`
/ `tcgArtLegacyOffer` / `tcgArtAdoptLegacy` (search `NOVA PROTOCOL'S ART LIVES IN
ITS OWN DOCUMENT`).

Every picture in the game — card art, `:av` battle avatars, `fx:` / `dfx:` frames,
`pk:` pack frames, `arti:`, `hero:`, `logo:`, `set:`, `lore:` — is one key in ONE
Firestore document's `overrides` map. That map is the index; the pictures
themselves are in Storage.

**This app and the Science app (`polymathlc/cer`) share one Firebase project, one
sign-in and therefore one admin uid** — and Nova Protocol is a port of that app's
Realm of Embers with the identifiers *deliberately* kept identical, which is what
lets a fix in one be copied to the other. So both games number their cards
`c001`, `c002`, …, both name a battle avatar `<id>:av` — and both used to write
`users/{uid}/settings/tcgArt`.

One map, two games, the same keys. **It cost a complete set of Realm of Embers
artwork**: every Nova picture drawn replaced the Ember picture in the same slot,
and one press of ♻️ Reset ALL art blanked both games at once.

- **The document name is a CONSTANT and it is this app's own.** `TCG_ART_DOC` is
  `novaArt`; the Science app keeps `tcgArt`. The identifiers stay shared on
  purpose — only the STORE is split, so a fix still copies across.
- **`TCG_ART_DOC_LEGACY` is READ-ONLY, always.** The Science app is still serving
  from that document, so writing to it or deleting out of it would repeat the
  original fault from the other direction. It is read exactly once, to offer its
  contents back.
- **The old map is OFFERED, never adopted silently.** Nothing anywhere records
  which game a given `c001` belonged to, and the likeliest answer is the wrong one
  — Realm of Embers was drawn there first and in far greater quantity. So the
  Card Art tab says what the old document holds and the admin decides.
  `tcgArtAdoptLegacy` **copies** into empty slots only, and never touches the
  source.
- **A reset is SURGICAL — `deleteField()` under `{ merge: true }`, chunked.**
  Never `setDoc({ overrides: {} })`: a whole-document overwrite takes out every
  field the document holds, *including any this app did not put there*, and that
  one call is what destroyed the other game's collection. The document is this
  app's own now; the write stays surgical anyway, because being blunt is what
  made the damage possible.
- **A failed read is NOT an empty store.** An empty map looks exactly like a
  wipe, so `tcgLoadArt` records `_tcgArtLoadFailed` and ♻️ Reset ALL art refuses
  to run on top of one — otherwise it clears a set the app cannot currently see.
- **The pictures were never in danger.** This app uploads to `mathImages/` and
  the Science app to its own `cer-images/`, so the two have always been separate
  in Storage. What collided was the index, which is why a wiped map is
  recoverable at all — see the Science app's 🛟 Art safety panel.
- Run **`node tools/art-store-tests.mjs`** after touching any of it.

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

## ✍️ The printed answer fields — one per part, never on the next page (v1.43.0)

`wsQuestionParts` / `wsAnswerBlankHtml` / `wsBodyEstimateMm` / `wsAnswerRowsMm`
/ `wsWorkingSpaceMm`, plus `.ws-answer-box` and `.ws-answer-parts` in
`wsPrintCss`.

Two faults on one printed question, and both of them silent — the sheet prints
either way and nobody finds out until a class is sitting in front of it.

- **The working area is asked for in MILLIMETRES and a page only has so many.**
  The allowance is sized from the model answer, so a long marking guide asked
  for the maximum however tall the question already was; the chunk then
  outgrew the page, `break-inside: avoid` could not be honoured, and the
  browser broke at the last opportunity — stranding the *Answer: ____* line at
  the top of the next page under nothing at all.
  - **`WS_PAGE_WORK_MM` is what one A4 page actually holds** after the page
    margins and the band the repeating copyright `<tfoot>` reserves.
    `wsWorkingSpaceMm` now takes the SMALLER of what the answer wants and what
    the page has left once `wsBodyEstimateMm` and `wsAnswerRowsMm` have taken
    theirs.
  - **`wsBodyEstimateMm` deliberately OVER-estimates**, reserving every picture
    the full `WS_IMG_MM` its max-height allows. Reserving too much costs a
    little blank space; reserving too little puts the answer field on the next
    page, which is the bug.
  - **`.ws-answer-box` is `break-inside: avoid`** — the last line of defence. A
    question that still cannot fit takes its working AND its answer rows to the
    next page together, rather than leaving the answer behind.
- **A question in parts gets an answer field PER PART**, labelled *Answer (a):*
  … Three answers cannot be written on one line.
  - **The parts are READ OFF the wording** (`wsQuestionParts`), never stored:
    nothing about a question records how many parts it has, and a teacher
    editing the wording must not have to update a count somewhere else.
  - **A marker only counts at the START of a line and only in sequence from
    (a)**, with at least two of them. "…the area (a) in cm² and (b) in m²" is
    prose; a lone (a) is one answer, which the plain blank already gives.
  - **`wsQuestionTextLines` puts the line breaks back before reading.**
    `stripHtml` goes through `textContent`, which welds
    `(a) …</p><p>(b) …` into one line — and then no marker is at the start of
    anything.
  - An MCQ and an annotation question never get part fields: their options and
    their diagram ARE the answer space.
- Run **`node tools/worksheet-answer-fields-tests.mjs`** after touching any of it.

### …and NO question may exceed one page (v1.44.1)

`wsHeadEstimateMm` / `wsPageRoomMm` / `wsEffectiveImgMm` / `WS_IMG_MIN_MM`, and
`--ws-img-mm` on `.ws-chunk`.

v1.43.0 sized the working area against a whole page. The first question on a
sheet does not GET a whole page — the sheet header prints above it — and three
smaller under-estimates on top of that were enough to push a question with a
diagram over, stranding its *Answer (a):* / *Answer (b):* fields alone on page 2.

- **Only question 1 has less than a page**, and it is the one that kept
  spilling. Every other question starts on a fresh page's share, because
  `.ws-chunk` refuses to break and the browser moves a question that will not
  fit whole. So `reserveMm` is passed to the FIRST chunk only, and it is
  **measured from what the header actually holds** (`wsHeadEstimateMm`) rather
  than guessed at once: the Name / Class / Date line is only there when the
  teacher asked for it, the QR only on a sheet that has an overview page.
- **`WS_BODY_LINE_MM` is the LINE height, not the font size.** It said 5.8mm —
  the bare 12pt — while `.ws-q-body` sets `line-height: 1.55`, so the real line
  is 6.6mm and every line of every question was under-reserved by three
  quarters of a millimetre. `WS_BODY_CHARS` came down to 80 for the same
  reason. Both numbers err UPWARDS on purpose: over-reserving costs a little
  blank space, under-reserving is the bug.
- **The order things give way in is the whole rule**, and it is the order a
  teacher would choose: the **working space** goes first, down to
  `WS_WORK_MIN_MM` — that is what "let the diagram eat into the working space"
  means, the picture takes its room out of the blank area rather than making
  the page longer — and only when there is no blank area left to eat does the
  **diagram** shrink (`wsEffectiveImgMm` → `--ws-img-mm` on the chunk). The
  wording and the answer rows never give way, because those are the question.
- **`WS_IMG_MIN_MM` (45) is where the one-page promise gives way, deliberately
  and last.** Below it a diagram stops being readable, and an unreadable
  diagram is worse than a slightly long question.
- **An ordinary question carries no inline style at all** and prints at the CSS
  cap exactly as it always did — the variable is only written when the picture
  has really had to give way. `.ws-chunk-annot .ws-q-body img` still outweighs
  it, and an annotation question is skipped anyway: it has no working area to
  trade.
- Rounding the picture height DOWN hands a millimetre or so back to the
  student's blank area. That is the right way round; don't "fix" it into the
  picture.

## 🔍 Answer key cross-check — TWO engines at once (v1.42.0)

`akc*` (search `ANSWER KEY CROSS-CHECK`), plus `#akcOverlay`, the `#akcBankBar`
on the Question Bank and 🔍 Check answer keys on a 📄 My Worksheets card.

✅ **Check with AI** in the editor asks ONE model whether a question hangs
together. This asks **two** — ChatGPT (`gpt-5.6-sol` by default) and Gemini
(`AI_REGEN_MODEL`) — to solve every question from scratch **simultaneously**,
and reports their two answers beside the teacher's own key, with a
recommendation. Admin-only; the answer key is admin-only to begin with.
**The Science app (`polymathlc/cer`) carries the same block — keep the two in
step.** Its copy differs in exactly two places, both deliberate: the answer
lives in BLOCKS there rather than on the question, and a science answer is
usually a sentence, so its worded comparison leans on each engine's own
`statedAnswerVerdict` instead of on numbers.

- **The two calls are `Promise.all`ed and neither model is shown the other's
  answer.** That independence is the only reason an agreement between them
  means anything — chain them and the second is just agreeing with the first.
- **`skipOpenAi: true` on the Gemini call is load-bearing.** `askGeminiVision`
  routes through ChatGPT whenever the sidebar's engine toggle says so, so
  without it both columns are the same model twice: they would then agree
  constantly and the report would read as a clean bill of health.
- **Both engines get the identical prompt**, built once per question. A
  comparison between two models asked different questions compares the
  questions.
- **It READS ONLY — no path here writes a question.** Every row ends in a
  recommendation. A model that is confidently wrong must not be able to
  overwrite a teacher's key; ✎ Edit opens the question in the editor instead.
- **`akcCompare` is PLAIN CODE, never a third AI call.** The same two answers
  must always produce the same advice. Its statuses: `agree` (green),
  `guide` (answer right, working flagged), `split`, `no-key`, `single`,
  `key-wrong` and `split-none` (both red), `failed`.
- **`compare.tone` is the ONLY thing that colours, tallies and sorts a row.**
  One status can carry two colours — a lone engine agreeing with the key is
  amber, a lone engine contradicting it is red — so a lookup table keyed on
  `status` would be a second opinion about the first.
- **`akcAnswersAgree` answers what a TEACHER would.** Numbers first, then
  units through `AKC_UNIT_CANON`: "24" and "24 m" agree (one side left the unit
  off), "24 m" and "24 cm" do **not**. Too loose and every row is green, which
  certifies wrong keys; too tight and every row is amber, which is a report
  nobody reads. An MCQ is compared by **option number**, never by the words.
- **The bank's window is a filter ON TOP of what the bank is showing**, so the
  count on the button is the set the eye can see. An undated question (saved
  before `createdAt` existed) can only ever appear under "any time".
- **Which rows are expanded is state (`_akc.open`), not a class on a div** —
  the report re-renders on every result that lands, so a panel opened mid-run
  would snap shut under the teacher reading it.
- Guards: `AKC_PAR` questions in flight, `AKC_MAX` per run, a confirm over
  `AKC_CONFIRM_OVER`, ⏹ Stop honoured between questions, and closing the
  overlay stops the run rather than leaving model calls billing away behind it.
- Run **`node tools/answer-key-check-tests.mjs`** after touching any of it.

## One ChatGPT key for all four portals (v1.44.0)

`AI_ENGINE_STORE` / `AI_ENGINE_STORE_LEGACY` (search `ONE KEY, ALL FOUR
PORTALS`).

The four apps are sibling folders on ONE GitHub Pages origin
(`polymathlc.github.io/{math,english,chinese,cer}`), so they have always shared
a localStorage — they were simply writing **different slots** in it, which meant
the same ChatGPT key had to be pasted once per subject.

- **It is not a convenience.** 🔍 Answer key cross-check needs ChatGPT and
  Gemini BOTH live to be worth running, so an app missing the key runs it with
  one column and reports "no second opinion" forever — which looks exactly like
  a working feature rather than a missing key.
- **The slots are `sq_ai_engine` / `sq_openai_key` / `sq_openai_model` /
  `sq_openai_image_model` in ALL FOUR apps** — the Science app's original
  names, because that is where the key already was. A tidier subject-neutral
  name would read better and would sign every app out on the day it shipped.
- **`AI_ENGINE_STORE_LEGACY` is this app's own old `mq_` slots, adopted ONCE
  and only into an EMPTY slot.** A key saved here is a real key somebody
  pasted, but the shared one may be newer, and overwriting it would sign the
  other three apps out in order to rescue this one.
- **The key is NEVER in this repo.** These are public, static sites served to
  every student's browser, so a key committed here is a key handed to the whole
  school. It lives in the admin's own browser; the harness fails on an
  `sk-`-shaped string anywhere in `index.html`.
- Run **`node tools/answer-key-check-tests.mjs`** after touching any of it.

## ✏️ The sheet header is retyped ON the preview (v1.41.0)

`wsHeadFieldHtml` / `wsHeaderEditScript` / `wsPreviewHeaderSave` /
`wsHeaderOrgOf` / `WS_HEADER_ORG` (search `EDITING THE SHEET HEADER FROM ITS OWN
PREVIEW`), plus the `.ws-edit` / `.ws-editnote` rules in `wsPrintCss`.

👁️ Preview and 🖨️ Print open the sheet as it will print — which is exactly
where a wrong title is noticed, and the only way to fix it was to go back, find
the sheet, and rebuild it. **The title and the line under it are now typed on
the preview itself** and saved to the worksheet.

- **Two fields and no others** — `title` (the worksheet doc's own `title`) and
  `org` (`ws.headerOrg`, the line under it). `wsPreviewHeaderSave` is a door
  another window calls through, so it names the two fields it accepts rather
  than writing whatever key arrives.
- **The cover and the sheet header carry the SAME field names**, because they
  print the same two values twice; one edit updates every element wearing the
  name. Rename one and the document silently prints two different titles.
- **The preview is a window this app WROTE** (`window.open` + `document.write`),
  so it is same-origin and calls back through `window.opener` — nothing is
  posted anywhere and the parent tab does the write, as its own signed-in user.
  `wsPreviewHeaderSave` is therefore on `window` for the same reason the inline
  handlers are. With the app tab closed the edit still stands in the preview
  (it is in the DOM, so it prints) and the bar says it was NOT saved.
- **Ownership is re-checked on the way in**, never trusted from the flag the
  preview was built with: a student can open the teacher's sheet from the same
  My Worksheets list, and a preview opened an hour ago is not proof of anything.
  A non-owner's preview is the plain header it always was.
- **An emptied line is not a missing one.** `headerOrg: ""` is a teacher who
  cleared it and prints nothing there; a sheet saved before the field existed
  has no field and prints `WS_HEADER_ORG`. `wsHeaderOrgOf` keeps them apart —
  `|| DEFAULT` would bring a cleared line back on the next print. An emptied
  TITLE does fall back, because a headless sheet is nobody's intention.
- **A failed write puts the in-memory copy back** and the preview reverts with
  it, so the tab and the database cannot sit there disagreeing.
- A diagnostic **is** a saved worksheet, so `dgPrintTest` hands the same two
  fields over and gets the same editable header.
- Run **`node tools/worksheet-header-tests.mjs`** after touching any of it.

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
- **It must be a direct child of `<body>`, and that is the one thing that broke
  it.** From v1.36.0 to v1.45.0 the markup sat INSIDE `#tcgLoreBook` — the Nova
  Protocol lore-book overlay, which is `display:none` until a pupil opens the
  Codex — because that overlay was never closed and the browser auto-closed it
  at `</body>`, swallowing everything appended after it. So the pill was in the
  file, wore the right label, listed the right four urls, passed every case in
  the harness, and **no pupil ever saw it**: the other three portals were
  connected and this one silently was not. Being `position: fixed` makes it
  worse rather than better — a fixed element still inherits an ancestor's
  `display: none`, so `subjectShow()` setting display on the WRAP could never
  bring it back. The same unclosed div had already swallowed `#appVersion`, the
  badge that tells the user whether a deploy went through, which is why nothing
  on screen ever hinted at any of it. **Anything appended near `</body>` goes
  after the last overlay closes, never inside one**, and the harness now parses
  the markup and pins both ids at depth 0.
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

### ⇄ Side by side — the comparison the warning was missing (vv1.40.0)

`dupCompare` / `_dupFindQuestion` / `_dupCompareSide` / `_dupDiffHtml`
(search `SIDE BY SIDE`), plus the `#dupCompareOverlay` in `index.html`.

The banner said *"this looks 90% like Sharing a Sum of Money"* and offered
exactly ONE button: **open** that question. Which replaces the draft — so the
only way to answer the question the banner asks (*are these two the same?*) was
to throw away the thing being compared, go and look, and then build it again
from memory. Nobody does that, so the warning got clicked past, which makes it
a warning that costs attention and buys nothing.

The two questions now go up **next to each other**: what is being written on the
left, what is already filed on the right.

- **Both sides go through the SAME renderer** — `renderQuestionBodyPreviewHtml`,
  split out of `renderQuestionPreviewHtml` so it takes the question OBJECT
  rather than an id, because the left-hand column is a draft that has never been
  saved and has no id to look up. A second renderer written for this view would
  be free to drift, and a comparison whose two halves are drawn by different
  code can flatter one of them.
- **Nothing is written and nothing is replaced by opening it.** It is a read.
  The one destructive action — loading the original into the editor — lives in
  the overlay's foot, still behind `dupOpenOriginal`'s confirm, and is now
  reached only by somebody who has actually seen what they are about to lose. It
  is **hidden** when the left-hand side is a saved question (a vetting card),
  because there is no draft to lose there.
- **`mineId` names the LEFT-hand question.** A vetting card passes its own id;
  the editor banner passes nothing, and the draft is read from
  `_dupEditorQuestion()`. That third argument to `_dupSeeOriginalBtn` used to be
  a boolean `guard` — same position, different meaning, so check both call sites
  if you change it.
- **It says what differs IN WORDS** (`_dupDiffHtml`, through the matcher's own
  `_dupTokenSet`). Two near-identical questions are near-identical to LOOK at,
  which is the whole problem: the eye slides straight over the one changed
  number. The words appearing on one side only are the fastest honest answer to
  "so what did they change?", and a diff computed on any other footing would
  contradict the percentage printed above it. When both lists are empty it says
  *word for word the same*, which is the strongest thing it can tell an author.
- Run **`node tools/duplicate-warning-tests.mjs`** after touching any of it —
  the direction of the difference strip is the silent one: reversed, the two
  lists read perfectly and tell the author the opposite of the truth.

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

## 📊 The Student Usage Tracker (v1.45.0)

`USAGE_MODES` / `usageMode` / `sutNormalise` / `sutPerfMode` / `sutVerdict` /
`sutVisible` / `sutByMode` / `sutRender` / `sutExportCsv` (search `THE STUDENT
USAGE TRACKER`), plus the `.sut-*` CSS and `#studentActivityOverlay`. Opened by
clicking a pupil on the Student Results roster. **All four portals carry this
block — keep them in step**; what genuinely differs here is the merge below.

Every question one pupil has completed, the result they got, and the **mode**
they did it in. The old overlay listed the rows and nothing else, so a teacher
looking at three hundred submissions could not answer either of the two
questions they actually have — *what has this child been doing?* and *how are
they getting on in it?*

- **It merges TWO attempt sources, and that is the whole reason it exists.**
  `users/{uid}/mathPerformanceAttempts` is the server-written record of marked
  work, and this overlay used to read it **alone** — while 🌌 Nova Protocol's
  trainer, duel and Siege write to `questionAttempts`. So three whole modes were
  **invisible**: the collection was being written and nothing on the teacher's
  side ever read it, and a pupil could answer hundreds of questions in the games
  with this page showing none of them. `sutNormalise` folds both into one row
  shape and everything after it works on that shape only.
- **The merge does not pretend the two are the same.** A marked attempt carries
  the AI's read of HOW it was solved (skill scores, strengths, a learning note)
  and a game answer is one tap on an MCQ — so the expandable method analysis
  stays on the rows that have it, and `src` records which collection a row came
  from, including in the CSV.
- **The GAP is measured across BOTH.** A pupil alternating between practice and
  a game has gaps neither collection can see on its own, so measuring inside one
  source under-reports rapid-fire answering exactly where it is most likely.
- **`sutStamp` must never hand a raw `Date` to `Date.parse`.** That coerces
  through `toString()`, which **drops the milliseconds**, so two answers a few
  hundred ms apart read as simultaneous — the gap measured wrong in precisely
  the case it exists for. A Firestore `Timestamp`, an ISO string and a `Date`
  all arrive here.
- **`sutPerfMode` reads the finer fields when they are there and falls back to
  `source` when they are not.** `source` says where the QUESTION came from
  (bank / generated / starter), which is a different axis; `via` and
  `practiceMode` — added to the attempt doc in `functions/index.js` — say what
  the pupil was actually doing. Every attempt written before that shipped still
  reads as *Marked practice*: **the log must never depend on a Cloud Functions
  deploy having happened.** (Deploy the functions to start getting 📸 Photo
  marking and ✨ AI practice told apart on NEW attempts.)
- **The SERVER's verdict wins** over a credit recomputed here — it is what the
  marker actually decided, and overruling it would let the tracker and the
  pupil's own result screen disagree about the same attempt. A game answer has
  no verdict, so it falls back to its credit at the same ≥0.95 floor the Cloud
  Function's stats use.
- **`USAGE_MODES` is the ONE place a raw mode becomes words**, and a mode with
  **no entry still shows** as its own raw string: an unlabelled mode is a
  missing label, but a question dropped out of the log because nobody wrote a
  label for its mode is a **missing question**, and two unlabelled modes merged
  into one row is a breakdown that lies.
- **`sutVisible()` is the ONE place the window is decided** — the count, the
  table, the breakdown and the CSV all read it, so an export can never hold rows
  the table did not show.
- **Which rows are EXPANDED is state (`_sut.open`), not a class on a div** — the
  body is replaced wholesale on every filter change, so a panel opened by hand
  would snap shut under the teacher reading it. Same reason the answer-key
  cross-check keeps `_akc.open`.
- The marked record is capped at `SUT_PERF_LIMIT` (400) and says so; the game
  log is not, because it is a single-field query with nothing to page.
- It is **READ-ONLY**. Nothing in the block writes anything anywhere.
- Run **`node tools/usage-tracker-tests.mjs`** after touching any of it.

### This dashboard shows THIS subject's work only (v1.46.0)

`ATTEMPTS_COL` / `ATTEMPTS_COL_LEGACY` / `sutLegacyGameRows` / `logGameAttempt`
(search `THE GAME ATTEMPT LOG LIVES IN THIS APP'S OWN COLLECTION`).

The tracker read a **top-level `questionAttempts`** — and so did the Science app
(`polymathlc/cer`), in the same Firebase project, under the same uid. 🌌 Nova
Protocol is a re-themed port of Realm of Embers with the identifiers
deliberately kept identical, so both apps wrote the same mode strings into it:
`tcg-train`, `tcg-duel`, `tcg-siege`.

So a pupil taught both subjects had their **Ember Siege answers listed here as
Orbital Siege**, and their Nova Protocol answers listed on the Science
dashboard as Ember Siege. It is the failure this app's own naming rules exist
to prevent, and it is completely silent: the overlay opens, the breakdown
tallies, the CSV exports, and the numbers are plausible.

- **`ATTEMPTS_COL` is `mathQuestionAttempts`**, named ONCE at the top of the
  module beside `ADMIN_EMAILS`, and every write and the read go through it —
  never a literal. That is the same rule the three language portals follow
  (`enQuestionAttempts` / `zhQuestionAttempts`), and it is why they were never
  affected. **It needs the `firestore.rules` block that ships with it**, or the
  collection fails closed: reads come back empty, writes are denied, and
  nothing on screen explains why. See the DEPLOY WARNING at the top of that
  file — it is shared with the Science app.
- **`mathPerformanceAttempts` was never affected**, because it lives under
  `users/{uid}` and is server-written. Only the GAME half was shared, which is
  also why the bug survived: the bigger, more-read half of the merge was
  correct all along.
- **`ATTEMPTS_COL_LEGACY` is a MIGRATION SHIM, not a third source.** It reads
  the old collection once more so a pupil's Nova Protocol history is not lost
  to the rename, and **everything it returns goes through `sutLegacyGameRows`
  before it is believed**. Delete both when that history stops mattering.
- **`sutLegacyGameRows` attributes a legacy row by WHOSE BANK its question is
  in**, because nothing in the row itself says. A Science question id is never
  in the Maths bank. The test is **one-directional on purpose**: a Maths
  question deleted since is dropped rather than shown, since putting another
  subject's work on this dashboard is the failure being fixed and a missing old
  row is not. A row that cannot be attributed is never guessed at.
- **A failed legacy read is not a failed load**, the same way the game read
  already was not: it only means the history from before the split is
  unavailable, and everything since is unaffected.
- Rows the Science app already holds are **not** rewritten. They stop arriving
  from this app; the ones written before v1.46.0 stay in its collection, where
  its own tracker marks them *removed from the bank*.

### Every mode must actually log (v1.46.0)

The tracker is only as good as the weakest game: a mode that pays points and
writes no attempt is a mode whose questions the teacher cannot see at all, and
nothing on any screen says so.

- **`logGameAttempt(q, correct, mode, ms)` is the ONE door.** Three
  near-identical copies had already been written — the trainer's inline block,
  `_duelLogAttempt` and `_emsLogAttempt` — and a fourth was simply missed:
  **⚔️ Nova Legends called `rpgAwardGameQuestion` and logged nothing**, so a
  pupil could answer two hundred questions inside it and this page showed none
  of them, while `USAGE_MODES` carried a "Nova Legends" label for a mode
  nothing ever wrote. Adding a game is a call here plus a row in `USAGE_MODES`,
  never a fourth copy.
- It is **fire-and-forget** — a failed log must never interrupt a game
  mid-answer — and the local rotation stamp (`_gqMark`) comes FIRST, so a
  question answered offline still stops being re-served.
- A built-in `TCG_QUIZ` row is never logged (`q.db && q.id`): it is not the
  teacher's question and writes no teacher-visible mark anywhere else either.

## The clone stamp shows what it is about to stamp (vv1.39.0)

`_annotClonePeekSrc` / `_annotUpdateClonePeek` / `ANNOT_PEEK_MIN` and the
`#annotClonePeek` canvas inside `#annotBrushRing` (search `The clone stamp's
live preview`).

The source pin says where the copy comes FROM and the brush ring says how big
the mark will be. Neither says what the mark will BE, so lining a stamp up
meant clicking and then looking at what landed — and undoing it when it was
half a letter out. **The ring is now filled with the patch that would be
stamped this instant**: a lens on the source, carried under the pointer, at the
same zoom as everything else.

- **It lives INSIDE the ring**, so it is positioned, sized and hidden by exactly
  the code that already does all three for the ring. `_annotUpdateBrushRing` is
  still the ONE place either of them moves.
- **The source point is different before and during a stroke, and getting that
  backwards is the silent failure.** Before the first dab there is no offset, so
  starting the drag here is what would put the source POINT under the pointer —
  the preview is centred on `cloneSrc`. Mid-stroke the offset was locked in at
  pointer-down, so it is `(pointer in image px) − cloneOff`, which drifts away
  from the mark at the speed of the hand if it is computed the other way round.
- **`_annot.ptr` is in STAGE coordinates and the source is in IMAGE pixels**, so
  zoom and pan come off first. Read it raw and the preview is right only at 100%
  with no panning — which is how the editor opens, and therefore how anyone
  would check it by hand.
- **Mid-stroke it reads `cloneSnap`, not the live canvas** — the stamp reads the
  frozen snapshot, so dragging back over ground already covered would otherwise
  preview the copy instead of the source, and the two diverge exactly where it
  matters.
- The backing store is the brush in **image** pixels, so the preview is
  pixel-for-pixel what the dab puts down however far the view is zoomed; under
  `ANNOT_PEEK_MIN` (14) screen px there is nothing to see in the ring and it is
  not drawn. The ring goes white-on-black while it is previewing — a black
  hairline over arbitrary artwork is the one thing that disappears.
- Run **`node tools/clone-preview-tests.mjs`** after touching any of it.

## ✨ Regenerate — say what you want and the AI redraws it (vv1.39.0)

`annotAiRegen` / `_annotAiBarInit` / `_annotAiSyncScope` / `_annotSelBox` /
`ANNOT_AI_KEEP` (search `REGENERATE`), plus the `#annotAiBar` under the
selection bar in the Touch up editor.

AI content-aware fill answers exactly ONE question — *take this out* — with a
prompt nobody can change. Everything else an author actually wants of a picture
("rub out the pencil marks", "make the arrow red", "redraw this beaker
cleanly", "put the missing axis label back") had **no door at all**. This is
that door: a line to type in, and the same image model behind it.

- **TWO SCOPES, and the difference between them is the whole safety story.**
  With an area SELECTED only that area may change: the model is shown the
  picture with the area **RINGED rather than blanked** — "make the arrow red"
  needs the arrow still visible, which is exactly what content-aware fill's
  magenta blanking destroys — and the reply is composited back through
  `_annotWithSelClip`, so a model that quietly rewrote the whole page cannot
  touch one pixel outside the selection. With NOTHING selected the whole picture
  is redrawn, which is the honest reading of "no area chosen".
- **The bar NAMES the scope it is about to use** (`_annotAiSyncScope`, kicked
  from `_annotSelSyncBar`), because those two are very different things to press
  a button on.
- **The magenta marker is drawn just OUTSIDE the selection**, so it never covers
  the content the instruction is about — and anything of it that survives into
  the reply is outside the clip and therefore cannot be composited back.
- **It is ONE history step either way**, so ↶ Undo puts the original back. That
  is what makes an experimental prompt cheap enough to actually experiment with.
- The whole-picture branch **clears the canvas and draws**, never a `'copy'`
  composite: a canvas stranded in a composite mode erases everything drawn
  afterwards (the same trap `_annotResetCompose` exists for).
- `_annotAiBarInit` runs on every open, so **last picture's instruction is never
  left sitting in the box** one Enter away from being run on this one.

## ✍️ AI complete — carry the paragraph on from where you stopped (v1.48.0)

`completeBtnHtml` / `_aicTrimEcho` / `_aicJoin` / `_aicUnquote` / `_aicAppendInto`
(search `✍️ AI COMPLETE`), plus the ✍️ **AI complete** button beside ✨ Improve
and ✂️ Shorten on every prose box in the question editor. **All four portals
carry the same block — keep them in step**; only the subject line of the prompt
differs.

An author half way through writing a passage, a model answer or an explanation
had two AI buttons and both of them *rewrote what was there*. Neither is any
use to somebody who has stopped mid-sentence and wants the rest — so the thing
they actually wanted, they typed themselves.

- **It only ever ADDS, and that guarantee is STRUCTURAL rather than something
  the prompt asks for.** ✨ Improve and ✂️ Shorten hand their reply to a setter
  that REPLACES the whole box; `_aicAppendInto` appends, and the existing markup
  is never re-serialised. So nothing the model returns can change a word that is
  already there — and the author's own bold, underline and pasted pictures
  survive, which a plain-text round trip would flatten.
- **`_aicTrimEcho` is the net, because the model restates before it continues.**
  Asked to carry on, it very often repeats the last sentence first, and now and
  then the WHOLE paragraph. Appended verbatim that puts the author's opening in
  the box twice, which reads exactly like the button having mangled it. Whatever
  of the existing text the reply opens with is cut — matched on
  whitespace-folded, lower-cased text so a reply that reflows the spacing is
  still caught, and **longest tail first**, or a shorter match leaves the rest of
  the repeat behind.
- **The other direction is the one that eats the work.** A trim firing on a
  coincidental few characters throws the real continuation away, so
  `AIC_ECHO_MIN` (10) is the floor below which an overlap is treated as
  coincidence. Both directions are silent and the app works either way.
- **`_aicJoin` never welds a space between two CJK characters.** 中文 and 华文 are
  written without them, so a space there is a space in the middle of a word;
  latin either side needs one, and a trailing space the author typed is not
  doubled. It is in all four portals, not just the Chinese one — a 华文 name or
  a quoted phrase turns up in any of them.
- **execCommand is what makes it cheap to try**: it keeps the browser's own undo
  stack, so ONE Ctrl+Z takes the whole completion back off again. The caret is
  moved to the END of the box first — appending at the caret (which is what
  🎤 Dictate does) would drop a completion into the middle of a sentence.
- **An empty box is refused.** Writing from nothing is a generated question,
  which is a different job and a different button; this one carries on from what
  is there.
- **The model is told to finish ASKING a question, never to answer it** — a stem
  the author is still writing must not come back with its own answer appended.
- **It shares `.improve-btn` for its looks, so ✨ Improve's handler needs a
  guard.** Improve is the one that runs on the bare class; without
  `contains('complete-btn') return` one press runs BOTH, and Improve rewrites the
  box — the exact damage this button promises never to do, delivered by the
  button itself. ✂️ Shorten has carried the same guard from the start.
- Run **`node tools/ai-complete-tests.mjs`** after touching any of it.

## 📷 A question that came off a photograph (v1.50.0)

`vetIsScanned` / `SCANNED_SOURCE` (search `A QUESTION THAT CAME OFF A PHOTOGRAPH`), plus
the purple outline and the **📷 From the Scan app** badge on a vetting card.

The Scan app (`polymathlc/scan`) reads a worksheet or an exam paper on a phone.
The teacher can now send any question it read straight into **this app's
vetting list** — `users/{uid}/mathVetting` — and it arrives as an
ordinary pending question with one extra field.

- **`source: "scan"` is the whole contract between two repositories that
  cannot see each other**, and it fails silently in both directions. Rename
  the value on either side and the card still arrives, still renders and still
  approves; it simply stops being purple and stops saying where it came from,
  with nothing anywhere to say so. **Ship a change to the word in all five
  repos together** (`scan`, `cer`, `math`, `english`, `chinese`).
- **It has to be LOUD, because a scanned question is not like a typed one.** It
  was read by a model from a picture of somebody's worksheet: the wording may
  be half a line short, **the diagram is not there at all**, and no topic is
  set at all — and a topic is what decides the LEVEL here, so it is not a
  guess to make from a phone; the card wears the app's own **No objective**
  and **Diagram missing** warnings on top of the purple.
  A card that looked like every other draft would be approved at the same speed
  as one somebody typed and checked, and reach the bank with a figure missing.
- **`vetIsScanned` is the ONE predicate**, and the outline and the badge both read
  it. Two tests would drift into a card that is purple with no badge (which
  reads as a styling bug) or badged with no outline (which is the warning made
  invisible).
- **The CSS ORDER is the ranking.** `.vet-card.is-new`, `.is-scan` and
  `.is-picked` weigh exactly the same, so only their order in the stylesheet
  decides which border a ticked card shows. `.is-scan` sits between the other
  two on purpose: put it last and the author cannot see what they are about to
  delete.
- **It lands in VETTING and nowhere else.** The Scan app writes one document
  into this app's vetting collection and touches nothing else — not the bank,
  not a student's progress, not the notebook. Approving it is the ordinary
  approve, and from then on it is an ordinary question.
- **The child's work never travels.** The Scan app marks what the student wrote
  on the paper; none of that is in the document. A bank question is the
  QUESTION, its options, its answer and why.
- Run **`node tools/scanned-question-tests.mjs`** after touching any of it.

## House rules
- After touching **📷 a question that came off a photograph** (`SCANNED_SOURCE`,
  `vetIsScanned`, the `scanBadge` in `renderVettingList`, or the CSS order of
  `.vet-card.is-new` / `.is-scan` / `.is-picked`), run
  `node tools/scanned-question-tests.mjs`. One word — `source: "scan"` — is the
  whole contract with `polymathlc/scan`, and every way it goes wrong is silent:
  rename the value and the card still arrives, still renders and still approves,
  it simply stops being purple and stops saying it came off a photograph. A
  scanned question has no diagram and no topic — and the topic is what decides
  the LEVEL here — so a card that looks like every other draft is approved at
  the same speed as one somebody typed and checked. Those three classes weigh
  the same, so only their ORDER in the stylesheet decides which border a ticked
  card shows.
- After touching **the siege squad** (`EMS_SQUAD_PER_ROLE`, `emsSquadClean`,
  `emsSquadDefault`, `emsSquadSaved`, `emsSquadStore`, `emsRenderDeck`'s squad
  read, or the `squad` field in `tcgHydrateState`'s `siege` literal), run
  `node tools/siege-squad-tests.mjs`. Every failure is silent and lands on a
  student mid-game: lose the per-role cap and a squad is eighteen attackers and
  no medic, lose the ownership test and a merged-away unit sits on the bench
  costing mana and deploying nothing, and lose either the deck read or the save
  field and the pick screen is decoration — the choice is made, confirmed, and
  then ignored by the battlefield or forgotten by the next run. An EMPTY squad
  is the worst of them: the deck column is the only way to deploy anything, so
  the game renders perfectly and cannot be played.
- After touching **the card game's art store** (`TCG_ART_DOC`,
  `TCG_ART_DOC_LEGACY`, `tcgLoadArt`, `_tcgArtStore`, `tcgResetAllArt`,
  `resetTcgArt`, `tcgArtAdoptLegacy`, `tcgRepairArtBackgrounds`), run
  `node tools/art-store-tests.mjs`. This is the one that has already cost real
  work: put the literal `'tcgArt'` back in any read or write and this app is
  silently sharing the Science app's art map again, overwriting Realm of Embers
  card by card with nothing on any screen to say so — and one blunt
  `setDoc({ overrides: {} })` then wipes both games in a single press. The
  harness also pins that the legacy document is never written, that a failed
  read cannot be mistaken for an empty store, and that uploads stay in
  `mathImages/`.
- After touching **the Student Usage Tracker** (`USAGE_MODES`, `usageMode`,
  `sutNormalise`, `sutStamp`, `sutPerfMode`, `sutVerdict`, `sutVisible`,
  `sutByMode`, `sutExportCsv`), **`ATTEMPTS_COL` / `ATTEMPTS_COL_LEGACY` /
  `sutLegacyGameRows` / `logGameAttempt`**, or the `via` / `practiceMode`
  fields the Cloud Function stamps on an attempt, run
  `node tools/usage-tracker-tests.mjs`. Every
  failure here is silent and a teacher acts on it: drop either source and a
  pupil's work disappears with nothing on screen to say a source is missing
  (which is the bug this feature fixes — three game modes were writing to a
  collection nothing read), measure the gap inside one source and rapid-fire
  answering is under-reported exactly where it is most likely, and let a
  recomputed credit overrule the marker's own verdict and the tracker
  contradicts the pupil's result screen about the same attempt. And put a
  literal `questionAttempts` back anywhere and this dashboard is listing the
  SCIENCE app's game answers as Nova Protocol ones, on a page that renders,
  filters and exports perfectly.
- After touching **✍️ AI complete** (`completeBtnHtml`, `_aicTrimEcho`,
  `_aicJoin`, `_aicUnquote`, `_aicWords`, `_aicAppendInto`, `_aicPrompt`, or
  ✨ Improve's `complete-btn` guard), run `node tools/ai-complete-tests.mjs`.
  Every failure is silent and lands in the middle of writing somebody was part
  way through: trim too eagerly and the real continuation is thrown away or
  starts halfway through a word, too timidly and the author's own opening is in
  the box twice, and lose ✨ Improve's guard and one press of ✍️ AI complete also
  runs the button that REWRITES the box.
- After touching **the clone stamp's live preview** (`_annotClonePeekSrc`,
  `_annotUpdateClonePeek`, `ANNOT_PEEK_MIN`, `_annotUpdateBrushRing`), run
  `node tools/clone-preview-tests.mjs`. A preview that does not appear is
  obvious the first time anyone picks the tool; a preview centred on the WRONG
  source point looks exactly like a working one and aims every stamp a little
  way off — which is worse than the pin-and-guess it replaced.
- After touching **the printed answer fields or the working-space sizing**
  (`wsQuestionParts`, `wsAnswerBlankHtml`, `wsBodyEstimateMm`,
  `wsAnswerRowsMm`, `wsWorkingSpaceMm`, `wsHeadEstimateMm`,
  `wsEffectiveImgMm`, `WS_BODY_LINE_MM`, `WS_IMG_MIN_MM`), run
  `node tools/worksheet-answer-fields-tests.mjs`. Every half fails silently:
  a working area sized past what the page has left strands the answer line
  alone on the next page, a part reader that is a shade too greedy prints
  three answer fields on a question with one, and forgetting that the sheet
  header sits above question 1 spills the FIRST question of every sheet while
  every other question looks perfect.
- After touching **the answer key cross-check** (`akcCompare`,
  `akcAnswersAgree`, `akcAskEngine`, `akcPrompt`, `akcRecentQuestions`) **or
  the shared `AI_ENGINE_STORE` slot names**, run
  `node tools/answer-key-check-tests.mjs`. Every failure here looks like a
  working report: a loose agreement test turns the whole run green and
  certifies wrong keys, a reversed comparison tells the teacher to change a
  correct one, and a Gemini call that quietly went through ChatGPT is two
  columns of the same model agreeing with itself.
- After touching **the preview's editable header** (`wsHeadFieldHtml`,
  `wsHeaderEditScript`, `wsPreviewHeaderSave`, `wsHeaderOrgOf`), run
  `node tools/worksheet-header-tests.mjs`. It fails silently in both
  directions: an editable header on somebody else's sheet is a field that looks
  saveable and is not, and a field name that drifts between the cover and the
  header prints two different titles on one document.
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
  badge. It also parses the MARKUP and pins that `#subjectSwitch` and
  `#appVersion` are direct children of `<body>`: the switcher shipped nested
  inside the `display:none` lore-book overlay and stayed invisible for nine
  minor versions while every other case in this harness passed.
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
