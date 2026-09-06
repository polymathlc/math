# Math Rapid Add — v1.67.0

Choose multiple PDFs in Rapid Add. Keep the tab open until every upload says
“Stored online”. Online processing then reads, assembles, checks and saves
questions independently of the browser. Reopen Rapid Add to see progress or
retry remaining pages. Screenshots and browser mode need an open browser tab.

- Maximum 40 MB and 60 pages per PDF. Split larger papers into smaller files.
- Questions spanning several pages stay together, with diagrams and links to
  their source pages. Unclear continuations are flagged for review.
- Your level, release date, generation guidance, automatic syllabus filing
  and answer-check choices are captured when you queue each PDF.
- Questions go to Math's Vetting list and still need your approval before
  reaching students.
- Interrupted uploads can resume when you select the same file again on the
  same browser. Failed online jobs offer “Retry remaining pages”.
- Original files are retained for import recovery.
- The answer check flags potential problems. Errors never appear green, and
  editing a checked answer makes its previous check out of date.
- Hover over the eye in Vetting to see the question and answer key using
  Math's PDF export layout. Keyboard focus also previews; click opens the
  full export. The preview panel includes an Edit button.

Online processing becomes available after its deployment succeeds. If the
online option is unavailable, browser mode remains usable: keep the tab open.

After activation, try two small PDFs, including a question spanning pages.
Wait for both upload confirmations, close the browser, then reopen Math and
check the completed jobs, diagrams and answers in Vetting.

## Development checks

```sh
npm ci --prefix rapid-import/functions
npm test --prefix rapid-import/functions
node tools/rapid-pdf-tests.mjs
node tools/rapid-cloud-tests.mjs
node tools/vetting-export-hover-tests.mjs
node tools/scheduled-release-tests.mjs
node tools/worksheet-answer-fields-tests.mjs
node tools/worksheet-header-tests.mjs
```

Worker tests render real PDFs while mocking external services. They verify
multi-page grouping, duplicate retries, incomplete uploads and access checks.
They do not establish that production deployment and provider access work;
the signed-in import check above is still needed.
