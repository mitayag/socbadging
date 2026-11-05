# Stage 4 Test Results

**Date:** 2026-11-02  
**Environment:** Local development  
**External email sent during tests:** No

## Summary

| Suite             | Result                               |
| ----------------- | ------------------------------------ |
| Format            | PASS                                 |
| Lint              | PASS                                 |
| Typecheck         | PASS                                 |
| Unit tests        | PASS — 115 files, 828 tests          |
| Integration tests | PASS — 19 files, 123 tests           |
| Playwright        | PASS — 46 tests                      |
| Production build  | PASS                                 |
| Migration parity  | PASS — main and disposable databases |

## Integration database

- Disposable database: `badging_test`
- Reset and migrated before the full integration and Playwright runs.
- No production or staging database used.
- Mailpit and mocked provider events only; no external SMTP submissions.

## Coverage highlights

- SMTP acceptance stored separately from provider delivery.
- Durable attempt history.
- Webhook signature authentication.
- Webhook payload validation and size limits.
- Duplicate webhook replay protection.
- Stale/out-of-order provider event protection.
- Delivered, deferred, bounce, block, invalid, and complaint projection.
- Unmatched event recording.
- Retry jitter bounds.
- Worker attempt creation and SMTP acceptance recording.
- Notification provider-status filters.
- Faculty notification scoping.
- Notification detail privacy.
- QR sharing and social metadata.
- Student ownership and existing issuance/verification regressions.

## Notes

- Playwright uses the existing disposable test database and local signer.
- The test run produced a non-fatal Next.js response-stream warning during PDF download testing; the Playwright suite still exited successfully with 46/46 passing.
- Provider delivery and inbox receipt are not proven by automated tests. Production email reliability remains unverified until authenticated provider events and authorized recipient evidence are collected in the target environment.
