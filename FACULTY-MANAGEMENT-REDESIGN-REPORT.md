# Faculty Account Management Redesign — Implementation Report

**Date:** 3 November 2026  
**Status:** COMPLETE  
**Scope:** Local development only  
**Deployment:** Not performed; no commit, push, or merge

## Objective

Redesign the Administrator Faculty Account Management page as a modern, responsive,
searchable, sortable, paginated, and scrollable data table while preserving existing
account creation, authentication, authorization, ownership, and audit behavior.

## Requirement mapping

| Requirement                      | Implementation                                                                    |
| -------------------------------- | --------------------------------------------------------------------------------- |
| FR-002 RBAC                      | Server-side `requireRole(actor, "ADMIN")` on the page, every action, and service. |
| FR-003 Faculty Accounts          | Create, edit, activate, deactivate, suspend, reset access, and soft delete.       |
| FR-020 Audit Log                 | Created, updated, activated, deactivated, suspended, access reset, and deleted.   |
| FR-021 Search/Filter             | Server-side search by name/email/employee ID/department; status, sort, page size. |
| Application Shell / Core Screens | Existing light theme, navy headings, rounded controls, and administrator shell.   |

## Changes

### Schema

- Added `INACTIVE` to `UserStatus` to distinguish deactivation from suspension.
- Added migration `prisma/migrations/20261103090000_faculty_inactive_status`.
- Updated user-status type literals in identity, settings, signing, audit, issuance,
  revocation, batch signing, signed issuance, and student-account services.
- `getCurrentActor` continues to allow only `ACTIVE` accounts, so inactive and suspended
  faculty cannot authenticate.

### Faculty service

- `listFaculty` now supports:
  - server-side search across name, email, employee ID, and department;
  - status filtering for Active, Inactive, Suspended, and Deleted;
  - sorting by name, employee ID, or status;
  - page sizes of 10, 25, and 50;
  - total counts, page counts, and page clamping.
- Default listing excludes soft-deleted accounts and includes Active, Inactive, and
  Suspended accounts.
- Added explicit email and employee ID uniqueness checks on create and edit.
- Administrators can now edit a faculty sign-in email; normalized email is updated in the
  same transaction.
- Added `FacultyConflictError` for friendly duplicate-field messages.
- Deactivation sets `INACTIVE`, increments `sessionVersion`, deletes active sessions, and
  writes `faculty.deactivated`.
- Suspension continues to delete sessions and writes `faculty.suspended`.
- Deletion remains soft: `DELETED`, `deletedAt`, session/token revocation, and audit.

### Server actions

- New status transitions: Activate (`ACTIVE`), Deactivate (`INACTIVE`), Suspend
  (`SUSPENDED`).
- All actions revalidate `/faculty` and `/dashboard` before redirecting, refreshing the
  table immediately.
- Duplicate email, duplicate employee ID, validation, authorization, and missing-record
  errors are mapped to safe user-facing messages.
- Current search/filter/sort/page/page-size values are preserved across edit, status,
  reset, and delete actions through hidden return fields.
- Creation redirects to the new account's email search so it is immediately visible.

### UI

- Replaced the stacked expandable cards with a compact data table showing:
  Full Name, Email, Employee ID, Department, Title, Account Status, and Actions.
- The table container is capped at `550px` with `overflow: auto`; the header is sticky and
  the table scrolls horizontally on smaller screens.
- Added a search/status/sort/page-size toolbar with Apply and Reset.
- Added result count and page metadata.
- Added Edit, Activate, Deactivate, Suspend, Reset Access, and Delete icon actions with
  accessible labels and native `<dialog>` confirmation/editing modals.
- Added loading skeleton (`src/app/faculty/loading.tsx`) and empty/error/success states.
- Preserved the collapsible Create Faculty Account panel above the table and the
  Departments management panel.
- Active status is green, inactive is gray, and suspended/deleted are red.

## Files changed

- `prisma/schema.prisma`
- `prisma/migrations/20261103090000_faculty_inactive_status/migration.sql` (new)
- `src/app/faculty/page.tsx`
- `src/app/faculty/actions.ts`
- `src/app/faculty/loading.tsx` (new)
- `src/components/faculty/faculty-row-actions.tsx` (new)
- `src/modules/faculty/services/faculty-service.ts`
- `src/modules/faculty/services/faculty-service.test.ts`
- `src/app/globals.css`
- `src/modules/identity/services/authenticate.ts`
- `src/modules/settings/services/system-settings-service.ts`
- `src/modules/signing/key-service.ts`
- `src/modules/audit/services/audit-log-service.ts`
- `src/modules/issuance/services/issuance-service.ts`
- `src/modules/issuance/services/revocation-service.ts`
- `src/modules/issuance/services/batch-commit-service.ts`
- `src/modules/issuance/services/signed-issuance-service.ts`
- `src/modules/student/services/student-account-service.ts`
- `docs/screenshots/faculty-management-desktop.png` (new)
- `docs/screenshots/faculty-management-desktop-mobile.png` (new)

## Tests and verification

| Check                                 | Result                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| Format                                | PASS                                                      |
| Lint                                  | PASS                                                      |
| Typecheck                             | PASS                                                      |
| Unit tests                            | PASS — 115 files, 834 tests                               |
| Integration tests (clean migrated DB) | PASS — 19 files, 125 tests                                |
| Production build                      | PASS                                                      |
| Full Playwright suite                 | PASS — 47 passed, 1 skipped, 0 failed                     |
| Focused faculty-management E2E        | PASS — 2/2 (desktop and mobile; temporary spec removed)   |
| Live local smoke test                 | PASS — table, create panel, edit dialog, and status modal |

The focused E2E flow verified:

- create and immediate visibility in the table;
- search by employee ID;
- sorting and page-size controls;
- active status filtering;
- edit updates the correct account;
- deactivation blocks login;
- activation restores login;
- faculty cannot access `/faculty`;
- suspension blocks login;
- delete requires confirmation and removes the account from the table;
- no page-level horizontal overflow at 390px while the table itself scrolls.

Database verification after the E2E run:

- both disposable test accounts were `DELETED` with `deleted_at` populated;
- audit records existed for `faculty.created`, `faculty.updated`,
  `faculty.activated`, `faculty.deactivated`, `faculty.suspended`, and
  `faculty.deleted`;
- the existing seeded faculty account still had its 2 classes and 14 issuances.

## Screenshots

- `docs/screenshots/faculty-management-desktop.png`
- `docs/screenshots/faculty-management-desktop-mobile.png`

## Outstanding issues and assumptions

- Soft-deleted accounts are intentionally hidden from the table to avoid clutter while
  preserving classes, badges, issued credentials, and audit history.
- Administrators may change a faculty email; this changes the faculty sign-in identity.
- Inactive and Suspended both block authentication. Inactive represents routine
  deactivation; Suspended represents an access restriction.
- The table uses contained horizontal scrolling below approximately 980px, as required.
- The existing combined Playwright suite is sensitive to shared fixed-window rate limits
  when repeated against the same server; the full suite passed in this run.
- Local app containers were rebuilt and restarted so `http://127.0.0.1:3000/faculty`
  serves the new implementation. No production deployment was performed.
