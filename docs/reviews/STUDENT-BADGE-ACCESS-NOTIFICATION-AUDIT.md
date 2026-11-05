# Student Badge Access and Notification Audit

**Audit date:** 2026-11-01  
**Environment:** Local Docker development stack at `http://127.0.0.1:3000`  
**Scope:** Read-only audit of student credential access and issuance notifications. No implementation, commit, push, or deployment was performed.

## 1. Existing implemented features

### Student-facing public access

- Public verification page: `GET /credentials/:publicId` (`src/app/credentials/[publicId]/page.tsx`).
- Public JSON-LD: `GET /api/credentials/:publicId`.
- Public JSON-LD download: `GET /api/credentials/:publicId/download`.
- Public issuer profile and verification key routes:
  - `GET /api/issuers/hau-soc`
  - `GET /api/issuers/hau-soc/keys/:keyId`
- Public signed status-list route: `GET /api/status-lists/:listId`.
- Anonymous access is supported; no faculty, Administrator, or student session is required.
- The page displays badge artwork, badge name, description, criteria, skills/alignments when present, recipient display identity, issuer, issue date, expiration when present, current lifecycle status, cryptographic verification result, and sharing controls.
- Sharing includes copy link, native Web Share when available, LinkedIn, Facebook, X, and email composition links.
- Machine-readable credential viewing/download is available as JSON-LD.

### Student accounts, wallet, and login

- No student account, login, dashboard, wallet, or student portal route exists.
- The only student-facing access path is the public verification URL delivered by email or shared by Faculty/Administrator.
- Public identity is minimized to first name plus last initial; recipient email and student number are not rendered.

### Notification pipeline

- Issuance writes a `BADGE_ISSUED` outbox row in the same MariaDB transaction as the credential (`src/modules/issuance/services/signed-issuance-service.ts:1196`).
- Batch issuance reuses the same commit path and therefore the same notification behavior for every newly issued row (`src/modules/issuance/services/signed-issuance-service.ts:1240`).
- Outbox service: `src/modules/notifications/services/notification-outbox.ts`.
- Separate worker: `src/worker.ts`, polling `runDeliveryCycle` (`src/modules/notifications/services/delivery-worker.ts`).
- SMTP transport: Nodemailer (`src/modules/notifications/services/smtp-client.ts`).
- Email templates: `src/modules/notifications/templates/issued-email.ts` and `revoked-email.ts`.
- Administrator notification review and retry: `/notifications`.
- Faculty can see notification status only for credentials in classes they currently own.

## 2. Actual student access workflow

1. Faculty issues a badge from `/classes/:classId/issued`.
2. The issuance transaction creates:
   - the immutable `badge_issuances` record,
   - opaque public ID,
   - signed Open Badges 3.0-aligned credential,
   - status-list allocation,
   - `badge.issued` audit record,
   - `BADGE_ISSUED` notification outbox row.
3. The separate worker claims the outbox row and sends an SMTP email to the recipient email snapshotted at issuance.
4. The email contains:
   - recipient first name,
   - issuer name,
   - badge name,
   - issue date,
   - public verification URL.
5. The student opens the public URL without signing in.
6. The public page shows the credential and sharing options.
7. There is no student login, credential collection page, or wallet. If the email is lost, the student cannot self-recover the link; Faculty or an Administrator must share it again.

## 3. Notification transport and delivery status semantics

### Transport

- Actual transport is **SMTP through Nodemailer**, not an email API and not an internal-only notification.
- Local Compose configuration points the worker at **Mailpit**:
  - `SMTP_HOST=mailpit`
  - `SMTP_PORT=1025`
  - `SMTP_FROM=HAU SOC Badging System <badges@example.edu>`
- The worker runs separately from the web process and polls every configured interval.
- Production requires externally configured SMTP settings; Mailpit is development-only.

### Status values

The database and UI use these statuses (`src/modules/notifications/types.ts`):

| Status            | Meaning                                                                                                             |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `PENDING`         | Outbox row created; not yet claimed by a worker.                                                                    |
| `PROCESSING`      | Claimed by a worker with a lease/claim token.                                                                       |
| `RETRY_SCHEDULED` | A transient SMTP failure occurred; a later retry is scheduled with exponential backoff.                             |
| `SENT`            | The SMTP transport accepted the message and returned a provider message ID. **This does not prove inbox delivery.** |
| `FAILED`          | Permanent SMTP failure or retry attempts exhausted.                                                                 |

There is **no `DELIVERED` status**. The Administrator UI labels `SENT` as “Sent.” It must not be interpreted as confirmed inbox delivery, read receipt, or bounce-free delivery.

### Retry, failure, and duplicate behavior

- The outbox has a unique constraint on `(issuance_id, type)`, preventing duplicate `BADGE_ISSUED` rows for one issuance.
- Repeated issuance returns the existing credential and does not enqueue another notification.
- Worker claims use `PROCESSING` plus a claim token and lease; status updates require the same claim token.
- Transient failures become `RETRY_SCHEDULED` with exponential backoff; permanent failures or exhausted attempts become `FAILED`.
- Administrators can retry `FAILED` or `RETRY_SCHEDULED` deliveries; retry resets the row to `PENDING` and writes `notification.retry_requested` audit evidence.
- Delivery is **at-least-once** at the SMTP boundary. If the worker crashes after SMTP accepts the message but before persisting `SENT`, the lease can expire and another attempt may resend the email. The outbox prevents duplicate rows, not duplicate SMTP sends.

### Privacy

