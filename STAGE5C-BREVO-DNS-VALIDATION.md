# Stage 5C Brevo DNS Validation

**Date:** 4 November 2026  
**External verification:** BLOCKED  
**DNS modified:** No

## 1. Configured sender domain

The local `.env` does not configure a production Brevo sender. The repository fallback sender
is `HAU SOC Badging System <badges@hausoc.org>`.

Because no approved production sending domain was supplied, the Brevo sender approval and
mailbox-level delivery cannot be verified. The example domain below was inspected as a
public-DNS reference only; it must not be assumed to be the production domain.

## 2. Public DNS observations for `hausoc.org`

| Record                                 | Observed                                                   |
| -------------------------------------- | ---------------------------------------------------------- |
| A                                      | `122.3.149.244`                                            |
| NS                                     | `dns1.registrar-servers.com`, `dns2.registrar-servers.com` |
| MX                                     | None returned                                              |
| SPF TXT (`hausoc.org`)                 | None returned                                              |
| DMARC (`_dmarc.hausoc.org`)            | None returned                                              |
| DKIM (`mail._domainkey.hausoc.org`)    | None returned                                              |
| DKIM (`brevo._domainkey.hausoc.org`)   | None returned                                              |
| DKIM (`default._domainkey.hausoc.org`) | None returned                                              |

The domain resolves, but no SPF, DMARC, DKIM, or MX records were visible in the public DNS
response at validation time. This does not establish Brevo sender approval; that requires the
Brevo account and the exact DNS records assigned to the domain.

## 3. Required manual configuration (pending approval)

1. Confirm the approved production sending domain and sender identity.
2. Add Brevo's domain-verification record(s).
3. Add the SPF TXT record containing Brevo's assigned include.
4. Add the DKIM record(s) supplied by Brevo for the verified domain/selector.
5. Add a DMARC policy at `_dmarc` with an approved reporting mailbox and policy.
6. Verify DNS alignment between the From address and the authenticated domain.
7. Complete Brevo sender/domain approval in the provider console.
8. Prove domain authentication with a controlled allowlisted recipient.
9. Update `BREVO_SENDER` to the approved sender and set the matching `EXTERNAL_EMAIL_ALLOWLIST`.

Do not alter DNS records without explicit approval. No DNS changes were made in Stage 5C.

## 4. Verdict

**Brevo DNS/domain authentication: BLOCKED — not externally verified.** The example domain
lacks visible SPF/DKIM/DMARC/MX records and no production domain or Brevo account access was
provided.
