# Task 4 Report — Atomic Batch Commit and MariaDB Concurrency

## Status

Implemented the Phase 5 batch commit domain service and the reusable Phase 4 transaction-client issuance primitive. The change covers FR-011 (review-bound atomic batch commit), FR-012 and FR-015 (immutable credential/public identifiers and Phase 4 snapshots), FR-020 (one individual audit per new issuance plus one private-safe batch audit), and acceptance criteria 7, 9, and 15. No routes, actions, templates, reports, schema changes, migrations, or UI were added.

## Exact Files

- Created `src/modules/issuance/services/batch-commit-service.ts`.
- Created `src/modules/issuance/services/batch-commit-service.test.ts`.
- Created `src/modules/issuance/services/batch-commit-service.integration.test.ts`.
- Modified `src/modules/issuance/services/issuance-service.ts` to extract `createBadgeIssuanceInTransaction` without changing the individual issuance entry-point authorization or race recovery.
- Modified `src/modules/issuance/services/issuance-service.test.ts` for direct primitive and individual regression coverage.
- Modified `src/modules/issuance/services/batch-validation.ts` to add the narrowly versioned `batch-preview-v2` stored canonical fingerprint payload and committed-row transition verification.
- Modified `src/modules/issuance/services/batch-preview-service.ts` and `batch-preview-service.test.ts` to persist and retrieve the v2 payload.
- Created this report.

## RED / GREEN Evidence

- Initial RED: `npm test -- src/modules/issuance/services/batch-commit-service.test.ts` failed because `./batch-commit-service` did not exist.
- Primitive RED: the added direct extraction regression failed with `createBadgeIssuanceInTransaction is not a function`; the Phase 4 extraction then made the issuance suite green.
- Initial GREEN: focused batch commit plus issuance tests passed 2 files / 48 tests.
- Review RED: named tests proved the service made zero authoritative locking reads and accepted the legacy v1 fingerprint payload whose hash did not bind reviewed dispositions.
- Review GREEN: shared MariaDB row locks and the v2 canonical stored payload made the focused validation/preview/commit/issuance suite pass. A named regression rejects changing a reviewed `NOT_ACTIVELY_ENROLLED` row into an unreviewed `READY` candidate.
- MariaDB regression: an initial exclusive-lock implementation blocked the deterministic individual/batch race. Replacing exclusive parent locks with `LOCK IN SHARE MODE` preserved state immutability while allowing compatible issuance FK reads.
- Repeatable-read RED: a named real MariaDB regression committed enrollment removal after the initial batch read but before recipient lock acquisition; the service incorrectly issued from the earlier snapshot.
- Repeatable-read GREEN: all authoritative User/Class/Badge/Student/Enrollment values now come directly from full locking-read results. A MariaDB 1020 record-change response is fail-closed as `BatchUnavailableError`, while unrelated raw errors still propagate. The real suite passed 2 files / 11 tests.

## Primitive and Transaction Decisions

- `createBadgeIssuanceInTransaction` accepts an existing Prisma transaction plus already loaded/validated class, badge, student, enrollment, issuer, and `issuedAt`. It opens no transaction and performs no authorization query.
- The primitive retains the exact Phase 4 snapshot inputs, expiry calculation, maximum three exact-target public-ID attempts, one `BadgeIssuance`, and one identifier-only `badge.issued` audit.
- Individual `issueBadge` still denies non-Faculty before its transaction; revalidates active database Faculty, owned active class/badge, active enrollment, and duplicates; and retains fresh-read MariaDB tuple-race recovery.
- Each batch attempt uses one `issuedAt`. A guarded `READY` + owner + unexpired `updateMany` temporarily transitions the batch to `COMMITTED`, acquiring the batch-row claim. Any later error rolls the transition back. A second same-batch transaction waits, receives a zero claim after the winner commits, and returns the persisted result with `alreadyCommitted: true` without writes.
- User, class, badge, ready Students, and enrollments are loaded as full authoritative records by deterministic MariaDB shared locking reads and protected through finalization. The service validates values from those locking-query results directly instead of performing later snapshot-backed ORM reads. Shared locks block suspension/archive/enrollment mutation while remaining compatible with concurrent issuance FK checks. If MariaDB reports exact code 1020 because a row changed between the earlier batch snapshot and lock acquisition, the transaction safely fails as unavailable.
- Exact issuance-tuple P2002 targets alone retry the whole batch, at most three attempts, from a fresh transaction. Public-ID retries remain narrow inside the primitive. Unrelated errors propagate.

