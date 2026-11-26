# Stage H Test Account Provisioning

**Date:** 24 November 2026  
**Production:** https://socbadging.hausoc.org  
**Status:** Prepared and locally validated — not executed against production  
**Production changes:** None

## 1. Account model and provisioning services reviewed

| Role          | Existing mechanism                                                                 |
| ------------- | ---------------------------------------------------------------------------------- |
| Administrator | `bootstrapAdministrator` with Argon2id and `ADMIN_BOOTSTRAPPED` audit              |
| Faculty       | `createFaculty(adminActor, ...)` with Argon2id and `faculty.created` audit         |
| Student       | `createStudent` → `inviteStudentAccount` → `activateStudentAccount`; no email sent |
| Class         | `createClass(facultyActor, ...)`; faculty owner                                    |
| Roster        | `addStudent(facultyActor, classId, ...)`                                           |

No real account is modified by the scripts. They use the same services and password hashing as the
application.

## 2. Exact test identities

| Role          | Email                                   | Name                                | Identifier       |
| ------------- | --------------------------------------- | ----------------------------------- | ---------------- |
| Administrator | `test.admin@hausoc.org`                 | STAGEH Test Administrator           | n/a              |
| Faculty       | `test.faculty@hausoc.org`               | STAGEH Test Faculty                 | `STAGEH-FAC-001` |
| Student       | `authorized-test-recipient@example.org` | STAGEH Test Student                 | `STAGEH-STU-001` |
| Class         | n/a                                     | STAGEH Automated Testing — Isolated | `STAGEH-ISO-001` |

`authorized-test-recipient@example.org` is the only permitted outgoing recipient. Provisioning sends no email.

If any identity/class already exists, the script stops. No reset, overwrite, or reuse occurs.

## 3. Artifacts

```text
scripts/provision-stageh-test-accounts.ts
scripts/cleanup-stageh-test-accounts.ts
playwright.production.config.ts
e2e/production/stageh-credentials.ts
e2e/production/stageh-acceptance.spec.ts
```

### Security properties

- Passwords are generated with 36 random bytes and written only to a mode-600 credentials file
  outside the repository.
- Passwords/tokens are never printed by the scripts.
- The provisioning script refuses to overwrite an existing credentials file unless
  `STAGEH_REPLACE_CREDENTIALS=YES`.
- No email service is imported or called during provisioning/cleanup.
- Cleanup suspends accounts and archives the class; it does not delete users, students, class
  history, credentials, or audit records.

## 4. Local validation

Validated against disposable local test data only:

| Check                                      | Result                                                                  |
| ------------------------------------------ | ----------------------------------------------------------------------- |
| Provisioning script TypeScript compilation | PASS                                                                    |
| Local provisioning                         | PASS — admin, faculty, student, class, roster                           |
| Credentials file created mode 600          | PASS                                                                    |
| Passwords printed                          | NO                                                                      |
| Email sent                                 | NO                                                                      |
| Cleanup script                             | PASS — all three accounts SUSPENDED, class ARCHIVED                     |
| Account/class deletion                     | NO                                                                      |
| Audit records                              | `stageh.test_account_disabled` and `stageh.test_class_archived` created |
| Production Playwright config loads         | PASS — 8 tests listed                                                   |
| Production public Playwright checks        | **2 passed** (desktop/mobile)                                           |

Local test credentials were removed after validation.

## 5. Production provisioning command

The following is for the authorized operator, after backup and test-write approval. It does not
restart services or run migrations.

```sh
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
ENV_FILE=/etc/hau-soc/production.env
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
STAGEH_DIR=/var/tmp/stageh-$STAMP

# Transfer the provisioning script and static runner files to the host staging directory.
scp scripts/provision-stageh-test-accounts.ts <approved-admin>@badging-server:/tmp/
ssh <approved-admin>@badging-server \
  "sudo install -d -m 700 -o 1001 -g 1001 '$STAGEH_DIR' && sudo mv /tmp/provision-stageh-test-accounts.ts '$STAGEH_DIR/'"

# Run through the existing tools image. The entrypoint loads DATABASE_URL from the secret.
docker compose --profile tools -p "$PROD_PROJECT" --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" run --rm --no-deps \
  -v "$STAGEH_DIR/provision-stageh-test-accounts.ts:/app/scripts/provision-stageh-test-accounts.ts:ro" \
  -v "$STAGEH_DIR:/secure-stageh" \
  -e NODE_OPTIONS=--conditions=react-server \
  -e STAGEH_PROVISION_APPROVED=YES \
  -e STAGEH_BASE_URL=https://socbadging.hausoc.org \
  -e STAGEH_CREDENTIAL_FILE=/secure-stageh/stageh-credentials.json \
  seed ./node_modules/.bin/tsx scripts/provision-stageh-test-accounts.ts
```

