# Academic Acceptance

## Administrator

- [x] Student account management page exists at `/students`.
- [x] Administrator can send an activation email.
- [x] Administrator can suspend and reactivate student accounts.
- [x] Administrator can view issued records and audit history.
- [x] Administrator can resend a SENT issuance notification.

## Faculty

- [x] Individual issuance still works.
- [x] Batch issuance still works.
- [x] Class issuance records still work.
- [x] Owning Faculty can resend notifications within their class scope.
- [x] Issued credentials appear in the student wallet.

## Student

- [x] Activate account from a verified email link.
- [x] Log in and log out.
- [x] View badges from multiple classes.
- [x] View badge details.
- [x] Download JSON-LD, badge artwork, and PDF.
- [x] Open public verification.
- [x] Share credential URL.
- [x] Recover account with a single-use token.
- [x] View notification history.
- [x] Use the mobile dashboard.

## Security

- [x] Student A cannot access Student B's private wallet.
- [x] Faculty A cannot access Faculty B's unauthorized records (existing regression).
- [x] Expired and replayed tokens fail.
- [x] Password reset invalidates sessions.
- [x] Account suspension invalidates sessions.
- [x] Forged/invalid/revoked credentials remain fail-closed (existing regression).
- [x] Public verification remains anonymous.
- [x] Public access does not expose private student records.

## Regression

- [x] Individual issuance.
- [x] Batch issuance.
- [x] Signing-key management.
- [x] Revocation status lists.
- [x] Cryptographic verification.
- [x] Issuance auditing.
- [x] Notification worker/outbox.
- [x] Faculty dashboard.
- [x] Administrator dashboard.
