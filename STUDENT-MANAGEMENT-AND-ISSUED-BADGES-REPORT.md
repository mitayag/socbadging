# Student Management Redesign and Issued Badges Fix — Report

**Date:** 3 November 2026  
**Status:** COMPLETE  
**Scope:** Local development only  
**Deployment:** Not performed; no commit, push, or merge

## 1. TODO completion

### Workstream A — Student Account Management

- [x] Reused the Faculty Management table layout, toolbar, pagination, dialog, and action patterns.
- [x] Replaced stacked cards with a responsive, scrollable data table.
- [x] Added columns: Student Number, Full Name, Email, Portal Status, Actions.
- [x] Added an Add Student disclosure and form.
- [x] Added optional activation email when creating a student.
- [x] Added Edit with student number, name, and email updates.
- [x] Added Delete with a confirmation dialog and portal-account deactivation.
- [x] Added search by student number, name, and email.
- [x] Added status filters: All, Not Activated, Invited, Active, Suspended, Deactivated.
- [x] Added sorting by student number, name, and status.
- [x] Added a 550px scroll viewport with sticky headers and horizontal scrolling.
- [x] Added 5/10/25/50 pagination with 5 as the default.
- [x] Preserved activation, invitation, and password-setup flows.
- [x] Added Resend Invitation for invited students.
- [x] Enforced Administrator-only management.
- [x] Prevented duplicate portal accounts through the existing `StudentAccount.studentId` uniqueness.
- [x] Preserved historical ownership through `StudentAccount.studentId`, not email matching.
- [x] Deletion/deactivation does not remove issued badges, student records, or class assignments.
- [x] Suspended and deactivated accounts cannot authenticate; public verification continues to work.
- [x] Preserved existing student records and class assignments.

### Workstream B — Issued Badges

- [x] Reproduced “This page couldn’t load” locally.
- [x] Identified the failing route, render path, and exception.
- [x] Inspected browser and server logs.
- [x] Confirmed the failure was server-side data loading, not client rendering.
- [x] Verified the affected issuance relationships and malformed snapshot rows.
- [x] Identified the root cause before changing code.
- [x] Repaired the list/detail/export failure without deleting data or returning an empty page.
- [x] Preserved authorization, scoping, status calculations, verification, revocation, expiration, and downloads.
- [x] Added regression tests.
- [x] Confirmed the page renders with existing database records.
- [x] Confirmed search, filters, pagination, and valid record-detail navigation.

## 2. Issued Badges root cause

**Affected page/route:** `GET /issued` server component (`src/app/issued/page.tsx`).

**Exception:**

```text
Error: Invalid recipient snapshot
    at parseSnapshot (src/modules/issuance/services/issuance-query-service.ts)
    at toDetail (src/modules/issuance/services/issuance-query-service.ts)
    at toListRecord (src/modules/issuance/services/issuance-query-service.ts)
    at listIssuances (src/modules/issuance/services/issuance-query-service.ts)
```

The production-server log reported digest `1321768989`; the browser received HTTP 500 and React
error #441. No API request was involved.

**Trigger:** The local application database contains 27 issuance rows whose snapshot JSON
columns are `{}` (for example `phase8-task2-issuance-*` and `phase8-status-issuance-*`). These
are leftover test artifacts from earlier integration work, not valid credentials.

**Why it crashed:** `listIssuances` called a strict `toDetail`/`parseSnapshot` path for every
row. The first malformed recipient snapshot threw, taking down the entire SSR page.

**Repair:**

- List projection now uses `safeParse` for recipient, achievement, and issuer snapshots and no
  longer parses credential JSON that the list does not display.
- Invalid rows render visibly as **Credential data unavailable** / **UNAVAILABLE** with their
  public ID, issue date, status, and a disabled detail action. They are not silently hidden.
- Valid rows keep their normal badge, recipient, class, status, and View Details behavior.
- `getIssuanceDetail` returns a safe not-found result for malformed snapshots instead of a 500.
- CSV export tolerates malformed rows and emits an empty recipient email rather than failing.
- A redacted server warning records only the issuance ID and snapshot-validity booleans.

No database rows were deleted or replaced.

## 3. Files modified

### Workstream A

- `src/app/students/page.tsx`
- `src/app/students/actions.ts`
- `src/components/student/student-row-actions.tsx` (new)
- `src/modules/student/services/student-account-service.ts`
- `src/modules/student/services/student-account-service.integration.test.ts`
- `src/app/globals.css`
- `e2e/student-management.spec.ts` (new)
- `e2e/global-setup.ts`