- The public page excludes recipient email, student number, internal issuance ID, roster data, and audit context.
- The email body contains only first name, issuer, badge name, issue date, and public URL.
- The recipient email is present in the SMTP envelope and `notification_deliveries` as required for delivery.
- The Administrator notification UI masks the recipient address (`a***@example.test`).
- No credential JSON, private key material, internal bearer token, or signer payload is included in the email.

## 4. Local verification evidence

### Isolated fixtures

Created in the local development database only:

- Badge: `AUDIT INDIVIDUAL BADGE`
- Badge: `AUDIT BATCH BADGE`
- Student: `AUDIT-0001` / `audit-recipient-a@example.test`
- Student: `AUDIT-0002` / `audit-recipient-b@example.test`

No external email was sent. The local worker delivered to Mailpit only. The isolated audit fixtures remain in the local development database for inspection; they use `audit-` IDs and `.example.test` recipient addresses.

### Individual issuance

- Issuance succeeded.
- `notification_deliveries` row: `BADGE_ISSUED`, status `SENT`, attempt count `1`.
- Mailpit captured the message for `audit-recipient-a@example.test`.
- Email subject: `Your AUDIT INDIVIDUAL BADGE badge was issued`.
- Public URL in the email resolved successfully.
- Public page returned HTTP 200 and displayed `Active credential` and `Cryptographically verified`.
- Public JSON-LD returned HTTP 200 with `application/ld+json`.

### Batch issuance

- Batch preview and commit succeeded.
- `notification_deliveries` row: `BADGE_ISSUED`, status `SENT`, attempt count `1`.
- Mailpit captured the message for `audit-recipient-b@example.test`.
- Email subject: `Your AUDIT BATCH BADGE badge was issued`.
- Public page returned HTTP 200 and displayed `Active credential` and `Cryptographically verified`.
- Public JSON-LD returned HTTP 200.

### Duplicate prevention

Submitting the same individual issuance again redirected to the existing credential with `notice=existing`.

Database counts remained:

```text
audit individual notifications: 1
audit batch notifications: 1
```

No duplicate outbox row or email was created.

### Worker evidence

Worker logs recorded a successful delivery cycle with `processed: 1` and `status: "ready"`. Mailpit contained the two expected audit messages.

### Screenshots

- [Public student verification page](../screenshots/student-badge-public-verification.png)
- [Mailpit notification delivery](../screenshots/student-notification-mailpit.png)
- [Issuance success credential detail](../screenshots/live-issuance-success.png)

### Existing automated coverage

- Notification unit tests: 7 files, 17 tests passed.
- Full unit suite: 110 files, 774 tests passed.
- MariaDB integration suite: 14 files, 102 tests passed.
- Playwright E2E: 34/34 passed, including individual and batch notification behavior.

## 5. Missing features

1. **No student account, login, dashboard, wallet, or credential collection page.**
2. **No self-service recovery** if the student loses or deletes the email. There is no “resend my link” flow.
3. **No resend action for successfully sent notifications.** Administrator retry is limited to `FAILED` and `RETRY_SCHEDULED`; `SENT` messages cannot be resent from the UI.
4. **No delivery confirmation beyond SMTP acceptance.** No bounce/complaint webhook, inbox delivery confirmation, or read receipt.
5. **No badge image or PDF download.** The public page offers JSON-LD view/download but not the badge artwork as a standalone image or PDF.
6. **No public evidence attachments.** Evidence attachments remain P1/unimplemented.
7. **No expiration reminders or renewal notifications.**
8. **No email preference/unsubscribe or notification history for students.**
9. **No wallet/API interoperability.** Open Badges wallet APIs and social account linking remain out of scope.
10. **Email template does not include badge artwork, description, expiration, or support contact.** `supportContact` is accepted by the template input type but not rendered in the issued email.
11. **No localization or plain-language delivery status explanation for recipients.**
12. **No rate limiting or throttling for future resend operations.**

## 6. Recommended improvements

### Must Have

- **Correct delivery wording:** replace any “delivered” language with “Sent (SMTP accepted)” or equivalent; never claim inbox delivery.
- **Add a resend/recovery path** for Faculty/Administrator when a student loses the email, with authorization, audit, and rate limiting.
- **Configure production SMTP with TLS/authentication** and verify SPF, DKIM, DMARC, bounce handling, and sender reputation.
- **Keep Mailpit as the development default** so local testing never sends real student email.
- **Document the at-least-once delivery caveat** and avoid promising exactly-once email delivery.

### Should Have

- Add a student credential collection page reachable from the email link, even without a full student account.
- Add badge image/PDF download on the public page.
- Add badge artwork, description, expiration, and support contact to the issuance email.
- Add bounce/complaint webhook handling and delivery-event tracking.
- Add expiration reminders and renewal notifications.
- Add resend throttling and an audit-visible resend history.
- Add an explicit public-page note explaining that the link is the student’s credential access path.

### Future Enhancement

- Student accounts, login, dashboard, and personal wallet.
- Open Badges wallet/API interoperability and OAuth.
- Social account linking and persistent sharing identities.
- Evidence attachments and issuance analytics.
- Localization and expanded accessibility testing.
- S3-compatible object storage for badge media.
- Notification preference center and unsubscribe management.

## Audit conclusion

Students currently access badges through an anonymous public verification URL delivered by SMTP email. The implementation is functional, privacy-conscious, and cryptographically verifiable. The primary gaps are the absence of a student portal or recovery/resend flow and the absence of delivery confirmation beyond SMTP acceptance. `SENT` must not be treated as proof of inbox delivery.
