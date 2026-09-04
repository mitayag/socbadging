# Faculty Soft Delete and Title Case Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Administrator-only faculty soft deletion with immediate access revocation and auditing, and convert current short UI labels and controls to Title Case.

**Architecture:** Extend the existing user lifecycle with `DELETED` and `deletedAt`, then implement deletion in the existing faculty service transaction boundary and expose it through the existing server-action/page pattern. Keep authorization exclusively on the server, preserve all related records, and treat the UI copy pass as presentation-only changes covered by focused component tests and browser verification.

**Tech Stack:** Next.js 16.3 App Router, React 19, TypeScript 6, Prisma 7, MariaDB, Vitest, Testing Library, Docker Compose

## Global Constraints

- Map work to FR-002, FR-003, and FR-020.
- Every schema change has a checked-in MariaDB migration.
- Only Administrators can delete Faculty accounts; authorization is enforced before database access.
- Deletion never physically removes the user or related classes, rosters, badge templates, issued credentials, or audit records.
- Deletion invalidates sessions and password-reset tokens and writes `faculty.deleted` in the same transaction.
- Deleted faculty cannot be edited, activated, suspended, reset, authenticated, or restored through this change.
- User-facing short labels and controls use Title Case; prose and complete sentences remain sentence case.
- Preserve the modern light design tokens and accessible focus/keyboard behavior.
- Follow strict test-driven development: verify each new behavior test fails before production changes.

---

## File Structure

- `prisma/schema.prisma` — add the deleted lifecycle state and timestamp.
- `prisma/migrations/20260811233000_faculty_soft_delete/migration.sql` — migrate the MariaDB enum and add `deleted_at`.
- `src/modules/faculty/services/faculty-service.ts` — own list semantics, target guards, deletion transaction, and deleted-target restrictions.
- `src/modules/faculty/services/faculty-service.test.ts` — authorization and service interaction coverage using hoisted Prisma/Argon2 mocks.
- `src/modules/identity/services/authenticate.ts` — widen the repository status type while continuing to permit only active accounts.
- `src/modules/identity/services/authenticate.test.ts` — prove deleted credentials are rejected.
- `src/modules/identity/services/current-actor.test.ts` — prove a deleted user cannot reuse an existing session.
- `src/app/faculty/actions.ts` — add the authenticated Administrator delete server action.
- `src/components/faculty/delete-faculty-control.tsx` — isolated confirmation disclosure and form presentation.
- `src/components/faculty/delete-faculty-control.test.tsx` — confirmation rendering and action payload coverage.
- `src/app/faculty/page.tsx` — deleted filter/row rendering, action availability, and Faculty Management Title Case copy.
- Current `src/app/**/*.tsx` and `src/components/**/*.tsx` UI files — presentation-only Title Case copy pass.
- `src/components/layout/app-shell.test.tsx`, `src/components/layout/navigation.test.ts`, and focused new/updated rendering tests — prevent copy regressions.

### Task 1: Persist the Deleted Faculty Lifecycle State

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260811233000_faculty_soft_delete/migration.sql`

**Interfaces:**

- Produces: Prisma `UserStatus` value `DELETED` and nullable `User.deletedAt: Date | null` mapped to `users.deleted_at`.
- Consumes: Existing `users.status` MariaDB enum with `ACTIVE` and `SUSPENDED`.

- [ ] **Step 1: Add a schema assertion that initially fails**

Create a temporary shell assertion by running:

```bash
rg -n '^  DELETED$|deletedAt.*@map\("deleted_at"\)' prisma/schema.prisma
```

Expected: no matches and a non-zero exit status because neither schema declaration exists.

- [ ] **Step 2: Add the Prisma declarations**

Change the enum and user scalar to:

```prisma
enum UserStatus {
  ACTIVE
  SUSPENDED
  DELETED
}

model User {
  // existing fields remain unchanged
  deletedAt DateTime? @map("deleted_at")
}
```

- [ ] **Step 3: Add the MariaDB migration**

Create `prisma/migrations/20260811233000_faculty_soft_delete/migration.sql` containing:

```sql
ALTER TABLE `users`
  MODIFY COLUMN `status` ENUM('ACTIVE', 'SUSPENDED', 'DELETED') NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN `deleted_at` DATETIME(3) NULL;
