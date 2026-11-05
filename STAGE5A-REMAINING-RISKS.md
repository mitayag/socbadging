# Stage 5A Remaining Risks

**Date:** 3 November 2026  
**Status:** Release candidate reviewed; production deployment not authorized

## 1. Production deployment blockers

| Risk                        | Severity | Current state                                                                    | Required before production                                                             |
| --------------------------- | -------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Uncommitted change set      | High     | 194 entries at Stage 5A start; 200 including the four Stage 5A reports           | Review, commit, and tag an approved release candidate                                  |
| Unreviewed release artifact | High     | No commit/CI artifact exists                                                     | Build from a clean checkout and attach checksums                                       |
| Local-only environment      | High     | `APP_URL`/`ISSUER_URL` point to `127.0.0.1`; local bootstrap/signing credentials | Configure HTTPS URLs, production secrets, and signing-key lifecycle                    |
| Email delivery              | High     | Mailpit locally; Brevo/webhook/DNS not verified in production                    | Configure Brevo, verify webhook, SPF/DKIM/DMARC, sender reputation, and inbox evidence |
| Data hygiene                | High     | Local DB contains test users/students/classes and 27 malformed issuance rows     | Clean test artifacts; reconcile malformed rows; rehearse migration/backup/restore      |
| Operations readiness        | High     | No production monitoring, alerting, backups, load test, or incident runbooks     | Implement and validate operational controls                                            |
| Security review             | High     | Threat model and dependency baseline exist; no target-environment review         | Complete deployment security review and dependency remediation                         |
| Test isolation              | Medium   | Fixed in Stage 5A with per-test rate-limit bucket reset                          | Run the combined suite repeatedly in CI and monitor                                    |
| Screenshot/PII artifacts    | Medium   | `docs/screenshots/` contains local/E2E fixture data                              | Redact or exclude from external release artifacts                                      |
| Documentation drift         | Medium   | `known-limitations.md` is outdated regarding email reset and bounce handling     | Update before release                                                                  |

## 2. Malformed legacy issuance reconciliation proposal

**Observed:** 27 rows in the local application database have empty `{}` snapshot JSON:

- 16 `phase8-status-issuance-*` rows, all ACTIVE
- 11 `phase8-task2-issuance-*` rows, all ACTIVE

All 27 lack recipient, achievement, issuer, and credential snapshot content. They are
test-artifact records, not valid credentials. They were not modified or deleted.

**Current behavior:** the Issued Badges list renders them as “Credential data
unavailable”; their detail routes return a safe not-found response. Valid credentials
continue to render and verify normally.

**Proposed reconciliation (requires approval; not performed):**

1. Export the 27 IDs/public IDs and their related student/class/badge/issuer IDs to a
   quarantine manifest.
2. Confirm no real notification, external link, or business process depends on those
   public IDs.
3. Preferred path: quarantine the test-artifact rows from operational views and remove
   the associated disposable test users/classes in a separate, reviewed maintenance
   change.
4. If any row is reclassified as a real credential, reconstruct only legacy unsigned
   snapshots from authoritative Student/Class/Badge/Issuer records in a reviewed
   one-off backfill. Never fabricate signatures, proofs, or credential JSON.
5. Never delete historical issuance records without explicit approval and a prior audit
   export.
6. Re-run the integrity scan after remediation and keep the unavailable-row fallback as a
   defensive control.

## 3. Deferred UI features (nonblocking)

These are documented improvements, not release blockers:

- `/dashboard/activity` remains a paginated operational-history list; it can be converted
  to the shared table later.
- Student notification history has fixed pagination and no page-size/sort controls.
- Badge template galleries have no pagination for very large template collections.
- Notification sorting is fixed newest-first; user-selectable sorting is not exposed.

References: `docs/UI-UX-SYSTEM-AUDIT.md`, `docs/UI-UX-IMPLEMENTATION-REPORT.md`.

## 4. Security findings

- No private keys, provider API keys, bearer tokens, or real credentials were found in
  tracked or untracked source files.
- `.env` is ignored; `.env.example` contains placeholders only.
- Test files contain deliberate test-only passwords; these must remain confined to
  disposable fixtures and must not be reused in shared environments.
- The local live student test credential is not recorded in repository files; rotate
  local test credentials before shared use.
- `docs/screenshots/` may contain fixture PII; exclude or redact for external release.
- The application still lacks production monitoring, alerting, and automated secret
  rotation.

## 5. Residual test risk

- The combined suite passed once after the rate-limit isolation fix. Run it repeatedly in
  CI before release approval.
- E2E tests depend on the disposable database and Mailpit/no-SMTP configuration; they do
  not prove production email deliverability.
- Live direct-reset UI was verified by Playwright; live Mailpit email reset was verified
  manually.
