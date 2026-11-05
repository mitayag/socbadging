# Brevo SMTP Live Acceptance Report

**Date:** 2026-11-02  
**Status:** PASS — core Stage 3 delivery acceptance confirmed by operator-provided Brevo transactional evidence.  
**Real delivery performed:** One SMTP submission accepted; Brevo reports delivered, opened, and clicked.  
**External transmission authorized:** Yes, one new Stage 3.3D attempt; consumed and not retried.  
**Production readiness:** NOT READY.

## Operator confirmations

- Previous Brevo SMTP key revoked: **YES — operator-reported; not independently verifiable from this workspace.**
- Replacement SMTP key stored privately: **YES — verified at the private path below.**
- Brevo domain and sender authenticated: **YES — operator-confirmed via Brevo dashboard screenshot; local DNS evidence is partial.**
- Authorized test recipient: `authorized-test-recipient@example.org`.
- External transmission authorized: **YES — one new Stage 3.3D attempt; consumed by the accepted submission.**

## Approved test plan

| Item                           | Value                                                                            |
| ------------------------------ | -------------------------------------------------------------------------------- |
| Date                           | November 2, 2026                                                                 |
| Test window                    | None — operator waived scheduling                                                |
| Rollback owner                 | Marlon I. Tayag                                                                  |
| Authorized recipient           | `authorized-test-recipient@example.org`                                          |
| Maximum external transmissions | 1                                                                                |
| Test environment               | Local development                                                                |
| Production deployment          | Not authorized                                                                   |
| External email transmission    | Stage 3.3D attempted once; SMTP accepted; Brevo reports delivered/opened/clicked |

## Previous Stage 3.3B attempt

| Item                       | Value                                                |
| -------------------------- | ---------------------------------------------------- |
| Activation start           | 2026-11-02 15:03:26 Asia/Manila (PHT)                |
| SMTP attempt               | 2026-11-02 15:03:30.825 Asia/Manila (PHT)            |
| Result                     | **FAIL — SMTP authentication rejected (`EAUTH`)**    |
| SMTP submission attempts   | 1                                                    |
| Email accepted by provider | No                                                   |
| Attempt state              | `REJECTED`                                           |
| Notification status        | `FAILED`                                             |
| Retry/resend               | Refused; attempt permanently consumed and not reused |

## Stage 3.3D execution

| Item                         | Value                                                                                    |
| ---------------------------- | ---------------------------------------------------------------------------------------- |
| Stage                        | 3.3D — authorized live Brevo SMTP delivery acceptance                                    |
| Activation start             | 2026-11-02 15:54:54 Asia/Manila (PHT)                                                    |
| SMTP attempt                 | 2026-11-02 15:55:01.483 Asia/Manila (PHT)                                                |
| Rollback start/finish        | 2026-11-02 15:55:04 / 15:55:08 Asia/Manila (PHT)                                         |
| Result                       | **PASS — SMTP accepted; Brevo reports delivered/opened/clicked**                         |
| External delivery enabled    | Yes, temporarily, for the single attempt                                                 |
| Services recreated for Brevo | Yes — `worker` and `web`                                                                 |
| SMTP submission attempts     | **1**                                                                                    |
| Email accepted by provider   | **Yes — SMTP accepted**                                                                  |
| Provider message ID          | `<<redacted-provider-message-id>>`                                                       |
| Inbox delivery               | Brevo reports first opening and clicks; independent Outlook screenshot URL match pending |
| Rollback required            | Yes — completed successfully                                                             |

Stage 3.3D used a new synthetic student, new notification, and new acceptance key `brevo-live-acceptance-3.3d-20261102`. The previous Stage 3.3B attempt was not modified or retried.

## Stage 3.3D delivery verification