```

- [ ] **Step 4: Generate and validate the Prisma client**

Run:

```bash
npm run db:generate
npx prisma validate
```

Expected: both commands exit 0 and generated types include `DELETED` and `deletedAt`.

### Task 2: Define and Test Faculty Soft-Deletion Rules

**Files:**

- Modify: `src/modules/faculty/services/faculty-service.test.ts`
- Modify: `src/modules/faculty/services/faculty-service.ts`

**Interfaces:**

- Produces: `deleteFaculty(actor: Actor, userId: string): Promise<User>`.
- Produces: `FacultyListStatus = "ACTIVE" | "SUSPENDED" | "DELETED"` used by the page filter.
- Consumes: Prisma transaction client methods `user.findFirst`, `user.update`, `session.deleteMany`, `passwordResetToken.deleteMany`, and `auditLog.create`.

- [ ] **Step 1: Add hoisted dependency mocks and failing authorization tests**

Mock `@/platform/db/prisma` and `argon2` before importing the service. Add tests equivalent to:

```ts
it("rejects faculty deletion by a Faculty actor before database access", async () => {
  await expect(deleteFaculty(faculty, "target-1")).rejects.toBeInstanceOf(AuthorizationError);
  expect(prisma.$transaction).not.toHaveBeenCalled();
});

it("includes deleted faculty only when explicitly filtered", async () => {
  prisma.user.findMany.mockResolvedValue([]);
  await listFaculty(admin, "", "DELETED");
  expect(prisma.user.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ role: "FACULTY", status: "DELETED" }),
    }),
  );
});
```

- [ ] **Step 2: Run the faculty service tests and verify RED**

Run:

```bash
npm test -- src/modules/faculty/services/faculty-service.test.ts
```

Expected: FAIL because `deleteFaculty` and `DELETED` list status support do not exist.

- [ ] **Step 3: Implement the list type and soft-delete transaction**

Add:

```ts
export type FacultyListStatus = "ACTIVE" | "SUSPENDED" | "DELETED";

export async function deleteFaculty(actor: Actor, userId: string) {
  requireRole(actor, "ADMIN");
  return prisma.$transaction(async (tx) => {
    const current = await tx.user.findFirst({
      where: { id: userId, role: "FACULTY", status: { not: "DELETED" } },
      select: { id: true, status: true },
    });
    if (!current) throw new Error("Faculty account is unavailable for deletion");
    const deletedAt = new Date();
    const user = await tx.user.update({
      where: { id: current.id },
      data: { status: "DELETED", deletedAt, sessionVersion: { increment: 1 } },
    });
    await tx.session.deleteMany({ where: { userId: current.id } });
    await tx.passwordResetToken.deleteMany({ where: { userId: current.id } });
    await tx.auditLog.create({
      data: {
        actorUserId: actor.id,
        action: "faculty.deleted",
        entityType: "User",
        entityId: current.id,
        contextJson: { previousStatus: current.status },
      },
    });
    return user;
  });
}
```

Change `listFaculty` to accept `FacultyListStatus`; when `status` is absent, use `{ in: ["ACTIVE", "SUSPENDED"] }` so deleted accounts are excluded by default.

- [ ] **Step 4: Add failing tests for transaction effects and invalid targets**

Add tests asserting an Administrator deletion:

```ts
expect(tx.user.update).toHaveBeenCalledWith(
  expect.objectContaining({
    where: { id: "target-1" },
    data: expect.objectContaining({ status: "DELETED", deletedAt: expect.any(Date) }),
  }),
);
expect(tx.session.deleteMany).toHaveBeenCalledWith({ where: { userId: "target-1" } });
expect(tx.passwordResetToken.deleteMany).toHaveBeenCalledWith({ where: { userId: "target-1" } });
expect(tx.auditLog.create).toHaveBeenCalledWith({
  data: expect.objectContaining({
    actorUserId: admin.id,
    action: "faculty.deleted",
    entityId: "target-1",
    contextJson: { previousStatus: "ACTIVE" },
  }),
});
```

Add parameterized cases where `findFirst` returns null for missing, Administrator, or already-deleted targets and assert that no update, session deletion, token deletion, or audit insert occurs.

- [ ] **Step 5: Restrict edit, status, and reset operations to non-deleted Faculty targets**

Use guarded lookups/updates whose predicates include `role: "FACULTY"` and `status: { not: "DELETED" }` in `editFaculty`, `setFacultyStatus`, and `resetFacultyAccess`. Add tests that make the guard return no target and assert each operation rejects without an audit entry.

- [ ] **Step 6: Run the focused service tests and verify GREEN**

Run:

```bash
npm test -- src/modules/faculty/services/faculty-service.test.ts
```

Expected: all faculty service tests pass with no warnings.

### Task 3: Prove Deleted Accounts Cannot Authenticate or Reuse Sessions

**Files:**

- Modify: `src/modules/identity/services/authenticate.ts`
- Modify: `src/modules/identity/services/authenticate.test.ts`
- Create: `src/modules/identity/services/current-actor.test.ts`

**Interfaces:**

- Consumes: `AuthenticationRepository.findByNormalizedEmail` returning status `ACTIVE | SUSPENDED | DELETED`.
- Produces: unchanged `authenticateWithPassword(...): Promise<Actor | null>` and `getCurrentActor(): Promise<Actor | null>` behavior permitting only active users.

- [ ] **Step 1: Add a failing deleted-password test**

Copy the suspended-account test with `status: "DELETED"` and assert a correct password returns `null`, records a failed attempt, and never records successful login.

- [ ] **Step 2: Run the authentication test and verify RED**

Run:

```bash
npm test -- src/modules/identity/services/authenticate.test.ts
```

Expected: TypeScript/Vitest failure because `AuthenticationUser.status` does not accept `DELETED`.

- [ ] **Step 3: Widen the internal status type without weakening the active-only check**

Change:

```ts
type AccountStatus = "ACTIVE" | "SUSPENDED" | "DELETED";
```

Keep `user.status === "ACTIVE"` as the sole permitted condition.

- [ ] **Step 4: Add a current-session regression test**

Mock cookies and Prisma, return an unexpired session whose included user has `status: "DELETED"`, and assert:

```ts
await expect(getCurrentActor()).resolves.toBeNull();
```

Also retain/cover an active-session case returning the expected public actor.

- [ ] **Step 5: Run both identity tests and verify GREEN**

Run:

```bash
npm test -- src/modules/identity/services/authenticate.test.ts src/modules/identity/services/current-actor.test.ts
```

Expected: both test files pass.

### Task 4: Add the Administrator Delete Action and Confirmation UI

**Files:**

- Modify: `src/app/faculty/actions.ts`
- Create: `src/components/faculty/delete-faculty-control.tsx`
- Create: `src/components/faculty/delete-faculty-control.test.tsx`
- Modify: `src/app/faculty/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- Produces: `deleteFacultyAction(form: FormData): Promise<never | void>`.
- Produces: `DeleteFacultyControl({ userId, facultyName, action })` presentation component.
- Consumes: `deleteFaculty(actor, userId)` and `item.deletedAt`.

