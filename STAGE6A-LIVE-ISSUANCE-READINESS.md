# Stage 6A Live Issuance Readiness

**Date:** 22 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production project:** `hau_soc_badging_stage2`  
**Production deployment of Stage 6A changes:** Not performed  
**Live email sent:** None

## 1. Existing feature audit

| Feature                                               | Existing status                                                                            | Reused?       |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------- |
| Individual badge issuance                             | Implemented; server-side FACULTY authorization and audit                                   | Yes           |
| Batch badge issuance                                  | Implemented with preview/validation/commit and duplicate protection                        | Yes           |
| Digitally signed Open Badges credentials              | Implemented with the active production signer                                              | Yes           |
| Student Badge Portal                                  | Implemented with ownership-scoped wallet and notifications                                 | Yes           |
| Public verification URL and QR                        | Implemented via canonical `/credentials/:publicId` and `/qr`                               | Yes           |
| Badge/image/JSON-LD/PDF downloads                     | Implemented                                                                                | Yes           |
| Notification outbox and retry worker                  | Implemented with durable queue, claims, retries, suppression                               | Yes           |
| Brevo SMTP configuration and provider status tracking | Implemented; production configuration must be re-verified                                  | Yes           |
| Revocation and status-list verification               | Implemented and preserved                                                                  | Yes           |
| Social sharing                                        | Implemented; enhanced with LinkedIn certification add-to-profile and privacy-safe metadata | Yes, enhanced |

No duplicate issuance, signing, portal, or notification system was introduced.

## 2. Live issuance requirements review

| Requirement                             | Status             | Evidence                                                       |
| --------------------------------------- | ------------------ | -------------------------------------------------------------- |
| Only authorized users issue credentials | PASS (local tests) | FACULTY role + class-ownership checks                          |
| Student identity/email validation       | PASS               | Student snapshots and registered email                         |
| Badge criteria validation               | PASS               | Badge builder and snapshot validation                          |
| Unique public credential                | PASS               | Non-sequential public ID and unique status bit                 |
| Production signing service              | PASS (existing)    | Active signer `key-local`/production key; no key changes       |
| Audit trail                             | PASS               | `badge.issued`, `badge.revoked` audit records                  |
| Duplicate prevention                    | PASS               | Tuple reservations, unique issuance constraints, batch preview |
| Individual and batch issuance           | PASS               | Existing tests/E2E                                             |
| Revocation/verification preserved       | PASS               | Existing revocation and status-list tests                      |

## 3. Local changes in Stage 6A

- Official issued-badge email template updated with HAU/SOC identity, display name, badge title,
  achievement description, issue date, verification link, Student Badge Portal link, social sharing,
  badge artwork, and support contact.
- Worker now reads the immutable recipient/achievement snapshots when rendering email, falling back to
  stored delivery fields if snapshots are unavailable.
- LinkedIn **Licenses & Certifications** add-to-profile link added to sharing controls for active
  credentials.
- Public Open Graph/Twitter metadata is suppressed and marked `noindex` when global sharing is
  disabled.
- No database schema or migration changes.
- No production signing-key changes.

## 4. Local verification

| Gate                          | Result                       |
| ----------------------------- | ---------------------------- |
| Format / lint / typecheck     | PASS                         |
| Unit tests                    | 117 files / 875 tests PASS   |
| Integration tests             | 21 files / 150 tests PASS    |
| Production build              | PASS                         |
| Stage 6A Playwright           | 4 passed (desktop + mobile)  |
| Phase 8 regression Playwright | 16 passed (desktop + mobile) |

Covered: individual/batch issuance, signed credentials, email rendering, failure/retry handling,
duplicates, student portal ownership, public verification, downloads, QR, sharing, revocation.

## 5. Production activation prerequisites

Before any live issuance/email:

- [ ] Deploy the approved Stage 6A application changes (no schema migration required).
- [ ] Confirm the production worker image contains the worker timeout fix and is healthy.
- [ ] Confirm `/api/health` notifications ready and heartbeat fresh.
- [ ] Confirm `EMAIL_DELIVERY_MODE=brevo`, `EMAIL_RECIPIENT_POLICY=production` (or `staging` for the
      pilot), `EXTERNAL_EMAIL_ENABLED=true`, port 587, and approved sender.
- [ ] Verify live sender-domain SPF/DKIM/DMARC and Brevo sender approval.
- [ ] Confirm Brevo SMTP secret and webhook secret are present without printing values.
- [ ] Confirm signing key operational; key-recovery risk explicitly accepted.
- [ ] Obtain explicit pilot recipient and live-send authorization.
- [ ] Confirm no bulk live email is enabled.
- [ ] Confirm audit and notification delivery records are accessible.

## 6. Exact remaining steps for live activation

1. Review/deploy the Stage 6A release through the approved change process.
2. Run production preflight commands in `STAGE6A-PRODUCTION-ACTIVATION-RUNBOOK.md`.
3. Obtain written authorization for the single test recipient and live-send window.
4. Execute one controlled badge issuance to the approved test student.
5. Verify email delivery, public page, downloads, QR, share links, audit, and delivery record.
6. If successful, prepare a separate recommendation for general student issuance.

## 7. Readiness statement

**Source/local readiness: PASS.**  
**Production activation: BLOCKED** pending deployment approval, production SMTP/Brevo verification,
recipient authorization, and the controlled pilot.

No production configuration, database, key, container, or email was changed.
