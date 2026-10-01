# CI failure investigation (2026-10-01)

## Runs reviewed

- CI PR run `36750148308` on `8618cf42`: Validate App failed on `app-namecard-browsing.spec.ts:93`, test `yields floating actions to pagination and renders bundled reaction graphics`.
- CI PR run `36625819187` on `87556af0`: Validate App failed with the same App-small test and same first failing helper at `namecard-browsing.ts:475`.
- Both logs show the enabled pagination controls (`每页显示`, `namecard-target-page`, `上一页`, `下一页`) missed by `document.elementFromPoint` probes. Dispatcher teardown also reports fewer calls than declared because the test aborted before later pagination steps.
- Older run `36576144747` had multiple independent failures: App pagination hit-target assertion; ordinary Web namecard preview did not open in `activity-cover-preview.spec.ts`; governance source contract expected the old pre-commit command. Those signatures are separate from the repeated pagination failure.

## Root cause

The App pagination helper scrolled the navigation into view, asserted the floating-actions wrapper hidden once, then polled only hit points. It did not require the current pagination rectangle to be fully in the viewport or ensure observer/layout state had settled. App shell hiding depends on `data-namecard-pagination-visible`, set by `useNamecardPaginationVisibility` via IntersectionObserver. A stale visibility/layout snapshot can therefore leave the fixed floating-action overlay over controls even though the earlier hidden assertion passed.

## Fix

`apps/web/tests/e2e/fixtures/namecard-browsing.ts` now evaluates viewport bounds and sampled pointer hits in the same poll. It passes only when pagination is fully in viewport and all enabled controls receive hits. If pagination is still moving/partially offscreen, the poll keeps waiting rather than returning a false pass or failing on transient geometry. The real hit-testing assertion is retained.

Added this authoring rule to `.trellis/spec/web/frontend/testing.md` so future hit-target checks poll a single snapshot of settled geometry and actual elementFromPoint results.

## Verification

- `CI=1`-style project uses one worker and zero retries by App config; focused run executed twice locally:
  `pnpm --filter @imsweb/web exec playwright test --config playwright.app.config.ts tests/e2e/app-namecard-browsing.spec.ts --project=app-small`
  Result: 2/2 passed on each run.
- `pnpm run check:rules` and `pnpm run check:web` run after the fix (see session verification evidence).

## Remaining historical failures

The prior Web preview dialog miss and the governance command expectation failure are not caused by this App helper change. Investigate them as separate regression reports if they recur on current HEAD.
