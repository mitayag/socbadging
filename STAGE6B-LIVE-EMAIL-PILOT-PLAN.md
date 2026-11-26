# Stage 6B Live Email Pilot Plan

**Date:** 22 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Pilot status:** **NOT EXECUTED — Brevo authentication PASS; blocked pending production config/window**  
**Live email sent in Stage 6B:** None  
**Production accounts/badges created:** None

> Historical Stage 6B pilot plan, not current production instructions. See
> `docs/email/BREVO-CONFIGURATION.md` for the current recipient policy.

## 1. Purpose

Validate one controlled, externally delivered issued-badge email to one explicitly authorized test
student, then verify the public credential, downloads, sharing, audit, and provider delivery record.

This is a single-recipient pilot, not general student email activation.

## 2. Authorization gate

Do not send until all are confirmed in writing:

- [ ] One named test student and mailbox.
- [ ] Exact approved `BREVO_SENDER` address/domain.
- [ ] Test window, operator, observer, and rollback owner.
- [ ] Approval for one real external email.
- [ ] Approval to create/use the isolated test class, badge, and test credential.
- [ ] Confirmation the recipient is a test mailbox, not a real student.
- [ ] Production DB/media/signing-key backup evidence.
- [ ] No other pending notification deliveries at pilot start.

Previously recorded approval exists for `authorized-test-recipient@example.org` as the approved external test recipient
(`PRODUCTION-TEST-ACCOUNT-PLAN.md`). Reconfirm it is still authorized for this specific pilot before
sending.

## 3. Required pilot configuration

Use staging recipient policy with an exact allowlist for one recipient. Do not use production policy
for the pilot.

```text
EMAIL_DELIVERY_MODE=brevo
EMAIL_RECIPIENT_POLICY=staging
EXTERNAL_EMAIL_ENABLED=true
EXTERNAL_EMAIL_ALLOWLIST=authorized-test-recipient@example.org
CONTROLLED_ACCEPTANCE_ONLY=false
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SENDER=<approved sender>
BREVO_WEBHOOK_ENABLED=true
```

Required transport behavior:

- port 587 with STARTTLS;
- certificate verification enabled;
- valid Brevo SMTP username/password;
- approved Brevo sender/domain;
- webhook secret registered for delivery/bounce/complaint events;
- no username, password, or webhook secret printed in logs or commands.

`CONTROLLED_ACCEPTANCE_ONLY=true` is not used for this pilot unless the separate controlled-acceptance
reservation procedure is explicitly approved; otherwise the worker fails closed with
`CONTROLLED_ACCEPTANCE_REQUIRED`.

## 4. Brevo sender-domain authentication — PASS

Administrator screenshots confirm:

- `hausoc.org`: Authenticated
- `badges@hausoc.org`: Verified
- DKIM: Verified
- DMARC: Configured
- Branded subdomain: `badges`
- Brevo sending infrastructure: Shared IP

Production sender:

```text
HAU SOC Badging System <badges@hausoc.org>
```

This satisfies the Brevo domain/sender authentication gate. `badges@hau.edu.ph` is not the production
sender and must not be used.

Public DNS still shows `hausoc.org` SPF without a Brevo include. DKIM/DMARC authentication is the
approved path; SPF alignment remains an operator deliverability observation. Do not change DNS as
part of this pilot.

Before sending, still verify the application's `BREVO_SENDER` matches the approved identity exactly.

## 5. Preflight

1. Confirm production health, worker image, and fresh heartbeat using the deployment runbook.
2. Confirm queue is empty: 0 deliveries, 0 attempts, 0 unfinished `STARTED`.
3. Confirm no duplicate provider message IDs.
4. Confirm production schema has no pending migrations and no migration is required.
5. Confirm backups are current and restorable.
6. Confirm the exact sender is approved and DNS/DKIM/DMARC alignment passes.
7. Confirm Brevo SMTP credentials, sender approval, and webhook registration.
8. Confirm the test recipient mailbox is accessible and reserved.
9. Confirm the isolated test class/badge exists and contains only the test student.
10. Confirm no batch issuance or general email is enabled.

## 6. Controlled pilot steps

### 6.1 Apply pilot email configuration

Use the approved change procedure for the production environment. Preserve the previous non-secret
configuration in the deployment record:

```sh
# Record only non-secret values.
for c in web worker; do
  ID=$(docker compose -p hau_soc_badging_stage2 -f /opt/socbadging/compose.production.yaml ps -q "$c")
  docker inspect "$ID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^(EMAIL_DELIVERY_MODE|EMAIL_RECIPIENT_POLICY|EXTERNAL_EMAIL_ENABLED|CONTROLLED_ACCEPTANCE_ONLY|EXTERNAL_EMAIL_ALLOWLIST|BREVO_SMTP_HOST|BREVO_SMTP_PORT|BREVO_SENDER|BREVO_WEBHOOK_ENABLED)='
done
```

