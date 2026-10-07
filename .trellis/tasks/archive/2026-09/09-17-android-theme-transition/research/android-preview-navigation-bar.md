# Android Preview navigation-bar investigation

## Question and scope

This note investigates why the local Android Preview navigation bar does not
appear to adapt when `ThemeToggle` changes the WebView theme. It covers the
current worktree, the installed Preview, generated Tauri Android configuration,
and Android's current edge-to-edge rules. No production or generated file was
changed.

## Evidence

### The Web theme and Android bridge both commit at the theme change

- `apps/web/app/components/shared/theme-toggle.tsx` makes the WebView change
  through the 500 ms View Transition when supported, or the 300 ms fade
  fallback. The current worktree removed Android-only `devicePixelRatio`
  scaling. The animation's clip-path geometry is now consistently CSS pixels.
- `ThemeColorSync` runs from `resolvedTheme`. It updates the browser
  `theme-color` and invokes `syncAndroidSystemBars(dark)` for Android Tauri.
  The current worktree makes that one non-animated native call at the resolved
  theme commit, before a circle reveal finishes. It no longer delays the bar
  update until the 500 ms or 300 ms Web animation completes.
- `apps/web/app/lib/native-glass.ts` sends
  `plugin:native-glass|update` with `{ options: { dark } }`. The Android-only
  capability admits that command for the `main` window in
  `apps/web/src-tauri/capabilities/native-glass-android.json`.
- `apps/web/src-tauri/plugins/native-glass/android/src/main/java/NativeGlassPlugin.kt`
  handles the command on the activity UI thread. It sets navigation and status
  icon appearance with `WindowCompat.getInsetsController(...)` and writes
  light or dark navigation-bar colors.

`devicePixelRatio` cannot make the native navigation bar fail to update. The
browser does not pass View Transition coordinates to Android native code. An
incorrect scale could make the WebView circle complete too early or cost frames,
but it is unrelated to `WindowInsetsControllerCompat` or navigation-bar icon
appearance.

### The generated application is edge-to-edge on Android 15+

- Generated `MainActivity.kt` calls `enableEdgeToEdge()` before Tauri starts.
- Generated `app/build.gradle.kts` sets `compileSdk = 36` and `targetSdk = 36`.
- The connected Preview is `top.idol_master.imsweb` version
  `0.1.0-preview.202609170836`, `targetSdk=36`, on an API 35 device in
  navigation mode `2` (gesture navigation on this device).
- `adb shell dumpsys window windows` reports the Preview activity as
  `EDGE_TO_EDGE_ENFORCED`, full display frame `[0,0][1080,2392]`, and currently
  requests `LIGHT_STATUS_BAR LIGHT_NAVIGATION_BAR`. This confirms that Android
  receives its light-background, dark-icon appearance flags while the Preview
  is in its light state. The device was locked during this inspection, so no fresh manual theme
  toggle was captured.
- The Web root paints `body` with `bg-background` in
  `apps/web/app/styles/theme.css`. That is the relevant visible surface behind
  a transparent gesture bar, not `Window.navigationBarColor`.

Android's Android 15 behavior-change documentation states that, for gesture
navigation when edge-to-edge is enforced, the navigation bar is transparent and
`Window.setNavigationBarColor()` does not affect it. The same page says the
color API continues to affect three-button navigation. The edge-to-edge Views
guide also states that SDK 35+ enforces transparent status and gesture
navigation bars.

Sources:

- <https://developer.android.com/about/versions/15/behavior-changes-15#edge-to-edge>
- <https://developer.android.com/develop/ui/views/layout/edge-to-edge>

## Cause

The Preview's reported lack of a visible navigation-bar background change is
expected on API 35 gesture navigation with `targetSdk=36`. Android ignores the
plugin's `window.navigationBarColor` write for that mode because the system bar
is transparent. The visible background is instead whatever the full-screen
WebView paints underneath the gesture handle.

The icon contrast remains native state and still needs the plugin's immediate
`isAppearanceLightNavigationBars = !dark` update. The current Preview window
shows that flag for light mode. A failure to see the icon change after a manual
toggle would therefore point to the bridge command not arriving or being
superseded, rather than View Transition coordinates or the transparent-bar
rule. The current component tests cover the Web-side command invocation but do
not prove that an Android device accepted the command after a real toggle.

The previous commit delayed the native update until the Web animation finished,
creating a second visible state change. The current worktree removes that
delay. That timing correction is necessary for the task, but it cannot make an
opaque gesture-navigation background appear because Android 15+ prohibits that
color path.

## Smallest safe repair

1. Keep the current worktree changes that use CSS-pixel View Transition
   coordinates and issue exactly one immediate Android system-bar sync from
   `ThemeColorSync` when `resolvedTheme` commits. They preserve the existing
   transition selection and avoid a delayed second native update.
2. Keep `isAppearanceLightNavigationBars` and
   `isAppearanceLightStatusBars` in `NativeGlassPlugin.update`. They are the
   mechanism that gives the transparent gesture handle and status icons contrast
   against the new WebView background.
3. Keep `window.navigationBarColor` as a three-button-navigation compatibility
   path, but do not treat it as a gesture-navigation visual contract. Do not
   add an Android bar animator, a timer, a `setDecorFitsSystemWindows` override,
   or generated `MainActivity` edits. SDK 35+ edge-to-edge enforcement makes
   these unsuitable for the gesture case.
4. Define the Android gesture-navigation acceptance result as: the WebView
   background reaches the transparent bar, and the handle/icons switch to the
   requested contrast. An exact opaque `#171717` or `#fdfdfb` native navigation
   strip is only a valid expectation in three-button navigation.

This proposal does not change saved theme preference, next-themes system
following, non-Android behavior, or the circle/fade/reduced-motion rules.

## Test and device verification plan

1. Keep the focused Web tests for the current worktree. They passed locally:
   `pnpm --filter @imsweb/web exec vitest run tests/unit/components/shared/theme-toggle.test.tsx tests/unit/lib/native-glass.test.ts`
   reported 2 files and 17 tests passing. pnpm also reported that the installed
   dependencies are out of sync with the lockfile, so a clean install is needed
   before treating this as final repository validation.
2. Add or retain unit assertions for each Web-side boundary:
