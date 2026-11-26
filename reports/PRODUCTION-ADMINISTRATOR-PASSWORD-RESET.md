# Production Administrator Password Reset

> **Updated:** The production reset script is now self-contained and does not import local `src/`
> modules. Use the latest one-command execution block; the earlier module-import command is
> superseded. The deployed `seed` image uses the older `User` schema without `deletedAt`.

**Date:** 24 November 2026  
**Production:** https://socbadging.hausoc.org  
**Host/project:** `badging-server` / `hau_soc_badging_stage2`  
**Status:** Prepared and locally validated — **not executed against production**  
**Production changes in this preparation:** None

## 1. Scope and safety boundary

This procedure resets the password of the existing production Administrator identified by the
configured `BOOTSTRAP_ADMIN_EMAIL`. It does not create, delete, suspend, or change the role of any
account. It does not change badges, classes, credentials, signing keys, SMTP credentials, database
schema, or running service containers. No migration or service restart is part of the procedure.

The reset is performed by a one-shot `tools`/`seed` container using `docker compose run --rm
--no-deps --no-build`. The existing web, worker, db, signer, and migrate containers are not restarted.

## 2. Code review summary

| Area                                 | Existing mechanism                                               | Reused                                                                         |
| ------------------------------------ | ---------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Password hashing                     | Argon2id via `hash(password, { type: 2 })`                       | Yes                                                                            |
| Password policy                      | Minimum 14, maximum 200 characters                               | Yes                                                                            |
| Session invalidation                 | Delete all `sessions` rows and increment `sessionVersion`        | Yes                                                                            |
| Reset-token invalidation             | Delete `password_reset_tokens` for the account                   | Yes                                                                            |
| Audit                                | Append-only `audit_logs` entry                                   | Yes                                                                            |
| Account identity                     | `users.id` + `normalized_email` + `role=ADMIN` + `status=ACTIVE` | Enforced                                                                       |
| Existing Administrator reset service | None existed                                                     | Added a narrowly scoped operator service following the existing reset patterns |

Added files:

- `src/modules/identity/services/administrator-password-reset.ts`
- `src/modules/identity/services/administrator-password-reset.test.ts`
- `scripts/reset-production-administrator-password.ts`

Updated:

- `src/modules/audit/services/audit-log-service.ts` — adds `administrator.password_reset` to the
  sensitive audit action list.
- `src/modules/audit/services/audit-log-service.test.ts` — asserts the new action is registered.
- `scripts/provision-stageh-test-accounts.ts` — removes an unused import so repository lint passes.

The reset service updates only `passwordHash` and `sessionVersion` on the exact target row. It deletes
only that user's sessions and reset tokens, and writes one audit row with `actorUserId = null` because
the operator is not a database user. It does not expose the password through its return value.

## 3. Identify the configured Administrator email

**SERVER — read-only**

```sh
# SERVER — root@badging-server
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
ENV_FILE=/etc/hau-soc/production.env

BOOTSTRAP_EMAIL=$(sed -n 's/^BOOTSTRAP_ADMIN_EMAIL=//p' "$ENV_FILE")
test -n "$BOOTSTRAP_EMAIL" || { echo "BOOTSTRAP_ADMIN_EMAIL is missing"; exit 1; }
printf 'BOOTSTRAP_ADMIN_EMAIL=%s\n' "$BOOTSTRAP_EMAIL"
```

Do not print the rest of `production.env`.

## 4. Confirm the Administrator exists and is active

**SERVER — read-only**

```sh
# SERVER — root@badging-server
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  email="$1"
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT id, email, role, status, deleted_at
    FROM users
    WHERE normalized_email = LOWER('\''$email'\'') AND role = '\''ADMIN'\'';
  "
' sh "$BOOTSTRAP_EMAIL"
```

**Expected:** exactly one row with `role=ADMIN`, `status=ACTIVE`, `deleted_at=NULL`. Record the `id`
as the target user ID.

**Stop** if there are zero rows, multiple rows, a non-`ADMIN` role, a non-`ACTIVE` status, or a
non-null `deleted_at`.

## 5. Explicit operator preflight before reset

Set the target values in the server shell. The target email must equal `BOOTSTRAP_ADMIN_EMAIL`; the
script independently rechecks this and also requires the exact user ID.

