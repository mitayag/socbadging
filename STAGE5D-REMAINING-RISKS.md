# Stage 5D Remaining Risks

**Date:** 5 November 2026  
**Stage 5D acceptance:** **CONDITIONAL PASS**  
**Production GO/NO-GO:** **NO-GO**

The production configuration is prepared and passed an isolated staging rehearsal. Production
activation still requires external DNS/TLS/provider work and an approved decision on the
exact-recipient email allowlist.

## 1. Blocking risks

| Risk                                                 | Severity | Evidence                                                                                 | Required action                                                           |
| ---------------------------------------------------- | -------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Exact-recipient allowlist blocks broad Brevo sending | High     | Config requires non-empty `EXTERNAL_EMAIL_ALLOWLIST`; worker rejects unlisted recipients | Approve and implement a production recipient policy before normal sending |
| NPM not installed/validated                          | High     | No NPM container detected; no proxy host created                                         | Create proxy host/certificate in an approved window and run the checklist |
| Production key/issuer not activated                  | High     | Only local/disposable keys used                                                          | Execute the approved production key/issuer runbook                        |
| Brevo DNS/sender/webhook external validation         | High     | No live provider/DNS changes allowed                                                     | Complete sender-domain approval, SPF/DKIM/DMARC, webhook registration     |
| Private-key/media backup destination not provisioned | High     | Scripts prepared; production vault/storage not created                                   | Provision encrypted off-host backup storage and test restore              |
| Off-host binlog shipping not implemented             | High     | Binlogs retained on the same VM only                                                     | Add shipping/archival before claiming short RPO                           |
| Existing local issuer URLs                           | High     | Development uses `http://127.0.0.1`                                                      | Replace with final HTTPS values before issuing production credentials     |

## 2. Non-blocking or operational risks

| Risk                                     | Severity | Mitigation                                                                           |
| ---------------------------------------- | -------- | ------------------------------------------------------------------------------------ |
| Web attached to `egress` bridge          | Medium   | Remove on platforms that publish internal-only ports; otherwise restrict host egress |
| MariaDB keeps default capabilities       | Medium   | Internal network only, `no-new-privileges`; trial reduced capabilities               |
| Secrets bridged into process environment | Medium   | Non-root/read-only containers, restricted host access, rotation on exposure          |
| `log-bin-trust-function-creators=1`      | Medium   | Scoped application DB user; review before changing binlog settings                   |
| Local `json-file` logs only              | Low      | Ship to access-controlled collector and alert on security events                     |
| Dev-only dependency advisories           | Low      | Production audit is 0; recheck after tooling upgrades                                |
| NPM WebSockets                           | Low      | Keep disabled; not required                                                          |
| Playwright not rerun in Stage 5D         | Low      | No UI changes; Stage 5C.1 E2E evidence remains current                               |
| Legacy quarantined records               | Medium   | 27 Stage 5B records remain; do not delete without explicit approval                  |
| Internal screenshots                     | Low      | Exclude/redact from external release                                                 |
| Docker Desktop staging differences       | Low      | Rehearse on the target Linux host before production activation                       |

## 3. Production activation checklist

1. Approve final hostname and DNS.
2. Provision NPM proxy host, certificate, TLS redirect, and advanced body-size/timeout settings.
3. Approve and implement the production email recipient policy.
4. Complete Brevo sender/domain approval, SPF/DKIM/DMARC, and webhook registration.
5. Generate and vault a fresh production signing key.
6. Provision production secret files and backup storage.
7. Build and pin image digests; record the release.
8. Run migrations, seed the Administrator, publish the initial status list.
9. Run the full production health/monitoring checklist.
10. Execute controlled external issuance/verification/revocation and a controlled email acceptance.
11. Confirm suppression, status-list, backup/restore, and rollback procedures.
12. Obtain formal production GO approval.

## 4. Final status

**Stage 5D: CONDITIONAL PASS.**

Reasons for the condition:

- all production artifacts are prepared and validated;
- the isolated staging rehearsal passed;
- NPM live validation and production activation are outside the allowed Stage 5D actions;
- broad production email remains blocked by the exact-recipient allowlist behavior pending an
  approved application/config decision.

**Production GO/NO-GO: NO-GO** until the blocking risks above are resolved and formally approved.

No production deployment, DNS change, live email, credential activation, data deletion, or
commit/push/merge was performed.
