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
| Password reset                  | Future reset request endpoint                                                   | Account enumeration, mail abuse                                      | Shared `reset` policy before account lookup; generic response; audited completion                                                                                                    |
| Public verification HTML        | `GET /credentials/[publicId]`                                                   | Enumeration, scraping, public-ID disclosure in limiter storage       | Shared `public-html` policy before credential lookup; hashed client/public-ID key; generic 404/429; private no-store and no-referrer headers                                         |
| Public credential JSON/download | `GET /api/credentials/[publicId]`, `/download`                                  | Enumeration, bulk harvesting, cache leakage                          | Shared `public-json` policy before credential lookup; opaque stored key; generic 404/429; `Retry-After`; private no-store; no recipient email                                        |
| Roster import                   | `POST /api/classes/[classId]/roster/import/inspect`, `/preview`                 | Oversized input, parser exhaustion, MIME spoofing, horizontal access | Current Faculty and ownership checks before parsing; trusted-origin check; shared `import` policy; bounded body/file size; extension/MIME/content validation; preview before commit  |
| Batch issuance import           | `POST /api/classes/[classId]/issued/batch/inspect`, `/preview`                  | Oversized input, parser exhaustion, unauthorized class/badge         | Current Faculty and ownership checks before parsing; trusted-origin check; shared `import` policy; bounded body/file size; schema validation; explicit preview/commit                |
| Roster/issuance exports         | Class roster/issued exports, global issued export, batch report                 | Data exfiltration, CSV formula injection, resource exhaustion        | Current actor and ownership/RBAC checks; shared `export` policy before database/export work; CSV formula neutralization; private no-store                                            |
| Media                           | `GET /api/media/[...key]`                                                       | Path traversal, arbitrary file read, content sniffing, scraping      | Strict storage-key validation; root containment; supported image types only; `nosniff`; shared `media` policy before file I/O                                                        |
| Notification management         | `/notifications` and retry action                                               | Cross-tenant disclosure, destination rewriting, resend abuse         | Current persisted Administrator authorization; masked recipient DTO; immutable destination snapshots; audited atomic retry; trusted-origin Server Action protections                 |
| State-changing forms/actions    | Authentication, Faculty/Class/Roster/Badge/Issuance/Revocation/Settings actions | CSRF, stale-session privilege, mass assignment                       | Trusted origin; current persisted actor revalidation; strict schemas; ownership/RBAC checks; audit sensitive mutations                                                               |

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
The current credentials are unsigned Open Badges 3.0-aligned records; signing, conformance, wallet,
and external interoperability remain Phase 8 work and no certification claim is made.
