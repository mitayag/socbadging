# Task 5 Report — Server Action and Protected Export Routes

## Requirement mapping

- **FR-010 / acceptance criterion 6:** the Faculty-only action validates the three IDs,
  delegates the mutation to `issueBadge`, invalidates issuance record paths, and redirects to
  the issued credential.
- **FR-012 / acceptance criterion 9:** redirects use the validated immutable issuance ID;
  the credential filename uses only the stored, safe public ID.
- **FR-015:** the authenticated credential route returns the existing Open Badges-aligned
  credential JSON only, with no private recipient snapshot fields.
- **FR-020:** the action delegates exclusively to the transactional issuance service, which
  owns issuance/audit persistence.
- **FR-021 / FR-022:** global and class CSV endpoints preserve normalized filters and use
  the authorized issuance export service.

## Files

Created:

- `src/app/classes/[classId]/issued/actions.ts`
- `src/app/classes/[classId]/issued/actions.test.ts`
- `src/app/api/classes/[classId]/issued/export/route.ts`
- `src/app/api/issued/export/route.ts`
- `src/app/api/issued/[issuanceId]/credential/route.ts`
- `src/app/api/issued/issuance-routes.test.ts`

Modified:

- `src/modules/issuance/services/issuance-query-service.ts` — exported the existing Zod
  normalization as `normalizeIssuanceFilters`, so route handlers pass validated filter values
  to domain queries without duplicating the schema.

No pages, components, or navigation were changed.

## RED/GREEN evidence

Initial RED command:

```text
npm test -- 'src/app/classes/[classId]/issued/actions.test.ts' 'src/app/api/issued/issuance-routes.test.ts'
```

It failed because the action and three route modules did not yet exist. A second RED test for
an unavailable class export failed with received `403` versus the required safe `404`.

GREEN evidence:

```text
npm test -- 'src/app/classes/[classId]/issued/actions.test.ts' 'src/app/api/issued/issuance-routes.test.ts'
```

Passed: 2 files, 17 tests.

## Authorization and response decisions

- `issueBadgeAction` resolves its actor server-side, requires `FACULTY`, validates strict
  Zod identifier fields, invokes only `issueBadge`, validates the narrow service result,
  revalidates class/global/detail issuance paths, and redirects with `issued` or `existing`.
- Global CSV requires authentication and delegates Administrator/Faculty scope to
  `listIssuanceExportRows`.
- Class CSV requires authentication, authorizes the class through `getClassWorkspace`, then
  passes the path-derived class ID as the export filter so query parameters cannot broaden the
  class scope. Administrator reads remain allowed by the established class-workspace policy.
- Credential JSON requires authentication and uses `getIssuanceDetail` for Administrator and
  owning-Faculty authorization. Its body is strictly `detail.credential`, never the recipient
  snapshot or email.
- Successful CSV responses use `text/csv; charset=utf-8`; credential responses use
  `application/ld+json`; every download sets `Cache-Control: private, no-store` and a quoted,
  safe attachment filename.
- Denials/not-found responses are JSON only and do not include an attachment header or
  protected content. Authentication/ownership failures are `403`; unavailable class or
  issuance routes use `404`.

## Verification

- Scoped Prettier check: pass.
- `npm run lint`: pass.
- `npm run typecheck`: pass.
- `npm test`: pass — 27 files, 124 tests.
- `DATABASE_URL=mysql://badging:badging@127.0.0.1:3306/badging APP_URL=http://localhost:3000 npm run build`:
  pass.

## Concerns

- Repository-wide `npm run format` remains non-zero due solely to pre-existing formatting in
  `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-1-review-package.md` and
  `.superpowers/sdd/2026-08-12-phase-4-individual-issuance/task-2-brief.md`; they were outside
  Task 5 scope and were not edited.
- An unconfigured production build fails before page-data collection because the application
  requires `DATABASE_URL`; the documented local smoke configuration above completes the build.
- Git commits are unavailable because this workspace is not a Git repository.
