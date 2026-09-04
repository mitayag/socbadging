# Administrator-Managed Departments Design

**Status:** Approved design pending written-spec review  
**Date:** 2026-08-11  
**Requirements:** FR-002, FR-003, FR-020; accessibility and migration requirements from NFRs

## Purpose and scope

Replace free-text faculty departments with canonical administrator-managed department records. Administrators can add, rename, and archive departments. Faculty creation, administrator faculty editing, and faculty self-profile editing use the same department dropdown.

Department deletion is intentionally excluded. Archiving preserves historical faculty assignments while preventing new assignments to obsolete departments.

## Data model and migration

Add a `Department` model with:

- opaque ID;
- display name;
- normalized unique name for case-insensitive duplicate prevention;
- `ACTIVE` or `ARCHIVED` status;
- created and updated timestamps; and
- a relation to faculty profiles.

Replace `faculty_profiles.department` with nullable `department_id` and a restrictive foreign key. The migration will:

1. create the department table;
2. create one active department for each distinct non-empty existing faculty department;
3. associate existing faculty profiles with the corresponding department;
4. remove the legacy text column after associations are populated.

Blank legacy departments remain unassigned.

## Authorization and behavior

- Only administrators can add, rename, or archive departments.
- Faculty can list active departments only as part of their authenticated profile workflow.
- Administrators can see active and archived departments.
- New faculty assignments accept only active department IDs.
- Existing faculty assigned to an archived department retain it.
- An administrator editing a faculty member may leave their archived current department unchanged or select an active department.
- A faculty member may leave their archived current department unchanged or select an active department, but cannot newly choose another archived department.
- Department names are trimmed, required, limited to 191 characters, and unique after case-folding and whitespace normalization.
- Renaming preserves the stable department ID and therefore updates the displayed name everywhere without rewriting faculty profiles.
- Every add, rename, and archive mutation writes an audit record in the same transaction.

## Interface

Faculty Management gains a “Manage departments” panel containing:

- an add-department form;
- a list of active and archived departments;
- rename controls; and
- archive/reopen controls.

The Department fields in Create Faculty, Edit Faculty, and My Profile become native accessible `<select>` controls. Each begins with “No department” and lists active departments alphabetically. An assigned archived department remains visible and clearly labeled “Archived.”

The existing modern-light focus ring, label focus treatment, responsive form grid, status colors, and design tokens remain in use.

## Error handling

- Duplicate names are rejected server-side without changing data.
- Invalid or unauthorized department IDs are rejected server-side.
- A failed department mutation does not write an audit record.
- Archiving an assigned department never removes or changes faculty assignments.
- No destructive department endpoint or UI is provided.

## Testing and verification

- Unit tests for normalization and validation.
- Negative authorization tests proving faculty cannot manage departments.
- Tests for active-only assignment, archived-current retention, duplicate rejection, and audit transaction behavior where practical.
- Rendered browser verification for adding a department and seeing it in all relevant dropdowns.
- Keyboard/focus and responsive checks for the dropdown UI.
- Format, lint, type checking, automated tests, production build, migration deployment, and Docker health smoke checks before completion.

## Requirement traceability

- **FR-002:** server-side administrator and authenticated-faculty boundaries.
- **FR-003:** consistent department assignment during faculty account and profile management.
- **FR-020:** department-management audit records.
- **NFR accessibility:** labeled native selects, focus visibility, keyboard navigation, and responsive layout.
- **NFR migrations:** normalized schema change delivered through a checked-in Prisma migration.
