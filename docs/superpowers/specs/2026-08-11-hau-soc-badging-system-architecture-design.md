# HAU SOC Badging System Architecture Design

**Status:** Proposed for implementation planning  
**Requirements baseline:** `REQUIREMENTS.md` version 1.0, dated 2026-08-11  
**Deployment assumption:** One production host running Docker Compose, with persistent local volumes for MariaDB and uploaded media during MVP  
**Standard target:** 1EdTech Open Badges 3.0-aligned MVP; no certification claim

## 1. Scope and architectural goals

This document defines the final target architecture, code organization, delivery roadmap, and decisions that must be settled before feature implementation. It does not implement application features.

The architecture must:

- enforce administrator, faculty, ownership, and public-data boundaries on the server;
- preserve issued credentials as historical snapshots;
- make individual and batch issuance transactional and auditable;
- expose non-sequential public verification identifiers without exposing private roster data;
- support unsigned Open Badges 3.0-style JSON/JSON-LD during MVP and cryptographic proof in Phase 8 without redesigning the core model;
- deploy on one Docker Compose host without source edits;
- keep file storage replaceable so local storage can become S3-compatible storage in P1;
- preserve the modern light, academic-professional design system across authenticated and public screens; and
- remain a modular monolith until scale or organizational boundaries justify extracting services.

## 2. Architecture choice

### Selected: modular monolith

The system will be one Next.js application divided into domain modules. Each module owns its validation, authorization policies, services, repository operations, types, and tests. Cross-module calls use explicit service interfaces rather than importing route or UI code.

This approach fits the confirmed single-server MVP, permits database transactions across issuance and audit records, and minimizes operational complexity. Module boundaries preserve a migration path to separate services if future load or ownership requires it.

### Alternatives considered

1. **Globally layered monolith:** simpler initial naming, but a workflow is scattered across controller, service, and repository trees. This makes ownership and security review harder as the system grows.
2. **Service-oriented deployment:** provides independent scaling, but introduces network failure modes, distributed transactions, service authentication, and multi-service operations that the MVP does not need.

## 3. Runtime topology

### MVP services

- `web`: Next.js application serving authenticated UI, public verification, server actions, route handlers, and health endpoints.
- `db`: MariaDB with a persistent named volume and health check.
- `mailpit`: development-only SMTP capture service for password-reset flows and later recipient notification work.
- `proxy`: Caddy in the production Compose profile for TLS termination, security headers, request-size limits, and forwarding to `web`.

Uploaded files live in a separate persistent media volume mounted into `web`. Database and media backups are operationally separate and must be coordinated for restore consistency.

### P1 extension

An S3-compatible `StorageProvider` implementation replaces local file writes through configuration. MinIO may be enabled for development or self-hosted deployments. Credential records continue to hold stable storage keys and public asset URLs rather than provider-specific paths.

## 4. Technology integration

### Next.js and TypeScript

Use the Next.js App Router with strict TypeScript. Server Components are the default for data-heavy pages. Client Components are limited to interactive controls such as import mapping, previews, upload widgets, and sharing actions. Route Handlers expose public JSON/JSON-LD, exports, health checks, and endpoints whose HTTP semantics are clearer than Server Actions. Server Actions may handle authenticated form mutations but must call domain services that independently authorize the actor.

Runtime boundaries are explicit: database, filesystem, authentication, and cryptographic modules run only in the Node.js runtime. Public pages may be cached conservatively, but credential status must not become stale; revocation-sensitive responses use revalidation or no-store behavior.

### MariaDB, Prisma, and migrations

MariaDB is the source of truth. Prisma is the selected ORM because it supports MySQL-compatible databases, typed queries, transactions, and checked-in migrations. Every schema change creates a migration. Production startup runs migrations as an explicit deployment step before application traffic, not concurrently from every web process.

