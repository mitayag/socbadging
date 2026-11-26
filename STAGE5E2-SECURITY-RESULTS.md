# Stage 5E.2 Security Results

**Date:** 5 November 2026  
**Candidate:** `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f`  
**PR:** https://github.com/mitayag/socbadging/pull/1  
**Production changes:** None

## 1. Candidate integrity

| Check            | Result                                     |
| ---------------- | ------------------------------------------ |
| Branch           | `release/v0.5.0-rc.1`                      |
| Local HEAD       | `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f` |
| PR head          | `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f` |
| PR state         | OPEN, mergeable, not merged                |
| Push Quality run | SUCCESS                                    |
| PR Quality run   | SUCCESS                                    |
| Working tree     | Clean before Stage 5E.2 reports            |

## 2. Credential and secret handling

- No external credentials were read or used.
- A private Brevo environment file exists on the host; its contents were not read, printed, or
  transmitted.
- No production environment changes were made.
- No DNS, proxy host, certificate, or signing key was changed.
- The existing unrelated `hau-reverse-proxy` container was not modified.
- Tracked-file secret scan: **0 real secret hits**.
- High-risk token/private-key pattern scan: no real matches.
- `.env`, backups, fixture signer files, screenshots, and test artifacts remain excluded.

## 3. Dependency security

```text
npm audit --omit=dev
found 0 vulnerabilities
```

The full audit (including build/test tooling) retains dev-only advisories. Production dependencies
remain clean.

## 4. Authorization and regression security

| Control                                    | Result                      |
| ------------------------------------------ | --------------------------- |
| Role-based server authorization            | PASS (unit/integration/E2E) |
| Student credential ownership isolation     | PASS                        |
| Password reset/token invalidation          | PASS                        |
| Recipient policy and substitution denial   | PASS                        |
| Durable suppression enforcement            | PASS                        |
| Retry/resend policy enforcement            | PASS                        |
| Webhook HMAC/idempotency/order handling    | PASS (local)                |
| Status-list proof and revocation integrity | PASS                        |
| Public rate limiting                       | PASS                        |

## 5. External security acceptance

| Requirement                              | Status                                                      |
| ---------------------------------------- | ----------------------------------------------------------- |
| Real Brevo HMAC event validation         | BLOCKED — no provider registration/approval                 |
| Real DNS/SPF/DKIM/DMARC validation       | FAIL/BLOCKED — SPF does not include Brevo; no external send |
| Real HTTPS certificate/header validation | BLOCKED — no NPM route/certificate                          |
| Production key compromise/rotation drill | BLOCKED — no production key activation                      |
| Production backup/vault access control   | BLOCKED — vault not provisioned                             |
| On-call/incident ownership               | BLOCKED — no owner assigned                                 |

## 6. Findings

| Severity | Finding                                                    | Status                                        |
| -------- | ---------------------------------------------------------- | --------------------------------------------- |
| High     | SPF for the reference sender domain does not include Brevo | External DNS fix required                     |
| High     | No external Brevo delivery/inbox evidence                  | Approval required                             |
| High     | No live HTTPS/NPM validation                               | Approval required                             |
| High     | Production signing key not activated/custodied             | Approval required                             |
| High     | Production backup vault/binlog shipping not provisioned    | Operations approval required                  |
| Medium   | Dev-only dependency advisories                             | Separate tooling upgrade                      |
| Low      | QR image not independently decoded locally                 | Route/URL inspected; optional decoder tooling |
| Low      | Alert delivery ownership unassigned                        | Operations approval required                  |

## 7. Verdict

**Application security regression: PASS.**  
**External production security acceptance: BLOCKED** pending DNS/SPF correction, provider/webhook
access, HTTPS/NPM activation, production key custody, and backup/monitoring ownership.
