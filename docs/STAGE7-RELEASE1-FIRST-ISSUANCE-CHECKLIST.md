# Stage 7 Release 1 — First Operational Issuance Checklist

**Status:** Prepared, NOT executed.
**Required authorization:** Separate explicit production issuance and email-delivery approval. This checklist does not authorize execution.

Use only a legitimate course, class, approved badge version, and an eligible enrolled student. Do not use STAGE7 test records (they are archived/suspended).

## A. Authorization and window

- [ ] Written authorization for the first live issuance and external email delivery is recorded.
- [ ] Named operator and rollback owner are recorded.
- [ ] Maintenance/support window and recipient contact are confirmed.
- [ ] No release deployment or schema change is in progress.
- [ ] Brevo/provider sending is approved for the recipient.

## B. Baseline and safety

- [ ] `/api/health` is ready; database, signer and notifications are ready; worker heartbeat fresh.
- [ ] Worker is healthy and cycling; queue has no unexpected `STARTED` attempts.
- [ ] A fresh database/media/signing-key backup is verified.
- [ ] Rollback images (`pre-stage7`) are available.
- [ ] Issuance count and credential checksums are recorded as the pre-issuance baseline.

## C. Course and class

- [ ] Course exists in `/catalog` with the correct code/title and is ACTIVE.
- [ ] Class belongs to the issuing faculty and is ACTIVE.
- [ ] Class is mapped to the standardized course (or is an approved legacy class).
- [ ] Class section, term and academic year are correct.

## D. Badge definition and version

- [ ] The badge definition is APPROVED and visible in `/library`.
- [ ] The intended version is the latest approved version.
- [ ] Description, competencies, assessment criteria, artwork, issuing institution and validity are correct.
- [ ] The badge is assigned to the class (shared assignment or approved class template).
- [ ] The class badge template is ACTIVE.
- [ ] No duplicate definition is being used accidentally.

## E. Student eligibility

- [ ] Student record is correct (student number, name, email).
- [ ] Student is actively enrolled in the class.
- [ ] Student is not already issued this badge/version for the class (or the idempotent behavior is understood).
- [ ] Recipient email is correct and authorized for external delivery.

## F. Issuance path

- [ ] Choose **individual** (`/classes/{classId}/issued`) or the **batch** wizard.
- [ ] For batch: template populated, mapped, preview reviewed and only READY rows committed.
- [ ] Confirm the action with the issuing faculty account.
- [ ] Record the issuance ID and public ID.

## G. Signing and persistence

- [ ] The credential was signed (signer ready; no signing error).
- [ ] `signed_credential_json` is populated; signing key ID recorded.
- [ ] Status-list allocation created.
- [ ] Immutable recipient/achievement/issuer snapshots created.
- [ ] Issuance audit row exists (`badge.issued`).

## H. Notification and delivery

- [ ] Outbox row created in `notification_deliveries`.
- [ ] Worker processes the job (`notification.worker.cycle`, processed > 0).
- [ ] Attempt transitions to ACCEPTED/SENT; provider message ID recorded where available.
- [ ] Brevo/SMTP provider status inspected without exposing secrets.
- [ ] No duplicate delivery attempt for the same credential.
- [ ] Recipient confirms inbox receipt (and checks spam).
- [ ] If delivery fails, do not bulk retry; diagnose and follow the retry procedure.

## I. Student and public verification

- [ ] Student signs in and sees the credential at `/student/badges`.
- [ ] Student detail page opens the correct credential.
- [ ] Download (JSON/JSON-LD, image, PDF, QR) works.
- [ ] Copy link and sharing controls work; no private email/student number exposed.
- [ ] Public `/credentials/{publicId}` verifies the signature and status.
- [ ] Status list reflects the credential as active.

## J. Audit and records

- [ ] Issuance, notification, and any resend actions are visible in `/audit-logs`.
- [ ] No unrelated production records were modified.
- [ ] Issuance count increased by exactly the intended number.
- [ ] Historical credential checksums remain unchanged for prior issuances.

## K. Abort/rollback conditions

- [ ] Stop if signing fails, health degrades, queue stalls, or duplicate/unauthorized records appear.
- [ ] Do not delete credentials/audit records to undo an issuance; use the approved revocation/replacement procedure if required.
- [ ] Escalate to the rollback owner before any database or image rollback.

## L. Sign-off

- [ ] Operator records time, issuance IDs, public IDs, image IDs, commit `c64038b`, and delivery evidence.
- [ ] Recipient confirmation attached.
- [ ] First-issuance report filed; advisories updated if needed.
