# Phase 2 — Faculty and Classes Implementation Plan

## Scope and decisions

- Implement FR-003 faculty account administration and faculty self-profile management.
- Implement FR-004 class creation, editing, archiving, and reopening.
- Enforce FR-002 in every service and route. Administrators may inspect all classes; only the owning faculty member may mutate a class. Administrators do not create classes on a faculty member's behalf in Phase 2.
- Record FR-020 audit entries for faculty account and class mutations in the same database transaction.
- Implement FR-021 search, status filters, and bounded pagination for faculty and class lists.
- “Reset access” means an administrator assigns a new temporary password. Existing sessions and reset tokens are invalidated. The password is never placed in an audit record.
- Archived classes are retained and can be reopened; Phase 2 exposes no destructive class deletion.
- Rosters, students, badge templates, badge artwork, issuance, and revocation remain Phase 3+ work.

## Tasks

1. Add failing authorization and validation tests for administrator-only faculty operations and owner-only class mutations.
2. Add `FacultyProfile`, `Class`, and `ClassStatus` to Prisma and commit a forward migration with indexes and constraints.
3. Implement transactional faculty services: list, detail, create, edit, activate/suspend, reset access, and self-profile update.
4. Implement transactional class services: list, detail, create, edit, archive, and reopen with ownership checks.
5. Add authenticated Route Handlers with Zod request validation, safe error mapping, and server-side actor resolution.
6. Add modern-light responsive Faculty Management, My Profile, and Classes screens; update navigation.
7. Add service/route authorization coverage, UI behavior tests, and focused browser checks.
8. Run formatting, lint, type checking, automated tests, production build, migrations, and Docker smoke verification; fix every failure before reporting completion.

## Requirement traceability

- FR-002: authorization policies, actor resolution, admin/owner guards, negative tests.
- FR-003: faculty account lifecycle, access reset, self-profile management.
- FR-004: owned class lifecycle without hard deletion.
- FR-020: append-oriented transactional audit records for every Phase 2 mutation.
- FR-021: faculty/class query, status filtering, and pagination.
- Acceptance 2: administrator creates a faculty account.
- Acceptance 3: faculty cannot access administrator-only features.
- Acceptance 4 (partial): faculty creates a class; roster work remains Phase 3.
- Acceptance 15 (partial): authorization and integration coverage for Phase 2 workflows.
