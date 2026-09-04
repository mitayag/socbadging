# Task 5 Independent Review Package

Review Task 5 only against `task-5-brief.md`, the approved Phase 6 design/plan, `AGENTS.md`, `REQUIREMENTS.md`, installed Next.js 16 Server/Client, Server Actions, Forms, and Data Security documentation, and React best practices.

## Exact scope

- `src/app/credentials/[publicId]/page.tsx`
- `src/app/credentials/[publicId]/not-found.tsx`
- `src/components/verification/public-credential.tsx`
- `src/components/verification/public-credential.test.tsx`
- `src/components/verification/share-controls.tsx`
- `src/components/verification/share-controls.test.tsx`
- `src/components/issuance/revoke-credential-form.tsx`
- `src/components/issuance/revoke-credential-form.test.tsx`
- `src/app/settings/page.tsx`
- `src/app/settings/actions.ts`
- `src/app/settings/actions.test.ts`
- `src/app/issued/[issuanceId]/page.tsx`
- `src/components/issuance/credential-detail.tsx`
- `src/app/globals.css`
- `package.json`
- `package-lock.json`
- `.superpowers/sdd/2026-08-15-phase-6-verification-sharing-revocation/task-5-report.md`

## Required independent checks

1. Return separate spec-compliance and code-quality verdicts.
2. Verify the public Server Component consumes only the privacy-safe DTO and uniform not-found handling cannot leak existence/corruption details.
3. Recursively inspect all public HTML/client props/link URLs for recipient email, full student number, internal IDs, raw snapshots, actor/ownership/audit data, and private paths.
4. Verify all active/expired/revoked metadata and notices are accurate, status is not color-only, JSON-LD links remain available, and no certification/signature claim is implied.
5. Verify exact encoded LinkedIn/Facebook/X/mailto URLs, copy and Web Share behavior/fallback/errors, accessible live feedback, disabled-sharing behavior, zero recipient PII, and external-link protections.
6. Verify revocation UI receives only a server-derived boolean/issuance ID, shows only when appropriate, requires reason + explicit confirmation, has pending/error accessibility, and relies on the Task 4 server action for authorization.
7. Verify Settings page/action independently enforce Administrator authorization server-side, strictly parse fixed FormData fields, produce field-safe state, create no alternate mutation/audit path, and revalidate appropriate routes.
8. Verify responsive/accessibility implementation at code level: semantic structure, labels/errors, keyboard focus, touch targets, long-content wrapping, reduced motion, 390px strategy, title-case labels, and established modern-light tokens.
9. Verify React/Next performance boundaries: independent server reads parallelized where possible, client islands narrow, props minimal, no unnecessary effects or large client imports.
10. Verify the `@prisma/config > deepmerge-ts@8.0.0` override is narrow, lockfile-consistent, audit-clean, and Prisma generate/build compatible; reject a broad or unrelated dependency mutation.
11. Run focused tests, typecheck/lint/audit, and static probes as appropriate. Browser/device acceptance remains Task 6, but flag any implementation defect visible from code/tests now.

Report Critical/Important/Minor findings with exact file/line evidence. Do not edit files or dispatch subagents.
