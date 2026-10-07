# Identity follow-up review

## Finding

### Public `/about` resumes are invalidated as personal Account state

Scenario: user A leaves `/about` at a nonzero reading position, then the identity changes to anonymous or user B while `/about` is still rendered. After switching to Community and back to My, the App opens `/account/me` at the top instead of resuming `/about`.

`app-tab-model.ts:32-36` assigns the public `/about` route to the Account tab. The provider then uses Account tab ownership as its personal-state test: `apps/web/app/components/app/app-navigation-provider.tsx:115-118` blocks later scroll capture, `:251-260` marks the route invalid and cancels its restoration, and `:261-309` retargets any pending Account URL to `/account/me`. `apps/web/app/lib/app-navigation-state.ts:150-159` also deletes the whole Account snapshot without checking its URL. The public-reading test at `apps/web/tests/unit/components/app/app-navigation-provider.test.tsx:414-431` uses a Community route, so it does not cover a public route owned by Account.

Minimal correction: classify personal destinations by pathname, covering `/account` and `/community/exchange/me`, instead of treating every Account-tab URL as personal. Clear, cancel, block, or retarget only when the saved, active, or pending URL is personal. Keep `/about` snapshots and restoration active, and add committed and pending `/about` identity-change cases.

## Verdict

One scoped regression remains. The other reviewed identity, browser-history, slow-loader, and pending-root branches match the follow-up contract.
