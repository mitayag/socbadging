# Stage 6D Live Badge Email Pilot

**Date:** 22 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Sender:** `HAU SOC Badging System <badges@hausoc.org>`  
**Pilot status:** **NOT EXECUTED — BLOCKED pending approval and preflight**  
**Live email sent:** **None**  
**Production badges issued:** **None**

> Historical single-recipient pilot plan. Normal production now uses
> `EMAIL_RECIPIENT_POLICY=production` with an empty allowlist; see
> `docs/email/BREVO-CONFIGURATION.md`. Do not reuse the staging-policy commands below for current
> production without a new approval.

## 1. Purpose

Issue exactly one badge to one explicitly authorized test student and send exactly one official
external email through Brevo, then verify delivery, tracking, public credential, audit, and rollback
evidence.

This is not a general student email activation.

## 2. Authorization gate

Do not issue or send until all are confirmed in writing:

- [ ] Stage 6D Brevo activation completed and verified.
- [ ] Approved pilot window and named operator/observer.
- [ ] Rollback owner and incident contact.
- [ ] Recipient: `authorized-test-recipient@example.org` reconfirmed as the approved external test recipient.
- [ ] Approval for one external email to that recipient.
- [ ] Approval for one test badge in an isolated class.
- [ ] Confirmation no real student will receive the pilot email.
- [ ] Backups current; worker/web rollback images preserved.
- [ ] Queue empty; no duplicate/STARTED rows.
- [ ] Existing credential/status-list verification passed.
- [ ] No batch issuance enabled.

If any approval is missing, stop before issuance.

## 3. Required configuration

Use the staging allowlist so only the authorized pilot recipient can receive external email:

```text
EMAIL_DELIVERY_MODE=brevo
EMAIL_RECIPIENT_POLICY=staging
EXTERNAL_EMAIL_ENABLED=true
EXTERNAL_EMAIL_ALLOWLIST=authorized-test-recipient@example.org
CONTROLLED_ACCEPTANCE_ONLY=false
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=<redacted-brevo-smtp-username>
BREVO_SENDER=HAU SOC Badging System <badges@hausoc.org>
BREVO_WEBHOOK_ENABLED=true
```

Both web and worker must match. The application does not read `SMTP_USER`; use
`BREVO_SMTP_USER`. Do not use `EMAIL_RECIPIENT_POLICY=production` for the pilot.

For maximum at-most-once safety, a separately approved controlled-acceptance reservation may be
used with `CONTROLLED_ACCEPTANCE_ONLY=true`. If that path is not explicitly approved and armed, keep
it `false`; the staging allowlist still limits recipients.

## 4. Preflight

- [ ] Production web/worker render Brevo mode, port 587, exact sender, staging allowlist.
- [ ] Worker image is Stage 6B (`sha256:511a1a2f...`) with Stage 5F.4 fixes.
- [ ] Worker cycles healthy; heartbeat fresh.
- [ ] `BREVO_SMTP_USER=<redacted-brevo-smtp-username>`; password secret mounted; no password printed.
- [ ] Brevo webhook registered for `/api/webhooks/brevo`.
- [ ] Queue: 0 deliveries, 0 attempts, 0 unfinished `STARTED`, no duplicate provider IDs.
- [ ] Test student/account and isolated class/badge ready.
- [ ] No pending Mailpit rows.
- [ ] Rollback images `pre-stage6d` exist.
- [ ] Existing public credential and status list verify.

Read-only baseline:

