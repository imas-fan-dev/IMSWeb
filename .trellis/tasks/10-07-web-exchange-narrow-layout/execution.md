# Implementation execution

Worktree: `/Users/texas/Workspace/IMSWeb/.worktrees/exchange-map-search`
Branch: `codex/exchange-map-search`
Base: `2e546377ff3bf132828f387c75d893080b82a752`

Planning approval was supplied in the dispatch. The stale planning descriptions in earlier artifacts do not supersede that approval.

## Change boundary

The existing narrow map splits search and directory tools between top and bottom surfaces. This task moves them into one nonmodal bottom search card and adds a dedicated native iOS search renderer. Search requests remain owned by the Web model and use the existing API. Map-section owns the selected place; page owns filters, directories and attribution; the map owns camera and location geometry.

Expected changes: page-private search model/controller/card, page and map integration, native-glass TS/Rust/Swift search contracts and permissions, focused regressions, UX/native specs and DESIGN Shapes. No HTTP contracts, providers, global radius tokens, deployment or generated native sources change.

Desktop search behavior will be protected by the existing explicit-submit and error tests. `/community/exchange` is an App tab root and receives no back control, following app-navigation.md.

## Initial checkpoint

- Native `functions.apply_patch` exposed and successfully used for this note.
- Initial `pwd` and `git status --short`: correct worktree; only task directory untracked.
- Previous baseline dependency installation, doctor/devices and 27 unit tests reported passed by dispatch; not yet independently rerun.
- No services started by this session.

## Resumed execution

The interrupted run's changes were preserved and inspected in place. No snapshot restore or parent worktree operation occurred.

- Shared search state, DOM detents/card, page/map integration, dedicated TS/Rust/Swift IPC, UIKit search host, permissions and scoped Shapes/spec updates are implemented.
- Removed the superseded narrow navigation component and its tests. Updated the native icon extractor to the active locate-control call site.
- `pnpm install --frozen-lockfile`: exit 0, already up to date; `/tmp/exchange-search-install.log`. This rerun followed a pnpm virtual-store configuration warning. No dependency or lockfile change was made.
- Focused Web unit command across page/map/exchange/native bridge: 24 files, 189 tests passed before removal of obsolete navigation tests. Log: `/tmp/exchange-search-unit.log`; final rerun pending.
- Lint and typecheck pass after resolving unused toolbar imports, an incorrect navigation import and test typing. Logs: `/tmp/exchange-search-lint.log`, `/tmp/exchange-search-typecheck.log`.
- Ordinary Chromium desktop browser command for map and attribution specs: exit 0, 12 tests; `/tmp/exchange-search-e2e.log`, `/tmp/exchange-search-e2e.exit`. Seven required portrait/landscape sizes have rectangle, hit and overflow assertions. Screenshots: `/tmp/exchange-search-web-WIDTHxHEIGHT.png`.
- `node --test tests/tauri-build-configuration.test.js`: exit 1, collection failed on `__dirname` because this file belongs to repository Vitest. Corrected owner: `node scripts/testing/run-test-owner.mjs delivery app`, exit 0, two files / 21 tests; `/tmp/exchange-search-delivery.log`.
- `app:doctor` passed with warnings for no signing team and initially missing generated projects. `app devices` initially found an installed iOS 27 runtime but no simulator device.
- Initial `pnpm run app ios` attempt: exit 1, no simulator. Created task-owned `IMSWeb-Exchange-Search`, UDID `B76BE6D2-18DB-434D-AAED-0061F8E621FF`, on iOS 27.0.
- Wrapper builds/install/launch with that exact simulator and loopback API/site/map origins passed, exit 0; `/tmp/exchange-search-ios.log` and `/tmp/exchange-search-ios-final.log`, corresponding `.exit` files. Swift output includes compiled `GlassSearchView.o` and plugin archive. No generated source was hand-edited.
- `simctl` screenshot captured App launch at `/tmp/exchange-search-ios-initial.png`. It shows the home screen and native tab bar; it does not prove native search.
- Native interaction attempt blocked: `open -a Simulator` fails; `/Applications/Xcode.app/Contents/Developer/Applications/Simulator.app` and its containing Applications directory are absent. System Events has no Simulator process. Available `simctl io` supports capture and display controls, not touch or text input. Real keyboard, drag, native result selection, navigation recovery and VoiceOver evidence remain outstanding.
- First `pnpm run check:rules` invocation exceeded the tool's 60-second limit; no pass recorded. Log: `/tmp/exchange-search-rules.log`; a completion-tracked retry remains necessary.

## Owned services and targets

- Web development server: `http://127.0.0.1:4187`, launcher PID 90721; `/tmp/exchange-search-web-server.log`; API proxy points to unused loopback 65534. Browser fixtures supply API data.
- Packaged App browser preview: `http://127.0.0.1:4189`, launcher PID 43932; `/tmp/exchange-search-app-server.log`. Browser fixtures register packaged API origin `http://127.0.0.1:65534`.
- App browser matrix running with one worker and five explicit projects; `/tmp/exchange-search-app-e2e.log`, completion file `/tmp/exchange-search-app-e2e.exit`.
- Task-owned iOS simulator remains booted. No physical device selected or modified. No production request, database action, staging, commit, push or deployment.

## Final checks and corrections

The final review corrected safe-area resolution, nearest-detent snapping, CSS layer precedence, short-height controls and native keyboard-relative drag height. Empty regional feedback yields to place results so the first result fits a short landscape viewport. The standalone office search still clears its result list after selection while retaining attribution.

Native modal reopening now allocates a new generation and keeps prior removal ahead of install. Invalid numeric generations/revisions are rejected. UIKit tab changes detach search and reject older pending installs. A failed update restores the DOM only after cleanup succeeds; a transient remove failure retries once. If cleanup keeps failing, cancel/tools can still exit and a later state update retries. Hidden UIKit panels pass touches through.

Manual screenshot review found that the DOM App tab bar still overlaid expanded search. AppTabBar now observes the same suppression event on the map fallback; collapse restores it. This is the existing planned navigation behavior and changes no tab model or global shapes.

| Check | Actual result and log |
| --- | --- |
| Scoped Prettier | exit 0; `/tmp/exchange-search-format-nav.log`, earlier scoped formatter logs |
| `pnpm --filter @imsweb/web run lint` | exit 0; `/tmp/exchange-search-lint-finished.log`, matching `.exit` |
| `pnpm --filter @imsweb/web run typecheck` | exit 0; `/tmp/exchange-search-typecheck-finished.log`, matching `.exit` |
| Focused unit command below | exit 0; 25 files / 206 tests; `/tmp/exchange-search-unit-finished.log`, matching `.exit` |
| Web E2E command below | exit 0; 15 tests; `/tmp/exchange-search-web-e2e-complete.log`, matching `.exit` |
| `pnpm --filter @imsweb/web run build` | exit 0; `/tmp/exchange-search-web-build.log`, matching `.exit` |
| `node scripts/testing/run-test-owner.mjs delivery app` | exit 0; 2 files / 21 tests; `/tmp/exchange-search-delivery-final.log`, matching `.exit` |
| `pnpm run app:doctor` | exit 0; `/tmp/exchange-search-doctor-final.log`, matching `.exit`; toolchain passes, no signing team and no generated Android project |
| `pnpm run check:rules` completion-tracked retry | exit 0; `/tmp/exchange-search-rules-retry.log`, matching `.exit`; 0 JSON wire violations and documentation rules pass |
| `python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-07-web-exchange-narrow-layout` | exit 0; both manifests have 8 entries; `/tmp/exchange-search-task-validate-final.log`, matching `.exit` |

```sh
pnpm --filter @imsweb/web run test:unit tests/unit/pages/community/community-exchange-page.test.tsx tests/unit/pages/community/community-exchange-map-section.test.tsx tests/unit/pages/community/community-exchange-app-page.test.tsx tests/unit/pages/community/exchange tests/unit/lib/native-glass-panel.test.ts tests/unit/lib/native-glass-controls.test.tsx tests/unit/lib/native-glass-search.test.ts tests/unit/components/app/app-tab-bar.test.tsx tests/unit/e2e/unit-source-policy.test.ts tests/unit/e2e/source-policy.test.ts
E2E_BASE_URL=http://127.0.0.1:4187 CI=1 pnpm --filter @imsweb/web run test:e2e community-exchange-map-attribution.spec.ts community-exchange-map.spec.ts --project chromium-desktop --workers=1
E2E_APP_BASE_URL=http://localhost:4191 E2E_APP_API_ORIGIN=http://127.0.0.1:4191 CI=1 pnpm --filter @imsweb/web run test:e2e:app app-map.spec.ts --project app-small --project app-iphone --project app-android --project app-landscape --project app-webkit --workers=1
VITE_IMS_API_ORIGIN=http://127.0.0.1:65534 VITE_IMS_PUBLIC_SITE_ORIGIN=http://127.0.0.1:4187 VITE_IMS_MAP_TRANSPORT_ORIGIN=http://127.0.0.1:4187 pnpm run app ios --device B76BE6D2-18DB-434D-AAED-0061F8E621FF
```

