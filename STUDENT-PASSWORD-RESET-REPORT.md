# Dual-Method Student Password Reset — Report

**Date:** 3 November 2026  
**Status:** COMPLETE  
**Environment:** Local development only  
**Deployment:** Not performed; no commit, push, or merge

## 1. TODO completion

- [x] Audited Student Portal authentication, password hashing, sessions, recovery tokens, and email delivery.
- [x] Reused the existing Argon2id hashing, recovery-token, rate-limit, audit, and Mailpit/Brevo email infrastructure.
- [x] Added reset actions to Administrator → Student Accounts and Faculty → Class → Student Roster.
- [x] Added direct password reset with new/confirm fields, show/hide, 14-character policy, actor reauthentication, and a final confirmation dialog.
- [x] Added email reset-link flow with masked email, confirmation, 30-minute single-use token, and delivery feedback.
- [x] Enforced Administrator-any-active-student and Faculty-owned-class-enrollment authorization on the server.
- [x] Added mandatory password change at next login with a forced change page and proxy enforcement.
- [x] Invalidated sessions and outstanding recovery/activation tokens on direct reset.
- [x] Recorded direct resets, link requests, and completed forced changes in Audit Logs.
- [x] Added integration, proxy, login-route, and Playwright coverage.
- [x] Verified the live Mailpit email reset flow end to end.
- [x] Ran format, lint, typecheck, unit, integration, production build, and Playwright.

## 2. Files modified / created

### Schema and authentication

- `prisma/schema.prisma`
- `prisma/migrations/20261103170000_user_must_change_password/migration.sql` (new)
- `src/modules/identity/types.ts`
- `src/modules/identity/services/authenticate.ts`
- `src/modules/identity/repositories/prisma-authentication-repository.ts`
- `src/modules/identity/services/current-actor.ts`
- `src/app/api/auth/login/route.ts`
- `src/components/auth/login-form.tsx`
- `src/proxy.ts`

### Password reset service and actions

- `src/modules/student/services/student-account-service.ts`
- `src/app/students/password-actions.ts` (new)
- `src/app/student/change-password/page.tsx` (new)
- `src/app/student/change-password/actions.ts` (new)

### UI

- `src/components/student/student-password-reset-dialog.tsx` (new)
- `src/components/student/student-row-actions.tsx`
- `src/app/students/page.tsx`
- `src/components/rosters/roster-row-actions.tsx`
- `src/app/classes/[classId]/students/page.tsx`
- `src/modules/rosters/services/roster-service.ts`
- `src/app/globals.css`

### Audit and dashboard

- `src/modules/audit/services/audit-log-service.ts`
- `src/modules/dashboard/services/dashboard-service.ts`

### Tests

- `src/modules/student/services/student-account-service.integration.test.ts`
- `src/proxy.test.ts`
- `src/app/api/auth/login/route.test.ts`
- `e2e/password-reset.spec.ts` (new)
- `e2e/global-setup.ts` (disposable reset-student fixtures)

### Screenshot

- `docs/screenshots/student-password-reset-dialog.png`

## 3. Direct password reset

- Available from Administrator → Student Accounts and Faculty → Class → Student Roster.
- Only shown for ACTIVE portal accounts. Suspended/deactivated accounts must be reactivated first; non-activated students use the existing Invite/Activation workflow.
- Actor reauthentication is required: the Administrator/Faculty enters their own current password.
- New password and confirmation are validated client-side and server-side against the 14–200 character policy.
- Show/Hide password toggle is available.
- A final confirmation dialog summarizes the sensitive action before submission.
- The server:
  - verifies the actor is an active Administrator or Faculty member;
  - verifies Faculty have an ACTIVE enrollment in a class they own;
  - verifies the student has an active StudentAccount with a STUDENT user;
  - verifies the actor's current password with Argon2;
  - hashes the new password with the application's Argon2id mechanism;
  - updates only that StudentAccount user;
  - sets `mustChangePassword = true`;
  - increments `sessionVersion` and deletes all sessions;
  - marks all unused student tokens used;
  - writes the immutable `student.password_reset_direct` audit record.
