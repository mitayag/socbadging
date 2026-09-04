# Phase 8 — Task 5 Report: Require Signing for Individual Issuance

## Status

Implemented and verified. Every application path for individual issuance now prepares, signs,
verifies, and atomically commits an immutable signed OpenBadgeCredential. The signer is never
called inside the main issuance transaction. No Prisma schema change or migration was required.

The workspace is not a Git repository, so Git was not initialized and no commit was created. No
subagent was dispatched. No `.env` file or SMTP setting was inspected or changed.

## Requirements mapping

- **FR-002 — server-side RBAC:** the server action, public individual-issuance wrapper,
  preparation boundary, and commit boundary all require a Faculty actor. Preparation validates
  class ownership; commit locks and revalidates ownership plus the current database user's active
  Faculty role and status.
- **FR-010 — individual issuance:** individual issuance now requires a successfully signed and
  independently verified canonical credential before any issuance, audit, notification, or
  recipient-linked status allocation can be persisted.
- **FR-012 — unique immutable credential:** the commit stores one immutable signed snapshot,
  signing-key ID, serializer version, public ID, and status allocation. Tuple and public-ID races
  are handled without producing a second visible credential.
- **FR-015 / Phase 8 Open Badges hardening:** signing consumes the reviewed Task 4 canonical
  OpenBadgeCredential and Task 2 status/key contracts. The stored signed document includes the
  strict Data Integrity proof and Bitstring Status List entry.
- **FR-020 — audit:** successful issuance creates exactly one identifier-only `badge.issued` audit
  in the same transaction as the signed credential, status allocation, and notification outbox.
- **Privacy and accessibility:** signer payloads use only the hashed public recipient identity;
  signer and audit payloads exclude raw recipient email, student number, and recipient names.
  Retry and validation feedback is rendered through a polite status live region without replacing
  the form, so focus is preserved.

## Implementation

### Preparation and signing

- Added `prepareSignedIssuance(input, signer)` and the immutable `PreparedSignedIssuance`
  contract.
- Preparation requires a Faculty actor and validates current class ownership, active class,
  active database Faculty account, active owned badge, active enrollment, duplicate state,
  current issuer settings, and exactly one active uncompromised supported signing key.
- A short, separately committed reservation transaction advances a publishable revocation-list
  cursor without creating a recipient-linked allocation row. Failed signing may leave a harmless
  internal cursor gap, but it creates no visible issuance or allocation.
- Canonical snapshot and credential construction failures are mapped to a non-retryable safe
  correlation response. Internal builder or signer diagnostic text is not exposed.
- Both signer calls happen after all preparation transactions have completed. The signer receives
  a deep-frozen clone of only the canonical privacy-minimized unsigned credential.
- The returned signed response is strictly parsed, compared byte-structurally with the unsigned
  payload after removing only `proof`, checked against the selected verification method, and sent
  to the independent verification endpoint.
- Signer unavailability maps exactly to:
  `Credential signing is temporarily unavailable. No badge was issued. Try again.`
- Invalid payload/proof responses are non-retryable and contain a generated UUID correlation
  reference without internal signer codes.

### Atomic commit and concurrency

- Added `commitPreparedSignedIssuance(actor, prepared)`.
- The main transaction obtains current locking reads for the class, database actor, badge,
  enrollment/student, issuer settings, active signing-key set, and reserved status list.
- Commit revalidates actor identity, Faculty role/status, class ownership/status, badge ownership
  and status, enrollment state, the exact active uncompromised key and controller metadata, the
  reservation's list URL/purpose/capacity/cursor range, slot vacancy, serializer version, source
  snapshots, proof verification method, and the complete signed payload.
- Duplicate state is checked after authoritative source locks. Concurrent individual requests
  serialize to one issuance, one status allocation, one audit, and one notification; the loser
  returns the persisted issuance and exposes no second credential.
- Issuance, immutable legacy/public snapshots, immutable signed JSON, signing metadata, status
  allocation, audit, and notification outbox are committed in one transaction. Audit-trigger
  failure rolls back all visible artifacts.
- Public-ID conflicts retry from a fresh preparation, including a fresh signature. Tuple conflicts
  recover with a fresh post-rollback read.
- The existing unsigned transaction primitive remains available only to the batch workflow,
  pending the separately planned Task 6 batch-signing conversion. All application individual
  issuance calls go through the signed wrapper.

### React 19 / Next 16 form behavior

