# Stage 6D Production SMTP Activation Runbook

**Date:** 22 November 2026  
**Production host:** `badging-server`  
**Production project:** `hau_soc_badging_stage2`  
**Production worker:** `hau_soc_badging_stage2-worker-1`  
**Execution status:** **NOT EXECUTED**  
**Live email:** **NOT SENT**  
**Authorization required:** yes — production change, worker/web recreation, and later pilot email

> Historical Stage 6D staging-recipient pilot runbook. It is superseded for normal production by
> `docs/email/BREVO-CONFIGURATION.md` and the current `deploy/production-brevo.override.yaml`, which
> uses `EMAIL_RECIPIENT_POLICY=production`, an empty allowlist, and an environment-supplied
> `BREVO_SMTP_USER`. Do not execute the staging-policy steps below against current production.

## 1. Scope and guardrails

This runbook switches production email transport from Mailpit to Brevo and verifies the
configuration **without issuing a badge or sending email**.

Do not:

- include `deploy/staging.override.yaml` in the production command;
- run `migrate` or modify the database schema;
- rotate or replace signing keys;
- issue a badge or send an email in this runbook;
- expose secret values;
- bypass the approved production access path.

The later one-recipient send is a separate procedure: `STAGE6D-LIVE-BADGE-EMAIL-PILOT.md`.

## 2. Required approvals

- [ ] Written approval for the Stage 6D production configuration change.
- [ ] Named operator and rollback owner.
- [ ] Maintenance window.
- [ ] Approval to recreate `worker` and `web` only; no DB/signer/migrate changes.
- [ ] Separate approval for the later one-recipient pilot email.
- [ ] Confirmation that `authorized-test-recipient@example.org` is the pilot recipient.
- [ ] Confirmation no migration is required.

## 3. Preflight

Run as the approved production administrator. Do not print secrets.

```sh
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
ENV_FILE=/etc/hau-soc/production.env
WORKER=hau_soc_badging_stage2-worker-1
WEB=hau_soc_badging_stage2-web-1
```

### 3.1 Confirm the stack and current image state

```sh
uname -m
docker info --format 'server_arch={{.Architecture}}'
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
docker inspect "$WORKER" --format \
  'worker status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} image={{.Image}}'
docker inspect "$WEB" --format \
  'web status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} image={{.Image}}'
curl -fsS http://127.0.0.1:3002/api/health
```

Required: `amd64` host, web/worker healthy, database/signer/notifications ready, heartbeat fresh.

### 3.2 Confirm current Mailpit state

```sh
for c in web worker; do
  ID=$(docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps -q "$c")
  echo "== $c"
  docker inspect "$ID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^(EMAIL_DELIVERY_MODE|EMAIL_RECIPIENT_POLICY|EXTERNAL_EMAIL_ENABLED|CONTROLLED_ACCEPTANCE_ONLY|EXTERNAL_EMAIL_ALLOWLIST|SMTP_HOST|SMTP_PORT|SMTP_SECURE|SMTP_FROM|BREVO_SMTP_HOST|BREVO_SMTP_PORT|BREVO_SENDER|BREVO_WEBHOOK_ENABLED)='
done
```

The supplied production finding is Mailpit (`SMTP_HOST=mailpit`, `SMTP_PORT=1025`,
`SMTP_SECURE=false`, `SMTP_FROM=HAU SOC Staging <badges@example.test>`). This runbook corrects it.

### 3.3 Confirm the secret mount

```sh
docker inspect "$WORKER" --format 'worker_secrets={{json .Config.Secrets}}'
docker inspect "$WEB" --format 'web_secrets={{json .Config.Secrets}}'
```

Required:

- `/run/secrets/brevo_smtp_password` is mounted to worker and web;
- the webhook secret is mounted to web;
- do not print secret values;
- do not replace the password secret.

The confirmed Brevo login `<redacted-brevo-smtp-username>` is supplied by the Stage 6D override and is
validated in §5. Do not use `SMTP_USER`; the application does not read it.

