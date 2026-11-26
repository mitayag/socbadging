# Stage 5F.5 Production Pre-Recovery Report

**Date:** 5 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**SSH alias:** `badging-server`  
**Restricted account:** `socbadging-test`  
**Production restarts/deployments/DB changes:** None  
**Signing-key changes:** None  
**External email/Playwright:** None

## 1. Executive summary

The production reverse-proxy mapping is now confirmed from administrator-supplied Nginx Proxy
Manager evidence:

| Evidence                   | Confirmed value                   |
| -------------------------- | --------------------------------- |
| Domain                     | `socbadging.hausoc.org`           |
| Forward destination        | `http://192.168.3.234:3002`       |
| Proxy status               | Online                            |
| TLS                        | Let's Encrypt                     |
| Production Compose project | `hau_soc_badging_stage2`          |
| Production worker          | `hau_soc_badging_stage2-worker-1` |

The NPM upstream plus the matching Docker port mapping confirms that
`hau_soc_badging_stage2` serves the public production URL. `hau_soc_staging` is a separate,
non-public stack.

The local worker fix and Stage 5F.4 runbook are ready, but production recovery is still **not
approved**. Remaining blockers are read-only queue/claim evidence, production worker image/version
verification, production backup evidence, stack-side non-secret configuration comparison, signing-key
custody classification, and the maintenance-window/duplicate-risk approvals.

**Pre-recovery recommendation: NO-GO.** Stack identification is PASS; do not restart or deploy until
the remaining evidence and approvals are complete.

## 2. Stage 5F.4 review

| Report                                           | Status                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `STAGE5F4-WORKER-ROOT-CAUSE-ANALYSIS.md`         | Reviewed — root cause SUSPECTED (blocked awaited I/O); unbounded-cycle defect confirmed |
| `STAGE5F4-WORKER-FIX-TEST-REPORT.md`             | Reviewed — local fix PASS; 872 unit / 150 integration tests PASS                        |
| `STAGE5F4-PRODUCTION-WORKER-RECOVERY-RUNBOOK.md` | Reviewed — administrator runbook prepared, not executed                                 |

The local fix is **not deployed to production**. Production worker image provenance remains unverified.

## 3. Production stack confirmation — PASS

### 3.1 Confirmed evidence

| Question                                             | Result        | Evidence                                                 |
| ---------------------------------------------------- | ------------- | -------------------------------------------------------- |
| Which stack serves `socbadging.hausoc.org`?          | **PASS**      | NPM proxy host + Docker port mapping                     |
| Which host/port is the proxy upstream?               | **PASS**      | `http://192.168.3.234:3002`                              |
| Which worker belongs to the public production stack? | **PASS**      | `hau_soc_badging_stage2-worker-1`                        |
| Is `hau_soc_staging` the public stack?               | **PASS — NO** | Separate non-public staging stack                        |
| Proxy status/TLS                                     | **PASS**      | Online, Let's Encrypt                                    |
| Public health                                        | **PASS**      | HTTP 200                                                 |
| Worker heartbeat                                     | **FAIL**      | `notifications.status=degraded`, `workerHeartbeat=stale` |

Public site still identifies its front proxy as `openresty`; the approved NPM proxy-host evidence is
the authoritative upstream mapping. The signer key ID remains
`https://socbadging.hausoc.org/api/issuers/hau-soc/keys/staging-2026-11`; this is a separate custody
question, not a stack-identity question.

### 3.2 Confirmed production identifiers for administrator checks

```sh
PROD_PROJECT=hau_soc_badging_stage2
PROD_WORKER=hau_soc_badging_stage2-worker-1
PROD_HOST=192.168.3.234
PROD_PORT=3002
PROD_HEALTH_URL=http://127.0.0.1:3002/api/health   # or http://192.168.3.234:3002/api/health
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
STAGING_WORKER=hau_soc_staging-worker-1
```

Do not operate on `hau_soc_staging` for production recovery.

### 3.3 Confirm the port mapping is the production upstream

