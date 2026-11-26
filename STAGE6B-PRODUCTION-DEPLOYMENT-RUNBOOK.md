# Stage 6B Production Deployment Runbook

**Date:** 22 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production project:** `hau_soc_badging_stage2`  
**Production worker:** `hau_soc_badging_stage2-worker-1`  
**Deployment status in Stage 6B:** **NOT EXECUTED / BLOCKED**  
**Live email:** **NOT SENT**

## 1. Authorization and scope

Do not execute this runbook until all are supplied:

- [ ] Written approval for the Stage 6B release and maintenance window.
- [ ] Named deployment operator and rollback owner.
- [ ] Approved production host/admin access; do not bypass restricted SSH.
- [ ] Confirmation the source snapshot is committed/tagged or the dirty-tree hash is formally accepted.
- [ ] Verified DB/media/signing-key backup evidence.
- [ ] Confirmation the existing production configuration and rollback images are preserved.
- [ ] Explicit statement that no migration is required/approved.
- [ ] Separate approval for the live-email pilot; this runbook does not authorize a send.

Stage 6B release content is identified in `STAGE6B-RELEASE-MANIFEST.md`. Deployment is **blocked**
until the manifest's source, image, rollback, schema, and host checks pass.

## 2. Fixed release references

| Item                    | Value                                                                     |
| ----------------------- | ------------------------------------------------------------------------- |
| Base commit             | `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f`                                |
| Source snapshot SHA-256 | `a8c209e18d5f034d46eba36a7fb3d4a809306eed5da3335b9bc016e9c1a4e51b`        |
| Worker tag              | `hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f`                     |
| Worker image ID         | `sha256:511a1a2f8afea034992f4266a423f049ec04e8fa98a28c96dbe05116b7d38379` |
| Worker tar SHA-256      | `3b37f608c21b1f77818dd51400ce05f740c07cf709e979897b49e9d1081800ed`        |
| Web tag                 | `hau-soc-badging-web:stage6b-6d2f403-a8c209e18d5f`                        |
| Web image ID            | `sha256:927561474586020d4753446bd52328c9af9f597e22ae3c1874bb1589a7204d38` |
| Web tar SHA-256         | `26c262d0732378f2df6130abe6911161ae9f0cfe0dc7cd7959d3fd716f838fc7`        |
| Architecture            | `linux/amd64`                                                             |
| Migrations              | None in this release; do not run `migrate`                                |

## 3. Preflight

### 3.1 Production host and architecture

```sh
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
WORKER=hau_soc_badging_stage2-worker-1
WEB=hau_soc_badging_stage2-web-1

uname -m
docker info --format 'server_arch={{.Architecture}}'
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps
```

Required: architecture is `x86_64`/`amd64`; all services healthy; the production stack identity is
confirmed as the stack serving the public URL.

### 3.2 Health and worker heartbeat

```sh
curl -fsS http://127.0.0.1:3002/api/health
docker inspect "$WORKER" --format \
  'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} image={{.Image}}'
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" logs --since=15m --tail=150 worker
```

Required: HTTP 200, notifications ready, fresh heartbeat, recent `notification.worker.cycle`, no
timeout/stall errors. If stale, **STOP** and investigate; do not deploy as a workaround.

### 3.3 Preserve current images and configuration

```sh
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RECORD=/var/tmp/socbadging-stage6b-$STAMP
sudo install -d -m 700 "$RECORD"

docker inspect "$WORKER" | sudo tee "$RECORD/worker-before.json" >/dev/null
docker inspect "$WEB" | sudo tee "$RECORD/web-before.json" >/dev/null
docker inspect -f '{{.Image}}' "$WORKER" | sudo tee "$RECORD/worker-image-before.txt"
docker inspect -f '{{.Image}}' "$WEB" | sudo tee "$RECORD/web-image-before.txt"
docker inspect -f '{{json .Config.Env}}' "$WORKER" | sudo tee "$RECORD/worker-env-before.json" >/dev/null
docker inspect -f '{{json .Config.Env}}' "$WEB" | sudo tee "$RECORD/web-env-before.json" >/dev/null
sudo cp "$COMPOSE_FILE" "$RECORD/compose.production.yaml.before"
```

Do not print secrets from the environment JSON. The operator record is for rollback comparison only.

Create rollback tags:

```sh
docker image tag "$(cat "$RECORD/worker-image-before.txt")" hau-soc-badging-worker:pre-stage6b
docker image tag "$(cat "$RECORD/web-image-before.txt")" hau-soc-badging-web:pre-stage6b
docker image inspect hau-soc-badging-worker:pre-stage6b --format 'worker_rollback={{.Id}}'
docker image inspect hau-soc-badging-web:pre-stage6b --format 'web_rollback={{.Id}}'
```

**BLOCKED:** the web rollback ID is currently unknown; it must be captured here before proceeding.

