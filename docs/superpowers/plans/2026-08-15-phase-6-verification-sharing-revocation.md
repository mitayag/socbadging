# Phase 6 Verification, Sharing, and Revocation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add privacy-safe public badge verification, Open Badges 3.0-aligned JSON/JSON-LD export, social sharing, typed issuer settings, and authorized audited revocation.

**Architecture:** A server-only public credential service converts immutable issuance snapshots into a narrow privacy-safe DTO and derives current lifecycle status without rewriting history. Thin public Next.js 16 pages/routes apply validation, security headers, and rate limiting; a separate transactional command service performs Administrator or owning-Faculty revocation with an atomic audit record. Typed singleton settings supply current support/public behavior while credential-critical issuer data remains issuance-time snapshot data.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript, Prisma 7, MariaDB 11.8, Zod, Vitest/Testing Library, Docker Compose, existing modern-light CSS tokens.

## Global Constraints

- Read `AGENTS.md`, `REQUIREMENTS.md`, and `docs/superpowers/specs/2026-08-15-phase-6-verification-sharing-revocation-design.md` completely before every task.
- Read relevant Next.js 16 guides under `node_modules/next/dist/docs/` before changing Route Handlers, Server Actions, pages, forms, or caching.
- Map work to FR-012, FR-013, FR-014, FR-015, FR-016, FR-020, FR-023 and acceptance criteria 9–15.
- Public recipient identity is first name plus last initial. Never expose email, full student number, internal issuance ID, student ID, issuer user ID, roster data, or raw database JSON.
- Issuance-time recipient, achievement, issuer, and credential snapshots are immutable. Status projection and revocation must not rewrite them.
- Active Faculty may revoke only credentials from currently owned classes; active Administrators may revoke any credential. Revalidate authorization inside the transaction.
- Revocation requires a bounded reason and atomically writes one `badge.revoked` audit record. Repeat revocation is idempotent and writes nothing.
- Public verification remains available for active, expired, and revoked credentials.
- JSON/JSON-LD output is unsigned and Open Badges 3.0-aligned; never claim certification or conformance.
- Email sharing is a `mailto:` composition link only. SMTP notification, student portal, signing, evidence upload, S3, wallet APIs, and Phase 7/8 work are out of scope.
- Preserve modern-light tokens, title-case labels, accessibility, responsive behavior, and reduced-motion support.
- Every schema change requires a forward Prisma migration. Every protected boundary requires authorization tests.
- Git commits/worktrees are unavailable because this workspace is not a Git repository; use task reports and exact-file review packages.
- Run format, lint, typecheck, full tests, audit, production build, MariaDB integration, Docker smoke/persistence, Browser acceptance, and independent review before completion.

---

