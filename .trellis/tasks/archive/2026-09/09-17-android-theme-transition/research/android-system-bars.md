# Android Theme And System Bars Research

## Scope reviewed

- Task contract: `prd.md`, `implement.jsonl`, and `check.jsonl`.
- Web theme transition, root document, accessibility CSS, native-glass bridge,
  Android implementation, Tauri configuration, generated Android project, and
  current unit/build tests.
- No production source was modified. `src-tauri/gen/` was inspected only; it is
  derived and explicitly excluded from editing by `apps/web/.rules` and
  `apps/web/src-tauri/.gitignore`.

## Current path and ownership

1. `apps/web/app/components/shared/theme-toggle.tsx`
   - `ThemeToggle` calls `changeThemeWithTransition()` (lines 92-171), which
     applies the `next-themes` theme in a 500 ms circular View Transition when
     available, otherwise the 300 ms `fade` fallback. It already has no Android
     platform downgrade.
   - `ThemeColorSync` (lines 173-187) observes `resolvedTheme` and updates only
     `<meta name="theme-color">` to `#171717` / `#fdfdfb`. It does not invoke
     native code.
2. `apps/web/app/layouts/root-layout.tsx:30,49` creates the meta tag and mounts
   `ThemeColorSync` under `ThemeProvider`.
3. `apps/web/app/styles/accessibility.css:137-159` owns the WebView animation
   CSS: circle snapshots have no built-in animation and the fallback transitions
   page properties for 300 ms.
4. `apps/web/src-tauri/gen/android/app/src/main/java/top/idol_master/imsweb/MainActivity.kt:7-12`
   calls `enableEdgeToEdge()` once during activity creation. This is the only
   identified native system-bar setup. The generated DayNight app theme is
   `Theme.imsweb` in `gen/android/app/src/main/res/values/themes.xml:3` and the
   generated activity handles `uiMode` in its manifest at line 14.
5. There is no tracked or generated repository call to
   `Window.setNavigationBarColor`, `WindowInsetsControllerCompat`,
   `isAppearanceLightNavigationBars`, or an equivalent system-bar icon API.
   Consequently Android uses the startup native UI mode selected by
   `enableEdgeToEdge()` and does not observe later `html.dark` changes.

## Native-glass bridge state

- `apps/web/src-tauri/plugins/native-glass/android/src/main/java/NativeGlassPlugin.kt:10-15`
  only disables WebView over-scroll during `load()`. It owns no Android command
  and cannot presently update a window.
- The plugin Rust adapter is Android-capable already:
  `plugins/native-glass/src/mobile.rs:12-21` registers
  `top.idol_master.imsweb.nativeglass.NativeGlassPlugin`, and `update()` relays
  the existing `UpdateOptions.dark` payload to an Android command at lines
  33-36. `UpdateOptions` makes its non-theme fields optional on the Rust side
  (`models.rs:34-40`).
- The app currently prevents that capability from being used on Android:
  `apps/web/src-tauri/src/lib.rs:38-41` installs native-glass only for iOS;
  `apps/web/src-tauri/capabilities/native-glass.json:4-7` permits only iOS.
  The Android plugin source can therefore compile but is not registered by the
  running Android app.
- `apps/web/app/lib/native-glass.ts:46-79` exposes only an iOS identity gate.
  Existing `updateNativeGlass()` requires the richer iOS tab-bar shape in its
  TypeScript type even though Rust accepts `{ dark }` by itself.

## Cause

WebView theme changes and the Android system navigation bar are independent.
Updating the document class and the browser `theme-color` meta tag does not
change Android `Window` colors or WindowInsets icon flags. The sole native
system-bar configuration happens once at activity startup and follows Android
DayNight state, rather than the persisted `next-themes` selection. Android
therefore retains prior/host-selected navigation icon appearance after a WebView
theme switch.

The PRD statement that Android is still forcibly routed to `fade` is stale
against the checked-out source: the Android WebView test at
`apps/web/tests/unit/components/shared/theme-toggle.test.tsx:72-128` already
asserts the supported circular path. The remaining defect is native system-bar
synchronization, not WebView transition selection.

## Smallest viable fix

Reuse the existing `native-glass|update` command instead of creating a separate
Rust command/model/permission family.

1. In `apps/web/src-tauri/src/lib.rs`, install `tauri_plugin_native_glass::init()`
   under `#[cfg(mobile)]`; leave `native_image` iOS-only.
2. Add `"android"` to the `platforms` array in
   `apps/web/src-tauri/capabilities/native-glass.json`, and update its
   iOS-only description.
3. In `NativeGlassPlugin.kt`, add an `@Command fun update(invoke: Invoke)` that
   parses only `dark`, runs on the activity UI thread, performs one immediate
   system-bar write, then resolves `{ supported: true }`.
   - Set the navigation background to the same `#fdfdfb` / `#171717` values
     used in `theme-toggle.tsx`.
   - Set `WindowInsetsControllerCompat(window, decorView)`
     `.isAppearanceLightNavigationBars` to `!dark` so a light background has
     dark icons and a dark background has light icons.
   - Do not attach an Android animator, delayed timer, or another 300/500 ms
     transition. `changeThemeWithTransition()` remains the only animation
     authority. A single immediate native update when `resolvedTheme` commits
     prevents a second, overlapping system-bar animation.
4. In `apps/web/app/lib/native-glass.ts`, add a narrow Android-Tauri detector
   and `syncAndroidSystemBars(dark)` wrapper that invokes
   `plugin:native-glass|update` with `{ options: { dark } }`. Keep its API
   separate from the iOS tab-bar `NativeGlassUpdateOptions` type.
5. Call that wrapper, guarded to Android Tauri, from `ThemeColorSync` when
   `resolvedTheme` changes. Keep the meta update in the same effect. Errors
   should remain non-fatal like existing native-glass callers: the WebView theme
   must still change if the optional native synchronization fails.

This is limited to plugin registration/capability, one Kotlin `update` handler,
one typed web bridge, and the existing theme synchronization effect. It avoids
editing the generated `MainActivity` and does not alter theme persistence,
reduced-motion behavior, iOS behavior, or the current circular/fallback logic.

## Test recommendations

1. Extend `apps/web/tests/unit/components/shared/theme-toggle.test.tsx` to mock
   the Android wrapper and assert `ThemeColorSync` sends `dark: true` and
   `dark: false` after resolved-theme changes, while browser/iOS paths do not.
   Preserve tests for circular reveal, unavailable API, unsupported selector,
   synchronous `startViewTransition()` failure, reduced motion, and rapid
   toggles.
2. Extend `apps/web/tests/unit/lib/native-glass.test.ts` with Android runtime
   identity and the exact scoped invocation:
   `plugin:native-glass|update`, `{ options: { dark } }`. Verify non-Tauri and
   non-Android environments do not invoke it.
3. Add Android instrumentation coverage in the native-glass Android module for
   the Kotlin `update` command or an extracted system-bar applier. Assert both
   navigation background colors and `isAppearanceLightNavigationBars` values.
   The Gradle module already declares Android test dependencies but currently
   has no project-owned Android test source.
4. Add a narrow structural assertion to `tests/tauri-build-configuration.test.js`
   for mobile plugin registration and `native-glass.json` Android admission, so
   a later iOS-only regression is caught without a device.
5. Device/emulator acceptance: toggle light-to-dark and dark-to-light with a
   supported View Transition, a forced fallback, reduced motion, and rapid
   repeated taps. Verify navigation icons have contrast immediately after the
   theme commit and there is one WebView transition only, with no delayed native
   bar animation or second flash.