| Check                                      | Result                                                                           |
| ------------------------------------------ | -------------------------------------------------------------------------------- |
| Issuance ID                                | `cmvyyqrms00010it194bfz2q9`                                                      |
| Public badge ID                            | `I9fViIV-5x080z_eJIBvQW0I-39Eemnb`                                               |
| Notification ID                            | `cmvyyqro100040it1aa8f74fy`                                                      |
| SMTP attempt ID                            | `cmvyyqrpc00050it15bs1fiz8`                                                      |
| Application notification status            | `SENT`                                                                           |
| Delivery channel                           | `brevo`                                                                          |
| Attempt state                              | `ACCEPTED`                                                                       |
| SMTP response                              | Accepted; explicit numeric response not captured                                 |
| Provider message ID                        | `<<redacted-provider-message-id>>`                                               |
| Brevo acceptance                           | SMTP accepted                                                                    |
| Brevo transactional delivery result        | Operator-provided — Delivered at 15:55 PHT; opened 15:55; clicked 15:55–15:56    |
| Inbox receipt                              | Provider-reported opening/clicking; independent Outlook screenshot match pending |
| Duplicate email                            | No — exactly one new submission                                                  |
| Pending Brevo notifications after rollback | 0                                                                                |
| Badge verification HTML                    | PASS — HTTP 200, correct badge name and issuer                                   |
| Badge verification JSON                    | PASS — HTTP 200, correct badge name and issuer                                   |
| Mailpit rollback                           | PASS — worker/web use Mailpit, external delivery disabled                        |
| Retry/resend refusal                       | PASS — both refused the consumed controlled notification                         |
| Previous Stage 3.3B attempt                | Unchanged — `FAILED` / `REJECTED` / `EAUTH`                                      |

The recorded provider message ID is the SMTP Message-ID returned to the application, not a confirmed Brevo transactional-log ID. Brevo provider delivery is operator-provided; independent screenshot correlation is still pending.

## Operator-provided Brevo transactional evidence

The operator supplied a Brevo transactional-log screenshot with these events:

| Event         | Timestamp (PHT)            |
| ------------- | -------------------------- |
| Sent          | 2026-11-02 15:55           |
| Delivered     | 2026-11-02 15:55           |
| First opening | 2026-11-02 15:55           |
| Clicked       | 2026-11-02 15:55 and 15:56 |

- Sender: `badges@hausoc.org`
- Recipient: `authorized-test-recipient@example.org`
- Subject: `Your Brevo SMTP Acceptance Test`

Correlation to Stage 3.3D is supported by the exact sender, exact recipient, matching subject, and matching 15:55 PHT submission timestamp. The supplied summary does not expose a Brevo transactional ID, so the application’s SMTP Message-ID is **not** confirmed as the provider log identifier.

The operator also cited an Outlook inbox screenshot as supporting evidence. It is recorded as supporting evidence only; its badge URL must match public badge ID `I9fViIV-5x080z_eJIBvQW0I-39Eemnb` before it is treated as independently verified inbox evidence.

## Stage 3.3D evidence reconciliation

| Check                                        | Result                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------- |
| Issuance → notification association          | PASS — one notification for the Stage 3.3D issuance                          |
| Notification → SMTP attempt association      | PASS — one `ACCEPTED` attempt for the notification                           |
| Stage 3.3D SMTP submissions                  | **1**                                                                        |
| Previous Stage 3.3B attempt                  | Preserved — `FAILED` / `REJECTED` / `EAUTH`, unchanged                       |
| Total SMTP attempts in system                | 2 — one rejected, one accepted                                               |
| Brevo transactional-log evidence             | Operator-provided — Sent, Delivered, Opened, Clicked at 15:55–15:56 PHT      |
| Outlook inbox screenshot evidence            | Operator-cited supporting evidence; badge URL match pending                  |
| Inbox receipt                                | Brevo reports opening/clicking; independent Outlook screenshot match pending |
| Public credential status                     | ACTIVE                                                                       |
| Public credential cryptographic verification | PASS — signer outcome `VERIFIED`, key `key-local`                            |
| Proof suite                                  | `DataIntegrityProof` / `eddsa-rdfc-2022`                                     |
| Public HTML verification                     | HTTP 200 — “Active credential”, “Cryptographically verified”                 |
| Public JSON-LD                               | HTTP 200 — correct badge and issuer                                          |
| Mailpit active after rollback                | PASS                                                                         |
| External application delivery after rollback | Disabled                                                                     |

The recorded provider message ID is the SMTP Message-ID, not a confirmed Brevo transactional-log ID. Any operator-provided Outlook screenshot must show public badge ID `I9fViIV-5x080z_eJIBvQW0I-39Eemnb` before it is accepted as inbox evidence.

## Follow-up issues

