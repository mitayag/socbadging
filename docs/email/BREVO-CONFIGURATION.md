# Brevo SMTP Configuration

## Default local transport

Mailpit remains the default for local development:

- `EMAIL_DELIVERY_MODE=mailpit`
- `SMTP_HOST=mailpit`
- `SMTP_PORT=1025`
- Mailpit UI: `http://127.0.0.1:8025`

No Brevo configuration is active by default. No external email was sent during this work.

## Confirmed Brevo settings

- SMTP host: `smtp-relay.brevo.com`
- SMTP port: `587`
- Encryption: STARTTLS (`secure=false`, `requireTLS=true`, `tls.rejectUnauthorized=true`)
- Sender: `HAU SOC Badging System <badges@hausoc.org>`
- SMTP username: load from the private environment file; do not commit it
- SMTP password: load from the private environment file or secrets manager; never commit or log it

Do not reuse the previously exposed SMTP key. Generate a new Brevo SMTP key before any authorized external test.

## Environment variables

Use `.env.brevo.example` as a placeholder template. It contains no real credentials.

```text
EMAIL_DELIVERY_MODE=brevo
EMAIL_RECIPIENT_POLICY=staging
EXTERNAL_EMAIL_ENABLED=true
EXTERNAL_EMAIL_ALLOWLIST=authorized-test-recipient@example.org
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=<private-brevo-smtp-username>
BREVO_SMTP_PASSWORD=<private-brevo-smtp-password>
BREVO_SENDER=HAU SOC Badging System <badges@hausoc.org>
BREVO_WEBHOOK_ENABLED=false
BREVO_WEBHOOK_SECRET=<private-webhook-secret>
```

## Safety controls

- `EXTERNAL_EMAIL_ENABLED` is `false` by default.
- Brevo mode fails closed unless the switch is `true`.
- Brevo mode requires an explicit recipient policy; it fails closed if missing or invalid.
- `EMAIL_RECIPIENT_POLICY=staging` requires a non-empty exact-recipient allowlist.
- `EMAIL_RECIPIENT_POLICY=production` allows system-authorized recipients without an allowlist; every
  delivery is still tied to an immutable issuance/student envelope and durable suppression.
- `EMAIL_RECIPIENT_POLICY=local` is Mailpit-only and is rejected with Brevo.
- Port 587 is required; STARTTLS and certificate verification are enforced.
- Old queued notifications retain `delivery_channel=mailpit` and are not claimed by the Brevo worker.
- Explicit resend refuses notifications from a different delivery channel.
- Activation/recovery emails use the same transport policy and allowlist.
- Webhook processing is disabled by default.
- `CONTROLLED_ACCEPTANCE_ONLY=true` restricts Brevo delivery to a single armed controlled notification and blocks direct student activation/recovery email.
- The controlled notification must have one `smtp_submission_attempts` row with `acceptanceKey=brevo-live-acceptance`.
- Once reserved, the attempt is permanently consumed; crashes, restarts, lease expiry, and ambiguous outcomes never trigger a second submission.
- Manual retry and resend refuse controlled notifications.

## Transport selection

- Badge-issued, badge-revoked, replacement, and resend notifications use the transactional outbox and worker.
- Student activation and recovery emails use the configured SMTP transport directly.
- The worker claims only rows matching the active delivery channel.

## Brevo webhook adapter

`src/modules/notifications/services/brevo-webhook-adapter.ts` provides:

- strict Brevo event schema,
- HMAC-SHA256 signature verification with timing-safe comparison,
- deterministic event IDs for replay protection,
- mapping to the provider-neutral bounce/complaint contract,
- idempotency and suppression callbacks.

The provider-neutral adapter is connected to the local webhook route at `POST /api/webhooks/brevo`:

- HMAC-SHA256 signature verification using `x-brevo-signature` or `x-sib-signature`;
- 64 KiB request limit and 1–50 events per batch;
- immutable normalized event history in `notification_delivery_events`;
- idempotent provider event IDs;
- stale and out-of-order event protection;
- delivered, deferred, bounced, blocked, invalid, and complaint projection;
- no inbox-receipt claim from provider delivery alone.

`BREVO_WEBHOOK_ENABLED=false` by default. For local simulation, set it to `true` with a private `BREVO_WEBHOOK_SECRET` and run `scripts/simulate-brevo-webhook.ts`. See `docs/operations/email-delivery-operations.md`.

## Controlled one-attempt safety

Migration `20261102140000_smtp_submission_attempts` adds `smtp_submission_attempts`:

- one row per controlled notification (`notification_delivery_id` unique);
- one controlled exercise (`acceptance_key` unique);
- states `NOT_STARTED`, `SUBMISSION_RESERVED`, `ACCEPTED`, `REJECTED`, `OUTCOME_UNKNOWN`;
- atomic `NOT_STARTED -> SUBMISSION_RESERVED` reservation before SMTP;
- no database transaction is held open during SMTP;
- consumed attempts are never reset by the worker, retry, or resend paths.

Arm exactly one controlled notification after creating it and before starting the Brevo worker. Use `CONTROLLED_ACCEPTANCE_ONLY=true` for the test. See `docs/email/BREVO-SMTP-ONE-ATTEMPT-SAFETY-REPORT.md` for the full state machine and test evidence.

## Exact future controlled external test steps

1. Generate a new Brevo SMTP key. Do not reuse the exposed key.
2. Create a private environment file outside the repository, mode `0600`, containing the real Brevo username/password, `EMAIL_RECIPIENT_POLICY=staging`, and a single authorized test recipient in `EXTERNAL_EMAIL_ALLOWLIST`.
3. Keep `EXTERNAL_EMAIL_ENABLED=false` until the test window is approved.
4. Rebuild and start the worker/web with Mailpit first; confirm `/api/health` and worker heartbeat.
5. For the approved test window only, set `EMAIL_DELIVERY_MODE=brevo`, `EMAIL_RECIPIENT_POLICY=staging`, `EXTERNAL_EMAIL_ENABLED=true`, and `CONTROLLED_ACCEPTANCE_ONLY=true`, then recreate `worker` and `web`.
6. Arm exactly one controlled notification for `authorized-test-recipient@example.org` before starting the worker. Do not arm a second notification.
7. Confirm the worker loads the Brevo transport without printing credentials.
8. Send only to the allowlisted recipient. Do not use a real student address.
9. Verify Brevo acceptance and the application notification status. `SENT` means SMTP accepted, not inbox delivery.
10. Disable the test by restoring `EMAIL_DELIVERY_MODE=mailpit`, `EXTERNAL_EMAIL_ENABLED=false`, and `CONTROLLED_ACCEPTANCE_ONLY=false`, then recreate `worker` and `web`.
11. Keep Brevo IP restrictions disabled until the controlled test is complete.
12. Do not activate the webhook until the provider-specific signature header and suppression storage are implemented and reviewed.

## Rollback

- Restore `EMAIL_DELIVERY_MODE=mailpit` and `EXTERNAL_EMAIL_ENABLED=false`.
- Recreate `worker` and `web`.
- Old `delivery_channel=mailpit` rows remain available to the Mailpit worker.
- `delivery_channel=brevo` rows are not claimed by the Mailpit worker.