The Web tests cover all seven required widths, explicit submit/recenter, pointer dragging, retained draft/results, Escape, desktop breakpoint focus, source-dialog focus, long names, 429/503 retention, empty results, dark short layout, reduced motion, radii, bounds and actual center hits. App project skips belong to five existing app-small cases; the new fallback case runs on all five projects. These fixtures do not attest real native input.

Recoverable failures are retained: packaged preview asset proxy to unavailable loopback (`/tmp/exchange-search-app-e2e.log`); cross-host map-style CORS (`/tmp/exchange-search-app-e2e-retry.log`, interrupted after diagnosis); one landscape first-result overflow (`/tmp/exchange-search-app-e2e-final.log`, exit 1); one dev-server reload during style injection (`/tmp/exchange-search-app-landscape-recheck.log`, exit 1); invalid Web project name `chromium` (`/tmp/exchange-search-web-e2e-final.log`, exit 1). The correct Web project is `chromium-desktop`. The App dev server uses same-origin localhost map assets and waits for map readiness before safe-area injection.

Native search capability, IME, keyboard, drag, VoiceOver, Dynamic Type, reduced transparency and real Android/older-iOS interactions remain unverified. Manual review read the fresh Web portrait/landscape screenshots and App search-result/selected-place screenshots; the latter are DOM fallback images.

## Completion receipts

- Final App five-project run: exit 0, 14 passed / 5 declared app-small skips; `/tmp/exchange-search-app-e2e-finished.log` and `.exit`. Expanded DOM search hides main navigation on every fallback project and collapse restores it. The updated landscape result screenshot was read manually and no longer contains the overlapping tab bar.
- Final iOS wrapper: exit 0, built/installed/launched on the owned iOS 27.0 simulator; `/tmp/exchange-search-ios-focus-final.log` and `.exit`. The `GlassSearchView.o` in the worktree's iOS target was compiled at `2026-10-07T05:42:57.229117`, after its source modification at `2026-10-07T05:42:33.285134`. The final Swift correction makes repeated model focus commands preserve a newer local edit/cancel intent while its event crosses the bridge. This proves inclusion/compilation, not native interaction.
- Final rules run: exit 0; `/tmp/exchange-search-rules-finished.log` and `.exit`. Source rules, 31 contract entrypoints, 0 JSON violations, non-JSON manifest, route inventory and documentation checks pass.
- Worktree-local dependency resolution was checked with `realpath`: the virtual store and React resolve inside this worktree. CI commands still print a virtual-store configuration warning; frozen install is up to date and no global setting was changed.
- Removed the task-generated untracked Android icon output after the final wrapper. Tracked generated Apple sources were not edited. `git diff --check` passes and no files are staged.
- Stopped only verified task-owned listeners 90813 (4187), 43999 (4189) and 37873 (4191), whose cwd was this worktree's apps/web. A final listener check found none on those ports. Loopback 65534 never ran a service. The owned simulator and installed App remain for review; no physical target was touched.
- Failure logs remain under the paths above. Playwright reuses its output directory, so earlier traces may have been replaced; the inspected CORS reason and exact failing bounds are preserved in these notes and failure logs.

The task remains in progress with native acceptance open. No commit, push, deployment, production API/database operation, global runtime change or parent-worktree edit occurred. Final report: `/tmp/imsweb-exchange-search-implementation-resumed.md`.

## Independent check and repairs

Review ran in `/Users/texas/Workspace/IMSWeb/.worktrees/exchange-map-search`, on
`codex/exchange-map-search`, with HEAD/base
`2e546377ff3bf132828f387c75d893080b82a752`. The implementation report, task
artifacts, both manifests, Web guidelines, shared guides and repository test/device
skills were read. Existing changes were preserved. Task status remains `in_progress`.

