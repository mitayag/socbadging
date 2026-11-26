# Production Test Account Creation Plan

**Target:** https://socbadging.hausoc.org  
**Candidate:** `6d2f403c27a9330f25b7b85d3cbea8ae202c2b3f`  
**Status:** Awaiting explicit production-write approval  
**Production changes made:** None

## 1. Phase 1 findings

### Application mechanisms

| Need                       | Existing mechanism                                                                                                                      |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| Administrator provisioning | `bootstrapAdministrator` service with Argon2id `hash(..., {type:2})`; creates ADMIN user when email is absent                           |
| Faculty provisioning       | `createFaculty(adminActor, ...)`; Argon2id hash, `FACULTY` role, audit `faculty.created`                                                |
| Student provisioning       | `createStudent` → `inviteStudentAccount` → `activateStudentAccount(token, password)`; Argon2id, `STUDENT` role, `StudentAccount`, audit |
| Class ownership            | `createClass(facultyActor, ...)`; requires FACULTY owner                                                                                |
| Roster enrollment          | `addStudent(facultyActor, classId, ...)`; requires class owner                                                                          |
| Sessions                   | DB-backed opaque session tokens, hashed at rest, HTTP-only cookie                                                                       |
| Password storage           | Argon2id (`type:2`), minimum 14 characters for faculty/admin provisioning                                                               |

There is no general Administrator-creation UI. A reviewed one-off provisioning script using the
existing `bootstrapAdministrator` service is required, or an authorized operator must create the
account through an approved administrative procedure.

### Existing production test accounts

**BLOCKED / UNVERIFIED.** No production database or Administrator session was available. No account
creation, login attempt, password reset, or account enumeration was performed.

Local database has no matching `test.admin@hausoc.org`, `test.faculty@hausoc.org`, or
`authorized-test-recipient@example.org` accounts.

### Production read-only evidence

| Check              | Result                                                                          |
| ------------------ | ------------------------------------------------------------------------------- |
| `/api/health`      | HTTP 200, database/signer/worker ready                                          |
| `/login`           | HTTP 200                                                                        |
| TLS certificate    | Valid Let's Encrypt certificate for `socbadging.hausoc.org`, expires 2027-02-03 |
| Public status list | HTTP 200, signed proof verified independently                                   |
| Signer key ID      | `staging-2026-11` — review key naming/custody before production claims          |
| Deployed commit    | **BLOCKED** — no version/build attestation available from the running site      |

## 2. Required approval and access

Before any write:

- [x] Written approval to create production test accounts/data — approved.
- [x] Confirmation that production is running candidate `6d2f403...` — confirmed by owner.
- [ ] Approved production host/tools-container access with `DATABASE_URL`, or an existing authorized
      Administrator session — **NOT PROVIDED**; SSH access from this environment was denied.
- [ ] Verified pre-change backups (DB, media, signing key) with checksums and restore evidence —
      **NOT PROVIDED**.
- [x] Approval for test email delivery to `authorized-test-recipient@example.org` — approved, limited to this
      mailbox.
- [x] Confirmation that `test.admin@hausoc.org` and `test.faculty@hausoc.org` are test identities,
      and `authorized-test-recipient@example.org` is the approved external test mailbox, not a real student account.
- [ ] Named operator, test window, and rollback owner — rollback plan prepared; operator/window still
      needed.

## 3. Exact account plan

### 3.1 Administrator

- Email: `test.admin@hausoc.org`
- Name: `STAGEH Test Administrator`
- Role: `ADMIN`
- Status: `ACTIVE`
- Password: 36 random bytes, base64url, stored outside source control.
- Mechanism: reviewed one-off script using `bootstrapAdministrator` with Argon2id and audit record
  `ADMIN_BOOTSTRAPPED`, or approved manual provisioning.
- If the email already exists:
  - If role is ADMIN and the password is available in the approved secret store, reuse.
  - Otherwise STOP. Do not reset or modify an existing account without explicit approval.

### 3.2 Faculty

- Email: `test.faculty@hausoc.org`
- Name: `STAGEH Test Faculty`
- Role: `FACULTY`
- Employee ID: `STAGEH-FAC-001`
- Title: `STAGEH Temporary Test Account`
- Password: 36 random bytes, base64url, stored outside source control.
- Mechanism: `createFaculty(testAdminActor, ...)`; Argon2id; audit `faculty.created`.
- If exists and role is FACULTY, reuse only with approved credentials; otherwise STOP.

### 3.3 Student

- Email: `authorized-test-recipient@example.org`
- Student number: `STAGEH-STU-001`
- Name: `STAGEH Test Student`
- Role: `STUDENT`
- Password: 36 random bytes, base64url, stored outside source control.
- Mechanism:
  1. `createStudent(testAdminActor, ...)`
  2. `inviteStudentAccount(testAdminActor, studentId)`
  3. `activateStudentAccount(token, generatedPassword)` immediately, without sending email.
- This creates the Student, STUDENT user, StudentAccount, activation token (consumed), and audit
  records without live email.
- If any conflicting account/student exists, STOP and review.

### 3.4 Isolated test class

- Course code: `STAGEH-ISO-001`
- Title: `STAGEH Automated Testing — Isolated`
- Section: `STAGEH`
- Term: `STAGEH`
- Academic year: `2026-2027`
- Owner: `test.faculty@hausoc.org`
- Description: `Isolated automated end-to-end testing class. Do not use for real students.`
- Mechanism: `createClass(testFacultyActor, ...)`.
- Enroll `authorized-test-recipient@example.org` via `addStudent(testFacultyActor, classId, ...)`.
- No real class, roster, or student is modified.

### 3.5 Test badge

Create during the test run, not during account provisioning:

- Name: `STAGEH Automated Test Badge`
- Criteria: `Automated isolated test credential`
- Image: approved local test artwork
- Issued only to `authorized-test-recipient@example.org` in the isolated class.

## 4. Secure password handling

- Generate with a cryptographically secure source (e.g., `openssl rand -base64 36`).
- Store in an approved password manager or a host secret file outside the repository, mode `0600`.
- Never print, log, screenshot, commit, or send passwords in chat.
- Playwright reads credentials from environment/secret files at runtime.
- Clear temporary password files after the approved test window.
- Test accounts should be disabled, not deleted, after testing unless removal is approved.

## 5. Provisioning sequence (after approval)

1. Take and verify DB/media/signing-key backups.
2. Run read-only discovery for the three emails/class/student number.
3. Generate passwords into the approved secret store.
4. Provision Administrator (if absent).
5. Provision Faculty through the approved service/script.
6. Provision Student through create → invite → activate without email.
7. Create isolated class and enroll the test student.
8. Record created IDs, audit IDs, timestamps, and operator.
9. Verify all three accounts authenticate and reach correct dashboards.
10. Only then run the approved Playwright production suite.

## 6. Rollback

- Disable/suspend the three test users and archive the isolated class.
- Do not delete accounts, credentials, audit logs, or issued test credentials without approval.
- If data corruption occurs, restore from the verified pre-change backup under an approved incident
  procedure.
- Test-created credentials must be revoked, not deleted, to preserve history.

## 7. Approval gate

**No production write may occur until the approvals/access in section 2 are confirmed.**
