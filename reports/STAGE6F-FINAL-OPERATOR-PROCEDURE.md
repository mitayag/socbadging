# Stage 6F Final Operator Procedure

**Date:** 24 November 2026  
**Production:** `badging-server` / `hau_soc_badging_stage2`  
**Status:** Preparation complete; no production change executed

## 1. Immediate safe actions

These are read-only or evidence-gathering and do not start services or change data:

1. Transfer and run the read-only inspection:
   `reports/PHASE-A-OPERATOR-INSPECTION.sh`
2. Review worker logs and the restored password secret metadata (nonempty, 90 bytes, mode 600).
3. Confirm the exact `BREVO_SMTP_USER` value without printing it.
4. Discover and verify the November 22 database/media backup with
   `/opt/socbadging/scripts/verify-backup.sh` (read-only).
5. Confirm rollback image IDs.
6. Review the notification queue with the SELECT-only queries in the inspection script.

Exact inspection command:

```sh
scp reports/PHASE-A-OPERATOR-INSPECTION.sh <approved-admin>@badging-server:/tmp/
ssh -t <approved-admin>@badging-server \
  'sudo sh /tmp/PHASE-A-OPERATOR-INSPECTION.sh 2>&1 | sudo tee /var/tmp/socbadging-phase-a-$(date -u +%Y%m%dT%H%M%SZ).log'
```

Expected key findings:

- `brevo_smtp_password=nonempty`, size 90, mode 600.
- `worker BREVO_SMTP_USER=confirmed` if the configured value matches
  `<redacted-brevo-smtp-username>`; otherwise stop.
- Web health 200 via public HTTPS or `http://192.168.3.234:3002/api/health`.
- Queue query: zero PENDING/RETRY_SCHEDULED/PROCESSING, zero STARTED, zero duplicate provider IDs.
- `latest_backup` derived from `SHA256SUMS`, not directory-name guessing.

## 2. Actions requiring production approval

Do not perform these until the written approval in
`reports/PHASE-F-PRODUCTION-CHANGE-APPROVAL-REQUEST.md` is supplied.

1. Recreate worker only with the Stage 6D Brevo override and Stage 6B image pin.
2. Run production test-account/Playwright acceptance.
3. Send the one approved pilot email.

## 3. Confirm the restored Brevo secret

The secret is already restored and reported nonempty (90 bytes, mode 600). Do not reinstall or
replace it. Verify metadata only:

```sh
ssh <approved-admin>@badging-server \
  'sudo test -s /etc/hau-soc/secrets/brevo_smtp_password && echo secret-nonempty && sudo stat -c "%a %U:%G %s" /etc/hau-soc/secrets/brevo_smtp_password'
```

Expected: `secret-nonempty`, mode `600`, owner `root:root`, size 90.

## 4. Queue verification

```sh
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
ENV_FILE=/etc/hau-soc/production.env

docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT delivery_channel, status, COUNT(*) FROM notification_deliveries GROUP BY delivery_channel, status;
    SELECT COUNT(*) FROM notification_delivery_attempts WHERE outcome = '\''STARTED'\'';
    SELECT provider_message_id, COUNT(*) FROM notification_deliveries
      WHERE provider_message_id IS NOT NULL
      GROUP BY provider_message_id HAVING COUNT(*) > 1;
  "
'
```

Expected: zero rows in PENDING/RETRY_SCHEDULED/PROCESSING, zero STARTED, no duplicate provider IDs.
If not, stop; do not start the worker.

## 5. Worker-only recovery

After approval and secret installation:

```sh
scp reports/PHASE-F-OPERATOR-RECOVERY.sh <approved-admin>@badging-server:/tmp/
ssh -t <approved-admin>@badging-server \
  'sudo STAGE6F_APPROVED=YES STAGE6F_PREREQUISITES_ACK=YES bash /tmp/PHASE-F-OPERATOR-RECOVERY.sh'
```

The script:

- requires approval;
- verifies override/image checksums;
- rejects a nonempty/unsafe queue;
- preserves current container inspection;
- starts **only** the worker with `--no-deps --no-build`;
- does not restart web/db/signer/mailpit/migrate;
- writes the worker heartbeat;
- does not issue a badge or email.

## 6. Expected post-recovery results

- Worker running and Docker healthy.
- Logs show `notification.worker.cycle` with `processed=0`.
- `/api/health` notifications `ready`, heartbeat fresh.
- Queue remains empty; no duplicate/STARTED rows.
- Web remains ready and unchanged.
- No email sent.

If the worker exits, do not resend/retry; preserve logs.

## 7. Rollback

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

Do not restore the database or rotate keys for this rollback. The web is not changed.

## 8. Backup readiness

Perform these only under the approved maintenance/change window:

- Run current DB/media backup with `/opt/socbadging/scripts/backup.sh`.
- Verify with `/opt/socbadging/scripts/verify-backup.sh`.
- Store the backup set in an encrypted/access-controlled vault; the DB dump is plaintext.
- Back up the signing key separately with `/opt/socbadging/scripts/backup-signing-key.sh`.
- Do not expose the key/passphrase.
- Independent signing-key recovery remains **BLOCKED** until a protected passphrase/custody path is
  supplied and a disposable decrypt/fingerprint check passes.

## 9. Required approval text

```text
I approve the Stage 6F worker-only recovery described in
reports/PHASE-F-PRODUCTION-CHANGE-APPROVAL-REQUEST.md for the window
________________, with operator ________________ and rollback owner ________________.
I confirm the current database/media backup prerequisite is satisfied or approved for creation
in this window, and the signing-key recovery residual risk is explicitly accepted.
```

## 10. Remaining acceptance gates

- Approved worker recovery and fresh heartbeat.
- Brevo SMTP authentication and one approved pilot email to `authorized-test-recipient@example.org`.
- Production test-account/Playwright acceptance using isolated accounts.
- Current backup/restore and signing-key recovery evidence.
- Complete restricted-SSH privilege verification.
- Final sign-off with no unauthorized email or real-student impact.

No production service was started/restarted, no secret was changed, no database row was modified,
and no email was sent in preparing this procedure.
