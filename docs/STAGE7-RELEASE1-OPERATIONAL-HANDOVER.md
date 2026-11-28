# Stage 7 Release 1 — Operational Handover

**Release:** v1.0.0 (deployed application commit `c64038b`)
**Production:** https://socbadging.hausoc.org
**Audience:** Administrators, Faculty, Students, Operations
**Screenshots:** sanitized evidence under `docs/evidence/stage7-release1c/` and `docs/evidence/stage7-release1/`

> Use only the actual implemented interface. Do not issue credentials or send production email without separate authorization.

## 1. Roles and access

| Role          | Landing page | Main capabilities                                                                                                 |
| ------------- | ------------ | ----------------------------------------------------------------------------------------------------------------- |
| Administrator | `/dashboard` | Faculty/students/classes, course catalog, badge library and approvals, notifications, audit logs, issuer settings |
| Faculty       | `/dashboard` | Own classes/rosters, badge templates, individual/batch issuance, shared badge library and proposals               |
| Student       | `/student`   | Earned badges, notifications, profile, help                                                                       |

Login: `/login` with institutional email and password. Staff sign-out is available from the user menu in the top bar.

## 2. Administrator guide

1. Sign in at `/login`; the administrator dashboard shows institutional counts and recent activity.
2. **Faculty Management** (`/faculty`) — create/edit/deactivate faculty, reset access, manage departments.
3. **Students** (`/students`) — create student records, issue portal invitations, suspend/reactivate portal access.
4. **Classes** (`/classes`) — inspect all classes, sections, terms and owners.
5. **Course Catalog** (`/catalog`) — create/edit/archive standardized courses and map classes.
6. **Badge Library** (`/library`) — create institutional badges, approve/reject faculty proposals, publish versions, archive badges, review usage.
7. **Audit Logs** (`/audit-logs`) — search/filter sensitive actions; use "Apply" to refresh.
8. **Notifications** (`/notifications`) — inspect delivery status, failures, suppressed recipients and retry actions.
9. **Settings** (`/settings`) — issuer name/logo/URL/support contact, sharing default, signing-key lifecycle.

## 3. Faculty guide

1. Sign in; the dashboard is scoped to your classes.
2. **Classes** (`/classes`) — create/edit/archive your classes and open the workspace.
3. Class tabs: **Students** (`students`), **Badges** (`badges`), **Issued** (`issued`), **Settings** (`settings`).
4. **Students** — add/edit/remove students or use the four-step **Import** wizard (upload → map → review/preview → commit). Invalid rows are reported before commit.
5. **Badges** — use legacy class badge templates, or assign approved shared badges from the **Badge Library**.
6. **Issued** — issue one badge or use the batch wizard; review history and download reports.
7. **Badge Library** (`/library`) — browse approved badges, search by course, open details, or create a proposal from **My Proposals**.
8. **Issued Badges** (`/issued`) — your issuance records and credential detail.

## 4. Student guide

1. Activate from the invitation link, or use **Recover** on the login page.
2. **Overview** (`/student`) — earned badges and account summary.
3. **My Badges** (`/student/badges`) — open a badge for details and downloads.
4. **Notifications** (`/student/notifications`) — issuance email history.
5. **Profile** (`/student/profile`) — identity details and password change.
6. **Help** (`/student/help`) — support guidance and issuer contact.
7. Public verification links can be copied/shared from the badge detail.

## 5. Course catalog management

- Open `/catalog`. Use **Create Course** to add code, title, description and academic programs. Code is unique (normalized).
- Use the row **Edit** form to update; **Archive** opens a confirmation dialog. Archived courses cannot receive new mappings; historical classes/credentials are preserved.
- Use **Map a Class to a Course** to standardize an existing class. Mapping updates the class code/title to the catalog values; issued credentials keep their snapshots.
- Filter by search/program/status; sort and paginate.
- Faculty can map their own class from **Class Settings → Standardized Course**.

## 6. Centralized badge library management

- Open `/library`; tabs are **Shared Library**, **My Proposals**, and (Administrator) **Approval Queue**.
- **Create Badge Definition** requires an associated course, name, description, competencies, assessment criteria, issuing institution and artwork. Grading period, validity days and skills are optional.
- A new definition starts as a draft and must be submitted and approved. Approval records publication.
- **Version history** shows every immutable version, status, creator, approver and reviews.
- **Create a New Version** for material changes. Existing issued credentials keep their original version and signature.
- **Archive Badge** blocks new assignments/issuance for that definition and archives active assignments; historical credentials remain valid.
- **Usage** shows assignments, sections, issued credentials and revocations.
- **Potential Duplicates** are advisory; review manually, never auto-merge.

## 7. Faculty badge proposal and approval workflow

