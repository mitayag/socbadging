# Stage 5F.2 Production Backup Verification

**Date:** 5 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**SSH alias:** `badging-server`  
**Restricted user:** `socbadging-test`  
**Production changes:** None  
**Production restore performed:** No

## 1. SSH and restricted access verification

| Check                      | Result              | Evidence                                             |
| -------------------------- | ------------------- | ---------------------------------------------------- |
| `ssh -T badging-server`    | **PASS**            | Exit code `0`                                        |
| Restricted status command  | **PASS**            | Printed host, UTC time, `Health HTTP: 200`           |
| Authentication method      | **PASS**            | Dedicated key; restricted command only               |
| Production health endpoint | **PASS**            | HTTP 200, readiness `ready`                          |
| Database readiness         | **PASS**            | `database.status = ready`                            |
| Signer readiness           | **PASS**            | `signer.status = ready`, key ID `staging-2026-11`    |
| Notification worker        | **FAIL / DEGRADED** | `notifications.status = degraded`, heartbeat `stale` |

Observed restricted-command output:

```text
HAU SOC Badging — Restricted Test Access
Host: badging-server
UTC: 2026-11-22T07:17:05Z
Health HTTP: 200
```

No arbitrary shell, file read, backup listing, or privilege escalation was attempted. The restricted
access was not bypassed.

## 2. Backup procedure review

The repository contains the following approved backup/recovery assets:

| Asset                                       | Purpose                                  |
| ------------------------------------------- | ---------------------------------------- |
| `scripts/backup.sh`                         | MariaDB dump + media archive + checksums |
| `scripts/verify-backup.sh`                  | Backup format and SHA-256 verification   |
| `scripts/restore.sh`                        | Disposable-project restore               |
| `scripts/backup-signing-key.sh`             | Separate encrypted signing-key backup    |
| `scripts/production-healthcheck.sh`         | Backup freshness and queue/status checks |
| `docs/operations/backup-restore-runbook.md` | Operator restore runbook                 |
| `docs/operations/database-migrations.md`    | Migration/rollback procedure             |
| `STAGE5D-BACKUP-RECOVERY.md`                | Retention, PITR, RPO/RTO, rollback       |
| `STAGE5E2-BACKUP-MONITORING.md`             | Prior local backup/monitoring evidence   |

Documented retention:

- daily DB/media: 30 days;
- weekly: 90 days;
- monthly: 1 year;
- signing-key encrypted backups: 365 days or institutional policy;
- MariaDB binlogs: 14 days minimum, recommended off-host shipping.

Documented RPO/RTO:

| Scenario                  | RPO                         | RTO           |
| ------------------------- | --------------------------- | ------------- |
| App/worker failure        | 0                           | 15–30 minutes |
| DB daily-backup only      | up to 24 hours              | 2–4 hours     |
| DB with off-host binlogs  | 5–15 minutes                | 2–4 hours     |
| Signing key vault restore | no key loss if vault intact | 1–2 hours     |
| Media loss                | last backup                 | 1–2 hours     |

## 3. Production backup evidence availability

| Requirement                                          | Result      | Notes                                                        |
| ---------------------------------------------------- | ----------- | ------------------------------------------------------------ |
| Recent database backup exists                        | **BLOCKED** | Restricted SSH exposes health only; no file/backup access    |
| Database backup checksum verified                    | **BLOCKED** | Requires elevated read-only host access                      |
| Media backup exists/verified                         | **BLOCKED** | Requires elevated read-only host access                      |
| Backup freshness within policy                       | **BLOCKED** | No backup directory/timer visibility                         |
| Application configuration backup                     | **BLOCKED** | Secrets/config vault evidence not exposed                    |
| Signing-key recovery materials                       | **BLOCKED** | Separate vault/archive evidence not exposed                  |
| Signing-key backup checksum/fingerprint verification | **BLOCKED** | Requires approved encrypted backup access                    |
| Restore drill evidence                               | **BLOCKED** | No production restore report visible; restore not performed  |
| Off-host binlog shipping                             | **BLOCKED** | No evidence through restricted access                        |
| Backup retention enforcement                         | **BLOCKED** | Policy documented locally; production enforcement unverified |
| Named backup/restore owner                           | **BLOCKED** | Not supplied                                                 |

The approved restricted command does not expose backup paths, timestamps, checksums, retention, or
vault status. No backup evidence can be asserted from this access level.

## 4. Current production health finding

`/api/health` reports:

```json
{
  "status": "ok",
  "readiness": "ready",
  "database": { "status": "ready" },
  "notifications": { "status": "degraded", "workerHeartbeat": "stale" },
  "signer": {
    "status": "ready",
    "keyId": "https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11"
  }
}
```

This is an operational blocker independent of backup verification:

- the notification worker heartbeat is stale;
- notification delivery/email acceptance cannot be considered ready;
- the production signing key is named `staging-2026-11`, which should be reviewed for production
  custody/classification (do not rotate without approval).

