# Stage H Production Execution Procedure

**Date:** 24 November 2026  
**Status:** Prepared — not executed  
**Production:** `badging-server` / `hau_soc_badging_stage2`  
**Approved test recipient:** `authorized-test-recipient@example.org`

## 0. Stop gate

Execute only after written approval of the production change and test-write window. The restricted
`socbadging-test` account is status-only and must not be used for transfer or administration.

## 1. Read-only preflight

```sh
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
ENV_FILE=/etc/hau-soc/production.env
WEB=hau_soc_badging_stage2-web-1
WORKER=hau_soc_badging_stage2-worker-1

curl -fsS https://socbadging.hausoc.org/api/health
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" -f "$COMPOSE_FILE" ps
docker inspect "$WEB" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(APP_URL|ISSUER_URL|EMAIL_DELIVERY_MODE|EMAIL_RECIPIENT_POLICY|EXTERNAL_EMAIL_ALLOWLIST|BREVO_SMTP_USER|BREVO_SENDER)='
docker inspect "$WORKER" --format '{{range .Config.Env}}{{println .}}{{end}}' \
  | grep -E '^(EMAIL_DELIVERY_MODE|EMAIL_RECIPIENT_POLICY|EXTERNAL_EMAIL_ALLOWLIST|BREVO_SMTP_USER|BREVO_SENDER|NOTIFICATION_CYCLE_TIMEOUT_MS)='
```

Required:

- web/worker healthy, notifications ready/fresh;
- both web/worker: `brevo`, `staging`, `authorized-test-recipient@example.org`;
- web/worker `BREVO_SMTP_USER=<redacted-brevo-smtp-username>`.

If the allowlist is not yet `authorized-test-recipient@example.org`, apply §2 only after approval.

## 2. Apply the reviewed Gmail allowlist override (web/worker only)

The prepared file is:

```text
deploy/production-brevo.override.yaml
SHA-256 8e314a5fda4ab1f00e02c2520a6fd2ea03d9b265062d3d8108f05308e8e3aa2c
```

Transfer it to `/var/tmp/socbadging-stage6d/production-brevo.override.yaml`, verify the checksum,
and validate the rendered config:

```sh
COMPOSE_ARGS=(-f "$COMPOSE_FILE")
for f in /opt/socbadging/deploy/staging.override.yaml /opt/socbadging/deploy/staging-healthfix.override.yaml; do
  [ -f "$f" ] && COMPOSE_ARGS+=(-f "$f")
done
COMPOSE_ARGS+=(
  -f /var/tmp/socbadging-stage6d/production-brevo.override.yaml
  -f /var/tmp/socbadging-stage6d/production-stage6b-images.override.yaml
)

docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" config --quiet
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" config --format json \
  | jq -r '["worker","web"][] as $s | "\($s): \(.services[$s].environment.EMAIL_RECIPIENT_POLICY) \(.services[$s].environment.EXTERNAL_EMAIL_ALLOWLIST)"'
```

Required output:

```text
worker: staging authorized-test-recipient@example.org
web: staging authorized-test-recipient@example.org
```

Then recreate only web and worker:

```sh
docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" \
  up -d --no-deps --no-build web worker
```

Do not restart db, signer, or run migrations. Verify health, allowlist, worker heartbeat, and queue
afterward.

## 3. Queue check before any worker/email operation

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT delivery_channel, status, COUNT(*) FROM notification_deliveries GROUP BY delivery_channel, status;
    SELECT COUNT(*) FROM notification_delivery_attempts WHERE outcome = '\''STARTED'\'';
    SELECT provider_message_id, COUNT(*) FROM notification_deliveries
      WHERE provider_message_id IS NOT NULL GROUP BY provider_message_id HAVING COUNT(*) > 1;
  "