- [ ] **Step 1: Write the failing confirmation component test**

Render the component and assert it exposes `Delete Faculty`, preservation guidance, a hidden `userId`, and `Confirm Delete Faculty`. Verify the confirmation action is keyboard reachable and the faculty name is part of the accessible text.

- [ ] **Step 2: Run the component test and verify RED**

Run:

```bash
npm test -- src/components/faculty/delete-faculty-control.test.tsx
```

Expected: FAIL because the component does not exist.

- [ ] **Step 3: Implement the focused confirmation component**

Use semantic `<details>`, `<summary>`, and `<form>` elements. Include:

```tsx
<details className="delete-faculty-control">
  <summary className="danger-button">Delete Faculty</summary>
  <div className="delete-confirmation">
    <p>
      Delete {facultyName}? Access will end immediately. Related classes and historical records will
      remain preserved.
    </p>
    <form action={action}>
      <input type="hidden" name="userId" value={userId} />
      <button className="danger-button">Confirm Delete Faculty</button>
    </form>
  </div>
</details>
```

- [ ] **Step 4: Add the server action**

Add `deleteFacultyAction`, call the existing `admin()` helper before the service, parse `userId`, call `deleteFaculty`, revalidate `/faculty`, and redirect to `/faculty?notice=deleted`.

- [ ] **Step 5: Integrate deleted filtering and row behavior**

Accept `DELETED` in `searchParams.status`, add a `DELETED` option, show `Deleted` and a formatted deletion timestamp for deleted rows, render the confirmation component only for active/suspended rows, and render no edit/status/reset controls for deleted rows.

- [ ] **Step 6: Add modern-light deleted-state styles**

Reuse existing red danger tokens. Add only focused layout styles for `.delete-faculty-control` and `.delete-confirmation`, including visible keyboard focus and responsive wrapping; do not introduce new colors outside the design tokens.

- [ ] **Step 7: Run focused rendering and faculty tests**

Run:

```bash
npm test -- src/components/faculty/delete-faculty-control.test.tsx src/modules/faculty/services/faculty-service.test.ts
```

Expected: all focused tests pass.

### Task 5: Apply and Lock Down Title Case UI Copy

**Files:**