No worker restart or production change was performed.

## 5. Administrator-executable verification commands

These commands are read-only and require elevated host access. Do not print secrets, private keys, or
backup contents.

### 5.1 Backup inventory and freshness

```sh
sudo find /var/backups/hau-soc -maxdepth 2 -type f \
  \( -name database.sql -o -name media.tar.gz -o -name backup.properties -o -name SHA256SUMS \) \
  -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' | sort

sudo find /var/backups/hau-soc -maxdepth 1 -type d \
  \( -name 'backup-*' -o -name 'signing-key-*' \) \
  -printf '%TY-%Tm-%Td %TH:%TM %p\n' | sort
```

### 5.2 Verify the latest DB/media backup

```sh
# Set to the reviewed latest backup directory; do not guess.
LATEST=/var/backups/hau-soc/backup-<timestamp>

sudo sh -c "cd '$LATEST' && sha256sum -c SHA256SUMS"
sudo cat "$LATEST/backup.properties"
sudo tar -tzf "$LATEST/media.tar.gz" >/dev/null && echo media-archive-ok
```

### 5.3 Verify backup scheduling and retention

```sh
systemctl list-timers --all | grep -iE 'backup|hau|socbadging'
crontab -l 2>/dev/null | grep -iE 'backup|hau|socbadging'
sudo find /var/backups/hau-soc -maxdepth 1 -type d -mtime +30 -print
```

### 5.4 Database and binlog status

```sh
docker compose -p hau-soc-badging-prod exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" \
    -e "SHOW BINARY LOGS; SELECT NOW();"
'
```

Confirm off-host binlog shipping/export exists separately; local VM binlogs alone do not satisfy
host-loss PITR.

### 5.5 Application configuration/secrets backup

```sh
sudo ls -l /etc/hau-soc /etc/hau-soc/secrets
```

Confirm the encrypted vault/backup record exists, with checksum and restore procedure. Do not cat,
decrypt, or display the files.

### 5.6 Signing-key recovery materials

```sh
SIGNING_BACKUP=/var/backups/hau-soc/signing-key-<timestamp>
sudo sh -c "cd '$SIGNING_BACKUP' && sha256sum -c SHA256SUMS"
sudo ls -l "$SIGNING_BACKUP"
```

Then follow `docs/runbooks/open-badges-key-lifecycle.md` to decrypt into a restricted temporary
location, derive the public key/fingerprint, compare it to the registered `SIGNING_PUBLIC_MULTIKEY`
and `SIGNING_KEY_FINGERPRINT`, and remove the temporary copy. Never print or commit the private key.

### 5.7 Restore-drill evidence

```sh
sudo find /var/backups /var/log -maxdepth 3 -type f \
  \( -iname '*restore*' -o -iname '*drill*' -o -iname '*backup*report*' \) \
  -printf '%TY-%Tm-%Td %TH:%TM %p\n' | sort | tail -20
```

Confirm date, target, operator, row/media/credential checks, and RPO/RTO achieved. Do not restore to
production.

### 5.8 Worker heartbeat

```sh
docker compose -p hau-soc-badging-prod ps worker
docker compose -p hau-soc-badging-prod logs --tail=100 worker
curl -fsS http://127.0.0.1:3001/api/health
```

## 6. Production testing readiness

| Area                                      | Status                |
| ----------------------------------------- | --------------------- |
| SSH restricted access                     | PASS                  |
| Restricted status command                 | PASS                  |
| Production health HTTP                    | PASS                  |
| Database/signer readiness                 | PASS                  |
| Notification worker                       | FAIL — stale/degraded |
| Backup procedure documentation            | PASS                  |
| Production database backup evidence       | BLOCKED               |
| Production media backup evidence          | BLOCKED               |
| Application configuration backup evidence | BLOCKED               |
| Signing-key recovery evidence             | BLOCKED               |
| Restore-drill evidence                    | BLOCKED               |
| Off-host PITR/binlog evidence             | BLOCKED               |
| Backup owner/RPO/RTO sign-off             | BLOCKED               |
| Production Playwright/account testing     | BLOCKED               |

## 7. Verdict

**SSH and restricted status verification: PASS.**  
**Backup procedure documentation: PASS.**  
**Production backup verification: BLOCKED** — the approved restricted access exposes only health,
not backup files, checksums, retention, vault, or restore evidence.  
**Worker heartbeat: FAIL/DEGRADED.**  
**Production testing readiness: BLOCKED.**

No production data, SSH configuration, accounts, keys, backup files, DNS, proxy, or email were
modified. No restore, deployment, Playwright production test, commit, or push was performed.

Production GO remains **NO-GO** until the elevated backup checks in section 5 pass, the worker is
healthy, the production key classification is reviewed, and production acceptance testing is
separately authorized.