### 3.4 Queue and duplicate baseline

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT status, COUNT(*) FROM notification_deliveries GROUP BY status;
    SELECT COUNT(*) FROM notification_delivery_attempts WHERE outcome = '\''STARTED'\'';
    SELECT provider_message_id, COUNT(*) FROM notification_deliveries
      WHERE provider_message_id IS NOT NULL
      GROUP BY provider_message_id HAVING COUNT(*) > 1;
  "
'
```

Required before deployment: 0 deliveries, 0 attempts, 0 unfinished `STARTED`, no duplicate provider
message IDs. If not empty, stop and review; do not deploy a worker that could claim live jobs during
preflight.

### 3.5 Production schema verification (read-only)

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT migration_name, finished_at FROM _prisma_migrations ORDER BY finished_at DESC LIMIT 5;
    SHOW COLUMNS FROM operational_heartbeats LIKE '\''mail_status'\'';
    SHOW COLUMNS FROM badge_issuances LIKE '\''recipient_snapshot_json'\'';
    SHOW COLUMNS FROM badge_issuances LIKE '\''achievement_snapshot_json'\'';
    SELECT COUNT(*) AS pending_migrations
      FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;
  "
'
```

Required:

- `mail_status` exists;
- both snapshot columns exist;
- no pending/failed migrations;
- the ledger matches the 21-migration source chain or an approved superset.

If any check fails, **STOP**. Do not run migrations without separate approval.

### 3.6 Verify production Brevo/sender configuration (non-secret only)

```sh
for c in web worker; do
  ID=$(docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps -q "$c")
  echo "== $c"
  docker inspect "$ID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^(EMAIL_DELIVERY_MODE|EMAIL_RECIPIENT_POLICY|EXTERNAL_EMAIL_ENABLED|CONTROLLED_ACCEPTANCE_ONLY|BREVO_SMTP_HOST|BREVO_SMTP_PORT|BREVO_SENDER|BREVO_WEBHOOK_ENABLED|NOTIFICATION_CYCLE_TIMEOUT_MS)='
  docker inspect "$ID" --format 'secrets={{json .Config.Secrets}}'
done
```

Do not print `BREVO_SMTP_USER`, SMTP password, webhook secret, database URL, or signer token.

## 4. Transfer and load release images

```sh
RELEASE_DIR=/var/tmp/socbadging-stage6b-images
sudo install -d -m 700 "$RELEASE_DIR"
# Transfer the two tar files from the release workstation into $RELEASE_DIR.
cd "$RELEASE_DIR"
sha256sum -c SHA256SUMS
# Expected:
# 3b37f...  hau-soc-badging-worker-stage6b-6d2f403-a8c209e18d5f.tar
# 26c26...  hau-soc-badging-web-stage6b-6d2f403-a8c209e18d5f.tar
docker load -i hau-soc-badging-worker-stage6b-6d2f403-a8c209e18d5f.tar
docker load -i hau-soc-badging-web-stage6b-6d2f403-a8c209e18d5f.tar
```

Verify loaded images before deployment:

```sh
docker image inspect hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f --format \
  'id={{.Id}} arch={{.Architecture}} labels={{json .Config.Labels}}'
docker image inspect hau-soc-badging-web:stage6b-6d2f403-a8c209e18d5f --format \
  'id={{.Id}} arch={{.Architecture}} labels={{json .Config.Labels}}'
```

Expected IDs and source-tree label must match the manifest exactly. If not, stop; do not retag a
different image.

## 5. Worker-first deployment sequence

Worker-first is required so the reliability fix and email template are active before the web sharing
changes. The worker is backward-compatible with the current schema and web.

### 5.1 Pin and validate the worker image

Create a local override outside the repository:

```yaml
# /var/tmp/socbadging-stage6b-worker.yaml
services:
  worker:
    image: hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f
```

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" \
  -f /var/tmp/socbadging-stage6b-worker.yaml config --quiet
```

Do not print the rendered config; it contains secret mount paths and public configuration.

### 5.2 Replace only the worker

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" \
  -f /var/tmp/socbadging-stage6b-worker.yaml \
  up -d --no-deps --no-build worker
```

`--no-deps` is mandatory: it prevents `migrate`, `db`, `signer`, and media-init from being recreated.

### 5.3 Verify worker before touching web

```sh
sleep 20
docker inspect "$WORKER" --format \
  'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} image={{.Image}}'
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" logs --since=5m --tail=150 worker
curl -fsS http://127.0.0.1:3002/api/health
docker exec "$WORKER" test -f /app/src/modules/notifications/services/worker-runtime.ts && echo fix-present
docker exec "$WORKER" printenv NOTIFICATION_CYCLE_TIMEOUT_MS
```

Pass:

- image ID equals `sha256:511a1a...`;
- status running, health healthy;
- `fix-present`;
- cycle logs every ~5s, status ready, processed 0 (no live queue);
- heartbeat fresh, notifications ready;
- no `notification.worker.timeout`, `notification.worker.error`, or `stall_exit`.

If any check fails, immediately roll back the worker (§8) and stop.

## 6. Web deployment sequence

### 6.1 Pin and validate the web image

```yaml
# /var/tmp/socbadging-stage6b-web.yaml
services:
  web:
    image: hau-soc-badging-web:stage6b-6d2f403-a8c209e18d5f
```

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" \
  -f /var/tmp/socbadging-stage6b-web.yaml config --quiet
```

### 6.2 Replace only web

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" \
  -f /var/tmp/socbadging-stage6b-web.yaml \
  up -d --no-deps --no-build web
```

Do not recreate `signer`, `db`, `migrate`, or `media-init`.

### 6.3 Verify web

```sh
sleep 20
docker inspect "$WEB" --format \
  'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} image={{.Image}}'
curl -fsS http://127.0.0.1:3002/api/health
curl -fsS -o /dev/null -w 'issuer=%{http_code}\n' https://socbadging.hausoc.org/api/issuers/hau-soc
curl -fsS -o /dev/null -w 'status-list=%{http_code}\n' \
  https://socbadging.hausoc.org/api/status-lists/status-list-local
```

Pass: web running/healthy, image ID `sha256:927561...`, health ready, issuer and status-list 200.

## 7. Existing credential verifiability and public-page checks

Select one active production public ID **read-only**; do not expose student PII in logs:

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT public_id FROM badge_issuances
    WHERE status = '\''ACTIVE'\'' AND signed_credential_json IS NOT NULL
    ORDER BY issued_at DESC LIMIT 1;
  "
'
```

Set `PUBLIC_ID` to the returned opaque value, then:

```sh
BASE=https://socbadging.hausoc.org
for p in "/credentials/$PUBLIC_ID" "/api/credentials/$PUBLIC_ID" \
         "/api/credentials/$PUBLIC_ID/status" "/api/credentials/$PUBLIC_ID/download" \
         "/api/credentials/$PUBLIC_ID/image" "/api/credentials/$PUBLIC_ID/pdf" \
         "/api/credentials/$PUBLIC_ID/qr"; do
  curl -fsS -o /dev/null -w "%{http_code} %{content_type} $p\n" "$BASE$p"
done
```

Pass: public page/API 200, signed credential still verifies, downloads/QR return expected content,
status list still publishes the credential status. No issuance or revocation is performed.

Check social preview and privacy after deployment:

- public page contains Open Graph/Twitter metadata for a sharing-enabled active credential;
- no recipient email or student number is visible in page/HTML metadata;
- a global-sharing-disabled page has no social preview metadata and is `noindex`;
- LinkedIn certification link appears only for active credentials;
- copy/QR/download links resolve.

## 8. Rollback

### Worker rollback

```sh
# /var/tmp/socbadging-stage6b-worker-rollback.yaml
services:
  worker:
    image: hau-soc-badging-worker:pre-stage6b

docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" \
  -f /var/tmp/socbadging-stage6b-worker-rollback.yaml \
  up -d --no-deps --no-build worker
docker inspect "$WORKER" --format 'image={{.Image}} status={{.State.Status}}'
```

### Web rollback

```sh
# /var/tmp/socbadging-stage6b-web-rollback.yaml
services:
  web:
    image: hau-soc-badging-web:pre-stage6b

docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" \
  -f /var/tmp/socbadging-stage6b-web-rollback.yaml \
  up -d --no-deps --no-build web
docker inspect "$WEB" --format 'image={{.Image}} status={{.State.Status}}'
```

Do not restore the database, run migrations, or rotate the signing key for an application rollback.
Preserve logs, audit records, and notification records.

## 9. Stop conditions

Stop and roll back the affected service if:

- loaded image IDs or labels differ from the manifest;
- worker health is unhealthy or heartbeat is stale;
- cycle timeout/error/stall logs appear;
- queue has `PROCESSING`/`STARTED` rows or duplicate provider message IDs;
- migration ledger/schema check fails;
- web health is not ready;
- existing public credentials/status-list verification fails;
- any unexpected email is sent or queued.

## 10. Deployment completion gate

Deployment is complete only after:

- [ ] Worker and web image IDs match the manifest.
- [ ] Worker cycles run and heartbeat is fresh for 30 minutes.
- [ ] Web health, issuer, status-list, credential page, downloads, QR, and sharing checks pass.
- [ ] No unexpected queue/duplicate/email activity.
- [ ] Rollback images are preserved and tested by inspection.
- [ ] Operator records the deployment time, image IDs, evidence, and rollback owner.
- [ ] A separate authorization is obtained before the live-email pilot.

**Stage 6B does not authorize the live-email pilot or general student issuance.**
