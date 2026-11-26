# Stage 6A Production Activation Runbook

**Date:** 22 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production project:** `hau_soc_badging_stage2`  
**Production worker:** `hau_soc_badging_stage2-worker-1`  
**Production deploy in Stage 6A:** Not executed  
**Live email in Stage 6A:** None

## 1. Purpose and authorization gate

This runbook activates the Stage 6A email and sharing changes and runs one controlled live badge
issuance/email pilot.

Do not proceed until there is written approval for:

- deployment of the Stage 6A web/worker changes;
- the maintenance window and deployment operator;
- the single approved test recipient and mailbox;
- one live-send operation;
- rollback ownership and monitoring owner.

No database migration is required for Stage 6A. Do not rotate/replace the signing key.

## 2. Pre-activation evidence

- [ ] Proxmox VM 130 backup current and successful.
- [ ] MariaDB logical backup checksum and isolated restore passed.
- [ ] Media backup checksum and archive integrity passed.
- [ ] Signing-key recovery risk explicitly accepted (separate encrypted key backup remains deferred).
- [ ] Production worker image contains the Stage 5F.4 timeout fix and is healthy/fresh.
- [ ] Notification queue is empty: 0 deliveries, 0 attempts, 0 unfinished STARTED.
- [ ] Approved test student/account and mailbox are named.
- [ ] Stage 6A web/worker images are built, tested, integrity-checked, and approved.
- [ ] No bulk-email or general-issuance activation is approved.

## 3. Verify production health and worker

```sh
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
WORKER=hau_soc_badging_stage2-worker-1
PROD_HEALTH_URL=http://127.0.0.1:3002/api/health

curl -fsS "$PROD_HEALTH_URL"
docker inspect "$WORKER" --format 'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} image={{.Image}}'
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" logs --since=10m --tail=100 worker
```

Pass: HTTP 200, `notifications.status=ready`, fresh heartbeat, Docker health `healthy`, recent
`notification.worker.cycle` logs.

If the worker heartbeat is stale or the image lacks the Stage 5F.4 fix, stop; do not activate email.

## 4. Verify Brevo email configuration (non-secret values only)

```sh
for c in web worker; do
  ID=$(docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps -q "$c")
  echo "== $c"
  docker inspect "$ID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^(EMAIL_DELIVERY_MODE|EMAIL_RECIPIENT_POLICY|EXTERNAL_EMAIL_ENABLED|CONTROLLED_ACCEPTANCE_ONLY|BREVO_SMTP_HOST|BREVO_SMTP_PORT|BREVO_SENDER|BREVO_WEBHOOK_ENABLED)='
  docker inspect "$ID" --format 'secrets={{json .Config.Secrets}}'
done
```

Required:

- `EMAIL_DELIVERY_MODE=brevo`;
- `EMAIL_RECIPIENT_POLICY=production` for general operation or `staging` for the pilot;
- `EXTERNAL_EMAIL_ENABLED=true`;
- `BREVO_SMTP_HOST=smtp-relay.brevo.com`, port `587`;
- approved `BREVO_SENDER`;
- webhook enabled/secret present if provider tracking is required;
- Mailpit is not the production transport.

Do not print SMTP username/password, webhook secret, database URL, signer token, or private key.

## 5. Verify sender-domain authentication

Use the actual approved sender domain. Read-only checks:

```sh
DOMAIN=<approved-sender-domain>
dig TXT "$DOMAIN" +noall +answer
dig TXT "_dmarc.$DOMAIN" +noall +answer
dig TXT "brevo1._domainkey.$DOMAIN" +noall +answer
dig TXT "brevo2._domainkey.$DOMAIN" +noall +answer
```

Confirm SPF includes Brevo, DKIM CNAME/TXT records resolve, DMARC policy/alignment is approved, and
the From address is aligned. If SPF/DKIM/DMARC is not verified, do not send the pilot.

## 6. Verify signing and recovery acceptance

