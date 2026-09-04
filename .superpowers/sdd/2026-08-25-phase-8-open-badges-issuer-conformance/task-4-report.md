# Phase 8 — Task 4 Report: Canonical Credentials and Bitstring Status Lists

## Status

Implemented and verified. No Prisma schema change was required or made. The workspace is not a Git repository, so no commit was created and Git was not initialized.

All MariaDB work used only the supplied process-scoped disposable test database on loopback port 3318. The live Compose database was not queried, migrated, reset, or otherwise touched. No `.env` file or SMTP setting was inspected or changed.

## Requirements mapping

- **FR-012 / FR-015 — immutable unique credential and standards export:** added strict canonical OpenBadgeCredential construction with the official VC v2, Open Badges 3.0.3, and Open Badges extensions contexts; the official AchievementCredential JSON Schema identifier; stable credential, issuer, key-controller, status-list, achievement, artwork, and alignment URLs; and exact `validFrom` / optional `validUntil` handling.
- **FR-013 / FR-016 — public verification and interoperable revocation:** added canonical `BitstringStatusListEntry` values with purpose exactly `revocation`, deterministic W3C-compatible bitstring encoding/lookup, and atomic signed status-list regeneration.
- **Security/privacy requirements and Acceptance Criterion 11:** canonical public credentials contain only the SHA-256 recipient identity representation. Strict schemas reject raw `email`, `studentNumber`, subject `id`, unknown top-level fields, unapproved/reordered contexts, unsafe URLs, incorrect schema or status values, invalid timestamps, and issuer/controller mismatches.
- **Historical integrity:** legacy unsigned snapshots remain unchanged. The new builder selects and clones only the privacy-safe historical snapshot fields; it does not rewrite stored snapshots or serialize recipient/allocation/persistence identifiers.
- **P1 cryptographic signing:** canonical signed credential/status-list schemas reuse Task 1's Data Integrity proof contract, require `eddsa-rdfc-2022`, and validate the proof verification method against the issuer controller. Status-list regeneration consumes the Task 3 signer interface and rejects any signer response that mutates the unsigned payload.

## Implementation

### Canonical credential schemas and builder

- Added strict Zod schemas for unsigned/signed OpenBadgeCredentials, Bitstring Status List entries, and unsigned/signed Bitstring Status List credentials.
- Fixed the canonical OpenBadgeCredential context order to:
  1. `https://www.w3.org/ns/credentials/v2`
  2. `https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json`
  3. `https://purl.imsglobal.org/spec/ob/v3p0/extensions.json`
- Fixed the required schema reference to `https://purl.imsglobal.org/spec/ob/v3p0/schema/json/ob_v3p0_achievementcredential_schema.json` with type `1EdTechJsonSchemaValidator2019`.
- Added canonical HTTP(S) URL validation that rejects credentials in URLs, query strings, fragments where not permitted, noncanonical path normalization, and non-HTTP(S) schemes.
- Added exact validity ordering, status entry/list relationship, status subject/list relationship, and proof verification-method/issuer relationship checks.
- Added `buildOpenBadgeCredential(input)` over the existing immutable privacy-safe snapshot, Task 2 allocation, and signing-key controller metadata.
- Added `SignedCredentialBuildSnapshotSchema` without changing the legacy `OpenBadgeCredentialSnapshotSchema` contract or its tests.

### Bitstring status lists

- Added `buildStatusListEntry`, `encodeRevocationList`, and `readRevocationStatus`.
- Bit indices are left-to-right within each byte, so indices 0 and 7 map to the first and last bits of byte zero, and index 8 begins byte one.
- Encoding is multibase base64url without padding over GZIP-compressed bytes. GZIP header-only XFL/OS fields are normalized to the pinned Digital Bazaar implementation's representation, making output deterministic across calls and compatible with the pinned status-list package.
- Capacity must be positive, byte-aligned, safe, and bounded; all indices must be safe integers inside the capacity.
- Published status-list credentials additionally require the W3C minimum of 131,072 entries / 16 KiB uncompressed.

