# Database Migration and Rollback

## Apply migrations

Migrations are standard Prisma SQL migrations under `prisma/migrations/`. Use the deployment path:

```sh
npm run db:generate
npm run db:migrate
```

`prisma migrate deploy` applies pending migrations in order and records them in
`_prisma_migrations`. It does not reset data.

## Stage 5C.1 migration

`20261104120000_recipient_suppression` is additive:

- creates `recipient_suppressions`;
- adds unique/index constraints only on the new table;
- does not alter or delete existing credential, delivery, event, or audit rows.

It is safe to apply while the prior application release is running because the prior release ignores
the new table. Apply it before deploying code that writes suppression.

## Rollback procedure

1. Take a verified database backup and record the current migration name.
2. Stop the webhook consumer and notification worker so no new suppression events or sends occur.
3. Deploy the prior application release.
4. Leave the additive `recipient_suppressions` table in place; the prior release ignores it. This
   preserves audit/history data and is the preferred rollback.
5. Do not run a destructive `DROP TABLE` in production without explicit security and compliance
   approval. If approved, export suppression rows and related audit entries first, then drop the table.
6. Re-enable sending only after confirming the suppression enforcement behavior of the deployed
   release.

## Restore-based rollback

The Stage 5B backup/restore procedure remains authoritative for full database recovery:
`docs/operations/backup-restore-runbook.md`. Restore validation must include:

- accepted migrations match the application release;
- historical signed credentials are unchanged;
- `credential_status_lists` and allocation versions are internally consistent;
- `recipient_suppressions` is either absent (pre-feature release) or complete and audited.

## Status-list repair is not a migration

`scripts/repair-status-list.ts` is an audited data/publication repair, not a schema migration. It
advances the status-list version and synchronizes allocation versions while preserving every signed
credential payload. See [Status-List Architecture](../conformance/status-list-architecture.md).
