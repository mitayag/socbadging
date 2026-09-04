# Authenticated Module Logo Design

## Goal

Display the HAU School of Computing logo consistently throughout the authenticated Administrator and Faculty modules.

## Approved Placement

- Add the existing public logo, `/images/hausoclogo.png`, to the right of the “HAU SOC / Badging System” wordmark in the shared sidebar brand area.
- Implement the change once in `SidebarContent`, which is rendered by both the Administrator and Faculty application shells.
- The same shared component also appears inside the responsive mobile navigation drawer, so both desktop and mobile navigation receive identical institutional branding.

## Layout and Styling

- Render the logo through Next.js `Image` with explicit intrinsic dimensions and the alt text `HAU School of Computing logo`.
- Arrange the wordmark and logo in one horizontally balanced row, with the wordmark on the left and logo on the right.
- Use an approximately 72 px rendered width on desktop and 56 px within the mobile navigation drawer so the wordmark remains on one line at the existing sidebar width.
- Preserve the navy sidebar background, existing typography, navigation order, footer, light application content surfaces, and current responsive behavior.
- Keep the logo proportional and prevent overflow through `height: auto` and `object-fit: contain`.

## Accessibility and Behavior

- The logo receives meaningful alternative text because it conveys institutional identity.
- No navigation, authentication, role authorization, or data behavior changes.
- Administrator and Faculty receive the same shared logo treatment.

## Testing and Verification

- Extend the application-shell test to verify that both desktop and mobile sidebar instances expose the institutional logo.
- Verify the test fails before production code changes and passes afterward.
- Run formatting, lint, type checking, the full automated test suite, dependency audit, and production build.
- Rebuild Docker and visually inspect authenticated Administrator and Faculty shells on port 3000, including the mobile drawer when viewport tooling permits.

## Requirement Mapping

- FR-001: authenticated Administrator and Faculty application surfaces.
- FR-002: shared role-aware shell remains unchanged functionally.
- Design Scheme — Application Shell: consistent academic-professional sidebar branding.
- NFR accessibility and responsiveness: meaningful alt text and responsive sizing.

## Out of Scope

- No changes to permissions, role-specific navigation items, authentication, profile content, or application features.
- No new logo asset or database change; the existing public logo is reused.