Expected output (no passwords):

```json
{
  "status": "PASS",
  "scope": "STAGEH",
  "adminEmail": "test.admin@hausoc.org",
  "facultyEmail": "test.faculty@hausoc.org",
  "studentEmail": "authorized-test-recipient@example.org",
  "classId": "...",
  "studentId": "...",
  "credentialsFile": "/secure-stageh/stageh-credentials.json",
  "emailSent": false
}
```

Secure handoff to Playwright:

The credentials file is mode 600 owned by container UID 1001. Copy it through a temporary
admin-owned file; do not loosen the original permissions:

```sh
mkdir -p "$HOME/.config/hau-soc-badging"
chmod 700 "$HOME/.config/hau-soc-badging"
ssh <approved-admin>@badging-server \
  "sudo cp '$STAGEH_DIR/stageh-credentials.json' /tmp/stageh-credentials.json && sudo chown \$(id -u):\$(id -g) /tmp/stageh-credentials.json && sudo chmod 600 /tmp/stageh-credentials.json"
scp <approved-admin>@badging-server:/tmp/stageh-credentials.json \
  "$HOME/.config/hau-soc-badging/stageh-credentials.json"
ssh <approved-admin>@badging-server 'rm -f /tmp/stageh-credentials.json'
chmod 600 "$HOME/.config/hau-soc-badging/stageh-credentials.json"
```

Do not print or commit the credentials file.

## 6. Production-safe Playwright execution

```sh
STAGEH_BASE_URL=https://socbadging.hausoc.org \
STAGEH_CREDENTIALS_FILE="$HOME/.config/hau-soc-badging/stageh-credentials.json" \
npx playwright test --config=playwright.production.config.ts
```

The config excludes the destructive local global setup, does not seed/truncate databases, and does not
run migrations or start a web server. It covers:

- public health/issuer/key/status-list readiness;
- Administrator login, dashboard, Faculty/Student/Classes/Audit pages, logout;
- Faculty login, assigned classes, Administrator denial;
- Student login, dashboard, My Badges, staff-route denial, ownership/export denial.

Badge issuance/revocation and Brevo delivery are not automated in this read-only suite; they remain
separately authorized operator tests against isolated test records.

If credentials are absent, authenticated tests skip; public tests still run.

## 7. Cleanup command

```sh
# Transfer cleanup script to the same STAGEH_DIR first.
docker compose --profile tools -p "$PROD_PROJECT" --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" run --rm --no-deps \
  -v "$STAGEH_DIR/cleanup-stageh-test-accounts.ts:/app/scripts/cleanup-stageh-test-accounts.ts:ro" \
  -v "$STAGEH_DIR:/secure-stageh" \
  -e NODE_OPTIONS=--conditions=react-server \
  -e STAGEH_CLEANUP_APPROVED=YES \
  -e STAGEH_CREDENTIAL_FILE=/secure-stageh/stageh-credentials.json \
  seed ./node_modules/.bin/tsx scripts/cleanup-stageh-test-accounts.ts
```

Expected: all three accounts `SUSPENDED`, class `ARCHIVED`, audit records created, no deletion. Then
securely remove the production/local credentials files after evidence capture.

## 8. Required approvals and blockers

- [ ] Production test-account write approval for the exact STAGEH identities.
- [ ] Current DB/media backup evidence before provisioning.
- [ ] Signing-key recovery evidence or explicit residual-risk acceptance.
- [ ] Named operator/window/rollback owner.
- [ ] Separate approval for badge issuance/revocation and Brevo pilot.

**Production provisioning: BLOCKED pending approved administrative execution.**  
**Local provisioning/cleanup and production-safe config: PASS.**

No production account, class, email, badge, or credential was created.
