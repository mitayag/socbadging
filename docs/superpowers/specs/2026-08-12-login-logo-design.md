# Login Logo Design

## Goal

Display the supplied HAU School of Computing logo in the login page's navy brand panel, beside the existing “HAU SOC / Badging System” identity.

## Approved Design

- Copy `images/hausoclogo.png` to the public asset directory so Next.js can serve it as a static application asset.
- Render it through `next/image` with descriptive alt text: `HAU School of Computing logo`.
- Group the existing wordmark and logo in a dedicated responsive header row at the top of the brand panel.
- On desktop, keep the wordmark left-aligned and the logo at approximately 170 px, matching the placement indicated in the supplied screenshot.
- On narrow screens, reduce the logo and spacing so the brand panel stays readable without horizontal overflow.
- Preserve the existing modern light login card, navy brand background, typography, and all authentication behavior.

## Accessibility and Performance

- The logo has meaningful alternative text because it communicates institutional identity.
- Explicit image dimensions reserve layout space and prevent layout shift.
- `sizes` communicates the expected rendered width to Next.js image optimization.
- No animation, interaction, or authentication behavior is introduced.

## Testing

- Add a component rendering test that verifies the login page exposes the logo by accessible name and correct public path.
- Run the focused test red before implementation and green afterward.
- Run formatting, lint, type checking, the full automated test suite, and production build.
- Inspect the real login page at desktop and mobile widths for image loading, alignment, overflow, framework overlays, and console errors.

## Requirement Mapping

- NFR accessibility: meaningful alt text and responsive layout.
- NFR reusable/typed frontend: Next.js `Image` with static public asset.
- Design Scheme and Core Screens: modern, academic-professional Login screen.