```sh
# SERVER — root@badging-server
ADMIN_RESET_TARGET_EMAIL="$BOOTSTRAP_EMAIL"
ADMIN_RESET_TARGET_USER_ID='<id from step 4>'
```

Required approval gate: do not continue until the operator has explicitly approved this reset for
this target and window. The script refuses to run unless `ADMIN_RESET_APPROVED=YES`.

## 6. Transfer and execute the one-time script

**MAC**

```sh
# MAC — repository root
scp scripts/reset-production-administrator-password.ts root@badging-server:/tmp/
```

**SERVER**

```sh
# SERVER — root@badging-server
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
ENV_FILE=/etc/hau-soc/production.env
RESET_DIR=/var/tmp/admin-password-reset-$(date -u +%Y%m%dT%H%M%SZ)

BOOTSTRAP_EMAIL=$(sed -n 's/^BOOTSTRAP_ADMIN_EMAIL=//p' "$ENV_FILE")
test -n "$BOOTSTRAP_EMAIL" || { echo "BOOTSTRAP_ADMIN_EMAIL is missing"; exit 1; }

sudo install -d -m 700 -o 1001 -g 1001 "$RESET_DIR"
sudo install -m 600 -o 1001 -g 1001 \
  /tmp/reset-production-administrator-password.ts "$RESET_DIR/"

ADMIN_RESET_TARGET_EMAIL="$BOOTSTRAP_EMAIL"
ADMIN_RESET_TARGET_USER_ID='<id from step 4>'

docker compose --profile tools -p "$PROD_PROJECT" --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" run --rm --no-deps --no-build \
  -v "$RESET_DIR/reset-production-administrator-password.ts:/app/scripts/reset-production-administrator-password.ts:ro" \
  -v "$RESET_DIR:/secure-admin-reset" \
  -e NODE_OPTIONS=--conditions=react-server \
  -e ADMIN_RESET_APPROVED=YES \
  -e ADMIN_RESET_TARGET_EMAIL="$ADMIN_RESET_TARGET_EMAIL" \
  -e ADMIN_RESET_TARGET_USER_ID="$ADMIN_RESET_TARGET_USER_ID" \
  -e ADMIN_RESET_CREDENTIAL_FILE=/secure-admin-reset/admin-reset-credentials.json \
  seed ./node_modules/.bin/tsx scripts/reset-production-administrator-password.ts
```

`BOOTSTRAP_ADMIN_EMAIL` is already supplied to the `seed` service by the production Compose
configuration. The script compares it to `ADMIN_RESET_TARGET_EMAIL` before any reset.

**Expected output — no password is printed:**

```json
{
  "status": "TARGET_CONFIRMED",
  "targetEmail": "<bootstrap-admin-email>",
  "targetUserId": "<admin-user-id>",
  "role": "ADMIN",
  "accountStatus": "ACTIVE"
}
```

then:

```json
{
  "status": "PASS",
  "targetEmail": "<bootstrap-admin-email>",
  "targetUserId": "<admin-user-id>",
  "sessionsInvalidated": 1,
  "auditAction": "administrator.password_reset",
  "credentialsFile": "/secure-admin-reset/admin-reset-credentials.json",
  "passwordPrinted": false
}
```

The new password is written only to
`/secure-admin-reset/admin-reset-credentials.json` (mode 600, owned by container UID 1001). It is not
printed, not passed as a command argument, and not stored in this report or source control. The file
is written before the database update so a successful reset cannot lose the generated password. If
the reset does not complete, the script removes the unapplied credentials file automatically.

## 7. Secure credential handoff

The credentials file contains the new password. Retrieve it without printing it.

**MAC**

```sh
# MAC
export RESET_DIR=/var/tmp/admin-password-reset-<UTC timestamp from step 6>
mkdir -p "$HOME/.config/hau-soc-badging"
chmod 700 "$HOME/.config/hau-soc-badging"
ssh root@badging-server \
  "sudo cp '$RESET_DIR/admin-reset-credentials.json' /tmp/admin-reset-credentials.json && sudo chown \$(id -u):\$(id -g) /tmp/admin-reset-credentials.json && sudo chmod 600 /tmp/admin-reset-credentials.json"
scp root@badging-server:/tmp/admin-reset-credentials.json \
  "$HOME/.config/hau-soc-badging/admin-reset-credentials.json"
ssh root@badging-server 'rm -f /tmp/admin-reset-credentials.json'
chmod 600 "$HOME/.config/hau-soc-badging/admin-reset-credentials.json"
```

