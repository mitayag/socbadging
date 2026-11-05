# Stage 3 Git and Database Readiness

## Working tree

- No commits, pushes, merges, or deployments were performed.
- Branch: `main`
- HEAD: `3fc9b65`
- Working tree contains prior approved-but-uncommitted dashboard/issuance/security work plus Stage 1–3 student portal changes.
- `.env` is ignored by Git.
- Signing private key path is outside the repository and is not tracked.
- Screenshots and reports are untracked deliverables.

## Logical change groups for a future commit

1. **Dependency and security baseline**
   - `package.json`, `package-lock.json`
   - `docs/operations/dependency-security.md`
   - security/limitation documentation updates

2. **Dashboard stabilization**
   - `src/modules/dashboard/**`
   - `src/components/dashboard/**`
   - dashboard/profile/account/layout/user-menu/mobile-navigation changes
   - `e2e/dashboard-and-user-menu.spec.ts`
   - dashboard screenshots

3. **Individual issuance repair**
   - signed issuance/revocation/actions and tests
   - `scripts/bootstrap-local-signing.ts`
   - local signing/issuer configuration documentation

4. **Student portal Stage 1 + Stage 2**
   - `prisma/migrations/20261101180000_student_portal`
   - `prisma/schema.prisma`
   - `src/modules/student/**`, `src/app/student/**`, `src/app/students/**`
   - student components/pages, notification resend, image/PDF routes
   - `e2e/student-portal.spec.ts`
   - student portal docs and screenshots

5. **Stage 3 stabilization**
   - per-project E2E fixtures
   - proxy ownership guard and tests
   - dependency updates
   - bounce-event contract and tests
   - Stage 3 reports

## Migration sequence

Apply in order:

1. Existing Phase 1–8 migrations through `20260830_phase_8_signed_replacement_tuple_lookup`.
2. `20261101180000_student_portal`.

The new migration is additive:

- adds `STUDENT` to `users.role`
- creates `student_accounts`
- creates `student_tokens`
- adds notification artwork/expiration/resend columns

Rollback:

- Remove student portal data only after export/backup.
- Drop `student_tokens`, `student_accounts`, and the notification columns.
- Removing `STUDENT` from the enum requires no `users.role = 'STUDENT'` rows.
- Do not remove existing student, class, enrollment, issuance, credential, signing, or audit data.

## Audit fixtures requiring local cleanup (not deleted automatically)

Live local DB contains:

- `audit-student-a` / `audit-recipient-a@example.test`
- `audit-student-b` / `audit-recipient-b@example.test`
- `AUDIT INDIVIDUAL BADGE`, `AUDIT BATCH BADGE`
- corresponding issuances, notification rows, and audit records
- STUDENT user/account/token for `audit-recipient-a@example.test`

Also present from local manual testing:

- `TEST` class/badge and `TEST` issuances for local recipients
- user-created test student `00012` / `authorized-test-recipient@example.org`

Do not delete these automatically. Cleanup requires explicit approval and a data export.

## Migration parity

`prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`

Result: **No difference detected.**
