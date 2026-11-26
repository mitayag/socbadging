# Phase B — Brevo Notification Worker Recovery

**Date:** 24 November 2026  
**Production changes:** None  
**Live emails:** None  
**Secret status update:** The Brevo SMTP password secret was later restored and verified as nonempty
(90 bytes, mode 600). The worker remains stopped pending backup/queue gates and approval.

## 1. Failure signature

```text
Brevo SMTP username and password are required
/app/src/config/env.ts:181
```

Worker container is `EXITED`; public health reports notifications `degraded` and heartbeat `stale`.

## 2. Exact code path

`src/config/env.ts` in Brevo mode requires both:

```ts
if (!value.BREVO_SMTP_USER || !value.BREVO_SMTP_PASSWORD) {
  throw new Error("Brevo SMTP username and password are required");
}
```

`src/worker.ts` calls `loadEmailDeliveryConfig(process.env)` during startup, before any database or
queue work. A missing value therefore exits the worker immediately.

`deploy/docker-entrypoint-secrets.sh` only maps the password secret:

```sh
load_secret BREVO_SMTP_PASSWORD /run/secrets/brevo_smtp_password
```

`BREVO_SMTP_USER` is not a secret and is not loaded by the entrypoint. It must be supplied by Compose
or the approved production environment.

## 3. Root cause

**Confirmed root cause: the Brevo SMTP password secret is empty.**

The production inspection found:

- `/etc/hau-soc/secrets/brevo_smtp_password` is 0 bytes.
- `BREVO_SMTP_USER` is present in the worker environment (value to be confirmed exactly).
- The worker exits with `Brevo SMTP username and password are required`.

The entrypoint maps `/run/secrets/brevo_smtp_password` to `BREVO_SMTP_PASSWORD`; an empty file
therefore makes the required password empty and the worker exits before queue processing. This is a
credential/configuration failure, not a code, database, signer, or network failure.

The expected username is:

```text
BREVO_SMTP_USER=<redacted-brevo-smtp-username>
```

The operator script must confirm the exact value without printing it. If it differs, stop.

**Non-root cause:** `BREVO_SMTP_USER` may also be absent from the worker env. The combined message
cannot distinguish the two; the inspection script now checks both.

**This is not a database, signer, networking, queue, or worker-runtime code failure.** The worker exits
before opening the queue.

## 4. Local reproduction and correction evidence

| Test                                                         | Result                                      |
| ------------------------------------------------------------ | ------------------------------------------- |
| `loadEmailDeliveryConfig` with Brevo user but no password    | Rejected                                    |
| `loadEmailDeliveryConfig` with Brevo password but no user    | Rejected                                    |
| Worker image with both `BREVO_SMTP_USER` and a test password | PASS — started, cycles `ready`, processed 0 |
| Worker image with missing credential                         | Exits during startup before queue handling  |
| Worker unit tests (`env`, runtime, delivery worker)          | 3 files / 38 tests PASS                     |
| Worker queue at smoke start                                  | 0 pending rows                              |
| External email                                               | None                                        |

The smoke test used a synthetic password, a local disposable test DB, and no queue rows. It did not
connect to Brevo or send email.

## 5. Required production correction

No source change is required. The correction is configuration and secret restoration:

1. Review the production notification queue (must be empty/no `STARTED`/no duplicates).
2. Install the **approved** Brevo SMTP key into
   `/etc/hau-soc/secrets/brevo_smtp_password` using the operator-only script/runbook, with mode `0600`,
   root ownership, and no output of the value.
3. Confirm the secret is nonempty (size > 0) without printing it.
4. Confirm `BREVO_SMTP_USER=<redacted-brevo-smtp-username>` in the worker environment.
5. Apply the approved Stage 6D overrides:
   - `deploy/production-brevo.override.yaml`
   - `deploy/production-stage6b-images.override.yaml`
6. Recreate **worker only** with `--no-deps`; do not restart web, db, signer, or migrate.
7. Verify worker startup, `notification.worker.cycle`, heartbeat freshness, `processed=0`, and image ID.
8. Do not issue a badge or send email until the separate pilot is authorized.

The web is already ready; it does not need to be restarted for worker recovery.

### 5.1 Secret restore procedure

The approved key must come from the Brevo account/password manager. Do not generate a fake key or
reuse an unrelated credential. The operator-only script is `reports/PHASE-B-INSTALL-BREVO-SECRET.sh`.
It requires explicit approval and prompts for the key without echo; it writes atomically with mode
`0600`, refuses to overwrite a nonempty secret unless explicitly approved, and validates nonempty
size without printing the value.

```text
sudo STAGE6F_SECRET_APPROVED=YES bash reports/PHASE-B-INSTALL-BREVO-SECRET.sh
```

After installation, `sudo test -s /etc/hau-soc/secrets/brevo_smtp_password` must succeed. Do not start
the worker in the same step. The secret is read by the entrypoint only when the worker starts.

Actual Brevo SMTP authentication is validated by the separately authorized pilot; the worker
configuration validation only checks presence, host, port, and TLS settings.

## 6. Why not hardcode or weaken validation

Hardcoding the username/password or weakening the validation would violate production security and
make failures silent. The correct fix is the approved Compose override plus the existing secret.

## 7. Remaining blockers

- Production queue inspection has not been performed (requires operator access).
- Production worker environment and secret mount must be inspected.
- Worker startup must not occur until the queue is confirmed safe.
- Backup evidence and explicit worker-start authorization are still required.
- No production email delivery has been tested.

Use `reports/PHASE-A-OPERATOR-INSPECTION.sh` for the read-only evidence needed before applying the
correction.
