# Task 5 Report: Protected Batch Boundaries

## Outcome

Implemented the protected batch file inspection, preview, template download, report download, and commit boundaries. No Task 6 UI was implemented.

## TDD Evidence

- RED: `npm test -- src/modules/issuance/services/batch-template.test.ts src/app/api/issuance-batches/batch-routes.test.ts 'src/app/classes/[classId]/issued/batch-actions.test.ts'`
  - Expected missing-module failures for all three new areas.
- GREEN focused suite:
  - `src/modules/issuance/services/batch-template.test.ts`
  - `src/modules/issuance/services/batch-preview-service.test.ts`
  - `src/app/api/issuance-batches/batch-routes.test.ts`
  - `src/app/classes/[classId]/issued/batch-actions.test.ts`

## Final Verification

- `npm run format`: PASS
- `npm run lint`: PASS
- `npm run typecheck`: PASS
- `npm test`: PASS — 40 files, 281 tests
- `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build`: PASS — Next.js 16.3 production build and all new dynamic routes compiled

## Files Created

- `src/app/api/classes/[classId]/issued/batch/inspect/route.ts`
- `src/app/api/classes/[classId]/issued/batch/preview/route.ts`
- `src/app/api/classes/[classId]/issued/batch/template.csv/route.ts`
- `src/app/api/classes/[classId]/issued/batch/template.xlsx/route.ts`
- `src/app/api/issuance-batches/[batchId]/report/route.ts`
- `src/app/api/issuance-batches/batch-routes.test.ts`
- `src/app/classes/[classId]/issued/batch-actions.ts`
- `src/app/classes/[classId]/issued/batch-actions.test.ts`
- `src/modules/issuance/services/batch-template.ts`
- `src/modules/issuance/services/batch-template.test.ts`
- `.superpowers/sdd/2026-08-14-phase-5-batch-issuance/task-5-report.md`

## Files Modified

- `src/modules/issuance/services/batch-preview-service.ts` — added a server-only, active Faculty/class/badge selection authorization query used by stateless inspection/template preparation.
- `src/modules/issuance/services/batch-preview-service.test.ts` — added active ownership/role authorization coverage for that selection boundary.

## Requirement Mapping

- FR-011 and acceptance criteria 7–8: protected upload inspection and mandatory stored preview boundaries; commit accepts only a validated batch ID.
- FR-012 and acceptance criterion 9: commit delegates solely to the established atomic batch domain service that creates unique immutable credentials.
- FR-020: no boundary bypasses the preview/commit services that own atomic audit behavior.
- FR-021: report retrieval delegates to the role-scoped batch-detail service.
- FR-022: private BOM CSV report plus CSV/XLSX instructional template downloads.
- Acceptance criterion 15: explicit unauthenticated, Administrator mutation, ownership selection, validation, download-header, report, and Server Action tests.

## Scope Notes

- Templates contain only fictitious `example.edu` data and exact `Student Number`, `Email` headers.
- Downloads use `private, no-store`; denied report responses have no attachment header.
- Preview output is runtime-validated against `BatchPreviewSummary` before serialization.
- Task 6 wizard/history/result UI remains intentionally unimplemented.

## Independent Review Fixes

- Active class and active database Faculty authorization is now enforced before template downloads and before reading inspect/preview request bodies.
- Multipart inspection requires a bounded `Content-Length` and rejects over-limit requests with 413 before buffering; preview JSON is read through a 1.5 MB streaming cap and rejects declared or observed over-limit bodies with 413.
- Route authorization/malformed/denial coverage now includes inspect, preview, both templates, and reports, including non-owner and archived-class behavior.
- All success and error responses explicitly use `Cache-Control: private, no-store`; denials never receive attachment headers.
- Final independent review: spec compliance APPROVED; code quality APPROVED; no Critical, Important, or Minor findings.
