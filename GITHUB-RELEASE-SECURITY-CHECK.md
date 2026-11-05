# GitHub Release Security Check

**Release:** `v0.5.0-rc.1`  
**Repository:** https://github.com/mitayag/socbadging (public)  
**Candidate commit:** `1d622a043aa3f4923c2ccaee0db27513cc62168c`  
**Secret scan result:** PASS

## 1. Repository audit

- Remote confirmed as the expected `mitayag/socbadging` GitHub repository.
- Default branch is `main`; release branch is `release/v0.5.0-rc.1`.
- 333 files were included in the release commit.
- No `.env`, private key, PEM, database backup, media backup, Playwright signer fixture, test result,
  or screenshot was staged.

## 2. Excluded sensitive material

The following remain local/ignored and were not committed:

- `.env`
- `.env.*` (except intentional placeholder templates)
- `storage/stage5b/` database/media backups and legacy manifest
- `.playwright-e2e-signer.json` and `.playwright-e2e-fixture.json`
- `docs/screenshots/` (58 PII-bearing local/E2E images)
- `test-results/`, `playwright-report/`, `.next/`, `node_modules/`, and TypeScript build cache

`.gitignore` was updated to keep `.env.brevo.example` as an intentional template and to ignore
`docs/screenshots/`.

## 3. Redactions before publication

The release audit found and replaced the following in release-tracked text:

- the developer's personal recipient email with `authorized-test-recipient@example.org`;
- a Brevo SMTP account identifier with `<redacted-brevo-smtp-username>`;
- provider message IDs with `<redacted-provider-message-id>`;
- local macOS configuration paths with `<private-config-directory>` / `<private-brevo-env-file>`.

No real secret value was exposed in the report of these redactions.

## 4. Secret scans

### Local secret-value comparison

Values were read from local `.env` for database, SMTP, signer, webhook, and bootstrap secrets and
compared against staged release files.

```text
local_secret_values: 4
staged_real_secret_hits: 0
```

The only apparent existing match was between the local development database placeholder and the
placeholder in `.env.example`; it is not a real credential.

### Credential/token patterns

Staged files were scanned for:

- `BEGIN RSA/EC/OPENSSH/PRIVATE KEY`
- GitHub tokens (`gho_`, `ghp_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`)
- AWS access keys
- Google API keys

No real credential pattern was found.

`privateKeyMultibase` appears only in:

- `deploy/secrets/README.md` as JSON-shape documentation;
- `e2e/phase8-open-badges-conformance.spec.ts` as a negative UI assertion.

### History check

Targeted history searches for the redacted personal email, Brevo account identifier, GitHub token
patterns, and OpenSSH/RSA private-key markers returned no matches. The only historical
"BEGIN PRIVATE KEY" string is a malformed-public-key negative test fixture, not key material.

## 5. Fixture and PII review

- Release tests use `example.test`, `example.edu`, `example.org`, or generic `hau.edu.ph` placeholder
  addresses.
- No real student records, roster exports, issued credentials, database dumps, or media archives were
  committed.
- The 27 legacy records remain only in the local database; they were not included as release data.
- Screenshots were excluded entirely and are now git-ignored.

## 6. Dependency security

```text
npm audit --omit=dev
found 0 vulnerabilities
```

Full audit including build/test tooling reports 14 advisories (4 high, 10 moderate), all in dev-only
tooling. They are documented as a separate tooling-upgrade task.

## 7. CI security status

Both GitHub Actions `Quality` runs passed for the candidate commit. The CI workflow does not currently
run integration or Playwright suites; those were run locally with disposable databases.

## 8. Residual risks

- The repository is public; future commits must continue using the same secret-scan discipline.
- Development-only dependency advisories remain.
- Local screenshots remain on the developer machine and must not be pushed.
- Production secrets will be provisioned separately via the documented secret store.

## 9. Verdict

**Secret/PII scan: PASS.**  
No credentials, private keys, database backups, real student data, or PII-bearing screenshots were
published in the release candidate.