### Workstream B

- `src/modules/issuance/services/issuance-query-service.ts`
- `src/modules/issuance/services/issuance-query-service.test.ts`
- `src/components/issuance/issuance-list.tsx`
- `src/app/globals.css`
- `e2e/dashboard-and-user-menu.spec.ts`
- `e2e/global-setup.ts`

No schema change or migration was required.

## 4. Tests executed

| Check                                 | Result                      |
| ------------------------------------- | --------------------------- |
| Format                                | PASS                        |
| Lint                                  | PASS                        |
| Typecheck                             | PASS                        |
| Unit tests                            | PASS — 115 files, 836 tests |
| Integration tests (clean migrated DB) | PASS — 19 files, 131 tests  |
| Production build                      | PASS                        |
| Playwright, desktop project           | PASS — 25 passed            |
| Playwright, mobile project            | PASS — 24 passed, 1 skipped |
| Live local smoke test                 | PASS                        |

Playwright coverage added/updated:

- `e2e/student-management.spec.ts`: table headers, default 5-row page, create, search,
  edit, status filter, sort, delete/deactivate, deactivated login denial, public credential
  verification after deactivation, Faculty access denial, mobile horizontal scrolling, and
  screenshots.
- `e2e/dashboard-and-user-menu.spec.ts`: loads `/issued` with an intentionally malformed
  snapshot fixture and asserts the unavailable-row fallback. This test failed as a 500 before
  the repair.

The combined desktop+mobile invocation retains the previously documented shared fixed-window
rate-limit limitation. The projects pass fully when run separately, which is how the final
results above were produced.

## 5. Student Management CRUD confirmation

- **Create:** Administrator created a student record; it appeared immediately in the table as
  Not Activated. Duplicate student numbers and emails are rejected.
- **Read/search/filter/sort/paginate:** Verified by number, full name, email, status, sort, and
  5-row pages with total/page metadata.
- **Edit:** Updated the student number, name, and email; the linked portal User name/email is
  kept in sync and sessions are invalidated when an account exists.
- **Delete/deactivate:** Confirmed with a dialog; the portal User becomes `DELETED` with
  `deletedAt`, sessions and unused tokens are revoked, and the Student, StudentAccount, class
  enrollment, and issued badge records remain.
- **Reactivate:** A deactivated account can be activated again; `deletedAt` is cleared.
- **Authorization:** Faculty users are redirected away from `/students`; all service operations
  enforce Administrator role server-side.
- **Ownership:** The existing StudentAccount-to-student association is unchanged; the same-email
  ownership isolation test passes.

Live local read verification showed 48 existing student records, 5 rows by default, working
search, the Add Student form, and the expected table columns. CRUD was exercised against the
disposable local E2E database so the real local records were not altered.

## 6. Issued Badges confirmation

- `GET /issued` now returns HTTP 200 with existing records and no browser/server errors.
- The live page rendered 18 unavailable legacy records on page 1 alongside valid credentials.
- Valid rows retain status, public ID, recipient, and View Details navigation.
- Malformed rows show a clear unavailable state; their detail links are disabled and direct
  detail requests return a safe not-found result.
- Search, status filters, pagination, CSV export, credential status, public verification, and
  downloads continue to work. The live public verification page for an active credential
  returned “Active credential”.

## 7. Screenshots

- `docs/screenshots/student-management-desktop.png`
- `docs/screenshots/student-management-desktop-mobile.png`
- `docs/screenshots/issued-badges.png`

## 8. Remaining defects and risks

- The local application database still contains 27 legacy issuance rows with empty `{}`
  snapshots. They are now surfaced as unavailable rather than crashing the page. Per the
  no-delete restriction, they were not removed; a separate data-cleanup or quarantine task is
  recommended.
- The combined Playwright invocation can still hit the pre-existing shared rate-limit
  determinism issue; the isolated project runs pass.
- Portal invitation/resend email delivery was not exercised through the E2E browser because the
  disposable E2E server has no SMTP transport. Invitation token creation and lifecycle are
  covered by integration tests; the live local stack uses Mailpit for activation and recovery.
- Students without a portal account intentionally show invitation/edit actions but no Delete
  action, because there is no portal account to deactivate.
