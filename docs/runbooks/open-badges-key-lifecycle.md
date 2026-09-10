# Open Badges Signing-Key Lifecycle

This runbook is for authorized HAU SOC operators. The application stores and publishes only public
key metadata. Private signing keys must remain outside the repository, database, UI, logs, and
ordinary database/media backups.

## Generate a key

Choose a restricted directory on the Docker host and a stable verification-method URL beneath the
final HTTPS application domain. Never generate a production key on a developer laptop or inside the
repository.

```sh
install -d -m 700 /absolute/secure/path/open-badges
npm run db:generate
./node_modules/.bin/tsx scripts/generate-signing-key.ts \
  --private-key-path /absolute/secure/path/open-badges/key-2026-01.private.json \
  --public-metadata-path /absolute/secure/path/open-badges/key-2026-01.public.json
chmod 600 /absolute/secure/path/open-badges/key-2026-01.private.json
```

The command refuses existing targets and prints paths and the public fingerprint only. Verify the
private file is owned by the deployment operator with mode `0600`.

## Register, mount, and activate

1. Set `APP_URL` and `ISSUER_URL` to final HTTPS values. Choose a key URL such as
   `https://badges.example.edu/api/issuers/hau-soc/keys/key-2026-01` and use the issuer endpoint as
   controller.
2. As an active Administrator, open **Settings → Credential signing**. Register the URLs,
   `Ed25519`, `eddsa-rdfc-2022`, and exact `publicKeyMultibase` and `fingerprint` from the public
   metadata file. Never paste or upload the private file.
3. Configure the deployment secret store:

   ```text
   SIGNER_TOKEN=<unique-long-random-internal-token>
   SIGNING_PRIVATE_KEY_FILE=/absolute/secure/path/open-badges/key-2026-01.private.json
   SIGNING_KEY_ID=https://badges.example.edu/api/issuers/hau-soc/keys/key-2026-01
   SIGNING_PUBLIC_MULTIKEY=<publicKeyMultibase from public metadata>
   SIGNING_KEY_FINGERPRINT=<fingerprint from public metadata>
   SIGNING_CRYPTOSUITE=eddsa-rdfc-2022
   ```

4. Recreate `signer` and `web`. Compose mounts the named secret read-only at
   `/run/secrets/open-badges-signing-key`; the signer has no host-published port. Its root
   filesystem remains read-only, with only a size-limited ephemeral `/tmp` filesystem for runtime
   IPC files.
5. Require signer health to pass, then activate the key with explicit Administrator confirmation.
   Confirm registration and activation audit events.
6. Verify `/api/health` reports only signer status, key ID, and cryptosuite. Verify the public key
   endpoint, then issue and cryptographically verify a controlled credential.

## Rotate or retire

1. Generate and separately back up a fresh key at new paths. Never overwrite or reuse key files or
   verification-method URLs.
2. Register the new public metadata while the old key remains active.
3. Update all `SIGNING_*` values and secret path, recreate the signer, and require healthy matching
   metadata before activation. A mismatch must leave signer and web readiness unavailable.
4. Activate the new key; the transaction retires the prior active key. Verify new issuance and a
   historical credential using the retired public key.
5. Retain retired public metadata indefinitely. Retain private material only under approved
   institutional retention policy.

For planned retirement, activate and verify the replacement first. For suspected compromise,
immediately mark the key **Compromised**, stop issuance, rotate the key and signer token, preserve
audit evidence, and follow institutional incident response. Compromised keys cannot issue or be
reactivated; existing immutable credentials display a trust warning.

## Separate private-key backup and recovery

Private keys are excluded from MariaDB/media backups. Keep an encrypted, access-logged copy in an
approved secrets vault or offline encrypted medium with dual-control access. Record public
fingerprint, key ID, dates, custodian, and destruction policy without recording private material.

For recovery, restore to a restricted temporary path, enforce mode `0600`, compare the derived
public key/fingerprint with registered metadata, and start the signer in isolation. Return it to
service only after health and controlled proof verification pass. Remove temporary recovery copies
under institutional policy.
