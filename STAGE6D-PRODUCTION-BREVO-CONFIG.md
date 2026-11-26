# Stage 6D Production Brevo Configuration

**Date:** 22 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production host:** `badging-server`  
**Production project:** `hau_soc_badging_stage2`  
**Production worker:** `hau_soc_badging_stage2-worker-1`  
**Production sender:** `HAU SOC Badging System <badges@hausoc.org>`  
**Brevo authentication:** **PASS**  
**Production activation:** **NOT EXECUTED**  
**Live email:** **NOT SENT**

> Historical Stage 6D staging-recipient pilot record. This is not the current production email
> configuration. Current behavior is documented in `docs/email/BREVO-CONFIGURATION.md`; the current
> override uses `EMAIL_RECIPIENT_POLICY=production`, an empty allowlist, and an environment-supplied
> `BREVO_SMTP_USER`. Do not apply the pilot YAML or checksums below as current configuration.

## 1. Current confirmed state

| Item                    | Current production finding                    | Required state                                    |
| ----------------------- | --------------------------------------------- | ------------------------------------------------- |
| Worker `SMTP_HOST`      | `mailpit`                                     | Irrelevant in Brevo mode; Brevo host must be used |
| Worker `SMTP_PORT`      | `1025`                                        | Brevo SMTP `587`                                  |
| Worker `SMTP_SECURE`    | `false`                                       | `false` with STARTTLS                             |
| Worker `SMTP_FROM`      | `HAU SOC Staging <badges@example.test>`       | Not used; `BREVO_SENDER` must be official         |
| `EMAIL_DELIVERY_MODE`   | Mailpit behavior observed                     | Explicit `brevo`                                  |
| Brevo password secret   | Mounted at `/run/secrets/brevo_smtp_password` | Preserve; do not expose/replace                   |
| Brevo SMTP username     | Confirmed: `<redacted-brevo-smtp-username>`   | Must be configured as `BREVO_SMTP_USER`           |
| Sender identity         | `badges@hausoc.org` verified                  | Exact match in app config                         |
| Brevo domain/DKIM/DMARC | Authenticated/verified/configured             | Keep unchanged                                    |
| Worker image            | Stage 6B image not verified in production     | Stage 6B worker with Stage 5F.4 fixes             |

The current worker configuration is consistent with the staging Mailpit overlay
(`deploy/staging.override.yaml`). That overlay must **not** be part of the production activation command.

## 2. Exact Brevo SMTP requirements

The Brevo account requires SMTP relay authentication using the Brevo SMTP login and SMTP key. The
application code enforces the following for Brevo mode:

| Setting           | Required value                                                        | Enforcement                                                 |
| ----------------- | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| Delivery mode     | `brevo`                                                               | Explicit selection; Mailpit is the code default if omitted  |
| SMTP host         | `smtp-relay.brevo.com`                                                | `BREVO_SMTP_HOST`                                           |
| SMTP port         | `587`                                                                 | Code rejects any other Brevo port                           |
| TLS               | STARTTLS, `secure=false`, `requireTLS=true`, certificate verification | `loadEmailDeliveryConfig` and `createSmtpTransport`         |
| Auth              | SMTP username + SMTP password                                         | Requires both non-empty                                     |
| SMTP username     | `<redacted-brevo-smtp-username>`                                      | `BREVO_SMTP_USER`; non-secret login                         |
| SMTP password     | Existing mounted secret                                               | `/run/secrets/brevo_smtp_password` -> `BREVO_SMTP_PASSWORD` |
| From identity     | `HAU SOC Badging System <badges@hausoc.org>`                          | `BREVO_SENDER`                                              |
| External delivery | Enabled                                                               | `EXTERNAL_EMAIL_ENABLED=true`                               |
| Recipient policy  | `staging` for the pilot                                               | `EMAIL_RECIPIENT_POLICY`                                    |
| Pilot allowlist   | `authorized-test-recipient@example.org` only                          | `EXTERNAL_EMAIL_ALLOWLIST`                                  |
| Webhook tracking  | Enabled                                                               | `BREVO_WEBHOOK_ENABLED=true` + secret                       |
| Webhook endpoint  | `https://socbadging.hausoc.org/api/webhooks/brevo`                    | Brevo provider registration                                 |

Brevo uses a shared IP; no dedicated-IP warming or IP-pool configuration is part of this change.

### 2.1 Confirmed SMTP login and variable-name mapping

Administrator dashboard confirmation:

```text
SMTP login: <redacted-brevo-smtp-username>
SMTP key expires: 2 November 2027
```

The application **does not read `SMTP_USER`**. Source verification:

| Provided/legacy name | Brevo-mode application name         | Behavior                                         |
| -------------------- | ----------------------------------- | ------------------------------------------------ |
| `SMTP_HOST`          | `BREVO_SMTP_HOST`                   | `SMTP_HOST` is ignored in Brevo mode             |
| `SMTP_PORT`          | `BREVO_SMTP_PORT`                   | Must be `587`; code rejects other ports          |
| `SMTP_SECURE`        | none                                | Brevo transport hardcodes `secure=false`         |
| `SMTP_USER`          | **not recognized**                  | Use `BREVO_SMTP_USER`                            |
| `SMTP_USERNAME`      | `SMTP_USERNAME` (Mailpit auth only) | Not used by Brevo transport                      |
| `SMTP_FROM`          | `BREVO_SENDER`                      | `SMTP_FROM` is ignored in Brevo mode             |
| password secret      | `BREVO_SMTP_PASSWORD`               | Injected from `/run/secrets/brevo_smtp_password` |

Use the following Brevo names exactly:

```text
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SMTP_USER=<redacted-brevo-smtp-username>
BREVO_SENDER=HAU SOC Badging System <badges@hausoc.org>
```

The password is not placed in the override; it comes from the existing secret mount.

## 3. Persisted production overrides

The historical Stage 6D pilot artifacts were staged in the project working tree:

```text
<repository-root>/deploy/production-brevo.override.yaml
<repository-root>/deploy/production-stage6b-images.override.yaml
```

Historical pilot checksums (the current override is parameterized and has a different checksum):

```text
8e314a5fda4ab1f00e02c2520a6fd2ea03d9b265062d3d8108f05308e8e3aa2c  production-brevo.override.yaml
12d7ca12900e9c82884806b2b74429d447a7b68dbd61c82d1062588659f66337  production-stage6b-images.override.yaml
```

Copy them to the production host under `/var/tmp/socbadging-stage6d/` using the approved
administrative channel. They contain no password, token, signing key, or webhook secret.

Production Brevo override:

```yaml
# Stage 6D Brevo pilot override. Do not use deploy/staging.override.yaml in production.
services:
  web:
    environment:
      EMAIL_DELIVERY_MODE: brevo
      EMAIL_RECIPIENT_POLICY: staging
      EXTERNAL_EMAIL_ENABLED: "true"
      CONTROLLED_ACCEPTANCE_ONLY: "false"
      EXTERNAL_EMAIL_ALLOWLIST: authorized-test-recipient@example.org
      BREVO_SMTP_HOST: smtp-relay.brevo.com
      BREVO_SMTP_PORT: "587"
      BREVO_SMTP_USER: <redacted-brevo-smtp-username>
      BREVO_SENDER: HAU SOC Badging System <badges@hausoc.org>
      BREVO_WEBHOOK_ENABLED: "true"

  worker:
    environment:
      EMAIL_DELIVERY_MODE: brevo
      EMAIL_RECIPIENT_POLICY: staging
      EXTERNAL_EMAIL_ENABLED: "true"
      CONTROLLED_ACCEPTANCE_ONLY: "false"
      EXTERNAL_EMAIL_ALLOWLIST: authorized-test-recipient@example.org
      BREVO_SMTP_HOST: smtp-relay.brevo.com
      BREVO_SMTP_PORT: "587"
      BREVO_SMTP_USER: <redacted-brevo-smtp-username>
      BREVO_SENDER: HAU SOC Badging System <badges@hausoc.org>
      BREVO_WEBHOOK_ENABLED: "true"
```

Notes:

- `BREVO_SMTP_USER` was the confirmed SMTP login in the historical pilot override. The current
  override requires it from the deployment environment and does not embed the identifier.
- Do not put `BREVO_SMTP_PASSWORD` or `BREVO_WEBHOOK_SECRET` in this file.
- Do not use the provided `SMTP_USER` name; the application ignores it. Map it to `BREVO_SMTP_USER`.
- The existing entrypoint injects `BREVO_SMTP_PASSWORD` from the mounted secret.
- The existing `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, and `SMTP_FROM` values are ignored when
  `EMAIL_DELIVERY_MODE=brevo`. They must not be relied on for Brevo.
- Both **web and worker** need the override. The web records `delivery_channel` when it enqueues a
  notification; if web remains Mailpit, new deliveries are created as Mailpit even if the worker is
  Brevo.

Production image pin override:

```yaml
services:
  web:
    image: hau-soc-badging-web:stage6b-6d2f403-a8c209e18d5f
  worker:
    image: hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f
