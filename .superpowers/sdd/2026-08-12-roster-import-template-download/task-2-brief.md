# Task 2 Brief: Protected Class-Scoped Download Routes

## Context

Task 1 now provides `buildRosterCsvTemplate(): Uint8Array` and `buildRosterXlsxTemplate(): Promise<Uint8Array>` in `src/modules/rosters/services/roster-template.ts`. Add only the two protected Next.js download routes and their tests. Follow `AGENTS.md` and strict TDD. Do not modify the import UI.

## Files

- Create `src/app/api/classes/[classId]/roster/import/template.csv/route.ts`
- Create `src/app/api/classes/[classId]/roster/import/template.xlsx/route.ts`
- Create `src/app/api/classes/[classId]/roster/import/template-routes.test.ts`

## Required Behavior

1. Write route tests before production routes and verify RED because the modules are absent.
2. Each route must:
   - call `getCurrentActor()`;
   - enforce `requireRole(actor, "FACULTY")` before workspace access or generation;
   - call `getClassWorkspace(actor, classId)` so a non-owning Faculty is rejected;
   - generate the correct real template bytes only after authorization;
   - return `Cache-Control: private, no-store`;
   - catch failures and return JSON `{ error: "Forbidden" }`, status 403, with no attachment header.
3. CSV success response:
   - `Content-Type: text/csv; charset=utf-8`
   - `Content-Disposition: attachment; filename="roster-import-template.csv"`
   - non-empty real CSV bytes.
4. XLSX success response:
   - `Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
   - `Content-Disposition: attachment; filename="roster-import-template.xlsx"`
   - non-empty real XLSX bytes.
5. Automated denial cases for both formats: unauthenticated, Administrator, and non-owning Faculty. The Administrator must be rejected by `requireRole` before `getClassWorkspace`; the non-owner rejection can come from a narrow workspace dependency double because database access is external to the route test.
6. Do not duplicate authorization logic in helpers that bypass the existing policies.
7. Run focused tests, lint, and typecheck to green; self-review for server-only authorization ordering.

## Report

Write the full report to `.superpowers/sdd/2026-08-12-roster-import-template-download/task-2-report.md`. Include status, files created, RED/GREEN evidence, authorization cases, test results, and concerns. Return only status, a one-line test summary, and concerns. Git commits are unavailable.