Database constraints enforce uniqueness and integrity where possible: normalized user email, faculty employee ID, class roster membership, issuance public ID, and issuance idempotency keys. Application services enforce actor-dependent ownership rules inside transactions. Issuance, revocation, and batch commit write audit records transactionally with their domain changes.

### Authentication and authorization

Auth.js provides credentials-based authentication with database-backed sessions. Passwords use Argon2id. Session cookies are HTTP-only, secure in production, same-site, and rotated according to the auth configuration. Password-reset tokens are random, single-use, stored only as hashes, and expire. Suspended users cannot establish new sessions, and existing sessions are invalidated using a session/version mechanism.

Authorization is a separate server-only policy layer. Every protected service receives an authenticated actor and checks role plus resource ownership before reading or mutating data. Route guards and hidden navigation improve UX but are not authorization controls. Protected features require negative authorization tests.

### File storage

All file operations use a `StorageProvider` interface with `put`, `open`, `delete`, and URL/key resolution operations. The local implementation writes generated opaque keys beneath configured media roots and never trusts user filenames as paths. Badge artwork is decoded and validated by content, dimensions, size, and allowed format before storage. Evidence visibility is checked before serving files.

MVP file deletion applies only to unreferenced drafts or replaceable source assets. Issued credential snapshots retain stable historical artwork references; cleanup jobs must prove that no issuance references an asset before removing it.

### Open Badges 3.0 alignment

Internal domain models remain independent of JSON-LD serialization. An `open-badges` adapter maps issuer settings, achievement snapshots, recipient subject data, issuance dates, evidence, status, and identifiers to an OpenBadgeCredential-shaped document.

MVP output is explicitly described as aligned and unsigned. Recipient public identity is minimized; email is excluded by default. The serialization boundary reserves proof and status-list fields so Phase 8 can add cryptographic signing, verification, conformance fixtures, and wallet/API interoperability without rewriting issuance records.

Credential JSON saved at issuance is an immutable snapshot. Public export may combine that snapshot with current status and revocation metadata through a deterministic projection, preserving both historical claims and current validity.

### Docker Compose and operations

The repository provides a multi-stage production Dockerfile and Compose profiles for development and production. Environment variables configure database access, public base URL, auth secrets, SMTP, storage, upload limits, issuer defaults, and proxy behavior. Only non-secret examples are committed.

MariaDB and media use named volumes. Health checks distinguish liveness from database readiness. Structured application logs go to standard output. Production documentation includes migration, backup, restore, rotation, and rollback procedures. Docker deployment requires configuration changes only, never source edits.

## 5. Domain boundaries

- `identity`: authentication, sessions, password resets, actor context, and account status.
- `faculty`: faculty account administration and profiles.
- `classes`: class lifecycle and faculty ownership.
- `rosters`: students, enrollment, imports, validation, duplicate detection, and exports.
- `badges`: achievement templates, criteria, artwork, duplication, archive state, and historical snapshot creation.
- `issuance`: individual issuance, batch commit, immutable credential snapshots, idempotency, expiration, and exports.
- `verification`: public lookup, current status projection, public evidence, downloads, and sharing metadata.
- `audit`: append-oriented sensitive-action events and administrator queries.
- `settings`: issuer identity, public-page defaults, branding, and support contact.
- `storage`: provider-neutral validated file persistence.
- `open-badges`: standards mapping, JSON-LD contexts, validation fixtures, and later proofs.
- `platform`: database, logging, rate limiting, environment validation, health, and shared transaction utilities.

Domain services return typed results and stable error codes. UI and HTTP adapters translate those results into accessible validation messages and appropriate HTTP responses. Expected validation or conflict failures do not leak stack traces; unexpected failures receive correlation IDs and structured server logs.

## 6. Data model refinements

The requirements' entities remain the baseline, with these architectural refinements:

