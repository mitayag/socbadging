# Student Portal TODO

## Phase 0 — Discovery and baseline

- [x] Inspect existing architecture, schema, auth, notifications, verification, design.
- [x] Create architecture, implementation plan, and TODO documents.
- [x] Record baseline test results.
- [x] Preserve existing uncommitted work and re-verify before final report.

## Phase 1A — Notification and resend

- [x] Add badge artwork/expiration/support contact to notification data and email templates.
- [x] Add HTML and text email improvements.
- [x] Add authorized resend for Administrator and owning Faculty.
- [x] Add cooldown, rate limit, audit, and safe errors.
- [x] Correct SENT wording.

## Phase 1B — Recovery and downloads

- [x] Add activation/recovery token model and migration.
- [x] Add badge image download.
- [x] Add PDF summary with QR code.
- [x] Add rate limits, token replay/expiry tests, and ownership checks.

## Phase 1C — Email readiness

- [x] Document SMTP TLS/auth and provider requirements.
- [x] Document SPF/DKIM/DMARC and bounce-processing limitation.
- [x] Document retry/dead-letter/lease behavior.

## Phase 2A — Student authentication

- [x] Add STUDENT role and staff authorization guards.
- [x] Add StudentAccount and StudentToken migration.
- [x] Add activation, login redirect, recovery, password reset, disable/suspend.
- [x] Add identity-conflict handling and audit.

## Phase 2B — Student dashboard

- [x] Add overview metrics and recent credentials.
- [x] Add loading/error/empty states.

## Phase 2C — Wallet

- [x] Add collection page, search/filter, and actions.
- [x] Add image/PDF/JSON-LD/share actions.

## Phase 2D — Details, notifications, profile

- [x] Add private credential detail.
- [x] Add notification history.
- [x] Add profile/security/help.

## Phase 2E — Acceptance and regression

- [x] Run all gates.
- [x] Verify ADMIN/FACULTY/STUDENT/security/regression scenarios.
- [x] Create reports and screenshots.
