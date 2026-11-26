# Stage 5F.6 Production Queue and Backup Report

**Date:** 5 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production project:** `hau_soc_badging_stage2`  
**Production worker:** `hau_soc_badging_stage2-worker-1`  
**Production image:** `sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914`  
**Image created:** November 5, 2026  
**Worker status:** Unhealthy  
**Local Stage 5F.4 fix:** Tested, not deployed  
**Production changes by OpenCode:** None

## 1. Evidence available

| Evidence                          | Source                              | Status                  |
| --------------------------------- | ----------------------------------- | ----------------------- |
| Production project/worker         | Administrator / Stage 5F.5          | CONFIRMED               |
| Production worker image ID/date   | Administrator                       | CONFIRMED               |
| Worker unhealthy                  | Administrator + public health       | CONFIRMED               |
| Local Stage 5F.4 fix not deployed | Administrator / Stage 5F.5          | CONFIRMED               |
| Public health HTTP 200            | Live read-only check                | CONFIRMED               |
| Queue counts/statuses             | Administrator update (Stage 5F.7)   | **PASS — 0 deliveries** |
| Active/expired claims             | Administrator update (Stage 5F.7)   | **PASS — 0 claims**     |
| STARTED attempts                  | Administrator update (Stage 5F.7)   | **PASS — 0 unfinished** |
| Proxmox VM 130 backup             | Administrator (TASK OK, 2026-11-22) | **PASS — VM-level**     |
| MariaDB/media/config/key recovery | Not supplied                        | **BLOCKED**             |
| Production restore drill          | Not supplied                        | **BLOCKED**             |

Current public health:

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

## 1.1 Stage 5F.7 evidence update (supersedes queue/backup status below)

Administrator-supplied evidence on 22 November 2026:

- Notification deliveries: **0**
- Delivery attempts: **0**
- Unfinished `STARTED` attempts: **0**
- Proxmox VM **130** backup: **Successful (TASK OK)**
- Stage 5F.4 worker fix: locally tested, **not deployed**
- Production image: `sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914`
- Production worker remains unhealthy with stale heartbeat

Revised statuses:

| Item                                                  | Revised status                                                                   |
| ----------------------------------------------------- | -------------------------------------------------------------------------------- |
| Queue/claims/STARTED duplicate risk for current state | **PASS — empty queue**                                                           |
| Proxmox VM-level backup                               | **PASS**                                                                         |
| MariaDB logical backup + checksum                     | **BLOCKED**                                                                      |
| Media/config/signing-key recovery evidence            | **BLOCKED**                                                                      |
| Production restore drill                              | **BLOCKED**                                                                      |
| Current worker image contains Stage 5F.4 fix          | **NO**                                                                           |
| Restart-only duplicate risk from current queue        | **LOW/NONE** (0 deliveries/attempts)                                             |
| Restart-only defect recurrence risk                   | **HIGH** — same unfixed image                                                    |
| Recommended recovery                                  | **Deploy corrected worker image**, not restart-only                              |
| Production GO/NO-GO                                   | **NO-GO** until logical/media/key recovery, deploy approval, and readiness gates |

Sections below retain the read-only collection commands; their earlier BLOCKED queue statements are
superseded by this administrator evidence.

## 2. Notification queue and status analysis

**BLOCKED — no queue evidence was supplied.** Do not infer queue safety from HTTP 200 or the container
being present.

Read-only administrator command:

```sh
cd /opt/socbadging
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml

docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT status, COUNT(*) AS count
    FROM notification_deliveries
    GROUP BY status ORDER BY status;
    SELECT COUNT(*) AS due_pending
    FROM notification_deliveries
    WHERE status IN ('\''PENDING'\'', '\''RETRY_SCHEDULED'\'')
      AND next_attempt_at <= UTC_TIMESTAMP(3);
    SELECT delivery_channel, status, COUNT(*) AS count
    FROM notification_deliveries
    GROUP BY delivery_channel, status ORDER BY delivery_channel, status;
  "
'
```

Required evidence to classify queue state:

- total counts by queue status (`PENDING`, `PROCESSING`, `RETRY_SCHEDULED`, `SENT`, `FAILED`);
- due pending/retry counts;
- per-channel counts;
- age of the oldest due job.

## 3. Active and expired processing claims

**BLOCKED — no claim evidence was supplied.**

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT id, delivery_channel, attempt_count, next_attempt_at,
           claim_token IS NOT NULL AS claimed,
           claim_expires_at,
           TIMESTAMPDIFF(SECOND, claim_expires_at, UTC_TIMESTAMP()) AS lease_age_seconds,
           safe_diagnostic_code
    FROM notification_deliveries
    WHERE status = '\''PROCESSING'\''
    ORDER BY claim_expires_at, id;
    SELECT COUNT(*) AS active_claims
    FROM notification_deliveries
    WHERE status = '\''PROCESSING'\'' AND claim_expires_at > UTC_TIMESTAMP(3);
    SELECT COUNT(*) AS expired_claims
    FROM notification_deliveries
    WHERE status = '\''PROCESSING'\''
      AND (claim_expires_at IS NULL OR claim_expires_at <= UTC_TIMESTAMP(3));
  "
