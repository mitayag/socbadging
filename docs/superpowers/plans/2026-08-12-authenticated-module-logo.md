# Authenticated Module Logo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the existing HAU School of Computing logo beside the shared sidebar wordmark for both Administrator and Faculty modules.

**Architecture:** Update the reusable `SidebarContent` component once so desktop and mobile instances for both authenticated roles inherit the same branding. Reuse the existing optimized public image and add narrowly scoped responsive CSS.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, CSS, Vitest, Testing Library, Docker Compose.

## Global Constraints

- Reuse `/images/hausoclogo.png`; do not introduce another logo asset or dependency.
- Preserve all authentication, server authorization, navigation, and role behavior.
- Render meaningful alt text: `HAU School of Computing logo`.
- Use approximately 72 px on desktop and 56 px in the mobile navigation drawer so the wordmark remains on one line.
- Preserve the modern light application content and navy sidebar design.
- No schema change or migration is required.

---

### Task 1: Shared Sidebar Logo

**Files:**

- Modify: `src/components/layout/app-shell.test.tsx`
- Modify: `src/components/layout/sidebar-content.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Consumes: `SidebarContent({ actor }: { actor: Actor })` and `/images/hausoclogo.png`.
- Produces: two accessible logo instances in each rendered `AppShell`, one in the desktop sidebar and one in the mobile drawer.

- [ ] **Step 1: Run the clean automated-test baseline**

Run: `npm test`
Expected: all existing tests pass.

- [ ] **Step 2: Write the failing shared-shell test**

Extend `app-shell.test.tsx` to assert that each logo shares a `.brand-row` with its wordmark:

```tsx
expect(screen.getAllByRole("img", { name: "HAU School of Computing logo" })).toHaveLength(2);
```

This catches removal of the image from either desktop or responsive navigation and regression to a separate stacked brand block.

- [ ] **Step 3: Verify RED**

Run: `npm test -- src/components/layout/app-shell.test.tsx`
Expected: FAIL because neither shared sidebar currently renders the logo.

- [ ] **Step 4: Implement the shared logo**

Import `Image` from `next/image` in `sidebar-content.tsx` and add this before the existing wordmark text:

```tsx
<Image
  className="sidebar-logo"
  src="/images/hausoclogo.png"
  alt="HAU School of Computing logo"
  width={92}
  height={92}
  sizes="(max-width: 820px) 72px, 92px"
/>
```

Keep it inside the existing `.brand` block so both shell instances receive it.

- [ ] **Step 5: Add responsive styling**

Center `.sidebar-logo`, keep `height: auto` and `object-fit: contain`, and apply a 72 px width inside `.mobile-menu-panel` without altering navigation spacing or order.

- [ ] **Step 6: Verify GREEN and complete automated gates**

Run: `npm test -- src/components/layout/app-shell.test.tsx`
Expected: PASS.

Run: `npm run format && npm run lint && npm run typecheck && npm run test && npm audit && DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging npm run build`
Expected: all commands exit 0 and the suite contains the new assertion.

- [ ] **Step 7: Rebuild and smoke-test Docker**

Rebuild the existing Compose deployment with its local smoke environment. Verify the health endpoint and that the optimized logo asset returns HTTP 200 from port 3000.

- [ ] **Step 8: Perform browser QA for both roles**

Log in through `http://localhost:3000/login` as the local Administrator and Faculty test accounts. Verify the logo is visible in each authenticated shared shell, the respective role label is correct, navigation remains usable, the console is clean, and screenshots show no overlap or overflow.

- [ ] **Step 9: Report integration status**

Git commits and branch integration are unavailable because the workspace is not a Git repository. Report the exact changed files and requirement mapping directly.