Two local defects were repaired:

- Closing the source Dialog after 1023→1024 or 1024→1023 could focus a hidden
  entry. The new browser regression failed before the fix at the desktop-focus
  assertion, exit 1 (`/tmp/exchange-check-focus-before.log` and `.exit`). The
  close handler now chooses a connected, visible, non-inert entry after closing.
  The regression passes in both directions in the final 16-test Web run.
- UIKit input changed `isUserInteractionEnabled` while the submit button's
  `isEnabled` could remain false until a Web snapshot arrived. The native input
  owner now updates `UIButton.isEnabled` directly. Source inspection proves the
  local state correction and the wrapper compiles it; live input behavior still
  requires native interaction evidence.

Removed an orphaned refresh-component comment and synchronized source-entry,
native-renderer and browser-evidence guidance with the current implementation.

| Command | Result | Log and receipt |
| --- | --- | --- |
| `pnpm run app:doctor` | exit 0 | `/tmp/exchange-check-doctor.log`, `.exit` |
| `pnpm run app devices` | exit 0; owned iOS 27 simulator listed; no connected Android target | `/tmp/exchange-check-devices.log` |
| Focused unit command below | exit 0; 25 files, 205 tests | `/tmp/exchange-check-unit.log`, `.exit` |
| `pnpm --filter @imsweb/web run lint && pnpm --filter @imsweb/web run typecheck` | exit 0 after focus repair | `/tmp/exchange-check-final-static.log`, `.exit` |
| `node scripts/testing/run-test-owner.mjs delivery app` | exit 0; 2 files, 21 tests | `/tmp/exchange-check-delivery.log`, `.exit` |
| `pnpm run check:rules && pnpm run check:boundaries` | exit 0; 0 JSON wire violations, documentation and workspace boundaries pass | `/tmp/exchange-check-final-rules.log`, `.exit` |
| Web E2E command below | exit 0; 16 tests | `/tmp/exchange-check-web.log`, `.exit` |
| App E2E command below | exit 0; 14 tests, 5 declared skips | `/tmp/exchange-check-app.log`, `.exit` |
| Final unit command below | exit 0; 3 files, 14 tests | `/tmp/exchange-check-final-unit.log`, `.exit` |
| Final iOS command below | exit 0; build, install and launch on owned simulator | `/tmp/exchange-check-final-ios.log`, `.exit` |
| `pnpm --filter @imsweb/web run build` | exit 0; production build and Classic Wiki CSS check | `/tmp/exchange-check-build.log`, `.exit` |
| Scoped Prettier command below | exit 0 | tool output: all matched files use Prettier style |
| `python3 ./.trellis/scripts/task.py validate .trellis/tasks/10-07-web-exchange-narrow-layout` | exit 0; 8 entries per manifest | tool output |
| `git diff --check` | exit 0 | tool output |
| `open -a Simulator` | exit 1; `Unable to find application named 'Simulator'` | `/tmp/exchange-check-simulator.log`, `.exit` |

```sh
pnpm --filter @imsweb/web run test:unit tests/unit/pages/community/community-exchange-page.test.tsx tests/unit/pages/community/community-exchange-map-section.test.tsx tests/unit/pages/community/community-exchange-app-page.test.tsx tests/unit/pages/community/exchange tests/unit/lib/native-glass-panel.test.ts tests/unit/lib/native-glass-controls.test.tsx tests/unit/lib/native-glass-search.test.ts tests/unit/components/app/app-tab-bar.test.tsx tests/unit/lib/stylesheet-layers.test.ts
CI=1 pnpm --filter @imsweb/web run test:e2e community-exchange-map-attribution.spec.ts --project chromium-desktop --workers=1 --grep 'returns source focus'
CI=1 pnpm --filter @imsweb/web run test:e2e community-exchange-map-attribution.spec.ts community-exchange-map.spec.ts --project chromium-desktop --workers=1
CI=1 pnpm --filter @imsweb/web run test:e2e:app app-map.spec.ts --project app-small --project app-iphone --project app-android --project app-landscape --project app-webkit --workers=1
pnpm --filter @imsweb/web run test:unit tests/unit/e2e/e2e-source-policy.test.ts tests/unit/pages/community/community-exchange-page.test.tsx tests/unit/pages/community/community-exchange-app-page.test.tsx
VITE_IMS_API_ORIGIN=http://127.0.0.1:65534 VITE_IMS_PUBLIC_SITE_ORIGIN=http://127.0.0.1:4187 VITE_IMS_MAP_TRANSPORT_ORIGIN=http://127.0.0.1:4187 pnpm run app ios --device B76BE6D2-18DB-434D-AAED-0061F8E621FF
pnpm --filter @imsweb/web exec prettier --check app/pages/community/exchange/community-exchange-page.tsx app/pages/community/exchange/components/exchange-discovery-rail.tsx tests/e2e/community-exchange-map-attribution.spec.ts tests/e2e/app-map.spec.ts
```

