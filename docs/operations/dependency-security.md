# Dependency Security Baseline

**Reviewed:** 2026-11-05 (Stage 5D)  
**Canonical runtime:** Node.js 22  
**Framework:** Next.js 16.4.3 with `eslint-config-next@16.4.3`  
**React:** 19.2.8

## Production audit

`npm audit --omit=dev` reports **0 vulnerabilities** for the production dependency set.

The direct dependencies previously flagged in the Stage 5C baseline have been upgraded:

| Package                                                 | Current version |
| ------------------------------------------------------- | --------------- |
| `next`                                                  | 16.4.3          |
| `nodemailer`                                            | 10.3.1          |
| `zod`                                                   | 4.6.7           |
| `prisma` / `@prisma/client` / `@prisma/adapter-mariadb` | 7.10.1          |

## Development-only audit

A full `npm audit` (including dev tooling) reports 14 advisories (4 high, 10 moderate), primarily in
build/test tooling such as Vite. These are not copied into the production runner image, which contains
only the standalone Next.js output and production dependencies.

## Upgrade and release policy

1. Keep `npm audit --omit=dev` at zero critical/high findings before production release.
2. Re-check the full audit after tooling upgrades, but do not treat dev-only advisories as
   production dependencies without checking the runtime image contents.
3. Upgrade Node, Next.js, Prisma, and the signer libraries as separate reviewed changes.
4. Re-run format, lint, typecheck, unit, MariaDB integration, production build, and Playwright gates
   on Node 22 after every dependency change.
5. Pin production container images by digest and record the digests in the deployment change record.
6. Do not describe the product as Open Badges certified; conformance and certification remain
   external milestones.
