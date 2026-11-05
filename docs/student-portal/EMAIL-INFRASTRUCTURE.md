# Email Infrastructure Readiness

## Development transport

- Local development uses Mailpit through the Compose `notifications` profile.
- Web/worker SMTP defaults: `SMTP_HOST=mailpit`, `SMTP_PORT=1025`, no auth, no TLS.
- No real student email is sent during local development.
- Badge issuance notifications use the transactional outbox and separate worker.
- Student activation and recovery emails use the same configured SMTP transport from the web process.

## Production requirements

1. Configure a provider-supported SMTP endpoint with TLS and authentication.
2. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE=true`, `SMTP_USERNAME`, `SMTP_PASSWORD`, `SMTP_FROM`, and `SMTP_REPLY_TO`.
3. Publish SPF, DKIM, and DMARC records for the sending domain.
4. Use a dedicated sending subdomain where institutional policy permits.
5. Monitor provider reputation, suppression lists, and bounce/complaint events.
6. Do not use Mailpit or the example `badges@example.edu` sender in production.

## Delivery semantics

- `SENT` means the SMTP transport accepted the message. It does not confirm inbox delivery.
- `FAILED` means a permanent SMTP failure or retry exhaustion.
- `RETRY_SCHEDULED` means a transient failure with exponential backoff.
- The outbox unique constraint prevents duplicate notification rows.
- Worker claims use a lease token. Delivery is at-least-once at the SMTP boundary; a crash after SMTP acceptance but before status persistence can resend.
- Bounce/complaint webhook processing is not implemented. It remains a production blocker unless a provider integration is added.

## Operational checks

- Confirm `/api/health` reports database and signer readiness.
- Confirm the worker heartbeat is fresh.
- Verify Mailpit locally before changing provider settings.
- Never log credentials, SMTP passwords, signer tokens, or full recipient PII.
- Keep `APP_URL` and issuer URLs stable and canonical before production issuance.

## Provider-neutral bounce/complaint contract

`src/modules/notifications/services/bounce-event-contract.ts` defines a provider-neutral
`BounceComplaintEvent` schema and processing contract with:

- strict event validation,
- recipient normalization,
- event-id idempotency (`NEW` vs `DUPLICATE`),
- durable suppression callback,
- replay protection through the idempotency claim.

No provider adapter, webhook route, signature verifier, or suppression database is wired in local
development because no production email provider has been selected. A provider integration must
verify the signed webhook before invoking the contract and persist suppression durably.
