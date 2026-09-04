# Administrator-Managed Departments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace free-text faculty departments with administrator-managed department records and consistent dropdowns.

**Architecture:** Add a normalized `Department` entity related to `FacultyProfile`, migrate existing text values without loss, and expose department operations through a server-only service. Existing Server Actions call that service; Server Components load options and render native selects.

**Tech Stack:** Next.js 16 App Router, strict TypeScript, Prisma 7, MariaDB 11.8, Vitest, Docker Compose.

## Global Constraints

- Only administrators may add, rename, archive, or reopen departments.
- New assignments accept active departments only; an archived current assignment may be retained.
- No department deletion.
- Every department mutation writes an audit record transactionally.
- Every schema change has a checked-in migration.
- Preserve the modern light design tokens and accessible focus states.

---

### Task 1: Department schema and migration

**Files:**

- Modify: `prisma/schema.prisma`
- Create: `prisma/migrations/20260811230000_department_management/migration.sql`

**Interfaces:**

- Produces `DepartmentStatus`, `Department`, and `FacultyProfile.departmentId`/`.department`.

- [ ] Add a failing schema expectation through Prisma client generation before the model exists.
- [ ] Add the enum/model/relation and a migration that creates departments from distinct legacy text, links profiles, and removes the text column.
- [ ] Run `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging npm run db:generate` and confirm generation succeeds.

### Task 2: Department domain service and authorization

**Files:**

- Create: `src/modules/departments/services/department-service.ts`
- Create: `src/modules/departments/services/department-service.test.ts`

**Interfaces:**

- Produces `normalizeDepartmentName(name)`, `listDepartments(actor, includeArchived)`, `createDepartment(actor, name)`, `renameDepartment(actor, id, name)`, `setDepartmentStatus(actor, id, status)`, and `validateDepartmentAssignment(actor, departmentId, currentDepartmentId)`.

- [ ] Write tests proving normalization collapses whitespace/case and faculty cannot mutate departments.
- [ ] Run the focused test and observe the missing-module failure.
- [ ] Implement Zod validation, administrator guards, active/current assignment rules, Prisma transactions, and audit records.
- [ ] Run the focused tests and confirm they pass.

### Task 3: Faculty service migration

**Files:**

- Modify: `src/modules/faculty/services/faculty-service.ts`
- Modify: `src/modules/faculty/services/faculty-service.test.ts`
- Modify: `src/app/faculty/actions.ts`
- Modify: `src/app/profile/actions.ts`

**Interfaces:**

- Faculty inputs use `departmentId: string | ""` rather than `department: string`.

- [ ] Add tests for rejecting unauthorized archived assignments before database writes.
- [ ] Update profile validation and Prisma relation writes to connect/disconnect by department ID.
- [ ] Include department records in faculty queries.
- [ ] Update Server Action field extraction to submit `departmentId`.
- [ ] Run faculty and department service tests.

### Task 4: Administrator management and dropdown UI

**Files:**

- Create: `src/app/faculty/department-actions.ts`
- Create: `src/components/faculty/department-select.tsx`
- Create: `src/components/faculty/department-select.test.tsx`
- Modify: `src/app/faculty/page.tsx`
- Modify: `src/app/profile/page.tsx`
- Modify: `src/app/globals.css`

**Interfaces:**

- `DepartmentSelect({ departments, currentDepartmentId, name })` renders active options plus an archived current option.

- [ ] Write a failing component test for active options, “No department,” and archived-current visibility.
- [ ] Implement the reusable native select.
- [ ] Add administrator actions for create, rename, archive, and reopen.
- [ ] Add the Manage Departments panel and replace all department inputs.
- [ ] Run component and service tests.

### Task 5: Verification and deployment

**Files:**

- Modify only files required by failures discovered during verification.

- [ ] Run `npm run format`, `npm run lint`, `npm run typecheck`, `npm run test`, `npm audit`, and the production build.
- [ ] Rebuild Docker Compose, apply the migration, and confirm all services and `/api/health` are healthy.
- [ ] Browser-test administrator department creation, dropdown appearance, faculty assignment, archived-current behavior, focus visibility, responsive layout, and console health.
- [ ] Report changed files and map the completed work to FR-002, FR-003, FR-020, and accessibility/migration NFRs.
