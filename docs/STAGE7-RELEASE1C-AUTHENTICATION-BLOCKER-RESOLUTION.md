# Stage 7 Release 1C — Authentication Blocker Resolution

**Date:** 28 November 2026
**Authorization:** dedicated production test accounts approved for Release 1C/1D verification
**Status:** resolved; acceptance completed; accounts retired

## 1. Blocker

Release 1B ended with a conditional GO because no authorized production credentials existed for the required authenticated smoke tests. No `STAGEH_CREDENTIALS_FILE` was present locally or on production, and no approved admin/faculty/student test credentials had been supplied.

## 2. Safest supported provisioning method

The repository already contains a production provisioning pattern (`scripts/provision-stageh-test-accounts.ts`) that creates isolated identities without sending email. For Release 1C a dedicated script was added:

`scripts/provision-stage7-test-accounts.ts`

It uses the application's data model directly through Prisma (not a bypass of authentication or authorization), Argon2id password hashing (`type: 2`), and writes application audit rows. It refuses to run unless:

- `STAGE7_PROVISION_APPROVED=YES`
- `STAGE7_CREDENTIAL_FILE` is an absolute path outside the repository
- no target identity, student number, employee ID or test course code already exists

The script runs with the deployed production code, reads the database secret at runtime, uses a single pooled connection, and never prints passwords.

## 3. Accounts created

| Role          | Email                              | Test identifier           |
| ------------- | ---------------------------------- | ------------------------- |
| Administrator | `stage7.test.admin@hausoc.org`     | STAGE7 Test Administrator |
| Faculty A     | `stage7.test.faculty.a@hausoc.org` | `STAGE7-FAC-A`            |
| Faculty B     | `stage7.test.faculty.b@hausoc.org` | `STAGE7-FAC-B`            |
| Student A     | `stage7.test.student.a@hausoc.org` | `STAGE7-STU-A`            |
| Student B     | `stage7.test.student.b@hausoc.org` | `STAGE7-STU-B`            |

Passwords were 36 random bytes encoded as base64url, unique per account, and were not printed. Accounts were clearly labelled "STAGE7 Test ..." and are not linked to real faculty or students.

Test classes: `STAGE7-CAP-001` sections `A` and `B`, each owned by the corresponding faculty, with the matching student enrolled. The classes deliberately share a course code so the migration creates one standardized course and both sections can share a badge.

## 4. Safeguards verified

- Existing administrator, faculty and student accounts were not modified and no passwords were reset.
- No account creation, activation or reset email was sent (`notification_deliveries` stayed at 4).
- No credentials were issued.
- No authentication/authorization controls were bypassed.
- Provisioning was recorded in `audit_logs` (`ADMIN_BOOTSTRAPPED`, `faculty.created`, `class.created`, `student.created`, `student.account_activated`, `roster.student_added`, `stage7.test_accounts_provisioned`).
- No duplicate accounts were created; the script aborts if any target exists.

## 5. Credentials file

### Stage H-compatible schema

`e2e/production/stageh-credentials.ts` requires:

```json
{
  "baseUrl": "...",
  "scope": "STAGEH",
  "admin": { "email": "...", "password": "..." },
  "faculty": { "email": "...", "password": "..." },
  "student": { "email": "...", "password": "..." },
  "class": { "id": "...", "courseCode": "..." }
}
```

The generated file kept that exact shape (`scope: "STAGEH"`) and added a `stage7` extension with faculty B, student B, both classes, the course and the test badge name. The existing Stage H spec therefore loads it unchanged, while the Stage 7 acceptance spec uses the extension.

### Handling

- Stored outside the repository (`/var/folders/.../opencode/stage7c-prod/credentials.json`).
- Directory mode `0700`, file mode `0600`.
- Transferred from production over the authorized SSH channel.
- Production copy deleted immediately after transfer.
- Local copy deleted with overwrite (`rm -P`) after acceptance.
- Never printed, committed, screenshotted or included in CI artifacts.

## 6. Baseline authenticated verification (before deployment)

The initial run exposed two stale Stage H test assumptions, not application defects:

- `getByText(courseCode)` was ambiguous because the class dialog headings also contain the code.
- Staff routes redirect non-admins to `/dashboard` (server-side) instead of returning 403/404; the test asserted the old behavior.

The production spec was updated to use a scoped locator and assert the redirect/heading behavior. After the fix, the authenticated baseline passed **8/8** on desktop and mobile against the then-current production release (`4eb403f`): admin dashboard/management/logout, faculty classes and admin denial, student portal and ownership/staff denial.

## 7. Outcome

The authentication blocker is resolved. Dedicated test identities were created, used for authenticated deployment verification and Stage 7 acceptance, and then suspended. No waiver of authenticated acceptance was required.

Evidence: `docs/evidence/stage7-release1c/`, `docs/STAGE7-RELEASE1C-PRODUCTION-DEPLOYMENT-REPORT.md`, `docs/STAGE7-RELEASE1C-PRODUCTION-ACCEPTANCE-REPORT.md`.
