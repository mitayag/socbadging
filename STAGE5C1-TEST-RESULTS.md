# Stage 5C.1 Test Results

**Date:** 4 November 2026  
**Environment:** Local development and disposable local MariaDB  
**External email sent:** No

## 1. Static checks

| Check            | Command             | Result                              |
| ---------------- | ------------------- | ----------------------------------- |
| Format           | `npm run format`    | PASS — all files use Prettier style |
| Lint             | `npm run lint`      | PASS — 0 warnings/errors            |
| Typecheck        | `npm run typecheck` | PASS                                |
| Production build | `npm run build`     | PASS                                |

## 2. Unit tests

```text
Test Files  115 passed (115)
Tests       849 passed (849)
```

Command: `npm test`

## 3. Integration tests (MariaDB)

Command:

```sh
TEST_DATABASE_URL=<disposable-local-db> npm run test:integration
```

Final result after resetting and migrating the disposable test database:

```text
Test Files  20 passed (20)
Tests       145 passed (145)
Duration    10.88s
```

Coverage includes:

- suppression hard bounce, complaint, invalid, blocked, temporary failures;
- duplicate and concurrent webhook events;
- suppression survives through worker claim/send checks;
- retry/resend denial;
- student account email denial;
- status-list version synchronization and public route publication;
- concurrent revocation and status-list regeneration;
- key selection/compromise rollback behavior;
- credential revocation/status tests.

### Test-environment note

Playwright global setup intentionally resets its disposable database and leaves E2E fixtures. Running
the integration suite against that same database without reinitializing it produced fixture conflicts
and timeouts. After dropping/recreating and migrating the disposable test database, all 145
integration tests passed. This is a test-fixture ordering issue, not a product failure.

## 4. Playwright

Command:

```sh
TEST_DATABASE_URL=<disposable-local-db> E2E_CONFIRM_DISPOSABLE_DATABASE=true \
  npx playwright test e2e/phase7-notifications-hardening.spec.ts \
  e2e/phase8-open-badges-conformance.spec.ts --project=desktop
```

Result: **11 passed**.

Mobile project result: **11 passed**.

Coverage includes notification inspection/retry/privacy, public credential rendering, proof tampering,
legacy labels, replacement history, signer outage recovery, signed issuance, revocation, and status-bit
publication.

## 5. Database migrations

- Fresh disposable database created.
- `prisma migrate deploy` applied all 21 migrations, including
  `20261104120000_recipient_suppression`.
- Local database also migrated successfully.
- Status-list repair transaction completed and wrote an audit record.

## 6. Public status-list verification

| Check                                     | Result                                   |
| ----------------------------------------- | ---------------------------------------- |
| `GET /api/status-lists/status-list-local` | HTTP 200                                 |
| Content-Type                              | `application/ld+json; charset=utf-8`     |
| ETag present                              | Yes                                      |
| Signed proof                              | `DataIntegrityProof` / `eddsa-rdfc-2022` |
| External proof verification               | PASS                                     |
| Revoked index                             | 1                                        |
| Active index                              | 2                                        |
| Revoked credential page                   | HTTP 200 — Revoked credential            |
| Active credential page                    | HTTP 200 — Cryptographically verified    |

Independent consumer output:

```text
proofVerified: true
revokedIndexes: [1]
expectedRevoked: 1
expectedActive: 2
status: PASS
```

## 7. Running system containers

Started with:

```sh
docker compose --profile notifications up -d
```

Observed containers: db, signer, migrate, media-init, web, worker, mailpit.

`GET /api/health` result:

```text
status: ok
readiness: ready
database: ready
notifications: ready, worker heartbeat fresh
signer: ready, key-local, eddsa-rdfc-2022
```

## 8. Regression verdict

All previously passing unit, integration, E2E, static, migration, and build checks remain functional.
Stage 5C.1 test gate: **PASS**.