- Use opaque application IDs internally and a separate cryptographically random `public_id` for credentials.
- Add normalized email fields and explicit unique indexes instead of relying on display casing.
- Store session/reset-token records required by the authentication design.
- Store an account session version or equivalent invalidation field.
- Represent status fields with constrained enums at the application and database levels supported by the migration strategy.
- Add `credential_snapshot_json` and a serializer/schema version to issuances; do not regenerate historical claims from mutable templates.
- Add idempotency/fingerprint fields to individual and batch issuance to prevent accidental duplicates.
- Model import staging and row validation separately from committed roster or issuance data so preview is mandatory.
- Record audit context as sanitized JSON; never place passwords, reset tokens, session tokens, or unnecessary recipient PII in logs.
- Treat evidence visibility as explicit and deny public access by default.
- Add timestamps and actor references needed to explain lifecycle changes.

The exact Prisma schema and indexes will be specified and migration-tested in Phase 1 and the owning feature phase. No schema is created by this architecture step.

## 7. Request and data flows

### Protected mutation

1. Next.js resolves the database session and constructs the actor.
2. The route or action validates untrusted input with a shared schema.
3. The domain service checks role and resource ownership server-side.
4. The service performs its mutation in a database transaction.
5. Sensitive mutations append an audit record in that transaction.
6. The adapter returns a typed success or safe error and invalidates relevant page data.

### Individual issuance

1. Validate actor, class ownership, roster membership, active template, and recipient data.
2. Construct issuer, achievement, recipient, evidence, date, and image snapshots.
3. Generate internal and public identifiers using cryptographically secure randomness.
4. In one transaction, insert the issuance, immutable credential snapshot, and audit record.
5. Return the verification URL only after commit.

### Batch issuance

1. Upload and parse CSV/XLSX into isolated staging data.
2. Map columns, sanitize spreadsheet values, normalize identities, and calculate row fingerprints.
3. Display a complete preview with valid, invalid, and duplicate rows plus an error export.
4. Require an explicit commit using the validated preview token/version.
5. Revalidate ownership and preview freshness.
6. Commit valid rows transactionally according to a documented all-or-nothing policy for the chosen valid set; record batch and audit summaries.
7. Return success/failure counts and exports without silently committing unpreviewed rows.

### Public verification

1. Rate-limit the lookup and validate the public identifier format.
2. Load only public-safe snapshot fields and current status metadata.
3. Compute active, revoked, or expired status deterministically.
4. Render a mobile-first verification page and expose JSON/JSON-LD with the same status.
5. Never return roster metadata or recipient email by default.

## 8. Recommended folder structure

The following is the target structure; it is documented now and should be created incrementally by the phase that owns each path.

```text
.
├── .github/workflows/              # CI checks and later release workflows
├── docs/
│   ├── architecture/               # ADRs, security model, deployment topology
│   ├── operations/                 # deploy, migrate, backup, restore, rollback
│   ├── traceability/                # requirements-to-tests matrix
│   └── superpowers/
│       ├── plans/                   # executable phase plans
│       └── specs/                   # approved design specifications
├── prisma/
│   ├── migrations/                 # immutable checked-in schema migrations
│   ├── schema.prisma
│   └── seed.ts                      # environment-driven initial admin seed
├── public/                          # non-sensitive static assets only
├── src/
│   ├── app/
│   │   ├── (auth)/                  # login and password-reset routes
│   │   ├── (dashboard)/             # authorized application shell/routes
│   │   ├── verify/[publicId]/       # public verification UI
│   │   ├── api/                     # HTTP endpoints, exports, JSON-LD, health
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/                      # accessible primitives styled with tokens
│   │   ├── layout/                  # sidebar, top bar, breadcrumbs
│   │   └── feedback/                # errors, empty states, progress, status
│   ├── config/                      # validated environment and feature config
│   ├── modules/
│   │   ├── identity/
│   │   ├── faculty/
│   │   ├── classes/
│   │   ├── rosters/
│   │   ├── badges/
│   │   ├── issuance/
│   │   ├── verification/
│   │   ├── audit/
│   │   ├── settings/
│   │   ├── storage/
│   │   └── open-badges/
│   ├── platform/
│   │   ├── db/                      # Prisma client and transaction helpers
│   │   ├── logging/                 # structured logs and correlation IDs
│   │   ├── rate-limit/              # replaceable rate-limit interface
│   │   └── security/                # headers and shared security helpers
│   ├── styles/                      # semantic tokens and shared style utilities
│   └── test/                        # factories, fixtures, DB and auth harnesses
├── tests/
│   ├── integration/                 # DB/API/authz and transaction behavior
│   ├── e2e/                         # browser acceptance workflows
│   ├── security/                    # CSRF/XSS/injection/traversal/auth boundaries
│   └── fixtures/                    # imports and Open Badges validation fixtures
├── storage/.gitkeep                 # local development mount point, no uploads tracked
├── .dockerignore
├── .env.example
├── .gitignore
├── compose.yaml
├── Dockerfile
├── Caddyfile
├── package.json
├── tsconfig.json
└── README.md
```

