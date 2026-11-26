# Stage 5F.4 Notification Worker Root Cause Analysis

**Date:** 5 November 2026  
**Production changes:** None  
**Worker restarted:** No  
**External email:** None

## 1. Executive summary

The production worker is running as a container but has not completed a notification cycle since
12 November 2026. Docker health has failed more than 26,000 consecutive times, while the Node.js
processes remain present, CPU is 0.18%, memory is 187.8 MiB of 3.82 GiB, OOMKilled is false, and the
database/signer remain healthy.

The code has a **confirmed structural defect**: every worker cycle is awaited without any hard
timeout, the SMTP transport has no connection/greeting/socket timeout, and the heartbeat is written
only after the cycle completes. Any indefinitely blocked SMTP or database/network operation therefore
stops the loop and heartbeat forever while leaving the process alive. Health checks fail, but
`restart: unless-stopped` does not restart an unhealthy container.

The exact production operation that blocked is **suspected** (not confirmed) because the restricted
SSH account exposes only status, not worker logs or container state. The most likely trigger is a
hung SMTP submission (or a blocked DB/network call) in the single awaited cycle.

## 2. Confirmed findings

### 2.1 Worker loop has no cycle timeout

`src/worker.ts` previously did:

```text
while (!stopping) {
  try {
    const result = await runDeliveryCycle(prisma, smtp, workerConfig);
    await recordWorkerHeartbeat(...);
  } catch { ... }
  await sleep(pollInterval);
}
```

If `runDeliveryCycle` never resolves, the loop never reaches the heartbeat or the next poll. The
process remains alive with low CPU.

### 2.2 SMTP has no explicit timeouts

`src/modules/notifications/services/smtp-client.ts` previously created the transport without
`connectionTimeout`, `greetingTimeout`, or `socketTimeout`. `deliverClaimed` awaits `smtp.send(...)`.
A provider/network connection that accepts TCP but stalls during greeting/TLS/auth/data can hang
indefinitely.

### 2.3 Heartbeat depends on cycle completion

`recordWorkerHeartbeat` runs only after a cycle returns or throws. A blocked promise produces neither.
The public health endpoint uses a **300-second** stale threshold (`WORKER_STALE_AFTER_MS`).
The worker health check uses the same 300-second threshold.

### 2.4 Docker does not auto-restart unhealthy containers

Production Compose uses `restart: unless-stopped` and a Docker health check. Docker health status is
diagnostic; it does not restart an unhealthy container by itself. Therefore a stalled-but-running
worker remains `Up (unhealthy)` indefinitely.

### 2.5 Exceptions are caught, but hangs are not

The loop catches rejected promises and writes degraded heartbeats when possible. It cannot catch a
promise that never settles. This matches the observed “processes present, no cycles, no OOM, no
recent logs” pattern.

### 2.6 Staging and Stage 2 workers share the same code path

Both workers are built from the same `worker` target and `src/worker.ts` path. The additional
`hau_soc_staging-worker-1` unhealthy container is consistent with the same defect. Exact staging
logs/state are not visible through the restricted account.

### 2.7 Queue locking is lease-based, not permanent

- Claimed jobs are `PROCESSING` with a random `claimToken` and `claimExpiresAt`.
- Expired `PROCESSING` claims are eligible for re-claim.
- Pending/retry jobs are safe across restart.
- There is no permanent lock; an unexpired claim blocks only until lease expiry.
- Controlled acceptance has a durable one-shot reservation and is safe against duplicate submission.
- Normal notifications do not have an end-to-end exactly-once guarantee; see section 5.

## 3. Suspected production trigger

The exact stuck call is **SUSPECTED** because production logs/container inspection require elevated
access. Ranked causes:

1. **Hung SMTP submission** — no SMTP timeouts; a stalled provider/network socket blocks the cycle.
2. **Blocked DB query/transaction** — no worker-level query timeout; DB is currently healthy but a
   past connection/lock issue could have blocked a query.
3. **Process stopped/paused externally** — Node processes present but no cycles; less likely than a
   blocked promise.
4. **Deployment/start mismatch** — worker image/config/secret issue preventing cycle execution.
5. **Clock/time anomaly** — would affect freshness calculation but not stop cycle logs for 10 days.
6. **Health-check-only failure** — ruled out because cycle logs stopped as well.

