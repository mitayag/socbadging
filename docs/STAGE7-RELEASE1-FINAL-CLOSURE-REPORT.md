# Stage 7 Release 1 — Final Closure Report

**Date:** 28 November 2026
**Classification:** **PRODUCTION ACCEPTED WITH ADVISORIES**
**Formal release:** `v1.0.0`
**Production URL:** https://socbadging.hausoc.org
**Repository:** https://github.com/mitayag/socbadging

## 1. Release verification (read-only)

| Item                               | Verified value                                                                                                                    |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Production application commit      | `c64038b5caaccb0b378609d33de487e1e82a17d1`                                                                                        |
| Repository HEAD (at closure start) | `a080710` (`release/v0.5.0-rc.1` and feature branch)                                                                              |
| Release branch                     | `release/v0.5.0-rc.1`                                                                                                             |
| Production URL                     | https://socbadging.hausoc.org                                                                                                     |
| GitHub repository                  | https://github.com/mitayag/socbadging                                                                                             |
| Database migrations                | **22**, 0 pending                                                                                                                 |
| Service health                     | web, worker, signer, db, mailpit all healthy                                                                                      |
| Readiness                          | ready; database ready; signer ready; notifications ready                                                                          |
| Worker heartbeat                   | fresh                                                                                                                             |
| Queue                              | 2 SENT, 2 FAILED, 0 STARTED                                                                                                       |
| Formal tag                         | annotated `v1.0.0` → `c64038b`                                                                                                    |
| Rollback images                    | `hau-soc-badging-web:pre-stage7`, `hau-soc-badging-worker:pre-stage7`                                                             |
| Backups                            | `/var/backups/hau-soc/stage7-release1b-20261128T064647Z`, `…-1c-preprovision-20261128T071645Z`, `…-1c-predeploy-20261128T072717Z` |
| Production acceptance              | Stage H 8/8, Stage 7 8/8, evidence 2/2 (desktop + mobile)                                                                         |

No production redeployment, schema change or data change was performed during closure.

## 2. Formal version and Git release

- No prior Git tags or GitHub releases existed.
- The application package/runtime version is `0.5.0-rc.1` (unchanged; no redeploy for labeling).
- The release branch was `release/v0.5.0-rc.1`, consistent with SemVer pre-release naming.
- **Annotated tag `v1.0.0` was created on the deployed application commit `c64038b`** and pushed to GitHub.
- Repository HEAD `a080710` contains subsequent acceptance, evidence and documentation commits; the tag intentionally references the deployed application commit, not the documentation HEAD.
- Formal GitHub release v1.0.0 was published from the tag with the Release 1 notes.

**Version distinction:** Runtime/package version `0.5.0-rc.1`; formal institutional release tag `v1.0.0` on `c64038b`; repository HEAD `a080710` (docs/tests after deployment).

## 3. Requirements closure

Stage 7 Release 1 requirements are marked implemented, tested and deployed based on actual production evidence. Prior requirements and evidence are preserved.

| Requirement                                     | Status                        | Evidence                                                                                                                   |
| ----------------------------------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| FR-024 Standardized course catalog              | Implemented, tested, deployed | Stage 7 E2E production acceptance; catalog unit tests; `/catalog`; migration created 3 courses                             |
| FR-025 Centralized badge library                | Implemented, tested, deployed | Production badge create/approve; library unit tests; `/library`                                                            |
| FR-026 Badge approval and versioning            | Implemented, tested, deployed | Production faculty proposal approval; v2 create/approve; review/version history; integration tests                         |
| FR-027 Shared class badge assignments           | Implemented, tested, deployed | Two faculty assigned the same badge to different sections; duplicate prevention; usage shows 2 sections; integration tests |
| FR-028 Faculty access and shared badge controls | Implemented, tested, deployed | Faculty read-only approved definition; no approval/version controls; cross-faculty isolation; administrator-only approval  |
| FR-029 Legacy migration and preservation        | Implemented, tested, deployed | 21→22 migration; promotion dry-run/apply/idempotency; 0 duplicates; historical credential CRC and signatures unchanged     |

Traceability: `docs/TRACEABILITY.md` updated. Requirements status: `REQUIREMENTS.md` §12b.

## 4. Operational advisories and verification

1. **Live post-deployment credential issuance not exercised.** No credential was issued during acceptance. Verified: total issuances remain 3; no test issuance exists. First issuance requires separate authorization (`docs/STAGE7-RELEASE1-FIRST-ISSUANCE-CHECKLIST.md`).
2. **External email delivery not exercised.** Notification deliveries remained 4; no test email was sent. First delivery requires separate authorization.
3. **Authenticated student credential detail/download for new test students not exercised.** No test credential existed to open. Existing production credentials were verified publicly (3/3 page/API/image/QR 200).
4. **Two historical failed notification records.** Verified: 2 `FAILED` deliveries, created 2026-11-26 07:19–07:21 UTC (pre-dating Stage 7 acceptance). They were not resent.
5. **Legacy approval-provenance limitation.** Verified: 3 backfilled definitions are APPROVED with no historical approver (`approved_by_user_id` null). The migration recorded this fact in review notes; no approver was invented.
6. **Archived test data retained for auditability.** Verified: 5 STAGE7 users SUSPENDED, 2 classes ARCHIVED, 3 courses ARCHIVED, 12 badge definitions ARCHIVED, 0 test issuances. No test records were hard-deleted. Active-only filters exclude them, but administrator "All Statuses" views can still show them by design (faculty list includes SUSPENDED, student/class/course/library lists default to all statuses). Dashboard/issuance statistics are unaffected because no test credential exists.
7. **Existing production test users suspended and sessions revoked.** Verified: 5 STAGE7 users SUSPENDED, 0 STAGE7 sessions; 46 sessions were revoked during cleanup.
8. **Runtime version gap.** `v1.0.0` labels the deployed application; the runtime package remains `0.5.0-rc.1` because no code/version change or redeploy was permitted.

Active operational counts after cleanup: 1 active faculty (production), 0 active student portal accounts, 1 active class, 2 active courses, 3 approved legacy badge definitions, 3 historical issuances. No STAGE7 test data contributes to these active counts.

## 5. Operational handover

Prepared:

- `docs/STAGE7-RELEASE1-OPERATIONAL-HANDOVER.md` — administrator, faculty and student guides; course catalog, badge library, proposal/approval, shared assignment, issuance, verification, backup/recovery and troubleshooting.
- `docs/STAGE7-RELEASE1-FIRST-ISSUANCE-CHECKLIST.md` — controlled first-issuance checklist.
- `docs/STAGE7-RELEASE1-RELEASE-NOTES.md` — formal v1.0.0 release notes.
- `CHANGELOG.md`, `ROADMAP.md`, `README.md`, `REQUIREMENTS.md`, `docs/TRACEABILITY.md` updated.

## 6. Scope compliance

No production redeployment, database modification, new functionality, credential issuance, external email, notification resend, hard deletion of test records, signing-key change, Release 2 work or CHED micro-credential work occurred during closure. The three pre-existing operator scripts remain untracked and preserved.

## 7. Final classification

**PRODUCTION ACCEPTED WITH ADVISORIES.**

Stage 7 Release 1 (v1.0.0, deployed commit `c64038b`) is the first operational institutional release. The committed advisories are documented and do not block operational use; the first real issuance and email delivery remain separately authorized milestones.
