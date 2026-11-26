# HAU SOC Badging — Final Production Acceptance

**Date:** 24 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production host/project:** `badging-server` / `hau_soc_badging_stage2`  
**Stage:** 6B/6D production stabilization  
**Production changes:** None  
**Live emails:** None

## 1. Executive summary

Production web, database, and signer are ready and publicly reachable. The notification worker is
exited because its Brevo SMTP username/password configuration is incomplete; notifications are
degraded and the heartbeat is stale. No health, database, signer, networking, or worker-runtime code
regression was found.

Local unit, integration, and full Playwright suites pass. Production account/Playwright acceptance,
live Brevo delivery, current backup evidence, and signing-key recovery remain blocked. The correct
recovery is a worker-only configuration deployment using the Stage 6D overrides, after queue review and
explicit approval.

**Final recommendation: NO-GO for badge issuance/live email and full production acceptance.**
**Web-only public verification may continue under monitored limited operation.**

## 2. Production environment

| Item             | Value                                                                        |
| ---------------- | ---------------------------------------------------------------------------- |
| Web container    | `hau_soc_badging_stage2-web-1`                                               |
| Worker container | `hau_soc_badging_stage2-worker-1`                                            |
| Web image        | `hau-soc-badging-web:stage6b-6d2f403-a8c209e18d5f` / `sha256:92756147...`    |
| Worker image     | `hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f` / `sha256:511a1a2f...` |
| Architecture     | `linux/amd64`                                                                |
| Public health    | HTTP 200, readiness `ready`                                                  |
| Database         | READY                                                                        |
| Signer           | READY, `staging-2026-11`, `eddsa-rdfc-2022`                                  |
| Notifications    | DEGRADED, worker heartbeat stale                                             |
| Worker           | EXITED                                                                       |

## 3. Root causes discovered

1. **Worker Brevo configuration:** the worker exits at `src/config/env.ts:181` because
   `/etc/hau-soc/secrets/brevo_smtp_password` is empty. The entrypoint exports that file as
   `BREVO_SMTP_PASSWORD`; the username is supplied by Compose/env. The exact configured username still
   needs confirmation against `<redacted-brevo-smtp-username>`.
2. **No health-code regression:** health/database/signer source is unchanged from HEAD. The Stage 6B
   web image returned healthy locally with valid DB/signer env. The inspection health URL was corrected
   from localhost to public HTTPS and the actual `192.168.3.234:3002` binding.
3. **Worker heartbeat is not a readiness condition:** it explains notifications degraded, not web 503
   or readiness failure.
4. **Operational gaps:** full production acceptance, current backup evidence, independent signing-key
   recovery, and complete restricted-SSH privilege verification remain outstanding.

## 4. Corrections implemented locally

- Added and validated `deploy/production-brevo.override.yaml`:
  - `brevo`, `staging`, `test.student@hausoc.org`, confirmed SMTP login/sender, no secrets.
- Added `deploy/production-stage6b-images.override.yaml`:
  - Stage 6B web/worker `linux/amd64` image pins.
- Hardened the public-HTML rate-limit Playwright test against fixed-window timing.
- Verified worker fail-closed behavior for missing credentials and successful startup with both
  credentials and an empty queue.
- No production source/config change was deployed.

## 5. Test execution evidence

| Suite                                | Result                             |
| ------------------------------------ | ---------------------------------- |
| Format / lint / typecheck            | PASS                               |
| Unit                                 | 117 files / **875 PASS**           |
| Integration                          | 21 files / **150 PASS**            |
| Playwright desktop + mobile          | **61 passed, 1 skipped by design** |
| Worker Brevo startup smoke           | PASS — 0 processed, no email       |
| Production Playwright/account writes | **NOT TESTED**                     |

These are local/disposable results, not production acceptance evidence.

## 6. Security findings

