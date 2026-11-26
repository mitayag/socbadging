# Stage 6C Email Activation Readiness

**Date:** 22 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production project:** `hau_soc_badging_stage2`  
**Production worker:** `hau_soc_badging_stage2-worker-1`  
**Production sender:** `HAU SOC Badging System <badges@hausoc.org>`  
**Brevo domain/sender authentication:** **PASS**  
**Production deployment:** Not performed  
**Live email sent:** None  
**First live student email:** **BLOCKED** pending the gates below

> Historical Stage 6C readiness record, not current production instructions. See
> `docs/email/BREVO-CONFIGURATION.md` for the current recipient policy.

## 1. Executive status

Administrator-provided Brevo screenshots confirm the production sender domain and identity:

| Check                      | Evidence      | Result |
| -------------------------- | ------------- | ------ |
| `hausoc.org` domain        | Authenticated | PASS   |
| `badges@hausoc.org` sender | Verified      | PASS   |
| DKIM                       | Verified      | PASS   |
| DMARC                      | Configured    | PASS   |
| Branded subdomain          | `badges`      | PASS   |
| Brevo infrastructure       | Shared IP     | PASS   |

This resolves the earlier Stage 6B Brevo authentication blocker. The remaining blockers are
application-level configuration/transport verification, production deployment/rollback evidence,
queue/backup readiness, and explicit pilot authorization.

## 2. Production application configuration

**Status: BLOCKED — not verifiable from this environment.** The restricted production SSH account is
status-only; it does not expose container environment, logs, or database access. No secret values were
requested, printed, or accessed.

An authorized administrator must run read-only checks and provide only the non-secret output:

```sh
PROD_PROJECT=hau_soc_badging_stage2
COMPOSE_FILE=/opt/socbadging/compose.production.yaml

for c in web worker; do
  ID=$(docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" ps -q "$c")
  echo "== $c"
  docker inspect "$ID" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -E '^(NODE_ENV|EMAIL_DELIVERY_MODE|EMAIL_RECIPIENT_POLICY|EXTERNAL_EMAIL_ENABLED|CONTROLLED_ACCEPTANCE_ONLY|EXTERNAL_EMAIL_ALLOWLIST|BREVO_SMTP_HOST|BREVO_SMTP_PORT|BREVO_SENDER|BREVO_WEBHOOK_ENABLED|NOTIFICATION_CYCLE_TIMEOUT_MS)='
  docker inspect "$ID" --format 'secrets={{json .Config.Secrets}}'
done

docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" logs --since=30m --tail=200 worker
curl -fsS http://127.0.0.1:3002/api/health
```

Never print `BREVO_SMTP_USER`, `BREVO_SMTP_PASSWORD`, `BREVO_WEBHOOK_SECRET`, `DATABASE_URL`, or
`SIGNER_TOKEN`.

Required web/worker values for activation:

```text
EMAIL_DELIVERY_MODE=brevo
EMAIL_RECIPIENT_POLICY=staging   # for the one-recipient pilot; production only after approval
EXTERNAL_EMAIL_ENABLED=true
EXTERNAL_EMAIL_ALLOWLIST=authorized-test-recipient@example.org   # pilot only
CONTROLLED_ACCEPTANCE_ONLY=false
BREVO_SMTP_HOST=smtp-relay.brevo.com
BREVO_SMTP_PORT=587
BREVO_SENDER=HAU SOC Badging System <badges@hausoc.org>
BREVO_WEBHOOK_ENABLED=true
```

The worker must fail closed if the mode is Mailpit, external email is disabled, or the recipient
policy/allowlist does not authorize the pilot recipient.

## 3. Worker transport confirmation

**Status: BLOCKED — requires production inspection.**

The worker must use Brevo SMTP, not Mailpit. Confirm all of:

- worker `EMAIL_DELIVERY_MODE=brevo`;
- worker `BREVO_SMTP_HOST=smtp-relay.brevo.com`, port `587`;
- recent `notification_deliveries.delivery_channel` is `brevo`;
- worker logs show normal cycles and no Mailpit/local-transport fallback;
- worker image is the approved Stage 6B image;
- `BREVO_SENDER` exactly matches the verified sender.

