# Stage 5F.4 Worker Fix and Test Report

**Date:** 5 November 2026  
**Local fix:** PASS  
**Regression testing:** PASS  
**Production changes/deploy:** None

## 1. Local code changes

### 1.1 Worker cycle timeout and recovery runtime

New `src/modules/notifications/services/worker-runtime.ts`:

- wraps each `runDeliveryCycle` in `NOTIFICATION_CYCLE_TIMEOUT_MS` (default 60s);
- bounds heartbeat writes (5s) so a DB hang cannot re-block the loop;
- records a degraded heartbeat on timeout or processing error;
- logs `notification.worker.timeout`, `notification.worker.error`,
  `notification.worker.stall_exit`, `notification.worker.starting`, and
  `notification.worker.stopped`;
- exits with code 70 on the first cycle timeout without starting a replacement cycle in the same
  process, allowing the container restart policy to recover a stalled process without overlapping
  late database work or SMTP delivery;
- makes the poll sleep interruptible for graceful SIGTERM/SIGINT (250ms checks).

`src/worker.ts` now:

- uses `runWorkerLoop` instead of the unbounded inline loop;
- sets MariaDB pool timeouts: connect 10s, acquire 15s, idle 60s, query 15s, socket 30s;
- keeps heartbeat/log behavior in the runtime for testability.

### 1.2 SMTP timeout controls

`src/modules/notifications/services/smtp-client.ts` now sets:

- `connectionTimeout`: 10s default;
- `greetingTimeout`: 10s default;
- `socketTimeout`: 30s default;
- optional per-transport overrides for tests/controlled deployment.

### 1.3 Worker configuration

- `NOTIFICATION_CYCLE_TIMEOUT_MS` added to `loadWorkerConfig`, default `60000`, bounds 5s–15min.
- Added to `.env.example`, `deploy/production.env.example`, and production Compose worker environment.

### 1.4 Health-check diagnostics

`scripts/worker-healthcheck.mjs`:

- uses bounded MariaDB connect/acquire/idle/query/socket timeouts;
- loads the mounted `database_url` secret when present, falling back to the environment;
- prints safe failure diagnostics to stderr, e.g.
  `worker healthcheck failed: heartbeat_age_seconds=... mail_status=...`;
- keeps the 300-second freshness threshold and rejects excessive future clock skew;
- no recipient PII, secrets, or message content is printed.

## 2. Regression tests added/updated

| Test area                         | Coverage                                                                    |
| --------------------------------- | --------------------------------------------------------------------------- |
| Worker startup                    | `runWorkerLoop` startup/stop without cycle                                  |
| Regular heartbeat                 | successful cycle writes `ready` heartbeat                                   |
| Database interruption             | cycle rejection records degraded heartbeat/log                              |
| Heartbeat DB failure              | heartbeat write failure does not crash the loop                             |
| SMTP timeout/connection failure   | real local TCP peer accepts but never greets; rejected within timeout       |
| Closed SMTP port                  | rejected without hanging                                                    |
| Notification-processing exception | safe degraded state and structured error                                    |
| Blocked async operation           | cycle timeout, degraded heartbeat, no indefinite loop                       |
| Timeout isolation                 | first timeout exits 70 without starting a replacement cycle                 |
| Late completion                   | late resolution after timeout cannot start another cycle                    |
| Pending/in-progress safety        | claim query only takes due/expired leases                                   |
| Duplicate controls                | existing controlled one-shot tests and unique delivery constraints retained |
| Health-check failure/recovery     | health stale/missing tests plus script diagnostic smoke test                |

New test files:

- `src/modules/notifications/services/worker-runtime.test.ts`
- `src/modules/notifications/services/smtp-client.test.ts`
- `src/modules/notifications/services/smtp-timeout.integration.test.ts`

Updated:

- `src/config/env.test.ts` (cycle timeout bounds/default)
- `src/modules/notifications/services/delivery-worker.test.ts` (lease claim conditions)

## 3. Test results

| Gate                          | Result                                                       |
| ----------------------------- | ------------------------------------------------------------ |
| Format                        | PASS                                                         |
| Lint                          | PASS                                                         |
| Typecheck                     | PASS                                                         |
| Unit tests                    | **117 files / 872 tests PASS**                               |
| Integration tests             | **21 files / 150 tests PASS**                                |
| Production build              | PASS                                                         |
| Local worker smoke            | PASS — startup, 4 cycles, fresh heartbeat, graceful SIGTERM  |
| SMTP hang tests               | PASS — stalled greeting and closed port rejected             |
| Health-check diagnostic smoke | PASS — missing heartbeat printed `heartbeat_missing`, exit 1 |

Local worker smoke log:

```text
notification.worker.starting
notification.worker.cycle status=ready processed=0
notification.worker.cycle status=ready processed=0
notification.worker.cycle status=ready processed=0
notification.worker.cycle status=ready processed=0
notification.worker.stopped
```

Heartbeat after smoke: `mail_status=ready`, age `0` seconds in the disposable test database.

No external email was sent. The smoke used Mailpit/local SMTP settings only.

## 4. Unresolved issues

1. **Exact production trigger remains SUSPECTED.** Restricted SSH does not expose logs/container
   inspection; an administrator must capture them before restart.
2. **Normal delivery remains at-least-once.** A crash/restart after SMTP acceptance and before the DB
   update can duplicate a normal notification. Controlled acceptance is one-shot safe. The runbook
   requires a `PROCESSING`/`STARTED` attempt review before restart.
3. **No provider-level timeout test against Brevo.** External email is prohibited; local SMTP-hang
   tests validate the timeout mechanism.
4. **Both workers likely share the defect.** Stage 2 and staging use the same worker code; staging
   logs are not visible through this access.
5. **Production stack identity is unverified.** The public URL’s reverse-proxy target and matching
   `APP_URL`/`SIGNING_KEY_ID` must be confirmed before restarting either worker.

## 5. Fix/test verdict

- Root cause: **SUSPECTED** (blocked awaited I/O; unbounded-cycle defect confirmed in code)
- Local fix: **PASS**
- Regression testing: **PASS**
- Restart safety: **APPROVED FOR REVIEW** (not blanket approval)
- Production deployment readiness: **NOT READY**
- Overall production GO/NO-GO: **NO-GO**

No commit, push, deploy, production restart, production database change, or external email occurred.
