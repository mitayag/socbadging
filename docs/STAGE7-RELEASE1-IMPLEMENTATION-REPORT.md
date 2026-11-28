# Stage 7 Release 1 — Implementation Report

**Date:** 28 November 2026
**Branch:** `feature/stage7-release1-shared-badge-library`
**Base:** `4eb403f` (`release/v0.5.0-rc.1`)
**Commits:** `4a0f6ac` (catalog), `b73a878` (library + assignments), `aaf064d` (migration script), `cb559fe` (E2E, evidence, reports)
**CI:** Quality workflow passed on `cb559fe`
**Scope:** centralized course catalog, institutional badge library with approvals/versions, shared class badge assignment. Micro-credentials and CHED modules are deferred to Release 2.

## 1. Implemented functionality

### 1.1 Standardized course catalog (FR-024)

- `Course` model: code, normalized unique code, title, description, program associations, active/archived status.
- Administrator UI `/catalog`: create, edit, archive/reopen, search by code/title/description, program filter, sorting and pagination.
- Class-to-course mapping from the catalog (administrator) and class settings (owner faculty), with legacy columns retained.
- Duplicate course codes rejected; archived courses cannot receive new mappings.

### 1.2 Centralized badge library (FR-025, FR-026)

- `BadgeDefinition`, immutable `BadgeDefinitionVersion`, append-only `BadgeDefinitionReview`.
- Version fields: name, course, artwork, description, competencies, assessment criteria, grading period, issuing institution, validity, criteria, skills metadata, creator, approver, timestamps, status.
- Lifecycle: `DRAFT → PENDING_APPROVAL → APPROVED | REJECTED → ARCHIVED`, with `PUBLISHED` recorded on approval.
- Administrator actions: create, revise (new version), approve/publish, reject with reason, archive; version history and review history visible.
- Faculty actions: browse approved library, search/filter by course, preview details, create a proposal, submit it, view own proposals.
- Duplicate detection reports same course/name, identical assessment criteria and identical artwork for review; nothing is auto-merged.
- Usage panel: assignments, sections, issued credentials, distinct students, revocations.

### 1.3 Shared class badge assignment (FR-027, FR-028)

- `ClassBadgeAssignment` links an approved version to a class section; unique `(classId, badgeDefinitionId)` prevents duplicates.
- Assignment materializes a class-scoped `BadgeTemplate` with `sharedDefinitionVersionId` set, owned by the class owner. Existing issuance, signing, snapshots, notifications, duplicate protection and public URLs are reused unchanged.
- Course matching is enforced when a class is mapped; any approved badge is allowed for unmapped legacy classes.
- Faculty can assign only to their own classes; administrators may assign to any class.
- Assignment archival stops new issuance and preserves historical records.
- Faculty edit/duplicate/archive of shared materialized templates is blocked server-side.

### 1.4 Backward-compatible migration (FR-029)

- One additive migration creates the five new tables and two nullable columns.
- `scripts/stage7-release1-migrate.ts` promotes existing classes and badge templates with `--dry-run` (default) and `--apply`.
- Idempotent: already-linked templates are skipped; courses match on normalized code.
- Emits JSON + Markdown reconciliation reports under `reports/` with duplicate candidates and errors; no automatic merge or deletion.
- Never rewrites `badge_issuances`, `signed_credential_json`, public IDs, signing keys, status allocations, revocations, notifications or audit logs.

## 2. Database changes

Migration: `prisma/migrations/20261128120000_stage7_shared_badge_library/migration.sql`.

| Change                                         | Type                                  |
| ---------------------------------------------- | ------------------------------------- |
| `courses`                                      | new table                             |
| `badge_definitions`                            | new table                             |
| `badge_definition_versions`                    | new table (unique definition+version) |
| `badge_definition_reviews`                     | new table (append-only)               |
| `class_badge_assignments`                      | new table (unique class+definition)   |
| `classes.course_id`                            | nullable FK, `ON DELETE SET NULL`     |
| `badge_templates.shared_definition_version_id` | nullable FK, `ON DELETE SET NULL`     |

No column was dropped, renamed or made non-null; no existing row is rewritten by the migration.

## 3. Security and audit

- All mutations are server-authorized (`requireStaff`, `requireClassOwner`, `requireRole("ADMIN")`).
- Approval is administrator-only; faculty approval is rejected before any write and covered by unit tests.
- Faculty cannot revise approved definitions, edit shared templates, read another faculty member's classes, or assign to them.
- New audit actions: `course.created/updated/archived/reopened`, `class.course_mapped/unmapped`, `badge.library_created`, `badge.version_created`, `badge.submitted`, `badge.version_approved/rejected/archived`, `badge.library_archived`, `badge.assigned_to_class`, `badge.class_assignment_archived`, `badge.library_backfilled`.

## 4. Preserved functionality

- Existing class CRUD/roster/import/issuance/batch/revocation/replacement/verification/notification/student portal flows are untouched.
- Existing `BadgeTemplate` CRUD remains for non-shared class badges.
- Existing issuances retain their template, version snapshots, signatures and public verification URLs.
- No production deployment or production merge was performed.

## 5. Migration results (disposable MariaDB 11.8)

| Step                        | Result                                                                                 |
| --------------------------- | -------------------------------------------------------------------------------------- |
| Schema migration            | Applied successfully (21 → 22 migrations)                                              |
| Dry-run                     | 1 course, 2 classes mapped, 2 definitions planned, 2 duplicate groups                  |
| Apply                       | Courses/definitions/assignments created                                                |
| Second apply                | 0 created, 2 already linked (idempotent)                                               |
| Historical credential check | Existing issuance snapshots/signatures unchanged after version 2 approval and archival |

## 6. Known limitations

- Administrators are the approvers; no separate approver role was introduced (documented decision).
- Duplicate detection is heuristic (name/criteria/artwork) and intentionally advisory.
- The promotion script backfills legacy templates with no approval provenance; it records that fact in the review note.
- Authenticated production screenshots were not captured; UI evidence comes from the disposable E2E environment.
