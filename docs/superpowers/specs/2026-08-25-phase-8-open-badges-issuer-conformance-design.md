# Phase 8 — Open Badges 3.0 Issuer Conformance Design

**Date:** 2026-08-25  
**Status:** Approved design, pending implementation-plan review  
**Target:** Open Badges 3.0 Issuer-only conformance, implemented and tested locally before public HTTPS activation

## 1. Objective

Extend the HAU SOC Badging System from an unsigned Open Badges-aligned issuer into a cryptographically verifiable Open Badges 3.0 Issuer implementation. Phase 8 adds standards-compliant credential projection, EdDSA Data Integrity proofs, privacy-safe interoperable revocation, key lifecycle controls, local conformance testing, and the operational documentation required to activate the system on a stable public HTTPS domain.

Phase 8 prepares the product for the official 1EdTech conformance process. It does not claim or imply certification. HAU may describe the system as certified only after the applicable 1EdTech membership, testing, submission, review, and approval steps have been completed.

## 2. Approved Scope

### Included

- Open Badges 3.0 Issuer-only conformance target.
- JSON and JSON-LD OpenBadgeCredential serialization validated in JSON-LD safe mode.
- Ed25519 signing using the supported `eddsa-rdfc-2022` Data Integrity cryptosuite.
- A dedicated internal signing service with no host/public port.
- Docker secret-mounted signing keys; no private key in MariaDB, source control, logs, UI, backups, or public responses.
- Stable public issuer profile and public verification-key documents.
- Bitstring Status List revocation with signed status-list credentials.
- Proof and lifecycle verification in public credential views.
- Administrator-visible public-key metadata, signer readiness, key rotation state, and audit records.
- Explicit signed-replacement workflow for historical credentials.
- Local conformance fixtures, tamper tests, official-compatible proof vectors, Docker smoke tests, and a non-certifying local report.
- Production-domain and official 1EdTech activation runbook.

### Excluded

- Open Badges Host or Displayer certification.
- OAuth 2.0 wallet read/write APIs and persistent social-media account linking.
- Importing and storing credentials from external issuers.
- Cloud KMS/HSM integration in the first implementation; the signing boundary must remain replaceable so this can be added later.
- Rewriting historical credential snapshots.
- Any “Open Badges certified” wording before written 1EdTech approval.

## 3. Standards Baseline

Implementation and verification must use the current official Open Badges 3.0 document set and errata at implementation time:

- Open Badges 3.0 specification: <https://www.imsglobal.org/spec/ob/v3p0/>
- Open Badges 3.0 certification guide: <https://www.imsglobal.org/spec/ob/v3p0/cert/>
- Open Badges 3.0 implementation guide: <https://www.imsglobal.org/spec/ob/v3p0/impl/>
- Open Badges 3.0 errata: <https://www.imsglobal.org/spec/ob/v3p0/errata/>

The conformance baseline selected during design uses JSON-LD safe-mode validation, EdDSA Data Integrity proofs with `eddsa-rdfc-2022`, and Bitstring Status List revocation. The implementation plan must pin compatible library versions and record the exact official document/test-suite versions used for evidence.

## 4. Architecture

### 4.1 Services

- `web`: authorization, issuance orchestration, canonical credential construction, persistence, public verification, downloads, Administrator UI, and audit access.
- `signer`: private internal service that validates, canonicalizes, signs, and verifies approved credential/status-list payloads. It holds the private key as a read-only Docker secret and exposes no host port.
- `db`: MariaDB persistence for immutable snapshots, signed credentials, public key metadata, status-list metadata/allocations, replacements, audits, sessions, and existing product data.
- `worker`: existing provider-neutral notification delivery; it receives jobs only after a signed issuance commits.

The signer API is intentionally small and versioned. It accepts only allowlisted payload types and contexts, validates maximum payload sizes and issuer identity, and returns a signed document or a typed non-secret error. A future KMS/HSM adapter replaces the file-backed signer behind this boundary without changing credential records or public routes.

### 4.2 Signing flow