### MariaDB status-list service

- Added `regenerateSignedStatusList(tx, listId, signer)`.
- The service locks and validates the persisted revocation list, requires exactly one uncompromised active signing key, reads only persisted `isRevoked` allocation flags, builds the unsigned status credential, calls the signer, strictly validates the fully signed response, and proves that the signer changed only the proof.
- Only after successful signing does one transaction persist `signedCredentialJson`, signing-key ID, SHA-256 digest, incremented list version, and matching allocation versions.
- Signer failure, malformed/noncanonical signer output, invalid persisted list state, or undersized lists persist no partial signed document.
- Added `lockCredentialStatusList(tx, listId)` so revocation callers lock the parent list before changing child allocations. This prevents MariaDB foreign-key lock-upgrade deadlocks and gives Task 7 one reusable lock-order contract. Concurrent integration coverage proves both transactions commit and the final signed list retains both revocation bits.
- Expiration state is intentionally ignored by the bit builder; only `CredentialStatusAllocation.isRevoked` can set a revocation bit.

## Strict TDD evidence

### RED 1 — all Task 4 modules absent

The initial focused commands failed for the intended missing-production-module reasons:

- Unit: three failed suites, no tests executed; unresolved `credential-schema`, `credential-builder`, and `status-list` imports.
- MariaDB integration: one failed suite, no tests executed; unresolved `status-list` / `status-list-service` imports.

### GREEN 1 — core schemas, builder, codec, and persistence

- Initial MariaDB implementation passed 4/4 integration tests covering signed persistence, signer rollback, concurrent bits, and expiration.
- Initial unit implementation passed 24/25 assertions. The one failure showed that the hand-derived deterministic GZIP fixture was wrong. Python's independent standard-library GZIP encoder and the pinned `@digitalbazaar/vc-bitstring-status-list` implementation were used to verify the correct raw bytes/output.
- The corrected pinned-library literal first failed against the Node-specific GZIP header (`RED`), then passed after normalizing header-only fields (`GREEN`, 8/8 status-list tests).

### RED/GREEN standards and atomicity follow-ups

1. **Minimum list size:** a real MariaDB test initially resolved a signed 16-entry list instead of rejecting it. After enforcing the W3C 131,072-entry minimum at publication, the focused suite passed 5/5.
2. **Signer mutation:** the payload-mutation regression intentionally had the equality guard removed and observed the signer-mutated payload being persisted. Restoring the canonical unsigned/signed payload equality check made the suite pass 6/6 and proved no partial document persisted.
3. **Concurrent lock order:** removing the parent pre-lock reproduced MariaDB error 1213 when two transactions updated child allocations and then upgraded the parent lock. A test importing the wished-for lock helper next failed with `lockCredentialStatusList is not a function`. Implementing the shared parent-first lock helper made both concurrent revocations commit and preserve both bits.
4. **Typecheck diagnostics:** the first typecheck identified the Node 26 `ZlibOptions` removal of `mtime` and readonly fixture tuple mismatches. The GZIP header was already observed as zero-time and is normalized explicitly; removing the unsupported option and correcting only the test fixture types restored a clean typecheck.

## Files added or changed

- Added `src/modules/open-badges/credential-schema.ts`
- Added `src/modules/open-badges/credential-schema.test.ts`
- Added `src/modules/open-badges/credential-builder.ts`
- Added `src/modules/open-badges/credential-builder.test.ts`
- Added `src/modules/open-badges/status-list.ts`
- Added `src/modules/open-badges/status-list.test.ts`
- Added `src/modules/verification/services/status-list-service.ts`
- Added `src/modules/verification/services/status-list-service.integration.test.ts`
- Modified `src/modules/issuance/services/snapshot-schemas.ts`
- Added this report.

No Prisma schema, migration, environment, SMTP, Compose, or existing legacy snapshot test file changed.

## Final verification

