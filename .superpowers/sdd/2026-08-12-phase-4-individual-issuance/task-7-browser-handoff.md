# Phase 4 Task 7 — Private Local Browser Acceptance Handoff

## Scope and Safety

This is local SDD acceptance evidence only. It contains disposable local credentials, not production credentials; do not copy them into README, source, issues, or external documentation. Browser automation was intentionally not performed.

## Ready Service

- Base URL: `http://localhost:3000`
- Login URL: `http://localhost:3000/login`
- Health endpoint verified: `http://127.0.0.1:3000/api/health` returned HTTP 200.
- Compose state at handoff: MariaDB healthy; web healthy; checked-in migration container completed successfully with six migrations and no pending work.

Use `localhost`, not `127.0.0.1`, for sign-in and app navigation because the configured `APP_URL` is `http://localhost:3000` and origin protection correctly enforces it.

## Disposable Local Accounts

| Role          | Email                            | Password                       | Verified                                                                                                 |
| ------------- | -------------------------------- | ------------------------------ | -------------------------------------------------------------------------------------------------------- |
| Faculty       | `phase2-faculty@example.edu`     | `phase2-faculty-password-2026` | Login endpoint returned HTTP 200 during this handoff.                                                    |
| Administrator | `phase4-local-admin@example.edu` | `Phase4-Local-Admin-2026!`     | Created through the supported local seed workflow; login endpoint returned HTTP 200 during this handoff. |

## Preferred Faculty Acceptance Data

Use the existing Faculty-owned active data below. It is disposable local smoke data and was confirmed directly from MariaDB without modifying existing issuance, class, badge, student, or roster records.

| Item                   | Value                                       |
| ---------------------- | ------------------------------------------- |
| Faculty user ID        | `cmsop5j39000201pf76txewyg`                 |
| Class                  | `CS-P2 — Phase 2 Architecture`, section `A` |
| Class ID               | `cmsop628a000601pf895dsy4p`                 |
| Class status           | `ACTIVE`                                    |
| Badge                  | `Systems Architect`                         |
| Badge ID               | `cmsopyuru000001lmo6z5ia2k`                 |
| Badge status           | `ACTIVE`                                    |
| Student                | `Ada Lovelace` (`P3-2026-001`)              |
| Student ID             | `cmsopv6d7000201ro334dzsj4`                 |
| Enrollment status      | `ACTIVE`                                    |
| Initial issuance count | 0 at handoff preparation                    |

Direct page URL: `http://localhost:3000/classes/cmsop628a000601pf895dsy4p/issued`.

## Controller Browser Checklist

1. Sign in as Faculty at `http://localhost:3000/login`, open the direct Issued URL, select `Systems Architect` and `Ada Lovelace`, confirm the summary, and issue once.
2. Confirm the redirect/detail notice, random public ID, snapshot-backed values and artwork, unsigned/Open Badges 3.0-aligned-not-certified wording, and JSON download.
3. Submit the same class/badge/student tuple again and confirm the existing credential is reused without a second issuance.
4. Check class/global filters and protected CSV exports. Inspect console, clipping, overlay, and narrow-viewport overflow.
5. Sign in as the local Administrator and verify read-only global list/detail/export behavior and absence of Faculty issue controls.
6. Exercise the non-owner Faculty boundary if a second known local Faculty account is available; otherwise rely on the existing automated authorization evidence and record that limitation.
7. After issuance, change source badge/student data through authorized UI only and verify the issued detail/download retains the original snapshots. Do not rewrite issued credential records directly.

## Alternate Ready Data

- Class: `6ETHACKING — ETHICAL HACKING`, section `CYB-401`, ID `cmspdf5sr000201upt96vx3zo`.
- Badge: `Test Badge`, ID `cmspltem5000001pd88h3knnz`, active.
- Active students: `Jennifer Tayag` (`2026-00001`, ID `cmspdokrk000801upt587787z`) and `Mavy Tayag` (`44890`, ID `cmspdftif000401upfpuff866`).

Use one clean tuple only for the idempotency check. Any credential created during Browser QA becomes local historical test evidence and should remain intact for the later immutability check.
