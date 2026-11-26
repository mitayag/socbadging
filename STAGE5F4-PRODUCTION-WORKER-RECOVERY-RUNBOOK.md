# Stage 5F.4 Production Worker Recovery Runbook

**Status:** Prepared, not executed  
**Production changes by OpenCode:** None  
**Restart/deploy authorized:** No  
**External email authorized:** No

This runbook is for an authorized production administrator. Do not execute it from an unrestricted
automation context. Do not restart either stack until the production stack is positively identified.

## 1. Authorization and maintenance window

- [ ] Written approval for a maintenance window.
- [ ] Named operator, incident owner, and rollback owner.
- [ ] Approval to restart only the affected worker (not web/db/signer).
- [ ] Approval to deploy the local worker fix separately, if required.
- [ ] Approval for any production database action; this runbook performs none by default.
- [ ] No external email/Playwright testing during recovery unless separately authorized.

## 2. Confirm the production stack before touching anything

The server has two stacks:

- `hau_soc_badging_stage2`
- `hau_soc_staging`

Administrator-supplied Nginx Proxy Manager evidence confirms:

- domain `socbadging.hausoc.org` forwards to `http://192.168.3.234:3002`;
- production Compose project is `hau_soc_badging_stage2`;
- production worker is `hau_soc_badging_stage2-worker-1`;
- `hau_soc_staging` is a separate non-public stack.

Re-confirm the live mapping from the reverse proxy and container environment before a restart.

```sh
cd /opt/socbadging

docker compose ls
docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' | grep -E 'hau_soc'

# For each candidate web container, identify its Compose project and public config.
for c in $(docker ps --format '{{.Names}}' | grep -E 'hau_soc_.*-web-1'); do
  echo "== $c"
  docker inspect "$c" --format 'project={{index .Config.Labels "com.docker.compose.project"}} image={{.Image}}'
  docker inspect "$c" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^(APP_URL|SIGNING_KEY_ID|EMAIL_DELIVERY_MODE|EMAIL_RECIPIENT_POLICY|NOTIFICATION_POLL_INTERVAL_MS)='
done

# Identify the reverse-proxy upstream for the public hostname.
sudo nginx -T 2>/dev/null | grep -n -B8 -A20 'socbadging.hausoc.org' || true
sudo grep -RIn 'socbadging.hausoc.org' /etc/nginx /etc/openresty /opt 2>/dev/null | head -40
```

Record:

- public production Compose project;
- public production worker container;
- staging Compose project/worker;
- proof that only one worker serves `https://socbadging.hausoc.org`.

**Do not restart if this is not conclusive.**

Set only after confirmation:

```sh
PROD_PROJECT=hau_soc_badging_stage2
PROD_WORKER=hau_soc_badging_stage2-worker-1
PROD_HEALTH_URL=http://127.0.0.1:3002/api/health
STAGING_WORKER=hau_soc_staging-worker-1
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
```

## 3. Verify backup and recovery readiness

Do not restart until the last verified backup set is available. See
`PRODUCTION-ADMIN-VERIFICATION-CHECKLIST.md` and `STAGE5F2-PRODUCTION-BACKUP-VERIFICATION.md`.

Stage 5F.7 evidence: Proxmox VM 130 backup is successful (TASK OK, 22 November 2026), and
notification deliveries/attempts/STARTED attempts are 0. The VM success does not replace verified
MariaDB logical/media/config/signing-key recovery; re-check those before deployment.

Minimum gate:

```sh
LATEST_DB=/var/backups/hau-soc/backup-<timestamp>
sudo sh -c "cd '$LATEST_DB' && sha256sum -c SHA256SUMS"
SIGNING_BACKUP=/var/backups/hau-soc/signing-key-<timestamp>
sudo sh -c "cd '$SIGNING_BACKUP' && sha256sum -c SHA256SUMS"
```

