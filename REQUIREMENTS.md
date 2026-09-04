# HAU SOC Badging System — Requirements

**Version:** 1.0  
**Date:** 2026-08-11  
**Deployment:** Dockerized web application  
**Standard target:** 1EdTech Open Badges 3.0–aligned MVP

## 1. Purpose

Build a modern, light web-based badging system for HAU School of Computing where administrators manage faculty accounts, faculty create classes and badges, and badges are issued to students individually or in batches. Each issued badge must have a unique public verification page and shareable URL.

## 2. Roles

### System Administrator

- Full system privileges.
- Create, edit, activate, suspend, and reset faculty accounts.
- View all classes, badges, issued credentials, audit logs, and system settings.
- Revoke issued credentials when authorized.

### Faculty

- Manage own profile.
- Create/manage/archive own classes.
- Manage class rosters.
- Create/manage badge templates inside owned classes.
- Issue and revoke badges for owned classes.
- View/export issuance records.

### Student / Badge Recipient

- No account required for MVP.
- Receives public badge verification URL.
- Can view, download, and share badge.

### Public Verifier

- Can open the public verification URL.
- Can see badge status, issuer, criteria, recipient display identity, issue date, and public evidence.
- Cannot access private roster or administrative data.

## 3. Core Workflow

1. Administrator creates faculty accounts.
2. Faculty creates a class.
3. Faculty adds or imports students.
4. Faculty creates badge templates inside the class.
5. Faculty issues a badge to one student or multiple students via validated batch upload.
6. Each issued badge receives a unique, non-sequential public ID and verification URL.
7. Recipient can verify, download, copy link, and share the badge.
8. Revoked/expired credentials remain historically available but clearly show their current status.

## 4. MVP Functional Requirements

- **FR-001 Authentication:** Secure login/logout/password reset for Administrator and Faculty.
- **FR-002 RBAC:** Enforce Administrator and Faculty permissions server-side.
- **FR-003 Faculty Accounts:** Admin can create/edit/activate/suspend/reset faculty access.
- **FR-004 Class Management:** Faculty can create/edit/archive/reopen owned classes.
- **FR-005 Roster:** Add/edit/remove class students.
- **FR-006 Roster Import:** CSV/XLSX import with mapping, preview, validation, duplicates, and error report.
- **FR-007 Badge Templates:** Create/edit/duplicate/archive badge templates within owned classes.
- **FR-008 Badge Image:** Upload validated badge artwork with preview.
- **FR-009 Badge Criteria:** Human-readable criteria plus optional skill/alignment metadata.
- **FR-010 Individual Issuance:** Issue a badge to one recipient.
- **FR-011 Batch Issuance:** Issue the same badge to many validated recipients.
- **FR-012 Unique Credential:** Immutable internal issuance ID plus public verification identifier.
- **FR-013 Verification:** Public verification page with current credential status and metadata.
- **FR-014 Sharing:** Copy URL + LinkedIn/Facebook/X/email + Web Share when supported.
- **FR-015 Credential Export:** JSON/JSON-LD representation aligned to Open Badges 3.0 concepts.
- **FR-016 Revocation:** Authorized revocation with reason/timestamp; no destructive deletion.
- **FR-020 Audit Log:** Log sensitive auth/admin/class/badge/issuance/revocation/import actions.
- **FR-021 Search/Filter:** Search/filter classes, badges, students, and issued credentials.
- **FR-022 Exports:** Roster and issuance CSV export.
- **FR-023 System Settings:** Issuer name/logo/URL/support contact/default public-page behavior.

## 5. P1 Requirements

- Optional expiration rules.
- Public/private evidence attachments.
- Cryptographic signing of OpenBadgeCredential / Verifiable Credential output.
- Email notification to recipients.
- Basic issuance analytics.
- S3-compatible object storage.
- Backup/restore automation and stronger operational monitoring.

## 6. Open Badges 3.0 Alignment

Model the system around:

- **Issuer:** HAU / School of Computing issuer profile and signing identity.
- **Achievement:** Faculty-created badge template with name, description, criteria, image, and metadata.
- **Earner/Subject:** Student recipient identity, minimizing public exposure.
- **OpenBadgeCredential:** Unique issued credential connecting issuer + achievement + recipient + dates + evidence/status.
- **Proof/Signature:** Add in P1 without redesigning the core data model.
- **Status/Revocation:** Verification must reflect active/revoked/expired state.
- **JSON/JSON-LD:** Machine-readable representation.

Do not call the product “Open Badges certified” until the applicable 1EdTech conformance/certification process has actually been completed.

## 7. Data Model

### users

`id, name, email, password_hash, role, status, last_login_at, timestamps`

### faculty_profiles

`user_id, employee_id, department, title, optional profile fields`

### classes

`id, owner_user_id, course_code, title, section, term, academic_year, description, status, timestamps`

### students

`id, student_number, first_name, last_name, email, metadata, timestamps`

### class_students

`class_id, student_id, enrollment_status, timestamps`

### badge_templates

`id, class_id, owner_user_id, name, description, criteria, image_path, status, expires_after_days, metadata_json, timestamps`

### badge_issuances

`id, badge_template_id, class_id, student_id/recipient_snapshot, public_id, issued_at, expires_at, status, revocation_reason, revoked_at, credential_json, timestamps`

### badge_evidence

`id, issuance_id, title, description, url/file_path, visibility, timestamps`

### issuance_batches

`id, faculty_user_id, badge_template_id, source_filename, total_rows, success_count, failed_count, status, timestamps`

### audit_logs

`id, actor_user_id, action, entity_type, entity_id, context_json, ip_address, user_agent, created_at`

### system_settings