1. **Missing email artwork:** the notification’s badge image URL points to `http://127.0.0.1:3000/api/media/...`, which is unreachable from external mail clients.
2. **Localhost social-sharing preview:** the verification and canonical URLs use `http://127.0.0.1:3000/...`, so external social crawlers cannot resolve the preview.

These are deployment/configuration follow-ups and do not change the Stage 3.3D SMTP, badge-verification, or rollback results.

## One-attempt safety implementation

- New table: `smtp_submission_attempts`, one row per controlled notification.
- States: `NOT_STARTED`, `SUBMISSION_RESERVED`, `ACCEPTED`, `REJECTED`, `OUTCOME_UNKNOWN`.
- Atomic reservation occurs before SMTP; only the winning worker may submit.
- Reserved attempts are permanently consumed across crashes, restarts, lease expiry, and concurrent workers.
- SMTP timeouts become `OUTCOME_UNKNOWN`; controlled notifications never retry.
- Reconciliation terminalizes consumed attempts without sending.
- Manual retry/resend refuse controlled notifications.
- `CONTROLLED_ACCEPTANCE_ONLY=true` blocks unarmed Brevo deliveries and direct student activation/recovery email.
- Detailed evidence: `docs/email/BREVO-SMTP-ONE-ATTEMPT-SAFETY-REPORT.md`.

## Secure credential handling

| Check                                     | Result                                                       |
| ----------------------------------------- | ------------------------------------------------------------ |
| Source file existed                       | PASS — `docs/smtpcred.txt`                                   |
| Source file size                          | 131 bytes, 3 lines                                           |
| Source keys detected                      | `SMTP_API` and `USERNAME`, both non-empty                    |
| Source values displayed                   | NO                                                           |
| Source file mode before move              | `0644` — too permissive                                      |
| Source tracked by Git                     | NO                                                           |
| Source present in Git history             | NO                                                           |
| Source referenced elsewhere in repository | NO                                                           |
| Open handles on source                    | NONE                                                         |
| Secure target directory                   | `<private-config-directory>`                                 |
| Target directory permissions              | `0700`                                                       |
| Target file                               | `<private-brevo-env-file>`                                   |
| Target file permissions                   | `0600`                                                       |
| Credential values copied correctly        | PASS — verified by direct comparison without printing values |
| Original file removed                     | PASS — overwritten before deletion                           |
| Credential values in report or logs       | NONE                                                         |

The source file was untracked and absent from all Git object history. **No Git exposure was found, so Git-driven credential rotation is not required.** Because the source was readable at `0644` while inside the project directory, rotating the Brevo SMTP key remains a prudent precaution.

## Private environment contents

The private file contains:

- `EMAIL_DELIVERY_MODE=mailpit`
- `EXTERNAL_EMAIL_ENABLED=false`
- `EXTERNAL_EMAIL_ALLOWLIST=authorized-test-recipient@example.org`
- `BREVO_SMTP_HOST=smtp-relay.brevo.com`
- `BREVO_SMTP_PORT=587`
- `BREVO_SMTP_USER` — non-empty
- `BREVO_SMTP_PASSWORD` — non-empty
- `BREVO_SENDER=HAU SOC Badging System <badges@hausoc.org>`
- `BREVO_WEBHOOK_ENABLED=false`

External delivery is intentionally left disabled in the private file. Activating it requires an explicit edit and service recreation during the approved test window.

## Preflight results