### Task 1: Typed Issuer Settings Schema and Authorized Service

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260815_phase_6_system_settings/migration.sql`
- Create: `src/modules/settings/types.ts`
- Create: `src/modules/settings/services/system-settings-service.ts`
- Test: `src/modules/settings/services/system-settings-service.test.ts`

**Interfaces:**

- Produces `PublicSystemSettings` and `SystemSettingsInput` runtime schemas.
- Produces `getPublicSystemSettings(): Promise<PublicSystemSettings>` and `getAdminSystemSettings(actor): Promise<PublicSystemSettings>`.
- Produces `updateSystemSettings(actor, input): Promise<PublicSystemSettings>`.
- Later public services consume settings without reading environment variables directly.

- [ ] **Step 1: Write failing contracts/default tests**

Test a singleton `SystemSetting` record with fields `id = "default"`, issuer name/URL/logo path, nullable support contact, and `sharingEnabled`. Assert blank database state falls back to validated `getServerEnv()` values and never returns secrets.

```ts
expect(await getPublicSystemSettings()).toEqual({
  issuerName: "Holy Angel University — School of Computing",
  issuerUrl: "http://localhost:3000",
  issuerLogoPath: "/images/hausoclogo.png",
  supportContact: null,
  sharingEnabled: true,
});
```

- [ ] **Step 2: Write failing authorization/audit tests**

Cover unauthenticated, Faculty, suspended Administrator, and role-changed denial before mutation; active Administrator success; strict URL/root-relative-path/support-contact validation; and a single `settings.updated` audit record in the same transaction containing changed field names only.

```ts
await expect(updateSystemSettings(facultyActor, validInput)).rejects.toThrow(
  "Administrator access required",
);
expect(auditCreate).not.toHaveBeenCalled();
```

- [ ] **Step 3: Verify RED**

Run `npm test -- src/modules/settings/services/system-settings-service.test.ts`. Expect missing-module/schema failures.

- [ ] **Step 4: Add schema and forward migration**

Add a typed singleton table rather than arbitrary JSON keys:

```prisma
model SystemSetting {
  id                String   @id @default("default") @db.VarChar(32)
  issuerName        String?  @map("issuer_name") @db.VarChar(191)
  issuerUrl         String?  @map("issuer_url") @db.VarChar(2048)
  issuerLogoPath    String?  @map("issuer_logo_path") @db.VarChar(1024)
  supportContact    String?  @map("support_contact") @db.VarChar(2048)
  sharingEnabled    Boolean  @default(true) @map("sharing_enabled")
  updatedByUserId   String?  @map("updated_by_user_id")
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  @@map("system_settings")
}
```

Use a nullable scalar `updatedByUserId` without a destructive cascade. Migration creates exactly this table and index only if justified by query shape.

- [ ] **Step 5: Implement the server-only service**

Use `import "server-only"`, Zod bounds, safe root-relative logo validation, exact Administrator authorization both before work and inside the mutation transaction, environment fallback, singleton upsert, and atomic audit creation.

- [ ] **Step 6: Verify GREEN and migration**

Run Prisma format/generate, deploy the migration to disposable MariaDB, focused tests, format, lint, typecheck, full tests, and configured production build. Record evidence in the Task 1 report.

---

### Task 2: Privacy-Safe Public Credential and JSON-LD Services

**Files:**

- Create: `src/modules/verification/types.ts`
- Create: `src/modules/verification/services/public-credential-service.ts`
- Test: `src/modules/verification/services/public-credential-service.test.ts`
- Create: `src/modules/verification/services/public-credential-json.ts`
- Test: `src/modules/verification/services/public-credential-json.test.ts`

**Interfaces:**

- Produces `PublicCredential`, `PublicCredentialStatus`, and runtime schemas.
- Produces `getPublicCredential(publicId, now?): Promise<PublicCredential>`.
- Produces `buildPublicCredentialJson(detail): PublicOpenBadgeCredential` and `serializePublicCredentialJson(detail): string`.

- [ ] **Step 1: Write failing identity/status/privacy tests**

Cover `Maria Santos -> Maria S.`, single-token/Unicode names, malformed public IDs, uniform not found, effective status precedence (`REVOKED`, then expired-at-now, then active), and snapshot corruption. Recursively assert the public DTO contains none of the private sentinel values.

```ts
expect(detail.recipientDisplayName).toBe("Maria S.");
expect(JSON.stringify(detail)).not.toMatch(/maria@example\.edu|2026-00001|student-id|issuance-id/);
```

- [ ] **Step 2: Write failing JSON-LD tests**

Assert preserved context/type/issuer/achievement/hashed subject identifier, current lifecycle metadata, canonical public URL, revoked/expired fields, deterministic output, and absence of private fields. Assert the output explicitly reports unsigned status without adding a fake proof.

- [ ] **Step 3: Verify RED**

Run both focused files and confirm missing-module failures.

- [ ] **Step 4: Implement narrow runtime-validated DTO projection**

Select only `publicId`, persisted status/dates/revocation fields, and the four snapshot JSON columns. Reuse or extract shared snapshot schemas without exporting private DTOs to clients. Merge `getPublicSystemSettings()` only for support/sharing behavior; issuer credential metadata remains from the issuance snapshot.

```ts
export function effectiveCredentialStatus(input: {
  status: "ACTIVE" | "REVOKED" | "EXPIRED";
  expiresAt: Date | null;
  now: Date;
}): "ACTIVE" | "REVOKED" | "EXPIRED" {
  if (input.status === "REVOKED") return "REVOKED";
  if (input.expiresAt && input.expiresAt <= input.now) return "EXPIRED";
  return "ACTIVE";
}
```

- [ ] **Step 5: Implement JSON-LD status projection**

Clone validated snapshot values into a new serializable object, keep the SHA-256 subject identity, add current credential status/revocation metadata using a documented extension object, omit `proof`, and never mutate `credentialJson`.

- [ ] **Step 6: Verify GREEN**

Run focused tests, issuance snapshot/query regressions, format, lint, typecheck, full tests, and build.

---

### Task 3: Public Rate Limiting and Verification Route Boundaries

**Files:**

- Create: `src/platform/security/public-rate-limit.ts`
- Test: `src/platform/security/public-rate-limit.test.ts`
- Create: `src/app/api/credentials/[publicId]/route.ts`
- Create: `src/app/api/credentials/[publicId]/download/route.ts`
- Test: `src/app/api/credentials/public-credential-routes.test.ts`

**Interfaces:**

- Produces `checkPublicCredentialRateLimit(request, publicId): { allowed: boolean; retryAfterSeconds: number }` with bounded in-process storage suitable for the single-instance MVP.
- Route Handlers return the Task 2 JSON-LD representation inline or as an attachment.

- [ ] **Step 1: Write failing bounded limiter tests**

Cover trusted request key extraction without trusting arbitrary forwarded chains, per-key allowance, reset window, generic rejection, cleanup/bounded map behavior, and deterministic injected clock. Use a conservative default such as 60 requests per minute per client key and credential identifier.

- [ ] **Step 2: Write failing Route Handler tests**

Cover valid active/revoked/expired output, malformed/missing IDs as identical 404, snapshot failure as generic 404, 429 before database work, exact `application/ld+json`, `private, no-store`/security headers, safe attachment filename, no attachment header on denial, and no private sentinel values.

- [ ] **Step 3: Verify RED**

Run the two focused suites and confirm missing modules/routes.

- [ ] **Step 4: Implement the limiter and thin routes**

Follow installed Next.js 16 Route Handler documentation. Validate `RouteContext` params before service calls, rate-limit before database-heavy work, and return only the service serialization.

```ts
const headers = {
  "Cache-Control": "private, no-store",
  "Content-Type": "application/ld+json; charset=utf-8",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "no-referrer",
};
```

- [ ] **Step 5: Verify GREEN**

Run focused tests, route regressions, format, lint, typecheck, full tests, and build.

---

### Task 4: Transactional Revocation Service, Action, and MariaDB Concurrency

**Files:**

- Create: `src/modules/issuance/services/revocation-service.ts`
- Test: `src/modules/issuance/services/revocation-service.test.ts`
- Create: `src/modules/issuance/services/revocation-service.integration.test.ts`
- Create: `src/app/issued/[issuanceId]/revocation-actions.ts`
- Test: `src/app/issued/[issuanceId]/revocation-actions.test.ts`

**Interfaces:**

- Produces `revokeCredential(actor, { issuanceId, reason }): Promise<{ issuanceId; publicId; alreadyRevoked }>`.
- Produces a thin Server Action that accepts only `FormData`, authenticates independently, delegates to the service, revalidates authenticated/public paths, and redirects with `notice=revoked|existing`.

- [ ] **Step 1: Write failing validation/authorization tests**

Cover blank/overlong/control-character reason, malformed ID, unauthenticated, suspended/deleted/role-changed actor, owning Faculty success, non-owner safe denial, Administrator success, missing issuance safe denial, and no write/audit on every denial.

- [ ] **Step 2: Write failing transaction/idempotency tests**

Assert authoritative actor/issuance/class ownership locking reads, one update plus one `badge.revoked` audit in the same transaction, audit context limited to issuance/public/class IDs and reason length/category rather than recipient data, immutable snapshots untouched, already-revoked no-op, and expired-active credentials remain revocable.

- [ ] **Step 3: Write failing real MariaDB integration tests**

Cover successful atomic revoke/audit, forced audit failure rolls back status fields, repeat revocation writes no second audit, concurrent revoke produces one mutation/audit, ownership/actor status change before lock denies, and public service immediately projects revoked status.

- [ ] **Step 4: Verify RED**

Run unit/action suites and confirm missing service/action; run Docker integration and confirm the new suite is absent.

- [ ] **Step 5: Implement the transactional service**

Use MariaDB authoritative locking reads as established by Phase 5, return validated full rows directly from locks, and fail closed on exact snapshot-conflict errors. Never update snapshot JSON columns.

```ts
await tx.badgeIssuance.update({
  where: { id: issuance.id },
  data: { status: "REVOKED", revocationReason: reason, revokedAt: now },
  select: { id: true },
});
await tx.auditLog.create({
  data: {
    actorUserId: actor.id,
    action: "badge.revoked",
    entityType: "BadgeIssuance",
    entityId: issuance.id,
    contextJson,
  },
});
```

- [ ] **Step 6: Implement the secure action**

Treat the action as a public POST boundary per Next.js documentation. Reauthenticate, validate only ID/reason, call the service, revalidate `/issued`, `/issued/{issuanceId}`, `/credentials/{publicId}`, and relevant class paths before redirect.

- [ ] **Step 7: Verify GREEN**

Run focused tests, Phase 4/5 issuance regressions, Docker MariaDB integration, format, lint, typecheck, full tests, and build.

---

### Task 5: Public Verification, Sharing, Settings, and Revocation UI

**Files:**

- Create: `src/app/credentials/[publicId]/page.tsx`
- Create: `src/app/credentials/[publicId]/not-found.tsx`
- Create: `src/components/verification/public-credential.tsx`
- Test: `src/components/verification/public-credential.test.tsx`
- Create: `src/components/verification/share-controls.tsx`
- Test: `src/components/verification/share-controls.test.tsx`
- Create: `src/components/issuance/revoke-credential-form.tsx`
- Test: `src/components/issuance/revoke-credential-form.test.tsx`
- Create: `src/app/settings/page.tsx`
- Create: `src/app/settings/actions.ts`
- Test: `src/app/settings/actions.test.ts`
- Modify: `src/app/issued/[issuanceId]/page.tsx`
- Modify: `src/components/issuance/credential-detail.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Public Server Component consumes only `PublicCredential`.
- `ShareControls` receives only canonical URL, safe title, and `sharingEnabled`.
- Authenticated credential detail receives an explicit `canRevoke` boolean and the revocation action; no client component receives actor or private authorization records.

