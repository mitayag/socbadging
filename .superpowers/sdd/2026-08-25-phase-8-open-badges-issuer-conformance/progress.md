# SDD ledger — plan: /Users/marlontayag/Desktop/SOC Badging System/docs/superpowers/plans/2026-08-25-phase-8-open-badges-issuer-conformance.md

## Execution environment

- Spec: `/Users/marlontayag/Desktop/SOC Badging System/docs/superpowers/specs/2026-08-25-phase-8-open-badges-issuer-conformance-design.md`
- Workspace: shared project directory because this project has no `.git` directory.
- Review evidence: per-task baseline manifests and unified file snapshots replace commit ranges.
- Ruling: Preserve plan commit checkpoints as review gates without running commits — Git metadata is absent — cost if wrong: file-level review packages are less convenient than commit-range diffs but still preserve inspectable evidence.

## Preflight consistency scan

| Producer / task | Consumer / task   | Shared file or interface                                  | Finding                                                                                                |
| --------------- | ----------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| Task 1          | Task 1            | Loader, proof schemas, tests, dependency pins             | Internally consistent; tests precede implementation and dependency versions are exact.                 |
| Task 2          | Task 2            | Prisma signing/status/replacement records and services    | Internally consistent; migration and MariaDB coverage are both required.                               |
| Task 3          | Task 3            | Signer runtime/server/client/key generator                | Internally consistent; secret ownership remains within signer runtime.                                 |
| Task 4          | Task 4            | Credential builder, schema, status list encoding/service  | Internally consistent; canonical documents and status-list regeneration are tested separately.         |
| Task 5          | Task 5            | Individual signed issuance orchestration                  | Internally consistent; sign-before-commit and rollback requirements align with tests.                  |
| Task 6          | Task 6            | Batch signed issuance                                     | Internally consistent; preview remains non-mutating and atomic batch behavior is explicit.             |
| Task 7          | Task 7            | Revocation and public status-list route                   | Internally consistent; atomic list regeneration and authorization tests are explicit.                  |
| Task 8          | Task 8            | Public issuer/key/credential routes and verifier UI       | Internally consistent; public privacy and verification states are explicit.                            |
| Task 9          | Task 9            | Replacement workflow and administrator key UI             | Internally consistent; public metadata only and historical immutability are explicit.                  |
| Task 10         | Task 10           | Docker signer, env, health, runbooks                      | Internally consistent; internal-only port and read-only secret are explicit.                           |
| Task 11         | Task 11           | Conformance report, E2E, traceability, final gates        | Internally consistent; local readiness must explicitly retain `certified: false`.                      |
| Task 1          | Tasks 3, 4, 8     | `proof.ts` schemas and allowlisted loader                 | Producer/consumer contracts align; later signer and verifier tasks consume the transport and contexts. |
| Task 2          | Tasks 4, 5, 7, 9  | Signing-key/status/replacement persistence and allocation | Producer/consumer contracts align; later services build on the migrated records.                       |
| Task 3          | Tasks 4, 5, 7, 10 | Signer client/runtime and `src/config/env.ts`             | Shared env file is extended again in Task 10; no conflicting setting is specified.                     |
| Task 4          | Tasks 5, 7, 8     | Canonical credential and status-list primitives           | Consumers use the same immutable signed document and revocation purpose.                               |
| Task 5          | Tasks 6, 9        | `prepareSignedIssuance`                                   | Batch and replacement reuse the same sign-before-commit contract.                                      |
| Task 7          | Task 8            | Status-list endpoint and verifier                         | Verification consumes the signed revocation state published by Task 7.                                 |
| Task 8          | Task 9            | Public credential detail and cryptographic state          | Replacement links extend, rather than rewrite, historical credential views.                            |
| Task 10         | Task 11           | Docker evidence, production runbook, README               | Task 11 appends conformance evidence without contradicting operational activation.                     |

## Preflight rulings

- Ruling: Task 1 may add checked-in JSON-LD fixture files beneath `src/modules/open-badges/contexts/` although the task file list omits them — Step 5 explicitly requires checked-in reviewed fixtures — cost if wrong: a few additional static source files outside the enumerated list.
- Ruling: Task 1's tamper-detection test must exercise the pinned Digital Bazaar verification primitive directly or through a small exported helper in `proof.ts` — the task goal says to prove the cryptographic primitive, while transport schemas alone cannot detect tampering — cost if wrong: the task exposes one minimal verification helper earlier than later signer tasks.

## Baseline

