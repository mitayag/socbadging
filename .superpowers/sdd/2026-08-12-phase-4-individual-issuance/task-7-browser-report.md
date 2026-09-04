# Task 7 Browser Acceptance Report

## Environment

- URL: `http://localhost:3000`
- Browser: in-app Browser selected for the inferred local URL
- Desktop viewport supplied by the in-app browser
- Console checks: no warnings or errors on login, Faculty issuance, detail, Administrator class records, or Faculty global filtered records
- The browser API exposed no viewport resizing method; mobile rendering was not simulated with an external fallback. Responsive component/CSS tests and final code review cover the mobile implementation, but a live narrow-viewport screenshot remains a limitation.

## Faculty Flow

- Signed in as the disposable local Faculty account.
- Opened active owned class `CS-P2`, Issued tab.
- Verified `Systems Architect` and `Ada Lovelace` selectors, disabled initial submit, and live confirmation summary after selection.
- Issued successfully and redirected to `/issued/cmspshs78000601mpvo8is0q4?notice=issued`.
- Verified saved credential detail: random 32-character public ID `5RYgK6LWq-YvoFgN73j_dNq5LFxFoFT-`, artwork, achievement, criteria, skills, recipient, issuer, class, dates, status, IDs, JSON download link, and unsigned/Open Badges 3.0-aligned/not-certified wording.
- Submitted the same tuple again. It redirected to the same issuance ID and public ID with `notice=existing`; no duplicate credential was created.
- Searched global issued records for `Ada Lovelace`; the correct snapshot-derived record and filter-preserving export link rendered.

## Administrator Flow

- Signed in as the disposable Administrator.
- Opened the Faculty-owned class Issued tab.
- Verified the existing record and CSV export were visible.
- Verified the Faculty-only `Issue a Badge` region was absent.

## Historical Immutability

- Through the Faculty badge-template UI, changed the source `Systems Architect` description to `UPDATED SOURCE — historical credential must remain unchanged.`
- Reloaded the issued credential detail.
- Verified it still displayed the original snapshotted description `Recognizes strong systems architecture practice.` and original criteria/skills.
- Restored the source template description through the UI after the proof.

## Negative/Remaining Evidence

- Automated authorization tests cover unauthenticated and non-owner Faculty route/detail/export denial; only one usable local Faculty account was available for live browser testing.
- CSV/credential protected response headers and private-data boundaries are covered by route tests. Browser DOM confirmed the links; download payload/header assertions were not duplicated manually.
- Live mobile viewport resizing was unavailable in the selected browser surface. No external browser fallback was used.
