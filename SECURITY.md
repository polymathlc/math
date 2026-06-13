# Anti-cheat architecture & deployment guide

The app used to be fully client-authoritative: the browser decided marking
verdicts, awarded its own XP, and wrote the leaderboard and shared raid boss
directly. Any student with dev tools could cheat all of it. This branch moves
trust to a small Firebase backend:

| What | Before | Now |
|---|---|---|
| Answer keys (`expected`, marking guide, key image, video) | Shipped to every browser | Split into `mathQuestionKeys` (admin + server only) |
| Marking verdict | Client called Gemini itself | `markAttempt` Cloud Function (server-side Gemini) |
| XP / month standings / rebirths / star shards | Client-written save | `users/{uid}/serverStats/progress`, written only by functions |
| Attempts + question progress | Client-written | Server-written, client read-only |
| Leaderboard XP/level | Client-written | Server-written; clients may touch only cosmetic fields |
| Raid boss damage | Any client could write the shared doc | Server contributes 1 damage per XP; clients read-only |
| Admin role | Email list in the JS | `admin` custom claim, granted by `grantAdminRole` (server-side allowlist) |
| Rate limiting | None | 15 s between markings, 200/day per student |

Gold, items, pets, battles and dungeon floors stay client-side on purpose:
they are private cosmetics, and a student who edits their own sword affects
nobody's leaderboard.

## Deployment runbook (order matters)

Prereqs: `npm i -g firebase-tools`, `firebase login`, project `mathgen--app`
(already on the Blaze plan — Firebase AI and the email extension require it).

1. **Gemini API key for the backend**
   Create a key in Google AI Studio, then:
   ```
   firebase functions:secrets:set GEMINI_API_KEY
   ```

2. **Deploy the functions** (do this BEFORE the new HTML goes live — the new
   client marks through `markAttempt`):
   ```
   cd functions && npm install && cd ..
   firebase deploy --only functions
   ```

3. **Merge the Science app's rules**, then deploy rules. `firestore.rules`
   and `storage.rules` in this repo cover ONLY the math app and end in a
   default deny. Copy the Science app's existing rules from the console into
   the marked sections first, or the Science app breaks:
   ```
   firebase deploy --only firestore:rules,storage
   ```

4. **Publish the new `index.html` / `game.html`.**

5. **Claim your admin role**: sign in once with an allow-listed email
   (`ADMIN_EMAILS` in `functions/index.js`). The app calls `grantAdminRole`
   automatically and refreshes your token. Open your question bank once —
   the client auto-migrates every existing question by moving its answer
   fields into `mathQuestionKeys`.

6. **App Check**: in Firebase console → App Check, enforce for Firestore,
   Storage and AI once you've confirmed the reCAPTCHA v3 integration works
   for real students. Then set `ENFORCE_APP_CHECK = true` in
   `functions/index.js` and redeploy functions.

Until steps 2–4 are all done, students on the OLD html can still read answer
fields from not-yet-migrated question docs, so do the whole sequence in one
sitting.

## Player migration

Each player's first sign-in after deploy calls `importLegacyProgression`,
which seeds their server XP from the old client-owned save (with sanity
caps). Anything a student inflated before this ships gets capped, and
everything after is server-enforced.

## What this does NOT solve (known residual risks)

- **The AI marker can still be fooled in-band**: working that argues with
  the marker ("award full marks") is fenced with explicit instructions, and
  marks are clamped, but a multimodal model can still be socially engineered.
  Rate limits bound the damage; spot-check high XP/hour students.
- **Self-generated practice questions** are student-owned docs, so a student
  could hand-craft easy ones. The server clamps their difficulty rating and
  the same rate limits apply.
- **Cosmetics are forgeable**: gold, items, dungeon floors, battle wins, the
  `bestFloor` shard bonus at Starfall (clamped server-side) and the roster
  summary in `studentProfiles` are client-claimed. The authoritative attempt
  log (`mathPerformanceAttempts`) is server-written — trust it, not the
  summary, when something looks off.
- **Game-design deltas**: battle victories now pay gold/loot but not XP, and
  the random "surge" XP boost became a deterministic +10% while on a 3+
  correct streak — the server can't verify client battle state or session
  boosts. Tune in `functions/index.js` if the pacing feels off.
- **game.html** is the RPG-preview build: its hero save stays in the
  browser, but marking and XP go through the same backend.
