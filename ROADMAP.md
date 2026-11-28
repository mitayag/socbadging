# HAU SOC Badging System — Roadmap

## Current status

**Stage 7 Release 1 — v1.0.0 — Production accepted with advisories (28 November 2026).**

Deployed application commit `c64038b`; formal tag `v1.0.0`; production at
https://socbadging.hausoc.org; 22 database migrations applied.

## Closed

### Stage 7 Release 1 — Shared badge library

- Standardized course catalog.
- Centralized institutional badge library with course association.
- Faculty proposals and administrator approval/publication.
- Immutable badge versions and review history.
- Shared badge assignments across class sections and faculty.
- Legacy badge promotion with dry-run/reconciliation, duplicate detection and preservation.
- Production deployment and acceptance (Stage 7 Release 1C/1D).

## Operational focus (next)

1. Execute the controlled first live credential issuance and external email delivery under separate authorization (`docs/STAGE7-RELEASE1-FIRST-ISSUANCE-CHECKLIST.md`).
2. Confirm the first recipient inbox delivery, student portal view, downloads, sharing and public verification.
3. Establish recurring backup verification and restore drills using the existing backup scripts and `/var/backups/hau-soc/` convention.
4. Review the two historical failed notifications and the legacy approval-provenance advisory.
5. Keep test data archived and audit records intact; do not hard-delete.

## Deferred — Stage 7 Release 2 (not implemented)

Release 2 remains deferred pending institutional approval and is not part of v1.0.0:

- CHED Memorandum Order No. 1, Series of 2025 workflows.
- PQF level/reference management.
- Academic credit computation and credit transfer.
- Micro-credential application generation and formal CHED recognition.
- Stackable credential pathways.
- Quality-assurance and annual regulatory monitoring.

Integration points and constraints are documented in `docs/STAGE7-RELEASE2-FUTURE-INTEGRATION-NOTES.md`.

## Non-goals / constraints

- Do not label the product as Open Badges or 1EdTech certified without completed conformance/certification.
- Do not silently rewrite historical credentials after template or library changes.
- Do not merge Release 2 or CHED functionality without explicit authorization.