### 3.4 Confirm no pending Mailpit work

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT delivery_channel, status, COUNT(*) FROM notification_deliveries
    GROUP BY delivery_channel, status;
    SELECT COUNT(*) FROM notification_delivery_attempts WHERE outcome = '\''STARTED'\'';
    SELECT provider_message_id, COUNT(*) FROM notification_deliveries
      WHERE provider_message_id IS NOT NULL
      GROUP BY provider_message_id HAVING COUNT(*) > 1;
  "
'
```

Required: no `PENDING`, `RETRY_SCHEDULED`, or `PROCESSING` rows; 0 unfinished `STARTED`; no duplicate
provider IDs. If pending Mailpit rows exist, **STOP** and resolve separately. Do not rewrite their
channel.

### 3.5 Confirm image and migration state

```sh
docker image inspect hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f \
  --format 'id={{.Id}} arch={{.Architecture}} labels={{json .Config.Labels}}'
docker image inspect hau-soc-badging-web:stage6b-6d2f403-a8c209e18d5f \
  --format 'id={{.Id}} arch={{.Architecture}} labels={{json .Config.Labels}}'
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT COUNT(*) FROM _prisma_migrations WHERE finished_at IS NULL AND rolled_back_at IS NULL;
  "
'
```

Required:

- worker ID `sha256:511a1a2f...`; web ID `sha256:92756147...` if deploying Stage 6B web;
- 0 pending migrations;
- no `migrate` run during this activation.

### 3.6 Confirm Brevo sender and webhook prerequisites

```sh
dig +short TXT hausoc.org
dig +short TXT _dmarc.hausoc.org
dig +short TXT brevo1._domainkey.hausoc.org
dig +short TXT brevo2._domainkey.hausoc.org
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --format json \
  | jq -r '.services.web.environment.BREVO_WEBHOOK_ENABLED'
```

Required:

- administrator screenshots confirm `hausoc.org` authenticated, `badges@hausoc.org` verified,
  DKIM verified, DMARC configured;
- webhook endpoint registered in Brevo as `https://socbadging.hausoc.org/api/webhooks/brevo`;
- webhook secret mounted;
- public DNS SPF may still omit Brevo; DKIM/DMARC is the approved path. Do not claim SPF PASS.

### 3.7 Transfer the Stage 6B image archives

The restricted `socbadging-test` account is **status-only** and must not be used for file transfer.
Use the approved administrative SSH/SCP path (or an approved registry) with an account authorized to
write deployment staging files. Do not rebuild the images; the verified archives already exist.

Local archives:

```text
/var/folders/k6/5ffmvl_12cd1s26n2cmyfqzr0000gn/T/opencode/stage6b-images/hau-soc-badging-web-stage6b-6d2f403-a8c209e18d5f.tar
/var/folders/k6/5ffmvl_12cd1s26n2cmyfqzr0000gn/T/opencode/stage6b-images/hau-soc-badging-worker-stage6b-6d2f403-a8c209e18d5f.tar
```

Checksums:

```text
26c262d0732378f2df6130abe6911161ae9f0cfe0dc7cd7959d3fd716f838fc7  web tar
3b37f608c21b1f77818dd51400ce05f740c07cf709e979897b49e9d1081800ed  worker tar
```

On production, before transfer/load:

```sh
ssh <approved-admin>@badging-server 'uname -m; docker info --format "arch={{.Architecture}}"; df -h /var/lib/docker /var/tmp; docker system df'
```

Require `x86_64`/`amd64` and sufficient free space. The supplied host has 14 GB free; the archives are
about 729 MB combined and the loaded images about 765 MB, so the rollback images plus load workspace
must remain within the free-space budget.

Create the staging directory and transfer:

```sh
LOCAL_IMAGES=/var/folders/k6/5ffmvl_12cd1s26n2cmyfqzr0000gn/T/opencode/stage6b-images
ADMIN=<approved-admin>
HOST=badging-server

ssh "$ADMIN@$HOST" 'sudo install -d -m 700 /var/tmp/socbadging-stage6b-images'
scp -C "$LOCAL_IMAGES/hau-soc-badging-web-stage6b-6d2f403-a8c209e18d5f.tar" \
  "$LOCAL_IMAGES/hau-soc-badging-worker-stage6b-6d2f403-a8c209e18d5f.tar" \
  "$ADMIN@$HOST:/tmp/"
ssh "$ADMIN@$HOST" 'sudo mv /tmp/hau-soc-badging-web-stage6b-6d2f403-a8c209e18d5f.tar /tmp/hau-soc-badging-worker-stage6b-6d2f403-a8c209e18d5f.tar /var/tmp/socbadging-stage6b-images/ && sudo chmod 600 /var/tmp/socbadging-stage6b-images/*.tar'
```