- Focused Open Badges plus unchanged legacy snapshot suite: **6 files / 55 tests passed**.
- Focused real MariaDB status-list suite: **1 file / 6 tests passed**.
- Full unit suite: **94 files / 578 tests passed**.
- Full disposable MariaDB integration suite: **11 files / 58 tests passed**.
- `npm run typecheck`: passed on the final sequential rerun.
- `npm run lint`: passed with zero warnings.
- Production build with the disposable database URL supplied process-locally: passed; Next.js compiled, typechecked, generated pages, and finalized traces.
- Every Task 4 source/test file plus `snapshot-schemas.ts`: targeted Prettier check passed.
- Repository-wide `npm run format`: remains non-zero only for the same five pre-existing unrelated files: Phase 8 `progress.md`, Task 1 report, Phase 8 implementation plan, and the two checked-in VC/status JSON contexts.

The first combined typecheck/build gate reported transient missing `.next/types` files because both commands ran concurrently while Next rebuilt that directory. The required sequential post-build `npm run typecheck` and `npm run lint` rerun passed.

## Self-review

- Credential/status schemas are strict at every public object boundary; no `.passthrough()` or catch-all exists in Task 4 schemas.
- The only recipient identity term present in Task 4 production output is the literal identity type `email`; no raw email, student number, student ID, badge-template ID property, issuer-user ID, or status-list database ID is serialized.
- Status-list documents expose only the compressed aggregate bitstring and contain no issuance-to-index mapping.
- Status purpose is exactly `revocation`; expiration does not alter allocation state or bitstrings.
- Signed historical credentials are not modified by status regeneration.
- The signer receives only a complete privacy-safe unsigned public status document. A failure or mutation is rejected before any list persistence.
- Database changes are transaction-scoped. Parent-first locking plus version updates prevents lost concurrent revocation bits.
- No live database, real credentials, private signing material, `.env`, or SMTP setting was accessed or changed.
- No subagent was dispatched, no Git repository was initialized, and no commit was created.

## Concerns

- Repository-wide formatting still fails on five pre-existing files outside Task 4; all Task 4 files pass targeted formatting.
- The full unit run emits the existing Node `DEP0129` child-process deprecation warning; all 578 tests pass.
- Callers that mutate allocation status must use `lockCredentialStatusList` before the child update and then call `regenerateSignedStatusList` in the same transaction. Task 7 should preserve this parent-first lock order and its planned bounded retry behavior.

---

## Fix Round 1 — 2026-08-25

This section supersedes the initial report wherever the earlier behavior differs. Both Critical and all four Important review findings were fixed without changing the legacy stored snapshot schema or rewriting historical issued credentials.

### Review findings resolved

1. **Normative OB3 recipient identity:** the Phase 8 canonical build boundary now accepts the recipient email separately from the immutable legacy snapshot, trims outer whitespace, lowercases and validates the address, hashes its UTF-8 bytes with unsalted SHA-256, and emits exactly `identityHash: "sha256$<64 lowercase hex>"`, `identityType: "emailAddress"`, and `hashed: true`. The strict canonical schema rejects the legacy bare digest/`email` form. Builder tests prove the raw mixed-case email is absent. The legacy snapshot shape and historical snapshot tests remain unchanged.
2. **MariaDB current reads and optimistic persistence:** regeneration obtains the status-list row and observed version through `SELECT ... FOR UPDATE`, locks/reads the active-key set and revoked allocations with current reads, revalidates the chosen key after signing, and updates the list only when its observed version still matches. A stale-snapshot integration regression demonstrates MariaDB's safe 1020 abort, retries the complete parent-first transaction, then proves both revocation bits remain set and version advances to 2.
3. **HTTPS and controller ownership:** every Phase 8 public resource URL now requires canonical HTTPS. Key ownership is checked using parsed URL origins and path segments rather than string prefix matching. Root controllers with a trailing slash are accepted; cross-origin keys, prefix-confused controllers, and nested `/keys/<id>/...` paths are rejected.
4. **Bounded and valid encoded lists:** encoded input is bounded at 180,000 characters before base64url decoding; decoding must be canonical; the payload must actually be GZIP; expansion is capped at 128 KiB; and published credentials must expand to at least the W3C 16 KiB / 131,072-bit minimum. Regression tests cover `unotgzip`, undersized content, oversized encoded input, and a small GZIP bomb that exceeds the decompression cap without resource-exhaustion risk.
5. **Signing-key lifecycle atomicity:** the active-key set is locked in the lifecycle service's ordering and retained through the signer call and persistence. A current read rejects a key compromised after an earlier repeatable-read snapshot, and a deterministic post-sign lifecycle mutation test proves revalidation rejects it and rolls back both the key mutation and status-list write.
6. **Privacy-safe achievement ID:** the canonical builder derives the public achievement path from a SHA-256 digest of the immutable snapshot achievement identifier. A sentinel raw database ID test proves neither the raw ID nor its sentinel text occurs in serialized canonical output. Historical snapshots are not changed.

