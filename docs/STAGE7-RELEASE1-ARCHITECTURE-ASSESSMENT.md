# Stage 7 Release 1 — Architecture Assessment

**Date:** 28 November 2026
**Branch:** `release/v0.5.0-rc.1`
**Commit:** `4eb403f190c6489ad34e1b7310c89c50ec136ee8`
**Production:** https://socbadging.hausoc.org (commit `4eb403f`)
**Scope:** centralized course badge library and shared badge management (Release 1). Micro-credential/CHED modules are out of scope.

## 1. Executive summary

The system already separates class-scoped badge templates, immutable issuance snapshots, signing, verification, notifications and audit logs. Release 1 can be delivered by adding three reference entities — `Course`, `BadgeDefinition` (+ immutable `BadgeDefinitionVersion`) and `ClassBadgeAssignment` — and reusing the existing class-scoped `BadgeTemplate` as the materialized, issuance-facing artifact. This preserves the entire signing/verification/notification pipeline and all historical credentials without rewriting them.

No material architectural, security or data-integrity blocker was identified. Two implementation decisions are recorded in §9.

## 2. Repository state

| Item                                | Result                                                                                                                      |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Current branch                      | `release/v0.5.0-rc.1`                                                                                                       |
| Current commit                      | `4eb403f` (production-equivalent)                                                                                           |
| Working tree                        | Clean except three untracked operator scripts                                                                               |
| Untracked operator scripts          | `reports/PHASE-A-OPERATOR-INSPECTION.sh`, `reports/PHASE-B-INSTALL-BREVO-SECRET.sh`, `reports/PHASE-F-OPERATOR-RECOVERY.sh` |
| Migrations                          | 21 applied, no pending                                                                                                      |
| Unit tests                          | 905 passing                                                                                                                 |
| Lint / typecheck / production build | Passing                                                                                                                     |

Operator scripts are preserved and excluded from feature commits.

## 3. Existing functionality inventory

### 3.1 Course and class management

- `Class` (`classes`) stores `courseCode`, `title`, `section`, `term`, `academicYear`, `description`, `status` and a single `ownerUserId`.
- A `Class` belongs to one faculty owner (`requireClassOwner`), enforced server-side.
- There is **no** institutional course catalog and no way for two class sections to share a course reference.
- Class CRUD, filtering, sorting and pagination follow a reusable pattern (`listClasses`, `DataTable`, `RecordPagination`).

### 3.2 Badge definitions

- `BadgeTemplate` (`badge_templates`) is **class-scoped**: it has `classId` and `ownerUserId`, plus `name`, `description`, `criteria`, `imagePath`, `expiresAfterDays`, `metadataJson` and `ACTIVE`/`ARCHIVED` status.
- Only the class owner (faculty) can create/edit/duplicate/archive a template. There is no institutional library, approval queue or versioning.
- Approvals, competencies, grading period, issuing institution and validity metadata do not exist as first-class fields (skills/alignment live in `metadataJson`).

### 3.3 Issuance

- Individual issuance: `issueBadge` → `issueSignedBadge` validates the actor owns the class, the template belongs to the class and is owned by the actor, the template is `ACTIVE`, and the student is actively enrolled. It then signs and snapshots.
- Batch issuance: preview (`batch-preview-service`) and commit (`batch-commit-service`) reuse the same signed issuance path and duplicate protections.
- Duplicate protection: a tuple claim/reservation plus a unique `(classId, badgeTemplateId, studentId)` constraint; public ID collisions are retried.
- `BadgeIssuance` stores immutable recipient/achievement/issuer snapshots and the signed credential. Editing a `BadgeTemplate` never rewrites existing issuances.

### 3.4 Credential signing and verification

- Dedicated signer service (`src/signer`) with Ed25519 / `eddsa-rdfc-2022`, signing-key registry (`SigningKey`), status lists (`CredentialStatusList`, `CredentialStatusAllocation`).
- Public verification, JSON/JSON-LD, download, image, PDF and QR routes already exist.
- Release 1 must not change the credential format or historical signatures.

### 3.5 Authorization

