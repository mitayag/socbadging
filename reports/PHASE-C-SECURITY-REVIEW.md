# Phase C — Production Security and Configuration Review

**Date:** 24 November 2026  
**Scope:** reviewed source, production Compose, public HTTPS behavior, and restricted SSH access  
**Production changes:** None

## 1. Findings

| Severity | Finding                                                                  | Evidence                                       | Impact                                                                                           | Recommendation                                                                                                                      |
| -------- | ------------------------------------------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| High     | Separate encrypted signing-key recovery is deferred                      | Prior acceptance records                       | Key loss/corruption could impair signing and recovery; VM backup is not independent key recovery | Complete an encrypted key backup with fingerprint-restore evidence before broad issuance                                            |
| Medium   | Production signer key ID uses the name `staging-2026-11`                 | Public signer metadata and health              | Naming/custody ambiguity; public key is active and verifies                                      | Classify provenance/custody; document as naming-only or rotate through an approved lifecycle. Do not rename or rotate automatically |
| Medium   | Current production backup/PITR evidence not available from this workflow | Restricted access; historical evidence only    | RPO/RTO and restore readiness are not freshly proven                                             | Obtain current DB/media/key backup checksums, restore-drill evidence, and off-host binlog status                                    |
| Medium   | Notification worker unavailable                                          | Worker exit and public health degraded/stale   | Queued notifications cannot be processed; readiness is impacted operationally                    | Fix the Stage 6D Brevo username/password configuration, inspect queue, then start worker under approval                             |
| Medium   | Restricted SSH privilege scope not fully verifiable                      | Forced command returned only the status banner | Cannot independently prove no sudo/Docker/forwarding from this account                           | Administrator should verify `sshd -T`/account metadata with the read-only operator script                                           |
| Low      | No Content-Security-Policy response header observed                      | Public HTTPS headers                           | Reduced defense-in-depth against injected content                                                | Add a tested CSP after reviewing Next.js asset needs                                                                                |
| Low      | No `Strict-Transport-Security` header observed at the app                | Public HTTPS headers                           | HSTS may be supplied by the proxy but is not visible in the app response                         | Confirm NPM/proxy HSTS policy; do not change in this stage                                                                          |
| Low      | Login page is cacheable (`Cache-Control: s-maxage=31536000`)             | Public header                                  | Static login shell only; no session data observed                                                | Confirm proxy/CDN caching policy; ensure authenticated responses remain no-store                                                    |

## 2. Controls reviewed and passing

- Session cookie: `httpOnly`, `secure` when `APP_URL` is HTTPS, `sameSite=lax`; opaque 256-bit token
  stored hashed in DB with 8-hour expiry.
- Login/logout and mutating API routes enforce trusted-origin checks.
- Shared DB-backed rate limiting covers login, reset, public credential pages, media, imports,
  exports, and batch routes.
- Public credential pages use `no-referrer`, `nosniff`, and rate limiting.
- Security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, restricted
  `Referrer-Policy`, restrictive `Permissions-Policy`.
- RBAC and student ownership isolation have local unit/integration/E2E coverage.
- Audit records are implemented for sensitive admin/faculty/issuance/revocation/import/settings
  actions; audit UI tests pass.
- Password reset paths use rate limits, single-use tokens, and audit records.
- Production DB and signer have no published host ports; they are on the internal network.
- Web/worker run read-only with dropped capabilities and `no-new-privileges`; worker runs as
  `1001:1001`; web image runs as `nextjs`.
- No secrets were found in tracked YAML or the reports; secrets remain mounted files.
- The restricted SSH account is a forced diagnostic command. Attempting `id` did not execute the
  command and returned only the status banner.

## 3. Signing key review

- Active public key: `staging-2026-11`.
- Cryptosuite: `eddsa-rdfc-2022`.
- Public issuer/key/status-list endpoints return HTTP 200.
- No key rotation, rename, deletion, or replacement was performed.
- The key ID name is a **naming/custody risk**, not evidence of compromise.
- Independent key recovery evidence remains outstanding.

## 4. Blocked security checks

- Direct production secret file ownership/mode and runtime-user readability.
- Sudo/Docker/forwarding policy for `socbadging-test`.
- Current backup encryption, retention, and off-host PITR evidence.
- Production RBAC/session/audit acceptance with dedicated test accounts.

Use `reports/PHASE-A-OPERATOR-INSPECTION.sh` for the read-only production evidence.

## 5. Verdict

No critical code vulnerability was identified in the reviewed scope. The material risks are
operational/recovery: worker availability, signing-key recovery, backup/PITR evidence, and incomplete
restricted-account verification. These are not resolved by code changes alone.