1. The web application authenticates the actor and enforces Administrator/Faculty ownership rules server-side.
2. The issuance service validates the class, badge, recipient, duplicate/idempotency rules, and issuer configuration.
3. A short database reservation allocates a non-sequential public ID and a unique Bitstring Status List index. Unused allocation gaps are permitted and disclose no recipient information.
4. The web application builds a strict canonical OpenBadgeCredential containing official VC/Open Badges contexts, canonical IDs, issuer profile, privacy-minimized recipient identity, achievement, criteria, image, dates, official schema reference, and standard `credentialStatus`.
5. Outside the main issuance transaction, the web application sends the privacy-minimized payload to the signer. The signer performs safe-mode/schema validation and produces an EdDSA Data Integrity proof.
6. Only a successfully signed document may enter the issuance transaction.
7. The transaction persists immutable source snapshots, immutable signed credential JSON, proof/key/version metadata, status allocation, issuance audit event, and recipient notification job.
8. The signed credential becomes visible only after commit.

Signer failure creates no issuance and no notification. The user receives a safe retryable message. Signatures produced for transactions that later lose a race are harmless and are not persisted.

### 4.3 Batch issuance

Batch preview remains unchanged and never signs. Commit allocates and signs a bounded set of valid new credentials before the final transaction. Signing may use bounded parallelism but must preserve deterministic row results. Any signing failure aborts the commit; the system does not create a partially signed batch. Existing duplicate/idempotency behavior remains enforced.

### 4.4 Public projection

For Phase 8 credentials, public JSON and downloads return the immutable stored signed credential. Current lifecycle is resolved through the referenced status list and validity dates, not by rewriting the credential. Human verification pages may combine immutable proof information with a fresh status check.

Legacy credentials continue using the existing historical projection until explicitly replaced. They must not be presented as cryptographically verified.

## 5. Data Model

Every schema change requires a migration and real MariaDB integration tests.

### 5.1 `signing_keys`

- `id`: stable internal identifier.
- `verification_method_url`: unique canonical public key URL.
- `controller_url`: canonical issuer/controller URL.
- `algorithm`: `Ed25519` for the approved implementation.
- `cryptosuite`: `eddsa-rdfc-2022`.
- `public_multikey`: public verification material only.
- `fingerprint`: unique public-key fingerprint.
- `status`: `ACTIVE`, `RETIRED`, or `COMPROMISED`.
- `activated_at`, `retired_at`, `compromised_at`, timestamps.
- Actor/audit linkage as required by lifecycle services.

Exactly one issuance key may be active. Private material is prohibited from this table.

### 5.2 `credential_status_lists`

- Stable ID and canonical public URL.
- Purpose fixed to `revocation` for Phase 8.
- Capacity and allocation cursor.
- Current signed status-list credential JSON.
- Version/digest and signing-key reference.
- Created/updated timestamps.

### 5.3 `credential_status_allocations`

- Issuance ID.
- Status-list ID.
- Unique numeric index.
- Revoked flag and revocation timestamp.
- Version/concurrency metadata.

Unique constraints prevent index reuse and more than one allocation per issuance.

### 5.4 `badge_issuances` additions

- Immutable signed credential JSON.
- Signing-key ID.
- Serializer/proof version.
- Status-list allocation relation.
- Optional self-relations for `supersedes` and `superseded_by`.

The existing unsigned `credential_json` remains an immutable source/history snapshot. Phase 8 does not rewrite it.

## 6. Key Lifecycle

- Keys are generated only through an explicit local administrative command.
- The private key is written to an explicit, narrow path with restrictive permissions and is mounted read-only as a Docker secret.
- Startup fails closed when signing is enabled but the mounted private key is missing, malformed, uses the wrong algorithm, or does not match registered public metadata.
- Rotation registers and activates a new key for future credentials. Retired public keys remain published indefinitely so historical proofs remain verifiable.
- Compromise immediately blocks new issuance and records a high-priority audit event. Existing credentials display a trust warning until the institution completes its remediation policy.
- Private-key backup/recovery is separate from database/media backups and requires an explicit operational runbook. The application never exports private keys.
- Lifecycle actions require Administrator authorization, explicit confirmation, audit records, and authorization tests.

