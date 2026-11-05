# Stage 5E.1 Security and Operational Review

**Date:** 5 November 2026  
**Production deployment:** No  
**Production dependency audit:** 0 vulnerabilities

## 1. Authorization and ownership

| Control                                                   | Evidence                                         | Result |
| --------------------------------------------------------- | ------------------------------------------------ | ------ |
| Server-side role checks                                   | Authorization unit tests and route/service tests | PASS   |
| Administrator-only faculty/student/settings/quota actions | Route and service tests                          | PASS   |
| Faculty class ownership scoping                           | Class/badge/roster/issuance tests                | PASS   |
| Student credential ownership isolation                    | Student portal integration and E2E tests         | PASS   |
| Non-owner Faculty denial                                  | Phase 6/7/8 E2E and integration tests            | PASS   |
| Current persisted actor revalidation                      | Retry/resend/student services and auth tests     | PASS   |

## 2. Password reset and account security

- Student activation/recovery tokens are single-use, hashed, expiring, and tied to the student and
  user.
- Direct resets invalidate sessions and outstanding tokens and force a password change.
- Recovery requests use generic public responses and rate limiting.
- Stage 5E.1 added a requirement that direct activation/recovery email must have a matching unexpired
  student token and matching student email, preventing recipient substitution or arbitrary direct
  email.
- Automated unit, integration, and E2E tests cover reset, activation, session invalidation, and
  ownership denial.

## 3. Credential verification and revocation

- Public verification fails closed for malformed/unknown IDs.
- Signed proof verification binds issuer, controller, key, and status list.
- Compromised keys are rejected; retired keys remain usable for historical verification.
- Revocation preserves history and publishes a signed status bit.
- External-style status-list verification passed with revoked index 1 and active index 2 clear.
- 27 malformed legacy records remain quarantined and are not presented as valid credentials.

## 4. Rate limiting

MariaDB-backed shared rate limits protect login, password reset, account actions, imports, exports,
media, and public credential HTML/JSON. Stage 5E.1 extended tests to ensure recipient policy denial
occurs before retry/resend mutation.

Residual: the worker itself is bounded by batch size and outbox uniqueness rather than a per-recipient
send-rate counter. Arbitrary bulk email cannot be created through a public endpoint; issuance,
retry, and resend remain authorized and rate-limited at their action boundaries.

## 5. Secret handling

- No `.env` file, private key, E2E signer file, token, or fixture storage is tracked by Git.
- Production templates contain placeholders only.
- Application logs redact email addresses and secret-like keys.
- Startup health responses expose signer key ID and cryptosuite only, not key material.
- Stage 5D production Compose uses file secrets, non-root services, read-only filesystems, dropped
  capabilities, and no public DB/signer/worker ports.
- A Stage 5E.1 scan compared local secret values against repository text files and found zero matches.

## 6. Docker and HTTPS requirements

- Production web binds to `127.0.0.1:3001` by default; internal port remains `3000`.
- MariaDB, signer, and worker have no published production ports.
- Signer/worker run as UID 1001 with `cap_drop: ALL`, read-only root filesystems, and
  `no-new-privileges`.
- NPM terminates HTTPS and overwrites forwarding headers; `TRUST_PROXY=true` is valid only when NPM
  is the sole route.
- NPM proxy host/certificate creation remains externally pending.

## 7. Monitoring and incident response

Prepared:

- `/api/health` for web/database/signer/worker readiness,
- Docker health checks,
- `scripts/production-healthcheck.sh` for queue failures, webhook failures, backlog, disk, backup
  freshness, status-list consistency, and canary verification,
- log rotation and redaction rules,
- incident/rollback runbooks in `docs/operations/production-runbook.md`,
  `docs/operations/backup-restore-runbook.md`, and the Stage 5D reports.

Residual: credential-verification failures are monitored through a synthetic canary and status-list
consistency rather than a per-request metric. Add a privacy-safe counter if per-request alerting is
required.

## 8. Dependency review

Production:

```text
npm audit --omit=dev
found 0 vulnerabilities
```

Full audit including dev tooling:

```text
14 vulnerabilities (10 moderate, 4 high)
```

The four high findings are in build/test tooling (`vite`, `js-yaml`, `brace-expansion`, `undici`) and
are not present in the production runner image. Track them for a separate tooling-upgrade change.

No production high or critical vulnerability was identified.

## 9. Security verdict

**Application security and operational readiness: PASS for release-candidate/local-staging.**  
Production sign-off remains conditional on external HTTPS/NPM activation, production key/sender/DNS
acceptance, and approved production monitoring/incident ownership.
