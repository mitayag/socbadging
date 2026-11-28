# Stage 7 Release 2 — Future Integration Notes

**Status:** Documentation only. None of the following is implemented in Release 1.
**Purpose:** preserve a clean extension path for micro-credential and CHED Memorandum Order No. 1, Series of 2025 requirements.

## 1. Stable extension points already in place

- `BadgeDefinition` is the stable institutional identity; `BadgeDefinitionVersion` holds immutable material snapshots.
- `ClassBadgeAssignment` separates definition/version reuse from class delivery.
- `BadgeTemplate` remains the class-scoped, issuance-facing artifact; `sharedDefinitionVersionId` links it to the library version.
- Issued credentials keep immutable snapshots and signatures; library changes never rewrite them.
- Audit, approval and review history are append-only.
- Course association is optional for legacy classes and required for new standardized mappings.

## 2. Likely Release 2 data additions (not created)

These are candidates for separate, explicitly approved migrations:

- PQF level/reference and program outcome mappings on a version.
- Academic credit value, credit basis and assessment evidence references.
- CHED recognition status, reference number and validity on a version or definition.
- Micro-credential type/classification and formal application linkage.
- Credit-transfer and stackable-pathway relationships between definitions/versions.
- Quality-assurance and annual monitoring review cycles.
- Regulatory document attachments with versioned evidence.

Add them as nullable, additive fields or separate tables so Release 1 data remains valid.

## 3. Integration rules for Release 2

1. Never mutate an approved version; create a new version.
2. Keep `BadgeDefinition`/version identifiers stable; external references must target the version used for issuance.
3. Extend credential snapshots additively; do not change the Open Badges 3.0 serialization or historical signatures.
4. Attribute new regulatory fields to the correct version; do not infer them for legacy definitions.
5. Continue to separate definition, class delivery and issued credential.
6. Keep approval/audit records append-only.
7. Do not assume every badge is a formal micro-credential; model classification explicitly.
8. Do not implement PQF, credit computation, CHED workflows, credit transfer, stackable pathways, QA modules or annual monitoring until Release 2 is authorized.

## 4. Operational notes

- The promotion script can be extended to map existing badge metadata into new optional fields while remaining idempotent.
- Any Release 2 migration must include a dry-run/reconciliation report and rollback plan.
- Production deployment remains gated on explicit approval.