```

Apply order: `compose.production.yaml` first; if the staging overlays are in use, apply
`staging.override.yaml` and `staging-healthfix.override.yaml` before these two files. The new files
must be last so Brevo and the image pins win. Production should not use staging overlays.

## 4. No silent Mailpit fallback

The override explicitly sets `EMAIL_DELIVERY_MODE=brevo`. Additional safeguards:

- `EMAIL_RECIPIENT_POLICY=staging` is invalid with Mailpit, so a missing/incorrect mode fails startup
  instead of silently using Mailpit.
- Brevo mode requires a non-empty SMTP host/user/password, exactly port `587`, and external delivery
  enabled; otherwise startup throws.
- Do not include `deploy/staging.override.yaml` in the production command.
- Verify rendered non-secret values before recreating containers and runtime values after startup.

Local synthetic validation (no network/email) produced:

```json
{
  "mode": "brevo",
  "policy": "staging",
  "host": "smtp-relay.brevo.com",
  "port": 587,
  "secure": false,
  "requireTLS": true,
  "tls": { "rejectUnauthorized": true },
  "from": "HAU SOC Badging System <badges@hausoc.org>",
  "username": "<redacted-brevo-smtp-username>",
  "usernameConfigured": true,
  "passwordConfigured": true
}
```

Fail-closed checks also passed: missing mode, missing policy, external disabled, port 465, empty
staging allowlist, and missing Brevo username/password all throw instead of selecting Mailpit.

A synthetic `docker compose` merge validation using placeholder env/secrets (no real credentials)
rendered identical Brevo settings for worker and web:

```text
brevo staging true authorized-test-recipient@example.org smtp-relay.brevo.com 587
<redacted-brevo-smtp-username> HAU SOC Badging System <badges@hausoc.org> true
```

The rendered worker mounts `database_url` and `brevo_smtp_password`; web mounts `database_url`,
`signer_token`, `brevo_webhook_secret`, and `brevo_smtp_password`. This validates override structure,
merge behavior, and secret mapping only; it is not production verification.

## 5. Secret handling

- Preserve `/run/secrets/brevo_smtp_password`; do not read, print, copy, or replace its contents.
- Confirm the secret is present and mounted read-only to web and worker.
- `BREVO_SMTP_USER` is confirmed as `<redacted-brevo-smtp-username>`; do not confuse it with the
  unsupported `SMTP_USER` name.
- `BREVO_WEBHOOK_SECRET` must be present if webhook tracking is enabled; do not print it.
- Do not place credentials in Git, chat, command output, or the override file.
- The Brevo SMTP key expires **2 November 2027**; assign an owner and renewal date before that.

## 6. Worker reliability and queue safety

The proposed Stage 6B worker image includes:

- `src/modules/notifications/services/worker-runtime.ts` and `runWorkerLoop`;
- bounded worker cycle and heartbeat timeouts;
- SMTP connection/greeting/socket timeouts;
- MariaDB connect/acquire/query/socket timeouts;
- structured timeout/error/stall logs and exit code 70 on a cycle timeout, without starting an
  overlapping replacement cycle;
- official issued-badge email template from Stage 6A.

Image evidence:

```text
Tag:      hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f
Image ID: sha256:511a1a2f8afea034992f4266a423f049ec04e8fa98a28c96dbe05116b7d38379
Tar SHA:  3b37f608c21b1f77818dd51400ce05f740c07cf709e979897b49e9d1081800ed
```

Queue safety:

- Worker claims only its active `delivery_channel`.
- Switching worker to Brevo does not claim or send old Mailpit rows.
- Switching web to Brevo ensures new notifications are enqueued with `delivery_channel=brevo`.
- Queue must be empty before activation; if pending Mailpit rows exist, stop and resolve separately.
- One delivery row per `(issuance_id, type)`; unique constraint remains.
- Claim leases prevent concurrent workers from claiming the same row.
- Retries are bounded and use exponential backoff; transient SMTP failures schedule retry, permanent
  failures fail closed, and ambiguous timeouts record `OUTCOME_UNKNOWN` without automatic retry.
- Provider message ID duplicates must be checked before and after the pilot.
- Optional stricter pilot mode: `CONTROLLED_ACCEPTANCE_ONLY=true` with the approved one-shot
  reservation procedure. This is not enabled in the proposed override; use only if separately
  approved.

Focused local evidence: 7 unit files / 42 tests PASS; 5 integration files / 22 tests PASS.

## 7. Preflight verification results

| Check                              | Result                | Evidence                                                                                                         |
| ---------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Brevo domain/sender authentication | PASS                  | Administrator screenshots: authenticated, verified, DKIM, DMARC                                                  |
| Synthetic Brevo env validation     | PASS                  | Mode/policy/host/587/STARTTLS/sender/allowlist validated                                                         |
| Compose override merge             | PASS                  | Synthetic config rendered identical Brevo settings for web/worker                                                |
| Fail-closed validation             | PASS                  | Missing mode/policy, external disabled, port 465, empty allowlist, missing credentials throw                     |
| Stage 6B worker image contents     | PASS                  | `worker-runtime.ts`, `runWorkerLoop`, SMTP timeouts, email template present                                      |
| Image checksums                    | PASS                  | Worker/web tar SHA-256 re-verified                                                                               |
| Persisted Brevo override           | PASS (historical)     | Stage 6D pilot override SHA `8e314a5f...`; current override is parameterized                                     |
| Persisted image override           | PASS                  | `deploy/production-stage6b-images.override.yaml`, SHA `12d7ca12...`                                              |
| Local worker rollback candidate    | PASS                  | `hau-soc-badging-worker:stage5f4-6d2f403`, amd64, `sha256:c99297e8...`                                           |
| Local web rollback candidate       | NOT USABLE            | Local `hau-soc-badging-web:latest` is arm64/old; capture production rollback on host                             |
| Production rollback images         | PASS (admin-verified) | Worker `socbadging-worker:rollback-20261123` = `dc083f...`; web `socbadging-web:rollback-20261123` = `f80a9d...` |
| Relevant regression suite          | PASS                  | 875 unit, 150 integration, 20 relevant E2E                                                                       |
| Full Playwright suite              | NOT CLEAN             | Local dev-server timeouts; not a production-build gate                                                           |
| Current production transport       | **NOT READY**         | Current worker uses Mailpit (`SMTP_HOST=mailpit`)                                                                |
| Production health/SSH access       | PASS (restricted)     | `ssh badging-server` status reports HTTP 200; public HTTPS/DNS from this workspace remains sinkholed             |
| Current production worker image    | BLOCKED               | Stage 6B image not verified on host                                                                              |
| Production queue/duplicates        | BLOCKED               | No host DB access; must be checked pre-activation                                                                |
| `BREVO_SMTP_USER` presence         | PASS                  | Confirmed login `<redacted-brevo-smtp-username>`; map to `BREVO_SMTP_USER`                                       |
| Brevo password secret mount        | PARTIAL               | Reported mounted; must confirm before startup                                                                    |
| Brevo webhook registration         | BLOCKED               | Must confirm provider registration and secret                                                                    |
| Existing credentials/keys          | PARTIAL               | Issuer/status-list 200; no key/schema changes; specific credential check pending                                 |
| Pilot recipient/window             | BLOCKED               | Recipient candidate; no approved window                                                                          |

## 8. Production verification still required

**BLOCKED from this environment** because the restricted SSH account is status-only. An authorized
administrator must provide non-secret results from the activation runbook:

1. Rendered web/worker `EMAIL_DELIVERY_MODE=brevo`.
2. `BREVO_SMTP_HOST=smtp-relay.brevo.com`, port `587`.
3. `BREVO_SENDER` exact match.
4. `BREVO_SMTP_USER` equals `<redacted-brevo-smtp-username>` (do not print the password).
5. Password secret mounted; no value printed.
6. `BREVO_WEBHOOK_ENABLED=true` and webhook secret present; provider webhook registered.
7. Worker image ID and labels match Stage 6B.
8. Queue empty, no duplicate provider IDs, no unfinished attempts.
9. `notification_deliveries.delivery_channel=brevo` for the pilot row.
10. Existing credential/status-list verification still passes.

## 9. Remaining blockers and approvals

- [ ] Confirm the operator network’s public HTTPS/DNS path; this workspace still resolves the site to a sinkhole.
- [ ] Provide the approved administrative image-transfer path; restricted SSH is status-only.
- [ ] Approve the exact production configuration change and worker/web recreation window.
- [ ] Confirm `BREVO_SMTP_USER` is `<redacted-brevo-smtp-username>` in the approved production environment.
- [ ] Confirm the mounted SMTP password secret is valid for that username.
- [ ] Confirm Brevo webhook registration and secret.
- [ ] Deploy/verify the Stage 6B worker image; rollback images are already preserved and verified.
- [ ] Confirm no migration is required and no migrate service is run.
- [ ] Confirm production queue is empty and no duplicate/STARTED rows exist.
- [ ] Reconfirm `authorized-test-recipient@example.org` and the pilot send window.
- [ ] Obtain explicit one-email authorization.
- [ ] Execute the separate pilot procedure in `STAGE6D-LIVE-BADGE-EMAIL-PILOT.md`.

## 10. Configuration verdict

**Brevo SMTP parameters: PASS (code/config validation).**  
**Brevo domain/sender authentication: PASS (administrator screenshots).**  
**Production app/worker/web/queue verification: BLOCKED.**  
**Production activation: NOT EXECUTED.**

No production environment, container, database, key, DNS, proxy, or SSH setting was modified.
