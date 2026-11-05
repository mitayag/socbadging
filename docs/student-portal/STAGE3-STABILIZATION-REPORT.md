# Stage 3 Stabilization Report

## Task 1 — Playwright skipped tests

- Replaced shared single-use activation/recovery fixtures with per-project desktop/mobile students and tokens.
- Added a second SENT notification fixture for mobile resend.
- Removed all `test.skip` calls for mobile activation, recovery, and resend.
- Complete Playwright suite: **46 passed, 0 failed, 0 skipped**.

## Task 2 — Student access isolation

- Added a proxy-level ownership guard for `/student/badges/:issuanceId`.
- Cross-student credential access now returns HTTP **404** in the production build.
- Verified Student A cannot access Student B's credential, notifications, or profile data.
- Verified staff API access from a student session returns **403**:
  - `/api/issued/export`
  - class roster export
  - batch report
  - foreign issuance credential download
- Unauthorized responses contained no student email, student number, or credential data.
- Anonymous public verification remains HTTP **200**.

## Task 3 — Security and dependency review

Safe updates applied:

- `next@16.4.3`
- `nodemailer@10.3.1`
- `zod@4.6.7`
- `prisma@7.10.1`
- `@prisma/client@7.10.1`
- `@prisma/adapter-mariadb@7.10.1`

`npm audit --omit=dev` after updates:

```text
0 critical, 0 high, 7 moderate
```

Remaining moderate advisories are the `exceljs` → `archiver`/`glob`/`minimatch`/`readdir-glob`/`zip-stream` chain. They are runtime-reachable through authenticated XLSX roster/batch import/export, which is bounded to 2 MiB and 5,000 rows and only available to authorized staff. No safe upstream fix is available without a breaking ExcelJS change; this remains documented and accepted locally.

A Prisma 7.10 raw-JSON compatibility defect was found during regression testing: raw queries returned JSON columns as strings, causing signed issuance/revocation snapshot comparisons to fail. Both paths now normalize JSON strings before validation. MariaDB integration tests pass again.

## Task 4 — Email delivery hardening

- Transactional outbox and worker behavior reviewed.
- At-least-once SMTP delivery documented; a crash after SMTP acceptance can resend.
- Resend is throttled by cooldown and `account` rate limit, with `notification.resend_requested` audit.
- Mailpit remains the local default.
- Added provider-neutral `bounce-event-contract.ts` with strict event schema, idempotency claim, suppression callback, and replay protection.
- No provider adapter, signed webhook route, or suppression database is wired because no production provider has been selected. This remains a production blocker.

## Task 5 — Academic acceptance

Completed locally with E2E, integration, and live browser checks:

- Faculty individual issuance.
- Faculty batch issuance.
- Student activation, login, dashboard, wallet across two classes, detail, downloads, recovery, logout.
- Administrator invite, suspend, reactivate, notification history, resend, audit.
- Existing credentials remained publicly accessible and valid during suspension.
- Public verification remained anonymous.

## Task 6 — Git and database readiness

- Uncommitted work grouped into dashboard, issuance repair, student portal, dependency/security, and Stage 3 stabilization groups.
- Migration `20261101180000_student_portal` is additive and data-preserving.
- Migration parity: no difference detected.
- `.env` is ignored; signing secrets remain outside the repository.
- Audit fixtures are documented and were not automatically deleted.
- No commit, push, merge, or deployment performed.

## Final test counts

| Gate                | Result                           |
| ------------------- | -------------------------------- |
| Formatting          | PASS                             |
| Lint                | PASS                             |
| Typecheck           | PASS                             |
| Unit                | 111 files / 786 tests PASS       |
| MariaDB integration | 17 files / 112 tests PASS        |
| Production build    | PASS                             |
| Playwright E2E      | 46 passed / 0 failed / 0 skipped |
| Migration parity    | PASS                             |
| Production audit    | 0 critical / 0 high / 7 moderate |

## Final recommendation

**CONDITIONAL PASS — local Stage 3 stabilization accepted.**

Zero failed and zero skipped Playwright tests, zero critical/high production advisories, migration parity, and live isolation checks pass. Production deployment remains conditional on external SMTP/provider configuration, bounce/complaint integration, resolution or acceptance of the remaining moderate ExcelJS chain, and production HTTPS/1EdTech activation.
