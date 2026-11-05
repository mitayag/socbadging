# Stage 2 Report — Student Badge Portal

## Implemented

- `STUDENT` role added without granting Faculty/Administrator privileges.
- Additive `StudentAccount` and `StudentToken` persistence.
- Invitation-based activation from Administrator `/students`.
- Login redirects STUDENT users to `/student`.
- Recovery request and single-use password reset.
- Suspended/disabled student sessions invalidated.
- Student dashboard:
  - earned, active, expired, revoked counts,
  - recent credentials,
  - empty/loading/error states.
- Wallet:
  - all credentials for the authenticated student,
  - search and status filter,
  - badge artwork, title, description, issuer, class, issue/expiration date, status, public link.
- Credential detail:
  - achievement criteria, skills/alignments,
  - issuer and dates,
  - cryptographic verification result,
  - public verification link,
  - JSON-LD, badge image, and PDF downloads,
  - copy/share controls.
- Notifications:
  - recipient-scoped issuance notification history,
  - safe transport statuses and SENT semantics,
  - no other recipients' notifications.
- Profile:
  - name, student number, verified email, account status,
  - link to account security/password change,
  - support contact.
- Help page.
- Administrator student account page with invite, suspend, and reactivate.
- Staff authorization guards updated so STUDENT cannot read classes, rosters, issuances, batches, dashboards, or notifications.

## Database impact

Migration: `prisma/migrations/20261101180000_student_portal`.

Adds:

- `Role.STUDENT`
- `student_accounts`
- `student_tokens`
- `notification_deliveries.badge_image_url`
- `notification_deliveries.expires_at`
- `notification_deliveries.resend_count`
- `notification_deliveries.last_resend_at`

Rollback considerations:

- Drop the new tables/columns only after confirming no STUDENT users or student tokens exist.
- Removing the STUDENT enum value requires ensuring no `users.role = 'STUDENT'` rows remain.
- Existing students, classes, enrollments, issuances, credentials, and audit history are preserved.

## Test evidence

- Unit: 110 files / 779 tests PASS.
- Integration: 17 files / 112 tests PASS.
- E2E: 43 passed, 3 skipped, 0 failed.
- Migration parity: no difference between the migrated test database and Prisma schema.
- Live local browser verification with an isolated audit student account.

## Outstanding defects

- Mobile activation/recovery/resend E2E flows are skipped because their fixtures are single-use; desktop coverage is complete.
- No student email preferences or unsubscribe flow.
- No student account deletion UI; suspend/reactivate is supported.
- No wallet API/OAuth interoperability.
