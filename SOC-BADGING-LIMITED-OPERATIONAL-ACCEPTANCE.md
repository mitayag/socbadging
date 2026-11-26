# SOC Badging — Limited Operational Acceptance

**Date:** 22 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production project:** `hau_soc_badging_stage2`  
**Production worker:** `hau_soc_badging_stage2-worker-1`  
**Status:** Limited acceptance for continued monitored operation only  
**Full production GO:** Not declared  
**Certification readiness:** Not declared

## 1. Production deployment and service health

| Item                       | Verified value                                       |
| -------------------------- | ---------------------------------------------------- |
| Public URL                 | `https://socbadging.hausoc.org`                      |
| Reverse-proxy upstream     | `http://192.168.3.234:3002` via Nginx Proxy Manager  |
| Production Compose project | `hau_soc_badging_stage2`                             |
| Production worker          | `hau_soc_badging_stage2-worker-1`                    |
| TLS                        | Let's Encrypt certificate, online proxy              |
| Web health                 | HTTP 200, readiness `ready`                          |
| Database                   | `ready`                                              |
| Signer                     | `ready`, key ID `staging-2026-11`, `eddsa-rdfc-2022` |
| Notification worker        | `ready`, fresh heartbeat at last verified check      |
| Public status list         | HTTP 200, signed proof verified externally           |

The worker was unhealthy/stale for an extended period, then reported healthy/fresh during Stage 5F.10.
The cause of that recovery was not established and was not caused by an OpenCode deployment.

**Critical caveat:** the production worker image has not been verified as the corrected Stage 5F.4
image. The original image remains `sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914`.
If the worker is still running that image, the unbounded-I/O defect may recur even though it is
currently healthy.

## 2. Backup evidence

| Asset                                 | Evidence                                                        | Status                |
| ------------------------------------- | --------------------------------------------------------------- | --------------------- |
| Proxmox VM 130                        | Backup completed successfully (TASK OK), 22 November 2026       | PASS — VM-level       |
| MariaDB logical backup                | Checksum and isolated restore passed (administrator-confirmed)  | PASS                  |
| Media backup                          | Checksum and archive integrity passed (administrator-confirmed) | PASS                  |
| Separate encrypted signing-key backup | Deferred by administrator                                       | DEFERRED — not passed |
| Off-host binlog/PITR                  | Not verified in this acceptance                                 | OUTSTANDING           |

The VM-level backup is not proof of independent signing-key recovery, application consistency, or a
successful full-stack restore. Database and media restore evidence is administrator-supplied.

## 3. Completed local automated testing

| Gate                                          | Result                         |
| --------------------------------------------- | ------------------------------ |
| Format / lint / typecheck                     | PASS                           |
| Unit tests                                    | 117 files / 872 tests PASS     |
| Integration tests                             | 21 files / 150 tests PASS      |
| Production build                              | PASS                           |
| Worker runtime/timeout/SMTP-hang tests        | PASS                           |
| Playwright desktop + mobile (prior local run) | 57 passed, 1 skipped by design |

These are local/isolated test results. They do not constitute production acceptance or certification
evidence.

## 4. Outstanding security, recovery, and production acceptance requirements

1. **Signing-key custody:** classify whether `staging-2026-11` is a naming-only or staging-provenance
   key. No rotation is authorized.
2. **Signing-key recovery:** create and verify a separate encrypted backup with fingerprint restore;
   VM backup alone is not sufficient.
3. **Worker image verification:** confirm the running production image ID/labels and determine whether
   the corrected Stage 5F.4 image is deployed. If not, plan an approved worker-only deployment.
4. **Post-deployment validation:** prove cycles, heartbeat, Docker health, queue behavior, and absence
   of duplicate emails on the corrected image.
5. **Production acceptance testing:** production Playwright/account testing remains separately
   unauthorized.
6. **External email/provider acceptance:** Brevo sender/DNS/webhook/inbox acceptance remains pending
   outside limited operational acceptance.
7. **Monitoring ownership:** assign alert owner/escalation contacts for worker, database, backups, and
   disk.
8. **PITR/off-host backups:** confirm binary-log shipping and replay if a short RPO is required.
9. **Dependency advisories:** production audit is clean, but dev-tooling advisories remain tracked for
   separate upgrade work.

## 5. Explicitly deferred requirements and risks

| Deferred item                                  | Risk                                                                                                                                                          |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Separate encrypted signing-key backup          | Key loss/corruption could impair signing, status-list publication, and recovery; VM backup may not be encrypted/access-controlled or independently restorable |
| `staging-2026-11` custody classification       | Key provenance uncertainty; no assurance that production signing material was handled under production controls                                               |
| Corrected worker image deployment/verification | If the original image remains, the unbounded-I/O stall can recur                                                                                              |
| Full production acceptance/Playwright          | Role/issuance/revocation/email flows are not re-accepted against the live production deployment                                                               |
| External Brevo/DNS/webhook acceptance          | Provider delivery, inbox receipt, and webhook lifecycle are not fully evidenced                                                                               |
| Off-host binlog/PITR                           | Short-RPO recovery is not proven; current realistic RPO may be the backup interval                                                                            |

Deferred items are **not completed, passed, or waived for full production GO**.

## 6. Minimum continuing operational safeguards

1. Monitor `/api/health` every 5 minutes and alert on HTTP non-200, `readiness` not ready, stale
   heartbeat, or notifications degraded.
2. Monitor Docker worker health and worker logs for `notification.worker.timeout`,
   `notification.worker.error`, and `stall_exit`.
3. Check queue counts, `PROCESSING` claims, `STARTED` attempts, and duplicate provider message IDs at
   least daily.
4. Verify DB/media backups daily and the VM backup on schedule; record checksums and restore drills.
5. Monitor disk capacity, backup job success, certificate expiry, and signer readiness.
6. Restrict container, SSH, and secret access; never weaken the restricted test account.
7. Require change approval for worker image changes, database actions, key actions, DNS/proxy changes,
   and any bulk email.
8. Keep the deferred signing-key and worker-image items on the corrective-maintenance list.

## 7. Conditions requiring suspension or corrective maintenance

Suspend outbound notification processing and escalate if:

- the worker heartbeat becomes stale or Docker health becomes unhealthy;
- notification cycles stop or the worker exits repeatedly;
- duplicate provider message IDs or duplicate emails are suspected;
- the queue accumulates `PROCESSING`/`STARTED` rows without progress;
- the database or signer becomes unavailable;
- a backup fails, cannot be verified, or restore evidence is missing;
- signing-key compromise, loss, or custody uncertainty is discovered;
- a security incident or credential exposure occurs.

Suspend the affected service or place the system in maintenance-only mode if production acceptance
evidence is found to be invalid, if unauthorized configuration changes occur, or if the deferred
signing-key recovery risk becomes material.

## 8. Acceptance statement

**Limited Operational Acceptance: CONDITIONAL PASS for continued monitored operation only.**

The system may continue operating under the safeguards above while the deferred security, recovery,
worker-image, and production-acceptance items are addressed.

This is **not** a full production GO, not certification, and not a declaration that deferred
requirements are complete. No production configuration, database, signing key, container, or
application service was modified in preparing this report.
