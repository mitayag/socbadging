# Stage 5C Delivery Acceptance

**Date:** 4 November 2026  
**External Brevo delivery:** BLOCKED — no credentials, domain, allowlist, or explicit authorization  
**Local Mailpit acceptance:** PASS

## 1. Local Mailpit acceptance evidence

The local Compose stack uses Mailpit as the default transport. No external email was sent.

Observed:

- Mailpit contained badge-issued and student-password-reset messages.
- Latest badge-issued email subject: “Your Brevo SMTP Acceptance Test Badge badge was issued.”
- The email contained a public verification URL:
  `http://127.0.0.1:3000/credentials/Y9vuWvbJL6h8if4UVe2p_ql5Mu2cj6G1`
- The linked credential page returned HTTP 200 and displayed an active credential.
- Credential API, download, image, PDF, and QR endpoints returned 200 with the expected
  content types.
- The notification delivery row was `SENT` via `mailpit`; provider status remained null
  because no provider webhook was configured.
- An existing revoked signed credential displayed “Revoked credential” and its proof was
  recognized as cryptographically valid.
- An active signed credential displayed “Cryptographically verified.”

This covers the local portion of:

1. Faculty issues a badge.
2. The system creates a signed credential.
3. The notification is queued.
4. The local SMTP transport accepts the email (Mailpit).
5. Provider delivery status is not available locally.
6. Authorized recipient inbox confirmation is not applicable to Mailpit.
7. Public verification link works.
8. Credential downloads work.
9. Revoked credentials remain verifiable as revoked.

## 2. Controlled Brevo delivery test procedure (BLOCKED / PENDING APPROVAL)

The following steps require explicit authorization, Brevo credentials, a verified sender
domain, and an authorized allowlisted recipient:

1. Configure Brevo in an isolated staging environment:
   - `EMAIL_DELIVERY_MODE=brevo`
   - `EXTERNAL_EMAIL_ENABLED=true`
   - `CONTROLLED_ACCEPTANCE_ONLY=true` for the first run
   - `BREVO_SMTP_USER` / `BREVO_SMTP_PASSWORD` from the approved secret store
   - `BREVO_SENDER` on the verified domain
   - `EXTERNAL_EMAIL_ALLOWLIST` containing only the authorized test recipient
2. Confirm the worker channel is `brevo` and the recipient is allowlisted.
3. Issue a controlled badge to the test student.
4. Confirm the signed credential and queue record.
5. Confirm Brevo SMTP acceptance; do not treat acceptance as inbox delivery.
6. Register and verify the Brevo webhook against the staging secret.
7. Confirm the provider status changes to accepted/delivered/deferred/bounced as reported.
8. Obtain explicit recipient confirmation of inbox receipt.
9. Open the public verification link, verify the proof/status, and download the credential.
10. Revoke the controlled credential and confirm the signed status list and public page show
    revoked.
11. Repeat the same issuance to verify duplicate prevention.
12. Resend the notification and confirm cooldown/eligibility behavior.
13. Record correlation IDs, timestamps, provider events, and recipient evidence.

**Blocked reasons:**

- No Brevo SMTP credentials are configured in `.env`.
- No production sender domain or sender approval is verified.
- No authorized recipient allowlist is configured.
- No external email authorization was provided.
- No Brevo webhook secret is configured.

## 3. Duplicate prevention and resend

These are covered by existing tests and local behavior:

- Phase 8 E2E verifies duplicate issuance returns the existing credential rather than
  creating a duplicate.
- Phase 7 E2E verifies Administrator retry of a failed delivery and audit recording.
- Student Portal E2E verifies Administrator resend of a SENT notification.
- The resend service enforces delivery-channel matching, a 60-second cooldown, and
  authorization.
- **Gap:** a hard-bounced/complaining recipient is not automatically suppressed from a
  future resend because the suppression store is not wired to the webhook path.

## 4. Verdict

**Local Mailpit delivery acceptance: PASS.**  
**Real Brevo delivery/inbox acceptance: BLOCKED.** No external email was sent and no external
delivery result is claimed.
