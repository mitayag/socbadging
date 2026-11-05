# Stage 5C.1 Remaining Risks

**Date:** 4 November 2026  
**Stage 5C.1 acceptance:** **PASS locally**  
**Production GO/NO-GO:** **NO-GO**

The two Stage 5C critical defects are remediated locally. Production remains blocked by external
provider, DNS, sender, key-execution, and backup work that was outside the Stage 5C.1 restrictions.

## 1. Resolved in Stage 5C.1

| Previously blocking risk               | Status                                                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Recipient suppression not wired        | Resolved — durable model, webhook, worker, retry/resend, account email, audited clearance.                   |
| Status-list endpoint returns 503       | Resolved — regenerated signed list at version 3, allocation versions synchronized, public endpoint HTTP 200. |
| Bootstrap could desynchronize the list | Resolved — bootstrap refuses to overwrite a published list or inconsistent allocations.                      |

## 2. Remaining production risks

| Risk                                      | Severity | Evidence                                                                                                                                                | Required action                                                                        |
| ----------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| No external Brevo delivery evidence       | High     | Local Mailpit only; no external email sent                                                                                                              | Run authorized controlled acceptance against approved sender/recipient.                |
| Sender domain SPF/DKIM/DMARC not verified | High     | Stage 5C DNS report                                                                                                                                     | Complete domain/sender approval and DNS records with authorization.                    |
| Brevo webhook not registered externally   | High     | No provider secret/registration                                                                                                                         | Register HTTPS webhook in staging and validate real signatures/events.                 |
| Local issuer/key URLs                     | High     | `http://127.0.0.1`                                                                                                                                      | Execute the production HTTPS issuer/key plan without rewriting historical credentials. |
| Private key/media backup                  | High     | DB backup excludes signer key and media volume                                                                                                          | Add encrypted key/media backup and restore test.                                       |
| Production key execution pending          | High     | No rotation performed                                                                                                                                   | Follow the approved key lifecycle during production activation.                        |
| Suppression/send race window              | Low      | Worker checks before claim and before SMTP; a permanent event arriving between the final check and SMTP submission cannot recall that in-flight attempt | Accept as residual, monitor provider events, and suppress all subsequent attempts.     |
| Manual status-list repair                 | Low      | Repair script is operator-invoked and audited                                                                                                           | Restrict to approved operators and keep the bootstrap safeguard.                       |
| Disposable test DB reuse ordering         | Low      | Playwright leaves fixtures that conflict with integration tests                                                                                         | Reset/migrate the disposable test DB between E2E and integration runs in CI.           |
| Legacy quarantined issuances              | Medium   | 27 malformed legacy test-artifact issuances from Stage 5B                                                                                               | Keep quarantined; do not delete without approval.                                      |
| Internal screenshots                      | Low      | 58 files under `docs/screenshots/` may contain fixture PII                                                                                              | Exclude or redact for external release.                                                |
| Dependency advisories                     | Medium   | See `docs/operations/dependency-security.md`                                                                                                            | Track and remediate under the security baseline.                                       |

## 3. Documentation updated

- `docs/operations/email-delivery-operations.md`
- `docs/operations/recipient-suppression.md`
- `docs/operations/known-limitations.md`
- `docs/operations/database-migrations.md`
- `docs/conformance/status-list-architecture.md`
- `docs/runbooks/open-badges-key-lifecycle.md`

## 4. Controlled staging conditions

Proceed to staged external validation only when:

1. An approved sender domain and authorized test recipient exist.
2. SPF/DKIM/DMARC and Brevo sender approval are complete.
3. Brevo SMTP credentials and a registered webhook secret are configured.
4. `CONTROLLED_ACCEPTANCE_ONLY=true` for the first send.
5. The allowlist contains only the authorized test recipient.
6. Suppression is verified against a real hard bounce/complaint without contacting a real recipient.
7. The public status list is reachable over production HTTPS.
8. Private key and media backups are available for recovery testing.

## 5. Final status

**Stage 5C.1: PASS locally.**

Acceptance evidence:

- permanent bounce/complaint suppression is durable and enforced across all sending paths;
- suppression survives application restarts;
- unauthorized and repeated webhook events cannot bypass suppression;
- the public status-list endpoint returns HTTP 200;
- independent verification confirms revoked/active statuses;
- existing signed credentials remain intact;
- all relevant regression tests pass.

**Production GO/NO-GO: NO-GO** pending the external items above.

No deployment, external email, DNS change, key rotation/deletion, credential deletion, secret
exposure, commit, push, or merge was performed.
