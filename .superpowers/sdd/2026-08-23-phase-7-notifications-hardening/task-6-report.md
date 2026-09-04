# Task 6 Report — Shared Rate Limiting and Security Regression Suite

## Implemented

- MariaDB-backed fixed-window rate-limit buckets with SHA-256 minimized keys, policy isolation,
  atomic increments, deterministic expiry, and bounded opportunistic cleanup.
- Shared policies for login, future password reset, public credential HTML/JSON, imports, exports,
  and media.
- Trusted-proxy behavior is disabled by default and accepts only the first valid forwarded IP when
  explicitly enabled.
- Login, credential verification/download, roster and batch inspection/preview, roster and
  issuance exports, batch reports, and media reads enforce limits at their server boundaries.
- Cross-origin import requests are rejected before authentication, rate-limit consumption, or body
  parsing.
- Global clickjacking, MIME sniffing, referrer, and browser-capability restriction headers.
- Roster upload MIME/extension consistency validation and consolidated regressions for XSS
  escaping, minimized injection-like key material, CSV formulas, storage traversal, vertical RBAC,
  and horizontal class ownership.
- Checked-in threat model and deployment-safe `TRUST_PROXY=false` example/Compose configuration.

## Requirement Mapping

- FR-001: login abuse control and trusted-origin validation.
- FR-002: vertical role and horizontal ownership regression coverage.
- FR-006 and FR-011: import rate limits, trusted-origin validation, bounded upload processing, and
  roster MIME validation before preview work.
- FR-008: media rate limiting before file I/O plus existing validated artwork boundary.
- FR-013 and FR-015: public HTML/JSON/download rate limits with generic privacy-safe denials.
- FR-022: authenticated export limits before data retrieval and CSV formula regression coverage.
- Security requirements: shared abuse controls and explicit CSRF/XSS/injection/path
  traversal/authorization regression coverage.

## TDD and Verification Evidence

- RED evidence was recorded for missing login/public/import/export/media limits, missing trusted
  origin and global header controls, and roster MIME mismatch acceptance before implementation.
- Focused security checkpoint: 43 route/header tests passed.
- Consolidated security regression: 14 tests passed.
- Fresh disposable MariaDB: all 10 migrations deployed; 7 integration files and 32 tests passed,
  including concurrent limiter boundary behavior. The disposable container was removed.
- Format: passed.
- Lint: passed with zero warnings.
- TypeScript: passed.
- Unit/route/component suite: 82 files and 500 tests passed.
- Next.js 16.3 production build: passed with a non-routable syntactically valid build-time database
  URL; no database connection was used.
- Dependency audit: 0 vulnerabilities.

## Review

Independent delegation was not authorized. Exact-file self-review removed the obsolete
process-local public limiter so MariaDB is the sole production authority. Review confirmed raw
email/IP/public IDs are not persisted in limiter keys, forwarding headers are ignored by default,
heavy limits execute before parsing/query/file work after required authorization, and denials do
not echo sensitive key material.

## Residual Scope

- The `reset` policy is ready but remains unwired because no password-reset endpoint currently
  exists.
- Reverse-proxy deployment must set `TRUST_PROXY=true` only when the proxy overwrites
  `X-Forwarded-For`; direct deployments should retain the default.
- Backup/restore, structured operational logging/health, broader E2E/accessibility/performance,
  Docker acceptance, and final traceability remain in later Phase 7 tasks.