The “last cycle 12 November, no recent cycle logs, 0.18% CPU, no OOM, processes present” pattern is
most consistent with a single awaited operation that never settled.

## 4. Operational impact

- Notification emails are not being delivered/updated.
- Heartbeat is stale; public `/api/health` shows notifications degraded (web readiness remains 200).
- Queue jobs may accumulate as PENDING/RETRY_SCHEDULED or remain PROCESSING until lease expiry.
- Provider webhook status/suppression processing is separate from the worker but delivery lifecycle
  is stalled.
- Both stage/staging workers are unhealthy; assume a shared defect until proven otherwise.
- A blind restart may resend an in-flight message if SMTP accepted it but the DB update was lost.

## 5. Restart and duplicate-delivery safety

| Job state                   | Restart behavior                   | Duplicate risk                                                                      |
| --------------------------- | ---------------------------------- | ----------------------------------------------------------------------------------- |
| PENDING / RETRY_SCHEDULED   | Re-claimed after restart           | None from restart                                                                   |
| PROCESSING, unexpired lease | Not re-claimed until lease expires | Low initially; duplicate possible after expiry                                      |
| PROCESSING, expired lease   | Re-claimed                         | At-least-once: possible duplicate if previous send succeeded but DB update was lost |
| SENT                        | Not re-claimed                     | None                                                                                |
| FAILED                      | Not re-claimed                     | None                                                                                |
| Controlled acceptance       | Durable one-shot reservation       | Prevented by design                                                                 |

Normal notification delivery is **at-least-once**, not exactly-once. A restart is safe only after
reviewing `PROCESSING` rows and interrupted `STARTED` attempts. The runbook requires that review and
separate approval before any DB cleanup or restart.

## 6. Recommended remediation

### Local fix (implemented and tested in Stage 5F.4)

1. Add a bounded worker cycle timeout (`NOTIFICATION_CYCLE_TIMEOUT_MS`, default 60s).
2. Add SMTP connection/greeting/socket timeouts.
3. Add MariaDB connect/acquire/idle/query/socket timeouts in the worker.
4. Bound heartbeat writes so a DB hang cannot re-block the loop.
5. Log structured timeout/error events and terminate on a cycle timeout (exit 70) so a container
   policy can recover a stalled worker without starting an overlapping replacement cycle.
6. Make polling interruptible for graceful SIGTERM/SIGINT.
7. Print safe heartbeat diagnostics from the Docker health check.
8. Add regression tests for normal cycles, timeouts, DB interruption, SMTP hangs, heartbeat failure,
   recovery, and lease claims.

### Production recovery (administrator only)

Use `STAGE5F4-PRODUCTION-WORKER-RECOVERY-RUNBOOK.md`. Do not restart before confirming the actual
production stack and reviewing pending/processing jobs.

## 7. Production environment identification

The public site resolves to `https://socbadging.hausoc.org`; the server has two stacks:

- `hau_soc_badging_stage2`
- `hau_soc_staging`

The affected container is named `hau_soc_badging_stage2-worker-1`; the additional unhealthy
container is `hau_soc_staging-worker-1`. The restricted SSH account does not reveal the reverse-proxy
target or container labels.

**Production stack serving the public URL: BLOCKED / MUST BE VERIFIED BY ADMINISTRATOR.** The key ID
`staging-2026-11` on the public site also requires custody review; do not infer the stack from the key
name alone.

## 8. Completion criteria

| Item                            | Result                                                                        |
| ------------------------------- | ----------------------------------------------------------------------------- |
| Root cause                      | **SUSPECTED** — blocked awaited I/O; unbounded-cycle defect confirmed in code |
| Local fix                       | **PASS**                                                                      |
| Regression testing              | **PASS**                                                                      |
| Restart safety                  | **APPROVED FOR REVIEW** — requires pre-restart queue review and approval      |
| Production deployment readiness | **NOT READY**                                                                 |
| Overall production GO/NO-GO     | **NO-GO**                                                                     |

No production container, database, account, key, email, or configuration was modified. No commit,
push, deploy, restore, or production Playwright test was performed.
