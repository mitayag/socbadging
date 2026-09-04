# Phase 5 Batch Issuance Design

**Date:** 2026-08-14  
**Requirements:** FR-011, FR-012, FR-015, FR-020, FR-021, FR-022; acceptance criteria 7, 8, 9, and 15

## Objective

Add a secure Faculty workflow for issuing one active badge template to many actively enrolled students through a validated CSV/XLSX upload. Every commit must be bound to a stored preview reviewed by the Faculty. Invalid rows are never issued, already-issued rows are skipped idempotently, and every new credential preserves the Phase 4 immutable snapshot and audit guarantees.

Phase 5 does not add recipient email notification, public verification, sharing, revocation, signing, or an Open Badges certification claim.

## Approved User Workflow

1. Faculty opens the **Issued** tab of an owned active class and chooses **Batch Issue**.
2. Faculty selects one active badge template belonging to that class.
3. Faculty downloads an optional CSV/XLSX instructional template or uploads a `.csv`/`.xlsx` file.
4. The file must map a **Student Number** column. An **Email** column is optional and is used only as an identity cross-check when supplied.
5. The server inspects the upload and returns headers plus bounded sample rows for mapping.
6. Faculty maps Student Number and optionally Email, then requests validation.
7. The server stores an expiring, immutable preview and displays every input row with a classification and message.
8. Faculty downloads the validation report when corrections are needed or explicitly commits the reviewed ready set.
9. Commit revalidates authorization, account/class/badge state, preview freshness, and every ready recipient inside the transaction.
10. The result page shows issued, already-issued, invalid, and total counts plus links to the created credential records and a summary CSV.

The preview expires 30 minutes after creation. A committed or expired preview cannot be reused to create credentials.

## Row Classification

Every source row retains its one-based source row number and normalized student number. It receives exactly one primary disposition:

- `READY`: student number exists, enrollment is active in the selected class, optional email matches, no earlier row duplicates the student number, and the badge has not already been issued for this class/student tuple.
- `ALREADY_ISSUED`: the exact class/badge/student issuance tuple already exists. Commit skips it and reports the existing issuance.
- `DUPLICATE_IN_FILE`: an earlier source row uses the same normalized student number.
- `STUDENT_NOT_FOUND`: no student has the normalized student number.
- `NOT_ACTIVELY_ENROLLED`: the student exists but has no active enrollment in the selected class.
- `EMAIL_MISMATCH`: an optional non-empty email value does not normalize to the stored student email.
- `INVALID`: the mapped student number is empty, malformed, or the row cannot be parsed safely.

Only `READY` rows form the commit candidate set. `ALREADY_ISSUED` rows remain visible and idempotent but are not new writes. All other dispositions are excluded and downloadable.

## Partial-Valid Commit Semantics

A preview may be committed when it contains at least one `READY` row, even when other rows are invalid or already issued. The confirmation clearly states that only the reviewed ready rows will be issued. Invalid rows remain excluded and appear in both the preview and summary report.

This is intentional: unrelated row errors do not prevent valid recipients from receiving credentials, while preview-before-commit remains mandatory. A preview with zero ready rows cannot be committed.

## Data Model

Add an `IssuanceBatch` model and an `IssuanceBatchStatus` enum:

- Status values: `READY`, `COMMITTED`, `EXPIRED`.
- Core fields: internal ID, class ID, badge template ID, Faculty user ID, source filename, normalized mapping JSON, preview rows JSON, preview fingerprint, total/ready/already-issued/invalid counts, status, expiry, committed timestamp, created timestamp, and updated timestamp.
- Relations use restrictive deletion for Faculty, class, and badge template because batch history must not disappear silently.
- Indexes support Faculty/class/status history and expiry cleanup.
- `previewFingerprint` is a SHA-256 digest of the canonical validated preview inputs and source identity. Commit checks it against the stored preview version; clients cannot submit replacement rows.