Within each domain module, create only the folders that the module needs:

```text
module-name/
├── schemas/                         # untrusted-input parsing and validation
├── policies/                        # role and ownership decisions
├── services/                        # use cases and transaction orchestration
├── repositories/                    # focused database operations
├── components/                      # module-specific UI
├── queries/                         # read models for screens and exports
├── types.ts                         # stable public module contracts
└── *.test.ts                        # colocated unit tests
```

Modules must not import another module's repository internals. They consume exported services or contracts.

## 9. Modern light design system

Semantic tokens, not raw colors, are the UI contract. Initial tokens map to the requirements:

- page: `#FFFFFF`; subtle page/surface: `#F8FAFC`;
- primary text: approximately `#163A63`; secondary text: `#64748B`;
- action/accent: approximately `#2E6FA8`; accent surface: `#EAF2FF`;
- success/issued: accessible green; warning/expiring: amber; danger/revoked/suspended: red;
- cool-gray borders, 10–14px card/modal radii, smaller control radii, and subtle shadows;
- Inter when bundled or available, with a system sans fallback;
- consistent outline icons, visible focus rings, keyboard access, reduced-motion behavior, and WCAG-compatible contrast.

Authenticated pages use a responsive left navigation and top bar. Dense records use tables with pagination and mobile alternatives. The public credential view is mobile-first and makes badge artwork, verification status, issuer, criteria, recipient display identity, and issue date visually prominent. Nested cards and decorative dashboard clutter are avoided.

## 10. Architectural decision register

### Decisions accepted

- **ADR-001:** Modular monolith rather than microservices.
- **ADR-002:** Single production host with Docker Compose for MVP.
- **ADR-003:** Next.js App Router and strict TypeScript.
- **ADR-004:** MariaDB plus Prisma with migration-only schema changes.
- **ADR-005:** Auth.js credentials authentication, database sessions, and Argon2id.
- **ADR-006:** Server-only policy modules enforce RBAC and ownership.
- **ADR-007:** Local storage through a provider abstraction; S3-compatible storage is P1.
- **ADR-008:** Immutable issuance snapshots with separate current-status projection.
- **ADR-009:** Unsigned Open Badges 3.0-aligned MVP output; signing is Phase 8.
- **ADR-010:** Caddy is the default production reverse proxy.

### Decisions to finalize before or during Phase 0

