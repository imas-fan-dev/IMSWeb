# Local native exchange search checks

These tests exercise the installed UIKit search renderer. Web browser owners remain
separate. Use a booted, task-owned iOS26+ simulator, Maestro 2.11.0 and Java21.
Set `NATIVE_DEVICE` to its UDID, `MAESTRO_BIN` to the local Maestro executable,
`NATIVE_JAVA_HOME` to Java21, and `NATIVE_ARTIFACTS` to a task-owned output directory.
Run commands from the repository root. Preserve app data.

The fixture serves contract-validated synthetic data on API `http://127.0.0.1:65534`
and site/map `http://127.0.0.1:4187`; it never proxies to external providers.

```sh
pnpm --filter @imsweb/api exec tsx ../../apps/web/tests/native/exchange-search-fixture-server.ts
```

Keep that foreground process available during checks; stop it with Ctrl-C afterward.
Build/install through the repository wrapper:

```sh
pnpm run app:doctor
VITE_IMS_API_ORIGIN=http://127.0.0.1:65534 \
VITE_IMS_PUBLIC_SITE_ORIGIN=http://127.0.0.1:4187 \
VITE_IMS_MAP_TRANSPORT_ORIGIN=http://127.0.0.1:4187 \
pnpm run app ios --device "$NATIVE_DEVICE"
```

Start on the exchange-map tab with collapsed search and no open modal. These flows
are stateful: run them in the following order, once each. Selection intentionally
targets a fully visible row; clipped cell bounds can place a tap outside the table.

```sh
for stage in edit results gestures selection filter modals route route-rotation; do
  JAVA_HOME="$NATIVE_JAVA_HOME" MAESTRO_CLI_NO_ANALYTICS=true \
  MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true \
  "$MAESTRO_BIN" --device="$NATIVE_DEVICE" test \
    "apps/web/tests/native/exchange-search-$stage.yaml" \
    --debug-output="$NATIVE_ARTIFACTS/$stage/debug" \
    --test-output-dir="$NATIVE_ARTIFACTS/$stage/artifacts" \
    --format=JUNIT --output="$NATIVE_ARTIFACTS/$stage/report.xml" || break
done
```

Capture hierarchy at the appropriate state before advancing:

```sh
JAVA_HOME="$NATIVE_JAVA_HOME" MAESTRO_CLI_NO_ANALYTICS=true \
MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED=true \
"$MAESTRO_BIN" --device="$NATIVE_DEVICE" hierarchy > "$NATIVE_ARTIFACTS/hierarchy.json"
node apps/web/tests/native/verify-exchange-search-hierarchy.mjs \
  "$NATIVE_ARTIFACTS/hierarchy.json" collapsed
```

Verifier states are `collapsed`, `selected`, `editing` (Shanghai draft), `results`,
`modal` and `route`. Use `collapsed-landscape` or `selected-landscape` for short
landscape. Selected checks require the complete expected name and address as the
third and fourth arguments. The verifier checks one 48×96pt shared side surface,
distinct refresh/locate targets, 12pt card clearance and the bounded summary reading
path. Expanded captures require a standalone refresh with no suppressed locate.
Use `selected-expanded` with the same complete name/address arguments to check the
expanded reading header. Inspect and scroll its visible text separately; hierarchy
content does not prove that the glyphs fit or that a mask is absent.
Run checker regressions with `node --test apps/web/tests/native/exchange-search-geometry.test.mjs`.
Synthetic geometry cases test the verifier; they are not native runtime receipts.
For the current App portrait collapsed/selected width contract, compare actual visible native
navigation/search/tools contours in original full-scale images within 2pt. The full AX tab-strip
frame is not the floating capsule. Current iOS 27.0 probes at 375/402/440pt calibrated a 20pt
minimum inline inset; public root margins include SE3's asymmetric 16/0 case. This calibration
does not expose an exact UIKit glass-frame API. Record device model/runtime, image pixel scale,
source/binary/install binding and measured contours. Old 360pt widths/PASS receipts are historical.
Keep default/live larger text, complete ordinary/long metadata, source return and all 44pt targets.
Expanded phone reading, tablets and short landscape retain their existing geometry.

```sh
swiftc apps/web/src-tauri/plugins/native-glass/ios/Sources/ExchangeSearchLayout.swift \
  apps/web/tests/native/exchange-navigation-layout.swift -o "$NATIVE_ARTIFACTS/exchange-navigation-layout"
"$NATIVE_ARTIFACTS/exchange-navigation-layout"
```

