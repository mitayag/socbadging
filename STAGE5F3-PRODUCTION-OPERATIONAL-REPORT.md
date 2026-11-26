# Stage 5F.3 Production Operational Report

**Date:** 5 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**SSH alias:** `badging-server`  
**Restricted account:** `socbadging-test`  
**Production changes:** None  
**Worker restarted:** No  
**Signing key changed:** No  
**Restore/deploy/Playwright/email:** None

**Companion checklist:** `PRODUCTION-ADMIN-VERIFICATION-CHECKLIST.md`

## 1. Restricted access evidence

```text
HAU SOC Badging — Restricted Test Access
Host: badging-server
UTC: 2026-11-22T07:19:23Z
Health HTTP: 200
```

Production health:

```json
{
  "status": "ok",
  "readiness": "ready",
  "database": { "status": "ready" },
  "notifications": { "status": "degraded", "workerHeartbeat": "stale" },
  "signer": {
    "status": "ready",
    "keyId": "https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11",
    "cryptosuite": "eddsa-rdfc-2022"
  }
}
```

The restricted access exposes status only. It does not expose container state, logs, queue tables, or
backup files.

## 2. Notification worker diagnosis

### 2.1 Health logic

- `src/platform/health/health.ts` defines `WORKER_STALE_AFTER_MS = 5 * 60_000`.
- A heartbeat older than **300 seconds** is reported `stale`.
- `notifications.status` becomes `degraded` when the heartbeat is stale or `mailStatus` is `degraded`.
- The worker writes the heartbeat after every cycle, including degraded/error cycles where the DB is
  writable (`recordWorkerHeartbeat` in `src/worker.ts`).
- The production worker health check (`scripts/worker-healthcheck.mjs`) also uses a **5-minute**
  maximum heartbeat age.
- Production Compose health check: every 30s, timeout 10s, 3 retries, start period 30s.
- `restart: unless-stopped` does not automatically restart a container merely because its Docker
  health check is unhealthy.

### 2.2 Observed state

| Signal                          | Result                                                              |
| ------------------------------- | ------------------------------------------------------------------- |
| Web/API health                  | PASS — HTTP 200                                                     |
| Database                        | PASS — ready                                                        |
| Signer                          | PASS — ready                                                        |
| Notification heartbeat          | FAIL — stale                                                        |
| Notification status             | FAIL — degraded                                                     |
| Worker container state          | BLOCKED — not visible through restricted access                     |
| Worker logs                     | BLOCKED — not visible                                               |
| Queue depth/last attempt        | BLOCKED — not visible                                               |
| Proof worker is processing jobs | FAIL/BLOCKED — stale heartbeat indicates no recent successful cycle |

The worker is **not proven to be processing notifications**. It may be stopped, crash-looping, hung,
misconfigured, or unable to write heartbeats. The DB itself is ready, so a total database outage is
not the explanation.

### 2.3 Ranked probable causes

1. **Worker stopped or crash-looping** — missing/old heartbeat, container may still exist.
2. **Hung worker cycle** — a blocking DB/SMTP/network call prevents the loop and heartbeat update.
   The local SMTP transport has no explicit connection/greeting/socket timeout in
   `src/modules/email/.../smtp-client.ts`; a stalled provider connection could block the loop.
3. **Worker not started after migration/deploy** — Compose profile or service start failure.
4. **Worker-specific DB/credential failure** — heartbeat write fails even though web DB access works.
5. **Poll interval configured above 5 minutes** — would make a healthy worker appear stale.
6. **Clock/time issue** — less likely; the timestamp would need to be old or malformed.
7. **Health row not updated after an image/version mismatch** — possible but requires logs/container
   inspection.

### 2.4 Recommended corrective actions

1. Run the read-only worker checks in `PRODUCTION-ADMIN-VERIFICATION-CHECKLIST.md` section B.
2. Record container status/restart count/health, last logs, heartbeat age, queue counts, and last
   attempt/event timestamps.
3. Do not restart or modify the worker until the cause is identified and approved.
4. If the worker is healthy but poll interval >300s, align the interval or heartbeat threshold.
5. If SMTP calls can hang, add explicit SMTP timeouts in a reviewed application change and redeploy
   through the approved process.
6. If the worker is stopped/crash-looping, restore the approved service/configuration and then verify
   fresh heartbeat, queue processing, and notification history.
7. Do not send external email as part of diagnosis.

## 3. Production signing-key review (`staging-2026-11`)

### 3.1 Public evidence

| Item               | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| Key ID             | `https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11` |
| Controller         | `https://socbadging.hausoc.org/api/issuers/hau-soc`                      |
| Public multikey    | `z6Mkggc2kqVvuj68G3aVvewPZbcv69GgDkQ8SuyyhYqgag8x`                       |
| Public trust state | `ACTIVE`                                                                 |
| Key type           | `Multikey` (Ed25519)                                                     |
| Cryptosuite        | `eddsa-rdfc-2022`                                                        |

The issuer profile publishes exactly this verification method. The key is not publicly marked
retired or compromised.