- [ ] **Step 1: Write failing public page/status tests**

Cover active, expired, revoked, malformed/not-found, first-name-plus-last-initial display, no email/student number/internal IDs, badge alt text, dates, criteria, skills, alignments, issuer/support, unsigned/not-certified notice, and JSON-LD links.

- [ ] **Step 2: Write failing sharing tests**

Cover exact encoded LinkedIn/Facebook/X/`mailto:` URLs, copy success/failure, Web Share supported/unsupported behavior, accessible live feedback, disabled-by-settings behavior, external link protections, and zero recipient PII.

- [ ] **Step 3: Write failing revocation/settings UI tests**

Cover visible required reason, confirmation, pending/disabled state, Administrator and owning-Faculty controls, absent controls for revoked state/non-owner, Administrator-only settings page/action, strict validation, and title-case labels.

- [ ] **Step 4: Verify RED**

Run focused page/component/action tests and confirm missing UI.

- [ ] **Step 5: Implement Server/Client boundaries**

Keep public/settings/detail pages as Server Components. Limit Client Components to share clipboard/Web Share state and revocation pending/confirmation state. Start independent server reads together after actor resolution and pass minimal serialized props.

- [ ] **Step 6: Implement responsive modern-light styling**

Use the existing tokens and shell conventions. Public verification is highly mobile-friendly, badge art remains prominent, revoked/expired banners are unmistakable, buttons have visible focus/touch targets, long URLs wrap, and 390px has no horizontal overflow. Respect `prefers-reduced-motion`.