## 7. Historical Credential Policy

- Existing credentials remain unchanged and available.
- They are labeled neutrally as legacy records and are not described as cryptographically verified.
- An Administrator may explicitly create a signed replacement after reviewing the historical record.
- Replacement creates a new issuance/public ID, proof, status allocation, audit event, and recipient notification.
- Original and replacement records link to each other. The original remains accessible and is marked superseded; it is not silently deleted or rewritten.
- Replacement cannot bypass current authorization, duplicate, revocation, expiration, issuer, or recipient-identity rules.

## 8. Interoperable Revocation

- New signed credentials include a standard `BitstringStatusListEntry` with purpose `revocation`, a stable status-list index, and a canonical status-list credential URL.
- The status-list credential is itself signed and privacy-safe.
- Revocation atomically updates the issuance lifecycle, audit record, notification job, allocation flag, and status-list version.
- Concurrent revocations use locking/version checks so updates cannot overwrite each other.
- Issued signed credentials remain byte-for-byte immutable; revocation changes the referenced status list only.
- Expiration uses `validUntil` and does not set a revocation bit.
- The existing HAU lifecycle extension may remain for internal/backward compatibility but is not the primary interoperable status mechanism.

## 9. Public Endpoints and Verification

Public read-only routes expose:

- Issuer profile.
- Public verification-key/Multikey document.
- Signed OpenBadgeCredential JSON-LD and download.
- Signed Bitstring Status List credential.
- Human verification page.
- Non-secret health/readiness state.

Verification performs:

1. Strict schema and JSON-LD safe-mode validation.
2. Data Integrity proof verification against the published key.
3. Issuer/controller and verification-method checks.
4. Bitstring revocation lookup.
5. `validFrom` and optional `validUntil` checks.
6. Deterministic result classification: `VERIFIED`, `REVOKED`, `EXPIRED`, `INVALID_PROOF`, or `VERIFICATION_UNAVAILABLE`.

Status unavailability fails closed: the page must not claim that a credential is active when revocation cannot be checked. Public responses never expose recipient email, raw identity inputs, private keys, internal stack traces, or notification metadata.

## 10. Security and Privacy

- The signer is isolated on the internal Compose network and has no public port.
- Internal requests are authenticated and use strict request/response schemas, bounded timeouts, payload limits, context allowlists, and cryptosuite allowlists.
- The signer rejects unknown contexts, noncanonical issuer/controller identities, unsupported proof requests, and oversized payloads.
- Logs contain correlation IDs, key IDs, operation type, duration, and safe outcomes only.
- Recipient email and roster fields are excluded from signer payloads except the already-approved privacy-preserving hashed identity representation.
- Signing does not occur inside a long database transaction.
- Circuit breaking and bounded concurrency protect web/database capacity when the signer is unavailable.
- Health endpoints disclose readiness, not key material or credential payloads.
- Existing CSRF, authorization, rate-limit, audit, backup, and privacy controls remain mandatory.

## 11. Modern Light UI

- Public and authenticated credential pages add a compact **Cryptographic Verification** panel using the existing modern light tokens.
- Result states use accessible text plus green/amber/red styling; color is never the only signal.
- Administrator Settings shows signer readiness, public key ID/fingerprint, cryptosuite, activation state, and rotation history without exposing private material.
- Legacy and superseded credentials receive clear neutral explanations and replacement links.
- Key lifecycle and signed-replacement actions use explicit confirmation, keyboard-accessible controls, visible focus, live status messages, and server-side Administrator authorization.
- Public pages remain mobile-first and privacy-minimized.

## 12. Failure Behavior

- **Signer unavailable/timeout:** reject issuance before commit with a retryable generic message.
- **Invalid canonical payload:** reject issuance, record a safe diagnostic event, and do not retry automatically until corrected.
- **Status service unavailable:** report `VERIFICATION_UNAVAILABLE`; never claim active/verified status.
- **Key mismatch at startup:** signer remains unready and cannot sign.
- **Compromised key:** block new issuance and surface an institutional trust warning for affected credentials.
- **Status-list conflict:** retry the bounded transactional update; never lose a revocation bit.
- **Batch signing failure:** commit no new credentials from that batch attempt.