An earlier policy command named the nonexistent `source-policy.test.ts`; only
the real `unit-source-policy.test.ts` matched (6 tests, exit 0,
`/tmp/exchange-check-policy.log` and `.exit`). The final command above explicitly
ran the correct `e2e-source-policy.test.ts`. No evidence is attributed to the
nonexistent file.

Manual review read the fresh 320×568 and 667×375 Web screenshots. Search, More,
three tools and the location control fit their respective portrait/landscape
layouts. The inherited iOS screenshot was also read; it shows Home and the native
tab bar, with no native search evidence. The corrected Swift source mtime is
`2026-10-07T05:53:06.014162`; its worktree `GlassSearchView.o` mtime is
`2026-10-07T05:53:28.942197`. The final wrapper reused that compiled correction
and rebuilt the current App package after the Web focus repair.

Playwright owned and stopped its 4173 Web and 1420 App servers. A final listener
check found none on 1420, 4173, 4187, 4189 or 4191. No API/database service was
started. The task-owned simulator and installed App remain available. Removed
only the 26 untracked Android icon files generated by the wrapper during this
review; the directory was absent at entry and had no tracked files. No generated
`src-tauri/gen` source was hand-edited and no files are staged.

Overall result: BLOCKED on native interaction acceptance. AC5 stays open, as do
the real-keyboard/native portions of AC4/AC6/AC7/AC8. Actual Android and older iOS
targets were not exercised. Browser fallback and compilation do not establish
native capability, IME, keyboard, drag/scroll, selection, cleanup, VoiceOver,
Dynamic Type or reduced-transparency behavior. Persistent IPC teardown failure
still delays DOM restoration until cleanup is acknowledged, as documented and
covered by bridge unit tests. Report:
`/tmp/imsweb-exchange-search-check-repaired.md`.

## Native check follow-up commands and evidence

Authoritative report: `/tmp/imsweb-exchange-search-native-check.md`. Installed local
Maestro 2.11.0 under `/tmp/imsweb-exchange-native-tools`; each invocation uses
`JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home`,
`MAESTRO_CLI_NO_ANALYTICS=true`, `MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true`,
and `--device=B76BE6D2-18DB-434D-AAED-0061F8E621FF`.

Fixture command: `pnpm --filter @imsweb/api exec tsx ../../apps/web/tests/native/exchange-search-fixture-server.ts`.
Only loopback 65534 and 4187 served synthetic contract-validated data. The first submit
failed because the fixture exceeded the five-result contract; failure log preserved at
`/tmp/exchange-native-fixture-contract-failure.log`. Corrected fixture validates before
listening and records every attempt in `/tmp/exchange-native-requests.json`.
Typing made zero search requests; explicit submit made one `?q=Shanghai` request.

Native command shape: `/tmp/imsweb-exchange-native-tools/maestro/bin/maestro --device=B76BE6D2-18DB-434D-AAED-0061F8E621FF test apps/web/tests/native/exchange-search-<stage>.yaml --debug-output=<dir>/debug --test-output-dir=<dir>/artifacts --format=JUNIT --output=<dir>/report.xml`.
Passing stages: edit (24s), results (5s), gestures (8s), selection (11s),
filter/modals (2/2, 17s), route (5s), rotation (9s). Logs and explicit exits:
`/tmp/exchange-native-final/{edit,results}/run.{log,exit}` and
`/tmp/exchange-native-final-{gestures,selection-visible,modals-focus,route,rotation}.{log,exit}`.
Screenshots/JUnit/debug files reside in `/tmp/exchange-native-final/`.
Independent hierarchy verification uses `node apps/web/tests/native/verify-exchange-search-hierarchy.mjs <hierarchy.json> <state>`;
editing/results/collapsed/modal/route checks passed. The before-fix collapsed check
failed at More target >=44pt (`/tmp/exchange-native-geometry-before.log`).

