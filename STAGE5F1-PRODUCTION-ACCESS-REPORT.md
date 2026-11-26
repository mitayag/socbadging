# Stage 5F.1 Production SSH Access Report

**Date:** 5 November 2026  
**Production URL:** https://socbadging.hausoc.org  
**Production changes:** None  
**SSH settings/accounts/keys modified:** None

## 1. Executive summary

The previous SSH failure was caused by using the wrong host, username, and key. The restricted
production test account is reached through the Tailscale address `100.126.199.26`, not the public
website IP on port 22.

Current result:

- Tailscale host `100.126.199.26:22` is reachable.
- SSH server is OpenSSH 8.9p1 Ubuntu, public-key authentication only.
- Server host key is known and matches `known_hosts`.
- User `socbadging-test` exists and the server **accepts** the dedicated public key
  `SHA256:tiEJDG0Pm1+Y4yTukSzrE5eIw5U+ibntqTbncDjvL+c`.
- Authentication still fails because the corresponding private key is passphrase-protected and is
  **not loaded in the SSH agent**. Batch mode cannot unlock it.
- No server-side authorized_keys or SSH configuration change is currently indicated by the key
  acceptance step.

## 2. Identified access configuration

| Item                           | Value                                                    |
| ------------------------------ | -------------------------------------------------------- |
| Public site                    | `https://socbadging.hausoc.org`                          |
| Public IP                      | `122.3.149.244`                                          |
| Restricted access host         | `100.126.199.26` (Tailscale/private route via `utun100`) |
| SSH port                       | `22`                                                     |
| SSH username                   | `socbadging-test`                                        |
| Client key                     | `~/.ssh/socbadging_prod_test`                            |
| Client public-key fingerprint  | `SHA256:tiEJDG0Pm1+Y4yTukSzrE5eIw5U+ibntqTbncDjvL+c`     |
| Server host-key fingerprint    | `SHA256:3KY2YdKxCaylxBz/1x6esXZgFOGhm3U4GSJIryEzZRs`     |
| SSH server                     | OpenSSH 8.9p1 Ubuntu-3ubuntu0.18                         |
| Authentication methods offered | `publickey` only                                         |
| Private-key state              | ED25519, mode `0600`, passphrase-protected               |
| SSH agent state                | No identities loaded                                     |

## 3. Connection test results

| Test                            | Result   | Evidence                                            |
| ------------------------------- | -------- | --------------------------------------------------- |
| HTTPS health                    | PASS     | `https://socbadging.hausoc.org/api/health` HTTP 200 |
| Public IP port 22               | BLOCKED  | `Network is unreachable` from this network          |
| Public IP port 443              | PASS     | HTTPS 200                                           |
| Tailscale host reachability     | PASS     | `ping` 3/3 received                                 |
| Tailscale port 22               | PASS     | TCP connection succeeded                            |
| Host-key verification           | PASS     | ED25519 host key matches `known_hosts`              |
| Public-key offer                | PASS     | Server accepts `SHA256:tiEJD...`                    |
| Public-key signature completion | **FAIL** | Private key passphrase unavailable in BatchMode     |
| Final auth result               | FAIL     | `Permission denied (publickey)`                     |

The server explicitly replied `Server accepts key` for the dedicated key. That means the public key is
present and readable by `sshd` for `socbadging-test`; the client failed before sending the signed
authentication packet because it could not decrypt the private key.

## 4. Failure diagnosis

| Possible cause                           | Finding                                                                         |
| ---------------------------------------- | ------------------------------------------------------------------------------- |
| Incorrect hostname                       | **Resolved** — use `100.126.199.26` via Tailscale, not public IP for SSH        |
| Incorrect username                       | **Resolved** — `socbadging-test` is accepted by the server                      |
| Incorrect key                            | **Resolved** — dedicated key fingerprint is accepted                            |
| `authorized_keys` missing/unreadable     | Not indicated — server accepts the public key                                   |
| Unlock/passphrase problem                | **CONFIRMED** — client cannot decrypt the private key in BatchMode              |
| SSH agent                                | **CONFIRMED GAP** — agent contains no identities                                |
| Public port 22 firewall                  | Expected/observed — public IP port 22 unreachable; private Tailscale path works |
| `Match User`/`ForceCommand` restrictions | Cannot verify until authentication completes                                    |
| Account shell/command restrictions       | Cannot verify until authentication completes                                    |

Primary cause: **the dedicated private key is passphrase-protected and not loaded into the SSH agent,
and it was tested non-interactively.**

## 5. Recommended corrective action

On the authorized workstation, unlock/load the key into the agent. The passphrase must be entered
locally; do not send it through chat, source control, or logs.

```sh
ssh-add --apple-use-keychain ~/.ssh/socbadging_prod_test
ssh-add -l
```

Then retry the non-destructive restricted test:

```sh
ssh -T \
  -i ~/.ssh/socbadging_prod_test \
  -o IdentitiesOnly=yes \
  -o PreferredAuthentications=publickey \
  -o PasswordAuthentication=no \
  socbadging-test@100.126.199.26 \
  'echo SSH_KEY_AUTH_SUCCESS; id; pwd; command -v docker || true'
```

