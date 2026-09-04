# Task 2 Report — File Inspection, Mapping, Classification, Fingerprint, and CSV

## Status

Implemented the pure Phase 5 batch inspection, mapping, row-classification, fingerprint, and report helpers only. This task covers FR-011 (validated upload/preview input), FR-012 (existing issuance identifiers in idempotent preview rows), FR-021 (safe row classification data), and FR-022 (safe validation/result CSV reports). No database service, route, action, schema, or UI code was added.

## Files

- Created `src/modules/issuance/services/batch-validation.ts`.
- Created `src/modules/issuance/services/batch-validation.test.ts`.
- Created `src/modules/issuance/services/batch-report.ts`.
- Created `src/modules/issuance/services/batch-report.test.ts`.
- Created this report. The existing roster parser was not modified; batch inspection reuses it after batch-specific extension/MIME and safe-message checks.

## TDD Evidence

- RED: `npm test -- src/modules/issuance/services/batch-validation.test.ts src/modules/issuance/services/batch-report.test.ts` failed with the expected unresolved `./batch-validation` and `./batch-report` module errors before either production module existed.
- GREEN: the same focused command then passed with 2 files / 25 tests.
- Refactor regression: after replacing the local parsing code with the existing roster parser, the focused regression suite exposed `ReferenceError: asCell is not defined` in `mapCell`. The exact cause was the refactor removing a shared scalar-normalization helper. Restoring that one helper made the same 4-file focused regression suite pass, 30 tests total.
- Additional RED/GREEN: a classification test changed an empty mapped student number to carry no precomputed invalid reason. It failed as `STUDENT_NOT_FOUND`, proving classification itself lacked the required invalid-row guard. The minimal guard now produces `INVALID`; the same focused regression suite again passes, 30 tests total.
- Review round 1 RED: named tests for an all-empty XLSX header, a case-variant canonical student-number key, case-variant first-row-wins classification, and canonical-key fingerprint binding failed (4 failures). The blank CSV test also remains named and covered. GREEN: inspection rejects all-empty headers, mapped rows carry a lowercase canonical lookup key while retaining the display value, classification uses that key for lookup/duplicates, and fingerprint binds it; the focused + roster regression suite passes 4 files / 35 tests.

## Decisions

- Inspection accepts CSV/XLSX only, permits empty MIME values emitted by browsers plus the relevant known MIME values, applies the established 2 MiB/5,000-row bounds, and returns safe batch-specific errors.
- Batch validation is explicitly `server-only`, preventing Node crypto/XLSX parsing from entering a client boundary.
- Mapping requires a distinct, in-range Student Number column; optional Email normalizes `Do Not Map` to `null`. Mapped rows retain source row numbers beginning at 2, preserve a bounded trimmed student-number display value, and carry the lowercase canonical student-number key used for duplicate detection and authoritative lookups. Supplied email normalizes to lowercase.
- Classification is database-free and consumes caller-provided maps/sets. It applies the approved INVALID → duplicate → unknown → inactive → email mismatch → already-issued → ready precedence; messages never contain a stored email. `invalidCount` includes every disposition except READY and ALREADY_ISSUED.
- The fingerprint hashes an explicit canonical array containing class/badge/source identity, normalized mapping, and source-order mapped rows including the canonical student-number key, producing lowercase SHA-256 hex without object-key-order dependence.
- Reports use the exact literal headers, BOM-prefixed UTF-8, CRLF, and the existing formula-safe quoted-cell convention. They include only supplied email, never a stored email or credential JSON.

## Verification

- `npm run format:write` — passed.
- `npm run format` — passed after the final implementation change.
- Focused + roster regression tests — passed: 4 files / 30 tests.
- `npm run lint` — passed.
- `npm run typecheck` — passed.
- Full repository suite — passed after review round 1: 35 files / 183 tests.
- Production build — passed after review round 1: optimized Next.js production build completed.

## Concerns

- None for Task 2.