1. **Supported badge image formats and limits:** recommend PNG, JPEG, and WebP; reject SVG in MVP to reduce active-content risk; set pixel and byte limits through environment-backed policy.
2. **Public recipient display:** recommend recipient name by default, with email always private; allow an issuer-level option for initials or a configured display name only if stakeholders require stricter privacy.
3. **Evidence default visibility:** recommend private by default, with an explicit per-item public action.
4. **Batch commit semantics:** recommend committing the explicitly previewed valid set atomically while invalid rows remain excluded and downloadable; any database failure rolls back the entire valid set.
5. **Duplicate issuance rule:** recommend a unique active issuance per achievement snapshot, class, and recipient unless an authorized reissue workflow explicitly supersedes it.
6. **Expiration boundary:** recommend UTC storage and expiry at the exact stored instant, formatted in the viewer's locale.
7. **Admin bootstrap:** recommend an environment-driven one-time seed command that refuses weak/default credentials and does not contain a password in source control.
8. **Rate-limit backend:** recommend an in-process limiter for the single-node MVP behind an interface; adopt Redis only when multi-process or multi-node deployment requires shared counters.
9. **JSON-LD context availability:** decide whether exports reference authoritative remote contexts only or also provide a pinned validation fixture for reliable offline tests; recommend remote identifiers plus pinned test fixtures.
10. **Retention and backup policy:** institutional owners must provide retention period, backup frequency, off-host destination, encryption, and recovery objectives before production launch.
11. **Institutional identity integration:** MVP uses local credentials; any SSO requirement needs a separate identity-provider decision and threat review.

## 11. Phase roadmap and requirement mapping

### Phase 0 — Repository and design specification

Deliver architecture records, design tokens, dependency policy, Compose skeleton, environment contract, CI quality gates, and implementation plans. Covers the enabling portions of NFR deployment, typed code, centralized tokens, documentation, and security configuration. No product workflow is implemented.

### Phase 1 — Foundation

Create the Next.js/TypeScript application, MariaDB/Prisma foundation, migrations, authentication, roles, environment-driven admin seed, policy framework, audit foundation, health/logging, and accessible shell. Maps to FR-001, FR-002, enabling FR-020, acceptance criteria 1 and 3, and the security/non-functional baseline.

### Phase 2 — Faculty and classes

Implement faculty lifecycle/profile management and owned class lifecycle with server authorization and audit coverage. Maps to FR-003, FR-004, FR-020, FR-021, acceptance criteria 2–4.

### Phase 3 — Rosters and badge templates

Implement students/enrollment, roster exports, staged CSV/XLSX mapping and preview, duplicate/error reporting, badge templates, criteria/alignment metadata, and validated artwork. Maps to FR-005–FR-009, FR-020–FR-022, acceptance criteria 4–5 and 8.

### Phase 4 — Individual issuance

Implement transaction-safe issuance, immutable snapshots, random public IDs, expiration-ready fields, exports, and audit events. Maps to FR-010, FR-012, FR-015, FR-020–FR-022, acceptance criteria 6, 9, and the historical integrity rules.

### Phase 5 — Batch issuance

Implement staged upload/mapping/validation, mandatory preview, explicit commit, idempotency, transaction handling, summary, and error report. Maps to FR-011, FR-012, FR-020–FR-022, acceptance criteria 7–8.

### Phase 6 — Verification, sharing, settings, and revocation

Implement public status pages, privacy-safe views, JSON/JSON-LD, download/share actions, issuer settings, authorized revocation, evidence visibility, and historical status. Maps to FR-013–FR-016, FR-020, FR-023, acceptance criteria 9–14.

### Phase 7 — Hardening and release readiness

Complete rate limits, security suites, accessibility/responsive QA, pagination/performance checks, backup/restore documentation and drills, complete audit coverage, E2E acceptance tests, production Docker smoke tests, and traceability matrix. Maps to FR-001–FR-023 quality coverage, acceptance criterion 15, security requirements, and all non-functional requirements.

### Phase 8 — Open Badges hardening

Add cryptographic signing/proofs, key lifecycle procedures, conformance fixtures/testing, status interoperability, and wallet/API interoperability. Maps to the P1 signing requirement and Open Badges 3.0 proof/conformance goals. Certification wording remains prohibited until formal conformance/certification is completed.

## 12. Phase 0–8 task checklist

### Phase 0

