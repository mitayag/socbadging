# Phase 4 — Individual Issuance Design

## Status

Approved design for implementation planning.

## Scope and Requirement Mapping

Phase 4 implements individual badge issuance and authenticated issuance records:

- **FR-010:** Faculty issues one badge to one actively enrolled student.
- **FR-012:** Every issuance has an immutable internal ID and cryptographically random public ID.
- **FR-015:** Authenticated JSON credential export aligned to Open Badges 3.0 concepts.
- **FR-020:** Issuance and related sensitive activity create audit records.
- **FR-021:** Issuances support search, status, badge, class, and recipient filtering.
- **FR-022:** Issuance records support CSV export.
- **Acceptance criterion 6:** Faculty can issue one badge.
- **Acceptance criterion 9:** Every issuance has a unique public verification identifier. The public verification page remains Phase 6.

Batch issuance, public verification pages, sharing, revocation, evidence, email notification, signing, and Administrator-managed issuer settings remain outside Phase 4.

## Roles and Authorization

### Faculty

- Can issue only from a class they own.
- The class, badge template, and enrollment must all be `ACTIVE` at transaction time.
- The badge template must belong to the same class and owner.
- The selected student must have an active enrollment in that class.
- Can list, search, inspect, and export only issuances from owned classes.

### Administrator

- Can list, search, inspect, and export all issuance records.
- Cannot issue credentials during Phase 4.

All authorization is enforced inside server-only domain services before protected reads or writes. UI visibility is not an authorization control. Negative tests cover unauthenticated, Administrator mutation, non-owner Faculty, cross-class badge/student, inactive class, archived badge, and removed enrollment cases.

## Duplicate and Idempotency Rule

The database enforces one issuance for each `(class_id, badge_template_id, student_id)` tuple.

- Repeated submissions do not create a second credential.
- If the same tuple already exists, the service returns the existing issuance with an `alreadyIssued` result rather than writing another issuance or audit record.
- Editing a badge template does not enable an accidental second issuance.
- A future explicit reissue/supersede workflow may extend this rule after Phase 6 revocation support. Phase 4 does not silently bypass it.

The unique database constraint is the concurrency-safe source of truth. The service may pre-check for a friendly result but must also handle the unique-constraint race.

## Data Model

Add enum:

```prisma
enum BadgeIssuanceStatus {
  ACTIVE
  REVOKED
  EXPIRED
}
```

Add `BadgeIssuance`:

```text
id                       cuid primary key
public_id                random URL-safe identifier, unique, non-sequential
class_id                 relation to Class, restrict deletion
badge_template_id        relation to BadgeTemplate, restrict deletion
student_id               relation to Student, restrict deletion
issuer_user_id           issuing Faculty user, restrict deletion
status                   ACTIVE initially
issued_at                immutable issuance timestamp
expires_at               derived from template expires_after_days when present
recipient_snapshot_json  immutable recipient display/private identity snapshot
achievement_snapshot_json immutable badge, criteria, artwork, skills/alignment snapshot
issuer_snapshot_json     immutable issuer identity snapshot
credential_json          immutable unsigned Open Badges-aligned credential snapshot
snapshot_version         integer serializer version, initially 1
revocation_reason        nullable, reserved for Phase 6
revoked_at               nullable, reserved for Phase 6
created_at / updated_at
```

Constraints and indexes:

- unique `public_id`;
- unique `(class_id, badge_template_id, student_id)`;
- indexes for `(class_id, issued_at)`, `(issuer_user_id, issued_at)`, `(status, issued_at)`, `badge_template_id`, and `student_id`;
- foreign keys use restrictive deletion so issued history cannot disappear through normal parent deletion.

Relations are added to `Class`, `BadgeTemplate`, `Student`, and `User`. Every schema change is delivered through a checked-in Prisma migration.

## Public ID