- [ ] Latest DB backup verified and within approved RPO.
- [ ] Matching media backup verified.
- [ ] Config/secrets backup exists in the approved encrypted vault.
- [ ] Signing-key recovery archive verified without exposing key material.
- [ ] Restore drill evidence accepted.
- [ ] RPO/RTO and backup owner confirmed.

If any item is missing, do not restart. Escalate.

## 4. Preserve diagnostics before restart

```sh
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
DIAG=/var/tmp/socbadging-worker-$STAMP
sudo install -d -m 700 "$DIAG"

date -u | sudo tee "$DIAG/date.txt"
docker ps --format '{{.Names}}\t{{.Image}}\t{{.Status}}' | sudo tee "$DIAG/containers.txt"
WORKER_ID=$(docker inspect -f '{{.Id}}' "$PROD_WORKER")
docker inspect "$WORKER_ID" | sudo tee "$DIAG/worker-inspect.json"
docker inspect --format '{{json .State.Health}}' "$WORKER_ID" | sudo tee "$DIAG/worker-health.json"
docker logs --tail=2000 "$PROD_WORKER" > "$DIAG/worker.log" 2>&1
docker stats --no-stream > "$DIAG/stats.txt"
curl -fsS "$PROD_HEALTH_URL" > "$DIAG/health.json" || true
```

Capture without printing secrets/PII. Retain logs for the incident record.

Also record the worker image/version and whether the local Stage 5F.4 fix is present:

```sh
docker inspect "$PROD_WORKER" --format 'image={{.Image}} created={{.Created}}'
docker exec "$PROD_WORKER" test -f /app/src/modules/notifications/services/worker-runtime.ts \
  && echo stage5f4-fix-file-present || echo stage5f4-fix-file-absent
docker exec "$PROD_WORKER" grep -q NOTIFICATION_CYCLE_TIMEOUT_MS /app/src/worker.ts \
  && echo stage5f4-env-wired || echo stage5f4-env-missing
docker exec "$PROD_WORKER" printenv NOTIFICATION_CYCLE_TIMEOUT_MS || echo cycle-timeout-unset
```

## 5. Verify pending and in-progress notification jobs

Run read-only SQL. Do not expose recipient emails in output.

Stage 5F.7 evidence reports 0 notification deliveries, 0 attempts, and 0 unfinished STARTED attempts.
Re-verify immediately before restart/deployment; queue state can change.

```sh
docker compose -p "$PROD_PROJECT" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT status, COUNT(*) FROM notification_deliveries GROUP BY status;
    SELECT id, status, delivery_channel, attempt_count, next_attempt_at,
           claim_expires_at, safe_diagnostic_code
    FROM notification_deliveries
    WHERE status IN ('\''PROCESSING'\'', '\''RETRY_SCHEDULED'\'')
    ORDER BY next_attempt_at, id;
    SELECT id, notification_delivery_id, attempt_number, outcome, started_at, completed_at
    FROM notification_delivery_attempts
    WHERE outcome = '\''STARTED'\''
    ORDER BY started_at DESC LIMIT 50;
    SELECT MAX(started_at), MAX(completed_at) FROM notification_delivery_attempts;
    SELECT MAX(occurred_at) FROM notification_delivery_events;
    SELECT provider_message_id, COUNT(*) FROM notification_deliveries
    WHERE provider_message_id IS NOT NULL
    GROUP BY provider_message_id HAVING COUNT(*) > 1;
  "
'
```

## 6. Duplicate-delivery risk decision

| Observed state                                     | Action before restart                                                                                                 |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| No `PROCESSING` rows, only PENDING/RETRY_SCHEDULED | Restart is queue-safe                                                                                                 |
| `PROCESSING` with future `claim_expires_at`        | Wait for lease expiry or obtain approval for an outcome-unknown cleanup                                               |
| `PROCESSING` with expired `claim_expires_at`       | A prior send may have succeeded. Choose approved at-least-once retry, or mark outcome unknown with DB-change approval |
| `STARTED` attempts without completed timestamp     | Treat as possible interrupted send; review before retry                                                               |
| Controlled acceptance attempts                     | Do not reset/resend; one-shot design                                                                                  |

