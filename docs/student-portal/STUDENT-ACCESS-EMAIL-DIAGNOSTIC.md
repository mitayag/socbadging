# Student Portal Access and Email Diagnostic

**Date:** 2026-11-02  
**Environment:** Local Docker Compose only  
**External email:** Not configured. Mailpit is the transport.

## 1. Verified routes

| Purpose                          | URL                                                |
| -------------------------------- | -------------------------------------------------- |
| Student login                    | `http://127.0.0.1:3000/login`                      |
| Student activation               | `http://127.0.0.1:3000/student/activate/:token`    |
| Student dashboard                | `http://127.0.0.1:3000/student`                    |
| Student badge wallet             | `http://127.0.0.1:3000/student/badges`             |
| Student credential detail        | `http://127.0.0.1:3000/student/badges/:issuanceId` |
| Student notifications            | `http://127.0.0.1:3000/student/notifications`      |
| Student profile                  | `http://127.0.0.1:3000/student/profile`            |
| Student help                     | `http://127.0.0.1:3000/student/help`               |
| Student recovery request         | `http://127.0.0.1:3000/student/recover`            |
| Student recovery reset           | `http://127.0.0.1:3000/student/recover/:token`     |
| Administrator student management | `http://127.0.0.1:3000/students`                   |
| Mailpit web UI                   | `http://127.0.0.1:8025`                            |

All routes were verified against the running application. Student login uses the shared login page;
STUDENT accounts are redirected to `/student`.

## 2. Account creation and activation

1. Sign in as an Administrator.
2. Open `http://127.0.0.1:3000/students`.
3. Find the student record, expand it, and click **Send Activation Email**.
4. The system creates a SHA-256 token digest, invalidates earlier unused activation tokens, and sends a 24-hour single-use link to the student's registered email.
5. Open `http://127.0.0.1:8025`, locate **Activate your HAU SOC student badge account**, and open the activation link.
6. Choose a password of at least 14 characters and activate the account.
7. Sign in at `http://127.0.0.1:3000/login` with the student's institutional email and password.
8. The student is redirected to `/student` and sees issued badges in the wallet.

Verified locally with `audit-recipient-a@example.test`: the Mailpit activation email was received, the link activated the account, login reached `/student`, and the issued audit badge appeared in the wallet.

## 3. Notification and Mailpit diagnosis

### Containers

- `hau-soc-badging-worker-1` — running and healthy.
- `hau-soc-badging-mailpit-1` — running and healthy.
- Mailpit web: `http://127.0.0.1:8025`.
- Mailpit SMTP: `mailpit:1025` on the Compose network; not published to the host.

### SMTP configuration

- `SMTP_HOST=mailpit`
- `SMTP_PORT=1025`
- `SMTP_SECURE=false`
- `SMTP_FROM=HAU SOC Badging System <badges@example.edu>`
- No SMTP authentication in local development.
- No secrets are printed in this report.

### Notification records

Live local records showed `BADGE_ISSUED` notifications with status `SENT`; no `PENDING`,
`PROCESSING`, `RETRY_SCHEDULED`, or `FAILED` rows were present at diagnosis time. Mailpit captured
the corresponding badge-issued messages. Student activation emails are sent directly through the
same SMTP transport and are therefore captured in Mailpit but do not create
`notification_deliveries` rows.

### Root cause of “students not receiving email”

The local configuration deliberately sends all mail to Mailpit. Mailpit accepts and displays the
messages but does not forward them to external mailboxes. Real student inboxes will receive nothing
until a production SMTP provider is configured. `SENT` means the SMTP transport accepted the
message; it does not prove inbox delivery. The recipient address must also match the student's
registered email.

## 4. Working access instructions

1. Administrator signs in at `http://127.0.0.1:3000/login`.
2. Administrator opens `http://127.0.0.1:3000/students`.
3. Administrator expands the student and clicks **Send Activation Email**.
4. Open `http://127.0.0.1:8025`.
5. Open the activation email and click the activation link.
6. Set the student password and activate.
7. Student signs in at `http://127.0.0.1:3000/login`.
8. Student views `http://127.0.0.1:3000/student` and `http://127.0.0.1:3000/student/badges`.
9. Student opens a badge to download JSON-LD, badge artwork, or the PDF summary and to share the public verification link.
10. If the student loses access, use `http://127.0.0.1:3000/student/recover`; the recovery email appears in Mailpit.

## 5. Remaining defects and limitations

- No external SMTP provider is configured; Mailpit is local-only.
- Bounce/complaint processing is not implemented.
- Activation/recovery emails use direct SMTP rather than the badge-notification outbox.
- Email delivery is at-least-once at the SMTP boundary.
- Production SPF/DKIM/DMARC and provider reputation remain deployment responsibilities.
