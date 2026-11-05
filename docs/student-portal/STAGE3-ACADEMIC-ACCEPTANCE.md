# Stage 3 Academic Acceptance

## Faculty

- [x] Create class — existing class workspace and E2E fixtures verified.
- [x] Create badge template — badge builder and E2E fixture verified.
- [x] Issue individually — live audit issuance and E2E PASS.
- [x] Issue by batch — live audit batch and E2E PASS.
- [x] Review class issuance records — issued list and credential detail PASS.
- [x] Resend authorized notification — Administrator E2E and live resend PASS; owning Faculty authorization covered by integration tests.

## Student

- [x] Activate account — live Mailpit activation and E2E desktop/mobile PASS.
- [x] Log in — STUDENT redirect to `/student` PASS.
- [x] Access dashboard — desktop/mobile E2E PASS.
- [x] View badges across classes — E2E wallet includes two classes (`E2E-600`, `E2E-601`) PASS.
- [x] Download signed JSON-LD — HTTP 200, `application/ld+json` PASS.
- [x] Download badge image — HTTP 200, image content type PASS (live).
- [x] Download PDF — HTTP 200, `application/pdf` PASS.
- [x] Share verification link — public page and sharing controls PASS.
- [x] Recover account — single-use recovery token E2E desktop/mobile PASS.
- [x] Log out — shared user menu logout PASS.

## Administrator

- [x] Manage student accounts — `/students` invite/suspend/reactivate PASS.
- [x] Suspend and reactivate accounts — live browser PASS.
- [x] Inspect notification history — `/notifications` PASS.
- [x] Review audit trails — `/audit-logs` PASS.
- [x] Resend notification — E2E desktop/mobile PASS.
- [x] Existing credentials remain accessible — public verification HTTP 200 during suspension PASS.

## Security acceptance

- [x] Student A cannot access Student B's credential — HTTP 404.
- [x] Student A cannot access staff export/report APIs — HTTP 403.
- [x] Unauthorized responses contain no student PII.
- [x] Replayed/expired activation and recovery tokens fail.
- [x] Password reset invalidates sessions.
- [x] Suspension invalidates sessions and blocks login.
- [x] Public verification remains anonymous.
- [x] Signed/revoked/expired credential behavior remains fail-closed.

## Regression acceptance

- [x] Individual issuance.
- [x] Batch issuance.
- [x] Signing key management.
- [x] Revocation status lists.
- [x] Cryptographic verification.
- [x] Issuance auditing.
- [x] Notification worker/outbox.
- [x] Faculty dashboard.
- [x] Administrator dashboard.