Generate 24 cryptographically random bytes with Node `randomBytes`, encoded as base64url. This produces a 32-character URL-safe, non-sequential identifier with sufficient enumeration resistance. A database unique constraint handles the negligible collision case; the service retries public-ID generation only for that constraint.

The future public route will be `${APP_URL}/credentials/{publicId}`. Phase 4 persists this stable identifier and URL in the credential snapshot but does not expose a public verification page yet.

## Issuer Snapshot

Initial issuer identity:

- name: `Holy Angel University — School of Computing`;
- URL: configured `APP_URL`;
- logo: `${APP_URL}/images/hausoclogo.png`.

These values are frozen into each credential. Phase 6 Administrator-managed issuer settings affect only future issuances; previously issued credentials are never silently rewritten.

## Snapshot Shapes

### Recipient snapshot

```json
{
  "studentId": "internal-id",
  "studentNumber": "2026-00001",
  "displayName": "Juan Dela Cruz",
  "firstName": "Juan",
  "lastName": "Dela Cruz",
  "email": "juan@example.edu"
}
```

The email is retained privately for institutional history and authenticated exports. It must not appear on the future public verification page by default.

### Achievement snapshot

Captures badge template ID, name, description, criteria, image storage key and stable application URL, skills, alignment, template update timestamp, class identity, and optional expiration rule.

### Issuer snapshot

Captures issuer name, URL, logo URL, and issuing Faculty ID/name. Faculty email is excluded from the public-facing credential document.

## Credential JSON

The immutable `credential_json` uses an internal serializer version and an unsigned Open Badges 3.0-aligned shape:

```json
{
  "@context": [
    "https://www.w3.org/ns/credentials/v2",
    "https://purl.imsglobal.org/spec/ob/v3p0/context-3.0.3.json"
  ],
  "id": "http://localhost:3000/credentials/public-id",
  "type": ["VerifiableCredential", "OpenBadgeCredential"],
  "name": "Badge name",
  "issuer": {
    "id": "http://localhost:3000",
    "type": ["Profile"],
    "name": "Holy Angel University — School of Computing",
    "image": { "id": "http://localhost:3000/images/hausoclogo.png", "type": "Image" }
  },
  "validFrom": "ISO timestamp",
  "credentialSubject": {
    "type": ["AchievementSubject"],
    "identifier": [
      {
        "type": "IdentityObject",
        "identityHash": "sha256 hash",
        "identityType": "email",
        "hashed": true
      }
    ],
    "achievement": {
      "id": "stable application achievement identifier",
      "type": ["Achievement"],
      "name": "Badge name",
      "description": "Badge description",
      "criteria": { "narrative": "Human-readable criteria" },
      "image": { "id": "stable media URL", "type": "Image" },
      "tag": ["skills"],
      "alignment": [{ "type": ["Alignment"], "targetName": "...", "targetUrl": "..." }]
    }
  }
}
```

The recipient email is represented only by a normalized SHA-256 identity hash in the credential JSON. The private recipient snapshot remains a separate authenticated record. No proof/signature or certification claim is added in Phase 4.

## Issuance Transaction

1. Require a Faculty actor.
2. Validate class, badge, and student IDs.
3. Load the class, badge template, owner, and active enrollment in one transaction.
4. Recheck ownership and active statuses inside the transaction.
5. Check for an existing tuple and return it when found.
6. Construct recipient, achievement, issuer, and credential snapshots from the transaction reads.
7. Generate the public ID and derive `issuedAt` and optional `expiresAt` once.
8. Insert the issuance.
9. Insert `badge.issued` audit record in the same transaction with class ID, badge template ID, student ID, and public ID. Do not log recipient email or full credential JSON.
10. Commit and redirect to the issued credential detail.

No issuance exists without its audit record, and no audit record exists for a failed issuance.

## Application Structure

Add an `issuance` domain module containing:

- snapshot and Open Badges-aligned serializer functions;
- public-ID generation;
- issuance validation and transaction service;
- list/detail/export query services;
- authorization tests, snapshot tests, and transaction tests.

