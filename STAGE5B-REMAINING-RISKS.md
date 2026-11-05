# Stage 5B Remaining Risks

**Date:** 4 November 2026  
**Final Stage 5B recommendation:** **CONDITIONAL PASS**

Stage 5B integrity, migration, and backup validation passed. Conditions remain for
production data cleanup and recovery assets.

## 1. Integrity and data cleanup conditions

| Risk                                 | Severity | Current state                                                               | Required action                                                         |
| ------------------------------------ | -------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| 27 malformed legacy issuances        | Medium   | Phase 8 test artifacts, unsigned, no dependencies, public routes 404        | Quarantine/archive with approval; do not reconstruct or delete silently |
| 19 unused status lists               | Low      | Phase 8/task4 test lists, no allocations or signing key                     | Review in the same test-data cleanup                                    |
| 21 RETIRED + 2 COMPROMISED keys      | Low      | Not referenced by any issuance                                              | Retain for audit until cleanup approval; do not reuse                   |
| Test fixture users/students/classes  | Medium   | 19 phase8 users, 15 task4 users, 27 phase8 students, 34 test classes/badges | Quarantine or remove under an approved cleanup plan                     |
| 9 signed acceptance/demo credentials | Medium   | AUDIT and Brevo acceptance badges; legitimate local evidence                | Preserve or archive with business approval; do not delete as test junk  |
| 24 Faculty users without profiles    | Low      | Optional profile rows missing for test fixtures                             | Cleanup candidate; not an integrity violation                           |
| 48 students without portal accounts  | Low      | Valid pre-activation records                                                | Preserve; activation is optional                                        |

## 2. Proposed production data-cleanup plan (not executed)

1. Take a verified backup and record checksums.
2. Freeze writes or enter a maintenance window.
3. Export the 27 malformed IDs using `storage/stage5b/legacy-issuance-manifest.csv`.
4. Classify records into:
   - disposable test fixtures (`phase8-*`, `task4-*`, stale integration IDs);
   - signed acceptance/demo credentials (preserve/archive with approval);
   - real institutional records (preserve).
5. Delete only approved parent/child test fixtures, in dependency order, inside a transaction.
6. **Never delete** audit logs, signed credentials, status lists/allocations referenced by
   signed credentials, or historical issuance records without explicit approval.
7. Re-run orphan/checksum/integrity checks and verify public verification for retained
   credentials.
8. Document the cleanup in the change record.

The cleanup plan is designed so it cannot target a credential record that has a signed
credential, status allocation, notification, or audit dependency unless it is explicitly
reviewed.

## 3. Recovery and key-management conditions

- The database backup does **not** include the signer private-key file; back it up separately.
- The Docker media volume (badge artwork) is not in the database backup; back it up separately.
- No point-in-time recovery / binary-log strategy is validated; only logical dump restore.
- Restoring a backup may restore stale sessions and rate-limit buckets; invalidate/clear them
  after restore.
- The local ACTIVE signing key uses `http://127.0.0.1:3000` verification/controller URLs and
  must be replaced by a production HTTPS key through the signing-key lifecycle runbook.
- Provider delivery events and email-provider state are external and unverified.
- Production restore timing/RTO is unknown; the local 0.67-second restore is not a production
  SLA estimate.

## 4. Operational and documentation risks

- `docs/operations/known-limitations.md` is stale regarding self-service password reset and
  bounce/webhook handling.
- Provider status is NULL for local Mailpit/SMTP acceptance records; do not claim inbox
  delivery.
- Screenshots and local fixture data may contain PII; exclude/redact for release artifacts.
- No production monitoring, alerting, or automated backup schedule exists.
- The Stage 5B backup files are local and gitignored; they are not a production backup system.

## 5. Final recommendation

**Stage 5B: CONDITIONAL PASS.**

- Database schema, relationships, constraints, credential states, signing-key references,
  status-list consistency, migration parity, and backup/restore integrity are validated.
- No structural integrity failure or evidence of legitimate historical data loss was found.
- Production deployment remains conditional on the data cleanup, key/media backup, production
  signing-key replacement, and operational recovery controls above.
