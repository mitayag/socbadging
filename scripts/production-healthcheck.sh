#!/bin/sh
set -eu

PROJECT="${COMPOSE_PROJECT_NAME:-hau-soc-badging-prod}"
COMPOSE_FILE="${COMPOSE_FILE:-compose.production.yaml}"
ENV_FILE="${PRODUCTION_ENV_FILE:-/etc/hau-soc/production.env}"
BASE_URL="${HEALTH_BASE_URL:-http://127.0.0.1:3001}"
STATUS_LIST_ID="${STATUS_LIST_ID:-status-list-local}"
DISK_PATH="${DISK_PATH:-/}"
DISK_MAX_PERCENT="${DISK_MAX_PERCENT:-85}"
BACKUP_ROOT="${BACKUP_ROOT:-/var/backups/hau-soc}"
BACKUP_MAX_AGE_HOURS="${BACKUP_MAX_AGE_HOURS:-36}"
MAX_QUEUE_FAILURES="${MAX_QUEUE_FAILURES:-10}"
MAX_WEBHOOK_FAILURES="${MAX_WEBHOOK_FAILURES:-25}"
MAX_QUEUE_BACKLOG="${MAX_QUEUE_BACKLOG:-1000}"

failures=0
result() {
  name="$1"
  value="$2"
  state="$3"
  echo "metric=$name value=$value status=$state"
  if [ "$state" = "FAIL" ]; then failures=$((failures + 1)); fi
}

http_check() {
  url="$1"
  expected="$2"
  name="$3"
  code="$(curl -sS -o /tmp/hau-soc-monitor-body.$$ -w '%{http_code}' --max-time 10 "$url" || echo 000)"
  if [ "$code" = "$expected" ]; then
    result "$name" "$code" OK
  else
    result "$name" "$code" FAIL
  fi
  cat /tmp/hau-soc-monitor-body.$$ 2>/dev/null || true
  rm -f /tmp/hau-soc-monitor-body.$$
}

health_body="$(curl -fsS --max-time 10 "$BASE_URL/api/health" 2>/dev/null || true)"
if [ -n "$health_body" ]; then
  health_state="$(printf '%s' "$health_body" | node -e '
    let raw="";process.stdin.on("data",d=>raw+=d).on("end",()=>{
      try { const h=JSON.parse(raw); const ok=h.status==="ok"&&h.readiness==="ready"&&h.database?.status==="ready"&&h.signer?.status==="ready"&&h.notifications?.workerHeartbeat==="fresh"&&h.notifications?.status!=="degraded"; console.log(ok?"OK":"FAIL"); }
      catch { console.log("FAIL"); }
    });' 2>/dev/null || echo FAIL)"
  result web_health "$(printf '%s' "$health_body" | wc -c | tr -d ' ') bytes" "$health_state"
else
  result web_health "unreachable" FAIL
fi

status_code="$(curl -sS -o /tmp/hau-soc-status-list.$$ -w '%{http_code}' --max-time 10 "$BASE_URL/api/status-lists/$STATUS_LIST_ID" || echo 000)"
status_ok="$(node -e '
  const fs=require("fs");const file=process.argv[1];
  try { const d=JSON.parse(fs.readFileSync(file,"utf8")); const ok=d?.proof?.type==="DataIntegrityProof"&&typeof d?.credentialSubject?.encodedList==="string"; console.log(ok?"OK":"FAIL"); } catch { console.log("FAIL"); }
' /tmp/hau-soc-status-list.$$ 2>/dev/null || echo FAIL)"
if [ "$status_code" = "200" ] && [ "$status_ok" = "OK" ]; then
  result status_list 200 OK
else
  result status_list "$status_code" FAIL
fi
rm -f /tmp/hau-soc-status-list.$$

if [ -n "${MONITOR_CREDENTIAL_PUBLIC_ID:-}" ]; then
  http_check "$BASE_URL/api/credentials/$MONITOR_CREDENTIAL_PUBLIC_ID" 200 credential_canary >/dev/null
fi

disk_percent="$(df -P "$DISK_PATH" | awk 'NR==2 {gsub("%","",$5); print $5}')"
if [ -n "$disk_percent" ] && [ "$disk_percent" -lt "$DISK_MAX_PERCENT" ]; then
  result disk_used_percent "$disk_percent" OK
else
  result disk_used_percent "${disk_percent:-unknown}" FAIL
fi

if [ -d "$BACKUP_ROOT" ] && find "$BACKUP_ROOT" -maxdepth 1 -type d -name 'backup-*' -mmin -$((BACKUP_MAX_AGE_HOURS * 60)) -print -quit | grep -q .; then
  result backup_freshness "${BACKUP_MAX_AGE_HOURS}h" OK
else
  result backup_freshness "missing-or-stale" FAIL
fi

db_query() {
  docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" -p "$PROJECT" exec -T db \
    sh -c 'if [ -f /run/secrets/db_root_password ]; then password="$(cat /run/secrets/db_root_password)"; else password="${MARIADB_ROOT_PASSWORD:-}"; fi; mariadb -N -B -uroot -p"$password" "$MARIADB_DATABASE" -e "$1"' sh "$1" 2>/dev/null || echo ERROR
}

queue_failures="$(db_query "SELECT COUNT(*) FROM notification_deliveries WHERE status='FAILED' AND updated_at >= NOW() - INTERVAL 24 HOUR;")"
if [ "$queue_failures" != "ERROR" ] && [ "$queue_failures" -le "$MAX_QUEUE_FAILURES" ]; then
  result queue_failures_24h "$queue_failures" OK
else
  result queue_failures_24h "$queue_failures" FAIL
fi

webhook_failures="$(db_query "SELECT COUNT(*) FROM notification_delivery_events WHERE applied=0 AND event_type IN ('BOUNCED','BLOCKED','INVALID','COMPLAINT') AND occurred_at >= NOW() - INTERVAL 24 HOUR;")"
if [ "$webhook_failures" != "ERROR" ] && [ "$webhook_failures" -le "$MAX_WEBHOOK_FAILURES" ]; then
  result webhook_failures_24h "$webhook_failures" OK
else
  result webhook_failures_24h "$webhook_failures" FAIL
fi

backlog="$(db_query "SELECT COUNT(*) FROM notification_deliveries WHERE status IN ('PENDING','PROCESSING','RETRY_SCHEDULED');")"
if [ "$backlog" != "ERROR" ] && [ "$backlog" -le "$MAX_QUEUE_BACKLOG" ]; then
  result notification_backlog "$backlog" OK
else
  result notification_backlog "$backlog" FAIL
fi

status_version_mismatch="$(db_query "SELECT COUNT(*) FROM credential_status_allocations a INNER JOIN credential_status_lists l ON l.id=a.status_list_id WHERE a.is_revoked=1 AND a.status_list_version <> l.version;")"
if [ "$status_version_mismatch" = "0" ]; then
  result status_list_version_mismatch "$status_version_mismatch" OK
else
  result status_list_version_mismatch "$status_version_mismatch" FAIL
fi

active_suppressions="$(db_query "SELECT COUNT(*) FROM recipient_suppressions WHERE status='ACTIVE';")"
result active_recipient_suppressions "${active_suppressions:-unknown}" OK

echo "checks_failed=$failures"
[ "$failures" -eq 0 ]
