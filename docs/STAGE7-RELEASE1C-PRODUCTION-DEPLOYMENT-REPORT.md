# Stage 7 Release 1C — Production Deployment Report

**Date:** 28 November 2026
**Production URL:** https://socbadging.hausoc.org
**Compose project:** `hau_soc_badging_stage2`
**Release commit:** `c64038b5caaccb0b378609d33de487e1e82a17d1`
**Previous production commit:** `4eb403f190c6489ad34e1b7310c89c50ec136ee8`
**Result:** **SUCCESSFUL**

## 1. Authorization and operators

- Authorization: Stage 7 Release 1C/1D deployment instruction from the repository owner.
- Deployment operator: the authenticated repository owner account (`mitayag`) executing this run.
- Rollback owner: same account, as authorized by the instruction. No separate named individual was supplied; this is recorded as an assumption.
- Maintenance window: authorized to proceed immediately; no explicit start/end time was supplied. The deployment completed within the working session.
- Emergency recovery: pre-deploy backup restore + `pre-stage7` image tags (see §9).

## 2. Final preflight

All mandatory conditions passed:

- SSH administrative access reachable.
- Production healthy: web/worker/signer/db/mailpit all healthy; heartbeat fresh.
- Signer ready (1 ACTIVE key); status list published (200); Brevo/DB/signing secrets present.
- Queue: 2 SENT, 2 FAILED, 0 STARTED.
- Migrations: 21 applied, 0 pending.
- Resources: 9.0 GB disk free, ~1.9 GB RAM available.
- Feature branch pushed; release branch at `4eb403f`; no merge conflicts; prior fixes included.
- Operator scripts preserved.
- Authenticated credentials: resolved in Phase A1 (dedicated STAGE7 test accounts; see authentication report).

## 3. GitHub release integration

- Merged `feature/stage7-release1-shared-badge-library` into `release/v0.5.0-rc.1` (no-ff).
- Merge `ccfe596` — full Stage 7 feature; CI run `46120955937` passed.
- Follow-up `c64038b` — promotion-script database-secret fix; CI run `46121595659` passed.
- Application code is identical between `ccfe596` and `c64038b`; the follow-up only corrected the operational promotion script.
- Pushed release branch; no dirty application code was deployed.

## 4. Backups

| Backup               | Path                                                                  | Verification                         |
| -------------------- | --------------------------------------------------------------------- | ------------------------------------ |
| Pre-provisioning     | `/var/backups/hau-soc/stage7-release1c-preprovision-20261128T071645Z` | SHA-256, gzip/tar, signing-key parse |
| Pre-deployment       | `/var/backups/hau-soc/stage7-release1c-predeploy-20261128T072717Z`    | SHA-256, gzip/tar, signing-key parse |
| Release 1B reference | `/var/backups/hau-soc/stage7-release1b-20261128T064647Z`              | Previously restore-verified          |

Each backup contains the database dump, media archive, secrets/signing key, production env, compose configuration, container/image rollback identifiers and a SHA-256 manifest. Secrets were never displayed.

## 5. Images built and deployed

| Image                                            | ID                                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------------- |
| `hau-soc-badging-web:stage7-release1-c64038b`    | `sha256:365324803329e2ca199c0c8d020206045fa0e00dfa54d00d60d37aecae53834d` |
| `hau-soc-badging-worker:stage7-release1-c64038b` | `sha256:a23b29f60a8ce4d974411246c8de55cacbaf16c2b4a65f0b29b241deac2349b7` |
| `hau_soc_badging_stage2-migrate:latest`          | `sha256:654a51a23086e9d38bb6ab1d139beebe5298e14b7fd888216570e736d5a6e4a0` |

Rollback images: `hau-soc-badging-web:pre-stage7` (`sha256:dd11647…`), `hau-soc-badging-worker:pre-stage7` (`sha256:a8faa36…`).

## 6. Database migration

