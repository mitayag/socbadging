# Stage 5E.2 Production GO/NO-GO

**Date:** 5 November 2026  
**Candidate:** `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f`  
**PR:** https://github.com/mitayag/socbadging/pull/1 (OPEN, not merged)  
**Decision:** **NO-GO**

## 1. Why NO-GO

Stage 5E.2 could not complete controlled external acceptance because the required written approvals
and approved external environment access were not provided:

- no authorization to send a live Brevo email;
- no approved sender/domain/recipient activation;
- SPF for the reference sender domain does not include Brevo (FAIL);
- no live Brevo provider/webhook/inbox evidence;
- no Nginx Proxy Manager/HTTPS production route or certificate access;
- no production signing-key activation/custody approval;
- no production backup vault, off-host binlog shipping, or alert ownership;
- PR is not merged and final release publication is not authorized.

No external operation, deployment, DNS/proxy change, or production key activation was performed.

## 2. What passed

| Area                                              | Result                         |
| ------------------------------------------------- | ------------------------------ |
| Candidate commit / CI                             | PASS                           |
| Format/lint/typecheck                             | PASS                           |
| Unit tests                                        | PASS — 859                     |
| Integration tests                                 | PASS — 148                     |
| Playwright desktop+mobile                         | PASS — 57, 1 skipped by design |
| Production build                                  | PASS                           |
| Local webhook/HMAC/suppression                    | PASS                           |
| Local signing/status-list/credential verification | PASS                           |
| Backup/restore + signing-key recovery             | PASS                           |
| Monitoring health script                          | PASS                           |
| Secret scan                                       | PASS                           |
| Production dependency audit                       | PASS — 0                       |

## 3. What must be fixed or approved before GO

### Mandatory external fixes

1. Add Brevo to the sending-domain SPF record.
2. Confirm DKIM selectors and DMARC alignment with the approved sender.
3. Complete Brevo sender/domain approval and webhook registration.
4. Execute one authorized controlled delivery and capture:
   - SMTP acceptance,
   - provider delivery status,
   - actual inbox receipt,
   - webhook signature/event evidence.
5. Complete provider-triggered bounce/complaint suppression and retry/resend evidence.

### Mandatory operational approvals

6. NPM proxy host/certificate and final HTTPS issuer URLs.
7. Production signing-key generation, custody, activation, backup, and historical verification.
8. Production backup vault, retention, off-host binlog shipping decision, and restore test.
9. Monitoring/alert delivery ownership and incident contacts.
10. PR review/merge approval and final release publication approval.

## 4. RPO/RTO position

- Application/worker failure: RPO 0; RTO 15–30 minutes.
- DB with daily backup only: RPO up to 24h; RTO 2–4 hours.
- DB with off-host binlogs: RPO 5–15 minutes; RTO 2–4 hours.
- Key vault restore: 1–2 hours.
- Media: last backup; 1–2 hours.

Short RPO is not approved until off-host binlog shipping and replay are implemented/tested.

## 5. Required approvals

- Written external email authorization.
- Brevo account/domain/webhook access and approval.
- DNS change approval (SPF; DMARC policy change if desired).
- NPM/HTTPS/certificate approval.
- Production signing-key activation/custody approval.
- Production backup/monitoring/on-call ownership.
- PR merge and final release approval.

## 6. Final decision

**Stage 5E.2 controlled external acceptance: BLOCKED.**  
**Stage 5E.2 local/application acceptance: PASS.**  
**Production GO/NO-GO: NO-GO.**

Do not merge PR #1 or publish a final production release until every mandatory fix and approval above
is complete and a new acceptance run passes.
