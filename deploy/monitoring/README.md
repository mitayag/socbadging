# Production Monitoring and Alerting

Run `scripts/production-healthcheck.sh` every five minutes from cron, systemd, or the monitoring
agent. It exits non-zero if any check fails and prints one `metric=... status=...` line per check.
Do not expose its output publicly; it contains counts only, never secrets or recipient details.

## Required monitors

| Target                  | Method                                               | Alert condition                                            |
| ----------------------- | ---------------------------------------------------- | ---------------------------------------------------------- |
| Web application         | `GET https://<APP_URL>/api/health`                   | HTTP non-200, `status != ok`, or `readiness != ready`      |
| Database                | Docker health + healthcheck DB queries               | db unhealthy or DB query failure                           |
| Signing service         | `/api/health` `signer.status` and container health   | signer not ready, key ID mismatch, or cryptosuite mismatch |
| Notification worker     | `worker_health` via heartbeat                        | heartbeat missing or older than 5 minutes                  |
| Email queue failures    | `queue_failures_24h`                                 | more than `MAX_QUEUE_FAILURES` (default 10)                |
| Webhook failures        | `webhook_failures_24h`                               | more than `MAX_WEBHOOK_FAILURES` (default 25)              |
| Disk capacity           | `disk_used_percent`                                  | 85% or higher                                              |
| Backup failures         | `backup_freshness` + backup timer exit status        | no backup newer than 36 hours or backup job failed         |
| Credential verification | `credential_canary` + `status_list_version_mismatch` | canary non-200 or any revoked allocation/version mismatch  |

Set `MONITOR_CREDENTIAL_PUBLIC_ID` to a synthetic, non-personal canary credential dedicated to
monitoring. Do not use a real student credential.

## Example cron

```cron
*/5 * * * * root COMPOSE_PROJECT_NAME=hau-soc-badging-prod \
  PRODUCTION_ENV_FILE=/etc/hau-soc/production.env \
  MONITOR_CREDENTIAL_PUBLIC_ID=<synthetic-canary-public-id> \
  /opt/hau-soc/scripts/production-healthcheck.sh \
  >> /var/log/hau-soc-health.log 2>&1 || /opt/hau-soc/notify-on-call.sh
```

## Log-based alerts

Container logs are one-line JSON from the application and worker. Restrict access and rotate them
using the Compose `json-file` limits. Alert on these event names without logging payloads:

- `notification.worker.error` — worker cycle failure.
- `notification.worker.cycle` with `status=degraded` repeated.
- `signer.http.request` with `outcome=UNAUTHORIZED` or `FAILED` spikes.
- Health endpoint 503 events at the proxy.

Credential verification failures are not currently a first-class metric. Use the synthetic canary and
the status-list consistency check. If verification failures must be alerted per request, add a
privacy-safe structured counter in a reviewed application change rather than logging credential
payloads.

## Logging and privacy rules

- Never log private keys, signer tokens, SMTP passwords, webhook secrets, database URLs, session
  cookies, raw provider payloads, credential JSON, recipient emails, or student data.
- The application redacts email addresses and secret-like keys in structured logs. Preserve that
  behavior in any new log statement.
- Ship logs only to an access-controlled collector. Do not send container logs to a public endpoint.
- Keep proxy logs free of request bodies and authorization headers.

## Uptime Kuma / external monitor

If using Uptime Kuma or an external HTTP monitor:

1. Monitor `https://<APP_URL>/api/health` every 60 seconds and require HTTP 200.
2. Monitor the public status-list URL for HTTP 200 and content type `application/ld+json`.
3. Monitor the public credential canary for HTTP 200.
4. Keep the monitor off the public internet where possible; if remote, restrict its source IP at NPM.
5. Send alerts to an on-call channel with no credential or student details in the message.