## 13. Testing and Conformance Evidence

### Unit and schema tests

- Canonical serializer fixtures.
- Strict context/schema validation and rejection paths.
- Key metadata/lifecycle invariants.
- Proof generation/verification and tamper detection.
- Status-list allocation, encoding, lookup, and expiration classification.
- Legacy/replacement rules and public privacy projection.

### MariaDB integration tests

- Migrations, constraints, active-key uniqueness, allocation uniqueness, concurrent revocation, replacement relations, audit atomicity, and rollback behavior.
- Individual/batch issuance commits only signed credentials and creates notifications only after successful signing.
- Revocation atomically updates domain, audit, outbox, and status-list state.

### E2E and Docker tests

- Administrator and owning/non-owning Faculty authorization.
- Signed individual and batch issuance.
- Verified, expired, revoked, tampered, unavailable, legacy, superseded, retired-key, and compromised-key views.
- JSON/download/key/status endpoints and security headers.
- Signer failure and recovery.
- Responsive/accessible proof UI.
- Docker health across web, signer, database, and notification worker.

### Local conformance report

The repository produces a versioned local report containing test-suite versions, official document/errata versions, key algorithm/cryptosuite, schema/safe-mode results, proof vectors, example credentials, and pass/fail evidence. It must be labeled as local readiness evidence, not 1EdTech certification.

## 14. Production and Official Conformance Checkpoint

Local development uses a disposable test key clearly marked non-production. Official conformance cannot begin on `localhost`.

Before official submission:

1. Provision the final public HTTPS domain.
2. Configure stable issuer, verification-method, credential, artwork, and status-list URLs.
3. Provision and securely back up a production signing key.
4. Validate DNS, TLS, public reachability, content types, caching, security headers, and revocation freshness.
5. Issue fresh production-domain test credentials; never reuse locally identified credentials for submission.
6. Run the current official 1EdTech Open Badges 3.0 suite and resolve every failure.
7. Issue the required badge to the 1EdTech conformance recipient.
8. Record the required recipient-retrieval demonstration.
9. Submit results through an eligible HAU/1EdTech representative.
10. Wait for written approval and certified-products listing before adding certification wording or logos.

## 15. Requirement Mapping

- **FR-010 / FR-011:** signed individual and batch issuance.
- **FR-012:** immutable signed credential, public ID, proof version, and historical relationships.
- **FR-013:** proof-aware public verification and interoperable status.
- **FR-015:** conformant JSON/JSON-LD credential output.
- **FR-016:** Bitstring Status List revocation without destructive history changes.
- **FR-020:** signing, replacement, rotation, compromise, and revocation audits.
- **FR-023:** canonical issuer/key settings and Administrator-visible public metadata.
- **P1 cryptographic signing:** EdDSA Data Integrity proofs.
- **Open Badges 3.0 alignment:** issuer, achievement, recipient, proof, schema, lifecycle, and JSON-LD safe-mode conformance goals.
- **Security/privacy NFRs:** secret isolation, privacy-minimized public/signer payloads, fail-closed verification, typed validation, tests, migrations, health, and Docker deployment.

## 16. Completion Criteria

Phase 8 local implementation may be called complete only when:

- All new schema changes are migrated and verified on fresh MariaDB.
- All post-activation issuances are signed before commit.
- Proof verification detects tampering and key mismatch.
- Bitstring revocation and expiration classify correctly.
- Historical credentials remain unchanged and explicit replacement works.
- Authorization, privacy, audit, notification, batch, and concurrency tests pass.
- Format, lint, type-check, unit, integration, E2E, production build, and Docker smoke gates pass.
- Local conformance evidence is generated and clearly non-certifying.
- The production-domain/official-conformance runbook is complete.

Official Open Badges certification remains a separate external milestone.
