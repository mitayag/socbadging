# Task 6: Require Signing for Batch Issuance

## Files

- Modify `src/modules/issuance/services/batch-commit-service.ts` and unit/MariaDB integration tests.
- Modify `src/components/issuance/batch-issuance-wizard.tsx` and test.
- Modify `src/components/issuance/batch-result.tsx` and test.

## Contract

- Consume Task 5 `prepareSignedIssuance` and opaque prepared-artifact commit boundary.
- Produce deterministic ordered results containing only committed signed issuances plus safe validation/preparation errors.

## Requirements

1. Strict TDD proves preview never signs; concurrency never exceeds `SIGNER_BATCH_CONCURRENCY`; one signing failure commits zero new rows; retries are idempotent; duplicates create no signatures/notifications; success commits signed JSON, one audit, and one outbox entry per new row.
2. Prepare/sign only validated new rows and preserve input order.
3. Abort before the atomic commit transaction if any signing/preparation failure occurs; no partial signing batch is persisted.
4. Inside commit, revalidate current Faculty authorization/ownership, duplicates, active key/list/reservations/source documents, and commit the entire prepared set atomically.
5. UI distinguishes validation errors from exact safe batch message `Signing unavailable; no credentials were issued.` Never expose signer diagnostics in UI/downloaded reports.
6. Preserve import preview-before-commit and existing accessible/responsive behavior.
7. Run focused batch/import/notification/authorization suites, real MariaDB integration tests, full regressions, lint, typecheck, targeted formatting, and build.

## Binding constraints

- Reuse Task 5 preparation/sealing rather than bypassing with the legacy unsigned primitive.
- Signer I/O stays outside database transactions.
- Historical credentials remain immutable; audit/outbox are atomic.
- Use bounded concurrency without unordered result drift or promise leaks.
- Read AGENTS.md and REQUIREMENTS.md completely and applicable Next 16 form/action docs before editing.
- Do not touch live DB, `.env`, SMTP, initialize Git, commit, or dispatch subagents.

## Test database

Only `TEST_DATABASE_URL=mysql://phase8_test:phase8-test-only-password@127.0.0.1:3318/badging_phase8_test` is authorized.
