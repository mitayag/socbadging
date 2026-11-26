# Production Change Approval Request — Worker-Only Recovery

**Date:** 24 November 2026  
**Requested change:** Restore the Brevo notification worker configuration  
**Production project:** `hau_soc_badging_stage2`  
**Production host:** `badging-server`  
**Status:** **NOT APPROVED / NOT EXECUTED**

## 1. Requested authorization

Approve one worker-only recovery. The Brevo SMTP password secret has already been restored and
reported nonempty (90 bytes, mode 600); no further secret change is requested.

Apply `/var/tmp/socbadging-stage6d/production-brevo.override.yaml` and
`/var/tmp/socbadging-stage6d/production-stage6b-images.override.yaml`, then recreate **only**
`hau_soc_badging_stage2-worker-1` with `--no-deps --no-build`.

Do not recreate web, db, signer, migrate, media-init, seed, bootstrap, or Mailpit. Do not change any
secret, database data, DNS, proxy, SSH, or signing key. Do not issue a badge or send email during
recovery.

## 2. Exact change

```sh
# Confirm the already-restored secret; do not change it.
sudo test -s /etc/hau-soc/secrets/brevo_smtp_password
sudo stat -c '%a %U:%G %s' /etc/hau-soc/secrets/brevo_smtp_password

# Worker-only recovery
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
ENV_FILE=/etc/hau-soc/production.env

COMPOSE_ARGS=(-f "$COMPOSE_FILE")
for f in /opt/socbadging/deploy/staging.override.yaml /opt/socbadging/deploy/staging-healthfix.override.yaml; do
  [ -f "$f" ] && COMPOSE_ARGS+=(-f "$f")
done
COMPOSE_ARGS+=(
  -f /var/tmp/socbadging-stage6d/production-brevo.override.yaml
  -f /var/tmp/socbadging-stage6d/production-stage6b-images.override.yaml
)

docker compose -p "$PROD_PROJECT" --env-file "$ENV_FILE" "${COMPOSE_ARGS[@]}" \
  up -d --no-deps --no-build worker
```

The reviewed script is `reports/PHASE-F-OPERATOR-RECOVERY.sh`. It refuses to run without
`STAGE6F_APPROVED=YES` and `STAGE6F_PREREQUISITES_ACK=YES`, verifies checksums/images/secret, rejects a non-empty queue, preserves current
container inspection, and starts only the worker.

## 2.1 Complete change inventory

The approved script would make only these changes:

| Change                           | Detail                                                                               |
| -------------------------------- | ------------------------------------------------------------------------------------ |
| Host record directory            | Creates `/var/tmp/socbadging-stage6f-<UTC timestamp>/`                               |
| Record files                     | Writes `worker-before.json` and `web-before.json` inspection snapshots               |
| Brevo password secret            | No change; already nonempty (90 bytes, mode 600)                                     |
| Worker container                 | Recreates **worker only** with the Stage 6B image and Brevo override                 |
| Worker runtime                   | Starts notification cycles; writes/upserts the `notification-worker` heartbeat       |
| Notification rows                | None expected; script aborts if any pending/retry/processing/STARTED/duplicate state |
| Web/db/signer/migrate            | No change                                                                            |
| Other secrets/keys/DNS/proxy/SSH | No change                                                                            |
| Email                            | None; no badge issuance is part of this change                                       |

It does not delete data, run migrations, restore a backup, rotate a key, or send email.

## 3. Queue controls

Before start, all must be zero:

- `notification_deliveries` in `PENDING`, `RETRY_SCHEDULED`, `PROCESSING`.
- `notification_delivery_attempts` in `STARTED`.
- Duplicate non-null `provider_message_id` groups.

If any are non-zero, the change is aborted. No queue row may be modified or deleted as part of this
change.

## 4. Pre-change evidence required

- [ ] Read-only operator inspection completed.
- [ ] Worker environment shows the confirmed Brevo username.
- [ ] `BREVO_SMTP_USER=<redacted-brevo-smtp-username>` in rendered worker config.
- [ ] `brevo_smtp_password` mounted and nonempty (90 bytes, mode 600).
- [ ] Stage 6B worker image/overrides checksums verified.
- [ ] Current web/worker rollback images verified.
- [ ] Current DB/media backup verified, or approval to create/verify a fresh DB/media backup in the
      same window. No restore is performed.
- [ ] Signing-key recovery evidence or explicit residual-risk acceptance.
- [ ] Maintenance window, operator, observer, and rollback owner named.
- [ ] Explicit approval for this request.

## 5. Post-change checks

- [ ] Worker status running and Docker healthy.
- [ ] `notification.worker.cycle` logs show `processed=0`.
- [ ] Heartbeat fresh; `/api/health` notifications ready.
- [ ] Worker image is Stage 6B and contains `worker-runtime.ts`/timeouts.
- [ ] Queue still empty; no duplicate provider IDs or STARTED attempts.
- [ ] Web remains ready; web was not restarted.
- [ ] No email or badge was created.
- [ ] Rollback command is ready.

## 6. Rollback

Recreate only the worker with:

```yaml
services:
  worker:
    image: socbadging-worker:rollback-20261123
```

```sh
docker compose -p hau_soc_badging_stage2 -f /opt/socbadging/compose.production.yaml \
  -f /var/tmp/socbadging-stage6f-worker-rollback.yaml \
  up -d --no-deps --no-build worker
```

Do not restore the database or rotate keys for this rollback.

## 7. Risk statement

Primary risk: starting the worker with a non-empty queue could process notifications or send an email.
The preflight query and script abort on any pending/retry/processing/STARTED/duplicate state. No new
issuance is planned during recovery. The worker is otherwise idempotent and lease-protected.

Secondary risk: if the restored credential is invalid, the worker may exit again. The secret is
already nonempty/mode 600; actual Brevo authentication is proven only by the separately approved
pilot. No email is sent until a queue exists; rollback is available.

## 8. Approval response

Required written response:

```text
I approve the Stage 6F worker-only recovery described in
reports/PHASE-F-PRODUCTION-CHANGE-APPROVAL-REQUEST.md for the window
________________, with operator ________________ and rollback owner ________________.
I confirm the current database/media backup prerequisite is satisfied or approved for creation
in this window, and the signing-key recovery residual risk is explicitly accepted.
```

Separate approval is required for production Playwright/account writes and for the one-recipient
Brevo email pilot.
