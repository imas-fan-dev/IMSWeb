---
name: imsweb-test-routing
description: Select and run the right IMSWeb test owner and regression checks for a code or documentation change.
---

## When to Use

Use when deciding what tests to run for a change, investigating why local checks differ from CI, validating Web/API changes, or needing to map changed files to test owners.

## Procedure

1. Read `docs/development/testing.md`; identify changed workspace, owning behavior and risk. Treat root `pnpm run test` as the sequential owner scheduler, not a shortcut for understanding focused ownership.
2. Choose by evidence:
   - Web unit regression: `pnpm --filter @imsweb/web run test:unit` or focused arguments supported by the package script.
   - Ordinary Web E2E / App Web E2E: hand off to `imsweb-playwright-e2e`.
   - API tests: `pnpm --filter @imsweb/api run test` or the specific API owner script documented for the affected layer.
   - Governance/contracts/delivery: use `node scripts/testing/run-test-owner.mjs <owner> [profile]` with owner/profile from the testing guide.
   - Web route ownership or packaged-client routing: `pnpm run test:web-routing` (delivery integration; builds its required artifacts).
   - Cross-cutting change: run relevant workspace checks plus root rule/boundary checks, then expand to `pnpm run check` or `pnpm run test` when acceptance/risk requires the complete suite.
3. Inspect the selected command's owner and prerequisites before running. Do not concurrently launch two Vitest processes within one domain because reports and coverage are shared. Do not run asset tests that require a Web build without building through the documented owner first.
4. Preserve failure evidence: command, cwd, owner/profile, first failure, and whether failure occurred in collection, setup, assertion or infrastructure. Do not treat pre-commit success as proof that CI's full browser lanes passed.
5. State unrun checks and the reason; distinguish verified behavior from inference.

## Pitfalls

- `pnpm run test:web` is local Web unit coverage; ordinary Web Playwright is opt-in locally and CI-owned separately.
- `tests/assets/` checks built Web client output and belongs to delivery integration, not the API-only CI lane.
- Repository tests run from the configured root/Vitest owner. Do not invent direct commands or assume relative config paths share the shell cwd.
- Do not add scripts or aliases to make a check easier; script surfaces are guarded.

## Verification

- The selected owner/profile matches the changed path and documented prerequisites.
- Report exact command, exit result, relevant suite scope, and skipped checks.
- For broad changes, `pnpm run check:rules` and `pnpm run check:boundaries` pass; run the full prescribed owner suite where required.

## Authority

- `docs/development/testing.md`
- `scripts/testing/run-test-owner.mjs`
- Root and workspace `package.json` scripts
