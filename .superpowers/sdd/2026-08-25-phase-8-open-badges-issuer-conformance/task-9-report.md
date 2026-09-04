# Phase 8 — Task 9 Report: Signed Replacement and Administrator Key UI

## Scope and policy

Added the Task 9 replacement/key-status surface. A replacement is a new signed issuance with a new public identifier and status-list allocation; its original signed and source snapshots remain unchanged. The records are reciprocally linked (`supersedes` / `supersededBy`), with one replacement audit and one issued-notification outbox record in the successful transaction.

Safe policy ruling: a revoked original is terminal and replacement creation is rejected. This prevents an administrator action from silently creating an active successor to a revoked credential pending a separately approved lifecycle policy.

## Schema ruling

The existing source-tuple unique constraint made a distinct historical replacement impossible. With parent authorization, Task 9 replaces it with a lookup index in migration `20260830_phase_8_signed_replacement_tuple_lookup`; prior migrations were not edited. Replacement linkage and the locking transaction enforce replacement idempotency instead of the removed source-tuple unique constraint.

## TDD and verification

- RED: the replacement integration test failed against the pre-migration disposable MariaDB database with `badge_issuances_class_id_badge_template_id_student_id_key`, proving the old tuple uniqueness blocked replacement history.
- GREEN: after the new migration, the focused integration test passed (1 file, 1 test), proving same-source original/replacement rows and reciprocal linkage.
- Focused unit/component suite passed: 4 files, 8 tests.
- Task-scope ESLint and TypeScript typecheck passed before formatting.

Host Node/npm is unavailable, so the commands were run in an isolated Node 22 Docker volume. The disposable URL was `mysql://phase8_test:***@127.0.0.1:3318/badging_phase8_test`; no live database was accessed.

## Requirement mapping

- **FR-002:** Settings key actions require server-side Administrator authorization and explicit confirmation intent.
- **FR-012 / FR-015:** replacement creates a new signed credential/public ID/status allocation while preserving original history.
- **FR-013 / FR-016:** reciprocal legacy/replacement copy is rendered to the authorized credential detail view; revoked originals are fail-closed.
- **FR-020:** successful replacement writes `badge.replaced`; signing-key lifecycle actions retain their existing exact service audits.
- **FR-023 / P1 signing / privacy NFRs:** the Administrator UI renders only fingerprint, cryptosuite, lifecycle status, and signer-health state; no key upload or private material is exposed.

## Fix round 1

- Administrator existence/status/role is now checked from the database before even an idempotent replacement return.
- Replacements preserve the original issue/expiry lifecycle fields and reject revoked, expired-status, and time-expired originals.
- Credential detail exposes a confirmation-backed Administrator replacement form; signing-key forms submit only public metadata through the server action, including registration, activation, retirement, and compromise.
- Source-tuple fallback reads are deterministically ordered by original issue time and ID.
- Settings-page mocking regression, focused typecheck, ESLint, and component/action tests were rerun successfully.

## Fix round 2

The placeholder persistence test was replaced with a MariaDB-backed suite that calls
`createSignedReplacement` through the real service and transaction boundary. Only the external
signer client is doubled; the signer double and deterministic two-party concurrency barrier live in
the integration test, so no production injection seam or test hook was added.

The 13 MariaDB tests now prove:

- the database is authoritative for the Administrator role, including authorization before the
  repeat/idempotent return;
- the original signed credential, source snapshots, lifecycle fields, signing-key reference, and
  original status allocation remain unchanged while reciprocal replacement links are added;
- the replacement receives a distinct internal ID/public ID, signed proof, signing-key reference,
  and distinct status-list allocation;
- one successful, repeated, or deterministically concurrent replacement produces exactly one
  replacement row, `badge.replaced` audit, issued-notification outbox record, and recipient-linked
  allocation;
- sign failure and proof-verification failure leave the original unlinked and create no visible
  replacement, audit, notification, or recipient-linked allocation;
