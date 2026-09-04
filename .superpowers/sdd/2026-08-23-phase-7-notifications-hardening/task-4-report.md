# Task 4 Report — SMTP Worker and Mailpit

- Nodemailer 9.0.5 was selected using its official provider-neutral SMTP documentation.
- Added escaped text/HTML issued and revoked templates, failure classification, bounded retry backoff, lease-based claims, claim ownership checks, and a separate worker process with no public port.
- Added a Docker worker target and an opt-in `notifications` Compose profile containing the worker and loopback-only Mailpit UI.
- RED/GREEN: 4 template/retry tests failed before implementation and passed afterward.
- Docker worker image built successfully.
- Real MariaDB + worker + Mailpit smoke: issued and revoked jobs each reached `SENT`, attempt count `1`, with provider message IDs; Mailpit received both expected subjects.
- Review: exact-file self-review completed; independent delegation was not authorized in this session.