Verify on production before `docker load`:

```sh
ssh "$ADMIN@$HOST" 'cd /var/tmp/socbadging-stage6b-images && sha256sum *.tar'
```

Required exact values:

```text
26c262d0732378f2df6130abe6911161ae9f0cfe0dc7cd7959d3fd716f838fc7  hau-soc-badging-web-stage6b-6d2f403-a8c209e18d5f.tar
3b37f608c21b1f77818dd51400ce05f740c07cf709e979897b49e9d1081800ed  hau-soc-badging-worker-stage6b-6d2f403-a8c209e18d5f.tar
```

Do not proceed if either checksum differs. Load and verify the images (loading is not a deployment):

```sh
cd /var/tmp/socbadging-stage6b-images
docker load -i hau-soc-badging-web-stage6b-6d2f403-a8c209e18d5f.tar
docker load -i hau-soc-badging-worker-stage6b-6d2f403-a8c209e18d5f.tar
docker image inspect hau-soc-badging-web:stage6b-6d2f403-a8c209e18d5f \
  --format 'web id={{.Id}} arch={{.Architecture}} os={{.Os}}'
docker image inspect hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f \
  --format 'worker id={{.Id}} arch={{.Architecture}} os={{.Os}}'
```

Expected:

```text
web:    sha256:927561474586020d4753446bd52328c9af9f597e22ae3c1874bb1589a7204d38
worker: sha256:511a1a2f8afea034992f4266a423f049ec04e8fa98a28c96dbe05116b7d38379
```

## 4. Preserve rollback images and configuration

```sh
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
RECORD=/var/tmp/socbadging-stage6d-$STAMP
sudo install -d -m 700 "$RECORD"
docker inspect "$WORKER" | sudo tee "$RECORD/worker-before.json" >/dev/null
docker inspect "$WEB" | sudo tee "$RECORD/web-before.json" >/dev/null
docker inspect -f '{{.Image}}' "$WORKER" | sudo tee "$RECORD/worker-image-before.txt"
docker inspect -f '{{.Image}}' "$WEB" | sudo tee "$RECORD/web-image-before.txt"
sudo cp "$ENV_FILE" "$RECORD/production.env.before"
sudo cp "$COMPOSE_FILE" "$RECORD/compose.production.yaml.before"
```

Verify the administrator-preserved rollback images:

```sh
docker image inspect socbadging-worker:rollback-20261123   --format 'worker_rollback={{.Id}}'
docker image inspect socbadging-web:rollback-20261123   --format 'web_rollback={{.Id}}'
```

Expected:

```text
worker rollback: sha256:dc083f41d21a991d2a661a34104a9827357afe31287a971c187e02dc2f21e914
web rollback:    sha256:f80a9d4bdb87779c650c81b8493d0e6723f26294072e9eccd1e45bbcbd089205
```

If either tag is missing or the ID differs, **STOP**; do not deploy. Do not print secret contents from
the environment snapshots.

## 5. Use the persisted Stage 6D overrides

The final project files are:

```text
<repository-root>/deploy/production-brevo.override.yaml
<repository-root>/deploy/production-stage6b-images.override.yaml
```

Transfer them with the image archives to `/var/tmp/socbadging-stage6d/` using the approved
administrative channel. Do not recreate or edit them on production.