- [ ] **Step 7: Verify GREEN**

Run focused UI/action tests, page/navigation regressions, format, lint, typecheck, full tests, and build.

---

### Task 6: Full Verification, Docker, Browser Acceptance, and Traceability

**Files:**

- Modify: `README.md` for public verification/sharing/revocation/settings/rate-limit behavior.
- Modify: `.env.example` only if a non-secret Phase 6 setting remains environment-configured.
- Create: `.superpowers/sdd/2026-08-15-phase-6-verification-sharing-revocation/` evidence reports.

**Interfaces:**

- Verifies the complete Phase 6 system without adding Phase 7/8 features.

- [ ] **Step 1: Run the fresh complete quality gate**

Sequentially run formatting, lint, typecheck, all unit tests, `npm audit`, and configured production build. Record exact counts/exit codes and fix/rerun every failure.

- [ ] **Step 2: Run MariaDB and Docker acceptance**

Run the full Docker integration suite, rebuild images, apply all migrations, verify no pending migration, healthy DB/web, HTTP 200 health, clean relevant logs, and persistence across a MariaDB restart.

- [ ] **Step 3: Run anonymous Browser acceptance**

Using the in-app Browser, verify active/expired/revoked public credentials, anonymous access, first-name-plus-last-initial privacy, no email/student number/internal IDs, JSON-LD inline/download, copy/Web Share fallback and social/email-client URLs, rate-limit denial safety, page identity, no overlay, and clean console.