- Converted the individual form to React 19 `useActionState` and its third `pending` value.
- Pending submission disables the button and announces `Issuing Badge…` without duplicating
  pending/error client state.
- The server action accepts `(previousState, formData)`, performs current server-side
  authentication and strict form validation, and returns only a narrow serializable action state.
- Retryable and non-retryable signing failures render in `role="status"` with
  `aria-live="polite"`; tests prove the exact retry message and retained selection/focus.
- Successful and already-issued requests retain the existing revalidation and redirect behavior.

## Strict TDD evidence

The work was resumed after a usage-limit interruption, so the original terminal scrollback was not
all available in the resumed process. The following RED/GREEN outcomes were preserved in the task
handoff and current-session command output; no RED result is reconstructed as a passing claim.

### Initial service RED/GREEN

1. The first signed-service unit and MariaDB suites failed at import because
   `signed-issuance-service.ts` did not exist.
2. After the first implementation, the unit suite had nine intended failures caused by parsing the
   actor inside the strict issuance-input schema. Parsing only mutation fields reduced that to one
   fixture-shape failure; correcting the locking-row fixture produced the initial **10/10 GREEN**.
3. The issuance-wrapper test initially returned the legacy unsigned result instead of the mocked
   signed result. Routing `issueBadge` through `issueSignedBadge` made the focused service suites
   **21/21 GREEN** at that checkpoint.

### Signer, payload, and transaction RED/GREEN

1. Real MariaDB preparation initially raised error 1020 after reading source state and then trying
   to lock a concurrently advanced status cursor. Moving the unassigned cursor reservation into a
   separate short transaction made status reservation the transaction's first data access; the
   focused status/issuance/signed integration suite then passed **16/16**.
2. The resumed self-review added a test for an invalid canonical payload. It failed as intended
   because the internal message `Credential issuer must match the signing-key controller` escaped
   instead of a `SignedIssuanceError`. Wrapping canonical snapshot/document construction at the
   preparation boundary produced **12/12 GREEN** and a safe non-retryable UUID reference.
3. A forged prepared signed document is now rejected by commit revalidation before any issuance,
   allocation, audit, or notification call. The same suite asserts both sign and verify execute
   with transaction depth zero.
4. Real MariaDB coverage now rejects a non-owner before signing or persistence and proves signer
   timeout, invalid proof, audit failure, and concurrent duplicates leave the required atomic
   state.

### Form/action RED/GREEN

1. Passing React 19 action state and `FormData` to the old one-argument action produced the intended
   `formData.get is not a function` failure. Updating the action signature and using
   `useActionState` made action coverage green.
2. The retry-feedback test initially failed because no status role/live region existed. Adding the
   polite `role="status"` feedback node made the form/action checkpoint **13/13 GREEN**, including
   exact retry text, focus preservation, and pending disablement.

### Full-regression fixture RED/GREEN

The first full MariaDB regression passed 55 tests and failed 11 older tests. Ten revocation fixtures
and one batch race fixture still invoked individual issuance without signing infrastructure. The
revocation fixture now creates a real active key, publishable status list, and signed credential;
its lifecycle assertions also prove the signed snapshot/key/version remain unchanged. The batch
test injects its external tuple race directly, avoiding a nested exclusive-locking signed commit
inside the already-open batch transaction. The full MariaDB suite then passed **12 files / 66
tests**.

## Database safety

- Confirmed the disposable `hau-soc-phase8-test-db` container was available on loopback port 3318
  and authenticated as the isolated `phase8_test` user against `badging_phase8_test`.
- Every MariaDB test and the production build received only the authorized disposable URL through
  process-local environment variables.
- No live database was queried, migrated, reset, seeded, or modified.
- No Task 5 schema change or migration was needed.
- Test cleanup nulls signed test JSON only for Task 5 fixture rows in the disposable database before
  deleting their protected status allocations. Production code never rewrites historical signed
  credentials.

## Authorization and privacy review

- Server action authentication is performed before input-driven mutation work.
- `issueBadge`, `issueSignedBadge`, `prepareSignedIssuance`, and
  `commitPreparedSignedIssuance` independently enforce the Faculty role.
- Preparation checks class ownership before reservation/signing. Commit locks and rechecks
  ownership plus current database actor status/role before duplicate recovery or persistence.
- Unit coverage rejects an Administrator before any transaction and rejects ownership changes at
  commit. Real MariaDB coverage rejects a non-owner before signer invocation.
