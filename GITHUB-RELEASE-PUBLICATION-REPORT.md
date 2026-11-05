# GitHub Release Publication Report

**Release candidate:** `v0.5.0-rc.1`  
**Date:** 5 November 2026  
**Production deployment:** Not performed  
**Final production release published:** No  
**Merged to `main`:** No

## 1. Repository and branch

| Item             | Value                                             |
| ---------------- | ------------------------------------------------- |
| Repository       | https://github.com/mitayag/socbadging             |
| Remote           | `git@github.com:mitayag/socbadging.git`           |
| Visibility       | Public                                            |
| Default branch   | `main`                                            |
| Release branch   | `release/v0.5.0-rc.1`                             |
| Candidate commit | `1d622a043aa3f4923c2ccaee0db27513cc62168c`        |
| Commit author    | Marlon Tayag `<mitayag@users.noreply.github.com>` |
| Pull request     | https://github.com/mitayag/socbadging/pull/1      |
| PR base          | `main`                                            |
| PR state         | OPEN                                              |
| Mergeable        | MERGEABLE (not merged)                            |

A documentation commit follows the candidate commit on the same branch; the PR head advances to that
documentation commit. The candidate application SHA above remains the reviewed code baseline.

## 2. Publication actions performed

1. Audited the GitHub remote and default branch.
2. Reviewed all tracked and untracked changes.
3. Redacted personal/account identifiers and local filesystem paths.
4. Excluded screenshots, local secrets, backups, fixtures, and test artifacts.
5. Created `release/v0.5.0-rc.1` from the completed Stage 5E.1 baseline.
6. Committed 333 files (210 added, 123 modified).
7. Pushed the branch to the configured GitHub repository.
8. Opened PR #1 targeting `main`.
9. Verified both GitHub Actions `Quality` runs.

No merge, final GitHub release, package publication, or production deployment was performed.

## 3. Release contents

- Application source and Prisma migrations.
- Recipient-policy, suppression, webhook, status-list, signing, and student-portal functionality.
- Unit, integration, and Playwright tests.
- Production `compose.production.yaml` and deployment templates.
- Backup, monitoring, readiness, and acceptance scripts.
- Stage 4 through Stage 5E.1 reports and operational documentation.
- `.env.example` and `.env.brevo.example` placeholder templates.

Excluded: `.env`, private keys, local signer fixtures, database/media backups, legacy manifests,
screenshots, test results, build output, and dependency directories.

## 4. Validation summary

| Gate                            | Result                         |
| ------------------------------- | ------------------------------ |
| Format / lint / typecheck       | PASS                           |
| Unit tests                      | 115 files / 859 tests PASS     |
| Integration tests               | 20 files / 148 tests PASS      |
| Playwright desktop+mobile       | 57 passed, 1 skipped by design |
| Production build                | PASS                           |
| Production Compose validation   | PASS                           |
| Secret scan                     | PASS — no real credentials     |
| `npm audit --omit=dev`          | 0 vulnerabilities              |
| GitHub Actions `Quality` (push) | SUCCESS                        |
| GitHub Actions `Quality` (PR)   | SUCCESS                        |

Details: `GITHUB-RELEASE-CI-RESULTS.md`.

## 5. Security and file inventory

- Security review: `GITHUB-RELEASE-SECURITY-CHECK.md`
- Complete file inventory: `GITHUB-RELEASE-FILE-INVENTORY.md`
- Deployment plan: `GITHUB-DEPLOYMENT-PLAN.md`

## 6. Outstanding production blockers

The release candidate is **not** production-approved. The remaining external blockers are:

1. Written authorization for a controlled Brevo external acceptance test.
2. Verified sender domain, SPF/DKIM/DMARC, and Brevo sender approval.
3. Brevo SMTP credentials and webhook registration.
4. Nginx Proxy Manager proxy host/certificate and external HTTPS validation.
5. Production signing-key generation/activation and final HTTPS issuer URLs.
6. Production backup vault, off-host binlog decision, and restore verification.
7. Monitoring/on-call provisioning and approved incident ownership.
8. Controlled external delivery/inbox/webhook/suppression/revocation evidence.
9. Approval to merge the PR and publish the final release.

## 7. Status

**GitHub release candidate publication: PASS.**  
The branch and PR are published for review only.  
**Production GO/NO-GO: NO-GO** pending the external blockers above.