`key, value_json, updated_by, updated_at`

### Integrity Rules

- Enforce faculty ownership server-side.
- Snapshot credential-critical data at issuance so later badge-template edits do not rewrite history.
- Do not hard-delete issued credentials through normal UI.
- Public IDs must be non-sequential and difficult to guess.
- Batch operations need duplicate protection and transactional integrity.
- Recipient email is private by default.

## 8. Recommended Technical Architecture

- **Application:** Next.js + TypeScript.
- **UI:** Tailwind CSS + accessible UI primitives.
- **Database:** MariaDB (MySQL-compatible).
- **ORM:** Maintained TypeScript ORM with migrations, preferably Prisma unless repository constraints dictate otherwise.
- **Storage:** Local Docker volume for MVP; S3-compatible storage later.
- **Email:** SMTP configured through environment variables.
- **Proxy/TLS:** Caddy or Nginx in production.
- **Deployment:** Dockerfile + Docker Compose.
- **Testing:** Unit + integration/API + browser E2E.

### Suggested Docker Services

- `web` — application.
- `db` — MariaDB with persistent named volume.
- `proxy` — optional production HTTPS reverse proxy.
- `mailpit` — optional development SMTP inbox.
- `minio` — optional P1 object storage.

## 9. Design Scheme

**Direction:** modern, light, clean, academic-professional SaaS interface.

### Visual Tokens

- Background: `#FFFFFF` / `#F8FAFC`.
- Primary text: deep navy-slate around `#163A63`.
- Secondary text: `#64748B`.
- Primary accent: academic blue around `#2E6FA8`.
- Accent surface: `#EAF2FF`.
- Accessible green for active/issued.
- Amber for pending/expiring.
- Red for revoke/delete/suspend.
- Light cool-gray borders.
- Radius: 10–14px for cards/modals; smaller for controls.
- Very subtle shadows; prefer borders + whitespace.
- Typography: modern sans-serif such as Inter/system sans.
- Simple outline icons with consistent stroke weight.
- Fast subtle motion with reduced-motion support.
- Badge artwork should be visually prominent.

### Application Shell

- Desktop left sidebar: Dashboard, Classes, Issued Badges, Faculty Management (admin), Audit Logs (admin), Settings.
- Top bar: breadcrumb/title + contextual primary action + profile menu.
- Use generous whitespace and tables where data density matters.
- Avoid excessive nested cards and dashboard clutter.
- Light theme is the MVP default.

### Core Screens

- Login.
- Admin Dashboard.
- Faculty Dashboard.
- Classes list.
- Class detail with tabs: Overview, Students, Badges, Issued, Settings.
- Badge Builder.
- Individual Issue Badge.
- Batch Issue wizard with validation preview.
- Issued Credential detail.
- Public Badge Verification.
- Faculty Management.
- Audit Log.

## 10. Security and Privacy

- Modern adaptive password hashing through the chosen auth stack.
- HTTP-only secure sessions and HTTPS in production.
- Authorization enforced server-side.
- File type/size/image validation.
- Import validation and spreadsheet/CSV sanitization.
- Rate limiting for auth/reset/public verification/heavy endpoints where appropriate.
- Secrets only via environment configuration; never commit secrets.
- Append-oriented audit log for sensitive changes.
- Public pages minimize student PII; email is not shown by default.
- Backup and restore procedures before production.
- Explicit tests for CSRF/XSS/SQL injection/path traversal/authorization boundaries.

## 11. Non-Functional Requirements

- Responsive desktop/tablet/mobile behavior; public badge page is highly mobile-friendly.
- Accessible keyboard navigation, focus states, labels, contrast, errors, and alt text.
- Paginate large tables.
- Use transactions for issuance operations.
- Structured logs and health endpoint.
- Typed code, migrations, reusable components, centralized design tokens, README, `.env.example`, and automated tests.
- Docker deployment must not require source-code edits on the host.

## 12. MVP Acceptance Criteria

1. Fresh Docker deployment starts using documented commands with persistent MariaDB storage.
2. Admin can sign in and create a faculty account.
3. Faculty cannot access admin-only features.
4. Faculty can create a class and roster.
5. Faculty can create a badge template with image and criteria.
6. Faculty can issue one badge.
7. Faculty can preview and commit a batch issuance.
8. Invalid batch rows are identified before commit.
9. Every issuance has a unique public verification URL.
10. Verification page correctly reports active/revoked/expired states.
11. Recipient email is never public by default.
12. Badge URL can be copied/shared and credential output downloaded.
13. Revocation preserves history.
14. Admin can inspect issuance/revocation audit records.
15. Critical workflows have automated authorization/integration/E2E tests.

## 13. Codex Build Sequence

1. **Phase 0 — Repo & Design Spec:** `REQUIREMENTS.md`, `AGENTS.md`, design tokens, Docker Compose skeleton, environment template.
2. **Phase 1 — Foundation:** app, DB, migrations, auth, roles, seed admin, app shell.
3. **Phase 2 — Faculty & Classes:** faculty account CRUD, class CRUD, ownership tests.
4. **Phase 3 — Rosters & Badge Templates:** students/import preview, badge builder and image upload.
5. **Phase 4 — Individual Issuance:** transactions, credential snapshot, public ID, audit events.
6. **Phase 5 — Batch Issuance:** upload/map/validate preview, explicit commit, summary/report.
7. **Phase 6 — Verification & Sharing:** public page, JSON/JSON-LD, social sharing, revoke state.
8. **Phase 7 — Hardening:** security, backups, accessibility, E2E, Docker smoke test, traceability matrix.
9. **Phase 8 — Open Badges Hardening:** cryptographic signing, conformance testing, wallet/API interoperability.
