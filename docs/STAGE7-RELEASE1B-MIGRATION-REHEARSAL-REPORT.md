# Stage 7 Release 1B — Migration Rehearsal Report

**Date:** 28 November 2026
**Source:** Production database dump taken read-only on 28 Nov 2026 06:46 UTC
**Environment:** Disposable MariaDB 11.8 on the operator workstation; production was never migrated or modified.
**Dump backup:** `/var/backups/hau-soc/stage7-release1b-20261128T064647Z/badging-db.sql.gz`
**Isolated database:** `badging_rehearsal` (deleted after rehearsal; dump deleted from the workstation)

## 1. Rehearsal steps

1. Read-only `mariadb-dump` of production (`--single-transaction --routines --triggers`).
2. SHA-256 integrity verification and restore into the isolated MariaDB database.
3. Verified restore fidelity against production counts and CRC sums **before** migration.
4. Applied the additive Prisma migration (`prisma migrate deploy`).
5. Ran `scripts/stage7-release1-migrate.ts` in dry-run mode.
6. Applied the promotion script (`--apply`).
7. Re-applied the script to prove idempotency.
8. Ran a final dry run.
9. Compared credential, notification, status-list and audit metrics before/after.
10. Analysed course/title inconsistencies, duplicate definitions and approval provenance.

## 2. Restore fidelity (copy vs production)

| Metric                                         | Production     | Restored copy  |
| ---------------------------------------------- | -------------- | -------------- |
| Issuances (total / active / revoked / expired) | 3 / 2 / 1 / 0  | 3 / 2 / 1 / 0  |
| Signed credentials                             | 3              | 3              |
| Issuance identity CRC32 sum                    | 10420535069    | 10420535069    |
| Signed credential CRC32 sum                    | 5032942483     | 5032942483     |
| Notification deliveries / attempts             | 4 / 2          | 4 / 2          |
| Status allocations                             | 3              | 3              |
| Migrations                                     | 21             | 21             |
| Classes / templates / students / users         | 2 / 3 / 41 / 2 | 2 / 3 / 41 / 2 |

Restore verified: the isolated copy is a faithful reproduction.

## 3. Migration results

| Step                 | Result                                                                            |
| -------------------- | --------------------------------------------------------------------------------- |
| Schema migration     | Applied (21 → 22)                                                                 |
| Dry run before apply | 2 courses to create, 2 classes to map, 3 definitions planned, 0 duplicates        |
| Apply                | 2 courses, 2 mappings, 3 definitions, 3 versions, 3 assignments, 3 template links |
| Apply again          | 0 created, 0 mapped, 3 already linked                                             |
| Final dry run        | 0 to create, 0 created, 0 duplicates, 0 errors                                    |
| Errors               | None                                                                              |

## 4. Historical record integrity

| Metric                                 | Before         | After          |
| -------------------------------------- | -------------- | -------------- |
| Issuances                              | 3              | 3              |
| Issuance identity CRC32 sum            | 10420535069    | 10420535069    |
| Signed credential CRC32 sum            | 5032942483     | 5032942483     |
| Notification deliveries                | 4              | 4              |
| Notification attempts                  | 2              | 2              |
| Status allocations                     | 3              | 3              |
| Classes / templates / students / users | 2 / 3 / 41 / 2 | 2 / 3 / 41 / 2 |

- **No credential was reissued.**
- **No public ID, signature, expiration date, revocation state or signing-key ID changed.**
- **No notification delivery or attempt was created.**
- Audit rows increased by 3 (the explicit backfill audit for each promoted template).

## 5. Duplicate and consistency analysis

- Course code/title inconsistencies: **none**.
- Duplicate definitions by course + normalized name: **none**.
- Duplicate definitions by artwork + criteria: **none**.
- Duplicate groups reported by the script: **0**.
- Automatic merges or deletions: **0**.
- Existing definitions without historical approval provenance: **3** (expected; legacy templates had no approval workflow). The script records this in the review note and does not invent an approver.

## 6. Idempotency

The second apply performed zero writes and the final dry run planned zero changes. The script can be re-run safely after a partial failure.

## 7. Safety

- Production was read-only throughout; only the isolated copy was migrated.
- No duplicate badges were merged or deleted.
- No unsolicited email was sent.
- No credential was issued.
- The production dump was handled as confidential and removed from the workstation after the rehearsal; only aggregated, non-PII evidence is retained.

## 8. Evidence

- `docs/evidence/stage7-release1b/01-dry-run-before-apply.{md,json}`
- `docs/evidence/stage7-release1b/02-apply.{md,json}`
- `docs/evidence/stage7-release1b/03-apply-second.{md,json}`
- `docs/evidence/stage7-release1b/04-dry-run-after-apply.{md,json}`
- `docs/evidence/stage7-release1b/05-rehearsal-metrics.txt`

## 9. Conclusion

The additive migration and promotion script are **safe and ready** for production, subject to explicit authorization. No data-integrity issue was found.
