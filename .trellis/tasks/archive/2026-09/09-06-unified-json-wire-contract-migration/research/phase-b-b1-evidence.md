# Phase B1 Backoffice and Admin evidence

## Integrated commit

- Reviewed worktree commit: `364740be` (`pi-agent: B1 Backoffice Admin`)
- Parent: `2fc183db`
- Integration method: clean fast-forward after independent Terra `trellis-check` review

The review retained the distinction between `AdminSessionResponse`, which owns the exact canonical HTTP session
payload, and `AdminSession`, which remains the smaller Web UI/session value used by existing fixtures.

## Contract coverage

- Canonical and compatibility login, session, refresh, and logout request/success/error contracts live in
  `@imsweb/contracts/admin`.
- Account create/id requests preserve legacy strip behavior. Admin account, authorization, audit, and route errors use
  shared exact response schemas and types.
- API routes execute shared request schemas before their local semantic adapters. Handlers and response modules use
  type-only contract imports.
- Canonical login accepts both `op` and `editor` accounts, keeps the response token, and permits
  `adminRole: null`. Legacy `/api/admin/login` remains op-only.
- Canonical and legacy cookie names, the 30-day refresh bridge, CSRF handling, deprecation headers, and successor links
  remain covered.
- `AdminLayout` permits an editor only on `/admin/stories` and descendants, and only shows Wiki navigation to that
  account.

## Post-merge verification

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/api exec tsx --test \
  tests/server/backoffice-auth-boundary.contract.test.ts \
  tests/server/auth-refresh.contract.test.ts \
  tests/server/admin-accounts.contract.test.ts
pnpm --filter @imsweb/web run test:unit tests/unit/layouts/admin-layout.test.tsx
pnpm run check:rules
pnpm run check:boundaries
git diff --check
```

Results: 16/16 API tests and 7/7 Web layout tests passed. Contracts build, both typechecks, rules, and boundaries passed.
The report-only audit now observes 3 shared-schema validator calls and 97 legacy validator calls.

## Phase C deltas

- Replace the Web admin endpoint's local login schema with `adminLoginSuccessResponseSchema` and attach the shared
  login/session/logout/account error schemas.
- Narrow the already contracts-typed shared Backoffice middleware bodies to the admin-specific aliases where this
  improves endpoint ownership without changing their runtime shape.
- No package export, root namespace, README, or entrypoint change is required for this domain.
