# Task 4 Brief — Atomic Batch Commit and MariaDB Concurrency

## Required Reading

Read `AGENTS.md`, `REQUIREMENTS.md`, approved Phase 5 design, Task 1 contracts, Task 2 validation/fingerprint, Task 3 preview service, full Phase 4 issuance service/tests/integration tests, Prisma schema/migration, and this brief completely. Strict TDD. Do not add routes/actions/templates/reports/UI.

## Files

- Create `src/modules/issuance/services/batch-commit-service.ts`
- Create `src/modules/issuance/services/batch-commit-service.test.ts`
- Create `src/modules/issuance/services/batch-commit-service.integration.test.ts`
- Modify `src/modules/issuance/services/issuance-service.ts` only to extract/reuse a transaction-client issuance primitive without weakening individual issuance
- Modify `src/modules/issuance/services/issuance-service.test.ts` for extraction/regression coverage
- Modify integration config/helpers only when necessary to include the new MariaDB suite

## Interface

`commitBatchPreview(actor, batchId): Promise<BatchCommitSummary>`

Repeat commit returns the stored summary with `alreadyCommitted: true`. First successful commit returns `alreadyCommitted: false`.

## Entry and Transaction Authorization

- Require exact Faculty role before any database read/transaction. Administrator/null denied.
- Validate batch ID strictly.
- Inside each authoritative transaction, load the batch with stored mapping/rows/counts/fingerprint.
- Revalidate transaction-loaded User is `FACULTY` and `ACTIVE` before class/badge/recipient reads.
- Revalidate active owned class and active owned same-class badge.
- Faculty must own both the class and batch. Inaccessible/missing returns safe `BatchNotFoundError` without leaking existence.
- Handle `READY`, expired, `EXPIRED`, and `COMMITTED` states explicitly. Marking expired is optional only if it does not create an unaudited partial mutation; no credential writes may occur.

## Mandatory Stored Preview Integrity

- Parse stored mapping/rows using Task 1 schemas.
- Recompute the canonical fingerprint from the stored batch-bound input representation. If the current fingerprint API needs mapped source fields absent from classified rows, introduce a narrowly versioned stored canonical fingerprint payload or a pure recomputation adapter without trusting client data or changing already-applied migration unnecessarily. Document the decision.
- Reconcile rows and counts; reject malformed/tampered data with `BatchUnavailableError`.
- Reject zero-ready previews.
- Commit accepts only `actor` and `batchId`; never accept rows/counts/dispositions/class/badge from the client.

## Current-State Revalidation

For stored `READY` rows, use bounded set-based transaction reads to load all Students and active enrollments. Revalidate student IDs/numbers and active membership. An authorization/state change before commit must not issue that row silently. Because the preview is the reviewed set, any ready row that is no longer valid causes the entire commit to fail safely and remain `READY`; do not quietly convert it to an unrelated invalid disposition after confirmation.

Recheck all class/badge/student existing issuance tuples immediately before creation:

- existing tuple becomes `ALREADY_ISSUED` with the authoritative existing IDs;
- preview-time `ALREADY_ISSUED` stays idempotent and is refreshed from current authoritative record;
- invalid rows remain historical/excluded exactly as previewed.

## Reusable Issuance Primitive

Extract a focused server-only transaction-client primitive from Phase 4 that consumes already transaction-loaded/validated class, badge, student/enrollment, issuer, `issuedAt`, and optional generated public ID context. It must:

- build the exact Phase 4 immutable snapshots;
- create one `BadgeIssuance`;
- create exactly one identifier-only `badge.issued` audit record;
- return `{ issuanceId, publicId }`;
- never open its own transaction or weaken authorization; callers remain responsible for validated context.

Individual `issueBadge` must keep all current behavior/tests, including pre-transaction Faculty denial, transaction-loaded active account, class/badge/enrollment authorization, duplicates, public-ID retry, MariaDB tuple-race recovery, and atomic audit.

## Atomic Batch Finalization

Within a single successful batch transaction:

- use one consistent `issuedAt` per new credential unless a documented Phase 4 primitive requires per-row time; prefer one batch timestamp;
- create all new issuances and individual audit entries;
- update stored rows so new and existing rows contain authoritative issuance/public IDs;
- keep `READY` disposition for newly issued rows (the Task 1 committed invariant treats finalized READY rows as issued); keep `ALREADY_ISSUED` for existing rows;
- set `issuedCount` to new credentials, `alreadyIssuedCount` to all existing tuples, `invalidCount` unchanged, `readyCount` may retain preview-ready count as historical preview metadata;
- set status `COMMITTED`, committedAt once, and persisted result rows/counts;
- add exactly one `badge.batch_committed` audit with only `batchId`, `classId`, `badgeTemplateId`, `issuedCount`, `alreadyIssuedCount`, `invalidCount`, `totalRows`.

Any snapshot, issuance, individual audit, batch update, or batch audit failure rolls back everything and leaves the batch `READY`.

## Idempotency and Concurrency

- A repeated request after commit parses and returns persisted final rows/counts; no writes/audits.
- Retry public-ID collisions narrowly with a small fixed maximum using exact Prisma/MariaDB constraint targets.
- Unrelated constraints/errors propagate.
- Concurrent individual/batch or batch/batch tuple conflicts must not produce duplicates.
- MariaDB repeatable-read cannot reliably observe a winning tuple inside a failed transaction. If a tuple conflict aborts the transaction, leave it fully, then retry the entire bounded batch from a fresh transaction. The fresh attempt sees the existing tuple and completes idempotently. Limit retries and never partially commit.
- Concurrent commit of the same batch must result in one committed batch, one batch audit, and one issuance/audit per new tuple. Use a guarded state transition/locking strategy proven against MariaDB.

## Unit Tests

Cover at minimum:

- role/ID/missing/inaccessible denial before writes;
- suspended/role-changed Faculty, inactive/non-owner class, archived/cross-class badge;
- expired/EXPIRED, malformed rows/mapping/counts, fingerprint mismatch, zero-ready;
- invalid rows excluded, preview existing rows refreshed, newly existing tuples converted idempotently;
- ready-recipient current-state failure aborts entire batch;
- exact snapshot inputs and one individual audit per new issuance;
- exact final rows/counts/status/timestamp and private-free batch audit;
- repeat committed return with no writes;
- narrow public-ID retry/exhaustion/unrelated errors;
- complete rollback seams for every failure boundary;
- individual issuance regression after primitive extraction;
- bounded complete-batch retry after tuple conflict.

## MariaDB Integration Tests

Using the existing Docker Compose `test` profile and deterministic bounded hooks:

- successful mixed batch creates exact issuance, individual audit, batch audit, and committed batch counts;
- forced individual/batch audit failure physically rolls back all new issuance/audit/batch changes;
- repeat commit creates no duplicate rows/audits;
- deterministic tuple conflict retries from a fresh transaction and finishes idempotently;
- concurrent same-batch commit produces exactly one finalization and stable results.

Clean fixtures safely. Do not expose DB ports or use production credentials.

## Verification

Run focused RED/GREEN, Phase 4 issuance unit/integration regressions, new MariaDB integration suite, format, lint, typecheck, full tests, production build.

## Report

Write `task-4-report.md` with exact files, RED/GREEN, primitive/transaction/integrity/concurrency decisions, unit and real MariaDB evidence, commands/results, concerns. Return only status, one-line verification summary, concerns. Git unavailable.