### 3.2 Naming vs actual staging key

The ID contains `staging-2026-11`. This **may be only a label**, or it may indicate that a
staging-generated key was promoted to production. Public metadata cannot prove private-key
provenance. Classification requires the database/key-custody/audit checks in the companion checklist
section C.

### 3.3 Impact assessment

- Historical signed credentials embed the key ID and remain verifiable only while that public key
  remains published with an acceptable trust state.
- If the key was generated/custodied under production controls, the name is a documentation issue;
  **do not rename it** because the ID is embedded in immutable signed credentials.
- If the key was generated for staging or custody is uncertain, treat it as a production risk and
  plan rotation through the approved key lifecycle.
- A normal rotation should:
  1. generate a new production key;
  2. register/activate it;
  3. retire (not delete) the old key for historical verification;
  4. re-sign the status list with the new active key;
  5. leave historical credential payloads unchanged.
- Mark the old key `COMPROMISED` only if compromise is actually suspected/confirmed, with incident
  approval. Compromised keys cause trust warnings/rejection for historical credentials.

**Rotation necessity: BLOCKED pending provenance/custody evidence.** No key was displayed, exported,
rotated, or replaced.

## 4. Backup evidence collection

The backup procedures and scripts are documented and locally tested. Production evidence remains
unavailable through restricted access.

| Requirement                       | Status  | Evidence needed                                         |
| --------------------------------- | ------- | ------------------------------------------------------- |
| Recent production DB backup       | BLOCKED | Latest dump, timestamp, size, checksum                  |
| DB backup checksum verification   | BLOCKED | `SHA256SUMS` verification output                        |
| Media backup + checksum           | BLOCKED | Matching media archive and verification                 |
| Application config/secrets backup | BLOCKED | Encrypted vault record/checksum                         |
| Signing-key recovery materials    | BLOCKED | Separate encrypted archive, checksum, fingerprint match |
| Restore drill evidence            | BLOCKED | Date/target/operator/result                             |
| Retention enforcement             | BLOCKED | Timer/cron plus recent successful run                   |
| Off-host storage                  | BLOCKED | Off-host copy and access control                        |
| Off-host binlog/PITR              | BLOCKED | Binlog archive and tested replay                        |
| Backup/restore owner              | BLOCKED | Named owner and escalation contact                      |

Local documentation and scripts are available:

- `docs/operations/backup-restore-runbook.md`
- `docs/operations/database-migrations.md`
- `STAGE5D-BACKUP-RECOVERY.md`
- `STAGE5E2-BACKUP-MONITORING.md`
- `scripts/backup.sh`, `scripts/verify-backup.sh`, `scripts/restore.sh`,
  `scripts/backup-signing-key.sh`

No backup was created, restored, deleted, or altered in production.

## 5. Readiness classification

| Finding                             | Classification                                 |
| ----------------------------------- | ---------------------------------------------- |
| SSH restricted access               | PASS                                           |
| Restricted status command           | PASS                                           |
| Web/API health HTTP 200             | PASS                                           |
| Database readiness                  | PASS                                           |
| Signer readiness/public key         | PASS                                           |
| Notification worker heartbeat       | FAIL — stale/degraded                          |
| Worker job-processing proof         | BLOCKED                                        |
| Worker root-cause diagnosis         | BLOCKED — requires admin logs/container access |
| Signing key public metadata         | PASS                                           |
| Signing-key provenance/custody      | BLOCKED                                        |
| Rotation decision                   | BLOCKED                                        |
| Production DB/media backup evidence | BLOCKED                                        |
| Config/secrets backup evidence      | BLOCKED                                        |
| Signing-key recovery evidence       | BLOCKED                                        |
| Restore/PITR evidence               | BLOCKED                                        |
| Backup retention/owner              | BLOCKED                                        |
| Production acceptance testing       | BLOCKED                                        |
| Administrator action required       | YES                                            |

## 6. Required administrator actions before production testing

1. Diagnose/repair the notification worker and restore a fresh heartbeat.
2. Prove queue processing with recent attempt/event timestamps and successful cycle logs.
3. Classify `staging-2026-11` provenance/custody from DB/audit/key metadata; decide whether rotation is
   required without exposing key material.
4. Verify production DB/media/config/secrets/signing-key backups and checksums.
5. Verify restore drill, retention enforcement, off-host storage, and PITR decision.
6. Name the backup/restore owner and approve RPO/RTO.
7. Re-run `/api/health` until notifications are `ready` and the heartbeat is fresh.
8. Separately authorize production acceptance/Playwright testing.

## 7. GO/NO-GO

**Production GO/NO-GO: NO-GO.**

Blocking findings:

- notification worker stale/degraded;
- worker job processing not proven;
- signing-key provenance/custody unclassified;
- production backup evidence unverified;
- restore/PITR/retention/ownership not evidenced.

No production data, worker, signing key, SSH configuration, backup, account, DNS, proxy, or email was
modified. No deploy, commit, push, restore, or production Playwright test was performed.
