# A integration execution and verification

This record belongs to the approved A implementation on `codex/exchange-ios-polish`, based on
`375820be0a1989ff5d356bc707434e5a58689661`. Historical PASS records and authored PNGs remain unchanged.

## Implemented seam

The delivered DOM and UIKit surfaces retain their component ownership. The search snapshot sends
optional `selectedLabel` and `selectedAddress` from the selected result while preserving `selected`
for older payloads. Clearing selection clears all three fields and retains the search draft.
The real private-hook regression verifies the transmitted fields and acknowledged teardown.

Page and map-section wiring already supplies request-driven directory refresh, measured bottom
occlusion, selected-place ownership, retained licensing, source Dialog focus and modal suppression.
Joint tests exercise those owners without introducing another presentation state or request path.
The dark short-view browser regression now measures the actual browse capsule and expanded reading
surface. The occlusion suite uses the shared page harness with state updates through the same mount.

## Current evidence

Evidence root: `/tmp/imsweb-exchange-a-implementation/integration/`. The stage's `incremental.patch`,
`after-file-hashes.json`, `preservation.json` and `gate-receipts.json` bind changes and receipts.
Focused final units pass 264 cases across 30 files, including browser authoring policy.
Formatting, lint, CLI typecheck, rules and both Web/App client builds pass.
The subsequent test-controller layout-effect repair passes all 61 affected lifecycle/policy cases.

Actual screenshot inspection found square App DOM side-material blocks that geometry-only gates
had missed. A focused stylesheet repair moves the local App material rules into their owning
layers and gives the side parent one capsule skin. Child paint, blur, shadow and pseudos are
transparent or absent; 48px target boxes and 24px native-measured radii remain intact. The first
standalone-radius assertion exposed a remaining child corner, which was repaired. Failures and
pre-fix screenshots remain preserved. The final repair passes all 17 App cases (four intentional
skips), 11 affected Web geometry/dark-short-view cases and 83 style/provider/policy unit cases.
Both client targets were rebuilt from the repaired stylesheet.

The interrupted Web run conclusively completed nine four-state A geometry cases and the Chromium
map/source flows. Its two historical wrapper-radius failures were reproduced and corrected;
both dark short-view Chromium cases then passed. The remaining Firefox config-fallback case passed
with the process-local repair below. No product assertion timeout or retry was changed.

App browser coverage passes 17 cases across five projects with four existing intentional skips.
Compiled fixture origins are API `http://127.0.0.1:1420`, public site and effective map transport
`http://localhost:1420`; the static preview owns port 1420. These are DOM fallback receipts.
The first build used public site `127.0.0.1` and caused map-style CORS failures from the `localhost`
page. The failed run and traces remain in `e2e-app.log` and `e2e-app-before-artifacts/`.

## Firefox environment recovery

Default pinned Playwright 1.61.1 / Firefox 151.0 revision 1532 startup timed out before assertions.
`e2e-firefox.log` retains the sandbox-extension and SWGL diagnostics. A fresh task-owned
`CFFIXED_USER_HOME`, supplied only through Firefox `launchOptions.env`, passed a launch/render smoke
and the unfinished Firefox project case. The temporary config imports the actual Web config,
preserving project grep, fixtures and timeouts. HOME, sandbox, shared browser data and binaries
remain unchanged. The default-startup failure is still a limitation; the reported upstream Firefox
158 fix does not establish a fix in the installed 151 binary.

## Independent native acceptance

The integration stage added no UIKit source edits. Subsequent R1/R2 repairs and the focused R3
independent optimized Release check now provide actual native evidence. R3 passes the exact
440pt live-font/keyboard/landscape More-title replay, default reversion, the 402pt ordinary neighbor,
one long-metadata neighbor and current four-state captures on both widths. R2 side-control hits,
pending refresh, material and source return retain their historical binary/source qualifications.
Details and remaining actual VoiceOver/platform limits are in [A final review](./a-final-review.md).
No physical A installation, staging, commit or publication occurred.

## Actual screenshots for delivery

`integration/skin-final-screenshots/` contains final raw Web and App DOM fallback
browse/edit/results/selected PNGs for 390×844 and 844×390. `integration/skin-final-manifest.json`
binds platform, viewport, source hashes and each image hash from the final repaired-source runs.
Earlier images in `integration/screenshots/` show the pre-repair candidate and remain historical.
These screenshots use the repository test map and fixture data.
The verified local delivery directory `data/native-glass-verification/exchange-a-r3-20261011/`
contains these unchanged browser images alongside 22 genuine UIKit captures and full reports.
Its `index.html` presents both 402/440pt native four-state sets and affected landscape views.
Original image hashes and foreground/platform/source bindings are preserved. Authored previews
remain immutable comparison references.