Filter failure evidence: `/tmp/exchange-native-filter-keyboard-hierarchy.json` and
`/tmp/exchange-native-final/modals-retry/artifacts/`. The native host was absent;
DOM 城市 input was focused with real WebKit keyboard. App title initial focus repair
passed the original mandatory assertions. Selection failures were automation targeting
partially clipped cells; a fully visible second row passes without changing product logic.
Live IPC generation is not exposed by hierarchy, so no runtime generation claim is made.

Repair wrapper command, twice: `VITE_IMS_API_ORIGIN=http://127.0.0.1:65534 VITE_IMS_PUBLIC_SITE_ORIGIN=http://127.0.0.1:4187 VITE_IMS_MAP_TRANSPORT_ORIGIN=http://127.0.0.1:4187 pnpm run app ios --device B76BE6D2-18DB-434D-AAED-0061F8E621FF`.
Logs `/tmp/exchange-native-repair-build.log` and `/tmp/exchange-native-filter-focus-build.log`,
both corresponding `.exit` files contain 0. Missing Simulator GUI message remains,
but wrapper installation/launch and headless automation succeeded.
`pnpm run app:doctor` passed (`/tmp/exchange-native-doctor.log`).
`pnpm --filter @imsweb/web run test:unit tests/unit/pages/community/community-exchange-app-page.test.tsx tests/unit/pages/community/exchange/hooks/use-native-exchange-search.test.tsx tests/unit/pages/community/exchange/components/exchange-search-card.test.tsx`
passed 10 tests (`/tmp/exchange-native-final-unit.log`). Lint and typecheck passed
(`/tmp/exchange-native-lint-retry.log`, `/tmp/exchange-native-final-typecheck.log`).
`git diff --check` passed; no files staged. IPC spec's existing scenario expanded
with signatures, contracts, validation and assertion points; measured collapsed geometry
and shrink label documented. No commit, deployment or task archive performed.
Stopped owned fixture process group 21044 after validation. Removed only 26 untracked
Android icons generated by these wrapper builds. Simulator and installed App remain.

## Final gate receipts

Added `apps/web/tests/native/README.md` with Java21/Maestro2.11 prerequisites,
substituted device/tool/artifact variables, repository wrapper build, fixture lifecycle,
ordered flow invocation and hierarchy states. No new native product source was needed.
Swift timestamp 2026-10-07 06:20:12 precedes installed simulator package executable
2026-10-07 06:38:29; existing final repair build includes the last native changes.

Saved system settings in `/tmp/exchange-final-settings.txt`: light / disabled / large.
Used `xcrun simctl ui B76BE6D2-18DB-434D-AAED-0061F8E621FF` for appearance dark,
increase_contrast enabled and content_size accessibility-large. Native edit/results
passed; rotation failed from an expanded-results prerequisite (no visible tabs).
Restored collapsed/route state and reran rotation: exit0,
`/tmp/exchange-final-type-rotation-retry.log`, screenshots under
`/tmp/exchange-final-type-rotation-retry/`. Collapsed hierarchy verifier passed at
`/tmp/exchange-final-type-collapsed.json`. All three settings restored afterward.
No inference of VoiceOver or Chinese IME was made.

Sequential final checks use `/tmp/exchange-final-<owner>.log` and matching `.exit`:
units (18 tests), Web map/attribution (29 passed, one Firefox launch failure, exit1),
App map (14 passed, five declared skips, exit0), lint/typecheck (exit0), delivery app
(21 tests, exit0). Web failure logged sandbox extension denial and SWGL framebuffer
mapping failure; stopped only the stalled owned Firefox process PID24580.
Rules and boundaries receipts are included in the final report. No broad browser pass
is claimed. README Prettier check, task context validation and git diff --check pass.
`pnpm run check:rules` and `pnpm run check:boundaries` both returned exit0;
receipts `/tmp/exchange-final-{rules,boundaries}.{log,exit}`.
Owned fixture process group 82423 was stopped. Simulator and App retained.

