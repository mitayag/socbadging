# Student Import Production Deployment Report

**Date:** 27 November 2026
**Time:** 15:02 +0800 / 07:02 UTC
**Classification:** PRODUCTION DEPLOYMENT BLOCKED
**Production URL:** https://socbadging.hausoc.org
**Production application directory:** `/opt/socbadging` (not reachable for inspection)

## 1. Executive Summary

The approved GitHub update was completed successfully. Production deployment could not proceed because the production host only exposes a restricted status-only SSH account from the current operator environment. Tailscale connectivity is now working, but no approved administrative deployment account is available.

The production web endpoint is publicly healthy, but the required preflight host inspection, backup creation, and deployment operations could not be performed. No production files, containers, database records, volumes, secrets, signing keys, environment configuration, or notification state were modified.

Because a valid production backup could not be created and verified, this report records a mandatory NO-GO under the approved deployment procedure.

## 2. Deployment Authorization and Scope

Authorization covered:

- GitHub commit and push of the accepted Student Import enhancement.
- Controlled production deployment.
- Post-deployment verification.
- Rollback if critical regressions occurred.

No production deployment, restart, migration, backup, or data operation was executed because production shell access was unavailable.

## 3. GitHub Repository and Branch

- Repository: https://github.com/mitayag/socbadging
- Branch: `release/v0.5.0-rc.1`
- GitHub push: successful
- GitHub CI: Quality workflow passed on the release commit
- CI run: https://github.com/mitayag/socbadging/actions/runs/45948070978

Default branch `main` remains at `c90ad36`; only the release branch contains the approved enhancement.

## 4. Approved Release Commit

- Commit: `3ffd0cab02ec8d181cb3a50af3e3c9a2f784c31b`
- Commit URL: https://github.com/mitayag/socbadging/commit/3ffd0cab02ec8d181cb3a50af3e3c9a2f784c31b
- Message: `feat(roster): enhance student import with four-step wizard`
- Local and remote hashes matched at the time of preflight.
- Report and all 14 screenshot evidence files were verified as present remotely.

## 5. Previous Production Commit

The previous production commit could not be retrieved because production shell access was unavailable.

Historical operations reports identify the production host/project as `badging-server` / `hau_soc_badging_stage2`, but this could not be independently verified from the current operator environment and must not be assumed for deployment.

## 6. Deployment Date and Time

- Date: 27 November 2026
- Local time: 15:02 +0800
- UTC time: 07:02 UTC
- Deployment outcome: blocked before any production change

## 7. Preflight Assessment

### Public production baseline

| Check                                      | Result                          |
| ------------------------------------------ | ------------------------------- |
| `https://socbadging.hausoc.org/api/health` | HTTP 200                        |
| Application readiness                      | `ready`                         |
| Database                                   | `ready`                         |
| Signer                                     | `ready`                         |
| Notification worker heartbeat              | `fresh`                         |
| Notifications status                       | `ready`                         |
| `/login`                                   | HTTP 200                        |
| `/api/issuers/hau-soc`                     | HTTP 200                        |
| `/student`                                 | HTTP 307 redirect               |
| `/dashboard`                               | HTTP 200                        |
| HTTPS certificate                          | Valid, 5 Nov 2026 to 3 Feb 2027 |

The publicly visible health state indicates that the previously reported notification-worker/stale-heartbeat issue is not currently present at the public health layer. It could not be verified internally because host access was unavailable.

### SSH access assessment

| Target                                                  | Result                                              |
| ------------------------------------------------------- | --------------------------------------------------- |
| Configured alias `badging-server` (`100.126.199.26:22`) | Connected — restricted status-only wrapper          |
| Public host (`122.3.149.244:22`)                        | Network unreachable                                 |
| LAN host `192.168.3.234:22`                             | Connection refused                                  |
| Tailscale client on operator machine                    | Active (`100.126.51.252`)                           |
| Configured SSH user                                     | `socbadging-test`, restricted status-only           |
| `root` and unapproved admin users                       | Permission denied — available key is not authorized |

The configured account is not documented as an approved administrative deployment account. No attempt was made to bypass access controls or use unauthorized credentials.

### Unverified production details

Because access was unavailable, the following could not be verified:

- Actual `/opt/socbadging` contents.
- Actual production Git branch and commit.
- Docker and Docker Compose versions.
- Actual Compose project name and active compose files.
- Running container image identifiers.
- Host disk space and memory.
- Reverse proxy configuration.
- Production environment file and secret references.
- Current application image rollback availability.