| Check                                                     | Result                                                                                                          |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Mailpit remains default transport                         | PASS — `EMAIL_DELIVERY_MODE=mailpit`                                                                            |
| External delivery disabled                                | PASS — `EXTERNAL_EMAIL_ENABLED=false`                                                                           |
| Active worker allowlist                                   | PASS — empty                                                                                                    |
| Brevo SMTP credentials in active worker                   | PASS — not configured                                                                                           |
| Brevo credentials in tracked files                        | PASS — none                                                                                                     |
| Private credential file exists outside repository         | PASS                                                                                                            |
| Credential file mode `0600`                               | PASS                                                                                                            |
| Private env loaded by Docker Compose                      | PASS — `config --quiet` exit 0; no services started                                                             |
| Stored private env fails closed                           | PASS — `EXTERNAL_EMAIL_ENABLED=false` rejects Brevo activation                                                  |
| Brevo SMTP config validated with stored credentials       | PASS — host, port, STARTTLS, certificate verification, allowlist, and sender validated without printing secrets |
| Actual private allowlist contains only approved recipient | PASS — exactly `authorized-test-recipient@example.org`                                                          |
| `.env`/`.env.*` ignored                                   | PASS                                                                                                            |
| Brevo host/port                                           | PASS — `smtp-relay.brevo.com:587`                                                                               |
| STARTTLS and certificate verification                     | PASS — `secure=false`, `requireTLS=true`, `rejectUnauthorized=true`                                             |
| Brevo sender                                              | PASS — `HAU SOC Badging System <badges@hausoc.org>`                                                             |
| Brevo webhook                                             | PASS — disabled                                                                                                 |
| Brevo IP restrictions                                     | PASS — unchanged                                                                                                |
| Queued Mailpit notifications                              | PASS — 7 `mailpit`/`SENT`; no pending, processing, or retry rows                                                |
| Mailpit-to-Brevo channel isolation                        | PASS — worker claims only its active `delivery_channel`                                                         |
| Other notification workers                                | PASS — one worker container only; no host worker process detected                                               |
| Worker/web/Mailpit/signer health                          | PASS — healthy                                                                                                  |
| Migration parity                                          | PASS — no difference                                                                                            |
| Sender/domain authentication evidence                     | Operator-confirmed via Brevo dashboard screenshot; local DNS evidence partial                                   |
| Durable at-most-once SMTP submission protection           | PASS — database-backed reservation; tested across crash, restart, concurrency, and timeout scenarios            |
| Crash/restart/ambiguous/concurrent submission tests       | PASS — unit and MariaDB integration coverage                                                                    |

## Domain authentication evidence

Public DNS queried on 2026-11-02:

- SPF:
  ```text
  v=spf1 include:spf.efwd.registrar-servers.com ~all
  ```
  **Brevo is not included in the current SPF record.**
- DMARC:
  ```text
  v=DMARC1; p=none; rua=mailto:rua@dmarc.brevo.com
  ```
  DMARC exists but is monitoring-only.
- DKIM:
  `brevo1._domainkey.hausoc.org` resolves to `b1.hausoc-org.dkim.brevo.com`.
- Brevo domain verification TXT is present (`brevo-code:...`).
- Brevo sender verification for `badges@hausoc.org` could not be independently verified from this workspace.

The current SPF record was **not changed**. Missing root SPF inclusion is **not treated as an automatic failure for shared-IP sending**; Brevo may use its own envelope/return-path domain and DKIM alignment. However, Brevo dashboard evidence is still required to confirm that `hausoc.org` is authenticated for the account. Do not add Brevo to root SPF unless the account uses a dedicated IP or Brevo explicitly requires it.

## Prepared test data

Created directly in the database without invoking application email paths:

| Item                    | Value                                      |
| ----------------------- | ------------------------------------------ |
| Test class ID           | `smtp-acceptance-class-20261102`           |
| Course code             | `SOC-SMTP-ACCEPT`                          |
| Class title             | `Brevo SMTP Acceptance Test Class`         |
| Test badge ID           | `smtp-acceptance-badge-20261102`           |
| Badge name              | `Brevo SMTP Acceptance Test Badge`         |
| Synthetic student ID    | `smtp-acceptance-student-20261102`         |
| Stage 3.3B student ID   | `smtp-acceptance-student-20261102`         |
| Stage 3.3D student ID   | `smtp-acceptance-student-20261102-d`       |
| Stage 3.3D student no.  | `SMTP-ACCEPT-20261102-D`                   |
| Recipient email         | `authorized-test-recipient@example.org`    |
| Enrollment              | ACTIVE                                     |
| Issuances               | 2 (Stage 3.3B failed, Stage 3.3D accepted) |
| Notification deliveries | 2 (one `FAILED`, one `SENT`)               |
| Student accounts        | 0                                          |
| Student tokens          | 0                                          |

The synthetic students are recipient records only. No `User`, `StudentAccount`, or `StudentToken` was created. No account invitation or activation action was invoked.

## Email-trigger prevention

