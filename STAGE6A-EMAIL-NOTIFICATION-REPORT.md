# Stage 6A Email Notification Report

**Date:** 22 November 2026  
**Production email sent in Stage 6A:** None  
**Local delivery transport:** Mailpit / test doubles only

## 1. Existing notification architecture reused

- Issuance commits a `NotificationDelivery` outbox row in the same transaction as the credential.
- Worker claims queue rows with leases, bounded retries, provider status tracking, suppression, and
  duplicate delivery-row protection.
- Brevo SMTP mode uses port 587 with STARTTLS and certificate verification.
- Controlled acceptance and recipient policies remain enforced.
- Revocation creates a separate outbox notification.
- Provider events update delivery status; failed deliveries remain retryable by policy.

## 2. Official HAU SOC issued-badge email

Subject:

```text
Congratulations! You Have Earned a Digital Badge — HAU School of Computing
```

The template includes:

- Holy Angel University / School of Computing identity;
- privacy-safe recipient display name (snapshot `displayName`, falling back to first name);
- badge title and achievement description from the immutable snapshot;
- issuance and optional expiry date;
- **View and Verify Badge** link to the public credential;
- **Open Student Badge Portal** link;
- LinkedIn certification add-to-profile and LinkedIn/Facebook/X sharing links;
- badge artwork when available;
- configured support contact;
- responsive inline CSS and escaped dynamic values.

The email never includes the recipient email address, student number, signing key material, private
records, or raw provider payloads.

## 3. Worker rendering change

The delivery worker now reads the immutable recipient and achievement snapshots for email content. If
the snapshots are missing/malformed, it falls back to the stored delivery fields. No schema migration is
required.

## 4. Local tests

| Test                                                  | Result                     |
| ----------------------------------------------------- | -------------------------- |
| Email template unit tests                             | PASS                       |
| HTML escaping and unsafe image rejection              | PASS                       |
| Display name/description/portal/share/support content | PASS                       |
| Worker cycle/heartbeat/timeout/retry tests            | PASS                       |
| Delivery-event/suppression integration tests          | PASS                       |
| Full unit suite                                       | 117 files / 875 tests PASS |
| Full integration suite                                | 21 files / 150 tests PASS  |

No external email was sent.

## 5. Production email path — current status

**BLOCKED / unverified.** Production health currently reports notifications ready with a fresh
heartbeat, but this does not prove:

- the deployed worker contains the Stage 6A template changes;
- the live worker/web are configured for Brevo rather than Mailpit;
- the approved sender domain SPF/DKIM/DMARC is aligned;
- Brevo SMTP and webhook secrets are present and valid;
- the actual external delivery/inbox path works.

Required read-only checks:

```sh
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml

for c in web worker; do
  ID=$(docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps -q "$c")
  echo "== $c"
  docker inspect "$ID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^(EMAIL_DELIVERY_MODE|EMAIL_RECIPIENT_POLICY|EXTERNAL_EMAIL_ENABLED|CONTROLLED_ACCEPTANCE_ONLY|BREVO_SMTP_HOST|BREVO_SMTP_PORT|BREVO_SENDER|BREVO_WEBHOOK_ENABLED)='
  docker inspect "$ID" --format '{{json .Config.Labels}}'
done

docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" logs --since=30m --tail=200 worker
curl -fsS http://127.0.0.1:3002/api/health
```

Do not print SMTP username/password, webhook secret, database URL, or signer token.

## 6. Controlled pilot requirements

Before a live send:

1. Written authorization naming one test recipient, sender, and window.
2. Confirmation the recipient is an approved test mailbox, not a real student.
3. Production worker healthy/fresh and containing the Stage 6A code.
4. Brevo mode, sender identity, DNS authentication, SMTP secret, and webhook verified.
5. Signing key operational and key-recovery risk explicitly accepted.
6. One controlled issuance only; no bulk send.
7. Verify:
   - email received by the authorized recipient;
   - subject and content;
   - verification link and Student Badge Portal link;
   - public page/download/QR/share links;
   - audit log and `notification_deliveries` status/provider event.

## 7. Duplicate/failure controls

- `NotificationDelivery` is unique per `(issuanceId,type)`.
- Resend/retry require authorization, delivery-channel match, allowlist/policy, suppression, and
  cooldown.
- Normal delivery remains at-least-once after a crash; controlled acceptance is one-shot safe.
- Suppressed recipients cannot be sent to until an audited Administrator clearance.
- Failed delivery remains visible with safe diagnostic codes; no raw provider error content is stored.

## 8. Verdict

**Local email implementation: PASS.**  
**Production external delivery: BLOCKED** until the production Brevo path and recipient authorization
are verified. No live email was sent in Stage 6A.
