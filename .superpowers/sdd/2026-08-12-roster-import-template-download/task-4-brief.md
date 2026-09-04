# Task 4 Brief: Full Verification and Download Smoke Testing

## Context

Tasks 1–3 implement CSV/XLSX generators, protected class-scoped routes, and Import Wizard links. This is a verification-only task unless a check exposes a defect. Follow `AGENTS.md` and the verification-before-completion workflow. Do not claim success without fresh evidence.

## Allowed Changes

- Run `npm run format:write`; this may format the plan/ledger and changed source files.
- If a verification defect is found, reproduce it with a failing test before making the smallest fix in files already covered by Tasks 1–3.
- Do not add features or alter unrelated files.

## Required Local Gate

Run in order:

```bash
npm run format:write
npm run format
npm run lint
npm run typecheck
npm run test
npm audit
DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging npm run build
```

All must exit 0. Report exact test counts and audit result.

## Required Docker Gate

Rebuild the documented Docker Compose environment with the existing smoke variables, wait for health, then verify:

- `docker compose ps` shows healthy database/web;
- `GET http://127.0.0.1:3000/api/health` returns success;
- migration and web logs have no application failures;
- all existing migrations remain current (no schema change is expected).

## Required Browser Gate

Use the Browser plugin first. The flow under test is: Faculty login → owned class Students tab → expand **Import CSV or XLSX** → download CSV and XLSX → verify filenames and non-zero sizes → page stays on Students → no framework/console errors.

Known active Faculty test account:

- email: `phase2-faculty@example.edu`
- password: `phase2-faculty-password-2026`

Discover an owned class through visible UI; do not assume a class ID. If none exists, create a disposable class as the Faculty through the UI, then test its Students tab.

Also verify both URLs while signed out and as Administrator return no attachment. Automated route coverage supplies the non-owner Faculty proof. At 390×844, verify readable guidance, wrapped links, no horizontal overflow, and usable upload/preview controls. Capture DOM/console/download evidence and at least desktop/mobile screenshots outside committed source.

## Report

Write the full report to `.superpowers/sdd/2026-08-12-roster-import-template-download/task-4-report.md`. Include status, all command outputs/results, Docker health/migration evidence, browser URL/viewport/console/download filenames and sizes, authorization checks, defects/fixes, and remaining risk. Return only status, a concise verification summary, and concerns. Git commits are unavailable.
