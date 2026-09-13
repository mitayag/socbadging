# Phase 8 Open Badges 3.0 Issuer Conformance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce locally tested, cryptographically signed Open Badges 3.0 credentials with interoperable revocation and evidence suitable for later official 1EdTech Issuer conformance submission.

**Architecture:** Next.js remains the authorization, orchestration, persistence, and public-verification boundary. A new internal-only Node signer service holds a Docker secret-mounted Ed25519 key, validates allowlisted JSON-LD, and produces/verifies `eddsa-rdfc-2022` Data Integrity proofs; MariaDB stores only immutable signed documents, public key metadata, status lists, allocations, replacements, and audits.

**Tech Stack:** Next.js 16.3, TypeScript 6, Node.js 22, React 19, MariaDB 11.8, Prisma 7, Zod 4, Docker Compose, `@digitalbazaar/data-integrity@2.5.0`, `@digitalbazaar/eddsa-rdfc-2022-cryptosuite@1.3.0`, `@digitalbazaar/ed25519-multikey@1.3.1`, `@digitalbazaar/vc-bitstring-status-list@2.0.1`, `jsonld@9.0.0`, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-08-25-phase-8-open-badges-issuer-conformance-design.md`

## Global Constraints

- Target Open Badges 3.0 Issuer-only conformance; Host, Displayer, wallet OAuth APIs, and social-account linking are excluded.
- Use Ed25519 with the `eddsa-rdfc-2022` Data Integrity cryptosuite.
- Private keys exist only in explicit read-only Docker secret paths; never store or log them.
- Use Bitstring Status List entries with purpose `revocation` for all Phase 8 credentials.
- Historical credentials are immutable; signed replacement is explicit, linked, audited, and notified.
- New credentials commit only after successful signing; signer failure creates no issuance or email job.
- Keep public recipient data privacy-minimized; never expose email or raw identity inputs.
- Never claim or imply 1EdTech certification before written external approval.
- Every schema change requires a migration and real MariaDB integration coverage.
- Every protected action requires server-side authorization tests.
- Issuance, replacement, key lifecycle, and revocation changes require audit records.
- Preserve the modern light design tokens and responsive/accessibility behavior.
- Read the applicable Next.js 16.3 guide under `node_modules/next/dist/docs/` before changing routes, server actions, caching, or runtime configuration.
- Use strict TDD for every behavior change: failing test, observed expected failure, minimal implementation, passing focused test, then regression suite.
- The workspace currently has no `.git` directory. Preserve the commit commands below as integration checkpoints; run them only after the user initializes or restores Git.

---

## File Structure

### New standards/signing modules

- `src/modules/open-badges/credential-schema.ts` — strict OpenBadgeCredential and proof schemas.
- `src/modules/open-badges/credential-builder.ts` — canonical Phase 8 document construction from immutable snapshots.
- `src/modules/open-badges/document-loader.ts` — allowlisted local/official JSON-LD context loader with no arbitrary network retrieval.
- `src/modules/open-badges/proof.ts` — signer-facing proof request/response types and verification result types.
- `src/modules/open-badges/status-list.ts` — status entry/list building, encoding, and lookup.
- `src/modules/open-badges/conformance-report.ts` — deterministic local evidence report.
- `src/modules/signing/signer-client.ts` — authenticated bounded-timeout internal signer client.
- `src/modules/signing/key-service.ts` — public key registration/lifecycle rules; no private material.
- `src/modules/signing/key-generator.ts` — explicit CLI key generation and public registration artifact.
- `src/signer.ts` — internal HTTP signer process.
- `src/signer/server.ts` — `/health`, `/v1/sign`, and `/v1/verify` routing.
- `src/signer/runtime.ts` — secret loading, key/public fingerprint validation, proof generation, proof verification.

### New application services/routes/UI

- `src/modules/issuance/services/status-allocation-service.ts` — short status-index reservation.
- `src/modules/issuance/services/signed-issuance-service.ts` — canonical build/sign/persist orchestration shared by individual and batch paths.
- `src/modules/issuance/services/replacement-service.ts` — explicit signed replacement workflow.
- `src/modules/verification/services/credential-verifier.ts` — proof, controller, validity, and revocation classification.
- `src/modules/verification/services/status-list-service.ts` — signed status-list retrieval/regeneration.
- `src/app/api/issuers/hau-soc/route.ts` — public issuer profile.
- `src/app/api/issuers/hau-soc/keys/[keyId]/route.ts` — public Multikey verification method.
- `src/app/api/status-lists/[listId]/route.ts` — signed status-list credential.
- `src/components/verification/cryptographic-verification.tsx` — accessible verification panel.
- `src/components/settings/signing-key-status.tsx` — Administrator-visible public key/signer state.
- `scripts/generate-signing-key.ts` — explicit test/production key command wrapper.
- `scripts/generate-conformance-report.ts` — local evidence artifact generator.
- `docs/runbooks/open-badges-key-lifecycle.md` — generation, mount, rotation, compromise, recovery.
- `docs/runbooks/open-badges-production-activation.md` — HTTPS and official-suite checkpoint.

### Modified boundaries

- `prisma/schema.prisma` plus `prisma/migrations/20260825_phase_8_open_badges_signing/migration.sql`.
- `src/config/env.ts`, `Dockerfile`, `compose.yaml`, `.env.example`, `package.json`, `package-lock.json`.
- Existing issuance, batch, revocation, query, verification, health, settings, public-route, component, integration, and E2E files named in the tasks below.

---

### Task 1: Pin Standards Libraries and Prove the Cryptographic Primitive

**Files:**

- Modify: `package.json`
- Modify: `package-lock.json`
- Create: `src/modules/open-badges/document-loader.ts`
- Create: `src/modules/open-badges/document-loader.test.ts`
- Create: `src/modules/open-badges/proof.ts`
- Create: `src/modules/open-badges/proof.test.ts`

**Interfaces:**

- Produces: `loadAllowlistedDocument(url: string): Promise<{ documentUrl: string; document: unknown }>`.
- Produces: `SignedDocumentSchema`, `SignRequestSchema`, `SignResponseSchema`, `VerifyRequestSchema`, `VerifyResponseSchema`.
- Produces: `VerificationOutcome = "VERIFIED" | "INVALID_PROOF" | "VERIFICATION_UNAVAILABLE"`.

- [ ] **Step 1: Read the current official proof vector and package API documents**

Record the exact Open Badges certification-guide revision, implementation-guide proof vector, package versions, and context URLs in `src/modules/open-badges/proof.test.ts` comments. Do not copy remote contexts into production until their official content and digest are reviewed.

- [ ] **Step 2: Install the pinned libraries**

Run:

```bash
npm install --save-exact @digitalbazaar/data-integrity@2.5.0 @digitalbazaar/eddsa-rdfc-2022-cryptosuite@1.3.0 @digitalbazaar/ed25519-multikey@1.3.1 @digitalbazaar/vc-bitstring-status-list@2.0.1 jsonld@9.0.0
```

Expected: lockfile pins the exact direct dependency versions and `npm audit` reports no known vulnerability requiring acceptance.

- [ ] **Step 3: Write failing allowlist and proof-vector tests**

Tests must prove:

```ts
await expect(loadAllowlistedDocument("https://attacker.invalid/context")).rejects.toThrow(
  "JSON-LD context is not allowlisted",
);
expect(
  SignRequestSchema.safeParse({ operation: "credential.sign", document: validFixture }),
).toMatchObject({ success: true });
expect(VerifyResponseSchema.parse({ outcome: "VERIFIED", keyId: "test-key" }).outcome).toBe(
  "VERIFIED",
);
```

Include an official-compatible EdDSA fixture whose proof verification fails after changing the achievement name.

- [ ] **Step 4: Run the tests and observe the expected failures**

Run:

```bash
npm test -- src/modules/open-badges/document-loader.test.ts src/modules/open-badges/proof.test.ts
```

Expected: FAIL because the schemas/loader do not exist.

- [ ] **Step 5: Implement the strict loader and transport schemas**

Allow exactly the reviewed VC v2, Open Badges 3.0.3, Open Badges extensions, Data Integrity, Multikey, and Bitstring Status List contexts. Resolve them from checked-in reviewed JSON fixtures; reject every unknown URL instead of fetching arbitrary network content.

- [ ] **Step 6: Run focused tests and dependency gates**

Run:

```bash
npm test -- src/modules/open-badges/document-loader.test.ts src/modules/open-badges/proof.test.ts
npm run lint
npm run typecheck
```

Expected: PASS.

- [ ] **Step 7: Integration checkpoint**

When Git exists:

```bash
git add package.json package-lock.json src/modules/open-badges
git commit -m "feat: add Open Badges cryptographic primitives"
```

---

### Task 2: Add Signing, Status, and Replacement Persistence

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260825_phase_8_open_badges_signing/migration.sql`
- Create: `src/modules/signing/key-service.ts`
- Create: `src/modules/signing/key-service.test.ts`
- Create: `src/modules/signing/key-service.integration.test.ts`
- Create: `src/modules/issuance/services/status-allocation-service.ts`
- Create: `src/modules/issuance/services/status-allocation-service.integration.test.ts`

