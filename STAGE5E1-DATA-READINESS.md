# Stage 5E.1 Data Readiness

**Date:** 5 November 2026  
**Destructive database changes:** None  
**Legacy records deleted:** No

## 1. Current local data inventory

Read-only queries on the local application database:

| Item                                                        | Count |
| ----------------------------------------------------------- | ----: |
| Badge issuances                                             |    36 |
| Unsigned issuances                                          |    27 |
| Issuances with empty recipient/achievement/issuer snapshots |    27 |
| Users                                                       |    37 |
| Students                                                    |    49 |
| Classes                                                     |    36 |
| Notification deliveries                                     |    10 |
| Active recipient suppressions                               |     0 |

Legacy set: the same 27 malformed Phase 8 test-artifact issuances documented in Stage 5B remain
present and untouched. They have no signed credential, key reference, status allocation, notification,
or audit reference. They must remain quarantined until explicit approval for archival/removal.

## 2. Integrity checks

| Check                                       |                  Result |
| ------------------------------------------- | ----------------------: |
| Signed credential without signing key       |                       0 |
| Signed credential without status allocation |                       0 |
| Orphan status allocation                    |                       0 |
| Revoked allocation version mismatch         |                       0 |
| Empty-snapshot legacy issuances             | 27 (known, quarantined) |
| Active suppressions                         |                       0 |

The legacy 27 are intentionally excluded from valid credential/status evidence. Public verification
fails closed rather than exposing unvalidated data.

## 3. Backup integrity evidence

Stage 5E.1 created and verified a fresh local backup set:

- database logical dump,
- media archive,
- backup properties,
- SHA-256 checksums.

`scripts/verify-backup.sh` passed for all artifacts. A separate encrypted signing-key backup was
created, decrypted, and loaded successfully by the signer runtime. No backup was restored over
production data.

Stage 5D had already validated an isolated restore drill: a post-backup audit marker disappeared, the
Administrator/status list were restored, and a media marker inserted after backup was removed.

## 4. Test and fixture data

- The disposable integration database and browser E2E database are now separate:
  - integration: `badging_test`,
  - E2E: `badging_e2e`.
- Integration refuses to run against a database whose name does not include `test` or `integration`.
- E2E requires a database whose name includes `e2e`.
- Both suites refuse to run when `TEST_DATABASE_URL` and `E2E_DATABASE_URL` are identical.
- E2E rate-limit resets target the E2E database only.
- After a full desktop+mobile E2E run, the integration suite still passed without resetting the
  integration database, proving fixture isolation.

The 27 legacy records are not E2E fixtures and must not be truncated by E2E setup in a production
database. E2E truncation is only permitted on `*_e2e` disposable databases.

## 5. Migration readiness

- All 21 migrations apply cleanly to fresh disposable databases.
- The Stage 5C.1 suppression migration is additive.
- No migration deletes credentials, audit logs, or signing keys.
- Rollback guidance is in `docs/operations/database-migrations.md` and
  `STAGE5D-BACKUP-RECOVERY.md`.
- Application rollback can leave additive tables in place; destructive drops require explicit
  approval.

## 6. Approved cleanup decision

No cleanup was performed. The recommended disposition remains:

1. Keep the 27 legacy records quarantined and excluded from valid credential presentation.
2. Confirm with the system owner that no external evidence references them.
3. If removal is later approved, export the rows and related identifiers, take a verified backup,
   perform removal in a reviewed maintenance change, and never delete audit logs.
4. Do not reconstruct or re-sign legacy credential evidence.

## 7. Verdict

**Data readiness: PASS for local/staging release candidate.**  
Legacy data remains preserved and non-destructive. Production import/cleanup still requires explicit
owner approval.
