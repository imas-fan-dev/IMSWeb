# Physical-device follow-up: Android theme transition

## Scope and evidence

Reviewed the current task manifest and PRD, the Web transition implementation
and unit tests, the native-glass Android plugin and registration, the current
Preview installation, and the connected Android device. No production files,
generated Android files, or task artifacts outside `research/` were modified.

The connected device is `A059`, Android API 35, `arm64-v8a`, physical density
420 dpi. Its Tauri WebView is Chrome `151.0.7922.202` and exposes both
`document.startViewTransition` and
`CSS.supports("selector(::view-transition-new(root))")`.

Chrome DevTools inspection of the live WebView at `http://tauri.localhost/`
reported:

```json
{
  "dpr": 2.625,
  "inner": [411, 911],
  "visual": [411.4285583496094, 911.2380981445312, 0, 0],
  "tauri": true,
  "vt": "function",
  "css": true
}
```

The installed package is `top.idol_master.imsweb`, version
`0.1.0-preview.202609170814`, first installed and last updated at
`2026-09-17 23:18:07`. The current universal release APK was produced at
`2026-09-17 23:17:05`. The current system-bar commit is `49da79b9`, committed
at `2026-09-17 22:58:07`; the installed APK's `classes.dex` contains both
`top/idol_master/imsweb/nativeglass/NativeGlassPlugin` and
`setNavigationBarColor`.

Conclusion: the installed Preview package includes the committed Android
system-bar implementation. This eliminates a stale package as the explanation
for the report, but does not prove that the bridge invocation completed during
a particular theme toggle.

## Circular reveal diagnosis

`apps/web/app/components/shared/theme-toggle.tsx` measures the button origin
with `getBoundingClientRect()`, then calculates the viewport radius. Both are
CSS-pixel geometry. The current Android-only branch multiplies the origin and
radius by `window.devicePixelRatio` before passing them as CSS `clip-path`
lengths to `Element.animate()`.

That scaling is not technically sound. A `px` in the generated `clip-path` is
a CSS pixel, not a physical screen pixel. The browser's compositor maps the
same CSS coordinate space to its device-pixel backing store. CSS Values Level
4 defines the CSS reference pixel separately from a device pixel, and MDN
documents that `getBoundingClientRect()` values are viewport-relative CSS
geometry:

- <https://drafts.csswg.org/css-values-4/#px>
- <https://developer.mozilla.org/en-US/docs/Web/API/Element/getBoundingClientRect>

On the connected device, a `2.625` scale turns a valid 411 CSS-pixel-wide
viewport coordinate into 1,079.875 CSS pixels. The growing circle reaches the
actual viewport well before the 500 ms animation ends, so it reads as too fast.
It also asks the compositor to handle a substantially larger clipped snapshot,
which is a credible direct cause of the low frame rate. The unit test currently
codifies this incorrect conversion at
`tests/unit/components/shared/theme-toggle.test.tsx`.

### Smallest fix and regression coverage

1. Remove `shouldUseAndroidWebViewPixelCoordinates()` and the
   `devicePixelRatio` multiplication. Use `originX`, `originY`, and `radius`
   directly for every runtime.
2. Replace the Android unit assertion with CSS-pixel keyframes, while retaining
   the Android Tauri identity and 500 ms circular-transition assertion. Set a
   non-1 `devicePixelRatio` in the test so a future conversion fails visibly.
3. Device check: with the connected device's DPR of 2.625, record the emitted
   keyframes through remote DevTools. The final radius must be the CSS-pixel
   `Math.hypot(...)` result, not 2.625 times that result. Record a 60 fps
   performance trace for one light-to-dark and one dark-to-light toggle.

## System-bar diagnosis

The complete native path is present in the current Preview:

- `src-tauri/src/lib.rs` registers native-glass for `#[cfg(mobile)]`.
- `capabilities/native-glass-android.json` admits
  `native-glass:allow-update` for Android's `main` window.
- `NativeGlassPlugin.kt` handles `update`, writes a light or dark navigation
  background, and sets navigation and status icon appearance through
  `WindowCompat.getInsetsController(...)`.
- The Web bridge invokes `plugin:native-glass|update` with `{ options: { dark } }`.

The active app window is edge-to-edge (`EDGE_TO_EDGE_ENFORCED`), so its system
bar colors and icon flags are independent of the WebView's CSS. The native
write is necessary. However, the Web implementation deliberately defers that
write during a manual toggle: `deferAndroidSystemBarSync` blocks
`ThemeColorSync`, and `completeAndroidSystemBarSync()` invokes the bridge only
after the 500 ms circle or 300 ms fallback has finished. The result is an
observable second state change after the WebView has already changed. This
timing is inconsistent with the requirement that bars track the theme change,
and it can make the change appear absent during the interaction.

No log entry from a theme-toggle invocation was available, so the current
evidence cannot distinguish a delayed successful call from a rejected bridge
call on the reporting interaction. The package contents, configuration, and
live runtime admission predicates all support the bridge path.

### Smallest fix and regression coverage

1. Do not defer an Android system-bar synchronization until transition
   completion. Let the existing `ThemeColorSync` effect issue one immediate,
   non-animated native update when `resolvedTheme` commits. It already handles
   non-manual and system-following theme changes.
2. Remove only the manual-toggle deferral bookkeeping
   (`deferAndroidSystemBarSync` and `completeAndroidSystemBarSync`), leaving
   View Transition cancellation, fallback timing, theme persistence, and
   reduced-motion logic intact. The Kotlin command must remain an immediate
   write with no Android animator or timer.
3. Update the component test that currently expects no bridge call until the
   circle finishes. Assert exactly one `syncAndroidSystemBars(true)` call after
   the resolved-theme commit, before `reveal.finished`; cover the fade path as
   well. Preserve the non-Android and rejected-invocation cases.
4. Add an Android instrumentation test around an extracted system-bar applier,
   or a command-level test if the plugin harness supports it. Verify both
   colors and these flags: light theme sets light navigation and status-bar
   appearances; dark theme clears both. The physical device is API 35, so it
   exercises the API 26+ branch; the pre-M and Android 6 branches are only
   reachable through the plugin's own unit tests.

## Archive note

This artifact was committed while the sentence above was still incomplete. All
four recommendations were implemented in `3e5f950b`: `SystemBarAppearance.kt`
extracts the color and icon-flag decision, `SystemBarAppearanceTest.kt` covers
the Android 15, pre-M, and Android 6 branches, and the Web tests assert one
bridge call per theme commit.

The device-side steps were not executed against that commit: keyframe capture
at DPR 2.625, a 60 fps trace for one light-to-dark and one dark-to-light
toggle, and the instrumentation run. The connected device `A059` still holds
the `0.1.0-preview.202609170814` package, which predates `3e5f950b`.