Do not print, screenshot, or commit the file. Use a password manager or a secure editor to read the
single password value when signing in. After the handoff, remove the temporary credentials file from
both locations once the Administrator has stored the password securely.

## 8. Verification

### 8.1 Database and audit checks

**SERVER — read-only**

```sh
# SERVER — root@badging-server
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml
ADMIN_RESET_TARGET_USER_ID='<id from step 4>'

docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  user_id="$1"
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT id, role, status, deleted_at FROM users WHERE id = '\''$user_id'\'';
    SELECT COUNT(*) FROM sessions WHERE user_id = '\''$user_id'\'';
    SELECT id, action, entity_type, entity_id, created_at
    FROM audit_logs
    WHERE action = '\''administrator.password_reset'\'' AND entity_id = '\''$user_id'\''
    ORDER BY created_at DESC LIMIT 1;
  "
' sh "$ADMIN_RESET_TARGET_USER_ID"
```

**Expected:**

- user remains `ADMIN`, `ACTIVE`, `deleted_at=NULL`;
- sessions count is `0` immediately after the reset (before the verification login);
- exactly one new `administrator.password_reset` audit row for the target user.

### 8.2 Production login verification

Open `https://socbadging.hausoc.org/login` in a browser. Sign in with the target Administrator email
and the password from the local mode-600 credentials file. Verify the Administrator dashboard and at
least one Administrator-only page load, then sign out. Do not paste the password into a terminal,
screenshot, ticket, or chat.

**Expected:** login succeeds and the account still has Administrator access. The verification login
creates a new session; if you need a zero-session check, run the session count before signing in.

## 9. Rollback and recovery

This procedure does not retain the old password hash. That is intentional: storing or restoring the
old credential would increase exposure. The safe rollback is another controlled reset, not a database
restore.

- **Abort before `PASS`:** no committed password change should exist. The script removes the
  unapplied credentials file automatically; verify it is absent and remove the temporary script
  directory. Investigate the reported error and obtain approval before retrying.
- **`PASS` but login fails:** do not restore the database or restart containers. Re-run the same
  script for the same target with a fresh approval and
  `ADMIN_RESET_REPLACE_CREDENTIALS=YES`; it generates a new password and writes a new mode-600
  credentials file. Each reset appends its own audit row.
- **Wrong target suspected:** stop immediately. The script requires the exact user ID and the
  configured bootstrap email, so a mismatch aborts before the update. Review the audit rows and reset
  only the correct Administrator under a new approval.
- **Sessions remain after reset:** investigate before logging in. The reset service deletes all
  sessions for the target inside the same transaction as the password update.
- **Audit missing:** treat the reset as incomplete and review the database/application logs. Do not
  delete or rewrite audit rows.

Do not restore a database backup to undo this change. A restore could overwrite unrelated production
data and would not be necessary for an account password reset.

## 10. Requirements mapping

| Requirement             | Coverage                                                                                                                                                    |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FR-001 Authentication   | Reuses Argon2id and the application's session model; verifies login through the production login page.                                                      |
| FR-002 RBAC             | Target must be an active `ADMIN`; role, status, and permissions are preserved.                                                                              |
| FR-003 Faculty Accounts | No faculty, student, class, badge, or credential rows are modified.                                                                                         |
| FR-020 Audit Log        | Appends `administrator.password_reset` with target identity and session-invalidation count.                                                                 |
| Security and Privacy    | No password printed, no password in command arguments/reports/source, no migration, no container restart, no key/SMTP change.                               |
| Authorization testing   | Unit tests cover exact target matching, role/status rejection, weak-password rejection, session/token invalidation, audit creation, and update-count abort. |

## 11. Local validation evidence

- Targeted tests: 12 passed across the new service test and audit service test.
- Full unit suite: 118 test files, 885 tests passed.
- `npm run typecheck`: passed.
- `npm run lint`: passed.
- `npm run format`: passed.
- `npm run build`: passed.
- Script guard checks:
  - refused to run without `ADMIN_RESET_APPROVED=YES`;
  - refused a target email that did not match `BOOTSTRAP_ADMIN_EMAIL`;
  - created no credentials file during those refusals.

**No production account, password, session, audit row, container, migration, key, or SMTP
configuration was changed in preparing this procedure.**