## Integrity and Finalization Decisions

- The existing JSON column stores a `batch-preview-v2` canonical payload containing the normalized mapping, mapped source representation, and original reviewed classified rows. Its SHA-256 fingerprint binds class, badge, source filename, mapping, source order/content, dispositions, messages, student IDs, and preview result IDs.
- No migration was needed because the payload uses the already migrated JSON column. Legacy v1 previews are rejected safely as unavailable instead of committing a candidate set whose classifications cannot be cryptographically proven.
- READY/EXPIRED snapshots must match the reviewed rows exactly. Committed snapshots permit only reviewed `READY` rows to finish as `READY` or become authoritative `ALREADY_ISSUED`, and permit reviewed `ALREADY_ISSUED` rows only to refresh authoritative identifiers. Invalid/excluded rows must remain byte-for-byte equivalent at the contract field level.
- Commit uses bounded set reads for ready Students/enrollments and all candidate issuance tuples. Any current ready-recipient identity/email/enrollment failure aborts the whole transaction. Newly existing tuples become `ALREADY_ISSUED`; preview-existing tuples are refreshed; invalid rows remain excluded.
- Final counts are derived from finalized rows. Every new issuance and individual audit, the final batch update, and exactly one private-safe `badge.batch_committed` audit share one transaction.

## Unit Evidence

- Focused validation/preview/commit/issuance suite: 4 files / 102 tests passed.
- Batch commit coverage includes entry role/ID checks, stale Faculty, ownership/status, expiry/status, malformed mapping/rows/counts/fingerprint, v1 rejection, disposition tampering, zero-ready, current recipient state, bounded set reads and locks, exact 1020 fail-closed behavior across all five authoritative lock targets, unchanged propagation of unrelated raw-lock errors, invalid exclusion, authoritative existing refresh/conversion, exact primitive inputs/final rows/counts/audit, repeat commit, failure seams, exact tuple retry/exhaustion, and unrelated errors.
- Phase 4 issuance coverage includes the direct primitive snapshot/audit contract, public-ID retry/exhaustion/unrelated constraints, individual authorization/idempotency, rollback, and MariaDB tuple recovery.

## Real MariaDB Evidence

`npm run test:integration:docker` ran through the existing Docker Compose `test` profile against MariaDB 11.8 without exposing a database port or adding credentials to the repository: 2 files / 11 tests passed.

The eight new MariaDB cases prove:

- exact successful mixed-batch issuance, individual audit, batch audit, and committed counts;
- physical rollback when the second of two READY rows reaches a forced individual-audit failure;
- physical rollback of two issuances/two individual audits/final batch update when the batch audit fails;
- repeat commit creates no duplicate issuance or audit;
- deterministic individual/batch tuple conflict exits the failed transaction, retries fresh, and completes idempotently;
- shared authoritative enrollment locks serialize a concurrent state mutation after finalization;
- enrollment removal committed after the initial batch snapshot but before recipient lock acquisition aborts without issuance;
- concurrent same-batch commits produce one stable issuance, one individual audit, and one batch audit.

The same run also passed all three Phase 4 MariaDB issuance regressions.

## Verification

- `npm run format` — passed.
- `npm run lint` — passed with zero warnings.
- `npm run typecheck` — passed.
- `npm test` — passed, 37 files / 240 tests.
- Docker MariaDB integration — passed, 2 files / 11 tests.
- `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build` — passed; optimized Next.js production build completed.

## Concerns

- The full unit run emits Node's pre-existing `DEP0129` child-process deprecation warning while still passing all tests. No Task 4 application warning or failure was observed.
- Legacy v1 READY previews are intentionally fail-closed after the v2 integrity strengthening. Phase 5 has not been released and new previews are written as v2; no migration is required for the already migrated JSON column.