### Fix-round files

- `src/modules/open-badges/credential-schema.ts`
- `src/modules/open-badges/credential-schema.test.ts`
- `src/modules/open-badges/credential-builder.ts`
- `src/modules/open-badges/credential-builder.test.ts`
- `src/modules/open-badges/status-list.ts`
- `src/modules/open-badges/status-list.test.ts`
- `src/modules/verification/services/status-list-service.ts`
- `src/modules/verification/services/status-list-service.integration.test.ts`
- `.superpowers/sdd/2026-08-25-phase-8-open-badges-issuer-conformance/task-4-report.md`

No Prisma schema or migration was added or changed. No stored snapshot contract was changed in this fix round.

### Strict TDD evidence

#### RED — canonical identity, HTTPS, controller paths, privacy, and encoded-list bounds

Command:

```text
npm test -- src/modules/open-badges/credential-schema.test.ts src/modules/open-badges/credential-builder.test.ts src/modules/open-badges/status-list.test.ts
```

Observed result: **3 failed files; 12 failed / 24 passed tests**. Failures showed the missing normalization/hash helpers, legacy identity acceptance, raw template ID disclosure, root-controller rejection, nested key-path and HTTP acceptance, regex-only `unotgzip`/undersized/oversized acceptance, and the missing 128 KiB expansion cap.

#### GREEN — canonical unit boundaries

The same command passed **3 files / 36 tests** after the minimal implementation.

#### RED — stale MariaDB state and key lifecycle

Command, using only the required process-scoped database:

```text
TEST_DATABASE_URL='mysql://phase8_test:phase8-test-only-password@127.0.0.1:3318/badging_phase8_test' npm run test:integration -- src/modules/verification/services/status-list-service.integration.test.ts
```

Observed result before the service fix: **1 failed file; 2 failed / 6 passed tests**. The stale transaction did not safely complete, and the ordinary active-key read attempted persistence after the key had been compromised. A focused ordinary-allocation-read variant also reproduced MariaDB error 1020 after a concurrent allocation commit, confirming that repeatable-read snapshot data cannot be used for regeneration/persistence.

#### GREEN — transaction safety

The final focused MariaDB command passed **1 file / 9 tests**. Coverage now includes signer failure rollback, signer payload mutation rollback, minimum capacity, ordinary concurrency, a deliberately established stale snapshot plus full retry preserving both bits/version, stale active-key rejection, deterministic post-sign key revalidation rollback, and expiration exclusion.

### Final fix-round gates

- Focused Open Badges and unchanged historical snapshot suite: **4 files / 55 tests passed**.
- Focused disposable MariaDB status-list suite: **1 file / 9 tests passed**.
- Full unit suite: **94 files / 589 tests passed**.
- Full disposable MariaDB integration suite: **11 files / 61 tests passed**.
- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed.
- `npm run build`: passed; production compilation, TypeScript, page generation, and trace collection completed.
- Focused Prettier and focused ESLint over every fix-round source/test file: passed.
- Repository-wide `npm run format`: remains non-zero only for the same five unrelated pre-existing files: Phase 8 `progress.md`, Task 1 report, the Phase 8 implementation plan, and the two checked-in VC/status context JSON files.

### Fix-round self-review and concerns