The phase3.4 confirmation instruction is `.trellis/workflow.md:626`:
"Present the plan once, ask for one-shot confirmation". `get_context.py` delegates to
`common/git_context.py`; `common/workflow_phase.py` reads that workflow file. No commit
or archive was performed.

## Targeted Firefox environment follow-up

No product source changed. Original full Web receipt remains exit1 at
`/tmp/exchange-final-web.log`; 29 passed and Firefox failed before assertions.
Playwright1.61.1 pins installed Firefox151.0, revision1532, BuildID20260611192437.
Tested the reporter diagnostic described in Playwright issues 42082/42768: copied
only application.ini to `/tmp/imsweb-firefox-private-gate/application.ini`, changed
Name/Vendor to a distinct local identity, kept the same binary and sandbox.
Installed Playwright source confirms launchOptions.args are appended to Firefox args.
Shared metadata SHA256 was identical afterward; no shared browser/data/config altered.

`node /tmp/imsweb-firefox-private-gate/smoke.cjs` returned exit1: 20s launch timeout,
sandbox extension denial and SWGL framebuffer mapping failure. Then
`pnpm --filter @imsweb/web exec playwright test --config=/tmp/imsweb-firefox-private-gate/playwright.config.ts --project=firefox-desktop community-exchange-map.spec.ts --grep '@firefox'`
returned exit1 with the same browser launch failure. Temporary config imports the real
repository config, normalizes testDir and webServer.cwd, preserves server ownership,
test logic and assertions, and overrides only private output and launch metadata args.
Receipts `/tmp/imsweb-firefox-private-gate/{smoke,targeted}.{log,exit}`, trace in
that directory's results. No diagnostic success or shipped fix claimed. No remaining
owned browser or preview process found; no unrelated passed suite rerun.

Final dirty inventory `/tmp/exchange-firefox-scope.txt`: 36 tracked changes, 34
untracked files, all task-owned; no staged files or generated gen/Android icons/logs.
`git diff --check` passed. Source ready for user commit review with Firefox environment
limitation and incomplete manual/device acceptance documented. No commit performed.

## Local CI repair after implementation commit

The map implementation was committed as `23725223f75f8b7d57e17406765f8ce78afa0b94`.
The subsequent full local CI failed; its report and first-failure evidence remain
unchanged at `/tmp/imsweb-exchange-search-local-ci.md` and
`/tmp/imsweb-exchange-local-ci-23725223/`. The API setup-recovery run passed after
removing the runner's empty `IMS_ENV_FILE` override. Unaffected passing owners
were not rerun during this repair.

The App events test omitted the community-content read when tree-back navigation
returned from `/events` to `/community`. Its fixture now registers exactly one
`GET /api/community/content` through the existing contracts-validated helper and
waits for the destination heading and exchange link. Seven test lines were added;
existing request bounds, geometry assertions, timeouts and zero retries remain.
The testing spec records destination readiness before fixture teardown.

Implementation and independent reports are `/tmp/imsweb-exchange-ci-fix-implement.md`
and `/tmp/imsweb-exchange-ci-fix-check.md`. Both full App browser runs passed:
69 cases, 10 existing project-selection skips, zero failures. Independent policy
tests passed (12 cases), as did scoped formatting, full Web lint/typecheck,
App production build and root rules. Browsers exercised owned development
servers; the production build is separate evidence. Owned ports45174 and45175
were released. No database or native device work was performed.

The same pinned Firefox151.0/revision1532 successfully launched with its subprocess
receiving `CFFIXED_USER_HOME` pointing to a fresh empty task directory. All seven
original Firefox cases passed with one worker and zero retries; receipt duration
30.32s. Report: `/tmp/imsweb-exchange-ci-fix-firefox.md`. The temporary config imports
the repository config, retains assertions/grep/timeouts, and isolates output and
owned port45379. `HOME`, sandbox, shared browser files, OS permissions and repository
launch policy remain unchanged. Default launch on this macOS host is still affected.

These follow-ups resolve the observed App fixture and local Firefox validation
failures. They do not constitute a new full CI run on Ubuntu or native acceptance.
Task remains `in_progress`; VoiceOver, Pinyin IME and other platform/device gaps
recorded earlier remain open. This repair has not been staged or committed.
