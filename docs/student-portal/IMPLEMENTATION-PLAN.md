# Student Portal Implementation Plan

## Baseline gates

Recorded before student-portal changes:

- Format: PASS
- Lint: PASS
- Typecheck: PASS
- Unit: 110 files / 774 tests PASS
- MariaDB integration: 14 files / 102 tests PASS
- Production build: PASS
- Playwright E2E: 34/34 PASS

## Phase 0 — Discovery

- Inspect schema, auth, issuance, signing, verification, notifications, design tokens.
- Create architecture, plan, and TODO documents.
- Preserve existing uncommitted dashboard and issuance-repair work.

## Phase 1A — Notification and resend

- Extend notification rows/templates with badge artwork, expiration, support contact.
- Add authorized resend with cooldown, rate limit, audit, and safe errors.
- Correct all wording so `SENT` means SMTP accepted, not inbox delivery.

## Phase 1B — Recovery and downloads

- Add hashed single-use activation/recovery tokens.
- Add public badge image download.
- Add printable PDF with QR code and human-readable credential summary.
- Add rate limits and ownership checks.

## Phase 1C — Email readiness

- Document SMTP TLS/auth, SPF, DKIM, DMARC, bounce processing, retry/dead-letter behavior.
- Keep Mailpit as the local transport.
- Add production setup checklist and limitations.

## Phase 2A — Student authentication

- Add `STUDENT` role, `StudentAccount`, and `StudentToken`.
- Add activation, login redirect, recovery, password reset, disable/suspend.
- Add staff authorization guards before enabling the role.

## Phase 2B — Student dashboard

- Add overview metrics and recent credentials.
- Add responsive loading/error/empty states.
- Derive status from authoritative issuance/expiration/revocation data.

## Phase 2C — Wallet

- Add collection page with search/filter and credential actions.
- Add view, verify, copy URL, JSON-LD, image, PDF, and sharing links.

## Phase 2D — Details, notifications, profile

- Add private credential detail.
- Add recipient-scoped notification history.
- Add profile/security/help pages.

## Phase 2E — Acceptance and regression

- Run unit, integration, E2E, build, lint, typecheck, formatting, migration parity.
- Verify ADMIN, FACULTY, STUDENT, security, and regression scenarios.
- Record actual results and remaining defects.