- [ ] Ratify the decision register and record ADRs.
- [ ] Define supported runtimes, package manager, dependency update policy, and lockfile policy.
- [ ] Scaffold Next.js and strict TypeScript without feature pages.
- [ ] Establish semantic light-theme tokens and accessible primitive policy.
- [ ] Add Dockerfile, Compose services/profiles, volumes, and health-check skeletons.
- [ ] Define `.env.example` without secrets and validate environment at startup.
- [ ] Configure format, lint, typecheck, unit-test, integration-test, E2E, and build scripts.
- [ ] Configure CI quality gates.
- [ ] Write security, data classification, threat-model, and operational outlines.
- [ ] Create the requirements traceability matrix and phase plans.

### Phase 1

- [ ] Add Prisma schema baseline and initial migration.
- [ ] Add MariaDB test harness and migration verification.
- [ ] Implement Auth.js credentials login/logout and database sessions.
- [ ] Implement Argon2id password hashing and reset-token lifecycle.
- [ ] Implement account status and session invalidation.
- [ ] Implement actor context and role/ownership policy contracts.
- [ ] Add negative authorization tests for protected foundations.
- [ ] Implement environment-driven admin bootstrap.
- [ ] Implement append-oriented audit service foundation.
- [ ] Implement structured logging, correlation IDs, and health endpoints.
- [ ] Build the accessible responsive application shell using approved tokens.
- [ ] Verify Docker startup, persistence, and production build.

### Phase 2

- [ ] Implement faculty account create/edit/activate/suspend/reset workflows.
- [ ] Implement faculty profile management.
- [ ] Audit sensitive faculty administration actions.
- [ ] Test administrator-only access and suspended-account behavior.
- [ ] Implement owned class create/edit/archive/reopen workflows.
- [ ] Enforce ownership in services and database queries.
- [ ] Add class search, filtering, and pagination.
- [ ] Audit class lifecycle actions.
- [ ] Add integration and E2E coverage for admin/faculty boundaries.

### Phase 3

- [ ] Implement student records and class enrollment lifecycle.
- [ ] Enforce class ownership for roster reads and mutations.
- [ ] Add roster search, filter, pagination, and CSV export.
- [ ] Implement safe CSV/XLSX parsing and column mapping.
- [ ] Implement staged import preview, normalization, validation, and duplicate detection.
- [ ] Implement downloadable row-level error reports.
- [ ] Require explicit import commit and transactional writes.
- [ ] Implement badge template create/edit/duplicate/archive workflows.
- [ ] Implement criteria and optional skill/alignment metadata.
- [ ] Implement validated badge artwork upload and preview.
- [ ] Ensure template changes cannot affect later-created issuance snapshots retroactively.
- [ ] Audit roster/import/template/image actions and test authorization boundaries.

### Phase 4

- [ ] Define immutable credential snapshot and serializer version.
- [ ] Implement secure internal/public identifier generation.
- [ ] Implement individual issuance validation and duplicate protection.
- [ ] Commit issuance and audit event in one transaction.
- [ ] Persist credential-critical issuer, achievement, recipient, image, criteria, and evidence data.
- [ ] Add issuance search, filters, pagination, detail, and CSV export.
- [ ] Add unsigned JSON/JSON-LD serialization tests.
- [ ] Test rollback, ownership, privacy, uniqueness, and historical immutability.

### Phase 5

- [ ] Implement batch issuance upload and isolated staging.
- [ ] Implement mapping, validation, normalization, and duplicate detection.
- [ ] Display mandatory row-level preview before commit.
- [ ] Bind commit to the reviewed preview version/token.
- [ ] Revalidate authorization and preview freshness at commit time.
- [ ] Atomically issue the reviewed valid set with idempotency protection.
- [ ] Record batch summary and issuance/audit events.
- [ ] Provide success, failure, duplicate, and error exports.
- [ ] Test tampered previews, repeat submits, rollback, and cross-faculty access.

### Phase 6

