# Task 2 Brief — File Inspection, Mapping, Classification, Fingerprint, and CSV

## Required Reading

Read `AGENTS.md`, `REQUIREMENTS.md`, the approved Phase 5 design, Task 1 batch contracts, existing roster parser/validation/CSV utilities, and this brief completely. Follow strict TDD. Do not add database preview/commit services, routes, actions, schema changes, or UI.

## Files

- Create `src/modules/issuance/services/batch-validation.ts`
- Create `src/modules/issuance/services/batch-validation.test.ts`
- Create `src/modules/issuance/services/batch-report.ts`
- Create `src/modules/issuance/services/batch-report.test.ts`
- Modify `src/modules/rosters/services/import-parser.ts` only if a generic bounded parser extraction is necessary and fully regression tested

## Required Interfaces

- `inspectBatchFile(file): Promise<{ headers: string[]; rows: string[][] }>`
- `normalizeBatchMapping(input, columnCount): BatchMapping`
- `mapBatchRows(rows, mapping): MappedBatchRow[]`
- `classifyBatchRows(input): { rows: BatchPreviewRow[]; totalRows; readyCount; alreadyIssuedCount; invalidCount }`
- `fingerprintBatchPreview(input): string`
- `buildBatchReportCsv(rows: BatchReportRow[]): Uint8Array`

Keep classification pure. It consumes explicit set-based lookup structures supplied by later database services:

- known students keyed by normalized student number with id and normalized stored email
- active enrolled student IDs
- existing issuance tuple results keyed by student ID with issuance/public IDs

## Inspection and Mapping

- Accept only `.csv` and `.xlsx` using the existing hardened file-size and parser limits.
- Reject unsupported extension/MIME, oversized input, empty file, missing header, zero data rows, or excessive row count with safe messages.
- Required mapping: non-negative Student Number column index.
- Optional Email mapping: non-negative index or null/omitted `Do Not Map`.
- Reject indexes outside the actual header width and reject Student Number and Email mapped to the same column.
- Preserve one-based spreadsheet source row numbers, counting header as row 1 so first data row is row 2.
- Normalize student numbers by trimming; preserve bounded display value and use exact normalized lookup semantics consistent with current student numbers.
- Normalize optional emails with `trim().toLowerCase()`; empty mapped email is treated as not supplied.

## Classification and Precedence

Every row receives exactly one disposition. Use this precedence:

1. `INVALID` for empty/malformed/bounded-invalid student number or structurally unsafe row.
2. `DUPLICATE_IN_FILE` when an earlier row already used the same normalized non-empty student number; first row wins.
3. `STUDENT_NOT_FOUND`.
4. `NOT_ACTIVELY_ENROLLED`.
5. `EMAIL_MISMATCH` when a non-empty optional email was supplied and differs from normalized stored email.
6. `ALREADY_ISSUED`, including existing issuance/public identifiers.
7. `READY`.

Invalid count includes all dispositions except `READY` and `ALREADY_ISSUED`. Student IDs are present only where authoritative lookup succeeded. Result identifiers are nullable. Messages are exact, safe, concise, and do not expose stored private email.

## Fingerprint

Return lowercase SHA-256 hex over a canonical explicit representation containing class ID, badge template ID, source filename, normalized mapping, and mapped rows in source order. Construct canonical arrays/keys explicitly; do not rely on uncontrolled object key order. Tests must prove stability for semantically identical input and change when any bound value/row/order changes.

## CSV Report

Emit BOM-prefixed UTF-8 with CRLF and literal header order:

1. `Row Number`
2. `Student Number`
3. `Email Supplied`
4. `Disposition`
5. `Message`
6. `Issuance ID`
7. `Public ID`

Reuse the existing formula-safe quoting convention. Protect cells whose first non-whitespace character is `=`, `+`, `-`, or `@`. Round-trip through the existing parser. No credential JSON or stored email is included.

## TDD and Verification

Write focused tests before production modules and prove RED. Cover CSV/XLSX, all rejection cases, mapping bounds/collision, source rows, all dispositions/precedence, normalization, exact counts, fingerprint stability/change cases, literal headers, BOM/CRLF, Unicode, escaping, formula safety, and round-trip.

Run focused tests, roster parser/validation regressions, repository format, lint, typecheck, full tests, and production build.

## Report

Write `task-2-report.md` in this SDD workspace with exact files, RED/GREEN evidence, parser/classification/fingerprint/report decisions, commands/results, and concerns. Return only status, one-line verification summary, and concerns. Git commits are unavailable.
