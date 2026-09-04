# Task 8 Report — Accessibility, E2E, Volume, and Traceability

## Implemented

- Added accessible, filter-preserving notification pagination controls.
- Extended exact-cleanup Playwright fixtures for two failed delivery records with random disposable passwords and `.example.test` identities.
- Added desktop/mobile Phase 7 browser tests for the reusable two-line lockup, Administrator privacy-safe inspection/retry/audit, Faculty scoped delivery status, and non-owner denial.
- Added Phase 7 traceability, volume baseline, README notification guidance, and known limitations.

## RED/GREEN Evidence

- Notification page test failed because no pagination landmark or links existed, then passed after the bounded Previous/Next UI was added.
- E2E initially exposed stale-source browser evidence, duplicate hidden/visible brand locators, filtered retry-row behavior, and the audit UI's humanized action label. Each test was corrected against current user-visible behavior; the final focused suite passed all six desktop/mobile tests.

## Browser Evidence

- In-app Browser first, current source at a fresh local port.
- 390×844, 768×1024, and 1440×900: separate brand lines, visible logo, labels, focus treatment, and no horizontal overflow.
- No browser console warnings/errors on the production UI under test. Reduced-motion handling is present in the central design CSS and component live regions remain covered by focused tests.

## Requirement Mapping

- P1 email notifications and backup/monitoring.
- FR-002, FR-010–FR-013, FR-015, FR-016, FR-020, FR-021, and FR-023.
- Security/privacy, responsive/accessibility, pagination, typed/migrated/tested code, Docker, health, logging, and automated-test NFRs.
- Acceptance criteria 1 and 15, with earlier acceptance criteria retained through the complete regression suite.

## Final Acceptance Evidence

- Format, lint, TypeScript: passed.
- Unit/route/component/security: 84 files, 511 tests passed.
- Dependency audit: 0 vulnerabilities.
- Configured Next.js 16.3.0 production build: passed.
- MariaDB integration: 8 files, 33 tests passed against all 11 migrations.
- Playwright: 14 desktop/mobile tests passed with zero skips.
- Fresh `hau_task8_final` Compose images: db, migrate, web, worker, media-init, and Mailpit became healthy.
- Live SMTP: issued and revoked jobs reached `SENT`; Mailpit contained the two expected subjects. With Mailpit stopped, another issuance stayed persisted and its delivery recovered to `SENT` after restart.
- Restart/persistence: two issuances and three deliveries survived database/web/worker restart; health returned ready; inspected logs contained no disposable password, recipient address, or private snapshot names.
- Final backup/restore: checksums, database/public ID/count restoration, media restoration, and wrong-project rejection passed via `scripts/backup-restore.test.sh`.

## Review Disposition

Independent review found no Critical code defect. Its Important findings were closed by the live lifecycle/Mailpit/outage drill, fresh Compose/restart/backup gates, and exact command/result traceability. Transactional individual/batch/revocation behavior runs against real MariaDB; desktop/mobile Playwright exercises notification authorization and retry UI. Accessibility evidence names exact viewport/focus/label/overflow observations plus live-region and reduced-motion coverage.

Phase 8 signing/conformance/wallet work and a future student portal remain explicitly out of scope.