- Session cookie is HTTP-only, secure under HTTPS, `sameSite=lax`.
- Origin checks cover login/logout and mutating APIs; shared rate limiting is implemented.
- Security headers present; CSP and HSTS are not observed at the app/proxy and remain hardening items.
- DB/signer have no published ports; web/worker are read-only with dropped capabilities.
- Restricted SSH forced command is verified. No sudo/Docker/forwarding privilege proof was available.
- No critical code vulnerability was identified in reviewed scope.
- **High:** independent signing-key recovery is deferred.
- **Medium:** key ID `staging-2026-11` custody/naming needs classification; do not rotate automatically.

## 7. Backup and rollback

- Historical VM, MariaDB logical restore, and media backup evidence: PASS.
- Current backup timestamps/PITR and separate signing-key recovery: BLOCKED.
- The first inspection's `latest_backup=NONE_FOUND` was a directory-name assumption; the corrected
  script finds artifacts by `SHA256SUMS`/`database.sql`/`media.tar.gz` and verifies the latest set.
- Rollback images: PASS.
  - `socbadging-web:rollback-20261123` — `f80a9d4b...`
  - `socbadging-worker:rollback-20261123` — `dc083f41...`
- No migration is required; do not run `migrate`.
- Queue must be empty before worker start.

## 8. Acceptance gates

| Gate                                     | Status                                   | Notes                                                                   |
| ---------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------- |
| Production web readiness                 | **PASS**                                 | `/api/health` readiness ready                                           |
| Database readiness                       | **PASS**                                 | Health and `SELECT 1`                                                   |
| Signing readiness                        | **PASS**                                 | Signer health ready; key metadata                                       |
| Worker readiness                         | **FAIL**                                 | Exited with missing Brevo credentials                                   |
| SMTP configuration                       | **FAIL**                                 | `BREVO_SMTP_USER`/password incomplete for worker                        |
| Approved email delivery test             | **NOT TESTED**                           | Worker down; pilot not authorized                                       |
| Administrator production functionality   | **NOT TESTED**                           | No production test session                                              |
| Faculty production functionality         | **NOT TESTED**                           | No production test session                                              |
| Student production functionality         | **NOT TESTED**                           | No production test session                                              |
| Badge lifecycle production               | **NOT TESTED**                           | No production writes authorized                                         |
| Credential verification public endpoints | **PASS**                                 | Issuer/status list 200                                                  |
| RBAC/ownership isolation                 | **PASS (local)** / **NOT TESTED (prod)** | E2E/integration pass locally                                            |
| Security checks                          | **PARTIAL**                              | Headers/session/rate limits reviewed; CSP/HSTS/SSH privilege scope open |
| Automated regression                     | **PASS (local)**                         | 875 unit / 150 integration / 61 E2E                                     |
| Backup verification                      | **BLOCKED**                              | Current evidence not available                                          |
| Rollback readiness                       | **PARTIAL**                              | Images PASS; DB/key restore not verified                                |
| Audit logs                               | **NOT TESTED (prod)**                    | Local tests pass; production inspection pending                         |
| Production access restrictions           | **PARTIAL**                              | Forced command PASS; full privilege scope BLOCKED                       |

## 9. Remaining blockers

1. Apply Stage 6D Brevo override and worker image pin; start worker only after queue review and
   approval.
2. Provide current backup/restore and signing-key recovery evidence or explicit risk acceptance.
3. Complete production account/Playwright acceptance with isolated authorized accounts.
4. Confirm production worker/web image IDs, secrets, and queue via the read-only operator script.
5. Verify full restricted-SSH privilege restrictions.
6. Execute and evidence the one-recipient Brevo pilot only after separate authorization.

## 10. Final recommendation

**Full production acceptance: NO-GO.**  
**Badge issuance/live email: NO-GO.**  
**Web-only public verification: CONDITIONAL GO** under monitored limited operation, with worker
notifications still degraded.

The system is not production-ready for live student issuance/email until the worker is restored,
production acceptance is executed, backup/key recovery is evidenced, and the pilot passes.
