# HAU SOC Badging System Engineering Rules

- Read `REQUIREMENTS.md` before feature work.
- Map changes to requirement IDs in the final summary.
- Never bypass server-side authorization.
- Never commit secrets or real credentials.
- Every schema change requires a migration.
- Every protected feature requires authorization tests.
- Issuance and revocation changes require audit records.
- Batch import must always preview validation before commit.
- Issued credential records are historical; do not silently rewrite them after template edits.
- Prefer small reusable modules/components over monolithic files.
- Preserve the modern light design tokens across every screen.
- Run format/lint, typecheck, tests, and production build before claiming completion.
- If a requirement is ambiguous, choose the safest reversible implementation and document the assumption.
- Do not label the product “Open Badges certified” unless conformance/certification has actually been completed.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
