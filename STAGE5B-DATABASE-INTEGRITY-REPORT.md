# Stage 5B Database Integrity Report

**Date:** 4 November 2026  
**Environment:** Local development only  
**Result:** PASS — no structural integrity failures; non-production artifacts documented

## 1. Scope and method

Reviewed the local application database (`badging`) against `prisma/schema.prisma`, all 20
migrations, information_schema definitions, and application relationships. All queries were
read-only. No records were changed or deleted.

## 2. Schema inventory

- 29 application base tables plus `_prisma_migrations`.
- 35 foreign-key relationships.
- 117 index definitions (primary, unique, and relation/query indexes).
- All tables are InnoDB with `utf8mb4_unicode_ci`.
- Schema parity against a clean migrated database: **522 normalized schema definitions, zero diff** (see `STAGE5B-MIGRATION-VALIDATION.md`).

Key tables: users, students, student_accounts, departments, faculty_profiles, classes,
class_students, badge_templates, badge_issuances, issuance_batches, issuance_tuple_reservations,
notification_deliveries, notification_delivery_attempts, notification_delivery_events,
smtp_submission_attempts, signing_keys, credential_status_lists, credential_status_allocations,
audit_logs, sessions, student_tokens, password_reset_tokens, rate_limit_buckets,
roster_import_previews, system_settings, operational_heartbeats, accounts, verification_tokens,
credential_replacement_guards.

## 3. Exact row counts

| Table                         | Rows |
| ----------------------------- | ---: |
| users                         |   37 |
| students                      |   49 |
| student_accounts              |    1 |
| classes                       |   36 |
| class_students                |   22 |
| badge_templates               |   38 |
| badge_issuances               |   36 |
| notification_deliveries       |   10 |
| signing_keys                  |   24 |
| credential_status_lists       |   20 |
| credential_status_allocations |    9 |
| audit_logs                    |  138 |
| sessions                      |   41 |
| faculty_profiles              |    1 |
| departments                   |    1 |
| system_settings               |    1 |
| issuance_batches              |    1 |

## 4. Relationship and constraint checks

All checks returned zero violations:

- student accounts missing a user or student;
- classes missing an owner;
- enrollments missing a class or student;
- faculty profiles missing a user;
- badge templates missing a class or owner;
- issuances missing a class, badge template, student, or issuer;
- notification deliveries missing an issuance;
- duplicate student accounts, account users, enrollments, status indexes, or public IDs;
- badge/class mismatches, invalid issuer roles, or class owners that are not Faculty.

Additional observations that are not integrity violations:

- 48 students have no portal account (students may exist without activation).
- 24 Faculty users have no `faculty_profiles` row; profiles are optional and the local
  fixtures are mostly test artifacts.
- 41 sessions exist; some may be expired. Session pruning is an operational task.
- `status_list_version` on allocations differs from the current list version in 9 rows.
  This is expected: the allocation records the version at allocation time, while revocation
  increments the list version. Revoked flags match issuance states.

## 5. Credential state checks

- Issuance status distribution: **35 ACTIVE, 1 REVOKED, 0 EXPIRED**.
- 9 signed credentials: **8 ACTIVE, 1 REVOKED, 0 EXPIRED**.
- No REVOKED issuance lacks `revoked_at` or a revocation reason.
- No EXPIRED issuance lacks `expires_at`.
- No ACTIVE issuance has a past `expires_at`.
- No signed issuance lacks a signing key or proof.
- Every signed credential uses `eddsa-rdfc-2022`.
- 27 ACTIVE rows have empty recipient/achievement/issuer/credential snapshots. These are
  the documented Phase 8 test artifacts; they are unsigned, have no status allocations or
  notifications, and public verification returns 404 (fail closed). See
  `STAGE5B-LEGACY-CREDENTIAL-RECONCILIATION.md`.

## 6. Signing-key and status-list integrity

- Exactly **one ACTIVE signing key** (`key-local`).
- Key inventory: 1 ACTIVE, 21 RETIRED, 2 COMPROMISED; all have public multikey material.
- All 9 signed issuances reference the ACTIVE key. No issuance references a retired or
  compromised key.
- One used status list (`status-list-local`): capacity 131,072, `next_index` 34, version 2,
  signed with the active key and `eddsa-rdfc-2022`, 9 allocations, 1 revoked allocation.
- `next_index` equals the maximum allocation index + 1. No allocation orphans.
- Revocation flags match issuance statuses; no signed issuance lacks an allocation.
- 19 additional status lists are empty, unsigned test artifacts with no allocations.
- No private-key, seed, or secret columns exist in the database. The signer private key
  remains external to the database.

## 7. Notification and audit relationships

- 10 notification deliveries: 9 SENT, 1 FAILED; all reference valid issuances.
- Provider status is NULL for all local Mailpit/SMTP records. This is not a relational
  integrity failure; provider delivery is unverified.
- 138 audit logs are present and immutable; actor deletion is handled by `SET NULL`.
- No audit records were modified during this audit.

## 8. Verdict

**Database integrity: PASS.** No orphaned records, duplicate relationships, broken foreign
keys, invalid issuer roles, credential-proof defects, or status-list allocation defects were
found. Remaining anomalies are non-production test data and are documented for a controlled
cleanup plan.
