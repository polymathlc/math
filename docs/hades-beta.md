# Hades Math beta

Administrators open **Hades · BETA** from the sidebar or the Aetherfall game
modes page. Choose a primary school level, then press **Start preview**. The
bank and its private answer keys must finish loading first. Student accounts
do not see or enter this beta; no existing student release setting changes.

Every cleared chamber pauses for exactly five multiple-choice questions from
the Math question bank. Each correct answer restores 8% of maximum health,
up to 40%. The next boon is Common at 0–1 correct, Rare at 2–3, Epic at 4,
or Heroic at 5. The game only receives the finished score and reward tier;
questions and answer keys stay in the platform.

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

Release bundle: **Hades 2.1.0**, Math **v1.81.0**. The generated game and shared bridge are verified against `hades-game.manifest.json` in CI. Common/Rare/Epic/Heroic grant level 1/2/3/4 to a scalable boon or add 1/2/3/4 Pom levels; unique utility effects keep their fixed strength.