Read-only database checks:

```sh
docker compose -p "$PROD_PROJECT" -f "$COMPOSE_FILE" exec -T db sh -lc '
  mariadb -N -B -uroot -p"$(cat /run/secrets/db_root_password)" "$MARIADB_DATABASE" -e "
    SELECT delivery_channel, status, COUNT(*) AS count
    FROM notification_deliveries GROUP BY delivery_channel, status;
    SELECT id, status, delivery_channel, provider_status, attempt_count,
           smtp_accepted_at, sent_at, provider_status_at
    FROM notification_deliveries ORDER BY created_at DESC LIMIT 5;
    SELECT notification_delivery_id, attempt_number, outcome, started_at, completed_at
    FROM notification_delivery_attempts ORDER BY started_at DESC LIMIT 5;
  "
'
```

Do not print recipient email addresses or message bodies in shared evidence.

## 4. Sender name and From address

**Identity: PASS per administrator.** The approved value is:

```text
HAU SOC Badging System <badges@hausoc.org>
```

**Application env confirmation: BLOCKED** until the non-secret `BREVO_SENDER` check above is supplied.
The exact display name/address must match; a different domain or display name is a stop condition.

Public DNS observation: `hausoc.org` SPF still lacks a Brevo include, while DKIM and DMARC are
configured. DKIM/DMARC is the approved authentication path; do not claim SPF PASS. SPF alignment
remains an operator deliverability observation. Do not change DNS in Stage 6C.

## 5. Tracking, retry, and duplicate protection

### Local verification — PASS

| Area                                | Evidence                                       |
| ----------------------------------- | ---------------------------------------------- |
| Provider event ingestion            | Brevo webhook adapter and delivery-event tests |
| Delivered/bounce/complaint tracking | Delivery-event/suppression integration tests   |
| Retry backoff                       | Retry-policy and worker tests                  |
| No retry after unknown outcome      | Delivery-worker timeout/unknown-outcome tests  |
| One outbox row per issuance/type    | Unique `(issuance_id, type)` constraint        |
| Duplicate provider-event replay     | Idempotent delivery-event tests                |
| Duplicate provider message ID check | Queue/duplicate baseline query                 |
| Suppression before retry/resend     | Suppression/retry integration tests            |
| Controlled acceptance one-shot      | Reservation/reconciliation tests               |

Focused evidence: **7 unit files / 42 tests PASS** and **5 integration files / 22 tests PASS**.

### Production verification — BLOCKED

The provider webhook registration, actual provider events, and production queue state cannot be
confirmed without authorized access. The Brevo screenshots confirm sender/domain authentication, not
webhook delivery. The administrator must confirm `BREVO_WEBHOOK_ENABLED=true`, webhook secret
presence, and provider webhook registration before relying on delivery/bounce tracking.

Required duplicate baseline before the pilot:

```sh
SELECT provider_message_id, COUNT(*)
FROM notification_deliveries
WHERE provider_message_id IS NOT NULL
GROUP BY provider_message_id HAVING COUNT(*) > 1;
```

Required: no rows, 0 pending deliveries, 0 unfinished `STARTED` attempts.

## 6. Stage 6B release images and test status

The release images remain the approved Stage 6B candidates:

| Service | Image                                                 | Image ID                                                                  | Tar SHA-256                                                        |
| ------- | ----------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Worker  | `hau-soc-badging-worker:stage6b-6d2f403-a8c209e18d5f` | `sha256:511a1a2f8afea034992f4266a423f049ec04e8fa98a28c96dbe05116b7d38379` | `3b37f608c21b1f77818dd51400ce05f740c07cf709e979897b49e9d1081800ed` |
| Web     | `hau-soc-badging-web:stage6b-6d2f403-a8c209e18d5f`    | `sha256:927561474586020d4753446bd52328c9af9f597e22ae3c1874bb1589a7204d38` | `26c262d0732378f2df6130abe6911161ae9f0cfe0dc7cd7959d3fd716f838fc7` |

Image checksums re-verified: PASS. The source snapshot remains uncommitted
(`a8c209e18d5f034d46eba36a7fb3d4a809306eed5da3335b9bc016e9c1a4e51b`). The production worker must
contain this image (or an approved equivalent) for the official Stage 6A email template to be tested.