- Modify: `src/app/login/page.tsx`
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/classes/page.tsx`
- Modify: `src/app/classes/[classId]/students/page.tsx`
- Modify: `src/app/classes/[classId]/badges/page.tsx`
- Modify: `src/app/faculty/page.tsx`
- Modify: `src/components/auth/login-form.tsx`
- Modify: `src/components/auth/sign-out-button.tsx`
- Modify: `src/components/faculty/department-select.tsx`
- Modify: `src/components/rosters/import-wizard.tsx`
- Modify: relevant existing component tests

**Interfaces:**

- Produces: presentation-only copy changes; no route, form field, server action, or data interface changes.
- Consumes: approved Title Case rules from the design specification.

- [ ] **Step 1: Add failing copy assertions**

Update focused rendering tests to expect key labels including:

```text
Welcome Back
Institutional Email
Sign Out
Faculty Profile
Your Professional Details
Save Profile
Manage Departments
Department Name
Add Department
Create Faculty Account
Full Name
Temporary Password
Create Faculty
Save Details
Reset Access
Create Class
Course Code
Class Title
Academic Year
Add One Student
Student Number
First Name
Last Name
Add Student
Upload and Map
Map Columns
Validate Preview
Validation Preview
Download Error Report
Create Badge Template
Alignment Name
Expiration Days (Optional)
Badge Artwork (Optional Replacement)
Edit Template
Save Badge
All Statuses
All Enrollments
No Department
```

Keep sentence assertions unchanged for explanatory prose and empty states.

- [ ] **Step 2: Run the affected rendering tests and verify RED**

Run:

```bash
npm test -- src/components
```

Expected: copy assertions fail against current sentence-style labels.

- [ ] **Step 3: Change only short labels and controls**

Apply the approved copy exactly. Preserve acronyms (`CSV`, `XLSX`, `URL`, `ID`) and leave descriptions, notices, validation messages, placeholders, and empty-state sentences in sentence case.

- [ ] **Step 4: Search for remaining sentence-style UI labels**

Run:

```bash
rg -n 'Manage departments|Create faculty account|Full name|Temporary password|Save details|Reset access|Create class|Course code|Class title|Academic year|Add one student|Student number|First name|Last name|Add student|Upload and map|Map columns|Validate preview|Validation preview|Download error report|Create badge template|Alignment name|Expiration days \(optional\)|Edit template|Save badge|All statuses|All enrollments|No department|Welcome back|Institutional email|Sign out|Save profile' src/app src/components
```

Expected: no matches in user-facing JSX text. Matches in full explanatory sentences are reviewed manually and retained only when grammatically appropriate.

- [ ] **Step 5: Run component tests and verify GREEN**

Run:

```bash
npm test -- src/components
```

Expected: all component tests pass.

### Task 6: Full Verification, Migration Smoke Test, and Browser QA

**Files:**

- Modify only if verification exposes a defect: files already listed in Tasks 1–5.

**Interfaces:**

- Consumes: completed schema, service, action, UI, and tests.
- Produces: evidence that FR-002, FR-003, FR-020 and the UI/accessibility constraints pass together.

- [ ] **Step 1: Format and run the complete local quality suite**

Run:

```bash
npm run format:write
npm run format
npm run lint
npm run typecheck
npm run test
npm audit
DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging npm run build
```

Expected: formatting, lint, type checking, tests, audit, and production build all exit 0. Fix any failure with a reproducing test before changing behavior.

- [ ] **Step 2: Rebuild and migrate the Docker stack**

Run the repository's documented Docker Compose environment with `docker compose up --build -d --wait`, then inspect `docker compose ps`, migration logs, and web logs.

Expected: database, migration, media initialization, and web services are healthy; the new migration is applied once.

- [ ] **Step 3: Verify the health endpoint**

Run:

```bash
curl -sS http://127.0.0.1:3000/api/health
```

Expected: HTTP success JSON reporting healthy application/database state.

- [ ] **Step 4: Perform browser-based Administrator deletion QA**

Using a disposable Faculty account:

1. Sign in as Administrator and open Faculty Management.
2. Confirm Title Case labels and visible focus/caret states.
3. Create or identify a disposable Faculty account.
4. Open `Delete Faculty`, confirm the preservation warning, and submit.
5. Confirm the account disappears from the default list.
6. Filter by `DELETED`; confirm the row and deletion timestamp appear with no edit/status/reset/delete controls.
7. Attempt login with the deleted Faculty credentials and confirm access is rejected.

Expected: every step matches the design without console errors.

- [ ] **Step 5: Perform responsive and keyboard QA**

Check Faculty Management at desktop and mobile widths. Tab through search, filters, disclosures, forms, and deletion confirmation. Confirm no horizontal clipping, a clear focus indicator, readable red state contrast, and retained modern-light spacing/tokens.

- [ ] **Step 6: Report exact scope and requirement coverage**

List every created/changed file, commands and pass results, migration name, browser scenarios, requirements satisfied (`FR-002`, `FR-003`, `FR-020`), and any remaining limitations (no restore workflow). Do not claim completion unless all verification steps pass.