'
```

Interpretation:

- Active claim: not re-claimed until lease expiry; restart does not immediately duplicate, but the job
  is blocked until expiry.
- Expired claim: eligible for re-claim after restart; may duplicate if the previous SMTP send
  succeeded but the DB update was lost.
- Null claim on `PROCESSING` is anomalous and needs review.

## 4. STARTED delivery attempts and duplicate risk

**BLOCKED — no attempt evidence was supplied.**

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT id, notification_delivery_id, attempt_number, outcome,
           started_at, completed_at, safe_diagnostic_code, error_category
    FROM notification_delivery_attempts
    ORDER BY started_at DESC LIMIT 100;
    SELECT id, notification_delivery_id, attempt_number, outcome, started_at
    FROM notification_delivery_attempts
    WHERE outcome = '\''STARTED'\''
    ORDER BY started_at DESC LIMIT 50;
    SELECT MAX(started_at) AS last_started, MAX(completed_at) AS last_completed
    FROM notification_delivery_attempts;
    SELECT provider_message_id, COUNT(*) AS duplicate_count
    FROM notification_deliveries
    WHERE provider_message_id IS NOT NULL
    GROUP BY provider_message_id HAVING COUNT(*) > 1;
  "
'
```

Evaluation:

- A `STARTED` attempt without `completed_at` indicates an interrupted send attempt.
- A `STARTED` attempt plus an expired claim is the highest duplicate-risk state.
- Controlled acceptance attempts have a durable one-shot reservation and are excluded from normal
  at-least-once duplicate risk.
- No duplicate provider message IDs currently reported because the evidence was not supplied.

## 5. Restart safety under at-least-once delivery

**Overall restart safety: APPROVED FOR REVIEW ONLY / BLOCKED pending queue evidence.**

| State                              | Restart risk                                                       |
| ---------------------------------- | ------------------------------------------------------------------ |
| PENDING / RETRY_SCHEDULED          | Safe to re-claim; no restart duplicate expected                    |
| PROCESSING with active lease       | Not re-claimed until lease expiry; no immediate duplicate          |
| PROCESSING with expired lease      | At-least-once re-claim; possible duplicate if prior send succeeded |
| STARTED attempt without completion | Possible interrupted/duplicate send; requires review               |
| SENT / FAILED                      | Not re-claimed                                                     |
| Controlled acceptance              | One-shot reservation protects against duplicate submission         |

Normal notification delivery is **at-least-once**, not exactly-once. A restart is not automatically
safe until the administrator reviews all `PROCESSING` and `STARTED` rows and chooses an approved
policy (wait for lease expiry, accept at-least-once retry, or mark outcome unknown with separate DB
approval).

## 6. Backup and recovery evidence

**BLOCKED — no production backup evidence was supplied.** Local scripts/docs do not prove production
backups.

| Requirement                                      | Status  |
| ------------------------------------------------ | ------- |
| Recent DB backup + checksum                      | BLOCKED |
| Media backup + checksum                          | BLOCKED |
| Config/secrets backup                            | BLOCKED |
| Signing-key recovery archive + fingerprint check | BLOCKED |
| Restore drill evidence                           | BLOCKED |
| Off-host storage/binlogs/PITR                    | BLOCKED |
| Retention enforcement                            | BLOCKED |
| Named backup/restore owner                       | BLOCKED |

Read-only administrator commands:

```sh
sudo find /var/backups/hau-soc -maxdepth 2 -type f \
  \( -name database.sql -o -name media.tar.gz -o -name backup.properties -o -name SHA256SUMS \) \
  -printf '%TY-%Tm-%Td %TH:%TM %s %p\n' | sort

LATEST_DB=/var/backups/hau-soc/backup-<timestamp>
sudo sh -c "cd '$LATEST_DB' && sha256sum -c SHA256SUMS"
sudo cat "$LATEST_DB/backup.properties"
sudo tar -tzf "$LATEST_DB/media.tar.gz" >/dev/null && echo media-archive-ok

SIGNING_BACKUP=/var/backups/hau-soc/signing-key-<timestamp>
sudo sh -c "cd '$SIGNING_BACKUP' && sha256sum -c SHA256SUMS"
sudo ls -l "$SIGNING_BACKUP"

sudo ls -l /etc/hau-soc /etc/hau-soc/secrets
systemctl list-timers --all | grep -iE 'backup|hau|socbadging' || true
crontab -l 2>/dev/null | grep -iE 'backup|hau|socbadging' || true
```

Do not decrypt or print key/secret contents. Do not restore production.

## 7. Restart-only vs corrected-image recovery

### Evidence

- The production worker image is
  `sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914`, created
  **November 5, 2026**.
- The Stage 5F.4 fix is tested locally but **not deployed**.
- The current worker has no heartbeat/cycles; a restart-only operation would restart the same
  defective image.
- The Stage 5F.4 fix adds cycle/SMTP/DB timeouts, bounded heartbeat writes, structured diagnostics,
  and a repeated-stall exit.

### Recommendation

