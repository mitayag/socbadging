# Stage 5E.2 External Acceptance Report

**Date:** 5 November 2026  
**Candidate:** `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f`  
**Repository:** https://github.com/mitayag/socbadging  
**PR:** https://github.com/mitayag/socbadging/pull/1  
**Production deployment:** Not performed  
**Live email:** Not sent  
**DNS/proxy/key changes:** None

## 1. Acceptance matrix

| Area | Requirement                               | Result                       | Evidence                                  |
| ---- | ----------------------------------------- | ---------------------------- | ----------------------------------------- |
| E2.1 | Exact commit verified                     | PASS                         | Local HEAD = PR head = `6d2f403...`       |
| E2.1 | CI checks passing                         | PASS                         | Push and PR Quality runs SUCCESS          |
| E2.1 | Outstanding requirements reviewed         | PASS                         | Stage 5E.1 reports                        |
| E2.1 | Authorized credentials/environment access | BLOCKED                      | No written approval/approved access       |
| E2.1 | Written external-operation approval       | BLOCKED                      | Not supplied in this task                 |
| E2.2 | Sender identity                           | BLOCKED                      | No approved sender/account access         |
| E2.2 | SPF authentication                        | **FAIL**                     | Current SPF lacks Brevo                   |
| E2.2 | DKIM                                      | PASS                         | Brevo DKIM CNAMEs resolve                 |
| E2.2 | DMARC                                     | PASS                         | `p=none` with Brevo reporting             |
| E2.2 | DKIM/DMARC alignment                      | BLOCKED                      | No external send                          |
| E2.2 | Secure staging credentials                | BLOCKED                      | No approved credential activation         |
| E2.2 | Webhook HMAC processing                   | PASS locally                 | 11 route/adapter tests                    |
| E2.2 | Webhook registration/external delivery    | BLOCKED                      | No provider registration                  |
| E2.2 | Authorized delivery/SMTP/inbox            | BLOCKED                      | No send approval                          |
| E2.2 | Bounce/complaint suppression/retry        | PASS locally                 | 12 integration tests                      |
| E2.3 | Production Compose/proxy preparation      | PASS                         | Config validation                         |
| E2.3 | NPM proxy host/TLS/HTTPS issuer           | BLOCKED                      | No NPM access/certificate                 |
| E2.3 | Forwarding headers                        | BLOCKED                      | No external proxy route                   |
| E2.3 | DB/signer private                         | PASS                         | Production Compose has no published ports |
| E2.3 | Public credential/status endpoints        | PASS locally / HTTPS BLOCKED | Local HTTP 200                            |
| E2.4 | Local signing/status-list                 | PASS                         | Proof/status/credential checks            |
| E2.4 | Active/revoked independent verification   | PASS                         | Pages + status bits                       |
| E2.4 | Downloads/image/PDF/QR                    | PASS                         | HTTP 200/content types                    |
| E2.4 | Historical verification compatibility     | PASS (tests)                 | 45 signing/revocation tests               |
| E2.4 | Production key activation/custody         | BLOCKED                      | No approval/vault access                  |
| E2.5 | DB/media backup + checksums               | PASS                         | Backup verification                       |
| E2.5 | Isolated restore                          | PASS                         | Disposable restore test                   |
| E2.5 | Signing-key backup/restore                | PASS                         | Decrypt + signer ready                    |
| E2.5 | Monitoring checks                         | PASS                         | `checks_failed=0`                         |
| E2.5 | Alert ownership/production vault          | BLOCKED                      | Not assigned/provisioned                  |
| E2.6 | Full regression                           | PASS                         | 859 unit / 148 integration / 57 E2E       |
| E2.6 | Production build                          | PASS                         | `npm run build`                           |
| E2.6 | Secret scan                               | PASS                         | 0 real secret hits                        |
| E2.6 | Production dependency audit               | PASS                         | 0 vulnerabilities                         |

## 2. Local evidence summary

- Unit: 115 files / 859 tests passed.
- Integration: 20 files / 148 tests passed.
- Playwright desktop+mobile: 57 passed, 1 skipped by design.
- Targeted webhook/suppression: 11 unit + 12 integration tests passed.
- Targeted signing/status: 4 files / 45 tests passed.
- Production build: passed.
- Backup/restore disposable drill: passed.
- Monitoring script: 0 failed checks.
- Status-list external proof: PASS, revoked index 1, active index 2.

## 3. Exact outstanding approvals

1. **External email approval:** written authorization naming one sender, one recipient, test window,
   observer, and rollback owner.
2. **Brevo access:** approved sender/domain, SMTP credentials, webhook secret, provider registration.
3. **DNS:** add Brevo to SPF; retain DKIM CNAMEs; adjust DMARC/alignment as approved. No DNS changes
   were made in this stage.
4. **NPM/HTTPS:** approved proxy host, certificate, forwarding-header validation, and final HTTPS
   issuer URLs.
5. **Production signing key:** generation, custody, activation, backup validation, and post-rotation
   historical verification.
6. **Operations:** production backup vault, off-host binlog decision, monitoring/on-call ownership,
   and incident contacts.
7. **Release:** PR approval, merge authorization, and final release publication approval.

## 4. Verdict

**Stage 5E.2 application/local acceptance: PASS.**  
**External Brevo/DNS acceptance: FAIL for SPF; BLOCKED for delivery/inbox evidence.**  
**External HTTPS/proxy/key acceptance: BLOCKED.**  
**Production backup/monitoring ownership: BLOCKED.**  
**Overall Stage 5E.2 external acceptance: BLOCKED / NOT ACCEPTED FOR PRODUCTION.**