Read-only administrator check:

```sh
cd /opt/socbadging
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps
WEB_ID=$(docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps -q web)
docker port "$WEB_ID" 3000
curl -fsS "$PROD_HEALTH_URL"
```

Expected: host port `3002` is mapped to the stage2 web container port `3000`, matching the NPM forward
destination.

## 4. Configuration comparison

| Configuration       | Public/confirmed evidence       | Stack-side read-only evidence |
| ------------------- | ------------------------------- | ----------------------------- |
| `APP_URL`           | `https://socbadging.hausoc.org` | **BLOCKED — command below**   |
| `SIGNING_KEY_ID`    | `.../keys/staging-2026-11`      | **BLOCKED — command below**   |
| Signer cryptosuite  | `eddsa-rdfc-2022`               | **BLOCKED — command below**   |
| Email mode/policy   | Unknown                         | **BLOCKED**                   |
| Poll interval       | Unknown                         | **BLOCKED**                   |
| Worker image digest | Unknown                         | **BLOCKED**                   |
| Web build           | Differs from local candidate    | **FAIL / not identical**      |

Read-only command (public/non-secret values only):

```sh
WEB_ID=$(docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps -q web)
WORKER_ID=$(docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps -q worker)

for c in "$WEB_ID" "$WORKER_ID"; do
  echo "== $c"
  docker inspect "$c" --format 'project={{index .Config.Labels "com.docker.compose.project"}} image={{.Image}} created={{.Created}}'
  docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^(APP_URL|SIGNING_KEY_ID|SIGNING_CRYPTOSUITE|EMAIL_DELIVERY_MODE|EMAIL_RECIPIENT_POLICY|NOTIFICATION_POLL_INTERVAL_MS|NOTIFICATION_CYCLE_TIMEOUT_MS)='
done
```

Do not print SMTP passwords, database URLs, signer tokens, or private key material.

## 5. Production image/version verification

| Check                                       | Status                         |
| ------------------------------------------- | ------------------------------ |
| Confirmed production worker image ID/digest | BLOCKED                        |
| Confirmed worker image build date/release   | BLOCKED                        |
| Confirmed Stage 5F.4 fix presence           | BLOCKED                        |
| Confirmed web/worker version match          | BLOCKED                        |
| Public web build comparison                 | DIFFERENT from local candidate |

Read-only administrator commands:

```sh
cd /opt/socbadging
WORKER_ID=$(docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps -q worker)
WEB_ID=$(docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps -q web)

docker inspect "$WORKER_ID" --format \
  'container={{.Name}} image={{.Image}} created={{.Created}} status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} restarts={{.RestartCount}}'
docker image inspect "$(docker inspect -f '{{.Image}}' "$WORKER_ID")" --format \
  'id={{.Id}} created={{.Created}} tags={{json .RepoTags}} digests={{json .RepoDigests}}'
docker inspect "$WEB_ID" --format 'web_image={{.Image}} web_created={{.Created}}'
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" images
```

Check whether the local Stage 5F.4 fix is present in the running worker image (read-only):

```sh
docker exec "$WORKER_ID" test -f /app/src/modules/notifications/services/worker-runtime.ts \
  && echo stage5f4-fix-file-present || echo stage5f4-fix-file-absent
docker exec "$WORKER_ID" grep -q NOTIFICATION_CYCLE_TIMEOUT_MS /app/src/worker.ts \
  && echo stage5f4-env-wired || echo stage5f4-env-missing
docker exec "$WORKER_ID" printenv NOTIFICATION_CYCLE_TIMEOUT_MS || echo cycle-timeout-unset
```

Expected until separately approved deployment: `stage5f4-fix-absent`. If present, capture the image
digest and confirm the deployment record.

## 6. Backup evidence

No production backup evidence has been supplied yet. Local backup scripts/docs exist, but they do not
prove production backups.

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

## 7. Notification queue, claims, and delivery attempts

Current state is **BLOCKED** through restricted access. Do not infer safety from HTTP 200.

