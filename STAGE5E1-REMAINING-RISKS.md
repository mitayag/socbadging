# Stage 5E.1 Remaining Risks

**Date:** 5 November 2026  
**Stage 5E.1 decision:** **CONDITIONAL PASS**  
**Production GO/NO-GO:** **NO-GO**

No application or integration blocker remains in the executed local/staging suites. The remaining
conditions are external activation and acceptance tasks plus controlled data/CI decisions.

## 1. External acceptance requirements

1. **Written authorization** for exactly one external Brevo test, including sender, recipient, test
   window, observer, and rollback owner.
2. **Verified Brevo sender domain** and completed sender approval.
3. **DNS authentication**: Brevo verification record, SPF include, DKIM selector(s), DMARC policy,
   and alignment between From and authenticated domain.
4. **Brevo SMTP credentials** stored outside Git and a successful `scripts/brevo-readiness.ts`
   preflight.
5. **Brevo webhook registration** over HTTPS with the production/staging secret, plus invalid
   signature, duplicate, out-of-order, bounce, complaint, and suppression tests.
6. **Controlled acceptance execution**: one armed notification, provider acceptance evidence,
   recipient inbox confirmation, public credential verification, and revocation/status-list check.
7. **Nginx Proxy Manager activation**: proxy host, certificate, HTTPS redirect, body-size/timeout
   settings, and external health/status-list checks.
8. **Production signing key activation**: fresh key, final HTTPS issuer/key URLs, signer health,
   synthetic issuance/verification/revocation, and historical verification.
9. **Production backup storage**: encrypted off-host DB/media and separate signing-key vault,
   retention, restore drill, and off-host binlog shipping decision.
10. **Monitoring/on-call ownership**: deploy the Stage 5D health script/monitors and record escalation
    contacts.

## 2. Remaining risks

| Risk                                            | Severity | Status / action                                                                                         |
| ----------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------------- |
| External Brevo delivery not executed            | High     | Execute the Stage 5E.1 acceptance plan with authorization                                               |
| DNS/SPF/DKIM/DMARC not verified                 | High     | Complete provider/DNS approval                                                                          |
| NPM/HTTPS not live-validated                    | High     | Create proxy host and validate externally                                                               |
| Production key/issuer not activated             | High     | Execute the approved key lifecycle                                                                      |
| Off-host binlog shipping not implemented        | High     | Add if a short RPO is required; otherwise document 24h RPO                                              |
| Production backup vault/storage not provisioned | High     | Provision and test restore                                                                              |
| 27 legacy records remain quarantined            | Medium   | Keep excluded; obtain owner approval before archive/removal                                             |
| Dev-only dependency advisories (14; 4 high)     | Medium   | Upgrade build/test tooling in a separate reviewed change                                                |
| CI does not run integration/E2E                 | Medium   | Add MariaDB + separate test/E2E databases to CI                                                         |
| Worker has no per-recipient send-rate counter   | Low      | Envelope, outbox uniqueness, batch limits, and action rate limits apply; add if abuse modeling requires |
| Per-request verification-failure metric absent  | Low      | Use canary/status-list checks or add a privacy-safe counter                                             |
| Web attached to `egress` on Docker Desktop      | Low      | Remove where internal-network port publishing works                                                     |
| Local screenshots may contain fixture PII       | Low      | Exclude/redact before external release                                                                  |

## 3. Production GO/NO-GO

**NO-GO for production.**

Reasons:

- external email, DNS, webhook, NPM/HTTPS, and production key activation are incomplete;
- production backup/monitoring ownership is not provisioned;
- the release candidate is not committed/tagged/published and has not passed an external acceptance
  run.

## 4. Stage 5E.1 final decision

**CONDITIONAL PASS.**

The application/integration work is complete:

- recipient policies are implemented and tested;
- Brevo readiness/acceptance is documented without fabricated results;
- signing/status-list verification passes;
- data remains non-destructive and quarantined;
- security and dependency reviews are complete for the production dependency set;
- full local regression and fixture-isolation tests pass;
- release-candidate `0.5.0-rc.1` is prepared.

The conditions are external acceptance/provisioning, not known application defects.

## 5. Stage 5E.2

**Stage 5E.2 may begin** for external acceptance and production activation preparation, but only after:

1. written authorization for the external Brevo test,
2. approved sender/DNS/NPM/HTTPS environment,
3. access to the production key/backup/monitoring provisioning process, and
4. agreement that no commit/push/deploy occurs without separate approval.

No production deployment, live email, DNS change, production key activation, destructive data
change, commit, push, or merge was performed in Stage 5E.1.
