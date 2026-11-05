# Stage 5E.1 Test Results

**Date:** 5 November 2026  
**Environment:** Local + isolated staging; no live email or production deployment

## 1. Static gates

| Gate                        | Command                | Result            |
| --------------------------- | ---------------------- | ----------------- |
| Format                      | `npm run format`       | PASS              |
| Lint                        | `npm run lint`         | PASS — 0 warnings |
| Typecheck                   | `npm run typecheck`    | PASS              |
| Production build            | `npm run build`        | PASS              |
| Production dependency audit | `npm audit --omit=dev` | 0 vulnerabilities |

## 2. Unit tests

```text
Test Files  115 passed (115)
Tests       859 passed (859)
```

Includes recipient-policy environment tests, worker policy/substitution tests, retry/resend policy
tests, student email substitution/token tests, suppression, signing, verification, and security
regressions.

## 3. MariaDB integration tests

Fresh disposable `badging_test` database, all 21 migrations applied:

```text
Test Files  20 passed (20)
Tests       148 passed (148)
```

The suite ran twice: once before Playwright, and again **after** the full E2E run without resetting the
integration database. Both runs passed, proving fixture isolation.

Additional targeted signing/status suite:

```text
Test Files  4 passed (4)
Tests       45 passed (45)
```

## 4. Playwright desktop + mobile

Separate disposable `badging_e2e` database; E2E and integration URLs enforced different.

```text
57 passed, 1 skipped
```

Skip reason: the dashboard responsive width matrix intentionally runs once in the desktop project and
skips mobile.

Coverage includes login/RBAC, faculty and student management, password reset, notifications,
issuance, batch signing, public verification, tampering/expiration/replacement, revocation and status
bit publication, student ownership isolation, signer outage recovery, and responsive layouts.

## 5. Fixture isolation

Stage 5E.1 added:

- `E2E_DATABASE_URL` separate from `TEST_DATABASE_URL`;
- integration database-name guard (`*_test`/`*_integration`);
- E2E database-name guard (`*_e2e`);
- refusal when both URLs are identical;
- E2E rate-limit reset against the E2E database only.

Evidence: full desktop+mobile Playwright on `badging_e2e` followed by full integration on
`badging_test` with no reset in between — 148 integration tests passed.

## 6. Isolated staging smoke

Production Compose plus staging Mailpit overlay, project `hau_soc_stage5e`, host `127.0.0.1:3002`:

| Check                                         | Result                           |
| --------------------------------------------- | -------------------------------- |
| Compose validation                            | PASS                             |
| Build                                         | PASS                             |
| Migrations                                    | PASS                             |
| Signer health                                 | PASS                             |
| Seed initial Administrator                    | PASS                             |
| Bootstrap initial key/status list             | PASS                             |
| `/api/health`                                 | HTTP 200, worker heartbeat fresh |
| Public status list                            | HTTP 200                         |
| External-style status-list proof verification | PASS                             |
| Synthetic worker email                        | `SENT` via Mailpit only          |
| Mailpit message present                       | PASS                             |
| DB/media backup + checksum verification       | PASS                             |
| Production health script                      | PASS — `checks_failed=0`         |
| Staging cleanup                               | PASS                             |

## 7. Brevo readiness preflight

`scripts/brevo-readiness.ts` was added to validate production/staging configuration without sending
email.

- Default/local environment: fail-closed, exit 1, eight missing-requirement failures.
- Synthetic staging values: PASS, no email sent.
- Live Brevo acceptance was not executed because credentials, verified sender domain, webhook
  registration, and written authorization are external.

## 8. Security regression

- Role/ownership tests: PASS.
- Student credential isolation: PASS.
- Password reset/token invalidation: PASS.
- Public rate limiting: PASS.
- Suppression/retry/resend policy denial: PASS.
- Secret scan against local values: 0 matches.
- Full dependency audit: 14 dev-only advisories (4 high, 10 moderate); production audit 0.

## 9. Skipped / not executed

- Live Brevo SMTP delivery and inbox confirmation — requires authorization and external setup.
- Live Brevo webhook registration/delivery — external.
- Production DNS/SPF/DKIM/DMARC — external and prohibited in this stage.
- Production signing-key activation and HTTPS issuer validation — external.
- NPM live proxy host/certificate — NPM not installed on this host.
- CI integration/E2E automation — local runs passed; workflow update remains pending.
- One Playwright responsive matrix test skipped by design.

## 10. Result

**Stage 5E.1 regression gate: PASS.**  
No unresolved application defect was identified in the executed suites.