```sh
docker compose -p hau_soc_badging_stage2 -f /opt/socbadging/compose.production.yaml exec -T db sh -lc '
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

## 5. Issue exactly one badge

Use the normal authenticated Faculty/Administrator UI:

1. Open the isolated test class.
2. Select the approved test badge.
3. Issue to `authorized-test-recipient@example.org` only.
4. Do not use batch issuance.
5. Do not issue to any real student.

Expected:

- one signed credential with a unique public ID;
- one `badge.issued` audit record;
- one `BADGE_ISSUED` outbox row;
- `delivery_channel=brevo`;
- worker claims it once;
- one SMTP submission attempt;
- no other recipient.

Before the worker sends, verify the outbox row channel and recipient are correct. If the row is
`mailpit`, stop; the web configuration is wrong and no external email will be sent.

## 6. Verify delivery and content

### 6.1 Email

Confirm with the authorized recipient/observer:

- exactly one email received;
- subject:
  `Congratulations! You Have Earned a Digital Badge — HAU School of Computing`;
- sender `HAU SOC Badging System <badges@hausoc.org>`;
- HAU/SOC identity, display name, badge title, description, issue date;
- verification link and Student Badge Portal link;
- LinkedIn/Facebook/X sharing links;
- badge artwork and support contact;
- no email address, student number, signing material, or private records in the body.

### 6.2 Public credential and sharing

- public page HTTP 200 and active status;
- cryptographic verification succeeds;
- JSON-LD/image/PDF/QR resolve;
- Open Graph/Twitter metadata is privacy-safe;
- LinkedIn certification add link appears for active credential;
- copy/share links target the canonical public URL;
- status list remains valid;
- no recipient PII is exposed.

### 6.3 Application and provider records

```sh
docker compose -p hau_soc_badging_stage2 -f /opt/socbadging/compose.production.yaml exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT id, status, delivery_channel, provider_status, attempt_count,
           smtp_accepted_at, sent_at, provider_status_at, safe_diagnostic_code
    FROM notification_deliveries ORDER BY created_at DESC LIMIT 3;
    SELECT notification_delivery_id, attempt_number, outcome,
           provider_message_id, started_at, completed_at
    FROM notification_delivery_attempts ORDER BY started_at DESC LIMIT 5;
    SELECT event_type, provider_status, occurred_at, applied
    FROM notification_delivery_events ORDER BY occurred_at DESC LIMIT 10;
  "
'
```

Do not print recipient email/message bodies in shared evidence.

## 7. Pilot pass criteria

All must be true:

- [ ] Exactly one authorized recipient received one email.
- [ ] No real student or other address received anything.
- [ ] Email sender/subject/content correct and privacy-safe.
- [ ] `delivery_channel=brevo` and one `ACCEPTED` attempt.
- [ ] Provider accepted/delivered; webhook event recorded.
- [ ] No duplicate provider message ID, duplicate attempt, or duplicate email.
- [ ] Queue drains; heartbeat fresh.
- [ ] Public credential, status list, downloads, QR, and sharing pass.
- [ ] `badge.issued` audit record present.
- [ ] No worker timeout/error/stall logs during observation.
- [ ] Rollback images/config preserved.
- [ ] Operator and observer sign the evidence.

## 8. Failure handling

If any check fails:

1. Stop and disable external email with approval.
2. Do not retry or resend automatically.
3. Preserve logs, audit, outbox, attempts, and provider events.
4. Roll back worker/web if the release is implicated.
5. Do not delete or rewrite the test credential.
6. Do not restore the database or rotate keys for an email-only failure.
7. Re-run only after correction and re-authorization.

## 9. After the pilot

- Keep `staging` allowlist until the pilot is reviewed; do not enable general delivery automatically.
- Do not revoke the test credential unless separately approved; revocation may generate another
  notification/email.
- Record the public ID, notification ID, attempt ID, provider message ID (redacted), timestamps, and
  evidence references.
- Restore the prior production configuration only under the approved change procedure.

## 10. Criteria for general student badge issuance

General activation requires a separate written decision after the pilot:

- [ ] Pilot evidence accepted.
- [ ] Brevo sender/domain/deliverability stable.
- [ ] Webhook tracking, retry, suppression, and duplicate controls verified in production.
- [ ] No duplicate/unauthorized email in the pilot or observation window.
- [ ] Queue, worker heartbeat, and logs healthy.
- [ ] Backups current; signing-key recovery risk accepted.
- [ ] Monitoring/alert ownership and support path assigned.
- [ ] Staged rollout approved: one class/cohort, then broader issuance.
- [ ] Recipient policy changed from pilot allowlist to the approved production policy.
- [ ] Bulk-email limits and suspension procedure approved.

## 11. Current decision

**Pilot prepared, not executed.**  
**Brevo sender/domain authentication: PASS.**  
**Production Brevo activation: BLOCKED** pending config/worker/image/queue/backup verification.  
**First live student badge email: BLOCKED** pending reconfirmed recipient/window and explicit
one-email authorization.

No production setting, container, database, key, badge, credential, or email was changed.