- [ ] **Step 4: Run authenticated revocation/settings Browser acceptance**

Verify owning Faculty revocation and Administrator global revocation with required reason, immediate public status, preserved history, one audit each, repeat idempotency, non-owner safe denial, Administrator settings update, and absence of controls for unauthorized actors.

- [ ] **Step 5: Run responsive/accessibility acceptance**

At desktop and 390×844 verify badge prominence, labels, keyboard focus, status announcements, confirmation/pending feedback, touch targets, reduced-motion behavior where observable, wrapping, and no horizontal overflow.

- [ ] **Step 6: Final independent review and requirements audit**

Review exact Phase 6 files against the approved spec. Map evidence to FR-012, FR-013, FR-014, FR-015, FR-016, FR-020, FR-023 and acceptance criteria 9–15. List Phase 7 hardening, Phase 8 signing/conformance/interoperability, student portal, and SMTP notifications as remaining. Do not claim certification.

## Plan Self-Review

- All approved design sections map to Tasks 1–6.
- Schema work has a forward migration and authorization tests.
- Public DTOs are structurally incapable of carrying private roster and recipient fields.
- Public HTML and JSON use one lifecycle/status source of truth.
- Revocation is server-authorized, transactional, audited, idempotent, and snapshot-preserving.
- Real MariaDB tests cover rollback and concurrency rather than mocks alone.
- UI tasks preserve Server Component boundaries and minimal client serialization.
- Final verification covers anonymous, Faculty, Administrator, desktop, mobile, Docker, persistence, and traceability.
- No task adds SMTP email, a student portal, signing, evidence storage, wallet APIs, or certification claims.
- No placeholder instructions or undefined cross-task interfaces remain.