1. Ledger verified at 21 with 0 pending.
2. Applied `20261128120000_stage7_shared_badge_library`; ledger moved to **22**.
3. Promotion dry-run (reconciled with legitimate intervening test data):
   - **3** standardized courses (2 existing course codes + `STAGE7-CAP-001`)
   - **4** class-to-course mappings (2 production + 2 STAGE7 test classes)
   - **3** badge definitions
   - **0** duplicate groups, **0** errors
4. Applied the promotion: 3 courses, 4 mappings, 3 definitions, 3 versions, 3 assignments, 3 template links.
5. Second apply: **0 writes**; final dry-run: **0 changes** (idempotent).

The expected 1B baseline of 2 courses/2 mappings changed to 3 courses/4 mappings solely because the authorized test provisioning added two test classes sharing `STAGE7-CAP-001`. This was identified and reconciled before applying; definitions/assignments remained 3 and duplicates remained 0.

## 7. Application rollout

- Worker deployed first with the new image; healthy, cycling every ~5 s, processed 0, no timeout/error/stall; heartbeat fresh.
- Web deployed second with the new image; healthy.
- No `db`, `signer`, `media-init` or `migrate` recreation during the service rollout.
- Volumes, secrets and signing keys preserved; no key regeneration, volume reset or database recreation.
- Staging was paused only during the build (memory) and restarted healthy afterwards.

## 8. Post-deployment verification

- Public and local `/api/health`: ready, DB ready, signer ready, notifications ready, heartbeat fresh.
- Reverse proxy/HTTPS reachable; public endpoints 200 (health, login, issuer, status list, credential page/API/image/PDF/QR).
- Historical credentials: 3/3 verify; no reissuance.
- Issuance identity CRC32 `10420535069` and signed-credential CRC32 `5032942483` unchanged.
- Notification deliveries 4 and attempts 2 unchanged; no unexpected email.
- Queue 2 SENT, 2 FAILED, 0 STARTED.
- Audit logging operational (course, badge, version, assignment, cleanup rows).
- Authenticated acceptance: Stage H 8/8, Stage 7 8/8 (desktop + mobile).

## 9. Rollback readiness

- Additive schema: previous code ignores the new tables/columns.
- Application rollback: redeploy `pre-stage7` images with `--no-deps`; no database restore required.
- New records created after deployment (courses, definitions, versions, assignments, materialized templates, review/audit rows) remain valid and are ignored by the previous code; do not delete them during an application rollback.
- Database recovery: restore the pre-deployment dump only for a destructive failure; never rewrite historical issuances, signatures, public IDs, status allocations, notifications or audit logs.
- Rollback owner: repository owner account (authorized).

## 10. Expected vs observed downtime

- Expected: ~1–3 minutes for worker/web recreation; additive migration requires no downtime.
- Observed: brief worker and web recreation (seconds each); no public health failure during the rollout. Total controlled change window well under the expected envelope.

## 11. Deviations

1. The promotion script initially used the image's build-time `DATABASE_URL` and a 4-connection pool, which failed against the production connection budget. It was corrected (runtime secret preference, single connection), committed as `7d654fd`, merged as `c64038b`, re-verified by CI, and used successfully. Application images were rebuilt from `c64038b`.
2. Two Stage H test assumptions were stale (ambiguous locator; redirect vs 403/404). The production spec was corrected; this was a test fix, not an application change.
3. Additional test data (2 classes/2 students/1 course) changed the migration's reconciled counts as described in §6.

## 12. References

- `docs/STAGE7-RELEASE1C-AUTHENTICATION-BLOCKER-RESOLUTION.md`
- `docs/STAGE7-RELEASE1C-PRODUCTION-ACCEPTANCE-REPORT.md`
- `docs/STAGE7-RELEASE1C-TEST-ACCOUNT-RETIREMENT-REPORT.md`
- `docs/evidence/stage7-release1c/`
