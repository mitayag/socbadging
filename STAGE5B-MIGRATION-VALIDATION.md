# Stage 5B Migration Validation

**Date:** 4 November 2026  
**Result:** PASS — migration chain, schema parity, and restore-based rollback rehearsal validated

## 1. Migration chain

- Source: `prisma/migrations/` contains **20 migrations**.
- Application database `badging`: `prisma migrate status` reports **20 migrations, database schema is up to date**.
- Clean disposable database `badging_stage5b_migration`: created empty and migrated from zero with
  `prisma migrate deploy`.
- Result: all 20 migrations applied successfully in order.
- `prisma migrate status` on the clean database reports up to date.

## 2. Schema parity

Compared `information_schema` definitions for the application database and the clean migrated
database:

- base tables, engines, and collations;
- columns, types, nullability, defaults, extra attributes, and keys;
- indexes, uniqueness, index types, and column order;
- foreign keys with update/delete rules.

Normalized output:

- **522 schema definition lines per database**
- **Zero diff**

The ORM schema, migration history, and live application schema are in parity for all 29
application tables (35 foreign keys, 117 index definitions).

## 3. Forward migration

The clean database was migrated from an empty schema through the complete chain. No manual
schema edits, shadow drift, or missing migrations were required.

## 4. Rollback rehearsal

Prisma does not provide down migrations in this repository. Rollback is backup/restore-based.

- A logical backup of the application database was created with `mariadb-dump` using
  `--single-transaction --routines --triggers --events`.
- The restore-safe table dump was restored into the isolated database
  `badging_stage5b_restore`.
- Restore completed successfully in approximately **0.67 seconds** (small local dataset).
- Counts and `CHECKSUM TABLE` results matched the source for users, students, badge
  issuances, signing keys, credential status lists, status allocations, notification
  deliveries, and audit logs.
- No orphan relationships were introduced.
- Credential integrity remained: **9 signed credentials, 27 malformed legacy records,
  1 active signing key, 1 signed status list**.
- The application database was not modified during the rehearsal.

**Limitation:** a true downgrade of a specific migration requires a pre-migration backup.
No pre-migration backup exists for the latest migration, so the rehearsal validates restore
recovery and schema continuity, not a schema downgrade. Production rollback must be preceded
by a verified pre-deployment backup.

## 5. Historical credential preservation

The migration and restore validation preserved all 36 issuance rows, including:

- 9 signed credentials with proofs and active-key references;
- 27 malformed legacy test artifacts (not reconstructed or deleted);
- all status-list allocations and signing-key metadata.

## 6. Verdict

**Migration validation: PASS.** The migration chain is complete, the ORM and live schema
match, the clean database migrates successfully, and the isolated backup restore preserves
record counts, relationships, and credential dependencies.