- The student is redirected to `/student/change-password` after login. The proxy blocks all other student pages until the forced change is complete. The change requires the temporary password and a new password, invalidates all sessions, clears the flag, and writes `student.password_changed`.
- No plaintext password is logged, emailed, persisted, or returned in an error. Login responses are `Cache-Control: private, no-store`.

## 4. Email password reset

- The reset dialog displays the masked registered email.
- A confirmation dialog is shown before sending.
- The server verifies the same scope and active-account eligibility as direct reset.
- It generates a cryptographically random token, stores only its SHA-256 hash, and expires it after 30 minutes.
- Previous outstanding recovery tokens are invalidated when a new link is created.
- The reset request is rate-limited and audited as `student.password_reset_link_requested`.
- The email is sent through the existing student-account email service, which uses Brevo SMTP or Mailpit according to the configured delivery mode.
- The UI reports that the link was requested without claiming inbox delivery.
- The existing `/student/recover/[token]` flow completes the reset: it validates the single-use, unexpired token, requires an ACTIVE student, hashes the new password, clears `mustChangePassword`, deletes sessions, marks outstanding tokens used, and audits `student.password_reset`.
- Automated E2E runs do not send external mail. The live local Mailpit flow was verified end to end.

## 5. Authorization enforcement

- Administrator: can reset any student with an active StudentAccount.
- Faculty: can reset only students with an ACTIVE enrollment in a class they own. The specific roster class is checked when the action is initiated from the roster.
- Unauthorized Faculty receive an authorization error from the service, not just a hidden UI control.
- Non-activated students are rejected from direct/email reset and directed to the activation workflow.
- Suspended, inactive, or deleted portal accounts are rejected, preventing a reset from bypassing account restrictions.
- StudentAccount.studentId ownership and issued credential records are unchanged.
- No duplicate StudentAccount is created.

## 6. Security controls

- Argon2id password hashing.
- Actor reauthentication for direct reset.
- 14–200 character password policy.
- Forced password change at next login.
- Session invalidation and `sessionVersion` increment.
- Outstanding reset/activation token invalidation.
- 30-minute single-use, hashed reset tokens.
- Rate limiting on reset actions.
- Immutable audit records for initiation, direct reset, and completion.
- No plaintext or hash exposure in UI, logs, or responses.
- Server-side authorization and parameter validation.
- `Cache-Control: private, no-store` on login responses; server actions use POST and dynamic pages.

## 7. Test results

| Check                                 | Result                                                    |
| ------------------------------------- | --------------------------------------------------------- |
| Format                                | PASS                                                      |
| Lint                                  | PASS                                                      |
| Typecheck                             | PASS                                                      |
| Unit tests                            | PASS — 115 files, 845 tests                               |
| Integration tests (clean migrated DB) | PASS — 19 files, 136 tests                                |
| Production build                      | PASS                                                      |
| Playwright desktop                    | PASS — 29 passed                                          |
| Playwright mobile                     | PASS — 28 passed, 1 skipped                               |
| Live Mailpit email reset              | PASS — link delivered, reset completed, student signed in |
| Live direct reset UI                  | Covered by Playwright; dialog rendered live               |

The integration suite covers direct reset, Faculty scope, unauthorized Faculty, suspended/deactivated rejection, token expiry/single-use, previous-token invalidation, forced change, session invalidation, and audit records.

The Playwright suite covers Administrator direct reset, email link UI/feedback, forced change login flow, old-password rejection, badge access after reset, and Faculty direct reset for an assigned student on desktop and mobile.

## 8. Remaining issues / risks

- Direct/email reset is intentionally limited to ACTIVE portal accounts. Suspended or deactivated students must be reactivated first; non-activated students use the activation invitation workflow.
- The application currently has no refresh-token model. Sessions are deleted and `sessionVersion` is incremented; future refresh-token support must revoke those tokens in this flow.
- Email delivery status means the SMTP provider accepted the message; it does not prove inbox delivery. The UI wording reflects this.
- Direct reset requires the Administrator/Faculty current password; there is no separate MFA challenge.
- Rate limits use the existing shared fixed-window limiter; the combined Playwright invocation retains the pre-existing rate-limit determinism caveat.
- The live database migration `20261103170000_user_must_change_password` was applied locally. No database reset or record deletion was performed.
- The local live student account password remains a local test credential and is not recorded in this repository; rotate it before any shared or production use.
