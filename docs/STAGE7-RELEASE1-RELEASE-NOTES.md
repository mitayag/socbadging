# HAU SOC Badging System — Stage 7 Release 1 (v1.0.0)

**Release date:** 28 November 2026
**Classification:** Production accepted with advisories
**Formal Git tag:** `v1.0.0` → `c64038b5caaccb0b378609d33de487e1e82a17d1`
**Production:** https://socbadging.hausoc.org
**Repository:** https://github.com/mitayag/socbadging

## Summary

v1.0.0 is the first operational institutional release of the HAU SOC Badging System. It adds a standardized course catalog, a centralized institutional badge library with approval and immutable versioning, and shared class badge assignments that let multiple faculty teaching the same course reuse the same approved badge definitions while preserving every historical credential and signature.

## Highlights

- **Standardized course catalog (`/catalog`)** — administrator-managed courses with code, title, description, program associations, lifecycle, search, sorting, filtering and pagination; classes map to a course.
- **Centralized badge library (`/library`)** — institutional definitions with course, artwork, description, competencies, assessment criteria, grading period, issuing institution, validity, creator, approval records, status and timestamps.
- **Approval and versioning** — faculty proposals; administrator approval/rejection/publication/archival; immutable versions; review history; material changes create a new version without altering issued credentials.
- **Shared class badge assignments** — one approved definition can be assigned to many sections and faculty; duplicate assignments are prevented; historical assignments are preserved.
- **Faculty governance controls** — faculty can browse approved badges, search by course, preview, propose, assign to their own classes and view their issuance records; they cannot modify approved shared definitions or approve badges.
- **Backward-compatible migration** — additive schema (21 → 22 migrations) and an idempotent dry-run/apply promotion script with duplicate detection and reconciliation; existing credentials, public IDs, signatures, revocations, notifications and audit records are preserved.
- **Audit** — course, badge definition, version, approval, assignment, archival and backfill actions are recorded.

## Deployed artifacts

| Item                  | Value                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Application commit    | `c64038b5caaccb0b378609d33de487e1e82a17d1`                                                                                   |
| Web image             | `hau-soc-badging-web:stage7-release1-c64038b` (`sha256:365324803329e2ca199c0c8d020206045fa0e00dfa54d00d60d37aecae53834d`)    |
| Worker image          | `hau-soc-badging-worker:stage7-release1-c64038b` (`sha256:a23b29f60a8ce4d974411246c8de55cacbaf16c2b4a65f0b29b241deac2349b7`) |
| Schema migration      | `20261128120000_stage7_shared_badge_library` (22 applied)                                                                    |
| Rollback images       | `hau-soc-badging-web:pre-stage7`, `hau-soc-badging-worker:pre-stage7`                                                        |
| Pre-deployment backup | `/var/backups/hau-soc/stage7-release1c-predeploy-20261128T072717Z`                                                           |

## Acceptance

- Stage H public + authenticated production: 8/8 desktop + mobile.
- Stage 7 production acceptance: 8/8 desktop + mobile (course management, badge creation/approval, faculty proposal approval, shared assignment, duplicate prevention, cross-faculty isolation, versioning, usage, audit, student isolation).
- Historical credentials: 3/3 page/API/image/QR 200; issuance and signature checksums unchanged.
- No production credential issuance or external email during acceptance.

## Advisories

- Live post-deployment credential issuance and external email delivery were not exercised; see the first-issuance checklist.
- Authenticated student credential detail/download for the new test students was not exercised (no test credential issued).
- Two historical FAILED notification records remain from 26 November 2026; they were not resent.
- Legacy backfilled badge definitions (3) have no historical approver provenance; this is recorded in review notes.
- Archived STAGE7 test data is retained for auditability and can appear in administrator views when "All Statuses" is selected.
- The suspended STAGE7 test users remain in administrator account lists for audit history; their sessions were revoked.
- The runtime package version remains `0.5.0-rc.1`; `v1.0.0` is the formal release tag on the deployed application commit. No version-file change or redeploy was made for labeling.

## Documentation

- `docs/STAGE7-RELEASE1-FINAL-CLOSURE-REPORT.md`
- `docs/STAGE7-RELEASE1-OPERATIONAL-HANDOVER.md`
- `docs/STAGE7-RELEASE1-FIRST-ISSUANCE-CHECKLIST.md`
- `docs/STAGE7-RELEASE1C-PRODUCTION-DEPLOYMENT-REPORT.md`
- `docs/STAGE7-RELEASE1C-PRODUCTION-ACCEPTANCE-REPORT.md`
- `docs/STAGE7-RELEASE1C-TEST-ACCOUNT-RETIREMENT-REPORT.md`
- `docs/STAGE7-RELEASE1C-AUTHENTICATION-BLOCKER-RESOLUTION.md`
- Evidence: `docs/evidence/stage7-release1c/`

## Compatibility

Existing class-scoped badge templates, individual and batch issuance, signing, public verification, status lists, notifications, student portal and audit history are unchanged. The release is additive and can be rolled back by redeploying the `pre-stage7` images without a database restore.
