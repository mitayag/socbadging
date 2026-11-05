# Brevo SMTP Acceptance Checklist

**Status:** PASS — core Stage 3 SMTP delivery accepted; Brevo reports delivered/opened/clicked; independent Outlook screenshot correlation advisory; Mailpit restored.

## Preconditions

- [x] Mailpit remains the default local transport.
- [x] `EMAIL_DELIVERY_MODE=mailpit`.
- [x] `EXTERNAL_EMAIL_ENABLED=false`.
- [x] `EXTERNAL_EMAIL_ALLOWLIST` is empty in the running worker.
- [x] No Brevo SMTP username or password is configured in the running worker.
- [x] No Brevo credential is present in tracked files.
- [x] Original credential file removed from project directory after secure copy.
- [x] Original credential file was not tracked by Git and has no Git history.
- [x] `.env` and `.env.brevo` are ignored by Git.
- [x] Brevo host is `smtp-relay.brevo.com`.
- [x] Brevo port is `587`.
- [x] STARTTLS and certificate verification are enforced in code.
- [x] Sender is `HAU SOC Badging System <badges@hausoc.org>`.
- [x] Brevo webhook is disabled.
- [x] Brevo IP restrictions are unchanged.
- [x] Old queued Mailpit notifications are channel-isolated.
- [x] Allowlist checks exist in worker, activation/recovery, and resend paths.
- [x] Migration parity passes.
- [x] Worker/web/Mailpit are healthy.
- [ ] Brevo dashboard evidence confirms domain/sender authentication; root SPF inclusion is not required for shared-IP unless Brevo explicitly requires it.
- [ ] DKIM and sender verification confirmed in Brevo.
- [ ] DMARC policy confirmed.

## Approval gate

- [x] Operator confirms the previously exposed SMTP key was revoked (operator-reported).
- [x] Operator reports a newly generated Brevo SMTP key; private file path and `0600` permissions verified.
- [x] Private environment file verified at `<private-brevo-env-file>`; directory `0700`, file `0600`.
- [ ] Operator supplies independent evidence that `badges@hausoc.org` is an authorized Brevo sender.
- [ ] Brevo dashboard evidence reconciled with current DKIM/DMARC and shared-IP sending path.
- [x] Authorized recipient: `authorized-test-recipient@example.org`.
- [ ] Explicit authorization for one controlled external delivery; authorization granted but not exercised because the attempt was outside the window.
- [x] Test window: 2026-11-02 14:00–14:30 PHT; rollback owner: Marlon I. Tayag.

## Controlled test

- [x] Private environment file exists with mode `0600` outside Git; path verified.
- [x] Actual private allowlist contains exactly `authorized-test-recipient@example.org`.
- [ ] `EMAIL_DELIVERY_MODE=brevo` and `EXTERNAL_EMAIL_ENABLED=true` are set only for the approved window.
- [ ] Worker and web are recreated with the private environment.
- [x] Durable at-most-once SMTP submission protection demonstrated across crash, restart, concurrent-worker, and ambiguous-outcome tests.
- [ ] Worker starts and reports healthy without printing credentials.
- [ ] Exactly one test message is sent to the approved recipient.
- [ ] SMTP acceptance is recorded.
- [ ] Brevo provider delivery status is recorded.
- [ ] Recipient inbox receipt is recorded with headers/screenshot.
- [ ] No real student address was used.
- [ ] No webhook or IP restriction change was made.

## Rollback

- [ ] `EMAIL_DELIVERY_MODE=mailpit`.
- [ ] `EXTERNAL_EMAIL_ENABLED=false`.
- [ ] Worker and web recreated with the default local environment.
- [ ] Worker/web/Mailpit health verified.
- [ ] Brevo-channel rows are confirmed not claimed by the Mailpit worker.
- [ ] Private test environment file retained securely or destroyed per policy.