- `package.json` SHA-256: `4c423a08120a0b76416d7ec88242212e4724dac850a478e56bb6a21773170322`
- `package-lock.json` SHA-256: `8e42a5654c16bd91412f7f6388d03a765fd04555efa497d1d55e789cd12418d8`
- Baseline suite: `npm test` — 84 files passed, 511 tests passed. One pre-existing Node `DEP0129` deprecation warning was emitted.
- The attempted `npm test -- --runInBand` baseline command was invalid for Vitest 4 and ran no tests; it is not counted as evidence.

## Task status

- Task 1: fix round 1/5 (3 addressed, 0 open; no Git commits).
- Task 1: complete (file-snapshot review clean).
- Task 2: implementation pending.

## Task 1 review record

- Initial review: two Important findings (authoritative guide designation; transport-boundary context allowlist) and one Minor reproducibility finding (`jsonld-signatures` was only transitive).
- Fix round 1: all three addressed; focused suite 2 files / 8 tests passed; re-review found no new breakage.
- Deferred observation: proof provenance comment does not list the newly direct `jsonld-signatures@11.6.0`; final review should triage this documentation-only omission.

## Task 2 baseline

- `prisma/schema.prisma` SHA-256: `5329cc0608503a1fd247052b70d46f65e2875127bb0af7b05a9832feff2ad6bc`.
- Migration directory `20260825_phase_8_open_badges_signing` and Task 2 service/test files did not exist.

## Task 2 review record

- Initial review: one Critical compromised-key reactivation issue; three Important issues covering public-key validation, replacement concurrency/invariants, and protected-action test coverage; one Minor concurrent idempotency gap.
- Fix round 1: all five findings addressed; 19 focused MariaDB integration tests and 1 focused unit test passed; re-review found no new breakage.
- Task 2: complete (file-snapshot review clean).
- Task 3: implementation pending.

## Task 3 review record

- Initial review: five accepted Important findings (stream timeout mapping, signed-response proof guarantee, canonical secret-key serialization, missing-token comparison path, bounded descriptor read); one contested Important logging finding; two Minor process/cleanup findings.
- Ruling: retain public `keyId` and `cryptosuite` in structured signer lifecycle/operation logs — the approved task requires omission of credential contents, recipient values, private/public key _material_, and bearer/parser/crypto-error details, while the design/report explicitly classifies key IDs and cryptosuite names as safe public metadata — cost if wrong: operational logs disclose the public verification-method URL and cryptosuite already exposed by `/health`.
- Task 3: fix round 1/5 in progress.
- Task 3: minor (deferred): asynchronous listen errors are not converted to structured startup failures and shutdown has no bounded fallback.
- Task 3: minor (deferred): CLI partial-failure path unlink should compare the created file device/inode before removal.
- Task 3: fix round 1/5 (5 addressed, 0 open; one ruled logging finding; no Git commits).
- Task 3: complete (file-snapshot review clean; 2 deferred Minors).
- Task 4: implementation pending.

## Task 4 review record

- Initial review: two Critical findings (normative OB3 identity; stale repeatable-read status state), four Important findings (HTTPS/controller ownership, bounded status payload, key lifecycle race, raw internal achievement ID), one deferred Minor zlib-stability concern.
- Fix round 1: five findings addressed; controller/key validation still allowed encoded separators and ambiguous duplicate slashes.
- Fix round 2: controller/key ownership finding addressed; 59 focused tests passed; no new breakage.
- Task 4: complete (file-snapshot review clean; 1 deferred Minor).
- Task 5: implementation pending.

## Task 5 review record

- Initial review: one Critical proof-only prepared-artifact forgery; four accepted Important issues (expiry binding, lock-order/deadlock handling, authorized tuple-conflict recovery, strict prepared schema/safe errors); one contested Important cursor-gap finding; two deferred Minors (production signer injection seam, 892-line service decomposition).
- Ruling: allow unlinked status cursor gaps after signer failure, public-ID retry, or duplicate loser — the approved plan deliberately reserves status indices in a short transaction before signer I/O, and its atomicity requirement forbids issuance/allocation/audit/email rows rather than an internal cursor advance — cost if wrong: sustained failures can consume list capacity faster, requiring monitoring and earlier list rollover.
- Task 5: fix round 1/5 in progress.
- Task 5: minor (deferred): confine test signer injection to a private factory/test adapter.
- Task 5: minor (deferred): decompose the large signed issuance service before final merge if later batch work does not naturally extract shared modules.
- Task 5: fix round 1/5 (5 addressed, 0 open; cursor-gap ruling; no Git commits).
- Task 5: minor (deferred): report should add exact test names and explicit GREEN command/output blocks.
- Task 5: complete (file-snapshot review clean; 3 deferred Minors).
- Task 6: implementation completed; review history follows.

## Task 6 review record

