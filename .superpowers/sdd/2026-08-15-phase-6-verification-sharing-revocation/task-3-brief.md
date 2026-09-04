# Task 3 Brief: Public Rate Limiting and Verification Route Boundaries

Implement Task 3 from `docs/superpowers/plans/2026-08-15-phase-6-verification-sharing-revocation.md` using strict TDD. Read `AGENTS.md`, `REQUIREMENTS.md`, the approved Phase 6 design and plan, the installed Next.js 16 Route Handler documentation, and the completed Task 2 public credential service/JSON builder before editing.

## Exact files

- Create `src/platform/security/public-rate-limit.ts`.
- Create `src/platform/security/public-rate-limit.test.ts`.
- Create `src/app/api/credentials/[publicId]/route.ts`.
- Create `src/app/api/credentials/[publicId]/download/route.ts`.
- Create `src/app/api/credentials/public-credential-routes.test.ts`.
- Do not expand into UI, revocation, SMTP, student portal, or signing work.

## Required behavior

- Implement `checkPublicCredentialRateLimit(request, publicId)` with deterministic injectable time, a conservative 60 requests/minute default, a client-plus-credential key, bounded in-process storage, cleanup, and generic rejection suitable for the single-instance MVP.
- Do not trust arbitrary forwarded address chains. Define and test the exact trusted client-key policy; never put raw addresses or credential IDs in rejection bodies/logs.
- Validate asynchronous Next.js 16 route params and public IDs before service calls.
- Apply rate limiting before database-heavy public credential work.
- Inline and download routes return only Task 2 deterministic JSON-LD.
- Use `application/ld+json; charset=utf-8`, `Cache-Control: private, no-store`, `X-Content-Type-Options: nosniff`, and `Referrer-Policy: no-referrer` on all outcomes where applicable.
- Download uses a safe deterministic attachment filename. Denials and errors must not include attachment disposition.
- Malformed/missing/corrupt credentials share an indistinguishable generic 404; rate-limit denial is generic 429 with bounded `Retry-After`.
- Never expose email, student number, internal IDs, raw snapshots, private paths, validation details, or other sentinels.

## Required tests and evidence

- Write named failing limiter and route tests first and record RED evidence.
- Cover trusted key extraction, forwarded-chain rejection, per-key allowance, reset boundary, retry timing, cleanup/map bound, deterministic clock, active/revoked/expired JSON-LD, uniform 404, 429 before service work, headers, safe filename, no attachment on denial, and recursive privacy sentinels.
- Run focused suites, relevant route/Task 2 regressions, format, lint, typecheck, full tests, audit, and configured production build.
- Write `.superpowers/sdd/2026-08-15-phase-6-verification-sharing-revocation/task-3-report.md` with requirement mapping, changed files, RED/GREEN evidence, exact checks/counts, assumptions, and concerns.
- Return only status, one-line verification summary, and concerns.
