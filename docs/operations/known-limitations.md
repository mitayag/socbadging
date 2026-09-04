# Known Limitations

- Credential JSON-LD is unsigned and Open Badges 3.0-aligned. The system is not Open Badges certified and does not yet provide cryptographic proof, conformance evidence, or external-wallet interoperability. Those are Phase 8 concerns.
- Students do not have accounts or an authenticated portal in the MVP. They use the public verification link received by email or shared by Faculty; a student portal is future scope.
- Email is asynchronous and depends on a separately running worker and configured SMTP provider. Issuance/revocation remains successful during an outage; delivery can remain Pending, Retry Scheduled, or Failed until recovery or Administrator retry.
- Mailpit is a development inbox, not a production mail provider. Production deliverability, DNS records, sender reputation, suppression handling, and provider policies remain deployment responsibilities.
- Local Docker-volume media storage is the MVP default. S3-compatible object storage is future P1 work.
- Evidence attachments and basic issuance analytics remain unimplemented P1 items.
- HTTPS termination/proxy deployment is documented but external to the application Compose stack.
