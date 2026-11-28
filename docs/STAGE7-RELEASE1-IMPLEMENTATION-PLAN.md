# Stage 7 Release 1 — Implementation Plan

**Date:** 28 November 2026
**Branch:** `feature/stage7-release1-shared-badge-library`
**Base commit:** `4eb403f`
**Scope:** centralized course catalog, institutional badge library with approvals and versions, and shared class badge assignment. Micro-credentials/CHED are deferred to Release 2.

## 1. Principles

- Extend existing entities and flows; no parallel issuance pipeline.
- Preserve historical issuances, signatures, public URLs, revocation/expiration/notification/audit records.
- Server-side authorization on every protected operation.
- One migration for schema; data promotion via an idempotent dry-run/apply script.
- Reuse `BadgeTemplate` as the materialized issuance artifact.

## 2. Data model

### 2.1 New enums

- `CourseStatus`: `ACTIVE`, `ARCHIVED`
- `BadgeDefinitionStatus`: `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `REJECTED`, `ARCHIVED`
- `BadgeReviewDecision`: `SUBMITTED`, `APPROVED`, `REJECTED`, `PUBLISHED`, `ARCHIVED`, `VERSION_CREATED`
- `ClassBadgeAssignmentStatus`: `ACTIVE`, `ARCHIVED`

### 2.2 New models

**Course** — `id`, `code`, `normalizedCode` (unique), `title`, `description`, `programsJson`, `status`, timestamps.

**BadgeDefinition** — `id`, `courseId`, `name`, `createdByUserId`, `status`, timestamps. Owns versions, reviews and assignments.

**BadgeDefinitionVersion** — immutable material snapshot: `badgeDefinitionId`, `version`, `name`, `description`, `competencies`, `assessmentCriteria`, `gradingPeriod`, `issuingInstitution`, `validityDays`, `imagePath`, `criteria`, `metadataJson`, `status`, `createdByUserId`, `approvedByUserId`, `approvedAt`, `rejectionReason`, timestamps. Unique `(badgeDefinitionId, version)`.

**BadgeDefinitionReview** — append-only approval/version history: `badgeDefinitionVersionId`, `actorUserId`, `decision`, `note`, `createdAt`.

**ClassBadgeAssignment** — `classId`, `badgeDefinitionId`, `badgeDefinitionVersionId`, `badgeTemplateId`, `assignedByUserId`, `status`, timestamps. Unique `(classId, badgeDefinitionId)` prevents duplicate assignments; history is preserved by archiving rather than deleting.

### 2.3 Altered models

- `Class.courseId` (nullable FK, index) — existing `courseCode`/`title` retained for backward compatibility.
- `BadgeTemplate.sharedDefinitionVersionId` (nullable FK, unique, index) — marks a class template materialized from an approved library version. Faculty edits/archive/duplicate are blocked for these templates.

## 3. Services

| Service                          | Responsibilities                                                                                                                                                                           |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `course-service`                 | List/filter/sort/paginate courses; create/update/archive; authorization; duplicate code detection; safe class mapping.                                                                     |
| `badge-library-service`          | Create definition + draft version; revise (new version); submit; approve/reject/publish/archive; list approved/filter by course; duplicate detection; usage statistics; role-scoped reads. |
| `class-badge-assignment-service` | Recommend badges by course; assign an approved version to an owned class; prevent duplicates; materialize `BadgeTemplate`; archive assignment; list class assignments.                     |
| `badge-service` (extended)       | Block faculty mutation of shared/materialized templates.                                                                                                                                   |

All write operations run in transactions with `AuditLog` rows.

## 4. Authorization matrix

| Action                                 | ADMIN   | FACULTY     | STUDENT |
| -------------------------------------- | ------- | ----------- | ------- |
| Create/edit/archive course             | ✓       | —           | —       |
| Create badge definition/proposal       | ✓       | ✓           | —       |
| Submit proposal                        | ✓       | ✓           | —       |
| Approve/reject/publish/archive version | ✓       | —           | —       |
| Browse approved library                | ✓       | ✓           | —       |
| View own proposals/issuance            | ✓       | ✓           | —       |
| Assign approved badge to class         | ✓ (any) | own classes | —       |
| Issue credential                       | —       | own classes | —       |

Approval by non-ADMIN is rejected server-side and covered by tests.

## 5. UI

### Administrator

- `/catalog` — Course Catalog: search, status filter, sort, pagination, create/edit/archive.
- `/library` — Badge Library: search/filter by course/status, approval queue tab, create definition.
- `/library/[definitionId]` — version history, review queue, submit/approve/reject/publish/archive, associated class sections, issuance statistics.

### Faculty

- `/library` — Shared Badge Library (approved only) + "My Proposals" scope + proposal form.
- `/library/[definitionId]` — read-only approved details/proposal detail for own definitions.
- `/classes/[classId]/badges` — "Available Course Badges" section, assignment action, shared templates marked read-only.

Navigation adds "Course Catalog" (ADMIN) and "Badge Library" (ADMIN/FACULTY). Existing pages and design tokens are reused.

## 6. Testing

- Unit: course CRUD/authorization, library lifecycle/authorization/duplicate detection, version immutability, assignment authorization/duplicate prevention, faculty read-only enforcement.
- Integration: assignment materializes template; two faculty sections issue the same definition; duplicate issuance and concurrent issuance unchanged; historical credential preserved after a new version.
- E2E: admin creates course and approves badge; two faculty assign and issue; unauthorized approval and faculty modification blocked.
- Gates: format, lint, typecheck, unit, integration (where a test DB is available), Playwright, production build, migration validation, security regression.

## 7. Rollout

1. Merge schema migration + backfill script.
2. Run dry-run, reconcile, then apply promotion in staging.
3. Verify existing credentials, URLs and signatures.
4. Feature branch pushed; no production merge or deployment without explicit approval.

## 8. Out of scope

PQF, credit computation, CHED recognition/workflows, credit transfer, stackable pathways, QA modules, regulatory monitoring. Integration points are documented in `docs/STAGE7-RELEASE2-FUTURE-INTEGRATION-NOTES.md`.
