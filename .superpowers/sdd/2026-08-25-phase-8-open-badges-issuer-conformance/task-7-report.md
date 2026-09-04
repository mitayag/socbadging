# Phase 8 Task 7 Report — Standards-Based Revocation

## Delivered

- Revocation now locks the status-list parent before its allocation, marks the allocation bit as
  revoked, regenerates and persists the signed status list in the same transaction, and retries
  bounded MariaDB conflict/deadlock failures.
- The original issuance snapshot and stored signed credential remain untouched. Repeat revocation
  remains a no-op.
- The test-only `revokeCredentialForTest` signer injection is guarded by `NODE_ENV === "test"`;
  production actions continue to use the server signer client.
- Added public `GET /api/status-lists/[listId]`. It publishes only a digest-verified signed
  Bitstring Status List JSON-LD document, with no-store, ETag, and security headers. Unknown IDs
  return generic 404; unsigned, stale, invalid, or unavailable current lists return 503.
- Updated the destructive revocation form copy to state that the immutable credential record is
  preserved and revocation is published through the signed status list.
- Review fix round 1 additionally rejects digest-consistent but stale/inconsistent status-list
  publication: every allocation version and bit must match the signed list, and the proof method
  must match the persisted signing-key relationship before a public `200` is possible.
- Review fix round 1 adds an explicit test-only synchronization hook immediately before the shared
  parent-list lock. It proves independent Faculty/class transactions contend on that parent while
  retaining the bounded retry behavior.

## Files

- `src/modules/issuance/services/revocation-service.ts`
- `src/modules/issuance/services/revocation-service.test.ts`
- `src/modules/issuance/services/revocation-service.integration.test.ts`
- `src/app/api/status-lists/[listId]/route.ts`
- `src/app/api/status-lists/status-list-route.test.ts`
- `src/components/issuance/revoke-credential-form.tsx`
- `src/components/issuance/revoke-credential-form.test.tsx`

Pre-edit snapshots of the modified existing Task 7 files are retained in
`task-7-snapshots/` because this workspace has no Git repository.

## TDD evidence

### RED

1. `npm test -- src/modules/issuance/services/revocation-service.test.ts`
   failed as expected: no allocation locking query existed (`expected undefined to deeply equal
StringContaining "FOR UPDATE"`).
2. `npm test -- src/app/api/status-lists/status-list-route.test.ts`
   failed as expected because the route module did not exist.
3. `TEST_DATABASE_URL='mysql://phase8_test:phase8-test-only-password@127.0.0.1:3318/badging_phase8_test' npm run test:integration -- src/modules/issuance/services/revocation-service.integration.test.ts`
   failed as expected because `revokeCredentialForTest` did not exist.
4. `npm test -- src/components/issuance/revoke-credential-form.test.tsx`
   failed as expected because the form did not mention the signed status list.
5. The route availability test then failed as expected with `404` when `503` was required for a
   status-list retrieval failure.

### GREEN

- Focused unit/route/notification/form regression command: 4 files, 30 tests passed.
- Disposable MariaDB integration command: 1 file, 12 tests passed.
- Full unit suite: 96 files, 660 tests passed.

### Review fix round 1

- RED: three public-route tests correctly observed unsafe `200` responses for an old
  digest-consistent signed document, an allocation-bit mismatch, and a proof-method/key mismatch.
- RED: independently locked Faculty/class revocations reached no shared-parent barrier before the
  new hook (`expected 0 to be 2`).
- GREEN: `npm test -- src/modules/issuance/services/revocation-service.test.ts src/app/api/status-lists/status-list-route.test.ts src/components/issuance/revoke-credential-form.test.tsx src/modules/notifications/templates/email-templates.test.ts` — 4 files, 35 tests passed.
- GREEN: `TEST_DATABASE_URL='mysql://phase8_test:phase8-test-only-password@127.0.0.1:3318/badging_phase8_test' npm run test:integration -- src/modules/issuance/services/revocation-service.integration.test.ts` — 1 file, 14 tests passed. The barrier ran at least twice; MariaDB also exercised one retry in this forced-contention scenario.
- GREEN: `npm run lint` and `npm run typecheck` passed.
- Characterization: unit tests directly verify one retryable MariaDB failure retries and persistent
  retryable failures stop after three attempts; the retry code predates this review round, so these
  focused tests passed on first execution.

