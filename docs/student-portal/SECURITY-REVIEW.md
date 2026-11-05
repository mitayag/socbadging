# Student Portal Security Review

## Authorization

- STUDENT is a distinct role; it never receives Faculty or Administrator permissions.
- Staff read services now require ADMIN/FACULTY, closing the prior “non-Faculty means Administrator” assumption.
- Student wallet, detail, notification, profile, and download queries are scoped by `StudentAccount.studentId`.
- Cross-student direct credential access returns generic not-found content and does not reveal the other student's identity.

## Activation and recovery

- Tokens are 32 random bytes encoded as base64url.
- Only SHA-256 digests are persisted.
- Activation expires after 24 hours; recovery after 30 minutes.
- Tokens are single-use and previous unused tokens are invalidated.
- Recovery always returns a generic public response.
- Recovery requests are rate-limited.
- Email ownership is verified by delivering the token to the student's registered email.
- Email conflicts require Administrator review; no silent account merge or takeover.

## Sessions and passwords

- Reuses Argon2id, HTTP-only cookie sessions, session expiry, and session invalidation.
- Password reset increments `sessionVersion` and deletes active sessions.
- Suspension deletes sessions and blocks login through the existing active-status check.
- Login rate limiting and trusted-origin checks remain in force.

## Public and private data

- Public verification remains anonymous.
- Public DTOs exclude email, student number, internal IDs, roster data, and audit context.
- Student notification history excludes recipient email and other students' records.
- PDF and image endpoints use immutable snapshot data and local storage containment.
- No private key, SMTP secret, signer token, or credential body is logged.

## Residual risks

- Email delivery is at-least-once; a crash after SMTP acceptance can resend.
- Bounce/complaint processing is not implemented.
- Next.js dev streaming returned HTTP 200 with a not-found UI for a cross-student direct access; no data was exposed. Verify production status-code behavior before relying on HTTP status alone.
- Production SMTP, SPF/DKIM/DMARC, and provider reputation remain deployment responsibilities.