Normal delivery is at-least-once. There is no exactly-once guarantee for a crash after SMTP acceptance
and before the DB update. Document the chosen risk before restart.

No production DB modification is authorized in this runbook by default. If an `OUTCOME_UNKNOWN`
cleanup is required, use a separate approved maintenance change with backup and audit.

## 7. Restart only the affected worker

After stack confirmation, diagnostics, backup gate, and queue review:

```sh
cd /opt/socbadging
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps worker
docker inspect --format '{{.Image}}' "$PROD_WORKER" | sudo tee -a "$DIAG/worker-image-before.txt"
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" restart worker
```

This restarts only the worker service in the confirmed production project. Do not restart web, db,
signer, or the other stack.

If deploying the Stage 5F.4 fix, a separate approved change is required:

```sh
# ONLY after explicit deploy approval:
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" up -d --no-deps --build worker
```

Do not run the deploy command during diagnosis/restart-only recovery.

## 8. Verify recovery

```sh
for i in $(seq 1 12); do
  date -u
  curl -fsS "$PROD_HEALTH_URL" || true
  docker inspect --format '{{.State.Status}} {{if .State.Health}}{{.State.Health.Status}}{{end}}' "$PROD_WORKER"
  sleep 5
done

docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" logs --tail=100 worker
```

Pass criteria:

- [ ] `notification.worker.starting` then `notification.worker.cycle` logs approximately every 5s.
- [ ] `/api/health` shows `notifications.status=ready` and `workerHeartbeat=fresh`.
- [ ] Docker health becomes `healthy`.
- [ ] Heartbeat age ≤300 seconds, preferably ≤30 seconds.
- [ ] Queue counts show processing/retry movement without unexpected mass failures.
- [ ] No duplicate provider message IDs or duplicate SENT attempts for the same delivery.
- [ ] Web, DB, and signer remain healthy; the other stack is untouched.

## 9. Monitor recurrence

- [ ] Watch worker logs/health for 30 minutes, then 24 hours.
- [ ] Confirm no `notification.worker.timeout`, `notification.worker.error`, or `stall_exit` events.
- [ ] Confirm heartbeat remains fresh and Docker health stays healthy.
- [ ] Monitor queue depth and provider webhook events.
- [ ] Keep the diagnostic bundle and operator timeline.

If heartbeat goes stale again, stop and escalate; do not repeatedly restart.

## 10. Rollback and escalation

### Restart-only rollback

- No code changed; stop the worker if duplicates or instability appear, preserve logs, and escalate.
- Do not restore the database unless a separate incident decision is made.

### Fix-deployment rollback

Record the previous image ID before deployment. If the new image fails:

```sh
# Only with deploy/rollback approval.
docker inspect --format '{{.Image}}' "$PROD_WORKER"
# Re-point the service to the previously recorded image/digest and recreate only the worker.
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" up -d --no-deps worker
```

If duplicate emails are suspected:

1. Stop the production worker.
2. Preserve logs and provider message IDs.
3. Notify the incident owner and provider contact.
4. Do not send test emails or delete notification records.
5. Follow the institution’s privacy/incident process.

### Escalation triggers

- worker exits repeatedly with 70;
- heartbeat remains stale after one restart;
- `PROCESSING`/`STARTED` rows indicate an interrupted send;
- duplicate provider message IDs;
- backup/restore evidence missing;
- production stack identity remains ambiguous.

## 11. Execution record

| Field                          | Value |
| ------------------------------ | ----- |
| Approved by                    |       |
| Maintenance window             |       |
| Production project             |       |
| Production worker              |       |
| Backup set verified            |       |
| PROCESSING rows before restart |       |
| Restart executed at            |       |
| Health after restart           |       |
| Duplicate indicators           |       |
| Rollback/escalation            |       |
| Operator                       |       |

**This runbook was not executed by OpenCode. No production restart, deploy, database change, or email
was performed.**
