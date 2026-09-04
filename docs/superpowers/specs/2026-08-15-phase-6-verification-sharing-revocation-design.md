# Phase 6 Verification, Sharing, and Revocation Design

**Date:** 2026-08-15  
**Status:** Approved design, pending implementation plan  
**Requirements:** FR-012, FR-013, FR-014, FR-015, FR-016, FR-020, FR-023; acceptance criteria 9–15 where applicable

## Goal

Add privacy-safe public credential verification, public Open Badges 3.0-aligned JSON/JSON-LD output, sharing controls, and authorized audited revocation without rewriting immutable issuance snapshots.

## Scope

Phase 6 includes:

- A public verification page addressed only by the existing non-sequential `publicId`.
- A public machine-readable credential endpoint.
- Status projection for active, expired, and revoked credentials.
- Copy URL, Web Share, LinkedIn, Facebook, X, and email-client sharing links.
- Faculty revocation for credentials issued in owned classes.
- Administrator revocation for any credential.
- Mandatory revocation reason, timestamp, actor attribution, and audit record.
- Issuer identity, logo, canonical URL, support contact, and public-page behavior settings required by the public surface.
- Public-route rate limiting and privacy/security tests.

Phase 6 excludes:

- Student accounts, a student portal, or a badge wallet.
- Sending notification email through SMTP. The email share control opens the visitor's email client only.
- Cryptographic proof/signing, certification claims, wallet APIs, or conformance certification.
- Evidence uploads and S3-compatible storage.
- Destructive deletion or reissuance of credentials.

## Architectural Approach

Use a dedicated public-verification domain service rather than exposing the protected internal issuance detail. It reads only by validated `publicId`, runtime-validates immutable issuance snapshots, derives the current status, and returns an explicit privacy-safe DTO. Public pages and JSON routes consume that DTO; neither receives internal IDs, email, full student number, roster data, or raw database JSON.

Revocation uses a separate transactional command service. It revalidates the actor, role, Faculty ownership, and current credential state inside the transaction, then updates revocation fields and writes the audit event atomically. The immutable recipient, achievement, issuer, and original credential snapshots remain unchanged.

## Public Identity and Privacy

The public recipient display identity is **first name plus last initial**, for example `Maria S.`. This is derived from the immutable recipient snapshot and is not stored back into it.

The public surface must never expose:

- Recipient email or its plain-text value.
- Full student number, student ID, class roster identifiers, internal issuance ID, or issuer user ID.
- Private audit context, database metadata, or file paths.

The credential's existing SHA-256 email identity hash may remain in the Open Badges-aligned JSON because it is already the issuance-time subject identifier. The UI does not display the hash.

## Status Projection

Effective public status is derived in this order:

1. `REVOKED` when the persisted issuance status is revoked.
2. `EXPIRED` when `expiresAt` is at or before the current time.
3. `ACTIVE` otherwise.

Revoked credentials stay available at the same public URL. The public page shows the revocation timestamp and a safe public reason. Expired credentials stay available with their expiration date. Status changes do not rewrite the issuance-time credential snapshot.

The public JSON representation adds current status metadata outside the immutable snapshot fields so consumers can distinguish the original assertion from its current lifecycle state. It remains unsigned and must say so without implying certification.

## Public Routes and Pages

- `GET /credentials/[publicId]` renders the verification page.
- `GET /api/credentials/[publicId]` returns inline JSON-LD using `application/ld+json`.
- `GET /api/credentials/[publicId]/download` returns the same representation as a safe attachment.

All public identifiers use a strict base64url-style allowlist and length bound. Missing, malformed, and inaccessible credentials return a uniform not-found response. Public responses use explicit security headers and a conservative cache policy so revocation appears promptly. Rate limiting is applied before database-heavy work and returns a generic 429 response without revealing credential existence.

The existing authenticated credential detail remains available for Administrator and owning Faculty, including private recipient data. Its download action may link to the public export but must retain server-side authorization for internal views.

## Public Verification UI

The mobile-first modern-light page shows:

- Prominent badge artwork and achievement name.
- Clear `Active`, `Expired`, or `Revoked` status treatment.
- Recipient display identity using first name plus last initial.
- Issuer name, logo, and canonical issuer link.
- Issue and expiration/revocation dates.
- Description, criteria, skills, and safe alignment links.
- Class/course context from the immutable snapshot without exposing roster membership.
- Copy link, native Web Share when supported, LinkedIn, Facebook, X, and email-client sharing.
- JSON-LD view/download controls.
- Support contact and an explicit unsigned/Open Badges-aligned, not-certified notice.