This runs production geometry without claiming UIKit visuals. Browser cases cover actual DOM
capsules at 320/375/390/402/414/440px and both mixed renderer protocols. Native search + DOM nav
passes the actual visible CSS capsule as optional `navigationFrame`; DOM search + native nav
uses current page-private inline layout events. Reject stale ownership/revision/viewport data;
absent events keep the supported fallback. Do not measure a hidden DOM twin as native navigation.
Run the actual production rounded predicate without a simulator:

```sh
swiftc apps/web/src-tauri/plugins/native-glass/ios/Sources/GlassSurfaceGeometry.swift \
  apps/web/tests/native/glass-surface-geometry.swift -o "$NATIVE_ARTIFACTS/glass-surface-geometry"
"$NATIVE_ARTIFACTS/glass-surface-geometry"
```

The 32 cases retain full segment centers/inner edges while excluding capsule and
circle corners, including the original 402pt `(347,258)` replay. On a fresh UIKit
Release, first measure the side frame without scrolling. If it is still
`[346,257][394,353]`, tap `(347,258)` and drag from `(347,258)` to `(327,238)`.
Use `(370,281)` and `(370,329)` for the respective segment centers. For a changed
frame, use top-left plus `(1,1)`, refresh center, and locate center from the measured
48pt segments. Capture fixture request counters and camera before/after through
the authorized fixture-control protocol. A corner must cause zero refresh/locate
events and a drag must change the map camera. Check the lower transparent corner
and the standalone refresh circle too. Preserve all request/error receipts.

Recapture locate after source, filter/directory and expand-return at both widths
and installation orders. Compare visible glyph/material with the before capture
and the payload's enabled/disabled state. Do not grant location permission or
force-enable a pending control. The overlay order repair is source evidence;
enabled hierarchy text does not establish readable ink.

For keyboard landscape, capture the initial offset with state `editing-landscape`.
Measure input, submit and cancel before any test scrolling. Then intentionally
swipe inside the measured `ims-native-exchange-reading-viewport` to expose the
footer, preserving those essential frames. The R1 unscrolled footer at
`[62,188][235,232]` in the 440pt card `[8,8][428,204]` is a clipping regression,
not a valid 44pt visible target. At each current middle viewport, swipe near its
horizontal center from `bottom - 4` to `top + 4`; measure again rather than assuming
that a fixed distance reached the footer. Tap the fully visible footer manually.

```sh
node apps/web/tests/native/verify-exchange-reading-scroll.mjs \
  "$NATIVE_ARTIFACTS/landscape-initial.json" "$NATIVE_ARTIFACTS/landscape-footer.json"
```

The reading viewport scrolls metadata/results and secondary actions; essential
rows remain above it. Observe map/shell stability and full selected reading.
Repeat default/larger type at both phone widths. Visible screenshots and actual
taps are required; AX rectangles and the checker alone cannot approve clipping.
The R3 title regression `exchange-more-title.swift` uses the production host in an
iOS XCTest host. It checks repeated translations, live large-to-extra-large font
growth, landscape fitting and retained input/table/button/menu identity. Compile
it with the owning native-glass Sources and installed Tauri modules; record actual
XCTest execution separately from a simulator-SDK typecheck.

For visual acceptance, replay ordinary selected at 440pt, change Larger Text live
to extra-large, then open the real keyboard in short landscape and deliberately
scroll the measured reading viewport. Capture the initial and fully exposed More
states. Inspect the raw PNG for both 更多 characters before tapping. R2 exposed a
173×44pt target at `[62,148][235,192]` with full accessible 更多 but rendered only
更; 402pt ordinary and both long-metadata larger-text cases showed the complete word
on that same Release. Keep these comparisons and bind fresh images to the repaired
source and binary. The original rendering cause was not instrumented.

Snapshot simulator appearance, contrast and content size before changing
them with `xcrun simctl ui`; restore the saved values afterward. Inspect screenshots
and actual bounds for clipped text as well as minimum touch sizes.

Flows cover native input, explicit submission, results, drag/scroll, selection,
clear, tool teardown, navigation and rotation. Text injection does not establish
Pinyin markedText behavior; hierarchy does not establish VoiceOver usability.
VoiceOver, IME, reduced transparency, physical devices, older iOS/Android and
region-detail interaction need separate evidence. Synthetic maps do not verify
live provider behavior. Keep incomplete acceptance documented.
