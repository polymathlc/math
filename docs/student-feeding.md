# Student question feeding — v1.87.0

Question ranking is deterministic and makes no AI requests. Before a question
is displayed, a cloud transaction reserves it in the student's permanent account
history. Existing answer marking and optional AI authoring remain separate features.

## Order of decisions

1. Establish the student's school level. An unset level is a request to choose
   a level, never permission to draw from every year.
2. Enforce the question's highest declared school level, including ranges and
   syllabus objectives. A high general rating cannot override this ceiling.
   Unclassifiable questions stay out of automatic feeding until level metadata
   can be established.
3. Check quality using the question's structure, existing review signals and
   unresolved reports. Definite structural failures do not enter automatic
   practice. Suspect questions are held out of automatic feeding, including
   when no sound, suitable question remains.
4. Match difficulty to evidence for the relevant skill. Evidence comes from
   different question families, with conservative estimates when there is little
   history. Repeating one answer cannot inflate mastery across other skills.
5. Exclude every previously shown question and exact content copy, including
   questions seen in another practice or game. Related numerical variants still
   observe family spacing. Never fill an empty suitable pool with repeated work.

Explicit worksheet choices preserve the order of eligible questions. Browsing
teacher material is separate from being fed a question for student practice.
Changing level revalidates the next question, including questions in open games.
An explicit manual choice can include harder work within the student's school
level and warns about suspect content; it cannot bypass the school-level ceiling
or definite structural failures. Automatic selection applies a lower and upper
difficulty bound, so a small bank cannot force either far-too-easy or too-hard work.

## Permanent history across practices and games

Ordinary practice, adaptive practice, syllabus topic practice, card training,
Nexus Duel, Orbital Siege, Nova Legends, Hades and Grand Line all use the same
account history. History is keyed to the signed-in student, independent of school
level, game run or browser session. Changing devices, restarting a game or returning
weeks later does not reset it. A question is recorded when it is reserved for
display, even if the student closes the game without answering.

Login migrates the complete saved question-progress and attempt collections plus
the current browser's older practice, card-training, Hades and Grand Line history.
Administrator previews and other accounts' records are excluded. Before the first
question, every cloud migration read and ledger migration must finish successfully.
Cached or failed reads stop fresh feeding and present a retry action.

The ledger stores immutable ID and public content-identity markers under the
student's owner-only `questionHistory` collection. It has no age or item-count
reset. Live updates share new exposures between tabs, and transactions prevent
two devices from reserving the same question. Three-question Grand Line rounds
and five-question Hades rounds reserve their whole set together; abandoning a
round grants no learning reward. Content markers retain exact-copy protection
even when an original question is removed from the bank.

When no unseen suitable questions remain, the app explains the exhaustion and
offers another topic or new teacher questions. Explicitly selecting an old question
or a saved worksheet remains deliberate revision. That permission applies only
to the chosen questions, and newly viewed worksheet questions are recorded in the
same permanent history. Choosing a syllabus topic does not enable repeat mode.

## Quality without AI cost

The checker inspects empty or malformed content, diagram references, tables,
multiple-choice structure and clear unfinished placeholders. It also reuses
existing importer checks and reports instead of paying to grade the bank again.
A poor success rate alone does not prove that a question is faulty: it may simply
be difficult.

Public quality summaries contain safe status codes and a fingerprint of public
question content. They do not reveal answer keys, private feedback, reporter
identities or solution text. Editing a question invalidates stale summaries.
Legacy questions still receive structural checks without needing a migration.
Existing private importer findings are summarized safely when an administrator
loads or saves the bank; a failed read never counts as a successful review.

These checks identify reasons for caution; they do not claim to prove every word
problem or diagram mathematically correct. Teachers retain the bank and can
correct or review questionable material without deleting historical attempts.

## Verification

Run the mastery, quality, feeding-integration, variety, submission and student
question-history suites.
Browser checks cover choosing a level, the P4/P6 boundary, suitable-pool
exhaustion, changed levels and the existing revise/next flow. Existing import,
worksheet, history and interface checks must continue to pass.
