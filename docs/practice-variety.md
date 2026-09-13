# Practice variety and marking — v1.78.5

The repeated-question report exposed two separate problems: related copies were
served together, and an unchanged answer could be submitted for marking again
after every result. The marking button also acquired its busy state only after
the asynchronous worksheet capture, allowing overlapping clicks.

Automatic practice now considers question families and recent work alongside
the existing review schedule and difficulty preferences. Marked questions wait
until their scheduled review; related variants wait at least 15 minutes. Exact
copies share their review dates even when filed under different question IDs.
AI sets use distinct families, and exhausting a small or filtered pool does not silently
restart recently completed work. Explicitly chosen worksheets retain their
teacher-selected order.

Submission acquires its busy guard before capture, keeps the question and answer
snapshot together, and rejects a repeated completed submission with unchanged
work. After marking, the main action advances to the next question; changing
the working or final answer offers a new check. Multiple-choice questions have
an explicit Revise answer control. Results for an old question or account
must not be displayed on the current question after navigation.

The student history continues to show the original attempt records. This change
does not rewrite past marks, remove bank questions or change server reward rules.
Answer fingerprints and the current round's served-question list remain in page
memory, isolated by student. Saved learning progress restores review spacing
after a reload. Explicit question and worksheet choices retain manual navigation.

Run `node --test tools/practice-variety-tests.mjs tools/practice-submission-tests.mjs`.
The Practice variety and submission checks workflow also runs the existing
duplicate-question, student-history, level, release and question-bank suites.

For isolated browser checks, install Playwright and its Chromium browser, then
run `node tools/practice-browser-tests.mjs`. The suite uses production Practice
markup, styles and handlers with synthetic questions and a deterministic marker;
it blocks all network requests. `PLAYWRIGHT_MODULE` and
`PLAYWRIGHT_BROWSER_CHANNEL` can select an existing local runtime and browser.