- Signer payload tests use sentinel email, student number, and name values and prove none enter the
  serialized signer request. Audit tests prove the same private values are absent from audit
  context. Notification outbox data remains transaction-private and contains the recipient data
  required for delivery.

## Files added or changed

- Added `src/modules/issuance/services/signed-issuance-service.ts`
- Added `src/modules/issuance/services/signed-issuance-service.test.ts`
- Added `src/modules/issuance/services/signed-issuance-service.integration.test.ts`
- Modified `src/modules/issuance/services/status-allocation-service.ts`
- Modified `src/modules/issuance/services/issuance-service.ts`
- Modified `src/modules/issuance/services/issuance-service.test.ts`
- Modified `src/modules/issuance/services/issuance-service.integration.test.ts`
- Modified `src/modules/issuance/types.ts`
- Modified `src/app/classes/[classId]/issued/actions.ts`
- Modified `src/app/classes/[classId]/issued/actions.test.ts`
- Modified `src/components/issuance/issue-badge-form.tsx`
- Modified `src/components/issuance/issue-badge-form.test.tsx`
- Modified `src/components/issuance/issue-badge-section.tsx`
- Modified `src/modules/issuance/services/revocation-service.integration.test.ts`
- Modified `src/modules/issuance/services/batch-commit-service.integration.test.ts`
- Added this report.

## Verification gates

- Focused service/form/notification/authorization unit suite after formatting: **6 files / 44
  tests passed**.
- Focused real MariaDB status/signed/issuance/revocation suite after formatting: **4 files / 27
  tests passed**.
- Full unit regression: **95 files / 626 tests passed**.
- Full disposable MariaDB regression: **12 files / 66 tests passed**.
- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed.
- Production `npm run build` with the disposable database URL: passed; Next.js compiled,
  typechecked, generated pages, and collected traces.
- Targeted Prettier write/check covers every Task 5 source, test, and this report.
- Repository-wide `npm run format`: non-zero only for the same five pre-existing unrelated files:
  Phase 8 `progress.md`, Task 1 report, the Phase 8 implementation plan, and the two checked-in
  Open Badges context JSON files.

## Self-review

- Signer I/O occurs only after preparation/reservation transactions and before the main commit
  transaction. Unit transaction-depth assertions cover both sign and verify.
- No signer failure path calls issuance, allocation, audit, or notification persistence. Real
  MariaDB counts prove zero visible residue for timeout and invalid proof.
- Commit does not trust the prepared object blindly; it reconstructs source snapshots and the
  unsigned canonical credential from current locked database state and compares them to the
  prepared snapshots/signed document.
- Signing-key ID, controller, verification method, algorithm, cryptosuite, active status, and
  compromise state are revalidated.
- Status-list URL, purpose, minimum capacity, cursor advance, index range, and vacancy are
  revalidated.
- Concurrent duplicates produce one visible credential and one side-effect set. A second reserved
  cursor index may remain unused but is not linked to a recipient or issuance.
- Signed snapshots are written once and never rewritten by Task 5 production code. Revocation
  regression explicitly proves signed JSON/key/version survive lifecycle mutation unchanged.
- Server feedback contains only the exact retry message or a non-retryable UUID reference. No
  signer response code or internal validation text reaches the form.

## Concerns

- Status cursor reservations are intentionally not reclaimed after signer failure or a duplicate
  loser. This preserves the no-network-in-transaction and no-visible-residue guarantees at the cost
  of sparse status lists under repeated failures; operational monitoring should track cursor usage.
- Batch issuance still uses the existing unsigned transaction primitive. This is deliberately
  limited to the batch path and is scheduled for Phase 8 Task 6; individual issuance is signed now.
- The production build retains the existing webpack `Critical dependency: the request of a
dependency is an expression` warning from `src/modules/open-badges/proof.ts`; the build completes
  successfully.
- Repository-wide formatting remains blocked by five pre-existing files outside Task 5. Every
  Task 5 file passes targeted formatting.
- The full unit run emits the existing Node `DEP0129` child-process deprecation warning; all tests
  pass.

---

## Fix Round 1 — 2026-08-27

### Status and accepted findings

The Critical finding and all four accepted Important findings are fixed. No Prisma schema,
migration, public form contract, historical credential, or signer protocol changed. The
preparation result remains usable by Task 6 in the same Node.js process, but it is now deliberately
non-serializable as commit authority: only the exact object returned by preparation can be
committed.

