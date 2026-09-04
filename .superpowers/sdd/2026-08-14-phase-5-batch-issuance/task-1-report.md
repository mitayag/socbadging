# Task 1 Report — Batch Schema, Migration, and Contracts

## Status

Complete.

## Requirement Mapping

- FR-011: establishes the persisted, expiring batch-preview aggregate and validated preview/commit result contracts.
- FR-012 and FR-015: preserves existing issuance history by keeping batch rows independent of `BadgeIssuance` and exposing nullable historical issuance/public identifiers only.
- FR-020, FR-021, and FR-022: provides the safe batch history/result and report-row boundaries consumed by later authorized audit, history, and reporting services.
- Acceptance criteria 7, 8, 9, and 15: provides the migration and runtime-validated foundations; workflow, issuance, and authorization behavior remain for later tasks.

## Exact Files

- Modified `prisma/schema.prisma`.
- Created `prisma/migrations/20260814_phase_5_batch_issuance/migration.sql`.
- Created `src/modules/issuance/batch-types.ts`.
- Created `src/modules/issuance/batch-types.test.ts`.
- Created this report.

## RED / GREEN Evidence

- RED: `npm test -- src/modules/issuance/batch-types.test.ts` failed because `./batch-types` did not exist.
- GREEN: after the minimal schema/contract implementation, the focused suite passed: 1 file, 8 tests.
- Review-fix RED: after adding named cardinality and disposition-reconciliation tests, the focused suite failed five assertions because malformed/truncated summary rows were accepted.
- Review-fix GREEN: shared summary reconciliation made the focused suite pass: 1 file, 14 tests.
- The tests cover all seven dispositions, mapping bounds, positive source row numbers, bounded row identifiers, nullable result IDs, lowercase SHA-256 fingerprints, malformed rows, preview/final count invariants, row-array cardinality, disposition-derived counts, committed result identifiers, the safe stored-row parser error, and report projection fields.

## Schema and Contract Decisions

- Added `IssuanceBatchStatus` with only `READY`, `COMMITTED`, and `EXPIRED`.
- Added `IssuanceBatch` with CUID identity; restrictive Class, BadgeTemplate, and Faculty User relations; JSON mapping/rows; a non-unique indexed SHA-256 fingerprint; counts; status/timestamps; history and expiry indexes. `BadgeIssuance` was intentionally left unrelated.
- The forward-only MariaDB migration creates `issuance_batches` with JSON columns, exact enum values, named indexes, and three `ON DELETE RESTRICT` foreign keys.
- `batch-types.ts` exports explicit JSON-safe types and strict Zod schemas. Stored rows are accepted only through `parseStoredBatchRows`, which always throws the safe literal `Invalid batch snapshot` on invalid input.
- Every preview, commit, and detail schema requires `rows.length = totalRows` and derives ready/already-issued/invalid counts from the actual stored row dispositions. Preview summaries require `totalRows = readyCount + alreadyIssuedCount + invalidCount`; commit summaries require `totalRows = issuedCount + alreadyIssuedCount + invalidCount`.
- A committed successful row remains `READY` because the approved enum has no `ISSUED` value. Its non-null issuance and public identifiers are the explicit finalization representation. `ALREADY_ISSUED` rows also require both identifiers; other preview/invalid rows require neither. This preserves the approved enum without inventing a new disposition.

## Commands and Results

- `npx prisma format` — passed with the repository's disposable local `DATABASE_URL` supplied.
- `npm run db:generate` — passed.
- Initial `npm test -- src/modules/issuance/batch-types.test.ts` — passed, 1 file / 8 tests.
- Review-fix `npm test -- src/modules/issuance/batch-types.test.ts` — passed, 1 file / 14 tests after RED proof of five failures.
- Rebuilt Docker migration run: `docker compose run --build --rm migrate` with disposable MariaDB configuration — passed; discovered 7 migrations and applied `20260814_phase_5_batch_issuance`.
- `npm run format` — passed.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed, 33 files / 153 tests.
- `npm run build` — passed.

## Concerns

None. This task deliberately does not add validation, preview/commit services, routes, actions, UI, audit writes, or authorization behavior; those belong to later approved tasks.
