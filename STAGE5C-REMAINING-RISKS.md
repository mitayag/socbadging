# Stage 5C Remaining Risks

**Date:** 4 November 2026  
**Stage 5C final acceptance:** **CONDITIONAL PASS**  
**Production GO/NO-GO:** **NO-GO**

Local implementation is validated. External email, DNS, webhook, suppression, and
status-list publication are not production-ready.

## 1. Blocking findings

| Risk                             | Severity | Evidence                                                                       | Required action                                                                           |
| -------------------------------- | -------- | ------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------- |
| No Brevo configuration           | High     | `.env` defaults to Mailpit; no SMTP user/password, sender domain, or allowlist | Configure approved Brevo credentials and sender domain in staging                         |
| No verified sending domain       | High     | Example `hausoc.org` shows A/NS but no visible SPF/DKIM/DMARC/MX               | Complete Brevo domain/sender approval and DNS records with approval                       |
| Recipient suppression not wired  | High     | Webhook records provider status; resend path does not check suppression        | Add durable suppression store, wire webhook, block sends/resends, test                    |
| Status-list API returns 503      | High     | `status-list-local` version 2 vs allocation versions 0/1                       | Regenerate the signed list through the approved service or correct versions with approval |
| No external delivery evidence    | High     | No real Brevo send or inbox confirmation                                       | Run the authorized controlled acceptance procedure                                        |
| Local issuer URLs                | High     | `APP_URL`/`ISSUER_URL`/`SIGNING_KEY_ID` use `http://127.0.0.1`                 | Replace through the production issuer/key plan without rewriting historical credentials   |
| Private key/media backup         | High     | DB backup excludes signer key file and Docker media volume                     | Add separate encrypted key/media backup and restore test                                  |
| No provider webhook registration | High     | Webhook secret/registration absent                                             | Register with Brevo in staging; validate signatures/events                                |

## 2. Nonblocking or deferred items

- No production key rotation performed; the runbook is documented and key-service tests pass.
- Local status-list pages work through the application verifier, but external consumers fail
  because of the 503.
- 27 malformed legacy test-artifact issuances remain quarantined (Stage 5B); no external
  exposure and no deletion.
- `docs/operations/known-limitations.md` was updated for email reset, delivery, retry, and
  bounce status handling; suppression and production DNS/sender verification remain pending.
- `docs/screenshots/` contains 58 local/E2E fixture screenshots with possible names, emails,
  and credential data. Exclude from external release or redact.
- Provider status is null for local Mailpit records; no inbox delivery claim is made.
- Combined Playwright rate-limit isolation is fixed and passed twice; keep it in CI.
- Migrations/backups: the Stage 5B restore-based rollback is validated; private key/media
  recovery still requires separate procedures.

## 3. Controlled staging GO conditions

Proceed to isolated staging email/signing validation only when:

1. An approved production-like sender domain is provided.
2. Brevo SMTP credentials and sender approval are configured.
3. SPF/DKIM/DMARC records are published and verified.
4. The allowlist contains only the authorized test recipient.
5. `CONTROLLED_ACCEPTANCE_ONLY=true` for the first run.
6. A Brevo webhook secret is registered and the endpoint is reachable over HTTPS.
7. Suppression implementation is approved and tested.
8. The status-list version/allocation issue is remediated and the endpoint returns 200.
9. Private-key and media backups are available for recovery testing.

## 4. Production GO/NO-GO

**NO-GO for production.**

Reasons: no external Brevo delivery/DNS/webhook verification, no recipient suppression,
status-list endpoint failure, local issuer URLs, missing production key execution, and no
authorized inbox evidence. No external email was sent and no DNS or key changes were made in
Stage 5C.
