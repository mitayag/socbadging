# Stage 7 Release 1D — Production Acceptance Report

**Date:** 28 November 2026
**Production release:** `c64038b` (web/worker `stage7-release1-c64038b`)
**Environment:** https://socbadging.hausoc.org
**Result:** **PASS**

Authenticated acceptance used the dedicated STAGE7 accounts created for this deployment. No production credential was issued and no external email was sent.

## 1. Automated acceptance results

| Suite                                                             | Result                                                |
| ----------------------------------------------------------------- | ----------------------------------------------------- |
| Stage H public + authenticated production spec (desktop + mobile) | **8/8 passed**                                        |
| Stage 7 production acceptance (4 tests × desktop + mobile)        | **8/8 passed**                                        |
| Production evidence capture (desktop + mobile)                    | **2/2 passed**                                        |
| Historical credential public verification                         | **3/3 credentials** page/API/image/QR HTTP 200        |
| Health                                                            | ready, DB/signer/notifications ready, heartbeat fresh |

## 2. Administrator acceptance

| Scenario                                           | Result | Evidence                                                     |
| -------------------------------------------------- | ------ | ------------------------------------------------------------ |
| Sign in, dashboard, management access              | PASS   | Stage H spec                                                 |
| Create a standardized course                       | PASS   | Stage 7 spec: created a unique test course                   |
| Edit the course                                    | PASS   | Stage 7 spec: title updated, notice shown                    |
| Archive the course                                 | PASS   | Stage 7 spec: confirmation dialog, archive notice            |
| Course catalog search/list                         | PASS   | `/catalog?q=STAGE7-CAP-001`                                  |
| Create a centralized badge for the migrated course | PASS   | Stage 7 spec: submitted and approved                         |
| Approve a faculty proposal                         | PASS   | Stage 7 spec: approval notice, approved status               |
| Publish/approve a new version                      | PASS   | Stage 7 spec: v2 created, submitted, approved                |
| Badge usage across sections                        | PASS   | 2 associated class sections shown                            |
| Version history                                    | PASS   | 2 version rows after v2                                      |
| Audit logging                                      | PASS   | Audit page shows badge/course actions; DB audit rows present |
| Sign out/session handling                          | PASS   | Stage H/evidence specs                                       |

## 3. Faculty acceptance

| Scenario                                                      | Result | Evidence                                                                |
| ------------------------------------------------------------- | ------ | ----------------------------------------------------------------------- |
| Faculty A dashboard/classes                                   | PASS   | Stage H spec                                                            |
| Access approved shared badges                                 | PASS   | Stage 7 spec: library/detail                                            |
| Submit a badge proposal                                       | PASS   | Faculty B proposal created and submitted                                |
| Assign the same approved badge to class A                     | PASS   | Assignment notice; 2 sections overall                                   |
| Assign the same approved badge to class B (different faculty) | PASS   | Assignment notice                                                       |
| Duplicate assignment prevention                               | PASS   | Second assignment rejected: "already assigned"                          |
| Cross-faculty class isolation                                 | PASS   | Class B link absent for Faculty A and class A link absent for Faculty B |
| Shared badge is read-only for faculty                         | PASS   | No "Create a New Version"; no approval control                          |
| Faculty cannot reach approval queue/catalog                   | PASS   | `/library?scope=queue` has no queue; `/catalog` redirects to dashboard  |
| Administrator route denial                                    | PASS   | `/faculty` denied (redirect, no management content)                     |
| Faculty ownership isolation                                   | PASS   | Only own classes visible                                                |

## 4. Student acceptance

| Scenario                                         | Result        | Evidence                                                                                                                          |
| ------------------------------------------------ | ------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Student A portal login/dashboard                 | PASS          | Stage H/Stage 7 specs                                                                                                             |
| Student B portal login/dashboard                 | PASS          | Stage 7 spec                                                                                                                      |
| Student badge wallet page                        | PASS          | `/student/badges`                                                                                                                 |
| Credential ownership isolation                   | PASS          | Student A cannot see Student B email and vice versa                                                                               |
| Staff route/API denial                           | PASS          | `/students` redirected; `/api/issued/export` and batch report 403/404                                                             |
| Credential detail/download for new test students | Not performed | No test credential was issued (issuance requires separate authorization). Existing production credentials were verified publicly. |

## 5. Historical and operational integrity

- Existing credits: 3 issuances; identity CRC and signed-credential CRC unchanged.
- Public credential pages, JSON/JSON-LD, images and QR all HTTP 200.
- No notification delivery or attempt was created (4 deliveries / 2 attempts).
- Queue remained 2 SENT, 2 FAILED, 0 STARTED.
- No signing key, volume, secret or database was recreated.
- Audit records were preserved.

## 6. Test data and evidence

Mutation testing used only isolated STAGE7 test records:

- Course `STAGE7-CAP-001` (migrated from the two test classes).
- Classes `STAGE7-CAP-001` sections A and B.
- Students `STAGE7-STU-A` and `STAGE7-STU-B`.
- Badges named `STAGE7 E2E Primary …` and `STAGE7 E2E Proposal …`.

All test data was archived after acceptance; see the retirement report. Screenshots:

- `docs/evidence/stage7-release1c/catalog-{desktop,mobile}.png`
- `badge-library-{desktop,mobile}.png`
- `class-shared-assignments-{desktop,mobile}.png`
- `audit-log-{desktop,mobile}.png`
- `student-portal-{desktop,mobile}.png`

## 7. Scope restrictions honored

- No production credential issuance.
- No external email delivery.
- No modification of actual academic records.
- No automatic merging or deletion of duplicate badges.
- No Stage 7 Release 2 or CHED functionality.

## 8. Conclusion

Stage 7 Release 1 is deployed and accepted in production. Course catalog, centralized badge library, approval/versioning, shared class assignments, faculty isolation, student isolation, historical credential integrity and audit logging all passed.