The ruling on unlinked cursor reservations is preserved. Signer failure, rejected preparation,
duplicate recovery, or transaction failure may leave an unused cursor index, but never a visible
issuance, recipient-linked allocation, audit, or notification outbox row.

### Critical — cryptographically trusted prepare-to-commit boundary

- Added a strict runtime schema for every prepared field: actor/class/badge/student/public IDs,
  UTC issuance timestamp, all immutable legacy snapshots, the full strict signed credential,
  exact Ed25519/`eddsa-rdfc-2022` key metadata, serializer version, nonnegative safe status index,
  canonical status URL, and UUID correlation ID.
- Added a compile-time opaque brand plus a module-private `WeakMap<object, sha256Digest>` seal.
  Preparation parses the complete artifact, recursively freezes it, stores its exact JSON digest,
  and returns that exact object.
- Commit first runs strict schema validation, then requires the original object identity and exact
  digest. A structurally identical clone, serialized/deserialized value, forged plain object, or
  proof-only clone mutation cannot recreate the private seal.
- The signer still signs and independently verifies outside every database transaction. The seal
  binds the exact verified response to the later commit, closing the proof-only replacement gap
  without moving signer network I/O into the transaction.
- Invalid/unsealed artifacts receive a newly generated UUID correlation. Their supplied
  `correlationId` is never trusted or echoed.
- Unit and real MariaDB tests replace only the schema-valid `proofValue` and also pass an unchanged
  clone. Both are rejected before the commit transaction and produce zero issuance, allocation,
  audit, or outbox records.

### Important 1 — authoritative expiration

- Removed `expiresAt` from `PreparedSignedIssuance`; there is no prepared expiration value for
  persistence to trust.
- Commit rebuilds snapshots from the locked badge template and issuance timestamp, validates the
  reconstructed canonical `validUntil` against the sealed signed document, and derives the
  database `expiresAt` only from that reconstructed `validUntil`.
- The success test asserts the exact locked-source-derived date. A clone with an added forged year
  2099 `expiresAt` property is rejected with no visible writes.

### Important 2 — global lock order and bounded retry

- Documented and implemented the global issuance order:
  **actor → issuance tuple → class → badge → enrollment/student → settings → status list → active
  signing-key set → status allocation**.
- The prefix matches revocation's actor/issuance/class order. The shared suffix matches status-list
  regeneration's status-list/signing-key/allocation order. The status list is now locked before the
  active signing-key set.
- Commit retries the complete transaction at most three attempts for Prisma `P2034` transaction
  conflicts and MariaDB 1020 record-changed / 1213 deadlock results. It never retries unrelated
  errors or partial transaction fragments.
- Exhausted transient retries return only the safe, schema-validated prepared correlation and
  produce no visible effects.
- Focused unit tests assert the complete lock sequence, successful full retry for both recognized
  error shapes, and the three-attempt bound.
- A real MariaDB test establishes an old repeatable-read snapshot, changes a non-snapshot source
  column externally, observes the real 1020 abort on the first actor lock, retries once, and commits
  exactly one issuance/allocation/audit/outbox set.

### Important 3 — fresh authorized tuple recovery

- Removed the post-conflict ordinary `badgeIssuance.findUnique` recovery read.
- Tuple-conflict recovery now starts a fresh transaction and repeats the authoritative global
  locking boundary. It revalidates the current database Faculty role/status, exact actor identity,
  class ownership/status, badge class/ownership/status, and active enrollment before returning the
  locked existing tuple.
- Recovery itself has the same bounded MariaDB transient retry behavior.
- Focused race tests force the original commit's tuple conflict, then suspend the actor or transfer
  class ownership before recovery. Both cases fail authorization instead of returning the raced
  issuance; no allocation, audit, or outbox is created by the losing request.

### Important 4 — strict runtime values and safe concurrent failures

- Prepared artifacts reject invalid dates, non-string key identifiers, nonnumeric reservation
  indices, unknown top-level expiration data, malformed correlations, noncanonical URLs, and all
  other unknown/mistyped fields before transaction entry.
- Invalid artifacts always receive a fresh UUID correlation. Tests prove the literal forged value
  `FORGED-CORRELATION` never appears in the error and is not reused as the error correlation.
- Commit reconstruction now maps missing/inactive current source state, invalid status/key state,
  snapshot divergence, signed-document divergence, and builder/schema failures to a safe
  `SignedIssuanceError`. Authorization failures remain typed authorization failures.