### Review fix round 2

- RED: the status-list route returned `503` for a legitimate post-publication active allocation
  at `statusListVersion: 0`; the same valid-allocation privacy fixture also returned `503` before
  its public-response assertion.
- GREEN: active allocations may stay at an earlier version because their signed zero bit is
  implicit; their current signed bit must still be zero. Revoked allocations require both a signed
  one bit and exact current list version. The route decodes the bounded encoded list once and
  checks each allocation index against that one byte buffer.
- GREEN: the independent-owner shared-parent MariaDB contention test now decodes the final signed
  list and proves both distinct allocation indices are revoked.
- GREEN: a MariaDB-backed route regression revokes one credential (publishing list version 1),
  issues a second active credential (allocation version 0), and verifies the real public route
  returns 200 with the original one bit and new implicit zero bit.
- GREEN: `npm test -- src/app/api/status-lists/status-list-route.test.ts` — 9 tests passed.
- GREEN: `TEST_DATABASE_URL='mysql://phase8_test:phase8-test-only-password@127.0.0.1:3318/badging_phase8_test' npm run test:integration -- src/modules/issuance/services/revocation-service.integration.test.ts` — 15 tests passed.

## Requirement mapping

- **FR-012 Unique Credential:** stored issued credential identity and historical signed artifact
  remain immutable while revocation state is published separately.
- **FR-013 Verification:** public status-list JSON-LD gives verifiers current revocation data
  without recipient or issuance mapping, and refuses a stale list even if its stored digest is
  internally consistent, while allowing the protocol-correct implicit-zero state of newly issued
  active allocations.
- **FR-015 Credential Export / Open Badges 3.0 alignment:** signed Bitstring Status List
  credential is published with JSON-LD content type, digest ETag, and no-store semantics.
- **FR-016 Revocation:** server-authorized, reasoned/timestamped revocation is atomic and
  idempotent; no destructive deletion occurs. Repeats leave list version/signer calls unchanged
  and create exactly one revoked notification.
- **FR-020 Audit Log:** one identifier-only `badge.revoked` audit record is committed only with a
  successful revocation.
- **Requirements §§6, 10, 11, and acceptance criteria 11/13/14/15:** current status semantics,
  minimized public PII, preserved history, auditable revocation, and authorization/concurrency
  regression coverage.

## Verification

- `npm run lint` — passed.
- `npm run typecheck` — passed.
- `npm run build` — passed; Next included `/api/status-lists/[listId]` as a dynamic route.
- `npm test` — passed: 96 files, 666 tests.
- `TEST_DATABASE_URL='mysql://phase8_test:phase8-test-only-password@127.0.0.1:3318/badging_phase8_test' npm run test:integration` — passed: 12 files, 80 tests.
- `npx prettier --check` on every Task 7 touched source/test — passed after formatting.
- `npm run format` repository-wide remains nonzero due pre-existing formatting drift in unrelated
  Phase 8 plan/progress Markdown files and bundled Open Badges context JSON. These were not
  modified by Task 7.

## Remaining concerns

- The production build reports two existing webpack "Critical dependency" warnings from the
  dynamic require in `src/modules/open-badges/proof.ts`; the new route only exposes the preexisting
  import path. Build otherwise succeeded.
- Independent fix-round re-review approved Task 7 with no Critical or Important findings. One
  non-blocking Minor remains: the bounded status list is decompressed once by schema refinement
  and once by current-state validation, which is constant work rather than per-allocation work.
