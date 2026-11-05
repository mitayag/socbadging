# Stage 5E.1 Release Candidate Review

**Proposed version:** `0.5.0-rc.1`  
**Date:** 5 November 2026  
**Committed/pushed/published:** No  
**Production deployment:** No

## 1. Version state

- `package.json` version: `0.5.0-rc.1`
- `package-lock.json` root version: `0.5.0-rc.1`
- No Git commit, tag, push, merge, or package publication was performed.

## 2. Release inclusion

Include:

- application and worker changes accumulated through Stages 5A–5E.1;
- `prisma/migrations/` including the additive recipient-suppression migration;
- notification recipient policies, suppression integration, and worker checks;
- status-list publication repair and external verification scripts;
- unit, integration, and Playwright tests;
- production `compose.production.yaml`, `deploy/`, backup and monitoring scripts;
- operational and conformance documentation, including Stage 5A–5E.1 reports.

Exclude from release artifacts:

- `.env` and any populated environment file;
- `storage/stage5b/` raw backups and legacy manifests;
- `.playwright-e2e-signer.json`, `.playwright-e2e-fixture.json`;
- `test-results/`, `playwright-report/`, `.next/`, `node_modules/`;
- local screenshots under `docs/screenshots/` unless separately approved and redacted;
- private signing keys, SMTP credentials, database passwords, and webhook secrets.

## 3. Change review

The working tree contains 255 changed/untracked entries, dominated by application work across Stages
5A–5D plus Stage 5E.1 policy changes. No unrelated third-party source was added. The release should be
reviewed as one coherent candidate, not committed automatically.

Key Stage 5E.1 changes:

- `EMAIL_RECIPIENT_POLICY` local/staging/production model;
- immutable recipient-envelope authorization in the worker, retry, resend, and student email;
- system-token validation before activation/recovery email;
- Brevo readiness preflight and controlled-acceptance arming script;
- separate integration/E2E database guards and rate-limit isolation;
- version bump to `0.5.0-rc.1`.

## 4. Secret and fixture exposure check

- `git ls-files` contains no `.env`, private key, PEM, or signing-key file.
- A scan of repository text files against local secret values found **0 matches**.
- Private-key markers are limited to documentation examples and disposable integration fixtures.
- `.gitignore` excludes `.env*` except `.env.example`, local storage, Playwright fixtures, test
  results, and build output.
- No real student or production data was added to fixtures.
- Legacy test records remain in the local database but are not copied into release source.

## 5. Documentation consistency

- README documents recipient policies and separate integration/E2E databases.
- Email operations and Brevo configuration describe the explicit policy and fail-closed behavior.
- Stage 5C.1 suppression and status-list docs remain current.
- Stage 5D production Compose, NPM, backup, monitoring, and security docs remain applicable; the
  Stage 5D allowlist limitation is marked resolved by Stage 5E.1.
- Stage 5E.1 reports document external items that remain unverified.

## 6. Reproducible build

Recommended candidate build:

```sh
npm ci
npm run db:generate
npm run format
npm run lint
npm run typecheck
npm test
npm run build
docker build --target runner -t hau-soc-badging-web:0.5.0-rc.1 .
```

Production images use the pinned Node base digest in `Dockerfile`; Compose service images are pinned by
digest. Record the resulting local image IDs/digests in the release record.

## 7. Artifact integrity snapshot

SHA-256 of key build inputs at review time:

```text
e46cdfbc9ab9b8bb878feb71b7d1392ebcff0ba4bddf725352bd3a21aca069e5  package.json
142cc981b2fc5d0b99e4859ef6e8ab5796285a1f693a73e2f6879395c3e2909c  package-lock.json
1a35c5493cb4813e29b170f59108ade0da8f82907207d264a2d1b1ef29d3c928  Dockerfile
a41fcb1adb691affbd16215578539c6678e68d60f942fb870bb366da1d8b99ff  compose.production.yaml
b9b975795841e1dd841a596d763779f767e47cd51e8f398ebfd1e5663a4916d1  compose.yaml
833d124070ce6c734579aec89d87e72819c423182affe6b583182f76221958d3  deploy/production.env.example
```

Recompute after any further change. Do not treat this snapshot as a signed release until an approved
build/signing process records it.

## 8. CI readiness

Current `.github/workflows/quality.yml` runs format, lint, typecheck, unit tests, and production build
on Node 22. It does not start MariaDB or run integration/Playwright suites.

CI gaps to close before final release:

1. Add a MariaDB service with two disposable databases (`*_test`, `*_e2e`).
2. Run `prisma migrate deploy` against both.
3. Run integration tests with `TEST_DATABASE_URL`.
4. Run Playwright desktop/mobile with `E2E_DATABASE_URL` and the disposable confirmation flag.
5. Publish test artifacts only with private-data redaction.
6. Pin GitHub Actions by digest or approved version policy.

Local Stage 5E.1 runs covered these suites; CI automation remains a release-process improvement.

## 9. Release-candidate verdict

**Candidate content and version: READY for approval.**  
**Publication: BLOCKED on explicit approval and the external acceptance items in the remaining-risk
report.**