### Outstanding full Playwright result

- Relevant Stage 6A + Phase 8 suite: **20/20 PASS** (desktop + mobile).
- Rate-limit E2E after test hardening: **PASS**.
- Full Playwright suite: **not clean** — 57 passed, 3 failed, 1 skipped in the last full run.
- The three failures were mobile navigation/load timeouts in older audit/dashboard/management specs
  against the local Docker `next dev` server; the pages rendered, and individual reruns passed.
- Treat this as a local E2E environment flake, not a proven application defect, but do not claim a
  clean full-suite gate. Re-run the full suite against a production build or with an approved timeout
  policy before general activation.

## 7. Existing credentials and signing keys

**Preserved; no changes were made.**

- No signing-key rotation, replacement, or retirement.
- No credential rewrite, deletion, or reissuance.
- No database migration.
- Public issuer, key, and status-list endpoints return HTTP 200.
- Specific active production credential verification remains pending an administrator-selected
  public ID.

Before and after the pilot, verify one existing active credential’s page/API/status/download/QR and
confirm the status list remains valid. Use an opaque public ID only; do not expose student PII.

## 8. Controlled pilot

**Status: NOT EXECUTED — BLOCKED.**

Recipient candidate: `authorized-test-recipient@example.org` (previously recorded as an approved reserved test
mailbox). This must be reconfirmed for the specific pilot window.

Required before one external email:

- [ ] Written approval for one external email and the exact window.
- [ ] Named operator, observer, and rollback owner.
- [ ] Test student/account and isolated test class/badge ready.
- [ ] Production application config verified as Brevo + staging allowlist.
- [ ] Worker confirmed on Brevo and Stage 6B image.
- [ ] Brevo sender exact match and webhook registration verified.
- [ ] Queue empty, no duplicates, no unfinished attempts.
- [ ] Backups current; rollback images preserved.
- [ ] Existing credential verifiability check passed.

Pilot sequence:

1. Apply approved pilot configuration; preserve previous non-secret config.
2. Issue exactly one badge to the approved test student.
3. Confirm one signed credential, audit record, outbox row, and SMTP attempt.
4. Confirm exactly one email received; verify subject, content, links, artwork, and privacy.
5. Verify public page, cryptographic proof, JSON/image/PDF/QR, and sharing links.
6. Verify provider accepted/delivered event and webhook tracking.
7. Confirm no duplicate message ID/attempt and queue drains.
8. Record evidence and restore/retain configuration per approval.

If any step fails: stop, disable external email with approval, preserve logs/records, do not resend,
and do not restore the database or rotate keys for an email-only failure.

## 9. Remaining steps before the first live student badge email

1. **Provide non-secret production env evidence** for web and worker (§2).
2. **Confirm worker transport is Brevo**, not Mailpit, and recent queue rows use `brevo` (§3).
3. **Confirm exact `BREVO_SENDER`** matches `HAU SOC Badging System <badges@hausoc.org>` (§4).
4. **Confirm webhook registration/secret** and provider event tracking (§5).
5. **Confirm queue is empty**, no duplicate message IDs, no unfinished attempts (§5).
6. **Deploy/verify the approved Stage 6B worker** (and web if sharing changes are in scope) under
   separate deployment approval; the current production image is not verified as Stage 6B (§6).
7. **Preserve rollback images** for worker and web; confirm schema requires no migration.
8. **Resolve or formally accept the full Playwright flake** before general activation (§6).
9. **Reconfirm recipient and approved sending window** for `authorized-test-recipient@example.org`.
10. **Obtain explicit live-send authorization**, then execute the single-recipient pilot.

## 10. Readiness statement

**Brevo domain/sender authentication: PASS.**  
**Local tracking/retry/duplicate controls: PASS.**  
**Production configuration/worker transport/webhook: BLOCKED.**  
**Stage 6B deployment and rollback verification: BLOCKED.**  
**First live student badge email: BLOCKED** pending the gates in §9.

No production settings were changed, no images were deployed, no live badges were issued, no email
was sent, and no signing keys or existing credentials were modified.