- [ ] Implement public lookup using non-sequential public IDs.
- [ ] Compute and display active, revoked, and expired status.
- [ ] Render privacy-minimized, mobile-first verification pages.
- [ ] Expose consistent JSON/JSON-LD credential downloads.
- [ ] Implement copy URL, Web Share, LinkedIn, Facebook, X, and email actions.
- [ ] Implement authorized revocation with required reason and timestamp.
- [ ] Preserve revoked credentials and append audit records transactionally.
- [ ] Implement issuer/system settings with administrator authorization.
- [ ] Implement public/private evidence access with private default.
- [ ] Test cache freshness, enumeration resistance, privacy, sharing URLs, and status changes.

### Phase 7

- [ ] Complete threat modeling for auth, imports, uploads, public verification, and exports.
- [ ] Test CSRF, XSS, SQL injection, formula injection, path traversal, and authorization boundaries.
- [ ] Add rate limiting to login/reset/public verification/heavy endpoints.
- [ ] Complete keyboard, focus, labels, contrast, error, alt-text, and reduced-motion audits.
- [ ] Verify responsive behavior on desktop, tablet, and mobile.
- [ ] Validate pagination and representative data-volume performance.
- [ ] Complete structured log and audit-log coverage review.
- [ ] Document and test database/media backup and restore.
- [ ] Run fresh-host Docker Compose and persistent-volume smoke tests.
- [ ] Run format, lint, typecheck, unit, integration, security, E2E, and production build gates.
- [ ] Complete the FR/NFR/acceptance-criteria traceability matrix.
- [ ] Document known limitations and production runbook.

### Phase 8

- [ ] Select credential proof suite and key-management model.
- [ ] Implement protected signing-key storage, rotation, and recovery procedures.
- [ ] Sign OpenBadgeCredential/Verifiable Credential output.
- [ ] Implement proof verification and negative cryptographic fixtures.
- [ ] Implement interoperable status/revocation representation.
- [ ] Test authoritative JSON-LD processing and conformance fixtures.
- [ ] Test representative wallet/API import and verification flows.
- [ ] Document alignment results and unresolved conformance gaps.
- [ ] Pursue formal certification separately before using certification claims.

## 13. Testing and quality strategy

- Unit tests cover policies, validation, status computation, snapshot construction, import normalization, and Open Badges mapping.
- Integration tests use MariaDB, not an incompatible in-memory substitute, for constraints, migrations, transactions, and authorization behavior.
- Route/API tests cover response schemas, cache rules, privacy, errors, and rate limiting.
- E2E tests cover each MVP acceptance criterion using administrator, faculty, suspended faculty, and anonymous verifier personas.
- Security tests explicitly exercise CSRF, XSS, SQL injection, spreadsheet formula injection, path traversal, enumeration, upload validation, and horizontal/vertical authorization.
- Migration tests apply all migrations to a clean database and exercise supported upgrade/rollback procedures where rollback is safe.
- Every phase ends with formatter, linter, type checker, relevant tests, and production build; Phase 7 runs the complete suite and Docker smoke test.

## 14. Requirement coverage summary

All MVP functional requirements are assigned to Phases 1–7. FR-020 is introduced in Phase 1 and extended with every sensitive workflow. FR-006 and FR-011 preserve the mandatory preview-before-commit rule. FR-010–FR-016 preserve issuance history and public privacy. All 15 acceptance criteria have a delivery phase and receive final E2E traceability in Phase 7. Phase 8 covers the deferred signing and interoperability work without implying certification.

## 15. Explicit assumptions

- HAU SOC is one issuer organization in MVP; this is not a multi-tenant SaaS architecture.
- Students do not authenticate in MVP.
- Local credentials are the MVP faculty/admin identity mechanism; SSO is out of scope until separately approved.
- One `web` instance is sufficient for MVP; replaceable abstractions avoid preventing later horizontal scaling.
- Local volume storage is acceptable for MVP only when production backup and restore procedures are approved.
- Email infrastructure is configured for password reset; recipient issuance notifications remain P1.
- Optional expiration fields may exist early for schema compatibility, while administrator/faculty expiration-rule UX remains P1 unless required for acceptance.
- Open Badges output is alignment work, not a certification claim.
