# Task 1 Brief — Batch Schema, Migration, and Contracts

## Required Reading

Read completely before editing:

- `AGENTS.md`
- `REQUIREMENTS.md`
- `docs/superpowers/specs/2026-08-14-phase-5-batch-issuance-design.md`
- `prisma/schema.prisma`
- Phase 4 issuance schema/migration/types
- This brief

Follow strict TDD. Do not implement validation services, preview/commit services, routes, actions, or UI.

## Files

- Modify `prisma/schema.prisma`
- Create `prisma/migrations/20260814_phase_5_batch_issuance/migration.sql`
- Create `src/modules/issuance/batch-types.ts`
- Create `src/modules/issuance/batch-types.test.ts`

## Prisma Model

Add `IssuanceBatchStatus` with exactly `READY`, `COMMITTED`, `EXPIRED`.

Add `IssuanceBatch` with:

- `id` CUID primary key
- restrictive relations to `Class`, `BadgeTemplate`, and Faculty `User`
- `classId`, `badgeTemplateId`, `facultyUserId`
- `sourceFilename` bounded varchar
- `mappingJson`, `rowsJson`
- `previewFingerprint` SHA-256 lowercase hex, unique or otherwise indexed to support integrity lookup without weakening batch identity
- integer counts: `totalRows`, `readyCount`, `alreadyIssuedCount`, `invalidCount`, `issuedCount` (default zero where appropriate)
- `status` default `READY`
- `expiresAt`, nullable `committedAt`, `createdAt`, `updatedAt`
- indexes for Faculty/class/status history and expiry cleanup

Use existing naming/mapping conventions and `onDelete: Restrict`. Add inverse relations to User, Class, and BadgeTemplate. Do not connect `BadgeIssuance` to the batch.

Create a forward-only MariaDB migration with exact table, enum, JSON, indexes, and restrictive foreign keys. Do not edit prior migrations.

## Contracts

Export explicit JSON-safe types and Zod runtime schemas for:

- `BatchRowDisposition`: exact literals `READY`, `ALREADY_ISSUED`, `DUPLICATE_IN_FILE`, `STUDENT_NOT_FOUND`, `NOT_ACTIVELY_ENROLLED`, `EMAIL_MISMATCH`, `INVALID`
- `BatchMapping`: required non-negative integer `studentNumber`; optional nullable non-negative integer `email`
- `BatchPreviewRow`: positive `rowNumber`, bounded normalized `studentNumber`, nullable `emailSupplied`, disposition, safe message, nullable `studentId`, `issuanceId`, `publicId`
- `BatchPreviewSummary`: batch identity/class/badge/source/status/timestamps/counts/fingerprint plus parsed rows
- `BatchCommitSummary`: same result counts/rows plus `alreadyCommitted`
- `BatchDetail`: authorized historical result suitable for server UI
- `BatchReportRow`: exact report projection

Enforce:

- SHA-256 fingerprint regex `^[a-f0-9]{64}$`
- non-negative counts and `totalRows = readyCount + alreadyIssuedCount + invalidCount` for preview summaries
- row identifiers are bounded strings; optional result IDs are nullable rather than `undefined`
- committed summary count consistency (`issuedCount + alreadyIssuedCount + invalidCount = totalRows` after finalization)
- exact status/disposition enums

Provide a single exported parser for stored JSON rows that throws the safe literal `Invalid batch snapshot` when parsing fails. Later services must not receive raw `Prisma.JsonValue`.

## Tests and Verification

Write tests first and prove RED because the module is missing. Cover every disposition, mapping constraints, row fields, fingerprint validation, malformed rows, preview count invariants, committed count invariants, and safe parser error.

Then run:

- focused Task 1 tests
- Prisma format and generate
- migration deploy against disposable/local Docker MariaDB
- `npm run format` (or format scoped files then repository check)
- `npm run lint`
- `npm run typecheck`
- `npm test`

## Report

Write `.superpowers/sdd/2026-08-14-phase-5-batch-issuance/task-1-report.md` with status, exact files, RED/GREEN evidence, schema/contract decisions, migration result, commands/results, and concerns. Return only status, one-line verification summary, and concerns. Git commits are unavailable.