- `Role`: `ADMIN`, `FACULTY`, `STUDENT`.
- `requireRole`, `requireStaff`, `requireClassOwner`, `requireStudent` are the server-side primitives.
- All sensitive actions write `AuditLog` rows and are enumerated in `sensitiveAuditActions`.
- No separate badge-approver role exists; Administrators are the authorized approvers.

### 3.6 Students, portal and notifications

- Student accounts, roster import (four-step wizard), student portal and notification delivery are complete and must remain unchanged.
- Notifications are enqueued inside the issuance transaction and processed by the worker.

## 4. Database schema and migration conventions

- Prisma + MySQL/MariaDB, `cuid()` identifiers, `snake_case` mapped columns, explicit indexes.
- Every schema change is a new timestamped migration directory under `prisma/migrations`.
- Migrations are applied with `prisma migrate deploy` in the `migrate` service; data backfills should be idempotent and separately invokable.

## 5. Reusable components

| Need                        | Reuse                                                               |
| --------------------------- | ------------------------------------------------------------------- |
| Tables, sorting, pagination | `DataTable`, `RecordPagination`, `facultyPageSizes`-style constants |
| Dialogs / row actions       | `ClassRowActions`, `FacultyRowActions` client-component pattern     |
| Forms and validation        | `form-grid`, `field`, server actions with Zod                       |
| Audit                       | `AuditLog` + `sensitiveAuditActions`                                |
| Artwork                     | `validateBadgeImage`, `putBadgeImage`, `/api/media/[...key]`        |
| Issuance                    | existing `issueSignedBadge`, batch preview/commit, notifications    |
| Auth                        | `getCurrentActor`, `requireRole`/`requireClassOwner`                |
| Layout                      | `AppShell`, `getNavigationItems`, `getClassTabs`                    |

## 6. Requirement traceability (existing)

- FR-005 Roster, FR-006 Roster Import, FR-007 Badge Templates, FR-008 Badge Image, FR-009 Criteria, FR-010 Individual Issuance, FR-011 Batch Issuance, FR-012 Unique Credential, FR-013 Verification, FR-014 Sharing, FR-015 Export, FR-016 Revocation, FR-020 Audit, FR-021 Search/Filter, FR-022 Exports, FR-023 Settings.

Release 1 adds FR-024–FR-029 (see `REQUIREMENTS.md` update in the implementation report).

## 7. Gaps to close in Release 1

1. Standardized `Course` catalog with program associations, lifecycle, search/sort/filter/pagination.
2. Institutional `BadgeDefinition` library with immutable versions, lifecycle and approval records.
3. Faculty proposals and Administrator approval/rejection/publish/archive workflow.
4. `ClassBadgeAssignment` linking approved versions to class sections, with duplicate prevention and historical preservation.
5. Materialization of an approved version into a class-scoped `BadgeTemplate` so the existing issuance/signing/notification pipeline is reused unchanged.
6. Faculty read-only enforcement for shared/approved definitions.
7. Backfill/promotion of existing classes, templates and historical data with dry-run and reconciliation.

## 8. Test coverage baseline

- Unit tests cover class ownership, badge authorization, issuance, batch preview/commit, revocation, replacement, signing, verification, notifications, roster import and admin pages.
- Integration tests cover issuance, batch commit, signing, status allocation, replacement, revocation, SMTP timeout and roster import (require `TEST_DATABASE_URL`).
- Playwright E2E covers the established faculty/admin/student flows.
- Release 1 must add authorization, version-immutability, duplicate-assignment, duplicate-issuance and migration tests.

## 9. Recorded decisions (no institutional decision required)

1. **Approver authority:** the existing `ADMIN` role is the authorized badge approver. No new role is introduced, minimizing migration and authorization surface.
2. **Backward compatibility:** approved library versions are materialized into the existing class-scoped `BadgeTemplate` (with a nullable `sharedDefinitionVersionId` link). Issuance, signatures, snapshots, notifications, duplicate protection and public URLs are therefore unchanged.
3. **Data promotion is opt-in:** existing class templates are **not** merged or deleted automatically. A dry-run/apply script proposes definitions and duplicates for review.

## 10. Blockers

None.
