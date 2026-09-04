# Task 6 Report: Signed Batch Issuance

## Status

Implementation and review fix round 2 are complete pending final re-review. Batch signing preserves
preview-before-commit, deterministic reviewed-row order, and one atomic final transaction. Work used
only the disposable Phase 8 MariaDB database; live data and credentials were not changed.

## Requirements Mapping

- **FR-002:** Faculty identity, current account state, class ownership, and badge ownership are
  revalidated server-side.
- **FR-011:** reviewed batch rows are claimed, signed with bounded concurrency, and committed as one
  prepared set.
- **FR-012 / FR-015:** unique immutable credentials persist verified signed Open Badges documents,
  signing-key metadata, serializer version, and status allocation.
- **FR-020:** issuance audits, notification outbox rows, and the batch audit share the final atomic
  transaction.

## Batch Signing Implementation

- A short transaction changes `READY` to a leased `SIGNING` claim before signer I/O and reserves all
  new `(class, badge template, student)` tuples under a unique database constraint.
- The same tuple-reservation table protects individual issuance, preventing batch/individual and
  overlapping-batch races from producing discarded signatures.
- A one-minute heartbeat renews the five-minute batch claim and every tuple reservation while slow
  signing is in progress. A lost claim aborts finalization.
- Signing remains outside database transactions. The worker pool is bounded to 1–16 and writes
  results into reviewed-row index slots, preserving deterministic order.
- The final transaction requires the exact batch ID, preview fingerprint, claim version, claim token,
  and matching prepared tuple claims. Any raced duplicate or `alreadyIssued` result aborts the whole
  prepared set; rows are never filtered after signing.
- Claim and tuple reservations are removed atomically on commit, or released when preparation/final
  commit fails. Individual public-ID collision retries explicitly release their reservation first.
- Only actual `SignedIssuanceError` signer failures become the exact safe batch message. Authorization,
  state, validation, and database errors retain their distinct safe behavior.
- Production APIs accept no injected signer. Deterministic signer seams are available only through
  explicitly named helpers that reject calls unless `NODE_ENV === "test"`.
- Batch detail/history schemas accept active `SIGNING`; expired `READY` or `SIGNING` records project
  safely as `EXPIRED`.

## Schema and Migration

- Added `SIGNING` to `IssuanceBatchStatus`.
- Added batch claim token, monotonically increasing version, and lease-expiry columns.
- Added `issuance_tuple_reservations` with a unique issuance-tuple key, batch/student key, claim and
  expiry indexes, and batch foreign key.
- Migration: `prisma/migrations/20260827_phase_8_batch_signing_claims/migration.sql`.

## Targeted Verification

- Prisma formatting and client generation: passed.
- Focused unit/service/schema tests: **5 files, 123 tests passed** (including heartbeat and public-ID
  reservation release coverage).
- Direct Task 6/Task 5 unit boundary: **3 files, 84 tests passed**.
- Affected MariaDB integration suites: **4 files, 37 tests passed**.
- Full unit/component regression: **95 files, 653 tests passed**.
- Full MariaDB integration regression: **12 files, 75 tests passed**.
- TypeScript typecheck: passed.
- Repository ESLint with zero warnings: passed.
- Next.js production build: passed with the existing dynamic-dependency warning in
  `src/modules/open-badges/proof.ts`.

MariaDB coverage proves same-batch concurrency signs once, overlapping batches reserve before
signing, individual duplicate requests produce one visible credential, and
authorization/audit/outbox/issuance writes remain atomic. Batch/individual concurrency shares the
same database uniqueness constraint and service reservation path, but that exact cross-mode pairing
is not claimed as directly exercised here.

## Files Added or Modified in Task 6 and Review Fixes

- `prisma/schema.prisma`
- `prisma/migrations/20260827_phase_8_batch_signing_claims/migration.sql`
- `src/modules/issuance/batch-types.ts`
- `src/modules/issuance/services/batch-preview-service.ts`
- `src/modules/issuance/services/batch-preview-service.test.ts`
- `src/modules/issuance/services/batch-commit-service.ts`
- `src/modules/issuance/services/batch-commit-service.test.ts`
- `src/modules/issuance/services/batch-commit-service.integration.test.ts`
- `src/modules/issuance/services/signed-issuance-service.ts`
- `src/modules/issuance/services/signed-issuance-service.test.ts`
- `src/modules/issuance/services/signed-issuance-service.integration.test.ts`
- `src/modules/issuance/services/issuance-service.ts`
- `src/modules/issuance/services/issuance-service.test.ts`
- `src/modules/issuance/services/issuance-service.integration.test.ts`
- `src/modules/issuance/services/revocation-service.integration.test.ts`
- `src/app/classes/[classId]/issued/batch-actions.ts`
- `src/app/classes/[classId]/issued/batch-actions.test.ts`
- `src/components/issuance/batch-issuance-wizard.tsx`
- `src/components/issuance/batch-issuance-wizard.test.tsx`
- `src/components/issuance/batch-result.tsx`
- `src/components/issuance/batch-result.test.tsx`
- `src/components/issuance/batch-issuance-section.tsx`
- `.superpowers/sdd/2026-08-25-phase-8-open-badges-issuer-conformance/progress.md`
- `.superpowers/sdd/2026-08-25-phase-8-open-badges-issuer-conformance/task-6-report.md`

## Remaining Finding

- The large batch and signed-issuance services should be decomposed in a later maintenance pass; this
  is deferred to avoid destabilizing the now-tested transaction and concurrency boundaries.