**Interfaces:**

- Produces: `registerPublicSigningKey(input, actor): Promise<SigningKeyView>`.
- Produces: `activateSigningKey(keyId, actor): Promise<SigningKeyView>`.
- Produces: `retireSigningKey(keyId, actor)` and `markSigningKeyCompromised(keyId, actor)`.
- Produces: `reserveStatusAllocation(tx, issuancePublicId): Promise<{ listId: string; index: number; statusUrl: string }>`.

- [ ] **Step 1: Write failing Prisma/integration tests**

Prove exact invariants:

- Database holds no column named with `private`, `secret`, or `seed` in the new tables.
- Exactly one `ACTIVE` signing key is allowed under concurrent activation.
- Fingerprint and verification-method URL are unique.
- Status-list index is unique within one list and one issuance has at most one allocation.
- Replacement relations cannot point to the same issuance or form an immediate two-node cycle.
- Deleting keys, status lists, allocations, or superseded issuances referenced by history is restricted.

- [ ] **Step 2: Run integration tests and confirm schema failures**

Run:

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration -- src/modules/signing/key-service.integration.test.ts src/modules/issuance/services/status-allocation-service.integration.test.ts
```

Expected: FAIL because models/tables do not exist.

- [ ] **Step 3: Add Prisma models and the explicit SQL migration**

Create enums `SigningKeyStatus`, models `SigningKey`, `CredentialStatusList`, and `CredentialStatusAllocation`; extend `BadgeIssuance` with nullable legacy-safe fields:

```prisma
signedCredentialJson Json?   @map("signed_credential_json")
signingKeyId         String? @map("signing_key_id")
serializerVersion    Int?    @map("serializer_version")
supersedesId         String? @unique @map("supersedes_id")
supersededById       String? @unique @map("superseded_by_id")
```

Use restrictive foreign keys and indexes for public lookup, active key selection, list allocation, status updates, and replacement traversal. Enforce single active key with transactional locking in `key-service.ts`; MariaDB has no portable partial unique index.

- [ ] **Step 4: Implement server-side lifecycle services and audits**

Every activation, retirement, compromise, and registration writes one audit record in the same transaction. Only `ADMIN` actors are accepted by public actions; lower-level service tests still assert actor context is mandatory.

- [ ] **Step 5: Apply the migration to a fresh disposable database and rerun tests**

Run:

```bash
npm run db:generate
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration -- src/modules/signing/key-service.integration.test.ts src/modules/issuance/services/status-allocation-service.integration.test.ts
```

Expected: PASS with deterministic concurrent-allocation results.

- [ ] **Step 6: Integration checkpoint**

When Git exists:

```bash
git add prisma src/modules/signing src/modules/issuance/services/status-allocation-service*
git commit -m "feat: persist signing keys and credential status"
```

---

### Task 3: Build the Internal Signer and Key Generator

**Files:**

- Create: `src/modules/signing/key-generator.ts`
- Create: `src/modules/signing/key-generator.test.ts`
- Create: `scripts/generate-signing-key.ts`
- Create: `src/signer/runtime.ts`
- Create: `src/signer/runtime.test.ts`
- Create: `src/signer/server.ts`
- Create: `src/signer/server.test.ts`
- Create: `src/signer.ts`
- Create: `src/modules/signing/signer-client.ts`
- Create: `src/modules/signing/signer-client.test.ts`
- Modify: `src/config/env.ts`

**Interfaces:**

- Produces: `generateEd25519KeyPair(): Promise<{ privateKeyMultibase: string; publicKeyMultibase: string; fingerprint: string }>`.
- Produces: signer `GET /health`, `POST /v1/sign`, `POST /v1/verify`.
- Produces: `signCredential(document, correlationId): Promise<SignedOpenBadgeCredential>`.
- Produces: `verifyCredential(document, correlationId): Promise<VerifyResponse>`.

- [ ] **Step 1: Write failing key/runtime tests**

Tests prove restrictive file mode checks, malformed/mismatched private keys fail readiness, unknown contexts are rejected, the expected proof fields are present, and modifying any signed claim returns `INVALID_PROOF`. Assert logs omit credential contents, recipient values, and private/public key material.

- [ ] **Step 2: Write failing server/client tests**

Tests prove missing/wrong internal bearer token returns 401, payloads over 1 MiB return 413, unsupported operation returns 400, timeout maps to `SIGNER_UNAVAILABLE`, and `/health` exposes only `{ status, keyId, cryptosuite }`.

- [ ] **Step 3: Run focused tests and observe failures**

```bash
npm test -- src/modules/signing/key-generator.test.ts src/signer/runtime.test.ts src/signer/server.test.ts src/modules/signing/signer-client.test.ts
```

Expected: FAIL because signer modules do not exist.

- [ ] **Step 4: Implement key generation and runtime**

The CLI requires explicit `--private-key-path` and `--public-metadata-path`, refuses existing targets, creates the private file with mode `0600`, and prints only paths/fingerprint. It never prints the private key. The signer validates the mounted key against `SIGNING_KEY_ID`, `SIGNING_PUBLIC_MULTIKEY`, and `SIGNING_KEY_FINGERPRINT` at startup.

- [ ] **Step 5: Implement the internal HTTP service and client**

Use Node's built-in HTTP server, Zod request parsing, constant-time token comparison, `AbortSignal.timeout(SIGNER_TIMEOUT_MS)`, response-size limits, and structured non-secret logs. Bind to `0.0.0.0:3101` only inside the Compose network; do not publish a host port.

- [ ] **Step 6: Run focused tests and a local process smoke test**

```bash
npm test -- src/modules/signing/key-generator.test.ts src/signer/runtime.test.ts src/signer/server.test.ts src/modules/signing/signer-client.test.ts
npm run typecheck
```

Expected: PASS; wrong key metadata keeps `/health` unready.

- [ ] **Step 7: Integration checkpoint**

When Git exists:

```bash
git add src/signer.ts src/signer src/modules/signing scripts/generate-signing-key.ts src/config/env.ts
git commit -m "feat: add isolated Open Badges signer"
```

---

### Task 4: Build Canonical Credentials and Bitstring Status Lists

**Files:**

- Create: `src/modules/open-badges/credential-schema.ts`
- Create: `src/modules/open-badges/credential-schema.test.ts`
- Create: `src/modules/open-badges/credential-builder.ts`
- Create: `src/modules/open-badges/credential-builder.test.ts`
- Create: `src/modules/open-badges/status-list.ts`
- Create: `src/modules/open-badges/status-list.test.ts`
- Create: `src/modules/verification/services/status-list-service.ts`
- Create: `src/modules/verification/services/status-list-service.integration.test.ts`
- Modify: `src/modules/issuance/services/snapshot-schemas.ts`

**Interfaces:**

- Produces: `buildOpenBadgeCredential(input: SignedCredentialBuildInput): UnsignedOpenBadgeCredential`.
- Produces: `buildStatusListEntry(allocation): BitstringStatusListEntry`.
- Produces: `encodeRevocationList(indices: number[], capacity: number): string`.
- Produces: `readRevocationStatus(encodedList: string, index: number): boolean`.
- Produces: `regenerateSignedStatusList(tx, listId, signer): Promise<SignedStatusListCredential>`.

- [ ] **Step 1: Write failing strict-schema fixtures**

Hand-check a complete expected credential containing official contexts, canonical credential/issuer/key/schema/status URLs, `validFrom`, optional `validUntil`, hashed identity, achievement criteria/image/tags/alignments, and no email/student number/internal IDs.

- [ ] **Step 2: Write failing status-list tests**

Prove indices `0`, `7`, `8`, and the maximum capacity boundary; deterministic encoding; invalid index rejection; concurrent revocations preserve both bits; and expiration never sets a revocation bit.

- [ ] **Step 3: Run tests and observe failures**

```bash
npm test -- src/modules/open-badges/credential-schema.test.ts src/modules/open-badges/credential-builder.test.ts src/modules/open-badges/status-list.test.ts
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration -- src/modules/verification/services/status-list-service.integration.test.ts
```

- [ ] **Step 4: Implement strict canonical construction and status lists**

Reject unknown top-level fields, contexts, status purpose, schema identifiers, issuer/controller mismatch, unsafe URLs, invalid timestamps, and raw recipient identifiers. Store the fully signed status-list document after each successful regeneration.

- [ ] **Step 5: Run focused and regression tests**

```bash
npm test -- src/modules/open-badges src/modules/issuance/services/credential-snapshot.test.ts
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration -- src/modules/verification/services/status-list-service.integration.test.ts
```

Expected: PASS; legacy snapshot tests remain unchanged.

- [ ] **Step 6: Integration checkpoint**

When Git exists:

```bash
git add src/modules/open-badges src/modules/verification/services/status-list-service* src/modules/issuance/services/snapshot-schemas.ts
git commit -m "feat: build conformant credentials and status lists"
```

---

### Task 5: Require Signing for Individual Issuance

**Files:**

- Create: `src/modules/issuance/services/signed-issuance-service.ts`
- Create: `src/modules/issuance/services/signed-issuance-service.test.ts`
- Create: `src/modules/issuance/services/signed-issuance-service.integration.test.ts`
- Modify: `src/modules/issuance/services/issuance-service.ts`
- Modify: `src/modules/issuance/services/issuance-service.test.ts`
- Modify: `src/modules/issuance/services/issuance-service.integration.test.ts`
- Modify: `src/components/issuance/issue-badge-form.tsx`
- Modify: `src/components/issuance/issue-badge-form.test.tsx`

**Interfaces:**

- Produces: `prepareSignedIssuance(input): Promise<PreparedSignedIssuance>`.
- `PreparedSignedIssuance` includes public ID, source snapshots, immutable signed document, signing key ID, serializer version, and status reservation.

- [ ] **Step 1: Write failing service and MariaDB tests**

Prove signer timeout/invalid proof commits no issuance/audit/notification; success commits exactly one of each; signed JSON contains proof and status; duplicate/concurrent issuance does not consume a visible credential; private recipient fields never enter signer payload or audit context.

- [ ] **Step 2: Run the focused tests and observe expected failures**

```bash
npm test -- src/modules/issuance/services/signed-issuance-service.test.ts src/modules/issuance/services/issuance-service.test.ts
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration -- src/modules/issuance/services/signed-issuance-service.integration.test.ts src/modules/issuance/services/issuance-service.integration.test.ts
```

- [ ] **Step 3: Implement prepare-then-commit orchestration**

Keep signer I/O outside the main transaction. Recheck duplicate/ownership/key activation within the commit transaction. Map signer unavailability to a retryable user message and invalid payload/proof to a non-retryable safe message with a correlation ID.

- [ ] **Step 4: Add accessible issuance feedback**

Display “Credential signing is temporarily unavailable. No badge was issued. Try again.” for retryable failure. Do not expose internal signer codes. Preserve focus and live-region behavior.

- [ ] **Step 5: Run focused, issuance, notification, and authorization suites**

```bash
npm test -- src/modules/issuance/services/issuance-service.test.ts src/components/issuance/issue-badge-form.test.tsx src/modules/notifications/services/notification-outbox.test.ts
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration -- src/modules/issuance/services/issuance-service.integration.test.ts
```

- [ ] **Step 6: Integration checkpoint**

When Git exists:

```bash
git add src/modules/issuance/services src/components/issuance
git commit -m "feat: require signed individual issuance"
```

---

### Task 6: Require Signing for Batch Issuance

**Files:**

- Modify: `src/modules/issuance/services/batch-commit-service.ts`
- Modify: `src/modules/issuance/services/batch-commit-service.test.ts`
- Modify: `src/modules/issuance/services/batch-commit-service.integration.test.ts`
- Modify: `src/components/issuance/batch-issuance-wizard.tsx`
- Modify: `src/components/issuance/batch-issuance-wizard.test.tsx`
- Modify: `src/components/issuance/batch-result.tsx`
- Modify: `src/components/issuance/batch-result.test.tsx`

**Interfaces:**

- Consumes: `prepareSignedIssuance(input)` from Task 5.
- Produces: deterministic batch result containing only committed signed issuances and safe row-level preparation errors.

- [ ] **Step 1: Write failing batch tests**

Prove preview never signs, bounded signing concurrency never exceeds configured `SIGNER_BATCH_CONCURRENCY`, one signing failure commits zero new rows, retries remain idempotent, duplicates create no signatures/notifications, and success commits signed JSON/audit/outbox for every new row.

- [ ] **Step 2: Run tests and observe failures**

```bash
npm test -- src/modules/issuance/services/batch-commit-service.test.ts src/components/issuance/batch-issuance-wizard.test.tsx src/components/issuance/batch-result.test.tsx
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration -- src/modules/issuance/services/batch-commit-service.integration.test.ts
```

- [ ] **Step 3: Implement bounded all-or-nothing signed batch commit**

Prepare only validated new rows, preserve input ordering, abort before transaction on any signing failure, then revalidate ownership/duplicates and commit the prepared set atomically. Do not partially commit a signing batch.

- [ ] **Step 4: Update batch feedback**

Distinguish validation errors from “Signing unavailable; no credentials were issued.” Keep downloadable reports free of private signer diagnostics.

- [ ] **Step 5: Run full batch/import/notification regression tests**

```bash
npm test -- src/modules/issuance/services/batch- src/components/issuance/batch-
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration -- src/modules/issuance/services/batch-commit-service.integration.test.ts
```

- [ ] **Step 6: Integration checkpoint**

When Git exists:

```bash
git add src/modules/issuance/services/batch-commit-service* src/components/issuance/batch-*
git commit -m "feat: require signed batch issuance"
```

---

### Task 7: Integrate Standards-Based Revocation

**Files:**

- Modify: `src/modules/issuance/services/revocation-service.ts`
- Modify: `src/modules/issuance/services/revocation-service.test.ts`
- Modify: `src/modules/issuance/services/revocation-service.integration.test.ts`
- Create: `src/app/api/status-lists/[listId]/route.ts`
- Create: `src/app/api/status-lists/status-list-route.test.ts`
- Modify: `src/components/issuance/revoke-credential-form.tsx`
- Modify: `src/components/issuance/revoke-credential-form.test.tsx`

**Interfaces:**

- Consumes: `regenerateSignedStatusList(tx, listId, signer)` from Task 4.
- Produces: public status-list response with JSON-LD content type, no-store/revalidation-safe headers, ETag, and security headers.

- [ ] **Step 1: Write failing revocation/concurrency tests**

Prove one authorized revocation atomically updates issuance, audit, notification, allocation bit, and signed list; repeat revocation is idempotent; non-owner is denied; concurrent different-index revocations preserve both bits; signer failure rolls back every state change.

- [ ] **Step 2: Write failing route tests**

Prove unknown list is a generic 404, active list returns signed JSON-LD, responses expose no issuance/recipient mapping, and stale/unsigned list state returns 503 rather than an incorrect active result.

- [ ] **Step 3: Run focused tests and observe failures**

```bash
npm test -- src/modules/issuance/services/revocation-service.test.ts src/app/api/status-lists/status-list-route.test.ts
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration -- src/modules/issuance/services/revocation-service.integration.test.ts
```

- [ ] **Step 4: Implement transactional revocation and signed-list publication**

Use row/version locking, regenerate from committed allocation state inside a bounded retry strategy, and persist the signed list in the same successful transaction. Never modify stored signed credentials.

- [ ] **Step 5: Run revocation, notification, audit, route, and security regressions**

```bash
npm test -- src/modules/issuance/services/revocation-service.test.ts src/app/api/status-lists/status-list-route.test.ts src/modules/notifications/templates/email-templates.test.ts
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration -- src/modules/issuance/services/revocation-service.integration.test.ts
```

- [ ] **Step 6: Integration checkpoint**

When Git exists:

```bash
git add src/modules/issuance/services/revocation-service* src/app/api/status-lists src/components/issuance/revoke-credential-form*
git commit -m "feat: publish interoperable credential revocation"
```

---

### Task 8: Publish Issuer/Key Documents and Verify Credentials

**Files:**

- Create: `src/app/api/issuers/hau-soc/route.ts`
- Create: `src/app/api/issuers/hau-soc/keys/[keyId]/route.ts`
- Create: `src/app/api/issuers/issuer-routes.test.ts`
- Create: `src/modules/verification/services/credential-verifier.ts`
- Create: `src/modules/verification/services/credential-verifier.test.ts`
- Modify: `src/modules/verification/services/public-credential-json.ts`
- Modify: `src/modules/verification/services/public-credential-json.test.ts`
- Modify: `src/modules/verification/services/public-credential-service.ts`
- Modify: `src/modules/verification/types.ts`
- Modify: `src/app/api/credentials/[publicId]/route.ts`
- Modify: `src/app/api/credentials/[publicId]/download/route.ts`
- Modify: `src/app/api/credentials/public-credential-routes.test.ts`
- Create: `src/components/verification/cryptographic-verification.tsx`
- Create: `src/components/verification/cryptographic-verification.test.tsx`
- Modify: `src/components/verification/public-credential.tsx`
- Modify: `src/components/verification/public-credential.test.tsx`

**Interfaces:**

- Produces: `verifyPublicCredential(document, dependencies): Promise<{ outcome: "VERIFIED" | "REVOKED" | "EXPIRED" | "INVALID_PROOF" | "VERIFICATION_UNAVAILABLE"; keyId?: string; checkedAt: Date }>`.
- Produces: canonical issuer Profile and Multikey documents.

- [ ] **Step 1: Write failing issuer/key route tests**

Assert canonical IDs/controller, exact JSON-LD content type, public-key-only fields, retired keys remain available, compromised key includes public trust state without internal notes, cache/security headers, and generic unknown-key 404.

- [ ] **Step 2: Write failing verifier tests**

Cover valid, tampered, wrong controller, wrong key, revoked, expired, future `validFrom`, status unavailable, legacy unsigned, retired key, and compromised key. `VERIFIED` requires every proof/issuer/status/time check.

- [ ] **Step 3: Write failing UI/route tests**

Assert signed JSON/download is byte-equivalent to stored immutable JSON, public page shows accessible result text, legacy page never claims verified, and email/student number remain absent.

- [ ] **Step 4: Run focused tests and observe failures**

```bash
npm test -- src/app/api/issuers/issuer-routes.test.ts src/modules/verification/services/credential-verifier.test.ts src/app/api/credentials/public-credential-routes.test.ts src/components/verification/cryptographic-verification.test.tsx src/components/verification/public-credential.test.tsx
```

- [ ] **Step 5: Implement routes, verifier, and modern light panel**

Use no-store or bounded revalidation that cannot hide revocation. Show status using text plus existing accessible colors. Do not send private documents to the client; compute verification server-side and serialize only the safe result/key fingerprint/date.

- [ ] **Step 6: Run public verification, privacy, security-header, and responsive regressions**

```bash
npm test -- src/modules/verification src/app/api/credentials src/app/api/issuers src/components/verification
```

- [ ] **Step 7: Integration checkpoint**

When Git exists:

```bash
git add src/app/api/issuers src/app/api/credentials src/modules/verification src/components/verification
git commit -m "feat: verify and publish signed credentials"
```

---

### Task 9: Add Signed Replacement and Administrator Key UI

**Files:**

- Create: `src/modules/issuance/services/replacement-service.ts`
- Create: `src/modules/issuance/services/replacement-service.test.ts`
- Create: `src/modules/issuance/services/replacement-service.integration.test.ts`
- Modify: `src/app/settings/actions.ts`
- Modify: `src/app/settings/actions.test.ts`
- Modify: `src/app/settings/page.tsx`
- Modify: `src/app/settings/page.test.tsx`
- Create: `src/components/settings/signing-key-status.tsx`
- Create: `src/components/settings/signing-key-status.test.tsx`
- Modify: `src/components/issuance/credential-detail.tsx`
- Modify: `src/components/issuance/credential-detail.test.tsx`

**Interfaces:**

- Produces: `createSignedReplacement({ originalIssuanceId, actorId }): Promise<{ replacementId: string; publicId: string }>`.
- Produces Administrator actions for register/activate/retire/compromise using public metadata only.

- [ ] **Step 1: Write failing replacement tests**

Prove only Administrator may replace, original snapshot is unchanged, replacement has new ID/public ID/proof/status index, reciprocal links are correct, exactly one audit and notification are created, repeat/concurrent replacement is idempotent, and revoked originals cannot be made active without the explicit approved replacement policy result.

- [ ] **Step 2: Write failing key-action authorization tests**

Prove anonymous/Faculty requests are denied server-side; Administrator actions require confirmation intent, accept no private-key field, and create exact audit records.

- [ ] **Step 3: Write failing UI tests**

Assert legacy/superseded/replacement copy, reciprocal links, key fingerprint/cryptosuite/status/signer health, keyboard focus, live feedback, and absence of private-key controls/content.

- [ ] **Step 4: Run focused tests and observe failures**

```bash
npm test -- src/modules/issuance/services/replacement-service.test.ts src/app/settings/actions.test.ts src/components/settings/signing-key-status.test.tsx src/components/issuance/credential-detail.test.tsx
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration -- src/modules/issuance/services/replacement-service.integration.test.ts
```

- [ ] **Step 5: Implement replacement and public-metadata UI**

Reuse Task 5 signing orchestration, preserve historical source snapshots, and require explicit server action intent. Do not put key generation/upload in the browser.

- [ ] **Step 6: Run focused and authorization regressions**

```bash
npm test -- src/modules/issuance/services/replacement-service.test.ts src/app/settings src/components/settings src/components/issuance/credential-detail.test.tsx
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration -- src/modules/issuance/services/replacement-service.integration.test.ts
```

- [ ] **Step 7: Integration checkpoint**

When Git exists:

```bash
git add src/modules/issuance/services/replacement-service* src/app/settings src/components/settings src/components/issuance/credential-detail*
git commit -m "feat: add signed credential replacement and key controls"
```

---

### Task 10: Docker, Health, Secrets, and Operational Runbooks

**Files:**

- Modify: `Dockerfile`
- Modify: `compose.yaml`
- Modify: `.env.example`
- Modify: `src/config/env.ts`
- Modify: `src/platform/health/health.ts`
- Modify: `src/platform/health/health.test.ts`
- Modify: `src/app/api/health/route.test.ts`
- Create: `docs/runbooks/open-badges-key-lifecycle.md`
- Create: `docs/runbooks/open-badges-production-activation.md`
- Modify: `README.md`

**Interfaces:**

- Adds Compose `signer` service with internal port only and read-only secret mount.
- Extends readiness with `signer.status`, `signer.keyId`, and `signer.cryptosuite`; no secret/public key value.

- [ ] **Step 1: Write failing env/health/Compose tests**

Prove signing-enabled web requires signer URL/token/public metadata; signer requires secret file/key metadata; web readiness is degraded when signer unavailable; private secret path is never returned; Compose publishes no signer host port and mounts the key read-only.

- [ ] **Step 2: Run tests and observe failures**

```bash
npm test -- src/config src/platform/health src/app/api/health/route.test.ts
docker compose config
```

- [ ] **Step 3: Add Docker targets and Compose service**

Add `npm run signer`, a `signer` Docker target based on tools, a named Compose secret using explicit local file path, internal bearer token configuration, health check, `depends_on` readiness, and no `ports` entry. Do not commit a key file or real token.

- [ ] **Step 4: Document exact lifecycle and production activation commands**

The key runbook must cover generation, file permissions, public metadata registration, mount, activation, rotation, retirement, compromise, separate backup/recovery, and verification. The activation runbook must cover final HTTPS domain, stable URL replacement, DNS/TLS, external reachability, fresh production key, official-suite run, conformance recipient, retrieval demonstration, submission, and certification-wording gate.

- [ ] **Step 5: Run Docker secret/readiness smoke tests**

With a generated disposable test key:

```bash
docker compose build signer web
docker compose up -d db migrate signer web
docker compose ps
curl -fsS http://127.0.0.1:3000/api/health
```

Expected: db, signer, and web healthy; health reports matching key ID/cryptosuite without key material. Repeat with a mismatched public fingerprint and expect signer/web readiness failure.

- [ ] **Step 6: Integration checkpoint**

When Git exists:

```bash
git add Dockerfile compose.yaml .env.example package.json src/config src/platform/health src/app/api/health README.md docs/runbooks
git commit -m "ops: add secure Open Badges signing runtime"
```

---

### Task 11: Local Conformance Evidence, E2E, and Final Gates

**Files:**

- Create: `src/modules/open-badges/conformance-report.ts`
- Create: `src/modules/open-badges/conformance-report.test.ts`
- Create: `scripts/generate-conformance-report.ts`
- Create: `docs/conformance/open-badges-3-local-readiness.md`
- Modify: `e2e/global-setup.ts`
- Create: `e2e/phase8-open-badges-conformance.spec.ts`
- Modify: `README.md`
- Modify: `docs/TRACEABILITY.md` if present; otherwise create `docs/TRACEABILITY.md` with all existing mappings preserved from available documentation.

**Interfaces:**

- Produces: `buildLocalConformanceReport(results): LocalConformanceReport` with document/test/library versions, fixture digests, proof/status results, Docker evidence, and explicit `certified: false`.

- [ ] **Step 1: Write failing report tests**

Prove report generation is deterministic, redacts private/recipient data, refuses `certified: true`, contains exact spec/certification-guide/errata versions, and fails overall readiness when any required proof/schema/status/Docker gate fails.

- [ ] **Step 2: Write Phase 8 E2E tests**

Desktop and mobile projects must cover signed individual/batch issuance, public `VERIFIED`, revocation and signed status list, expiration, tamper/wrong-key fixture, signer outage with no commit, legacy display, signed replacement, retired key, compromised-key warning, Administrator key metadata, Faculty denial, email creation after signed commit, JSON downloads, privacy, keyboard/focus, responsive layout, and console/overlay cleanliness.

- [ ] **Step 3: Run E2E tests and observe expected failures**

```bash
TEST_DATABASE_URL="$TEST_DATABASE_URL" E2E_CONFIRM_DISPOSABLE_DATABASE=true E2E_BASE_URL=http://127.0.0.1:3100 npm run test:e2e -- e2e/phase8-open-badges-conformance.spec.ts
```

- [ ] **Step 4: Implement the report generator and fixtures**

Use machine-readable test result inputs and checked-in public fixtures. Generated Markdown must state: “Local readiness evidence only. This product is not 1EdTech certified.” Never include test private keys, recipient email, raw identity inputs, SMTP credentials, internal bearer tokens, or database URLs.

- [ ] **Step 5: Run complete automated gates sequentially**

```bash
npm run format
npm run lint
npm run typecheck
npm test
TEST_DATABASE_URL="$TEST_DATABASE_URL" npm run test:integration
DATABASE_URL="$TEST_DATABASE_URL" APP_URL=http://127.0.0.1:3100 npm run build
TEST_DATABASE_URL="$TEST_DATABASE_URL" E2E_CONFIRM_DISPOSABLE_DATABASE=true E2E_BASE_URL=http://127.0.0.1:3100 npm run test:e2e
```

Expected: every command exits 0 with exact test counts recorded in the local report.

- [ ] **Step 6: Run final Docker smoke and failure-mode tests**

Verify fresh volumes apply every migration; issue and verify one disposable badge; revoke it and observe the status bit; stop signer and prove issuance commits nothing; restart signer and prove recovery; inspect logs for secrets/PII; run backup/restore verification; confirm notification worker still sends only after signed commit.

- [ ] **Step 7: Perform browser-based visual/accessibility acceptance**

Using the in-app Browser first, verify desktop and mobile public verification, Administrator signing status, legacy/replacement views, keyboard navigation, visible focus, labels, live regions, contrast, touch targets, reduced motion, wrapping, no overflow, page identity, and empty console/error overlay.

- [ ] **Step 8: Update requirement traceability and completion statement**

Map evidence to FR-010, FR-011, FR-012, FR-013, FR-015, FR-016, FR-020, FR-023, the P1 cryptographic-signing requirement, security/privacy NFRs, and Phase 8 completion criteria. State the public-domain and official 1EdTech submission checkpoints as remaining external milestones.

- [ ] **Step 9: Final integration checkpoint**

When Git exists:

```bash
git add e2e scripts/generate-conformance-report.ts src/modules/open-badges/conformance-report* docs README.md
git commit -m "test: add Phase 8 conformance evidence"
```

---

## Execution Checkpoints

1. **Checkpoint A — cryptographic foundation:** Tasks 1–3; key/proof/signer tests and reviewer approval.
2. **Checkpoint B — standards persistence:** Task 4 plus migration review from Task 2; schema/status fixtures and MariaDB proof.
3. **Checkpoint C — issuance paths:** Tasks 5–6; individual/batch atomicity and notification regression evidence.
4. **Checkpoint D — lifecycle/public verification:** Tasks 7–9; revocation, proof verification, replacement, authorization, and UI evidence.
5. **Checkpoint E — operations/conformance:** Tasks 10–11; Docker, secrets, runbooks, E2E, local report, and all final gates.

Do not call Phase 8 locally complete before Checkpoint E passes. Do not call the product certified at local completion; production HTTPS activation and official 1EdTech approval remain external milestones.