- Initial review: two Critical findings (sign-before-exclusive-batch-claim permits duplicate external signatures; raced duplicates may be signed and then discarded), three Important findings (over-broad signer-outage classification, production signer-injection seam, and missing preparation-plan fingerprint binding), and two Minor findings (duplicate-only commits depend on signing concurrency configuration; service decomposition).
- Task 6: fix round 1/5 in progress.
- Task 6: minor (deferred): decompose the batch commit service after concurrency and atomicity fixes are stable.
- Fix round 1 re-review: one Critical lease-expiry finding, two Important findings (`SIGNING`
  projection and individual public-ID retry reservation release), and one stale-report Minor.
- Task 6: fix round 2/5 in progress; heartbeat renewal, `SIGNING` projection, reservation release,
  and report corrections implemented with focused unit and MariaDB evidence.
- Task 6 fix round 2 re-review: no Critical or Important findings; one report-evidence Minor
  corrected before final verification.
- Task 6: complete (file-snapshot review approved; full lint, typecheck, 653 unit/component tests,
  75 MariaDB integration tests, and production build passed; service decomposition Minor deferred).
- Task 7: implementation in progress.
- Ruling: the installed `task-brief` helper could not invoke its non-executable `sdd-workspace`
  dependency; use the exact Task 7 plan section as the authoritative brief without changing the
  installed skill — cost if wrong: Task 7 has no generated brief artifact, but its full requirements
  remain available in the versioned plan.
- Task 7 review fix round 1: both Important public-status consistency findings addressed. The
  route now verifies every allocation's persisted version/bit against the signed list and binds
  the proof verification method to the persisted signing-key record; stale/inconsistent data gives 503. Independent Faculty/class transactions now synchronize immediately before their shared
  parent-list lock in the test harness; retry and retry-exhaustion coverage is explicit. Repeat
  revocation now directly asserts unchanged list version/signer count and one notification.
  Focused unit/route/form/notification: 35 passed; disposable MariaDB integration: 14 passed;
  lint and typecheck passed.
- Task 7 review fix round 2: route consistency semantics now permit a new active allocation's
  implicit signed zero bit at version 0 after a prior list publication, while revoked allocations
  still require exact version and bit agreement. The route decodes each bounded status bitstring
  once per request. Privacy coverage now uses valid allocation fields and proves a 200 response
  excludes malicious extra mappings. The independent-owner shared-parent contention test decodes
  the final signed list and proves both distinct indices are set. A MariaDB-backed route test
  verifies the actual version-1/active-version-0 issuance sequence returns 200. Route: 9 tests
  passed; disposable MariaDB integration: 15 tests passed.
- Task 7 fix round 2 re-review: approved with no Critical or Important findings. One deferred
  Minor notes that schema refinement and current-state validation each decompress the bounded
  status list once; this is constant work per request and removes the prior per-allocation
  amplification.
- Task 7: complete (file-snapshot review approved; lint and typecheck passed; full unit/component
  suite 96 files / 666 tests passed; full MariaDB integration suite 12 files / 80 tests passed;
  production build passed with the two pre-existing dynamic-dependency warnings). Repository-wide
  formatting remains nonzero only for four unrelated pre-existing files; all Task 7 files pass
  formatting.
- Task 8: complete (TDD RED recorded, issuer/key/verifier/public-route/panel focused suite 8 files
  / 75 tests passed; lint and typecheck passed; full unit/component suite 99 files / 684 tests
  passed; production build passed with the two known dynamic-dependency warnings). Public issuer
  and Multikey routes expose no private material; compromised trust fails closed; signed JSON and
  downloads preserve immutable stored bytes; legacy records are never presented as verified.
- Task 8 fix round 1: public proof checks now use persisted public Multikey material rather than
  the mounted signer key, support retired keys, and fail closed for key/list-allocation mismatches.
  Protected JSON-LD contexts now define the public Profile verification method and key-trust
  extension; safe-mode expansion is covered. Relevant regression: 13 files / 160 tests passed;
  lint and typecheck passed.
- Task 8 fix round 1 re-review: approved with no Critical, Important, or Minor findings.
- Task 8 final verification: the project Node 22 Docker image passed lint, typecheck, production
  build, and the full MariaDB integration suite (12 files / 80 tests). Docker's ARM64 Vitest worker
  exhausted its heap while serializing `batch-validation.test.ts`; all other 663 tests passed in
  Node 22, and that isolated file passed under the bundled runtime (1 file / 26 tests), giving
  passing evidence for all 99 files / 689 unit and component tests. Task 8: complete.
