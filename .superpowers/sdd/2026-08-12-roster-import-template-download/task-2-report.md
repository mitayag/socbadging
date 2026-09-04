# Task 2 Report: Protected Roster Import Template Downloads

## Status

Complete.

## Files Created

- `src/app/api/classes/[classId]/roster/import/template.csv/route.ts`
- `src/app/api/classes/[classId]/roster/import/template.xlsx/route.ts`
- `src/app/api/classes/[classId]/roster/import/template-routes.test.ts`

## Requirement Coverage

- **FR-002 RBAC:** Both download routes require the `FACULTY` role before class lookup or template generation. Administrators, unauthenticated callers, and non-owning Faculty receive the same 403 response.
- **FR-006 Roster Import:** Added protected CSV and XLSX starter-template downloads with exact attachment and cache-control headers.

## TDD Evidence

### RED

The focused route test was written before either route existed. It failed as expected because Vite could not resolve `./template.csv/route` or `./template.xlsx/route`:

```text
Failed to resolve import "./template.csv/route" ... Does the file exist?
```

### GREEN

After the two minimal route modules were added, the focused test passed with 8 tests. A later typecheck exposed the DOM `BodyInit` incompatibility for `Uint8Array<ArrayBufferLike>`; the route body was changed to a fresh `ArrayBuffer`, then focused tests and typecheck passed.

## Authorization Review

Both handlers use this order:

1. `getCurrentActor()`
2. `requireRole(actor, "FACULTY")`
3. resolve `classId` and call `getClassWorkspace(actor, classId)`
4. generate and return bytes

The test suite covers both formats for unauthenticated callers, Administrators, and non-owning Faculty. Administrator denial asserts that the workspace dependency is not called, proving role rejection happens first. All error paths return `{ "error": "Forbidden" }` with status 403 and no attachment header.

## Verification Results

- Focused route tests: **8 passed**.
- Full suite: **19 files passed, 50 tests passed**.
- Lint: passed (`eslint . --max-warnings=0`).
- Typecheck: passed (`tsc --noEmit`).
- Assigned test-file formatting: passed.
- Production build: passed with the non-secret local test `DATABASE_URL`; the initial build invocation could not load configuration because this environment did not define `DATABASE_URL`.

## Concerns

- A repository-wide Prettier check still reports formatting in two unrelated, pre-existing coordination files: `.superpowers/sdd/2026-08-12-roster-import-template-download/progress.md` and `docs/superpowers/plans/2026-08-12-roster-import-template-download.md`. They are outside this task's allowed file scope and were not changed.
