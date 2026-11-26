# Stage 5E.2 Backup and Monitoring

**Date:** 5 November 2026  
**Candidate:** `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f`  
**Production data changed:** No

## 1. Backup validation

| Check                              | Result            | Evidence                                                     |
| ---------------------------------- | ----------------- | ------------------------------------------------------------ |
| Database logical backup            | PASS              | `scripts/backup.sh` completed                                |
| Media archive backup               | PASS              | Bundle created                                               |
| Backup checksums                   | PASS              | `scripts/verify-backup.sh` passed                            |
| Backup properties/format           | PASS              | `hau-soc-backup-v1`                                          |
| Isolated restore drill             | PASS              | `scripts/backup-restore.test.sh` passed                      |
| Post-restore DB/media verification | PASS              | Fixture counts, public ID, and media content matched         |
| Signing-key encrypted backup       | PASS              | AES-256-CBC/PBKDF2 archive created                           |
| Signing-key decrypt/restore        | PASS              | Extracted key loaded into signer runtime; health `ready`     |
| Production backup vault            | BLOCKED           | Not provisioned/approved                                     |
| Off-host binlog shipping           | BLOCKED           | Not implemented                                              |
| Retention policy                   | PASS (documented) | Stage 5D policy: daily 30d, weekly 90d, monthly 1y, key 365d |
| RPO/RTO                            | PASS (documented) | See below; short RPO needs binlog shipping                   |
| Restore ownership/approval         | BLOCKED           | No production incident/change approval                       |

No backup was restored over production data.

## 2. Monitoring validation

`scripts/production-healthcheck.sh` ran against the local stack:

```text
web_health=OK
status_list=OK
disk_used_percent=5 OK
backup_freshness=OK
queue_failures_24h=0 OK
webhook_failures_24h=0 OK
notification_backlog=0 OK
status_list_version_mismatch=0 OK
active_recipient_suppressions=0 OK
checks_failed=0
```

| Requirement              | Status              | Evidence                               |
| ------------------------ | ------------------- | -------------------------------------- |
| Web health               | PASS                | `/api/health` 200                      |
| Database health          | PASS                | Health script query                    |
| Signer health            | PASS                | Health endpoint key ID/cryptosuite     |
| Worker heartbeat         | PASS                | Fresh heartbeat                        |
| Email queue failures     | PASS                | Threshold check                        |
| Webhook failures         | PASS                | Threshold check                        |
| Disk capacity            | PASS                | 85% threshold check                    |
| Backup freshness         | PASS                | 36h threshold check                    |
| Status-list consistency  | PASS                | Version mismatch check                 |
| Canary credential        | PASS (configurable) | `MONITOR_CREDENTIAL_PUBLIC_ID` support |
| Alert delivery/ownership | BLOCKED             | No on-call destination/owner assigned  |
| Production log collector | BLOCKED             | Local `json-file` rotation only        |

## 3. RPO/RTO proposal

| Scenario                               | RPO                         | RTO           |
| -------------------------------------- | --------------------------- | ------------- |
| App/worker failure                     | 0 (outbox persists)         | 15–30 minutes |
| Database with daily backup only        | up to 24 hours              | 2–4 hours     |
| Database with off-host binlog shipping | 5–15 minutes                | 2–4 hours     |
| Signing-key vault restore              | no key loss if vault intact | 1–2 hours     |
| Media volume loss                      | last backup                 | 1–2 hours     |

Short-RPO recovery is not production-ready until binlogs are shipped off-host and replay is tested.

## 4. Verdict

**Local backup/restore/monitoring: PASS.**  
**Production vault, off-host binlog shipping, alert ownership, and log collector: BLOCKED.**
