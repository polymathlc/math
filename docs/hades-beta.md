# Hades Math beta

Administrators open **Hades · BETA** from the sidebar or the Aetherfall game
modes page. Choose a primary school level, then press **Start preview**. The
bank and its private answer keys must finish loading first. Student accounts
do not see or enter this beta; no existing student release setting changes.

Every cleared chamber pauses for exactly five multiple-choice questions from
the Math question bank. Each correct answer restores 8% of maximum health,
up to 40%. Every correct answer improves the upgrade, with a large difference
between no correct answers and a perfect round. The game only receives the finished score and reward tier;
questions and answer keys stay in the platform.

| Correct answers | Heal (% maximum life) | Reward tier | Scalable boon / Pom upgrade |
| --- | --- | --- | --- |
| 0 | 0% | Fractured | No boon or Pom; +1 maximum life only |
| 1 | 8% | Common | Level 1 / +1 level |
| 2 | 16% | Uncommon | Level 2 / +2 levels |
| 3 | 24% | Rare | Level 3 / +3 levels |
| 4 | 32% | Epic | Level 5 / +5 levels |
| 5 | 40% | Heroic | Level 8 / +8 levels |

Unique boons keep their authored mechanics and add 5 maximum life per reward
rank (5/10/15/25/40 at 1–5 correct). With no scalable Pom target, the consolation
is 1/5/10/20/35/60 maximum life at 0–5 correct. Maximum-life bonuses do not heal;
healing remains the percentage earned by correct answers.

Heart gates grant 1/10/18/25/40/60 maximum life and ash gates grant
1/5/10/15/25/40 ashes at 0–5 correct. Shop boon and Pom upgrades use the same
tier, while shop hearts grant 1/12/24/35/50/80 maximum life. Ordinary purchased
healing and unrelated combat rewards keep their own rules.

Selection uses the existing grade, skill mastery, quality and question-family
policies, even during administrator previews. It shuffles suitable questions,
rejects malformed, ungraded, withheld or suspect records, and remembers served
questions for the rest of the day, with an in-memory fallback if browser storage
is blocked. Questions from the selected school year take precedence over old
numerical difficulty ratings. Previous-year support requires at least three
relevant question families showing difficulty with the skill; more distant
school years and mixed or multipart assessments are excluded.
Five eligible questions are required: an
undersized pool pauses progress instead of repeating questions, substituting
easier material, inventing questions or calling AI.

Preview history is saved locally for each administrator and preview level,
separately from student results and points. The beta makes no AI or marking
service calls. Math's existing private-key architecture remains intact: a
future student release must first connect an authenticated deterministic MCQ
grading route, rather than sending private answer keys to students.

The learning bridge validates the frame, same origin, session and sequential
round, grades each answer once, and replays completed rewards without duplicate
history. Changing the preview level, leaving the page or signing out closes the
old learning session. Missing diagrams block answer buttons so a student cannot
be assessed on incomplete visual information.

Run `node --test tools/hades-math-bank-tests.mjs tools/hades-learning-tests.mjs`
and `node tools/hades-math-browser-tests.mjs` for bank/bridge and rendered Math
checks. The browser check uses the production Math renderer and question dialog.

Release bundle: **Hades 2.1.2**, Math **v1.81.2**. The generated game and shared bridge are verified against `hades-game.manifest.json` in CI. Tests exercise all six scores, rendered reward summaries and duplicate-request protection.

The cast now forms a detailed SVG summoning circle on the floor, beneath scenery and combat actors. Its fixed boundary matches the spell’s reach, with counter-rotating interior rune bands that stop in reduced-motion mode.