- Public issuer/key/status-list endpoints return valid documents.
- Signer health matches the active production key.
- The deferred separate signing-key backup is explicitly accepted as a residual risk; VM backup is not
  treated as independent key recovery.
- Do not rotate or replace the key during the pilot.

## 7. Verify queue and duplicate baseline

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

Required before pilot: 0 deliveries, 0 attempts, 0 unfinished STARTED, no duplicate provider IDs.

## 8. Controlled pilot issuance

Use the existing issued-badge flow, not a new API.

1. Sign in as the authorized Faculty/Administrator.
2. Use the isolated test class and approved test student.
3. Create/select the approved test badge.
4. Issue exactly one badge.
5. Do not run batch issuance or bulk sends.
6. Do not resend/retry unless explicitly approved after reviewing the first result.

Expected system behavior:

- signed credential committed with unique public ID;
- audit `badge.issued` record;
- one `NotificationDelivery` outbox row for `BADGE_ISSUED`;
- worker claims/attempts the email once;
- provider status updated when webhook events arrive;
- public verification URL, QR, downloads, and share links available.

## 9. Verify pilot results

### Application/queue

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT id, status, delivery_channel, provider_status, attempt_count,
           sent_at, provider_status_at, safe_diagnostic_code
    FROM notification_deliveries ORDER BY created_at DESC LIMIT 5;
    SELECT id, notification_delivery_id, attempt_number, outcome, started_at, completed_at
    FROM notification_delivery_attempts ORDER BY started_at DESC LIMIT 10;
    SELECT id, event_type, provider_status, occurred_at, applied
    FROM notification_delivery_events ORDER BY occurred_at DESC LIMIT 10;
  "
'
```

### Public credential

- Open the public verification URL.
- Confirm active status and cryptographic verification.
- Download JSON-LD, badge image, PDF summary.
- Open/download QR.
- Check LinkedIn certification add, LinkedIn/Facebook/X share links, copy link.
- Confirm no email/student number appears publicly.
- Check Open Graph/Twitter metadata contains only safe fields.

### Email

- Confirm the authorized recipient received the email.
- Confirm subject:
  `Congratulations! You Have Earned a Digital Badge — HAU School of Computing`.
- Confirm HAU/SOC identity, display name, badge title, description, issue date, verification link,
  Student Badge Portal link, sharing links, and support contact.
- Confirm no private records or signing material.

### Audit

- Confirm `badge.issued` audit record.
- Confirm no duplicate issuance/notification rows.
- Confirm provider event/delivery status is recorded.

## 10. Stop conditions

Stop and roll back/escalate if:

- recipient receives any unexpected email;
- email is sent to an unapproved address;
- template contains private data or wrong sender;
- queue shows duplicate attempts/message IDs;
- worker heartbeat goes stale or health fails;
- public credential/status verification fails;
- provider authentication/SPF/DKIM/DMARC fails.

## 11. Rollback

- If Stage 6A code is faulty, revert web/worker to the prior approved images; do not roll back the
  database or signing key.
- If email delivery is unsafe, disable external email only with deployment approval
  (`EXTERNAL_EMAIL_ENABLED=false` / approved mode) and recreate web/worker.
- Preserve worker/provider logs and audit records.
- Do not delete the issued test credential; revoke it only if required and approved.

## 12. Post-pilot recommendation

After the pilot is verified:

1. Record recipient evidence, provider acceptance/delivery, audit IDs, and screenshots/log excerpts.
2. Review queue/duplicate/error state.
3. Prepare a separate recommendation for general student issuance and bulk email.
4. Do not enable broad sending until that recommendation is approved.

## 13. Activation status

**Runbook prepared.**  
**Production activation: BLOCKED** pending deployment authorization, production Brevo/sender
verification, recipient authorization, and the single controlled pilot.

No production deployment, email, database, signing-key, DNS/proxy, commit, or push occurred.
