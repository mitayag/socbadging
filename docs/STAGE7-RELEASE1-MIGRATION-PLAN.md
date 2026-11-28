# Stage 7 Release 1 — Migration Plan

**Date:** 28 November 2026
**Strategy:** additive, backward-compatible, reversible.
**Principle:** issued credentials are historical. No existing badge, issuance, signature, public ID, revocation, expiration, notification or audit record is deleted or rewritten.

## 1. Schema migration (single migration)

Additive only:

1. Create tables `courses`, `badge_definitions`, `badge_definition_versions`, `badge_definition_reviews`, `class_badge_assignments`.
2. Add nullable `classes.course_id` with index and FK (`ON DELETE SET NULL`).
3. Add nullable, unique `badge_templates.shared_definition_version_id` with index and FK (`ON DELETE SET NULL`).
4. Add supporting indexes for search/filter/pagination.

No column is dropped, renamed or made non-null. Existing rows remain valid without backfill.

## 2. Data promotion (idempotent script)

`scripts/stage7-release1-migrate.ts`

- `--dry-run` (default): read-only; prints proposed courses, definitions, versions, assignments and duplicates.
- `--apply`: executes within transactions; safe to re-run.

Steps:

1. **Courses:** derive distinct `(courseCode, title)` from `classes`; create missing `Course` rows with normalized code; map `classes.courseId`. Existing `courseCode`/`title` are retained.
2. **Definitions:** for each `BadgeTemplate`, create a `BadgeDefinition` and version 1 when one does not already exist for the same class template. Map status: `ACTIVE → APPROVED`, `ARCHIVED → ARCHIVED`. Record an approval review row.
3. **Materialization link:** set `BadgeTemplate.sharedDefinitionVersionId` and create a `ClassBadgeAssignment` for the owning class. `BadgeTemplate` is not modified materially; issuance snapshots are untouched.
4. **Duplicate detection:** report definitions that share course, normalized name, artwork hash and identical competency/criteria text. **Never auto-merge.**

## 3. Dry-run and reconciliation report

The script emits:

- courses proposed/created;
- definitions proposed/created;
- templates linked;
- assignments created;
- skipped/already-migrated counts;
- duplicate candidates grouped for authorized review;
- any orphaned classes/templates.

A machine-readable JSON summary and a human-readable table are written to `reports/`.

## 4. Duplicate policy

- Exact duplicates are reported, not merged.
- Administrators review candidates and archive the redundant definition manually; historical credentials remain attached to their original template/version.

## 5. Backward compatibility guarantees

- `BadgeIssuance.badgeTemplateId` is unchanged; all existing credentials, public URLs and signatures remain valid.
- New library versions create new class templates; old templates and issuances are never mutated.
- Deleting a course/definition is replaced by archival.

## 6. Backup procedure

Before applying in any environment:

1. Database dump (`mariadb-dump --single-transaction --routines --triggers`) and media archive.
2. SHA-256 manifest.
3. Restore verification into a temporary database and row-count comparison.
4. Store in the environment's approved backup location.

Production backups already exist at `/var/backups/hau-soc/student-import-c72ffa5-20261128T045207Z` (pre-Release-1 baseline).

## 7. Rollback procedure

Application-level rollback is sufficient for a release rollback because the schema change is additive:

1. Redeploy the previous web/worker images (`pre-student-import` and the current release tags).
2. Leave the additive tables/columns in place; the previous code ignores them.
3. If the data promotion must be undone:
   - `UPDATE classes SET course_id = NULL;`
   - `DELETE FROM class_badge_assignments;`
   - `UPDATE badge_templates SET shared_definition_version_id = NULL;`
   - `DELETE FROM badge_definition_reviews;`
   - `DELETE FROM badge_definition_versions WHERE version = 1 AND ...` (only rows created by the promotion script, identified by the audit/script marker);
   - `DELETE FROM badge_definitions ...`; `DELETE FROM courses ...`.
4. Never restore or rewrite `badge_issuances`, `signed_credential_json`, `public_id`, `signing_key_id`, status allocations, notification deliveries or audit logs.

A database restore is only required for a destructive failure; the additive design means it should not be needed for normal rollback.

## 8. Validation gates

- Migration applies cleanly on a copy of production data.
- Dry-run and apply are idempotent (second apply performs no writes).
- Existing credential verification, public URLs and signatures still pass.
- Duplicate detection produces an empty result for a clean dataset.
- No orphaned class/badge rows.
- Test suite, build and security regression pass.