- Task 9: replacement tuple uniqueness conflicted with the approved immutable-history design.
  Ruling: add a new migration (do not edit the applied Task 2 migration) that converts the source
  tuple unique constraint to a lookup index; replacement linkage plus the replacement transaction
  now supplies idempotency. Cost: existing issuance reads were adjusted from unique lookup to
  deterministic first lookup. The disposable MariaDB RED showed the old tuple constraint; after
  migration, Task 9 replacement persistence integration passed. Focused unit/component tests,
  scoped lint, and typecheck passed. Revoked originals are explicitly rejected rather than silently
  made active. See `task-9-report.md`.
- Task 9 fix round 1: Administrator validation now precedes idempotent lookup; replacement policy
  rejects revoked/expired originals and preserves issuance lifecycle values. Confirmed replacement
  and public-key lifecycle controls were added, and former tuple lookups now order deterministically.
- Task 9 fix round 2: the MariaDB suite now calls the real replacement service (13 tests), proving
  authoritative Administrator checks, immutable source history, distinct signed/status-backed
  output, reciprocal links, exact audit/notification effects, repeat and barrier-synchronized
  concurrent idempotency, failure atomicity, lifecycle rejection, and key/status commit races. The
  replacement action now validates identifiers and maps unexpected diagnostics to one safe error.
  Focused Task 9 unit/component/action tests passed (6 files / 16 tests); all 13 Task 9 source/test
  files pass Prettier, and scoped plus repository-wide lint pass; typecheck and production build
  passed with only the known Open Badges proof dynamic-dependency warnings. Independent re-review
  remains pending.
- Task 9 fix round 2 full-suite follow-up: updated the stale signed-issuance Prisma test double from
  `findUnique` to the deterministic `findFirst` API (isolated 28/28), and replaced `%s` expansion of
  a 2 MiB batch-validation `File` fixture with literal case names (isolated 26/26). The complete
  unit/component suite now passes in one bounded Docker run: 102 files / 699 tests, with no prior
  heap-exhaustion split-run caveat.
- Task 9 fix round 3: the replacement commit now locks the reserved status list, active signing-key
  range, and exact prepared key in the shared lock order, then holds those locks through commit.
  Deterministic MariaDB races prove lifecycle-first retirement/compromise/rotation rejects with no
  residue, while replacement-first races block both exact-row mutation and active-range insertion
  until commit. Standard serialization applies: a replacement that owns the locks first remains
  valid at commit, and the later lifecycle event proceeds afterward at the cost of a brief wait.
  Retryable MariaDB failures are bounded to three fully rolled-back attempts. The test-only barrier
  is reachable only under `NODE_ENV=test` and adds no production injection seam. Signing-key UI
  feedback now catches thrown failures generically through `role=status`, and compromised keys have
  no lifecycle controls. Offline/malformed signer health and settings key-ID/cryptosuite mismatch
  regressions were added. Evidence: replacement MariaDB 19/19; focused Task 9/ripple 85/85;
  Prettier, scoped and repository-wide ESLint, project typecheck, and production build pass; build
  output retains only the previously recorded Open Badges proof dynamic-dependency warnings.
- Task 9 fix round 4: every now-nonunique source-tuple consumer uses one lifecycle-aware
  deterministic selector. Reciprocal replacement chains resolve to their deepest terminal;
  malformed, disconnected, and cyclic links use a stable fail-closed status/identifier fallback.
  Original-first and replacement-first regressions now return the same replacement issuance/public
  ID in batch preview, finalized batch commit, signed preparation locking, and signed commit
  locking. Evidence: focused preview/commit/signed issuance suite 108/108; scoped and repository-wide
  ESLint, project typecheck, changed-file Prettier, and production build pass. Build output retains
  only the previously recorded Open Badges proof dynamic-dependency warnings.
- Task 9 fix round 5: selector chain evaluation now separates completeness from depth. Only a fully
  reciprocal, non-cyclic traversal reaching a root with `supersedesId = null` participates in depth
  precedence; if none exists, the selector applies the global fail-closed status/identifier fallback
  across every record. Both permutations of an incomplete deeper fragment with revoked/expired
  terminals and a cycle with incomplete tail are covered, while a complete replacement chain still
  beats malformed records. Evidence: selector/preview/commit/signed issuance 113/113; repository
  ESLint, project typecheck, changed-file Prettier, and production build pass with only the known
  Open Badges proof dynamic-dependency warnings.
- Task 9 fix round 5 final re-review: approved with no Critical, Important, or Minor findings.
- Task 9: complete (independent review approved; lint and typecheck passed; Node 22 full
  unit/component suite 103 files / 724 tests passed; full MariaDB integration suite 13 files / 99
  tests passed; production build passed with the known proof-module dynamic-dependency warnings).