```sh
LOCAL_PROJECT=<repository-root>
ADMIN=<approved-admin>
HOST=badging-server

ssh "$ADMIN@$HOST" 'sudo install -d -m 700 /var/tmp/socbadging-stage6d'
scp -C "$LOCAL_PROJECT/deploy/production-brevo.override.yaml" \
  "$LOCAL_PROJECT/deploy/production-stage6b-images.override.yaml" \
  "$ADMIN@$HOST:/tmp/"
ssh "$ADMIN@$HOST" 'sudo mv /tmp/production-brevo.override.yaml /tmp/production-stage6b-images.override.yaml /var/tmp/socbadging-stage6d/ && sudo chmod 600 /var/tmp/socbadging-stage6d/*.yaml'
ssh "$ADMIN@$HOST" 'cd /var/tmp/socbadging-stage6d && sha256sum *.yaml'
```

Required checksums:

```text
8e314a5fda4ab1f00e02c2520a6fd2ea03d9b265062d3d8108f05308e8e3aa2c  production-brevo.override.yaml
12d7ca12900e9c82884806b2b74429d447a7b68dbd61c82d1062588659f66337  production-stage6b-images.override.yaml
```

The confirmed SMTP login is non-secret and is included in the Brevo override. Password and webhook
secrets remain in the existing Docker secret mounts; do not add them to either YAML.

### 5.1 Validate the exact production merge order

If production currently includes the staging overlays, they must be applied before the Stage 6D
overrides so Brevo and the image pins win. If they are not present, omit them.

```sh
COMPOSE_ARGS=(-f "$COMPOSE_FILE")
for f in /opt/socbadging/deploy/staging.override.yaml /opt/socbadging/deploy/staging-healthfix.override.yaml; do
  [ -f "$f" ] && COMPOSE_ARGS+=(-f "$f")
done
COMPOSE_ARGS+=(-f /var/tmp/socbadging-stage6d/production-brevo.override.yaml)
COMPOSE_ARGS+=(-f /var/tmp/socbadging-stage6d/production-stage6b-images.override.yaml)

docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" config --quiet

docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" config --format json \
  | jq -r '[.services.worker,.services.web][] | [.image,.environment.EMAIL_DELIVERY_MODE,.environment.EMAIL_RECIPIENT_POLICY,.environment.EXTERNAL_EMAIL_ALLOWLIST,.environment.BREVO_SMTP_HOST,.environment.BREVO_SMTP_PORT,.environment.BREVO_SMTP_USER,.environment.BREVO_SENDER,.environment.BREVO_WEBHOOK_ENABLED] | @tsv'
```

Required for both:

```text
hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f
brevo staging true authorized-test-recipient@example.org smtp-relay.brevo.com 587
<redacted-brevo-smtp-username> HAU SOC Badging System <badges@hausoc.org> true

hau-soc-badging-web:stage6b-6d2f403-a8c209e18d5f
brevo staging true authorized-test-recipient@example.org smtp-relay.brevo.com 587
<redacted-brevo-smtp-username> HAU SOC Badging System <badges@hausoc.org> true
```

Also verify the secret mounts:

```sh
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" config --format json \
  | jq -r '["worker","web"][] as $s | "\($s): \([.services[$s].secrets[].source]|join(","))"'
```

Expected:

```text
worker: database_url,brevo_smtp_password
web: database_url,signer_token,brevo_webhook_secret,brevo_smtp_password
```

`BREVO_WEBHOOK_ENABLED=true` is safe only when the Brevo dashboard webhook is registered for
`https://socbadging.hausoc.org/api/webhooks/brevo` and the mounted `brevo_webhook_secret` matches.
If registration cannot be verified, keep the planned setting but do not approve rollout based on
webhook delivery tracking.

## 6. Worker-first deployment

### 6.1 Validate the pinned release

The release image override pins both services to Stage 6B. Validate the full chain (staging overlays
first, if present) before replacing anything:

```sh
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" config --quiet
docker image inspect hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f \
  --format 'worker id={{.Id}} arch={{.Architecture}} os={{.Os}}'
docker image inspect hau-soc-badging-web:stage6b-6d2f403-a8c209e18d5f \
  --format 'web id={{.Id}} arch={{.Architecture}} os={{.Os}}'
```

### 6.2 Recreate only worker

```sh
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" \
  up -d --no-deps --no-build worker
```

`--no-deps` is mandatory: do not start `migrate`, `db`, `signer`, media-init, or Mailpit.

### 6.3 Verify worker before web

