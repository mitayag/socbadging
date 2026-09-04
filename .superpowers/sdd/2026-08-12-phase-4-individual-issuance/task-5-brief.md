# Task 5 Brief — Server Action and Protected Export Routes

## Context

Connect the completed issuance services to server boundaries only. Read `AGENTS.md`, `REQUIREMENTS.md`, the approved Phase 4 design/plan, authentication/session helpers, route error conventions, current class actions, Task 3 issuance service, and Task 4 query/CSV services before editing. Do not build pages/components/navigation.

## Files

- Create `src/app/classes/[classId]/issued/actions.ts`
- Create `src/app/api/classes/[classId]/issued/export/route.ts`
- Create `src/app/api/issued/export/route.ts`
- Create `src/app/api/issued/[issuanceId]/credential/route.ts`
- Create `src/app/api/issued/issuance-routes.test.ts`
- Add focused action tests in the project’s established location/style.
- Modify small shared route-error/query helpers only if essential and document them.

## Faculty-Only Action

- `issueBadgeAction(formData)` obtains the current actor server-side and requires Faculty before mutation.
- Validate `classId`, `badgeTemplateId`, and `studentId` with strict Zod constraints.
- Call only `issueBadge`; do not reproduce authorization or persistence in the action.
- Revalidate relevant class/global issuance paths after success/idempotent result.
- Redirect to `/issued/{issuanceId}?notice=issued|existing`, using only safe service output.
- Tests must prove unauthenticated/Admin denial before service call, malformed input rejection, exact service input, safe redirect, and revalidation behavior.

## Protected Downloads

- Global CSV: authenticated Administrator or Faculty, with role scope delegated to `listIssuanceExportRows`.
- Class CSV: authenticated owner Faculty or Administrator according to approved read policy, but must preserve class scoping through filters and never broaden access. Use domain authorization, not client parameters alone.
- Credential JSON: authenticated Administrator or owning Faculty via `getIssuanceDetail`.
- Successful CSV responses: `text/csv; charset=utf-8`, private `no-store`, attachment filename derived from safe constants/validated IDs.
- Successful credential response: `application/ld+json`, private `no-store`, attachment filename derived only from the stored safe public ID.
- Parse filters/query parameters once and pass only normalized/validated values to domain services.
- Authorization/not-found failures return safe 401/403/404 JSON according to existing conventions; denied responses must have no attachment header and no protected content.
- Never expose recipient snapshot/private email through the credential JSON route beyond the already-built public credential object.

## Tests

Prove RED for missing routes/action. Cover each route with Administrator and owner-Faculty success where allowed, unauthenticated denial, non-owner Faculty safe denial, headers/content/body/filename, query/filter preservation, no protected payload/header on denial, and safe exception translation. Cover action authorization and validation separately.

## Verification

- Focused RED then GREEN
- Scoped formatting
- `npm run lint`
- `npm run typecheck`
- `npm test`
- Production build

## Report

Write `task-5-report.md` in this SDD directory with exact files, RED/GREEN evidence, action/route authorization and header decisions, commands/results, and concerns. Git commits are unavailable. Return only status, one-line verification summary, and concerns.
