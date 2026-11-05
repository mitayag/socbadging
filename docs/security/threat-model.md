# HAU SOC Badging System Threat Model

## Scope and trust boundaries

This model covers authentication, authenticated class workflows, public credential verification,
imports, exports, media, notifications, and administrative controls. Browser input, route
parameters, uploaded files, proxy headers, and public credential identifiers are untrusted. The
Next.js server, notification worker, and MariaDB are trusted only after server-side validation and
authorization. SMTP and reverse proxies are external deployment dependencies.

## Route inventory and controls

| Surface                         | Routes                                                                          | Primary threats                                                      | Required controls                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Login                           | `POST /api/auth/login`                                                          | Credential stuffing, account enumeration, forged origin              | Trusted-origin check; generic credentials response; shared `login` limiter keyed by privacy-minimized client identity and normalized account identifier; no raw email/IP persistence |
| Dashboard                       | `GET /dashboard`                                                                | Horizontal data disclosure, sensitive PII aggregation                | Current actor resolution; Administrator global scope; Faculty ownership scope; privacy-minimized recipient labels; revoked/expired credentials excluded from active counts           |
| Account settings                | `/account` display-name and password Server Actions                             | CSRF, stale-session privilege, password guessing                     | Current persisted actor; current-password verification; strict schemas; all sessions invalidated on password change; audit records; trusted-origin Server Action protections         |
| Password reset                  | Future reset request endpoint                                                   | Account enumeration, mail abuse                                      | Shared `reset` policy before account lookup; generic response; audited completion                                                                                                    |
| Public verification HTML        | `GET /credentials/[publicId]`                                                   | Enumeration, scraping, public-ID disclosure in limiter storage       | Shared `public-html` policy before credential lookup; hashed client/public-ID key; generic 404/429; private no-store and no-referrer headers                                         |
| Public credential JSON/download | `GET /api/credentials/[publicId]`, `/download`                                  | Enumeration, bulk harvesting, cache leakage                          | Shared `public-json` policy before credential lookup; opaque stored key; generic 404/429; `Retry-After`; private no-store; no recipient email                                        |
| Roster import                   | `POST /api/classes/[classId]/roster/import/inspect`, `/preview`                 | Oversized input, parser exhaustion, MIME spoofing, horizontal access | Current Faculty and ownership checks before parsing; trusted-origin check; shared `import` policy; bounded body/file size; extension/MIME/content validation; preview before commit  |
| Batch issuance import           | `POST /api/classes/[classId]/issued/batch/inspect`, `/preview`                  | Oversized input, parser exhaustion, unauthorized class/badge         | Current Faculty and ownership checks before parsing; trusted-origin check; shared `import` policy; bounded body/file size; schema validation; explicit preview/commit                |
| Roster/issuance exports         | Class roster/issued exports, global issued export, batch report                 | Data exfiltration, CSV formula injection, resource exhaustion        | Current actor and ownership/RBAC checks; shared `export` policy before database/export work; CSV formula neutralization; private no-store                                            |
| Media                           | `GET /api/media/[...key]`                                                       | Path traversal, arbitrary file read, content sniffing, scraping      | Strict storage-key validation; root containment; supported image types only; `nosniff`; shared `media` policy before file I/O                                                        |
| Notification management         | `/notifications` and retry action                                               | Cross-tenant disclosure, destination rewriting, resend abuse         | Current persisted Administrator authorization; masked recipient DTO; immutable destination snapshots; audited atomic retry; trusted-origin Server Action protections                 |
| State-changing forms/actions    | Authentication, Faculty/Class/Roster/Badge/Issuance/Revocation/Settings actions | CSRF, stale-session privilege, mass assignment                       | Trusted origin; current persisted actor revalidation; strict schemas; ownership/RBAC checks; audit sensitive mutations                                                               |

## Student portal surfaces

| Surface               | Routes                                                       | Primary threats                                      | Required controls                                                                                                                                         |
| --------------------- | ------------------------------------------------------------ | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Student activation    | `/student/activate/:token`                                   | Token replay, token theft, identity takeover         | SHA-256 token digests, 24-hour single-use expiry, verified email delivery, unique email/student mapping, Administrator review on conflicts, audit records |
| Student recovery      | `/student/recover`, `/student/recover/:token`                | Account enumeration, token replay, password guessing | Generic public response, `reset` rate limit, 30-minute single-use digest token, session invalidation, audit records                                       |
| Student wallet/detail | `/student`, `/student/badges`, `/student/badges/:issuanceId` | Horizontal access, ID enumeration                    | STUDENT role required, `StudentAccount.studentId` ownership filter on every query, generic not-found behavior, no recipient email in public DTOs          |
| Student downloads     | `/api/credentials/:publicId/image`, `/pdf`                   | SSRF, arbitrary file read, renderer abuse            | Immutable snapshot image path, local storage containment, image validation, bounded renderer input, export rate limit, no remote fetch                    |
| Notification resend   | Administrator/Faculty resend actions                         | Resend abuse, duplicate sends, cross-tenant access   | Current actor revalidation, Faculty ownership check, cooldown, `account` rate limit, audit records, outbox claim semantics                                |

## Shared rate-limit decisions

- MariaDB is the coordination store so limits apply across web instances.
- Persist only a versioned SHA-256 digest of policy plus normalized key material. Never persist raw
  email, IP address, public ID, session value, or route parameter.
- Fixed windows have deterministic boundaries, atomic increments, policy isolation, bounded expiry,
  and opportunistic bounded cleanup.
- Login/reset failures are fail-closed when the limiter cannot decide. Authenticated import/export
  and public verification return a generic service response without revealing the key.
- Caller-supplied forwarding headers are ignored unless trusted-proxy mode is explicitly enabled.
  When enabled, only the first syntactically valid address in the configured proxy header is used
  and it is hashed before persistence.

## Regression cases

- CSRF/origin: cross-origin state-changing requests are rejected before mutation.
- XSS: stored and reflected names/criteria render as text; email templates escape dynamic values.
- Injection: Prisma parameterization and allow-listed raw SQL identifiers prevent SQL injection.
- Spreadsheet injection: cells beginning with formula-control characters are neutralized.
- Uploads: file size, extension, MIME signature, bounded rows, and storage paths are validated.
- Enumeration: malformed/unknown public IDs share generic not-found responses; rate-limit denials do
  not echo identifiers.
- Authorization: Faculty are constrained to currently owned classes; Administrator-only functions
  revalidate the persisted role/status; public routes return privacy-minimized DTOs.

## Residual risks and Phase 8 boundary

Rate limiting reduces abuse but is not a substitute for reverse-proxy filtering and monitoring.
Phase 8 credentials are signed Open Badges 3.0-aligned records; legacy unsigned credentials remain
clearly labeled. Production HTTPS activation, official 1EdTech conformance, wallet interoperability,
and external approval remain deployment milestones and no certification claim is made.
