# Stage 5A Test Results

**Date:** 3 November 2026  
**Environment:** Local development only  
**Result:** PASS — release candidate validation

## Static checks

| Command             | Result                                               |
| ------------------- | ---------------------------------------------------- |
| `npm run format`    | PASS — all matched files use Prettier style          |
| `npm run lint`      | PASS — ESLint with `--max-warnings=0`                |
| `npm run typecheck` | PASS — `tsc --noEmit`                                |
| `npm run build`     | PASS — `next build --webpack`, compiled successfully |

## Unit tests

```text
npm run test
Test Files  115 passed (115)
Tests       845 passed (845)
```

## Integration tests

Run against a freshly created, fully migrated disposable database
(`badging_stage5a_integration`):

```text
TEST_DATABASE_URL=... npm run test:integration
Test Files  19 passed (19)
Tests       136 passed (136)
```

The suite covers identity/authorization, issuance, batch signing, revocation,
replacement, status lists, notifications, student portal ownership, password reset,
and provider delivery event handling.

## Playwright — combined Desktop + Mobile

```text
npm run test:e2e
1 skipped
57 passed
0 failed
```

Two consecutive combined runs both produced **57 passed, 1 skipped, 0 failed**. The
previous cross-project rate-limit failures no longer occur.

## Playwright — separate projects

| Project | Result                         |
| ------- | ------------------------------ |
| Desktop | 29 passed, 0 failed            |
| Mobile  | 28 passed, 1 skipped, 0 failed |

The single mobile skip is the intentionally desktop-only responsive screenshot matrix.

## Combined-suite rate-limit flake resolution

Root cause: the application rate limiter uses process-global fixed-window buckets. The
combined Playwright run shares one web server across the desktop and mobile projects, so:

- login buckets accumulated across projects and tests (10/min policy);
- the public HTML rate-limit test reused one credential and could start with an exhausted
  bucket (60/min policy).

Fix:

- Added `e2e/db.ts` to connect to the disposable `TEST_DATABASE_URL`.
- Added `e2e/test-base.ts`, an auto Playwright fixture that clears `rate_limit_buckets`
  before every test.
- Updated every E2E spec to use the shared test fixture.
- Kept the dedicated public rate-limit test intact; it still verifies the 61st request is
  denied within its own window.
- Updated audit-log tests to tolerate immutable audit history accumulated across projects.
- Updated the Phase 7 notification test to filter the delivery table to the target failed
  notification rather than relying on a fixed page size.

Result: the combined suite passes deterministically, and the separate desktop/mobile
suites also pass.

## Role-based regression coverage

| Role          | Coverage                                                                                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator | Dashboard, Faculty Management, Student Accounts, Classes, Issued Badges, Notifications, Audit Logs, Settings, direct/email password reset, user menu, account settings             |
| Faculty       | Dashboard, class list, class roster, badge templates, individual/batch issuance, class issued badges, notifications, password reset for assigned students, class ownership         |
| Student       | Portal dashboard, complete badge wallet, detail, downloads, sharing/QR, notifications, profile, help, activation, recovery, forced password change, credential ownership isolation |

## Live local smoke

- Local web health: HTTP 200.
- Administrator routes reviewed: `/faculty`, `/students`, `/classes`, `/issued`,
  `/notifications`, `/audit-logs` — HTTP 200 with standardized tables.
- Student login and `/student` portal: PASS.
- Public credential verification: “Active credential” rendered.
- Live Mailpit email-reset flow: recovery email received, reset completed, student signed in.
- No page errors or 500 responses during smoke checks.

## Notes

- Tests use only the disposable E2E/integration databases; no production data was touched.
- The E2E fixture JSON and signer JSON files are ignored by Git.
- No commit, push, merge, or deployment was performed.