No new foreign key from `BadgeIssuance` to the batch is required for the MVP. The batch audit context and stored result rows provide traceability without changing existing historical credential records. The final stored rows are updated once at commit to include created or existing issuance IDs/public IDs and then treated as history.

Every schema change ships with a forward-only Prisma migration.

## Server Boundaries

### Inspection

`inspectBatchFile(actor, classId, badgeTemplateId, file)`:

- Requires an active Faculty actor and owned active class.
- Confirms the badge is active, owned, and belongs to the class.
- Accepts only `.csv` and `.xlsx` within the existing import size limits.
- Reuses the hardened roster parser where its generic parsing behavior fits.
- Returns headers and bounded sample rows; it performs no database write and creates no batch.

### Preview

`createBatchPreview(actor, input)`:

- Revalidates Faculty, class, and badge authorization server-side.
- Validates the submitted mapping and bounded parsed rows.
- Normalizes student numbers and optional emails.
- Uses set-based student, enrollment, and existing-issuance reads to classify rows without per-row query waterfalls.
- Creates the `IssuanceBatch` in `READY` state with a 30-minute expiry.
- Writes `badge.batch_previewed` in the same transaction as preview creation. Audit context contains identifiers and counts only, never recipient emails or row payloads.

### Commit

`commitBatchPreview(actor, batchId)`:

- Requires Faculty before database reads.
- Loads and locks/revalidates the stored `READY` preview inside one transaction.
- Revalidates the transaction-loaded Faculty account is active and still has role `FACULTY`.
- Revalidates class ownership/status and badge ownership/status/class association.
- Rejects expired, committed, tampered, or zero-ready previews.
- Revalidates each ready student and enrollment against current database state.
- Rechecks existing issuance tuples immediately before creation. A newly existing tuple becomes an idempotent already-issued result.
- Builds Phase 4 snapshots from transaction-loaded records and creates every new `BadgeIssuance` plus its individual `badge.issued` audit record.
- Updates the batch to `COMMITTED`, stores the result rows/counts, and writes one `badge.batch_committed` audit record.
- Commits all ready-row credentials and all audit records atomically. Any unexpected snapshot, credential, audit, or database failure rolls back the entire commit.

Public-ID collisions retry narrowly using the established Phase 4 constraint handling. Tuple conflicts caused by concurrent issuance resolve idempotently without duplicate credentials. The implementation must account for MariaDB repeatable-read visibility and cannot rely on rereading a winning tuple inside a failed transaction snapshot.

## Authorization and Privacy

- Only Faculty may inspect, preview, or commit batches.
- Faculty may act only on their owned active classes and active owned badge templates.
- Administrator access is read-only for batch history and results; Administrators cannot preview or commit.
- Preview/result retrieval uses ownership predicates for Faculty and safe not-found responses for inaccessible records.
- Raw email is stored only when it was supplied for validation and remains protected inside preview JSON. It is never written to audit context or public credential output.
- Normal issuance list rows remain email-free. Authorized exports may contain recipient email under the existing Phase 4 policy.
- Files are parsed in memory within strict size/row limits; the source upload is not persisted in Phase 5.

## Routes and Actions

- `POST /api/classes/[classId]/issued/batch/inspect`: authenticated Faculty-only multipart inspection.
- `POST /api/classes/[classId]/issued/batch/preview`: authenticated Faculty-only JSON mapping/validation.
- `GET /api/issuance-batches/[batchId]/report`: authorized validation/result CSV with private no-store headers.
- A thin `commitBatchIssuanceAction(formData)` validates the batch ID, resolves the current Faculty actor, calls only the domain commit service, revalidates affected issuance/batch pages, and redirects to the batch result.

Route handlers and Server Actions are independently authenticated and authorized because they are directly reachable entry points. Client-provided class, badge, counts, dispositions, or rows are never trusted at commit.

## UI Design

The existing class **Issued** page gains a **Batch Issue** panel below individual issuance for Faculty only. It follows the existing modern-light design tokens and avoids nested card clutter.

The wizard has four explicit states:

1. **Choose Badge and File** — badge select, template downloads, file input.
2. **Map Columns** — Student Number required, Email optional with `Do Not Map` default.
3. **Validation Preview** — count summary, row table, disposition labels, validation report, and an explicit commit confirmation showing the exact ready count.
4. **Batch Result** — issued/already-issued/invalid summary, credential links for successful/existing rows, and result report download.

The table remains readable on desktop and becomes stacked row summaries on narrow screens. All controls have visible labels, focus states, pending states, accessible status text, and title-case labels. Administrator pages show batch history/results but no upload, preview, or commit controls.

## Reporting

The report is a BOM-prefixed UTF-8 CSV using CRLF, proper quoting, and formula-safe cells. Literal headers are:

1. `Row Number`
2. `Student Number`
3. `Email Supplied`
4. `Disposition`
5. `Message`
6. `Issuance ID`
7. `Public ID`

Before commit, issuance/public fields are empty except for `ALREADY_ISSUED` rows. After commit, successful rows include their immutable issuance/public identifiers.

## Error Handling and Idempotency

- Malformed files, unsupported types, excessive rows, invalid mappings, and empty source data fail before preview creation.
- A stale, expired, already committed, or inaccessible preview returns a safe domain error and performs no writes.
- Repeating a successful commit returns the stored batch result rather than issuing again.
- A commit that encounters only newly existing tuples finishes as an idempotent committed batch with zero new credentials.
- Unexpected failures propagate, roll back the full commit, and leave the batch `READY` when the transaction aborts.
- User-facing errors are safe and actionable; protected identifiers or row data are not returned on authorization failures.

## Testing Strategy

- Unit tests for parser/mapping normalization, row classification, duplicates, optional email matching, counts, fingerprint stability, and CSV safety.
- Authorization tests for unauthenticated, Administrator, suspended/role-changed Faculty, non-owner Faculty, cross-class badge, and inaccessible batch behavior.
- Transaction tests for mandatory preview, expiry, tampering, zero-ready rejection, partial-valid commit, already-issued idempotency, repeat commit, audit privacy, public-ID retry, tuple races, and rollback on issuance/audit failure.
- MariaDB integration tests for atomic multi-row rollback, concurrent tuple behavior, batch state transition, and exact individual plus batch audit counts.
- Route/action tests for authentication, validation, safe denials, cache/content-disposition headers, and redirect/revalidation behavior.
- Component tests for every wizard state, optional email mapping, preview counts/dispositions, disabled commit, confirmation, pending state, result links, Administrator absence, and responsive structure.
- Browser acceptance for a mixed batch containing ready, already-issued, duplicate, invalid/not-enrolled, and optional-email-mismatch rows; repeat commit; Administrator read-only view; console/overlay/desktop/mobile checks.

## Requirement Mapping

- **FR-011:** validated batch upload, mapping, preview, explicit atomic commit, and summary.
- **FR-012:** every new issuance uses the Phase 4 immutable internal ID, random public ID, and historical snapshots.
- **FR-015:** each created issuance retains the existing Open Badges 3.0-aligned unsigned JSON snapshot.
- **FR-020:** preview, every issuance, and batch commit are auditable with identifier-only contexts.
- **FR-021:** authorized batch history/result lookup and row-level preview filtering where needed.
- **FR-022:** validation and result CSV reports.
- **Acceptance criterion 7:** Faculty previews and commits a batch issuance.
- **Acceptance criterion 8:** invalid rows are identified before commit.
- **Acceptance criterion 9:** every newly issued credential has a unique public verification identifier.
- **Acceptance criterion 15:** batch authorization, integration, transaction, route, component, and browser tests.

## Explicit Non-Goals

- Student notification or SMTP delivery.
- Public verification pages and social sharing.
- Revocation controls or status publication.
- Cryptographic signing, wallet interoperability, or certification claims.
- Persisting source uploads or adding object storage.
- Background jobs/queues; the MVP uses bounded synchronous batches with strict row limits.