1. Faculty: `/library?scope=mine` → **Propose a Badge**; complete the fields and artwork.
2. Open the proposal and click **Submit for Approval** (optional note).
3. Administrator: `/library?scope=queue` → open the proposal → **Approve & Publish** or **Reject** with a reason.
4. Approved definitions appear in the Shared Library and can be assigned.
5. Faculty can create a new version only while the definition has no approved version; approved definitions require an administrator version.

## 8. Shared badge assignment

1. Faculty opens `/library` (Shared Library) or **My Proposals**.
2. Open an approved badge → **Assign to a Class Section**; choose one of your active classes.
3. The system materializes a class badge template linked to the approved version, so issuance/signing/notification work unchanged.
4. Duplicate assignment to the same class is rejected ("This badge is already assigned to the class.").
5. Faculty manage assignments from **Class workspace → Shared Badge Assignments**; **Archive** stops new issuance without invalidating credentials.
6. Faculty cannot edit/archive the approved shared definition or approve badges; those controls are administrator-only.

## 9. Individual and batch issuance

- **Individual:** `/classes/{classId}/issued` → select an active badge template and an actively enrolled student → issue. Signing, snapshot, status allocation, audit and notification are atomic.
- **Batch:** same page → download CSV/XLSX template → upload → map columns → review the stored validation preview → explicitly commit READY rows. Invalid/already-issued rows are reported; commit is exclusive and idempotent.
- **Results:** `/issuance-batches/{batchId}` and per-class history.
- **Duplicate protection:** re-issuing the same badge to the same student/class is idempotent and returns the existing credential.
- **Email:** notification delivery is queued; live provider delivery requires production SMTP configuration and separate authorization.

## 10. Credential verification

- Public page: `/credentials/{publicId}`; JSON/JSON-LD: `/api/credentials/{publicId}` and `/download`; images/PDF/QR: `/image`, `/pdf`, `/qr`.
- Issuer metadata: `/api/issuers/hau-soc`; status list: `/api/status-lists/status-list-local`.
- Verification checks the persisted signing key, Data Integrity proof, status list, expiration and key trust. Revoked/expired credentials remain historically available with clear status.
- Do not describe the product as 1EdTech/Open Badges certified unless formal conformance/certification has been completed.

## 11. Backup and recovery

- Existing scripts: `scripts/backup.sh`, `scripts/restore.sh`, `scripts/verify-backup.sh`, `scripts/backup-signing-key.sh`.
- Production convention: `/var/backups/hau-soc/<release>-<timestamp>/` containing DB dump, media, secrets/signing key, env/config and SHA-256 manifest.
- Verified Stage 7 backups: `stage7-release1b-20261128T064647Z`, `stage7-release1c-preprovision-20261128T071645Z`, `stage7-release1c-predeploy-20261128T072717Z`.
- Restore only into a verified target; test restore in isolation and compare counts/checksums before production recovery.
- Application rollback: redeploy `pre-stage7` images with `--no-deps`; the additive schema/new tables are ignored by prior code. Do not delete post-deployment records during an application rollback.
- Never rewrite `badge_issuances`, signatures, public IDs, status allocations, notifications or audit logs during recovery.

## 12. Troubleshooting

| Symptom                                | Check                                                                                                            |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Health not ready                       | `curl https://socbadging.hausoc.org/api/health`; inspect `web`/`worker`/`signer`/`db` health                     |
| Worker heartbeat stale / queue stopped | `docker logs <worker>`; confirm cycles and no cycle timeout/error; check `notification_deliveries` for `STARTED` |
| Signer errors                          | signer health, key ID/cryptosuite, `signing_key` secret mount, signer token                                      |
| Emails not delivered                   | provider/SMTP configuration, Brevo secret presence, delivery/attempt status, suppressed recipients               |
| Migration issue                        | `_prisma_migrations` ledger; never edit applied migrations; use the approved additive scripts                    |
| 403/404 or redirect                    | confirm role/ownership; staff pages redirect non-admins to `/dashboard`                                          |
| Archived test data visible             | filter **Active** status; archived/suspended records are retained for auditability                               |
| High queue failures                    | do not bulk retry; inspect failure reasons and suppression before any retry                                      |

## 13. Evidence and advisories

- Sanitized screenshots: catalog, badge library, class shared assignments, audit log, student portal.
- Advisories: first live issuance/email not exercised; two historical FAILED notifications (26 Nov 2026) not resent; 3 legacy backfilled definitions lack approval provenance; suspended STAGE7 test users and archived test data retained for audit; runtime package version remains `0.5.0-rc.1` while `v1.0.0` is the formal tag.

For the controlled first issuance, use `docs/STAGE7-RELEASE1-FIRST-ISSUANCE-CHECKLIST.md` and obtain separate authorization first.
