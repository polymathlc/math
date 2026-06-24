# Project conventions for Claude Code

## ALWAYS bump the build version on every change
Both `index.html` and `game.html` show a build version in a fixed `.app-version`
pill at the **bottom-right** of the screen, set from an `APP_VERSION` constant
near the `// ===== boot =====` section.

On **every** change to the app, before committing:
- Bump `APP_VERSION` in **both** `index.html` and `game.html`
  (patch for fixes, minor for new features) and set the date to today.
- `game.html` uses the same version with a ` (preview)` suffix.
- Keep the pill positioned at the **bottom-right** (`.app-version { right: 10px; bottom: 8px; ... }`).

Example: `const APP_VERSION = "v1.3.0 · 2026-06-24";`  (index.html)
and `const APP_VERSION = "v1.3.0 · 2026-06-24 (preview)";` (game.html)

## Two near-duplicate builds — keep them in sync
- `index.html` is the main app; `game.html` is the RPG-preview build. They share
  almost all UI/logic, so apply student-facing changes to **both** files.
- The admin **Regenerate variant** and **Check with AI** features live only in
  `index.html`.

## Backend / security
- Trusted logic lives in `functions/index.js` (Firebase Cloud Functions). Answer
  keys are server-only and must never be shipped to students except after
  marking (see how `videoExplanationUrl` / `answerKeyImageUrl` are revealed).
- Deploying functions happens automatically when `functions/**` lands on `main`.
