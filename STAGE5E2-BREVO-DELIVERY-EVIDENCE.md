# Stage 5E.2 Brevo Delivery Evidence

**Date:** 5 November 2026  
**Candidate:** `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f`  
**External email sent:** No  
**Written external-send authorization:** Not provided in this task  
**Credentials used:** None

## 1. Preflight

| Check                                           | Result                                                      |
| ----------------------------------------------- | ----------------------------------------------------------- |
| Local environment is Mailpit/local              | PASS — external email disabled                              |
| `scripts/brevo-readiness.ts` against local mode | PASS (fail-closed) — exit 1 with missing Brevo requirements |
| Synthetic staging configuration                 | PASS — no email sent                                        |
| Approved sender identity supplied               | BLOCKED — no approved sender/account access provided        |
| Authorized recipient supplied                   | BLOCKED — no written recipient authorization                |
| Private Brevo environment file                  | Present on host but contents were not read or used          |
| Stable deployment candidate                     | PASS — commit and CI verified                               |

## 2. DNS authentication (read-only public DNS)

Reference domain inspected: `hausoc.org` (repository default sender domain; not confirmed as the
approved production sender).

| Record                              | Observed                                             | Status                            |
| ----------------------------------- | ---------------------------------------------------- | --------------------------------- |
| A                                   | Resolves                                             | PASS                              |
| MX                                  | Registrar forwarding MX records present              | PASS                              |
| SPF TXT                             | `v=spf1 include:spf.efwd.registrar-servers.com ~all` | **FAIL** — does not include Brevo |
| DMARC TXT (`_dmarc`)                | `v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com`   | PASS (monitor-only policy)        |
| Brevo verification TXT              | Brevo verification code present                      | PASS                              |
| DKIM `brevo1._domainkey`            | CNAME to Brevo DKIM selector                         | PASS                              |
| DKIM `brevo2._domainkey`            | CNAME to Brevo DKIM selector                         | PASS                              |
| DKIM `brevo`/`mail`/`default`/`sib` | No records                                           | Not used                          |
| SPF alignment                       | Brevo sending IPs are not authorized by current SPF  | **FAIL**                          |

No DNS records were changed.

## 3. Local provider-processing evidence

| Control                                 | Evidence                                        | Result |
| --------------------------------------- | ----------------------------------------------- | ------ |
| HMAC-SHA256 webhook authentication      | Webhook route/adapter tests: 2 files / 11 tests | PASS   |
| Invalid signature rejection             | Route tests                                     | PASS   |
| Raw-body/size/schema validation         | Route tests                                     | PASS   |
| Duplicate event idempotency             | Integration tests                               | PASS   |
| Provider status correlation             | Integration tests                               | PASS   |
| Out-of-order/stale handling             | Integration tests                               | PASS   |
| Hard bounce/complaint suppression       | Integration tests                               | PASS   |
| Suppression applies before retry/resend | Unit/integration tests                          | PASS   |
| Webhook/event/suppression suite         | 2 integration files / 12 tests                  | PASS   |

## 4. Provider and inbox acceptance

| Requirement                                     | Status  | Reason                                                              |
| ----------------------------------------------- | ------- | ------------------------------------------------------------------- |
| Configure staging Brevo credentials             | BLOCKED | No approved credentials or authorization to use existing local file |
| Validate authenticated webhook externally       | BLOCKED | No provider registration or approved HTTPS callback                 |
| Perform authorized delivery test                | BLOCKED | No written send approval                                            |
| SMTP acceptance                                 | BLOCKED | No external send                                                    |
| Provider delivery status                        | BLOCKED | No external send                                                    |
| Actual inbox receipt                            | BLOCKED | No external send                                                    |
| Provider-triggered bounce/complaint suppression | BLOCKED | No provider events generated                                        |
| Retry/resend against provider lifecycle         | BLOCKED | No external provider lifecycle                                      |

No external delivery, inbox receipt, or provider status is claimed.

## 5. Required actions before Brevo PASS

1. Obtain written authorization for one controlled external test.
2. Approve the exact sender domain/address and test recipient.
3. Add Brevo to the sending-domain SPF record (currently missing).
4. Complete Brevo sender/domain approval.
5. Provide staging credentials through the approved secret store.
6. Register the HTTPS webhook and validate real signatures/events.
7. Execute the controlled acceptance plan and capture recipient/provider evidence.
8. Raise DMARC from `p=none` only after monitoring and approval.

## 6. Verdict

**Local Brevo/webhook/suppression processing: PASS.**  
**DNS SPF authentication: FAIL.**  
**External Brevo delivery/inbox acceptance: BLOCKED.**  
**Overall E2.2: BLOCKED (with one external DNS FAIL).**