- Unit and MariaDB tests change current issuer settings to a noncanonical URL after preparation.
  Commit emits only the safe UUID reference and writes no issuance, allocation, audit, or outbox.

### Strict TDD evidence

#### RED — focused unit findings

Command:

```text
npm test -- src/modules/issuance/services/signed-issuance-service.test.ts
```

Observed result against the pre-fix implementation: **1 failed file; 15 failed / 11 passed tests**.
The unchanged clone and proof-only tamper both committed. Expiration tampering committed. Invalid
dates/reservations raised raw `RangeError`s, forged correlations were trusted, noncanonical settings
raised a raw `ZodError`, locks appeared as class before actor and key before status list, recognized
MariaDB errors were not retried, and tuple recovery did not reauthorize.

#### RED — real MariaDB findings

Command, using only the authorized disposable database:

```text
TEST_DATABASE_URL='mysql://phase8_test:***@127.0.0.1:3318/badging_phase8_test' npm run test:integration -- src/modules/issuance/services/signed-issuance-service.integration.test.ts
```

Observed result against the pre-fix implementation: **1 failed file; 4 failed / 5 passed tests**.
Both proof-only and unchanged clones created real credentials, current noncanonical settings leaked
a raw `ZodError`, and no full-commit retry was observable.

#### GREEN and honest intermediate diagnostics

The first GREEN attempt exposed an invalid old unit fixture: its mocked public ID was 18 characters
while the production generator and action contract require 32. Strict preparation correctly
rejected the fixture before the new boundaries ran. Correcting only that fixture revealed three
query fakes that still assumed the old lock order; updating those fakes to supply the new actor,
tuple, and status-list reads left one key-lifecycle fake missing the new status-before-key row.
After those fixture-only corrections, the focused service suite passed **26/26**.

The real MariaDB suite then passed **9/9**, including proof-only clone rejection, unchanged clone
rejection, concurrent noncanonical settings, real 1020 full retry, authorization, success,
timeout/invalid proof atomicity, and concurrent duplicates.

### Fix-round files

- `src/modules/issuance/services/signed-issuance-service.ts`
- `src/modules/issuance/services/signed-issuance-service.test.ts`
- `src/modules/issuance/services/signed-issuance-service.integration.test.ts`
- this report

No database schema, migration, UI source, signer client, environment, SMTP, or historical credential
was changed in this fix round.

### Final Fix Round 1 gates

- Focused service/form/notification/authorization suite: **6 files / 58 tests passed**.
- Focused disposable MariaDB status/signed/issuance/revocation suite: **4 files / 31 tests
  passed**.
- Full unit regression: **95 files / 640 tests passed**.
- Full disposable MariaDB regression: **12 files / 70 tests passed**.
- `npm run lint`: passed with zero warnings.
- `npm run typecheck`: passed.
- Targeted Prettier over all fix-round files and this report: passed.
- Production build with only the disposable database URL supplied process-locally: passed; Next.js
  compiled, typechecked, generated all pages, and collected traces.
- Repository-wide `npm run format`: remains non-zero only for the same five pre-existing unrelated
  files: Phase 8 `progress.md`, Task 1 report, the Phase 8 implementation plan, and the two checked-in
  Open Badges context JSON files.

### Self-review and concerns

- Original object identity is required in addition to schema validity and digest equality. A clone
  cannot commit even when its bytes and digest match; Task 6 can safely retain and pass the original
  in-memory object.
- The sealed object is recursively frozen, and its exact digest is rechecked before any database
  transaction. The proof is therefore the exact proof independently verified during preparation.
- Signer I/O remains entirely outside the main transaction and is not repeated for a transient
  commit retry.
- Every retry begins a complete new transaction and redoes all authoritative locks and invariant
  checks. Rolled-back attempts cannot leave partial issuance effects.
- The status cursor reservation remains intentionally outside the signer and commit transactions.
  Unused indices are an accepted safety/capacity tradeoff. Operations should monitor cursor
  utilization and provision/roll over status lists before capacity exhaustion; reservations are not
  reclaimed in this design.
- Production signer injection and further service decomposition remain deferred final-review Minor
  items, per the controller ruling.
- Batch issuance remains on the Task 6 conversion path; this fix round does not broaden its scope.
- The production build retains the existing dynamic-dependency webpack warning from
  `src/modules/open-badges/proof.ts`; compilation succeeds.
- Repository-wide formatting and the Node `DEP0129` unit-test warning remain pre-existing concerns.
  All fix-round files and all tests pass.
