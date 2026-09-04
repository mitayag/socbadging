# Production Operations Runbook

## Deployment

1. Configure secrets outside source control from `.env.example`; use unique database, bootstrap,
   and SMTP credentials.
2. Configure `APP_URL` with the canonical HTTPS URL. Keep `TRUST_PROXY=false` unless a trusted proxy
   overwrites `X-Forwarded-For`.
3. Create and verify a current database/media backup before deployment.
4. Build and start `db`, `migrate`, `media-init`, `web`, and `worker`; use one worker initially.
5. Confirm the migration container exits successfully with no pending migrations.
6. Verify `/api/health`, worker health, and a controlled notification through the configured SMTP
   provider.

## Health semantics

- HTTP 200 with `readiness: ready`: the web and MariaDB are available.
- HTTP 503 with `readiness: unavailable`: MariaDB is unavailable; remove the instance from service.
- `notifications.status: degraded`: SMTP delivery failed recently or the worker heartbeat is stale.
  Credential issuance remains available because notifications use an outbox.
- `notifications.status: unknown`: no worker heartbeat exists, usually because the notification
  worker is disabled or has not started.

The worker container’s health check confirms its process remains alive; `/api/health` confirms the
database-persisted worker heartbeat and mail state.

## Logs and privacy

Application operational events are one-line JSON. Search by `event`, `eventId`, `status`, and
`errorCategory`. Structured logging redacts email, SMTP/auth credentials, tokens, message content,
credential JSON, and recipient snapshots recursively. Never add raw notification payloads, complete
provider responses, database URLs, or secrets to logs. Restrict and rotate container logs.

## SMTP operation and rotation

Update `SMTP_HOST`, port/TLS mode, username/password, sender, and optional reply-to through the
deployment secret store. Restart the worker, confirm a fresh heartbeat, and send a controlled test.
Rotate credentials immediately after suspected disclosure. Issuance transactions do not wait for
SMTP; inspect the Administrator notification dashboard for retryable and terminal failures.

## Recovery

- Database outage: stop writes at the proxy, restore database service, verify migrations, inspect
  `/api/health`, then return web instances to service.
- Worker outage: keep web online, restart one worker, verify heartbeat freshness, and monitor queued
  notifications. Claim leases allow abandoned work to be retried safely.
- SMTP outage: keep web online, correct provider configuration, restart worker, and use audited
  Administrator retry controls for terminal failures.
- Media loss: restore the database and matching media archive from the same verified backup set.

Follow the separate backup/restore runbook for every drill. Record recovery point, recovery time,
row/checksum comparisons, public credential resolution, and media verification.

## Scaling and known boundaries

MariaDB coordinates outbox claims and shared rate limits across instances. Add workers cautiously
and monitor provider throughput. Current credentials are unsigned Open Badges 3.0-aligned records;
cryptographic signing, certification/conformance, and external wallet interoperability remain Phase
8 scope.