Expected: `SSH_KEY_AUTH_SUCCESS` and the restricted account identity. Do not use `root`,
`marlontayag`, the public website IP, or the unrelated `id_ed25519` key for this account.

If the passphrase is unavailable, do not reset or replace the production key without approval. An
authorized production administrator must either recover the approved passphrase through the secret
store or add a new restricted public key in a reviewed change.

## 6. Administrator-run server inspection commands

These are for an authorized production administrator, not for automatic execution. They are
read-only.

### Effective SSH policy for the restricted user

```sh
sudo sshd -T -C user=socbadging-test,host=localhost,addr=127.0.0.1 | \
  grep -E '^(passwordauthentication|pubkeyauthentication|authenticationmethods|permitrootlogin|allowtcpforwarding|allowagentforwarding|x11forwarding|permittty|permitopen|permittunnel|forcecommand|chrootdirectory|allowusers|denyusers|match)'
```

### Account and key metadata

```sh
getent passwd socbadging-test
sudo passwd -S socbadging-test
sudo chage -l socbadging-test
sudo ls -ld /home/socbadging-test /home/socbadging-test/.ssh
sudo stat -c '%U %G %a %n' \
  /home/socbadging-test \
  /home/socbadging-test/.ssh \
  /home/socbadging-test/.ssh/authorized_keys
sudo ssh-keygen -lf /home/socbadging-test/.ssh/authorized_keys
```

Confirm the authorized_keys fingerprint contains
`SHA256:tiEJDG0Pm1+Y4yTukSzrE5eIw5U+ibntqTbncDjvL+c`. Do not print unrelated keys.

### SSH daemon/Match rules and authentication logs

```sh
sudo grep -RInE '^[[:space:]]*(Match|ForceCommand|PermitOpen|AllowTcpForwarding|AllowAgentForwarding|X11Forwarding|PermitTTY|AllowUsers|DenyUsers|AuthenticationMethods)' \
  /etc/ssh/sshd_config /etc/ssh/sshd_config.d/
sudo journalctl -u ssh -n 100 --no-pager | grep socbadging-test
```

### Tailscale/private network path

```sh
tailscale status
tailscale ping 100.126.199.26
```

The restricted account should retain public-key-only authentication, no password login, no sudo, and
any existing `ForceCommand`/restricted shell/no-forwarding rules. Do not weaken those controls.

## 7. Restricted account privilege verification

**BLOCKED** until authentication succeeds. The intended limitations must be confirmed after login:

- no sudo or administrator group membership;
- restricted shell or `ForceCommand` if configured;
- no arbitrary interactive shell beyond the approved test command set;
- forwarding/tunneling disabled;
- account limited to the production test workflow.

Do not grant sudo or an unrestricted shell to resolve this issue.

## 8. Backup verification status

| Item                                          | Status                       |
| --------------------------------------------- | ---------------------------- |
| Local DB/media backup + checksum verification | PASS (prior local rehearsal) |
| Local signing-key encrypted backup/restore    | PASS (prior local rehearsal) |
| Production DB backup evidence                 | BLOCKED — not provided       |
| Production media backup evidence              | BLOCKED — not provided       |
| Production signing-key backup evidence        | BLOCKED — not provided       |
| Production restore drill evidence             | BLOCKED — not provided       |
| Production backup retention/RPO/RTO owner     | BLOCKED — not confirmed      |

Required before production testing:

1. Latest production DB dump and `SHA256SUMS` verification.
2. Matching media archive and checksum.
3. Separate encrypted signing-key backup and fingerprint match.
4. Last successful restore drill date/result.
5. Retention policy and named backup/restore owner.
6. Approved RPO/RTO for the test window.

## 9. Production testing readiness

| Area                                 | Status                                            |
| ------------------------------------ | ------------------------------------------------- |
| Network path                         | PASS — Tailscale host reachable                   |
| Host identity                        | PASS — host key matches known_hosts               |
| Username                             | PASS — `socbadging-test` accepted                 |
| Public key authorization             | PASS — server accepts dedicated key               |
| Client key unlock/agent              | **BLOCKED** — passphrase-protected key not loaded |
| Restricted-account limitations       | BLOCKED until login                               |
| Production backup evidence           | BLOCKED                                           |
| Production test-account provisioning | BLOCKED until SSH and backups are approved        |
| Production Playwright testing        | BLOCKED                                           |

## 10. Verdict

**SSH connectivity and key authorization: PASS.**  
**Non-interactive authentication: BLOCKED by unloaded passphrase-protected key.**  
**Production acceptance testing: BLOCKED.**

Next action is local and non-destructive: load `~/.ssh/socbadging_prod_test` into the SSH agent with the
approved passphrase, then repeat the single restricted `echo SSH_KEY_AUTH_SUCCESS` test. No production
configuration, account, key, or database change was made.