## 8. Backup Evidence and Integrity Verification

- Backup status: NOT CREATED
- Backup verification: NOT PERFORMED
- Database/media backup: NOT CREATED
- Signing-key backup: NOT CREATED
- Backup exit codes: NOT APPLICABLE
- Backup file sizes: NOT APPLICABLE
- Database dump integrity: NOT VERIFIED

The approved procedure requires a verified recoverable backup before any production change. That condition was not met, so deployment correctly stopped.

## 9. Container Status Before and After

### Before

- Public production health endpoint is healthy.
- Actual host container status could not be inspected.
- No production container was restarted, recreated, or stopped.

### After

- No production deployment occurred.
- No service was rebuilt or recreated.
- No container state was changed by this deployment attempt.

## 10. Services Rebuilt or Recreated

None. No `docker compose build`, `up`, `restart`, or `down` command was executed against production.

## 11. Database Migration Assessment

- Schema requirement for the Student Import enhancement: none.
- Migration required: no.
- Migration executed: no.
- Production database accessed: no.
- Production database modified: no.

## 12. Production Smoke-Test Results

Only non-mutating public checks were possible:

| Check                      | Result                      |
| -------------------------- | --------------------------- |
| Public health endpoint     | PASS                        |
| Readiness                  | PASS                        |
| Database readiness signal  | PASS                        |
| Signer readiness signal    | PASS                        |
| Worker heartbeat freshness | PASS at public health layer |
| HTTPS availability         | PASS                        |
| Issuer endpoint            | PASS                        |
| Login page availability    | PASS                        |

Authenticated production UI validation could not be performed because there was no approved authenticated test session and no Admin/Faculty test credentials were available in this environment.

Student Import production functional acceptance was therefore not executed. The isolated production-build Playwright acceptance remains the authoritative functional evidence for this release.

## 13. Security Verification

- Production authorization boundaries were not modified.
- No production credentials or secrets were accessed.
- No session tokens or environment files were read.
- No unauthorized access bypass was attempted.
- No public endpoint exposed sensitive error details.
- Existing signing keys and credentials were not changed.
- No production database or student data was accessed.

## 14. Notification Worker Assessment

Public `/api/health` reported:

- `notifications.status`: `ready`
- `workerHeartbeat`: `fresh`

The previously reported stale-heartbeat condition was not visible at the public health layer during this preflight. Internal queue state, pending deliveries, failed deliveries, in-progress attempts, stale claims, and duplicate risks could not be assessed because database and host access were unavailable.

No notification was resent or generated.

## 15. Production Screenshot Evidence

No production screenshots were captured. Authenticated production access and an approved production test account/class were unavailable.

Existing isolated production-build evidence remains under:

`docs/evidence/student-import-uiux/`

No actual student information, passwords, tokens, secrets, or sensitive server details were collected in this blocked deployment attempt.

## 16. Actual Service Interruption

None. No production deployment operation was executed.

## 17. Known Limitations and Advisories

- Production administrative access must be restored before deployment can proceed.
- Tailscale connectivity is now available from the operator environment.
- The configured `socbadging-test` account is restricted to a status-only wrapper.
- No approved administrative SSH account/key is available for deployment.
- Production backups were not created because host access was unavailable.
- Production host, Compose project, current commit, and image rollback identifiers remain unverified.
- Public health is currently healthy, including a fresh worker heartbeat, but internal queue health is unverified.
- GitHub CI covers format, lint, typecheck, unit tests, and build; MariaDB integration and Playwright remain local/staging acceptance gates.
- Default branch `main` remains at `c90ad36`. Only `release/v0.5.0-rc.1` has been updated.

## 18. Rollback Status

Rollback was not required. No production change was made.

No database restore was attempted. No application image was replaced. No container was restarted.

## 19. Final Production Readiness Decision

**PRODUCTION DEPLOYMENT BLOCKED**

Reason: Tailscale is reachable, but only the restricted status-only SSH account is available. No approved administrative deployment account/key was available, and the required verified backup could not be created. The approved procedure mandates a NO-GO when backup verification is impossible.

Required next steps:

1. Provide the approved administrative SSH account/key for the production host.
2. Confirm administrative shell and Docker Compose access, not the status-only test wrapper.
3. Verify `/opt/socbadging`, the actual production Compose project, current commit, images, resources, and proxy state.
4. Create and verify fresh database/media and signing-key backups.
5. Re-run preflight and proceed with the web-only deployment plan.

No production acceptance is claimed.