- The signed/unsigned proof schemas remain strict and unchanged in strength; canonical resource and identity validation is stricter.
- Canonical output contains no raw recipient email, student number, internal allocation/list ID, issuer-user ID, or raw badge-template database ID.
- All list/key/allocation reads that determine signed status content are current locking reads. Persistence is conditional on the observed list version, and no signer failure or rejected revalidation stores a partial signed document.
- MariaDB 10.x may raise error 1020 when a repeatable-read transaction established an older snapshot before a concurrent write, even when it later requests a locking read. This is fail-closed rather than a lost update; callers must retry the complete parent-first transaction, including the allocation mutation. The integration test proves that retry preserves both bits and version.
- The gzip header normalization still does not guarantee byte stability across future zlib DEFLATE implementation changes. This minor review item remains deliberately deferred for final review.
- Locking an active signing key across the signer call intentionally serializes retirement/compromise with status-list publication. Signer latency therefore extends the database transaction and should remain bounded by the Task 3 timeout.
- Repository-wide formatting and the existing Node `DEP0129` warning remain unrelated pre-existing concerns. All Task 4 files and all tests pass.

---

## Fix Round 2 — 2026-08-25

### Open finding resolved

Canonical HTTPS path validation now rejects ambiguous public resource paths before controller ownership is evaluated. It rejects duplicate slashes except the single root slash, raw backslashes normalized by WHATWG URL parsing, malformed percent escapes, case-insensitive percent encodings of slash/backslash/dot, and encoded percent signs that could conceal those structural bytes through an additional decode. Existing WHATWG canonical serialization continues to reject literal and encoded dot-segment normalization.

Controller ownership now first requires both URLs to pass the same canonical HTTPS validator, removes at most one trailing slash from a non-root controller, treats `/` as the root controller, and requires the verification method to contain exactly one non-empty path segment after `/keys/`. Root controller `https://issuer.example/` with key `https://issuer.example/keys/key-1` remains accepted. Duplicate controller slashes, empty/nested key identifiers, and literal or encoded path ambiguity are rejected.

Only these files changed in Fix Round 2:

- `src/modules/open-badges/credential-schema.ts`
- `src/modules/open-badges/credential-schema.test.ts`
- `src/modules/open-badges/credential-builder.test.ts`
- this report

`credential-builder.ts` required no change because it already validates both signing URLs with the shared schema and uses the shared controller-ownership predicate. No database, Prisma schema, migration, stored credential, or historical snapshot changed.

### Strict TDD evidence

#### RED

Command:

```text
npm test -- src/modules/open-badges/credential-schema.test.ts src/modules/open-badges/credential-builder.test.ts
```

Observed result: **2 failed files; 15 failed / 38 passed tests**. The failures proved that uppercase/lowercase `%2F`, `%5C`, encoded dot, double-encoded slash, malformed percent escapes, and a controller ending in `//` were accepted by the previous schema/builder boundary.

#### GREEN

The same focused command passed after the minimal shared validator/controller fix. After adding passing WHATWG characterizations for literal and encoded dot segments, the final focused result was **2 files / 59 tests passed**.

### Focused gates

- Focused credential schema/builder tests: **2 files / 59 tests passed**.
- Targeted Prettier check over both production files and both tests: passed.
- Targeted ESLint over both production files and both tests with zero warnings: passed.
- `npm run typecheck`: passed.

### Self-review and concerns

- The tests independently exercise real schema/builder behavior for direct, case-varied, double-encoded, malformed, duplicate-slash, raw-backslash, literal-dot, encoded-dot, empty-key, and nested-key probes.
- The root controller remains a deliberate special case with exactly one slash. Non-root controllers may have zero or one trailing slash, but never duplicate or ambiguous slashes.
- Encoded percent signs in canonical public paths are intentionally rejected because they can expose a second structural interpretation after another decoding pass. Ordinary UTF-8 and non-structural percent encodings remain accepted when well formed.
- No new concern was introduced. The previously deferred future-zlib byte-stability concern is unchanged and outside this finding.