```sh
sleep 20
docker inspect "$WORKER" --format \
  'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} image={{.Image}}'
docker inspect "$WORKER" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(EMAIL_DELIVERY_MODE|EMAIL_RECIPIENT_POLICY|EXTERNAL_EMAIL_ENABLED|EXTERNAL_EMAIL_ALLOWLIST|BREVO_SMTP_HOST|BREVO_SMTP_PORT|BREVO_SENDER|BREVO_WEBHOOK_ENABLED|NOTIFICATION_CYCLE_TIMEOUT_MS)='
test "$(docker exec "$WORKER" printenv BREVO_SMTP_USER)" = "<redacted-brevo-smtp-username>" \
  && echo brevo-user-confirmed
docker exec "$WORKER" test -f /app/src/modules/notifications/services/worker-runtime.ts && echo fix-present
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" logs --since=5m --tail=120 worker
curl -fsS http://127.0.0.1:3002/api/health
```

Pass: Stage 6B worker image, mode `brevo`, policy `staging`, exact allowlist/login/sender, healthy
cycles, fresh heartbeat, `fix-present`, no timeout/error/stall logs.

If it fails, roll back worker immediately (§8) and stop.

## 7. Web deployment

The web must also use Brevo so new issuance notifications are enqueued as `delivery_channel=brevo`.
Deploy the pinned Stage 6B web image after the worker passes.

```sh
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" \
  up -d --no-deps --no-build web
```

Do not recreate signer, db, migrate, media-init, or Mailpit.

Verify:

```sh
sleep 20
docker inspect "$WEB" --format \
  'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} image={{.Image}}'
docker inspect "$WEB" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(EMAIL_DELIVERY_MODE|EMAIL_RECIPIENT_POLICY|EXTERNAL_EMAIL_ENABLED|EXTERNAL_EMAIL_ALLOWLIST|BREVO_SMTP_HOST|BREVO_SMTP_PORT|BREVO_SENDER|BREVO_WEBHOOK_ENABLED)='
test "$(docker exec "$WEB" printenv BREVO_SMTP_USER)" = "<redacted-brevo-smtp-username>" \
  && echo web-brevo-user-confirmed
curl -fsS http://127.0.0.1:3002/api/health
curl -fsS -o /dev/null -w 'issuer=%{http_code}\n' https://socbadging.hausoc.org/api/issuers/hau-soc
curl -fsS -o /dev/null -w 'status-list=%{http_code}\n' https://socbadging.hausoc.org/api/status-lists/status-list-local
```

Pass: Stage 6B web image, mode `brevo`, policy/allowlist/login/sender exact, health ready,
issuer/status-list 200.

## 8. Rollback

### 8.1 Worker

```yaml
# /var/tmp/socbadging-stage6d-worker-rollback.yaml
services:
  worker:
    image: socbadging-worker:rollback-20261123
```

```sh
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" -f /var/tmp/socbadging-stage6d-worker-rollback.yaml \
  up -d --no-deps --no-build worker
```

### 8.2 Web

```yaml
# /var/tmp/socbadging-stage6d-web-rollback.yaml
services:
  web:
    image: socbadging-web:rollback-20261123
```

```sh
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" -f /var/tmp/socbadging-stage6d-web-rollback.yaml \
  up -d --no-deps --no-build web
```

Do not restore the database, run migrations, or rotate keys for a config rollback. Preserve logs,
notification rows, and audit records. If any unexpected email was sent, stop and follow incident
procedure.

## 9. Completion gate for Stage 6D

- [ ] Worker image is Stage 6B and contains the Stage 5F.4 fix.
- [ ] Worker and web both render `EMAIL_DELIVERY_MODE=brevo`.
- [ ] Brevo host/port/sender exact; username present; password secret mounted.
- [ ] Webhook enabled and registered.
- [ ] Worker cycles healthy; heartbeat fresh.
- [ ] Queue remains empty; no duplicate/STARTED rows.
- [ ] Issuer/status-list/health remain 200.
- [ ] Rollback images preserved.
- [ ] No badge issued and no email sent.
- [ ] Separate pilot authorization obtained.

**Stop here.** The live pilot is a separate, explicitly authorized operation.
