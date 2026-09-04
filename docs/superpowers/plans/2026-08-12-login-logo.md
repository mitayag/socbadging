# Login Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the supplied HAU School of Computing logo to the login page brand header with responsive, accessible rendering.

**Architecture:** Serve a copied static PNG from `public/images` and render it with Next.js `Image` inside a small responsive brand-header layout. Authentication logic remains unchanged.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS, Vitest, Testing Library.

## Global Constraints

- Preserve the modern light design tokens and existing navy login brand panel.
- Use meaningful alt text and prevent horizontal overflow at mobile widths.
- Do not modify authentication behavior or introduce dependencies.
- Map the result to the Login screen design and accessibility/responsiveness non-functional requirements.

---

### Task 1: Login Brand Logo

**Files:**

- Create: `public/images/hausoclogo.png`
- Create: `src/app/login/page.test.tsx`
- Modify: `src/app/login/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: source artwork at `images/hausoclogo.png`.
- Produces: an accessible image at `/images/hausoclogo.png` in the login brand header.

- [ ] **Step 1: Establish a clean baseline**

Run: `npm test`
Expected: the existing suite passes with zero failures.

- [ ] **Step 2: Write the failing rendering test**

Render `LoginPage`, locate `getByRole("img", { name: "HAU School of Computing logo" })`, and assert its `src` contains `/images/hausoclogo.png`.

- [ ] **Step 3: Run the focused test to verify RED**

Run: `npm test -- src/app/login/page.test.tsx`
Expected: FAIL because the login page has no accessible logo image.

- [ ] **Step 4: Add the public asset and minimal UI implementation**

Copy the supplied artwork to `public/images/hausoclogo.png`. Import `Image` from `next/image`, place it beside the existing wordmark in `.auth-brand-header`, and render it with width and height `180`, the approved alt text, and responsive `sizes`.

- [ ] **Step 5: Add responsive styling**

Style `.auth-brand-header` as a spaced flex row, constrain `.auth-logo` to `clamp(120px, 14vw, 180px)`, retain its square aspect ratio, and reduce its maximum width at the existing mobile breakpoint.

- [ ] **Step 6: Run focused and full automated verification**

Run: `npm test -- src/app/login/page.test.tsx`
Expected: PASS.

Run: `npm run format && npm run lint && npm run typecheck && npm run test && DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging npm run build`
Expected: all commands exit 0.

- [ ] **Step 7: Perform browser QA**

Open `http://localhost:3000/login`, verify the page identity, meaningful content, loaded logo, clean console, no framework overlay, desktop layout, and a mobile viewport without overflow. Capture screenshots outside source.

- [ ] **Step 8: Commit**

Git commits are skipped because this workspace is not a Git repository. Report the changed files directly.