- revoked, `EXPIRED`-status, and time-expired originals are rejected before signing; and
- retirement, compromise, rotation, or status-list URL change after reservation but before commit
  is detected by commit-time revalidation and leaves no visible replacement residue.

The status cursor reservation intentionally retains the previously approved Task 5 contract: a
failed external signing attempt may consume an unassigned cursor slot, but it cannot create a
recipient-linked allocation or any credential/audit/notification record. Reclaiming such a slot
would be unsafe under concurrent reservations.

The replacement server action now validates its credential identifier at the public mutation
boundary, ignores extra fields, derives the actor exclusively from the authenticated session, and
maps malformed input or unexpected service diagnostics to the same generic
`Credential replacement is unavailable` error. Its five tests independently cover anonymous and
Faculty denial, explicit Administrator confirmation, validated delegation, absence of private
extra fields at the service boundary, path revalidation, and safe error handling.

The repository-wide unit gate exposed two stale test-harness defects, both corrected without
production behavior changes:

- the signed-issuance transaction double now exposes Prisma `findFirst`, matching the deterministic
  source-tuple lookup introduced with the Task 9 migration; its isolated 28-test suite passes; and
- batch-validation table cases now use literal case names instead of asking Vitest to serialize a
  2 MiB `File` fixture into `%s`, eliminating the previously documented Docker worker heap crash;
  that isolated file passes all 26 tests under the ordinary runner.

### Fix-round-2 verification

- MariaDB replacement integration: 1 file, 13 tests passed against the dedicated disposable
  loopback database on port 3318.
- Focused Task 9 unit/component/action suite: 6 files, 16 tests passed.
- Full unit/component suite: 102 files, 699 tests passed in one Docker run with two workers; no
  split-run or heap-exhaustion exception is needed.
- All 13 Task 9 source/test files pass Prettier; both scoped ESLint and the repository-wide lint
  gate pass with zero warnings.
- Project TypeScript typecheck passed.
- Production build passed; it emitted only the previously recorded dynamic-dependency warnings
  from `src/modules/open-badges/proof.ts`.

No live application database was queried or modified. The disposable test database URL is recorded
as `mysql://phase8_test:***@127.0.0.1:3318/badging_phase8_test`.

## Fix round 3

The final replacement transaction now takes MariaDB locking reads in the shared commit order:
Administrator, original issuance, reserved status list, active signing-key range, exact signing-key
row, then allocation. Both the active-key range and the exact prepared key are validated while
their locks remain held through replacement/audit/notification commit. This closes the prior gap
where retirement, compromise, or rotation could commit after validation but before issuance.

A deterministic `NODE_ENV=test` global hook runs after locked key validation and before issuance;
there is no callable injection parameter or production hook path. The MariaDB suite uses it to
prove both serial orders:

- if retirement, compromise, or rotation commits before the final locking reads, replacement
  rejects and leaves no visible residue;
- if replacement owns the validated locks first, exact-row mutations and an active-range rotation
  insert remain blocked until replacement commits, after which the lifecycle transaction may
  proceed; and
- retryable MariaDB transaction failures retry at most three times, roll back failed attempts, and
  never duplicate the replacement, audit, or notification.

Concurrency ruling: replacement is not required to lose a race it has already serialized first.
The credential is valid at its commit point; a subsequent lifecycle mutation is a later ordered
event. The cost is that lifecycle operations may briefly wait for the bounded replacement commit.

The signing-key settings component now catches rejected actions and announces only the generic
`Signing key action failed.` message through a polite `role=status` region. Successful and
field-safe `{ ok: false }` results retain accessible live feedback, while already-compromised keys
render no further lifecycle controls. Signer-health tests cover offline and malformed responses;
settings-page regressions prove health is unavailable for missing health, key-ID mismatch, or
cryptosuite mismatch and healthy only for an active exact match.

### Fix-round-3 verification

- MariaDB replacement integration: 1 file, 19 tests passed against the dedicated disposable
  loopback database on port 3318.