- Test records were inserted directly; no application service that sends email was called.
- `inviteStudentAction` was not invoked; it would create an activation token and call `sendStudentAccountEmail`.
- Exactly one controlled Stage 3.3D badge was issued; the previous Stage 3.3B issuance was preserved unchanged.
- The Stage 3.3D issuance generated exactly one `BADGE_ISSUED` notification.
- No activation, recovery, invitation, resend, or additional notification was generated.
- Mailpit remains the active transport and external delivery is disabled after rollback.

## Rollback procedure

Current state is already safe. If a controlled test is later approved, roll back immediately with:

```text
EMAIL_DELIVERY_MODE=mailpit
EXTERNAL_EMAIL_ENABLED=false
EXTERNAL_EMAIL_ALLOWLIST=
```

Recreate only the affected services without the private Brevo environment:

```text
docker compose --env-file .env --profile notifications up -d --no-deps --force-recreate worker web
```

Then verify:

```text
docker compose --profile notifications ps
curl -fsS http://127.0.0.1:3000/api/health
```

Confirm worker environment has `mode=mailpit`, `external_enabled=false`, and an empty allowlist. Confirm existing `mailpit` notifications remain channel-isolated and no `brevo` rows are pending.

## Stage 3.3D evidence status

| Evidence                               | Status                                                                         |
| -------------------------------------- | ------------------------------------------------------------------------------ |
| Exactly one new SMTP submission        | PASS                                                                           |
| Application notification status        | `SENT`                                                                         |
| SMTP attempt state                     | `ACCEPTED`                                                                     |
| Provider message ID                    | Recorded                                                                       |
| Brevo transactional-log result         | Operator-provided — Delivered, opened, clicked                                 |
| Recipient inbox receipt                | Provider-reported opening/clicking; Outlook screenshot badge-URL match pending |
| Badge verification HTML/JSON           | PASS — active and cryptographically verified                                   |
| Duplicate or unauthorized transmission | None found                                                                     |
| Worker/web credential exposure         | None observed                                                                  |
| Mailpit rollback                       | PASS                                                                           |
| Previous Stage 3.3B attempt preserved  | PASS                                                                           |

## EAUTH remediation

- The private `BREVO_SMTP_USER` was corrected to `<redacted-brevo-smtp-username>`.
- The SMTP password was not modified; it remains populated and formatted like a Brevo SMTP key.
- The parser accepts the credentials without truncation, whitespace, or unexpected quoting.
- Authentication-only verification passed with SMTP `235 2.0.0 Authentication succeeded`; the existing key was accepted.
- No email was transmitted during authentication-only verification.
- The subsequent Stage 3.3D live attempt was accepted by Brevo with application status `SENT` and attempt state `ACCEPTED`.
- The consumed Stage 3.3B attempt remains `REJECTED` and was not retried or resent.
- Details: `docs/email/BREVO-SMTP-EAUTH-REMEDIATION-REPORT.md`.

## Remaining production-readiness advisories

1. Independently verify the operator-cited Outlook screenshot shows public badge ID `I9fViIV-5x080z_eJIBvQW0I-39Eemnb`.
2. Brevo transactional-log evidence is operator-provided; no provider API/log integration exists.
3. Email badge artwork remains unreachable because it uses a localhost image URL.
4. Social-sharing previews remain unreachable because the verification/canonical URL is localhost.
5. Webhook, bounce/complaint persistence, and production provider operations remain unimplemented.
6. Stage 3.3D is consumed; any future live test requires a new authorization, notification, and acceptance key.
7. One unrelated unit test failure and one unrelated desktop Playwright failure remain in the existing suite.

## Approval checkpoint

Stage 3.3D completed one authorized SMTP submission. Brevo accepted the message and reports delivery, first opening, and clicks. The application notification is `SENT`, the attempt is `ACCEPTED`, and Mailpit is restored. No further submission is permitted under this authorization.

The remaining Outlook screenshot correlation and localhost URL issues are advisories, not reasons to resend.

## Recommendation

**PASS — core Stage 3 SMTP delivery acceptance criteria are met.** Brevo reports the message delivered and engaged, the public credential is active and cryptographically verified, no duplicate submission occurred, and Mailpit was restored. Production readiness remains blocked by the localhost artwork/social-preview issues, missing provider API/log integration, and incomplete webhook/bounce operations.

For Stage 4, independently correlate the Outlook screenshot to the Stage 3.3D public badge ID, fix the external-facing media and verification URLs, and implement production provider operations. Do not resend this notification.