Recreate only the worker/web required by the approved configuration change. Do not run migrations.
Confirm the worker starts with the expected non-secret values before issuing the badge.

### 6.2 Issue exactly one badge

Use the normal authenticated Faculty/Administrator UI:

1. Open the isolated test class.
2. Select the approved test badge.
3. Issue to the one approved test student only.
4. Do **not** use batch issuance.
5. Do **not** issue to any real student.

Expected:

- one signed credential with a unique public ID;
- `badge.issued` audit record;
- one `BADGE_ISSUED` notification delivery;
- worker claims the delivery once;
- one SMTP submission attempt;
- no additional recipients.

### 6.3 Verify email

Confirm with the authorized recipient/observer:

- exactly one email received;
- subject:
  `Congratulations! You Have Earned a Digital Badge — HAU School of Computing`;
- HAU/SOC identity and recipient display name;
- badge title, description, issue date;
- verification link and Student Badge Portal link;
- LinkedIn certification/share links, Facebook, X;
- badge artwork and support contact;
- no email address, student number, signing material, or private records in the body.

### 6.4 Verify public credential and sharing

Use the issued public ID:

- public page returns 200 and shows active status;
- cryptographic verification succeeds;
- JSON-LD, image, PDF, and QR downloads resolve;
- LinkedIn certification link is present;
- Open Graph/Twitter metadata is privacy-safe;
- no private student data appears in page or metadata;
- copy/share links target the official public verification URL.

### 6.5 Verify records

Read-only checks:

```sh
docker compose -p hau_soc_badging_stage2 -f /opt/socbadging/compose.production.yaml exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT id, status, delivery_channel, provider_status, attempt_count,
           smtp_accepted_at, sent_at, provider_status_at, safe_diagnostic_code
    FROM notification_deliveries ORDER BY created_at DESC LIMIT 3;
    SELECT notification_delivery_id, attempt_number, outcome, started_at, completed_at
    FROM notification_delivery_attempts ORDER BY started_at DESC LIMIT 5;
    SELECT event_type, provider_status, occurred_at, applied
    FROM notification_delivery_events ORDER BY occurred_at DESC LIMIT 10;
    SELECT action, record_type, created_at
    FROM audit_logs ORDER BY created_at DESC LIMIT 10;
  "
'
```

Do not print recipient email addresses or message bodies in shared evidence.

## 7. Pilot pass criteria

All must be true:

- [ ] Exactly one authorized recipient received exactly one email.
- [ ] No unauthorized/real student recipient received email.
- [ ] Email content is correct and privacy-safe.
- [ ] SMTP accepted; provider accepts/delivers; webhook status recorded.
- [ ] Public credential verifies; status list remains valid.
- [ ] Downloads, QR, LinkedIn/Facebook/X/copy sharing work.
- [ ] No duplicate provider message ID, duplicate delivery, or repeated attempt.
- [ ] Queue is empty after completion; worker heartbeat fresh.
- [ ] Audit and delivery records are present.
- [ ] No worker timeout/error/stall logs during the observation window.
- [ ] Rollback images/configuration remain preserved.
- [ ] Operator and observer sign the pilot evidence.

## 8. Failure handling

If any check fails:

1. Stop issuance and disable external email with approval.
2. Do not retry/resend automatically.
3. Preserve logs, audit records, delivery rows, and provider events.
4. Roll back worker/web if the release is implicated.
5. Do not delete or rewrite the issued test credential.
6. Do not restore the database or rotate the signing key for an email-only failure.
7. Re-run the pilot only after the cause is corrected and re-authorized.

## 9. Criteria for enabling general student badge issuance

General activation requires a separate written decision after the pilot passes:

- [ ] Pilot evidence accepted by the product owner/operator.
- [ ] Exact production sender and Brevo domain approval verified.
- [ ] SPF/DKIM/DMARC alignment verified and stable.
- [ ] No duplicate/unauthorized email evidence from the pilot.
- [ ] Queue, retry, suppression, and webhook behavior verified.
- [ ] Worker/web images verified and rollback images preserved.
- [ ] Backups current; signing-key recovery risk accepted.
- [ ] Monitoring/alert ownership and escalation contacts assigned.
- [ ] Support/helpdesk path for missing/wrong emails documented.
- [ ] Staged rollout approved: one class/cohort first, then broader issuance.
- [ ] Bulk-email limits and recipient policy approved.
- [ ] Incident/suspension procedure approved.

General activation remains **NO-GO** until all criteria are met and separately authorized.

## 10. Current decision

**Pilot plan prepared.**  
**Brevo domain/sender authentication: PASS** per administrator screenshots.  
**Pilot execution: BLOCKED** — production application configuration/worker transport are not yet
verified from this environment; test window, operator, backups, and explicit live-send authorization
also remain incomplete.  
**Live email: BLOCKED, not NO-GO** pending those gates.

No live email, production account, badge, DNS, key, deployment, commit, or push was performed.