- Focused Task 9, signer-health, signed-issuance, and batch-validation suite: 9 files, 85 tests
  passed.
- All Task 9 and ripple files, including `signed-issuance-service.ts`, pass Prettier.
- Scoped and repository-wide ESLint passed with zero warnings; project TypeScript typecheck passed.
- Production build passed with only the previously recorded dynamic-dependency warnings from
  `src/modules/open-badges/proof.ts`.

## Fix round 4

Removing source-tuple uniqueness exposed row-order-dependent duplicate detection: batch preview
and commit used last-row-wins Maps, while the two signed-issuance locking reads destructured the
first row. The ordered ORM reads also selected the historical original rather than the canonical
current replacement.

All source-tuple consumers now use one lifecycle-aware deterministic selector. It accepts only
reciprocal `supersedesId` / `supersededById` edges, selects the deepest terminal in a valid
replacement chain, and therefore returns the terminal replacement for ordinary historical chains.
Malformed, disconnected, or cyclic data cannot make selection depend on database row order: the
selector uses a stable fail-closed status order (`REVOKED`, then `EXPIRED`, then `ACTIVE`) and
identifier ordering as its fallback. Both batch set reads, both signed-issuance locking reads, the
pre-reservation ORM read, and reservation-contention polling now select through this shared rule.

TDD permutation regressions failed first at all four reported boundaries. After the shared fix,
both original-first and replacement-first inputs return the same replacement issuance/public ID in
preview, finalized batch commit, locked signed preparation, and locked signed commit. Additional
preview regressions prove deterministic fallback for cyclic reciprocal links and malformed dangling
links.

### Fix-round-4 verification

- Focused batch preview, batch commit, and signed issuance suite: 3 files, 108 tests passed.
- Task/ripple ESLint passed with zero warnings; repository-wide ESLint passed with zero warnings.
- Project TypeScript typecheck passed.
- All seven changed source/test files pass Prettier.
- Production build passed with only the previously recorded dynamic-dependency warnings from
  `src/modules/open-badges/proof.ts`.

Requirement mapping: **FR-011** batch preview/commit now agree on the historical credential they
report; **FR-012** duplicate detection returns one stable internal/public credential identity; and
the issued-credential history integrity rule is preserved by selecting the linked successor without
rewriting either historical record.

## Fix round 5

The selector no longer treats an incomplete reciprocal fragment as a valid chain merely because it
has measurable depth. Chain evaluation now returns completeness and depth separately. A candidate
is complete only when every predecessor exists, every traversed edge is reciprocal, no identifier is
revisited, and traversal reaches a real root whose `supersedesId` is `null`. Depth precedence applies
only among those complete candidates.

If no complete candidate exists, selection falls back across every record—not just apparent
terminals—using the existing fail-closed order (`REVOKED`, `EXPIRED`, `ACTIVE`) followed by stable
identifiers. This ensures a cycle plus incomplete tail cannot hide a revoked record. A complete
replacement chain still takes precedence over malformed records regardless of their status.

Strict TDD regressions cover both input permutations for an incomplete deeper fragment alongside
revoked/expired complete terminals, both permutations for a cycle with an incomplete tail, and the
mixed complete-chain/malformed-record policy. The RED selector run failed 4 of 5 tests at the
intended decisions; GREEN passes all selector and consumer tests.

### Fix-round-5 verification

- Focused selector, batch preview, batch commit, and signed issuance suite: 4 files, 113 tests
  passed.
- Repository-wide ESLint passed with zero warnings; project TypeScript typecheck passed.
- Changed selector, selector test, and Task 9 evidence files pass Prettier.
- Production build passed with only the previously recorded dynamic-dependency warnings from
  `src/modules/open-badges/proof.ts`.

Requirement mapping remains **FR-011**, **FR-012**, and the issued-credential history integrity
rule; this round tightens malformed-data selection without changing persistence or authorization.