Read-only administrator query:

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT status, COUNT(*) FROM notification_deliveries GROUP BY status;
    SELECT COUNT(*) AS due_pending
    FROM notification_deliveries
    WHERE status IN ('\''PENDING'\'', '\''RETRY_SCHEDULED'\'') AND next_attempt_at <= UTC_TIMESTAMP(3);
    SELECT id, status, delivery_channel, attempt_count, next_attempt_at,
           claim_token IS NOT NULL AS claimed, claim_expires_at,
           TIMESTAMPDIFF(SECOND, claim_expires_at, UTC_TIMESTAMP()) AS lease_age_seconds,
           safe_diagnostic_code
    FROM notification_deliveries
    WHERE status IN ('\''PROCESSING'\'', '\''RETRY_SCHEDULED'\'')
    ORDER BY next_attempt_at, id;
    SELECT id, notification_delivery_id, attempt_number, outcome,
           started_at, completed_at, safe_diagnostic_code, error_category
    FROM notification_delivery_attempts
    ORDER BY started_at DESC LIMIT 100;
    SELECT id, notification_delivery_id, attempt_number, outcome, started_at
    FROM notification_delivery_attempts
    WHERE outcome = '\''STARTED'\''
    ORDER BY started_at DESC LIMIT 50;
    SELECT MAX(started_at) AS last_attempt_started, MAX(completed_at) AS last_attempt_completed
    FROM notification_delivery_attempts;
    SELECT MAX(occurred_at) AS last_provider_event FROM notification_delivery_events;
    SELECT provider_message_id, COUNT(*) AS duplicates
    FROM notification_deliveries
    WHERE provider_message_id IS NOT NULL
    GROUP BY provider_message_id HAVING COUNT(*) > 1;
  "
'
```

Do not modify jobs during this verification.

## 8. Duplicate-email risk

The design remains **at-least-once** for normal notifications:

- PENDING/RETRY_SCHEDULED rows are safe to re-claim.
- PROCESSING rows have a lease; expired claims can be re-claimed.
- A crash after SMTP acceptance and before the DB update can duplicate a send.
- Controlled acceptance has a one-shot reservation and is safe.
- `(issuanceId,type)` uniqueness prevents duplicate delivery rows, not duplicate provider sends.

Restart safety is **not approved** until the queue/claim/attempt output is reviewed. The administrator
must choose and document:

1. wait for lease expiry and accept at-least-once retry; or
2. with separate DB-change approval, mark interrupted attempts `OUTCOME_UNKNOWN` and fail the delivery
   with a safe diagnostic code.

## 9. Recovery command summary

Confirmed production values:

```sh
cd /opt/socbadging
PROD_PROJECT=hau_soc_badging_stage2
PROD_WORKER=hau_soc_badging_stage2-worker-1
PROD_HEALTH_URL=http://127.0.0.1:3002/api/health
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
```

After read-only evidence review and written approval:

```sh
# 1. Capture diagnostics (no secrets/PII)
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DIAG=/var/tmp/socbadging-worker-$STAMP
sudo install -d -m 700 "$DIAG"
docker inspect "$PROD_WORKER" | sudo tee "$DIAG/worker-inspect.json"
docker inspect --format '{{json .State.Health}}' "$PROD_WORKER" | sudo tee "$DIAG/worker-health.json"
docker logs --tail=2000 "$PROD_WORKER" > "$DIAG/worker.log" 2>&1
curl -fsS "$PROD_HEALTH_URL" > "$DIAG/health.json" || true

# 2. Confirm backup + queue evidence (sections 6-7)

# 3. Restart only the confirmed production worker
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" restart worker

# 4. Verify cycles, heartbeat, and Docker health
for i in $(seq 1 12); do
  date -u
  curl -fsS "$PROD_HEALTH_URL" || true
  docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$PROD_WORKER"
  sleep 5