**Deploy the corrected worker image rather than restart-only**, after separate deployment approval.

Reasons:

1. Restart-only reuses the image with the confirmed unbounded-I/O defect; recurrence is likely.
2. The corrected image has local test evidence for timeout, heartbeat, recovery, and SMTP-hang
   behavior.
3. Restart-only does not improve diagnostics or prevent the next indefinite hang.

**Restart-only is acceptable only as a temporary, explicitly approved mitigation** if deployment is
not yet approved, and only after queue/claim/attempt review shows no unacceptable duplicate risk. It
must be monitored and treated as an interim recovery, not a fix.

### Image verification commands

```sh
WORKER_ID=$(docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps -q worker)
WEB_ID=$(docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps -q web)

docker inspect "$WORKER_ID" --format \
  'container={{.Name}} image={{.Image}} created={{.Created}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} restarts={{.RestartCount}}'
docker image inspect sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914 \
  --format 'id={{.Id}} created={{.Created}} tags={{json .RepoTags}} digests={{json .RepoDigests}}'
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" images

docker exec "$WORKER_ID" test -f /app/src/modules/notifications/services/worker-runtime.ts \
  && echo stage5f4-fix-file-present || echo stage5f4-fix-file-absent
docker exec "$WORKER_ID" grep -q NOTIFICATION_CYCLE_TIMEOUT_MS /app/src/worker.ts \
  && echo stage5f4-env-wired || echo stage5f4-env-missing
docker exec "$WORKER_ID" printenv NOTIFICATION_CYCLE_TIMEOUT_MS || echo cycle-timeout-unset
```

Expected for the current image: fix absent. Confirm before deployment.

## 8. Post-recovery verification commands

Use after an approved restart or corrected-image deployment.

```sh
PROD_HEALTH_URL=http://127.0.0.1:3002/api/health
WORKER=hau_soc_badging_stage2-worker-1

for i in $(seq 1 12); do
  date -u
  curl -fsS "$PROD_HEALTH_URL" || true
  docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$WORKER"
  sleep 5
done

docker logs --since=10m --tail=200 "$WORKER"
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" logs --since=10m --tail=200 worker
```

Pass criteria:

- `notification.worker.starting` then `notification.worker.cycle` every ~5 seconds.
- Heartbeat fresh (≤300s; preferably ≤30s).
- `/api/health` shows `notifications.status=ready`, `workerHeartbeat=fresh`.
- Docker health `healthy`.
- Queue/claim counts move without unexpected mass failures.
- No new duplicate provider message IDs or duplicate SENT attempts.
- Web/DB/signer remain healthy and staging remains untouched.

Read-only post-recovery SQL:

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT id, mail_status, recorded_at, TIMESTAMPDIFF(SECOND, recorded_at, UTC_TIMESTAMP()) AS age_seconds
    FROM operational_heartbeats WHERE id = '\''notification-worker'\'';
    SELECT status, COUNT(*) FROM notification_deliveries GROUP BY status;
    SELECT id, status, claim_expires_at FROM notification_deliveries WHERE status = '\''PROCESSING'\'';
    SELECT provider_message_id, COUNT(*) FROM notification_deliveries
    WHERE provider_message_id IS NOT NULL
    GROUP BY provider_message_id HAVING COUNT(*) > 1;
  "
'
```

## 9. Remaining blockers and approvals

| Blocker                                                   | Required action                                                              |
| --------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Queue counts/claims/attempts unverified                   | Run section 2–4 read-only commands; attach output                            |
| Duplicate-risk policy unapproved                          | Approve wait-for-lease or outcome-unknown policy                             |
| Production DB/media/config/signing-key backups unverified | Run section 6; attach checksums/restore evidence                             |
| Current worker image lacks the fix                        | Approve corrected-image deployment                                           |
| Restart-only recurrence risk                              | Prefer corrected image; restart-only only as temporary approved mitigation   |
| Stack-side non-secret config not compared                 | Capture `APP_URL`, `SIGNING_KEY_ID`, email policy, poll interval from stage2 |
| Signing-key custody `staging-2026-11`                     | Resolve separately; do not rotate during worker recovery                     |
| Maintenance window/owner                                  | Written approval and named operator/rollback owner                           |
| Production acceptance/Playwright                          | Separate approval                                                            |

## 10. GO/NO-GO

**Production GO/NO-GO: NO-GO.**

The production stack is confirmed and the local fix is tested, but:

- queue/claims/STARTED are confirmed empty (resolved; no current duplicate risk);
- MariaDB logical/media/config/signing-key recovery evidence is missing;
- VM backup is successful at the VM level but restore/application consistency is unverified;
- the current production image does not include the fix;
- restart-only recovery would re-run the defective image;
- maintenance/deployment approvals are not present.

**Recommended path:** complete the MariaDB/media/config/signing-key recovery drills, approve the
corrected worker image, then deploy the corrected worker image (preferred). Restart-only is not
preferred because it re-runs the unfixed image. Verify heartbeat, cycles, Docker health, queue
movement, and duplicate indicators afterward.

No production data, container, image, key, email, DNS, proxy, commit, or push was modified.
