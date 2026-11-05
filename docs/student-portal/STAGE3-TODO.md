# Stage 3 TODO — Student Portal Stabilization

## Task 1 — Playwright skipped tests

- [x] Replace shared activation/recovery/resend fixtures with per-project isolated fixtures.
- [x] Remove mobile skips for activation, recovery, and resend.
- [x] Run complete desktop and mobile Playwright suite.
- [x] Target zero skipped and zero failed required acceptance tests.

## Task 2 — Student access isolation

- [x] Test cross-student credential, wallet, notification, and profile access.
- [x] Test unauthorized API and server-action calls.
- [x] Verify HTTP status codes in a local production build.
- [x] Confirm no sensitive data in unauthorized responses.
- [x] Preserve anonymous public verification.

## Task 3 — Security and dependency review

- [x] Run production dependency audit.
- [x] Classify critical/high advisories by runtime impact.
- [x] Apply safe dependency updates.
- [x] Run regression tests.
- [x] Document unresolved advisories and compensating controls.

## Task 4 — Email delivery hardening

- [x] Review retries and at-least-once behavior.
- [x] Verify resend throttling and audit.
- [x] Confirm Mailpit remains local default.
- [x] Define provider-neutral bounce/complaint contract if appropriate.
- [x] Document signed webhook, idempotency, suppression, and replay requirements.

## Task 5 — Academic acceptance

- [x] Faculty class/badge/individual/batch/records/resend.
- [x] Student activation/login/dashboard/wallet/downloads/share/recovery/logout.
- [x] Administrator student management/notifications/audit.
- [x] Confirm existing credentials remain valid/accessibile.

## Task 6 — Git and database readiness

- [x] Inspect all uncommitted changes.
- [x] Group dashboard, issuance, and student portal changes.
- [x] Verify migrations and rollback sequence.
- [x] Confirm `.env` and signing secrets are excluded.
- [x] Document audit fixtures requiring cleanup.
