# Task 3 Independent Review Package

Review Task 3 only against `task-3-brief.md`, the approved Phase 6 design/plan, `AGENTS.md`, `REQUIREMENTS.md`, and the installed Next.js 16 Route Handler documentation.

## Exact scope

- `src/platform/security/public-rate-limit.ts`
- `src/platform/security/public-rate-limit.test.ts`
- `src/app/api/credentials/[publicId]/route.ts`
- `src/app/api/credentials/[publicId]/download/route.ts`
- `src/app/api/credentials/public-credential-routes.test.ts`
- `.superpowers/sdd/2026-08-15-phase-6-verification-sharing-revocation/task-3-report.md`

## Required independent checks

1. Review specification compliance and code quality separately.
2. Verify the limiter is actually bounded under adversarial key churn, has correct window/reset/retry semantics, and never retains/logs raw IPs or credential IDs.
3. Verify the proxy/client-key trust policy cannot be bypassed through arbitrary forwarded chains and is documented safely for the MVP topology.
4. Verify async params and public IDs are validated before service work; rate limiting precedes database work.
5. Verify malformed, missing, and corrupt records share a generic 404, while 429 is generic and includes a bounded correct `Retry-After`.
6. Verify exact content type, private/no-store and security headers on success/errors, safe attachment filename only on successful download, and no private sentinels.
7. Verify routes serialize only Task 2 JSON-LD and do not add UI, revocation, signing, or certification behavior.
8. Run focused tests and type checking as appropriate. Report findings by Critical/Important/Minor with exact file/line evidence.

Return separate `SPEC COMPLIANCE` and `CODE QUALITY` verdicts. Do not edit files.
