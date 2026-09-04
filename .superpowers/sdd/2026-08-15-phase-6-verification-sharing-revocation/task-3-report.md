# Task 3 Report — Public Rate Limiting and Verification Route Boundaries

## Status

DONE

## Requirement mapping

- **FR-012:** Routes validate the existing 32-character non-sequential public ID before any public-service work and use it only as an opaque per-credential rate-limit input.
- **FR-013:** Public JSON-LD routes return active, revoked, and expired projections through the existing privacy-safe Task 2 service, with uniform 404 handling for malformed, missing, and corrupt records.
- **FR-015:** Inline and download endpoints serialize only the deterministic Task 2 JSON-LD representation with `application/ld+json; charset=utf-8`.
- **FR-016:** Current revoked and expired lifecycle JSON-LD remains accessible through the same public boundary; no issuance snapshot is changed.
- **Acceptance criteria 9–13:** Public identifiers are validated, current lifecycle representation is available without recipient PII, responses are private/no-store, and a safe JSON attachment is available.

## Changed files

- `src/platform/security/public-rate-limit.ts` — bounded single-instance 60-request/minute public limiter with injectable deterministic time/store, anonymous per-credential keys, scheduled earliest-expiry cleanup, and bounded generic retry timing.
- `src/platform/security/public-rate-limit.test.ts` — proxy-header-rotation resistance, per-credential allowance, exact reset boundary, retry timing, deterministic clock, scheduled cleanup, and map-bound tests.
- `src/app/api/credentials/[publicId]/route.ts` — async Next.js 16 parameter validation, limiter-before-service boundary, deterministic inline JSON-LD, uniform generic errors, and explicit security/cache headers.
- `src/app/api/credentials/[publicId]/download/route.ts` — same public boundary with a validated deterministic JSON attachment filename only on successful output.
- `src/app/api/credentials/public-credential-routes.test.ts` — active/revoked/expired JSON-LD, uniform 404, rate-limit-before-service, headers, attachment safety, async parameter validation, and privacy-sentinel coverage.

No schema change or migration is required.

## Strict TDD evidence

### RED

The named limiter and route contracts were written before their production modules/routes existed, then executed:

```text
npm test -- src/platform/security/public-rate-limit.test.ts src/app/api/credentials/public-credential-routes.test.ts
```

Result: exit **1**. Both suites collected zero tests because `./public-rate-limit`, `./[publicId]/route`, and `./[publicId]/download/route` did not exist. The failures were missing-module route/limiter failures, as intended.

### GREEN

After the minimal limiter and route implementations:

```text
npm test -- src/platform/security/public-rate-limit.test.ts src/app/api/credentials/public-credential-routes.test.ts
```

Result: exit **0** — **2 files, 15 tests passed**.

After formatting and adding Task 2/public-snapshot regressions:

```text
npm test -- src/platform/security/public-rate-limit.test.ts src/app/api/credentials/public-credential-routes.test.ts src/modules/verification/services/public-credential-service.test.ts src/modules/verification/services/public-credential-json.test.ts src/modules/issuance/services/issuance-query-service.test.ts src/modules/issuance/services/credential-snapshot.test.ts
```

Result: exit **0** — **6 files, 84 tests passed**.

## Final verification

| Command                                                                                                   | Result                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run format`                                                                                          | exit 0 — Prettier reports all matched files formatted                                       |
| `npm run lint`                                                                                            | exit 0 — no warnings/errors                                                                 |
| `npm run typecheck`                                                                                       | exit 0 — no TypeScript errors                                                               |
| `npm test`                                                                                                | exit 0 — **49 files, 371 tests passed**                                                     |
| `npm audit`                                                                                               | exit 0 — **0 vulnerabilities**                                                              |
| `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build` | exit 0 — Next.js 16.3 production build completed; both public credential routes are dynamic |

## Assumptions

- `compose.yaml` exposes port 3000 directly, so this MVP has no authenticated framework/server client-address source. All caller-controlled address headers are ignored and each credential uses one conservative anonymous bucket.
- The opaque in-process map key combines the fixed anonymous key and public ID without retaining either raw value. A full active map rejects new keys rather than evicting active rate limits.
- Cleanup runs only at the recorded earliest active expiry. A full store reports the bounded ceiling until that expiry, then removes expired entries before admitting a new key.
- Route error bodies intentionally contain only a generic error string. They receive the same cache/referrer/MIME/nosniff headers as JSON-LD output, but no attachment disposition.

## Concerns

- The limiter is intentionally process-local and cannot coordinate multiple app instances; a distributed limiter belongs to later operational hardening.
- The existing full suite emits Node's `[DEP0129] _channel is deprecated` warning, but all tests pass.

## Review Fix Round — Anonymous Bucket and Scheduled Cleanup

The review was verified against the checked-in `compose.yaml`: the `web` service publishes `3000:3000`, so `X-Real-IP`, `Forwarded`, and `X-Forwarded-For` are caller-controlled in this MVP and cannot be used as identity.

### Strict TDD evidence

The following limiter regressions were written before the fix:

- rotating `X-Real-IP`, `Forwarded`, and `X-Forwarded-For` cannot obtain a fresh credential bucket;
- a full two-entry store populated 30 seconds apart returns `Retry-After: 15` at 45.001 seconds and admits the request exactly when the earliest entry expires;
- requests before the deterministic earliest expiry do not rescan active map entries.

```text
npm test -- src/platform/security/public-rate-limit.test.ts
```

Result: exit **1** — **3 failed, 3 passed**. Header rotation was allowed, a full staggered store returned 60 seconds rather than 15, and the tracking store observed 60 scans instead of 1.

The limiter now always uses its anonymous credential bucket, stores absolute expiry timestamps, tracks each store's earliest cleanup timestamp in a `WeakMap`, and scans only when that timestamp is reached. The pre-existing cleanup/bound test was updated from its obsolete header-derived-client setup to distinct credential keys. GREEN evidence:

```text
npm test -- src/platform/security/public-rate-limit.test.ts
npm test -- src/platform/security/public-rate-limit.test.ts src/app/api/credentials/public-credential-routes.test.ts src/modules/verification/services/public-credential-service.test.ts src/modules/verification/services/public-credential-json.test.ts src/modules/issuance/services/issuance-query-service.test.ts src/modules/issuance/services/credential-snapshot.test.ts
```

Result: both exit **0** — limiter **1 file, 6 tests passed**; focused regression **6 files, 85 tests passed**.

### Fix-round verification

| Command                                                                                                   | Result                                                                                      |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `npm run format`                                                                                          | exit 0 — Prettier reports all matched files formatted                                       |
| `npm run lint`                                                                                            | exit 0 — no warnings/errors                                                                 |
| `npm run typecheck`                                                                                       | exit 0 — no TypeScript errors                                                               |
| `npm test`                                                                                                | exit 0 — **49 files, 371 tests passed**                                                     |
| `npm audit`                                                                                               | exit 0 — **0 vulnerabilities**                                                              |
| `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build` | exit 0 — Next.js 16.3 production build completed; both public credential routes are dynamic |
