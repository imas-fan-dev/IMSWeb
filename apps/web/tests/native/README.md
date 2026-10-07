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

Verifier states are `collapsed`, `editing` (Shanghai draft), `results`, `modal` and
`route`. Snapshot simulator appearance, contrast and content size before changing
them with `xcrun simctl ui`; restore the saved values afterward. Inspect screenshots
and actual bounds for clipped text as well as minimum touch sizes.

Flows cover native input, explicit submission, results, drag/scroll, selection,
clear, tool teardown, navigation and rotation. Text injection does not establish
Pinyin markedText behavior; hierarchy does not establish VoiceOver usability.
VoiceOver, IME, reduced transparency, physical devices, older iOS/Android and
region-detail interaction need separate evidence. Synthetic maps do not verify
live provider behavior. Keep incomplete acceptance documented.