done
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" logs --tail=100 worker
```

This command was **not executed** by OpenCode. Deploying the Stage 5F.4 fix remains a separate approved
change (`up -d --no-deps --build worker`).

## 10. Post-recovery checks

| Check          | Pass criterion                                           |
| -------------- | -------------------------------------------------------- |
| Worker logs    | `notification.worker.starting`, then cycles every ~5s    |
| Heartbeat      | fresh (≤300s; preferably ≤30s)                           |
| Health API     | `notifications.status=ready`, `workerHeartbeat=fresh`    |
| Docker health  | `healthy`                                                |
| Queue          | PENDING/RETRY processed without unexpected mass failures |
| Duplicate risk | no duplicate provider message IDs/new duplicates         |
| Web/DB/signer  | remain healthy                                           |
| Staging        | untouched                                                |
| Monitoring     | no timeout/error/stall_exit recurrence for 30m/24h       |

Rollback/escalation: stop the worker if duplicates or instability appear; preserve logs; revert a new
image to the recorded digest; do not restore DB without separate incident approval.

## 11. Signing-key custody (separate from worker recovery)

Public key `staging-2026-11` is ACTIVE and correctly published. Private-key provenance/custody remains
**BLOCKED**:

- cannot determine whether the name is only a label or indicates a staging-generated key;
- no production key custody/backup evidence;
- no rotation approved.

Do not rotate the key during worker recovery. Resolve through
`PRODUCTION-ADMIN-VERIFICATION-CHECKLIST.md` section C and
`STAGE5F3-PRODUCTION-OPERATIONAL-REPORT.md` before production acceptance.

## 12. Readiness checklist

| Item                                         | Status                                                      |
| -------------------------------------------- | ----------------------------------------------------------- |
| Stage 5F.4 root cause/test/runbook reviewed  | PASS                                                        |
| Local worker fix implemented/tested          | PASS                                                        |
| Public health reachable                      | PASS (HTTP 200)                                             |
| Production worker heartbeat                  | FAIL — stale/degraded                                       |
| NPM upstream evidence supplied               | **PASS**                                                    |
| Production stack confirmed                   | **PASS — `hau_soc_badging_stage2`**                         |
| Production worker confirmed                  | **PASS — `hau_soc_badging_stage2-worker-1`**                |
| NPM upstream `192.168.3.234:3002` confirmed  | **PASS**                                                    |
| Public `APP_URL` confirmed                   | PASS                                                        |
| Stack-side non-secret config comparison      | BLOCKED                                                     |
| Production worker image/version/fix presence | BLOCKED                                                     |
| Production web build matches local candidate | FAIL — different build                                      |
| DB/media/config/signing-key backup evidence  | BLOCKED                                                     |
| Queue/claim/attempt state                    | BLOCKED                                                     |
| Duplicate-email risk assessment              | PASS (analysis) / restart safety BLOCKED without queue data |
| Recovery commands/post-checks                | PASS (prepared)                                             |
| Signing-key custody classification           | BLOCKED / separate                                          |
| Production recovery authorized               | NO                                                          |
| Production deployment readiness              | NOT READY                                                   |
| Production GO/NO-GO                          | **NO-GO**                                                   |

## 13. Remaining approval requirements

1. Run the read-only commands in sections 3.3, 4, 5, 6, and 7.
2. Review the queue/claim/attempt output and approve the duplicate-risk policy.
3. Provide the latest verified DB/media/config/signing-key backup and restore evidence.
4. Confirm the stage2 worker image/version and whether it contains the Stage 5F.4 fix.
5. Approve the maintenance window and restart of only
   `hau_soc_badging_stage2-worker-1`.
6. Approve separate deployment of the Stage 5F.4 fix if the current image is unfixed.
7. Resolve or explicitly defer the `staging-2026-11` custody classification.
8. Separately authorize production acceptance/Playwright testing.

After review, perform the controlled restart using the Stage 5F.4 runbook. Deploying the local fix is a
separate approved change. Production GO remains **NO-GO** until these are complete.

No production restart, deployment, database change, signing-key change, external email, Playwright
test, commit, or push occurred.
