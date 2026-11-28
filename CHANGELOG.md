# Changelog

All notable changes to the HAU SOC Badging System are recorded here.

## [1.0.0] — 2026-11-28

**Stage 7 Release 1 — first operational institutional release.**
Formal tag `v1.0.0` references the deployed application commit `c64038b5caaccb0b378609d33de487e1e82a17d1` (short: `c64038b`).
Status: **Production accepted with advisories**.

### Added

- Standardized course catalog (`/catalog`): code, title, description, program associations, active/archived status, search, sorting, filtering, pagination and class mapping.
- Centralized institutional badge library (`/library`) with course association, artwork, description, competencies, assessment criteria, grading period, issuing institution, validity, creator and status.
- Badge proposal, administrator approval/rejection/publication, archival, immutable versioning, review history and usage statistics.
- Shared class badge assignments: one approved definition across multiple sections and faculty, duplicate prevention, historical preservation, course-based recommendations.
- Faculty proposal workflow and read-only enforcement for approved shared definitions.
- Additive schema migration `20261128120000_stage7_shared_badge_library` (21 → 22).
- Idempotent legacy promotion script with dry-run, duplicate detection, reconciliation reports, backup and rollback guidance.
- Production acceptance/evidence suites for Stage 7.

### Changed

- Faculty badge pages show shared badges as read-only and warn when a badge is managed by the library.
- Navigation adds **Course Catalog** (Administrator) and **Badge Library** (Administrator/Faculty).
- Audit action catalogue covers course, badge version, approval, assignment and archival events.

### Fixed

- Worker runtime no longer imports the `server-only` guarded storage module (shared with the prior release).
- Stage 7 promotion tooling prefers the runtime database secret and a single pooled connection.
- Production Stage H acceptance locators/redirect assertions aligned with current authorization behavior.

### Operations

- Production deployed from `release/v0.5.0-rc.1` commit `c64038b`; web/worker images `stage7-release1-c64038b`.
- Verified pre-deployment backups and `pre-stage7` rollback images retained.
- Dedicated STAGE7 test identities provisioned, used for acceptance and suspended; sessions revoked.
- Test classes/courses/badges archived; no hard deletion of historical or audit records.

### Advisories

- Live post-deployment credential issuance and external email delivery were not exercised.
- Authenticated student credential detail/download for new test students was not exercised (no test credential issued).
- Two historical FAILED notifications from 2026-11-26 remain; they were not resent.
- Three legacy backfilled badge definitions have no historical approver provenance.
- Archived test data and suspended test users remain visible in administrator "All Statuses" views for auditability.
- Runtime package version remains `0.5.0-rc.1` while the formal release tag is `v1.0.0`.

## [0.5.0-rc.1] — 2026-11-27

- Student import four-step wizard, notification/worker reliability, email acceptance readiness and production fixes (prior release).

## [Unreleased]

- Stage 7 Release 2 (micro-credentials/CHED) is deferred and not implemented.
