# Task 5 Brief: Public Verification, Sharing, Settings, and Revocation UI

Read this first — it is your requirements, with exact values to use verbatim.

Implement Task 5 from the approved Phase 6 plan using strict TDD. Read `AGENTS.md`, `REQUIREMENTS.md`, the approved Phase 6 design, the completed Task 1–4 public/settings/revocation interfaces, installed Next.js 16 Server/Client Components, Server Actions, Forms, and Data Security guides, plus the React best-practices skill before editing.

## Exact files

- Create `src/app/credentials/[publicId]/page.tsx`.
- Create `src/app/credentials/[publicId]/not-found.tsx`.
- Create `src/components/verification/public-credential.tsx`.
- Create `src/components/verification/public-credential.test.tsx`.
- Create `src/components/verification/share-controls.tsx`.
- Create `src/components/verification/share-controls.test.tsx`.
- Create `src/components/issuance/revoke-credential-form.tsx`.
- Create `src/components/issuance/revoke-credential-form.test.tsx`.
- Create `src/app/settings/page.tsx`.
- Create `src/app/settings/actions.ts`.
- Create `src/app/settings/actions.test.ts`.
- Modify `src/app/issued/[issuanceId]/page.tsx`.
- Modify `src/components/issuance/credential-detail.tsx`.
- Modify `src/app/globals.css`.
- Add only directly required focused page/navigation tests if existing conventions require them; list every extra file in the report.

## Design ruling

This is an incremental feature inside the established HAU SOC modern-light design system, not a redesign. Reuse the accepted tokens, shell, logo, typography, and component patterns from existing screens. Do not generate or invent a new visual concept, new navigation, fake metrics, marketing sections, or new art assets. Preserve true white/cool-slate surfaces, navy text, academic blue actions, semantic green/amber/red, light borders, restrained radii/shadows, title-case labels, and prominent badge artwork.

## Server/client and privacy boundaries

- The public page remains a Server Component and consumes only `PublicCredential` from Task 2. Malformed, missing, and corrupt credentials render the same `notFound()` result. Never serialize recipient email, full student number, student/internal issuance IDs, issuer user identity, roster data, raw snapshots, private paths, or audit data.
- `PublicCredential` renders active, expired, and revoked status; first name plus last initial; badge image/alt text; achievement/description/criteria; skills/alignments; immutable issuer identity/link/logo; class/course context; issued/expiration/revocation dates; safe public reason; current support contact; JSON-LD view/download; and explicit unsigned, Open Badges 3.0-aligned, not-certified language.
- Only browser-interactive islands are Client Components: sharing state and revocation pending/confirmation/form state. Keep client props minimal and serializable.
- `ShareControls` receives only canonical URL, a safe achievement-based title/text with no recipient identity, and `sharingEnabled`.
- Authenticated credential detail receives an explicit server-derived `canRevoke`; no client component receives actor, ownership, or private authorization records. UI visibility is never authorization.
- Settings page is Administrator-only on the server. Its action independently reauthenticates, accepts untrusted `FormData`, strictly validates only approved settings fields, delegates to Task 1 service, returns field-safe state, and revalidates affected settings/public routes.

## Required sharing behavior

- Copy canonical URL with accessible success/error live feedback.
- Use native Web Share when supported and fall back cleanly when unavailable/rejected.
- Provide correctly percent-encoded LinkedIn, Facebook, X, and `mailto:` composition links using the canonical URL and safe achievement title/text only. Email sharing opens the visitor's email client; it does not send SMTP email.
- External links use appropriate `target`, `noopener`, and `noreferrer`. Disabled system sharing removes/disables social/native/copy controls without hiding JSON-LD verification/export.

## Required revocation/settings behavior

- Revocation UI appears only for an active credential when `canRevoke` is true. Require a visible reason, explicit destructive confirmation, pending/disabled feedback, and accessible error/status messaging. Reuse the secure Task 4 action; do not add client-side authorization logic.
- Administrator settings cover issuer name, canonical URL, issuer logo path, optional support email/URL, and sharing enabled. Use title-case labels, descriptive help/errors, current values, pending state, and modern-light controls.

## Responsive/accessibility requirements

- Mobile-first public verification; badge artwork remains prominent.
- Unmistakable active/expired/revoked treatment without color alone.
- Semantic headings/lists/links/forms, keyboard-visible focus, programmatic labels/errors, useful alt text, accessible live regions, 44px-class touch targets where practical, reduced-motion support, long URL/text wrapping, and no horizontal overflow at 390px.
- Reuse small focused components; do not create monolithic pages or duplicate service/domain logic in React.
- Follow React performance guidance: parallelize independent server reads, keep client bundle boundaries narrow, minimize serialized props, avoid derived state effects and unnecessary memoization.

## Strict TDD and required coverage

Write named failing tests first, run them, and record correct RED evidence before production code.

- Public: active/expired/revoked, malformed/not-found, privacy sentinels, display identity, artwork/alt, dates, criteria, skills, alignments, issuer/support, class context, revocation reason, JSON-LD links, unsigned/aligned/not-certified notice.
- Sharing: exact encoded provider/mailto URLs, no recipient PII, copy success/failure, native share supported/unsupported/rejected, live feedback, sharing-disabled behavior, JSON export remains available, and external-link protections.
- Revocation: required reason, confirmation, pending/disabled state, authorized Administrator/owning-Faculty visibility, hidden for revoked/non-owner, action wiring, and accessible errors/status.
- Settings: unauthenticated/Faculty/suspended/role-changed denial, active Administrator render/update, strict field validation, no mutation on denial/invalid input, safe returned state, exact revalidation, title-case labels.
- Add page/navigation regression coverage for Server Component privacy/authorization boundaries where needed.

## Verification and report

Run focused UI/action/page suites, relevant Task 1–4 regressions, format, lint, typecheck, full unit tests, audit, and configured production build. Do not claim Task 5 done if anything fails.

Write the full report to `.superpowers/sdd/2026-08-15-phase-6-verification-sharing-revocation/task-5-report.md`, including requirement mapping, every changed file, RED/GREEN evidence, exact commands/counts, privacy and server/client self-review, responsive/accessibility notes, assumptions, and concerns.

Return only status, one-line verification summary, and concerns. Do not dispatch subagents.