Sharing links use the canonical public verification URL, percent-encoded title/text, `noopener/noreferrer`, and no recipient email. Copy/Web Share provide accessible success/error feedback and work without authentication.

## Issuer Settings

System settings use a typed singleton configuration rather than unrestricted arbitrary key/value editing. Administrator-only settings cover:

- Issuer name.
- Issuer canonical URL.
- Issuer logo path.
- Support contact email or URL.
- Default public-page sharing visibility.

Environment issuer values remain the deployment bootstrap/default. Database settings override public presentation only after Administrator validation. Updating settings creates an audit record and does not rewrite existing credential snapshots; historical credentials continue to show their issuance-time issuer snapshot, while support/public behavior may use current system settings.

Every schema addition receives a forward Prisma migration. No secrets are stored in settings.

## Revocation

Authorization rules:

- Active Faculty may revoke only credentials whose class is currently owned by that Faculty member.
- Active Administrators may revoke any credential.
- Unauthenticated, suspended, deleted, role-changed, and non-owner actors receive safe denial.

The command accepts only an internal issuance ID and a trimmed bounded reason. Within one MariaDB transaction it locks/reloads the actor, issuance, and ownership rows; rejects already-revoked credentials without adding a second audit event; updates `status`, `revocationReason`, and `revokedAt`; and writes `badge.revoked` with non-private context. Revocation never deletes data or modifies credential snapshots.

The authenticated detail UI presents a destructive-action confirmation with the required reason. Faculty sees it only for owned credentials; Administrator sees it for all credentials. Server authorization is authoritative regardless of UI visibility.

## Data Flow

### Verification

1. Validate and rate-limit `publicId`.
2. Query the issuance by public ID with only required fields.
3. Runtime-validate immutable snapshots.
4. Derive effective lifecycle status.
5. Produce a privacy-safe public DTO.
6. Render HTML or generate JSON-LD/download from the same DTO.

### Revocation

1. Authenticated action validates issuance ID and reason.
2. Transaction revalidates actor status/role and locks authoritative rows.
3. Authorization checks Administrator scope or Faculty ownership.
4. Update lifecycle fields and append audit event atomically.
5. Revalidate authenticated and public pages, then redirect with a safe notice.

## Error Handling

- Public malformed/missing IDs use the same 404 representation.
- Public rate-limit failures use generic 429 responses.
- Snapshot corruption fails closed and is logged server-side without leaking data.
- Revocation validation errors return field-safe messages.
- Authorization failures never disclose whether another Faculty member's issuance exists.
- Already-revoked submission is idempotent and redirects to the existing revoked state without another write.

## Testing Strategy

- Pure tests for recipient masking, effective status, public DTO privacy, and JSON-LD lifecycle metadata.
- Service authorization tests for public reads and Administrator/Faculty revocation boundaries.
- MariaDB integration tests for atomic update/audit behavior, repeat revocation, rollback, and concurrent revocation.
- Route/action tests for validation, rate limiting, security/cache headers, not-found uniformity, and attachment safety.
- Component tests for each status, sharing URLs, copy/Web Share fallbacks, issuer settings, and revocation confirmation.
- Browser acceptance for anonymous verification and sharing at desktop and 390×844; authenticated Faculty/Admin revocation; revoked/expired persistence; no console errors or horizontal overflow.
- Final format, lint, typecheck, full tests, audit, production build, migration, Docker, health, persistence, and independent requirements review.

## Requirement Traceability

- **FR-012:** Existing immutable issuance ID and non-sequential public ID remain authoritative.
- **FR-013:** Public page exposes privacy-safe metadata and current lifecycle status.
- **FR-014:** Copy, native share, LinkedIn, Facebook, X, and email-client sharing.
- **FR-015:** Public JSON/JSON-LD aligned to Open Badges 3.0 concepts, explicitly unsigned.
- **FR-016:** Authorized reasoned revocation with timestamp and historical preservation.
- **FR-020:** Revocation and system-setting changes are audited.
- **FR-023:** Typed Administrator-managed issuer/support/public behavior settings.
- **Acceptance 9–13:** Unique public URL, correct status, private email, sharing/export, preserved revocation history.
- **Acceptance 14–15:** Administrator audit visibility and automated authorization/integration/browser coverage.

## Assumptions

- Public recipient display defaults to first name plus last initial, as approved.
- A revoked credential's reason is public because it explains verification status; validation prevents secrets and excessive content.
- Email sharing means a `mailto:` composition link, not SMTP notification.
- Signing and formal Open Badges conformance remain Phase 8 work.