Authenticated UI and HTTP surfaces:

- `/classes/[classId]/issued` — class-scoped issue form and issuance list;
- `/issued` — global role-scoped issuance list;
- `/issued/[issuanceId]` — authenticated credential detail;
- `/api/issued/[issuanceId]/credential` — authenticated JSON download;
- `/api/issued/export` — role-scoped CSV export with filters;
- `/api/classes/[classId]/issued/export` — class-scoped CSV export.

Class tabs become Students, Badges, Issued, Settings. The shared navigation enables Issued Badges for both roles. Administrators see read-only issued records.

## Issue Form and UX

The Faculty class-scoped Issued page presents:

- active badge template selector with artwork/name context;
- active student selector with student number and display name;
- a confirmation summary stating exactly which badge will be issued to which student;
- a primary `Issue Badge` action;
- a clear success notice or `Already Issued` notice linking to the existing credential.

The page never offers archived badges, removed enrollments, or classes not owned by the Faculty actor. Server validation still enforces every rule.

## Issuance Lists and Detail

Lists are paginated at 20 rows and filter by free-text recipient/student number/badge name/class, status, badge, and class where relevant. Faculty results are scoped to owned classes; Administrators see all records.

The authenticated detail shows:

- status and issuance/public identifiers;
- badge artwork, snapshotted name, description, criteria, skills, and alignment;
- recipient display name and student number;
- recipient email only because the page is authenticated and authorized;
- snapshotted issuer and issuing Faculty;
- issued and optional expiration timestamps;
- JSON credential download.

It explicitly labels the credential as unsigned and Open Badges 3.0-aligned, not certified.

## CSV Export

CSV export uses the current authorization scope and filters. Columns:

- Public ID
- Status
- Issued At
- Expires At
- Course Code
- Class Title
- Section
- Badge Name
- Student Number
- Recipient Name
- Recipient Email
- Issuing Faculty

Cells are protected against spreadsheet formula injection using the existing CSV sanitization approach. Responses are private, no-store attachments.

## Error Handling

- Invalid identifiers or missing records return a safe not-found outcome.
- Unauthorized access does not reveal whether a protected issuance exists.
- Archived/removed/inactive selections return a clear validation error without writes.
- Duplicate submission returns the existing issuance and a non-error notice.
- Database and snapshot failures roll back issuance and audit writes.

## Testing

- Unit tests for public-ID format/entropy boundary, recipient hash normalization, expiration calculation, snapshot immutability, serializer literals, and CSV formula sanitization.
- Service tests for owner success, Administrator denial, non-owner denial, inactive class, archived badge, removed enrollment, cross-class selection, duplicate reuse, unique-race handling, and issuance/audit atomicity.
- Protected list/detail/export tests for Administrator inspection, Faculty ownership scope, unauthenticated denial, and non-owner denial.
- UI tests for issue confirmation, duplicate/success notices, role-specific controls, filters, and download links.
- Migration applies cleanly to MariaDB and Docker startup remains healthy.
- End-of-phase gates: format, lint, typecheck, automated tests, production build, Docker smoke test, and browser validation for Faculty issuance plus Administrator read-only inspection.

## Security and Privacy

- No recipient email appears in public-facing JSON or future public UI by default.
- Public IDs are random and non-sequential.
- Credential records are append-oriented historical snapshots.
- Server-side ownership checks guard every Faculty query and mutation.
- JSON and CSV downloads use authenticated authorization and private no-store caching.
- Audit context excludes passwords, session data, recipient email, and full credential payloads.

## Assumptions

- The local media key remains stable because issued credential artwork cannot be deleted while referenced.
- `APP_URL` is the canonical externally reachable base URL for generated credential identifiers.
- Status starts as `ACTIVE`; Phase 6 adds authorized revocation and current-status projection.
- Optional template expiration is honored at issuance even though broader expiration-rule administration is deferred.
- No public page is implemented in Phase 4; its durable URL may return not found until Phase 6.
