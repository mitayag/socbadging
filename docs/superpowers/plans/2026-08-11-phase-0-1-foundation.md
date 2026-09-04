# HAU SOC Badging System Phase 0–1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Dockerized Next.js/MariaDB foundation, secure Administrator/Faculty authentication and role authorization, initial Administrator bootstrap, health endpoint, responsive modern-light shell, and automated authentication/authorization tests without implementing later domain features.

**Architecture:** A strict-TypeScript Next.js App Router modular monolith uses Prisma against MariaDB, Auth.js database sessions, Argon2id passwords, and server-only policy functions. Docker Compose runs the web and database services with persistent volumes; UI routes call server-side identity services and render a role-aware responsive shell.

**Tech Stack:** Next.js, React, TypeScript, Tailwind CSS, Auth.js, Prisma, MariaDB, Zod, Argon2, Vitest, Testing Library, Playwright, Docker Compose, Caddy-ready deployment conventions.

## Global Constraints

- Implement only REQUIREMENTS.md Phase 0 and Phase 1.
- Do not implement Classes, Students, Badges, or Badge Issuance.
- Never bypass server-side authorization.
- Never commit secrets or real credentials.
- Every schema change requires a migration.
- Every protected feature requires authorization tests.
- Preserve the modern light design tokens across every screen.
- Do not label the product “Open Badges certified.”

---

### Task 1: Repository and runtime foundation

**Files:** Create root framework/configuration files, `src/app`, `src/config`, `src/styles`, `src/platform`, `.env.example`, Docker assets, and CI workflow.

**Interfaces:** Produces validated environment configuration, Prisma client access, health response contract, and all quality scripts consumed by later tasks.

- [ ] Add package/runtime configuration and install locked dependencies.
- [ ] Configure strict TypeScript, Next.js, Tailwind, ESLint, Prettier, Vitest, and Playwright.
- [ ] Write a failing health-service test and verify RED.
- [ ] Implement typed environment validation, Prisma singleton, structured logger, and health service/route; verify GREEN.
- [ ] Add `.env.example`, Dockerfile, Compose services/volumes/health checks, ignore files, and CI gates.
- [ ] Add README commands for development, migration, seed, test, build, and Docker operation.

### Task 2: Database schema, migration, and administrator bootstrap

**Files:** Create `prisma/schema.prisma`, first migration SQL, `prisma/seed.ts`, identity bootstrap service, and tests.

**Interfaces:** Produces `User`, `Session`, `PasswordResetToken`, `AuditLog`, and role/status enums plus an idempotent environment-driven `bootstrapAdministrator` service.

- [ ] Write failing bootstrap validation/idempotency tests and verify RED.
- [ ] Define the Phase 1-only Prisma schema and checked-in MariaDB migration.
- [ ] Implement bootstrap validation, Argon2id hashing, sanitized audit entry, and upsert behavior; verify GREEN.
- [ ] Document that bootstrap credentials are required only for the explicit seed command and never stored in source.

### Task 3: Authentication and server-side authorization

**Files:** Create identity schemas/services/policies/auth configuration, login/logout/reset UI/actions, protected layouts, and automated tests.

**Interfaces:** Produces `Actor`, `requireAuthenticated`, `requireRole`, password verification, Auth.js configuration, and safe login/reset workflows.

- [ ] Write failing password/authentication/account-state tests and verify RED.
- [ ] Implement normalized email, Argon2id verification, active-account enforcement, last-login update, and sanitized audit events; verify GREEN.
- [ ] Write failing Administrator/Faculty role-policy tests and verify RED.
- [ ] Implement server-only role policies and protected route boundaries; verify GREEN.
- [ ] Implement database-backed Auth.js sessions, login/logout, and expiring hashed single-use password reset tokens.
- [ ] Add negative role tests proving Faculty cannot access Administrator-only capabilities.

### Task 4: Modern light application shell

**Files:** Create semantic tokens, UI/layout components, authenticated dashboard, role-aware navigation, and component tests.

**Interfaces:** Produces reusable `AppShell`, `Sidebar`, `TopNavigation`, `MobileNavigation`, and role-filtered navigation model.

- [ ] Write failing navigation visibility and accessible shell tests; verify RED.
- [ ] Implement the approved white/cool-slate/navy/academic-blue token system and responsive shell; verify GREEN.
- [ ] Ensure Administrator sees foundation admin navigation while Faculty sees only Dashboard during Phase 1.
- [ ] Add focus, keyboard, reduced-motion, semantic landmarks, and responsive behavior.
- [ ] Perform Browser desktop/mobile rendering and interaction QA against the approved concept.

### Task 5: Integration and release verification

**Files:** Create MariaDB integration helpers/tests and Docker smoke-test script; adjust implementation only through regression tests.

**Interfaces:** Produces repeatable verification commands proving migrations, authentication, authorization, build, and container health.

- [ ] Start MariaDB and apply migrations to a clean database.
- [ ] Run authentication/authorization integration tests against MariaDB.
- [ ] Run lint and fix all errors.
- [ ] Run strict type checking and fix all errors.
- [ ] Run all automated tests and fix all failures.
- [ ] Run the production build and fix all errors.
- [ ] Build/start Docker Compose, wait for health, verify the web health endpoint, persistence configuration, and container states.
- [ ] Capture desktop/mobile screenshots, inspect them against the concept, and remove temporary QA artifacts.
- [ ] Re-run the complete verification gate immediately before reporting status.
