# Stage 5B Legacy Credential Reconciliation

**Date:** 4 November 2026  
**Scope:** 27 malformed legacy issuance records  
**Action taken:** Read-only investigation and manifest generation. No records were deleted, modified, reconstructed, or re-signed.

## 1. Findings

27 rows in `badge_issuances` have empty snapshot JSON:

| Source prefix              | Count | Status |
| -------------------------- | ----: | ------ |
| `phase8-status-issuance-*` |    16 | ACTIVE |
| `phase8-task2-issuance-*`  |    11 | ACTIVE |

For all 27 rows:

- `recipient_snapshot_json`, `achievement_snapshot_json`, `issuer_snapshot_json`, and
  `credential_json` are all empty objects.
- `signing_key_id` is NULL; the records are unsigned.
- The related classes, badge templates, students, and issuing users are all Phase 8
  disposable test artifacts (`phase8-status-*` or `phase8-task2-*`).
- There are **0** notification deliveries, **0** status-list allocations, and **0** audit
  log references to these records.
- The Issued Badges page displays them as “Credential data unavailable.”
- Their public verification page and credential API return **404**, not a server error and
  not unvalidated data.
- They carry no legitimate recipient, achievement, issuer, credential, signature, or
  status-list evidence.

**Conclusion:** these are disposable Phase 8 test artifacts, not legitimate historical
issuance evidence. They must not be treated as valid credentials.

A 27-row manifest was generated at:

- `storage/stage5b/legacy-issuance-manifest.csv` (local, ignored by Git)

## 2. Non-destructive reconciliation strategy

No reconstruction is proposed because there is no signed or snapshot evidence to recover
and the records are test artifacts.

1. **Quarantine in place.** Keep the rows and continue rendering them as unavailable. Do
   not expose them as valid credentials and do not fabricate snapshots, proofs, or
   signatures.
2. **Exclude from production migration.** Use the manifest to exclude/quarantine these
   rows during any production data-cleanup step. Do not import them as credentials.
3. **Administrative review.** Confirm with the system owner that the Phase 8 identifiers
   are not referenced by an external acceptance record, email, or stakeholder evidence.
4. **Archive before removal.** If removal is later approved, export the 27 rows and their
   related identifiers, take a database backup, and perform the removal in a separate
   reviewed maintenance change. Never remove audit logs.
5. **Never backfill signed evidence.** If any row is reclassified as legitimate, only a
   reviewed reconstruction of legacy unsigned snapshots from authoritative Student,
   Class, Badge, and Issuer records could be considered. Signed credentials must not be
   reconstructed or re-signed silently.
6. **Post-reconciliation check.** Re-run the integrity queries and ensure:
   - no orphan relationships;
   - no signed credential lacks a key or proof;
   - no status allocation lacks an issuance;
   - valid public credentials remain verifiable.

## 3. Related non-production artifacts

The same Phase 8 cleanup should review:

- 19 unused `phase8`/`task4` credential status lists with no allocations or signing key.
- 21 RETIRED and 2 COMPROMISED signing keys that are not referenced by any issuance.
- 19 Phase 8 users, 27 Phase 8 students, 19 Phase 8 classes/badges, and 15 `task4`
  users/classes/badges/students.
- The 9 signed acceptance/demo credentials (AUDIT and Brevo acceptance badges). These are
  legitimate local acceptance evidence and should be preserved or archived, not deleted,
  until the business owner approves.

## 4. Disposition

- **Legacy 27:** Quarantine/archive as non-production test artifacts. No reconstruction.
- **Public exposure:** None; verification fails closed with 404.
- **Current UI behavior:** Keep the “Credential data unavailable” fallback.
- **Production import:** Exclude unless a separate approved migration/cleanup explicitly
  handles them.
- **Historical preservation:** No deletion or mutation was performed in Stage 5B.