'
```

Required before provisioning/pilot: zero PENDING/RETRY_SCHEDULED/PROCESSING, zero STARTED, no duplicate
provider IDs. If not, stop.

## 4. Provision the isolated test accounts

Use §5 of `reports/STAGE-H-TEST-ACCOUNT-PROVISIONING.md`:

- transfer `scripts/provision-stageh-test-accounts.ts` to `/var/tmp/stageh-<UTC>/`;
- run through the `seed`/tools service with `NODE_OPTIONS=--conditions=react-server`;
- credentials file is written mode 600 inside the mounted secure directory;
- no email is sent.

Expected account identities:

```text
test.admin@hausoc.org       ADMIN
test.faculty@hausoc.org     FACULTY
authorized-test-recipient@example.org       STUDENT
STAGEH-ISO-001              isolated class
```

If any identity/class already exists, stop and clean up before retrying.

## 5. Secure credential handoff

Copy the credentials file through an admin-owned temporary file; do not weaken the original:

```sh
mkdir -p "$HOME/.config/hau-soc-badging"
chmod 700 "$HOME/.config/hau-soc-badging"
ssh <approved-admin>@badging-server \
  "sudo cp '$STAGEH_DIR/stageh-credentials.json' /tmp/stageh-credentials.json && sudo chown \$(id -u):\$(id -g) /tmp/stageh-credentials.json && sudo chmod 600 /tmp/stageh-credentials.json"
scp <approved-admin>@badging-server:/tmp/stageh-credentials.json \
  "$HOME/.config/hau-soc-badging/stageh-credentials.json"
ssh <approved-admin>@badging-server 'rm -f /tmp/stageh-credentials.json'
chmod 600 "$HOME/.config/hau-soc-badging/stageh-credentials.json"
```

Do not print, screenshot, or commit credentials.

## 6. Run production-safe Playwright

```sh
STAGEH_BASE_URL=https://socbadging.hausoc.org \
STAGEH_CREDENTIALS_FILE="$HOME/.config/hau-soc-badging/stageh-credentials.json" \
npx playwright test --config=playwright.production.config.ts
```

Expected: 8 tests across desktop/mobile; public tests must pass; authenticated tests must pass only if
credentials and allowlist are valid. Do not run the local destructive global setup against production.

## 7. One test credential and public verification

Using the isolated class:

- create one `STAGEH Automated Test Badge`;
- issue exactly once to `authorized-test-recipient@example.org`/STAGEH Test Student;
- verify active status, signature, issuer `https://socbadging.hausoc.org/api/issuers/hau-soc`,
  verification key `.../keys/staging-2026-11`, JSON-LD, image/PDF downloads, QR, and status proof;
- confirm no duplicate issuance row.

Do not alter any existing credential.

## 8. One Brevo pilot

With `EMAIL_RECIPIENT_POLICY=staging` and `EXTERNAL_EMAIL_ALLOWLIST=authorized-test-recipient@example.org`:

- ensure only the one test notification is queued;
- allow the worker to process exactly one delivery;
- verify SMTP accepted, provider status/event, no duplicate, no other recipient;
- request operator confirmation of actual Gmail inbox receipt.

SMTP acceptance alone is not inbox delivery. Do not resend.

## 9. Test-only revocation and cleanup

Revoke only the isolated STAGEH test credential if approved. Then run:

```sh
docker compose --profile tools -p "$PROD_PROJECT" --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" run --rm --no-deps \
  -v "$STAGEH_DIR/cleanup-stageh-test-accounts.ts:/app/scripts/cleanup-stageh-test-accounts.ts:ro" \
  -v "$STAGEH_DIR:/secure-stageh" \
  -e NODE_OPTIONS=--conditions=react-server \
  -e STAGEH_CLEANUP_APPROVED=YES \
  -e STAGEH_CREDENTIAL_FILE=/secure-stageh/stageh-credentials.json \
  seed ./node_modules/.bin/tsx scripts/cleanup-stageh-test-accounts.ts
```

Expected: test accounts SUSPENDED, class ARCHIVED, audit preserved, no deletion. Then remove the
credentials file locally and from production.

## 10. Final verification

- health ready, issuer/key/status proof PASS;
- worker ready/fresh;
- queue empty/no duplicates;
- no real account/credential/key changed;
- no unintended email;
- report actual PASS/FAIL/BLOCKED/NOT TESTED in the Stage H final report.

## Current blocker

The prepared scripts and config are locally validated. Production execution has not occurred because
this workflow has no authorized administrative session for provisioning/allowlist changes or email
pilot. No production account, class, badge, credential, secret, key, or email was changed.
