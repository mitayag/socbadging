# Phase 3 — Rosters and Badge Templates Plan

## Scope and decisions

- Implement FR-005 roster CRUD using global student identities and class-specific enrollment records. “Remove” ends the enrollment rather than deleting the student identity.
- Implement FR-006 CSV/XLSX inspection, explicit column mapping, server validation preview, duplicate reporting, and an explicit commit of the stored preview. Preview data expires and cannot be altered by the client.
- Implement FR-007 badge template create/edit/duplicate/archive within owned classes. Administrators can inspect but not mutate faculty work in this phase.
- Implement FR-008 using a replaceable local `StorageProvider`, opaque keys, content-derived MIME validation, dimensions, and a 2 MiB limit. Files are stored on the Docker media volume.
- Implement FR-009 human-readable criteria plus optional comma-separated skills and alignment metadata stored as JSON.
- Implement FR-020 transactional audit entries for roster, import, and badge mutations.
- Implement FR-021 search/filter/bounded pagination and FR-022 roster CSV export with spreadsheet-injection protection.
- Issuance, credential snapshots, public verification, and badge revocation remain out of scope until Phase 4+.

## Work sequence

1. Add failing tests for ownership, row validation/deduplication, CSV sanitization, and image validation.
2. Add Prisma models/enums for students, enrollments, import previews, and badge templates with a checked-in migration.
3. Implement roster services and owned-class policies, including reversible enrollment removal and audit records.
4. Implement import inspection/preview/commit services and CSV error reporting.
5. Implement storage abstraction, image validation, badge-template services, and media serving.
6. Add class detail navigation and responsive Students/Badges screens with the import mapper and badge builder.
7. Add roster CSV export and administrator read-only inspection.
8. Run format, lint, typecheck, tests, production build, migration, Docker smoke, and browser desktop/mobile workflow checks.

## Traceability

- FR-002: server-side role and owned-class authorization plus negative tests.
- FR-005: student and enrollment lifecycle.
- FR-006: mapping, preview, validation, duplicates, error report, explicit commit.
- FR-007: owned badge-template lifecycle.
- FR-008: validated artwork upload and preview.
- FR-009: criteria, skills, and alignment metadata.
- FR-020: audit events for Phase 3 mutations.
- FR-021: student and badge search/filter/pagination.
- FR-022: roster CSV export.
- Acceptance 4: faculty creates a class and roster.
- Acceptance 5: faculty creates a badge template with image and criteria.
- Acceptance 15: Phase 3 authorization and critical workflow tests.
