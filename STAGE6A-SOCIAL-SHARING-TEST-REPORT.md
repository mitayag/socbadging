# Stage 6A Social Sharing Test Report

**Date:** 22 November 2026  
**Production deployment of Stage 6A changes:** Not performed

## 1. Sharing features

Public credential and student credential-detail pages support:

- copy official public verification URL;
- native Web Share when available;
- LinkedIn post sharing;
- LinkedIn **Licenses & Certifications** add-to-profile for active credentials;
- Facebook sharing;
- X sharing;
- email sharing;
- QR code display and download;
- badge image download;
- public credential page verification link.

Every share action directs viewers to the official `/credentials/:publicId` page. No social account
is posted to automatically.

## 2. LinkedIn certification details

The add-to-profile link carries only public credential information:

- credential name;
- issuer name;
- issuance year/month;
- canonical public verification URL;
- opaque public credential ID.

It is omitted for revoked/expired credentials and when sharing is disabled.

## 3. Public preview metadata

The public credential page generates:

- `og:title`, `og:description`, `og:url`, `og:site_name`, `og:image`;
- Twitter summary-large-image metadata;
- canonical verification URL.

It does not include recipient email, student number, class roster, private records, or internal
issuance identifiers.

When global sharing is disabled, social preview metadata is removed and the page is marked
`noindex, nofollow`; the public verification record remains available for authenticity checks.

## 4. Privacy controls and limitations

- Students choose whether and where to share; nothing is auto-published.
- The Administrator can disable public sharing globally.
- Per-credential hiding of the public verification URL is not supported by the immutable credential
  architecture. Enabling that would require a reviewed schema/feature change.
- Revoked/expired status remains visible through any copied or previously shared verification URL.

## 5. Tests

| Test                                                | Result    |
| --------------------------------------------------- | --------- |
| Share-control links, encoding, noopener/noreferrer  | PASS      |
| LinkedIn certification add-to-profile parameters    | PASS      |
| Revoked credential omits LinkedIn certification add | PASS      |
| QR display/download                                 | PASS      |
| Clipboard success/failure and native share behavior | PASS      |
| Sharing disabled removes controls                   | PASS      |
| Public Open Graph metadata is privacy-safe          | PASS      |
| Sharing-disabled metadata is suppressed/noindex     | PASS      |
| Stage 6A Playwright desktop + mobile                | 4 passed  |
| Phase 8 Playwright regression desktop + mobile      | 16 passed |

Combined Playwright Stage 6A + Phase 8: **20 passed**.

## 6. Verdict

**Social sharing implementation and local tests: PASS.**  
**Production activation: PENDING** until the Stage 6A code is deployed and a controlled pilot is
authorized. No production sharing/social publishing or live email occurred during testing.
