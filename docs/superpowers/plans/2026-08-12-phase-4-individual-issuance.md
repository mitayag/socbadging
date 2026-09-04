# Phase 4 — Individual Issuance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver secure, transaction-safe individual badge issuance with immutable credential snapshots, random public identifiers, authenticated records, JSON/CSV exports, and audit events.

**Architecture:** Extend the existing Next.js modular monolith with an `issuance` domain module. MariaDB constraints protect public-ID and tuple uniqueness; Prisma transactions atomically persist issuance and audit data; Server Components and protected route handlers consume independently authorized domain services.

**Tech Stack:** Next.js 16 App Router, React 19, strict TypeScript, Prisma 7, MariaDB 11.8, Zod, Vitest/Testing Library, Docker Compose.

## Global Constraints

- Implement FR-010, FR-012, FR-015, FR-020, FR-021, and FR-022.
- Preserve one issuance per `(classId, badgeTemplateId, studentId)`; duplicate submissions reuse the existing issuance.
- Snapshot issuer, achievement, recipient, artwork, criteria, alignment, and credential JSON at issuance.
- Use 24 random bytes encoded as base64url for public IDs.
- Never expose recipient email in public-facing credential JSON; hash normalized email with SHA-256.
- Faculty mutations require owned active class, active owned badge, and active enrollment; Administrators remain read-only.
- Issuance and `badge.issued` audit records commit in one transaction.
- Every schema change requires a checked-in migration.
- Do not implement batch issuance, public verification UI, sharing, revocation controls, email, signing, or certification claims.
- Preserve the modern light design system and responsive shared shell.
- Run format, lint, typecheck, automated tests, production build, Docker smoke, and role-specific browser QA before completion.

---

### Task 1: Issuance Schema and MariaDB Migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260812130000_phase_4_individual_issuance/migration.sql`
- Create: `src/modules/issuance/types.ts`

**Interfaces:**

- Produces Prisma `BadgeIssuance`, `BadgeIssuanceStatus`, and relations used by every later task.
- Produces snapshot TypeScript types independent of Prisma JSON types.

- [ ] **Step 1: Define snapshot types before schema consumers**

Create `RecipientSnapshot`, `AchievementSnapshot`, `IssuerSnapshot`, `OpenBadgeCredentialSnapshot`, `IssuanceListItem`, and `IssuanceResult` types matching the approved specification. Snapshot fields are explicit and versioned; do not use `Record<string, unknown>` for domain shapes.

- [ ] **Step 2: Add the Prisma model and relations**

Add `BadgeIssuanceStatus` and `BadgeIssuance` with the approved fields, restrictive relations, tuple uniqueness, public-ID uniqueness, and query indexes. Add relations to `User`, `Class`, `Student`, and `BadgeTemplate`.

- [ ] **Step 3: Create the checked-in MariaDB migration**

Write SQL that creates the enum-compatible status column, JSON snapshot columns, unique constraints, indexes, and restrictive foreign keys. Do not modify earlier migrations.

- [ ] **Step 4: Validate schema generation and migration SQL**

Run: `npm run db:generate`

Run the migration against the Docker MariaDB service using `npm run db:migrate` inside the migration container or an equivalent configured command.

Expected: Prisma generation succeeds and migration applies once without data loss.

---

### Task 2: Snapshot Builder and Open Badges-Aligned Serializer

**Files:**

- Create: `src/modules/issuance/services/credential-snapshot.ts`
- Create: `src/modules/issuance/services/credential-snapshot.test.ts`
- Modify: `src/config/env.ts`
- Modify: `.env.example`
- Modify: `compose.yaml`

**Interfaces:**

- Produces `generatePublicId(): string`.
- Produces `hashRecipientEmail(email: string): string`.
- Produces `calculateExpiresAt(issuedAt: Date, expiresAfterDays: number | null): Date | null`.
- Produces `buildCredentialSnapshots(input): { recipient; achievement; issuer; credential }`.
- Consumes canonical `APP_URL` and issuer defaults from validated server configuration.

- [ ] **Step 1: Write failing snapshot tests**

Cover these literal outcomes:

- generated public IDs match `^[A-Za-z0-9_-]{32}$` and two calls differ;
- `Student@Example.EDU` and `student@example.edu` yield the same 64-character SHA-256 hash;
- expiration adds the exact template-day count in UTC;
- no expiration rule returns `null`;
- issuer name/URL/logo match approved defaults;
- recipient private snapshot contains email while credential JSON contains only the normalized identity hash;
- credential contains the two approved contexts and the two approved types;
- achievement criteria, image, tags, and optional alignment are literal snapshot values;
- changing source input after construction does not change the serialized snapshot fixture.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/modules/issuance/services/credential-snapshot.test.ts`
Expected: FAIL because the serializer module does not exist.

- [ ] **Step 3: Add validated issuer configuration**

Add non-secret issuer defaults:

```text
ISSUER_NAME=Holy Angel University — School of Computing
ISSUER_URL defaults to APP_URL
ISSUER_LOGO_PATH=/images/hausoclogo.png
```

Validate URLs and resolve logo/media URLs against the canonical base URL.

- [ ] **Step 4: Implement minimal deterministic snapshot construction**

Use Node `randomBytes` and `createHash`; normalize email with `trim().toLowerCase()`. Construct fresh plain objects and ISO timestamps. Omit optional `tag`, `alignment`, and `validUntil` properties when absent rather than emitting undefined JSON members.

- [ ] **Step 5: Verify GREEN**

Run the focused snapshot tests and `npm run typecheck`.

Expected: all snapshot tests and type checking pass.

---

### Task 3: Transactional Issuance Service and Authorization

**Files:**

- Create: `src/modules/issuance/services/issuance-service.ts`
- Create: `src/modules/issuance/services/issuance-service.test.ts`

**Interfaces:**

- Produces `issueBadge(actor: Actor, input: { classId: string; badgeTemplateId: string; studentId: string }): Promise<IssuanceResult>`.
- Consumes Prisma transaction client, snapshot builder, `requireRole`, and `requireClassOwner`.
- Returns `{ issuanceId, publicId, alreadyIssued }` without exposing full snapshots to the action.

- [ ] **Step 1: Write failing service tests**

Use complete Prisma transaction fixtures to cover:

- owner Faculty success inserts exactly one issuance and one `badge.issued` audit entry;
- audit context contains only class, badge, student, and public IDs;
- Administrator is denied before database reads;
- non-owner Faculty is denied before issuance creation;
- inactive class, archived badge, removed enrollment, cross-class badge, and cross-class student are rejected without writes;
- duplicate pre-check returns the existing issuance with `alreadyIssued: true` and creates no audit entry;
- Prisma tuple-unique race is translated to the existing issuance;
- public-ID collision retries only the public-ID conflict;
- snapshot-builder failure and audit failure roll back the transaction.

- [ ] **Step 2: Verify RED**

Run: `npm test -- src/modules/issuance/services/issuance-service.test.ts`
Expected: FAIL because the issuance service is absent.

- [ ] **Step 3: Implement transaction-time validation and creation**

Require Faculty before lookup. Inside `prisma.$transaction`, load the class with owner, badge, and active enrollment/student. Check every ID/status/ownership boundary, reuse an existing tuple, build snapshots from loaded records, insert issuance, then insert audit.

- [ ] **Step 4: Handle concurrency constraints narrowly**

Recognize Prisma `P2002` targets. Tuple conflict reads and returns the existing issuance. Public-ID conflict retries generation with a small fixed maximum. Other database errors propagate and roll back.

- [ ] **Step 5: Verify GREEN and mutation safety**

Run focused tests. Mentally mutate each authorization/status check and confirm a named test fails. Run `npm run typecheck`.

---

### Task 4: Authorized Issuance Queries, Filters, Detail, and CSV

**Files:**

- Create: `src/modules/issuance/services/issuance-query-service.ts`
- Create: `src/modules/issuance/services/issuance-query-service.test.ts`
- Create: `src/modules/issuance/services/issuance-csv.ts`
- Create: `src/modules/issuance/services/issuance-csv.test.ts`

**Interfaces:**

- Produces `listIssuances(actor, filters)` with 20-row pagination and role scope.
- Produces `getIssuanceDetail(actor, issuanceId)` with safe ownership authorization.
- Produces `listIssueOptions(actor, classId)` containing active badge and enrollment options.
- Produces `buildIssuanceCsv(rows): Uint8Array` with BOM, CRLF, literal headers, and formula-safe cells.

- [ ] **Step 1: Write failing authorization/query tests**

Assert Administrator queries have no owner restriction; Faculty queries include `class.ownerUserId = actor.id`; class-scoped queries require ownership; unauthorized detail does not return protected data; options exclude archived badges and removed enrollments; search covers recipient name/student number/badge/class fields; status/class/badge filters and pagination are preserved.

- [ ] **Step 2: Write failing CSV tests**

Round-trip the CSV through the existing parser. Assert exact headers/order, UTF-8 names, private email only in the authorized export, and prefix protection for cells starting with `=`, `+`, `-`, or `@`.

- [ ] **Step 3: Implement authorized query services**

Apply authorization scope in the Prisma `where` clause and, for detail, return not found/authorization-safe failure without leaking another Faculty member's issuance. Parse JSON snapshots through narrow runtime schemas before returning them to UI/export code.

- [ ] **Step 4: Implement CSV generation**

Reuse or extract the roster CSV quoting/sanitization conventions. Return a BOM-prefixed `Uint8Array`; do not stream unsanitized database values.

- [ ] **Step 5: Verify focused tests and typecheck**

Run all Task 4 tests and `npm run typecheck`.

---

### Task 5: Server Actions, Protected Export Routes, and Route Tests

**Files:**

- Create: `src/app/classes/[classId]/issued/actions.ts`
- Create: `src/app/api/classes/[classId]/issued/export/route.ts`
- Create: `src/app/api/issued/export/route.ts`
- Create: `src/app/api/issued/[issuanceId]/credential/route.ts`
- Create: `src/app/api/issued/issuance-routes.test.ts`

**Interfaces:**

- `issueBadgeAction(formData)` calls only the issuance domain service and redirects to `/issued/{id}?notice=issued|existing`.
- CSV routes return `text/csv; charset=utf-8`, private no-store, and attachment filenames.
- Credential route returns `application/ld+json`, private no-store, and an attachment filename derived only from safe public ID.

- [ ] **Step 1: Write failing protected-route tests**

For credential, global CSV, and class CSV routes cover authorized Administrator/owner Faculty success plus unauthenticated and non-owner safe denial. Assert denial responses contain no attachment header or protected payload.

- [ ] **Step 2: Verify RED**

Run the route test file and confirm missing route failures.

- [ ] **Step 3: Implement the Faculty-only issue action**

Require a current Faculty actor server-side, validate all form IDs with Zod, call `issueBadge`, revalidate class/global issuance paths, and redirect using only the returned internal issuance ID and result flag.

- [ ] **Step 4: Implement protected exports**

Parse query filters once, call authorized domain queries, and set exact MIME, disposition, and cache headers. Return safe JSON 403/404 responses for policy failures.

- [ ] **Step 5: Verify routes**

Run focused route/service tests, lint, and typecheck.

---

### Task 6: Individual Issuance and Records UI

**Files:**

- Create: `src/app/classes/[classId]/issued/page.tsx`
- Create: `src/app/issued/page.tsx`
- Create: `src/app/issued/[issuanceId]/page.tsx`
- Create: `src/components/issuance/issue-badge-form.tsx`
- Create: `src/components/issuance/issue-badge-form.test.tsx`
- Create: `src/components/issuance/issuance-list.tsx`
- Create: `src/components/issuance/issuance-list.test.tsx`
- Modify: `src/app/classes/[classId]/students/page.tsx`
- Modify: `src/app/classes/[classId]/badges/page.tsx`
- Modify: `src/components/layout/navigation.ts`
- Modify: `src/components/layout/navigation.test.ts`
- Modify: `src/app/globals.css`

**Interfaces:**

- The issue form consumes active `badgeOptions`, active `studentOptions`, `classId`, and the server action.
- The list consumes authorized snapshot-derived view models and filter/export URLs.
- Detail consumes only `getIssuanceDetail` output, never live mutable template/student fields for credential-critical display.

- [ ] **Step 1: Write failing component and navigation tests**

Assert:

- Faculty sees badge/student selectors, confirmation summary, and `Issue Badge`;
- Administrator sees no issue form;
- empty badge/roster states disable issuance with actionable copy;
- selected badge/student update the confirmation summary;
- issuance list renders status, public ID, recipient, badge, issued date, detail link, and export link;
- `Issued Badges` is enabled for Administrator and Faculty navigation;
- class tabs contain Students, Badges, Issued, Settings with correct active state.

- [ ] **Step 2: Verify RED**

Run the new component/navigation tests and confirm the missing UI behavior fails.

- [ ] **Step 3: Implement class-scoped Issued page**

Load class workspace, issue options, and class issuance list in parallel after actor resolution. Render the form only for Faculty, notices for issued/existing outcomes, filters, paginated list, and class CSV export.

- [ ] **Step 4: Implement global list and authenticated detail**

Render role-scoped filters and global CSV export. Detail displays snapshotted artwork, achievement, recipient, issuer, dates, status, identifiers, unsigned/aligned notice, and credential JSON download.

- [ ] **Step 5: Update navigation and modern-light responsive styling**

Enable `Issued Badges` in the shared navigation. Add the Issued class tab consistently to Students and Badges pages. Use existing panels, tables/lists, status colors, focus tokens, and mobile stacking; avoid nested dashboard cards.

- [ ] **Step 6: Verify focused UI tests and full automated suite**

Run component/navigation tests, then `npm run format`, `npm run lint`, `npm run typecheck`, and `npm run test`.

---

### Task 7: Phase 4 Integration, Docker, and Browser Acceptance

**Files:**

- Modify: `README.md` only if new issuer configuration or issuance routes require setup documentation.
- Modify: `.env.example` and `compose.yaml` if Task 2 configuration was not already fully documented.

**Interfaces:**

- Validates the complete Phase 4 implementation on the production-like Docker topology.

- [ ] **Step 1: Run the complete quality gate**

Run:

```text
npm run format
npm run lint
npm run typecheck
npm run test
npm audit
DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging npm run build
```

Every command must exit 0. Report exact test counts and audit result.

- [ ] **Step 2: Rebuild Docker and apply migrations**

Run the configured `docker compose up --build -d --wait` smoke environment. Verify the migration container exits successfully, MariaDB and web are healthy, and `/api/health` returns 200.

- [ ] **Step 3: Perform Faculty browser acceptance**

On `http://localhost:3000`:

1. Sign in as the local Faculty test account.
2. Open an owned active class with an active badge and active student.
3. Open Issued, select one badge and student, verify confirmation, and issue.
4. Confirm redirect to detail, success notice, random public ID, snapshot fields, artwork, and JSON download.
5. Repeat the same submission and verify the existing credential is reused.
6. Verify class/global filters and CSV export.
7. Confirm no console errors, overlay, clipping, or horizontal overflow.

Create disposable badge/student data through existing UI only if required.

- [ ] **Step 4: Perform Administrator and negative acceptance**

Sign in as Administrator. Verify global issued records and detail are readable, Faculty-only issue controls are absent, and exports succeed. Verify a non-owner Faculty cannot open another Faculty member's detail/export. Automated tests may supply the second Faculty boundary if only one live account is available.

- [ ] **Step 5: Verify historical immutability**

After issuance, edit the source badge template and student display fields through authorized existing UI/service flows. Confirm the issued detail and credential JSON retain their original snapshots.

- [ ] **Step 6: Final requirements audit**

Map evidence to FR-010, FR-012, FR-015, FR-020, FR-021, FR-022, acceptance criteria 6 and 9, and the integrity/security rules. Explicitly list Phase 5 batch issuance and Phase 6 public verification/revocation as remaining.

- [ ] **Step 7: Integration status**

Git branch/commit/PR actions are skipped because this workspace is not a Git repository. Preserve all files in place and report exact created/changed files.
