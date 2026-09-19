# Tauri mobile integration

## Scenario: Foreground geolocation

### 1. Scope / Trigger

Use this contract when a Web feature needs the device's current position inside the packaged iOS or Android App. The browser API alone is not a native permission bridge in the Tauri WebView, so the feature requires coordinated JavaScript, Rust, capability, and platform metadata changes.

This contract covers one foreground position request. It does not cover continuous tracking, background location, position history, or server uploads.

### 2. Signatures

The Web-owned runtime adapter is:

```ts
export type CurrentCoordinates = {
  latitude: number
  longitude: number
}

export type GeolocationFailureKind =
  | "permission-denied"
  | "timeout"
  | "unavailable"
  | "unsupported"

export function getCurrentCoordinates(): Promise<CurrentCoordinates>
```

The native branch uses these official plugin functions:

```ts
checkPermissions(): Promise<PermissionStatus>
requestPermissions(["location"]): Promise<PermissionStatus>
getCurrentPosition(options): Promise<Position>
```

Register `tauri_plugin_geolocation::init()` behind `#[cfg(mobile)]`. Keep the Rust dependency in the iOS/Android target dependency table so desktop builds neither compile nor register an unsupported mobile integration.

### 3. Contracts

Runtime selection:

- `IS_APP_TARGET && isTauri()` uses `@tauri-apps/plugin-geolocation` through a dynamic import.
- All other runtimes use `navigator.geolocation`, including ordinary Web and App-target Playwright.

Permission contract:

- Check before requesting.
- Request `location` only when neither alias is granted and at least one alias is `prompt` or `prompt-with-rationale`.
- Treat either `location === "granted"` or `coarseLocation === "granted"` as usable. Android 12 and later may grant only approximate location.
- Do not call `getCurrentPosition` after both aliases are denied.

Capability permissions are exactly:

```json
[
  "geolocation:allow-check-permissions",
  "geolocation:allow-request-permissions",
  "geolocation:allow-get-current-position"
]
```

The capability applies only to the `main` window on `iOS` and `android`. Do not add watch or background permissions for a one-shot map action.

Platform metadata:

- iOS `Info.ios.plist` contains `NSLocationWhenInUseUsageDescription` with feature-specific user text.
- The official plugin contributes Android `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION` through manifest merging.
- Never hand-edit `src-tauri/gen/` to add either platform declaration.

Position options are `enableHighAccuracy: false`, `timeout: 10000`, and `maximumAge: 30000`. The native plugin ignores `timeout` for Android current-position requests and on iOS, so the adapter must enforce and clear its own 10-second deadline.

### 4. Validation & Error Matrix

| Condition | Adapter result |
| --- | --- |
| Browser has no geolocation API | `unsupported` |
| Browser error code 1 | `permission-denied` |
| Browser error code 3 | `timeout` |
| Browser error code 2 or unknown browser failure | `unavailable` |
| Native check/request returns no granted alias | `permission-denied` |
| Native permission API throws | `unavailable` |
| Native position rejects | `unavailable` |
| Native position exceeds the application deadline | `timeout` |

Attach both fulfillment and rejection handlers to the native position promise before starting the deadline. A result arriving after timeout must be consumed without updating UI or producing an unhandled rejection.

### 5. Good / Base / Bad Cases

- Good: Android returns `location: denied` and `coarseLocation: granted`; the map still requests a position and recenters.
- Base: A Web browser grants location; the adapter passes the three established options to `navigator.geolocation` and returns coordinates.
- Bad: Both native aliases are denied; the adapter invokes `getCurrentPosition` anyway and turns a permission failure into a generic error.
- Bad: A location request survives map teardown or style replacement and later updates the removed map.

### 6. Tests Required

- Adapter unit tests assert browser success, unsupported, error-code mapping, native already-granted, prompt request, coarse-only grant, denied-without-position, deadline firing, and timer cleanup.
- Map component tests assert marker creation and reuse, reduced motion, each user-facing error, unmount invalidation, and style-change invalidation.
- App Playwright grants a deterministic browser position, clicks the accessible location button, and observes both the success state and marker.
- Tauri infrastructure tests assert dependency versions, conditional Rust registration, the exact capability list, and the iOS purpose key.
- Release evidence inspects the merged Android manifest and packaged iOS plist, then exercises the system permission prompt on both physical platforms.

### 7. Wrong vs Correct

#### Wrong

```ts
navigator.geolocation.getCurrentPosition(onSuccess, onError)
```

Using this directly in a page assumes the packaged WebView supplies the complete native permission bridge and leaves platform declarations untested.

#### Correct

```ts
const coordinates = await getCurrentCoordinates()
if (requestId !== currentRequestId || map !== currentMap) return
map.easeTo({ center: [coordinates.longitude, coordinates.latitude] })
```

The adapter owns runtime and permission policy. The component owns map lifetime and rejects stale results before changing markers, viewport, or status.

## Scenario: App icon geometry and Liquid Glass delivery

### 1. Scope / Trigger

Use this contract when any app icon changes: the iOS `AppIcon.icon` layers, the iOS legacy
`AppIcon.appiconset` sizes, the Android adaptive icon, or the desktop `icon.icns` / `icon.ico`.
All of them derive from one tracked SVG, so a geometry edit must run the whole chain.

### 2. Signatures

| Step | Command / artifact |
| --- | --- |
| Geometry master | `apps/web/src-tauri/icon-sources/app-icon.svg`, `viewBox="0 0 1024 1024"` |
| Rasterizer (research record, never part of the build) | `.trellis/tasks/<task>/research/build-icon-layers.py --write [--svg <master>] [--out <dir>]` |
| Full-bleed raster source for desktop, legacy iOS and legacy Android icons | `… --full-icon apps/web/public/brand/imsweb-app-icon.png --android-background apps/web/src-tauri/icon-sources/android-background.png` |
| Geometry re-trace (research record, run only when a glyph outline must change) | `… --trace <pre-flattening.png> --out-svg <candidate.svg>`, then diff the five paths against the tracked master |
| Build entry | `pnpm --filter @imsweb/web run icon:app` |
| Xcode wiring | `apps/web/scripts/sync-ios-app-icon.js`, called last by `icon:app` |

Every `<path>` in the master declares `data-layer="outline|wordmark|at"`; `--write` renders each
path with its own `fill` / `stroke`, unions the alpha per layer, and writes five PNGs:
`Outline.png`, `Wordmark.png`, `At.png`, `android-foreground.png`, `android-monochrome.png`.
The master is regenerated from the pre-flattening artwork with `--trace`, which derives the glyph
masks, builds the frame band, and writes all five paths; re-running it reproduces the tracked SVG
byte for byte.

### 3. Contracts

- Canvas is 1024 x 1024. Layer PNGs are RGBA where the shape lives in alpha and RGB is white;
  colour comes from `icon.json` `fill` / `fill-specializations`, never from the PNG.
- Curves are `M` / `C` / `Z` only. No `<text>`, font, `<image>` or filter. Glyph outlines may be
  traced once from the pre-flattening source and then live on as path data; the build never reads a raster.
- `outline-frame` is the constructed band, not a traced sticker silhouette. It starts as the
  `wordmark` and `at` path data filled black and stroked 56 px with round joins and caps, so 28 px
  of black lands outside every edge; that offset leaves a sharp re-entrant corner wherever two
  offset shapes merge (`m` to `@`, `@` to `s`) plus a bay bitten in between the `m`'s right leg and
  the `s`. A closing with a true disk of radius 28 fills the bay and fillets those corners, and the
  trace adds a 24 px corner fillet and 8 px arc-length smoothing, so the outer contour reads as a
  continuous sweep. Use an exact Euclidean disk: PIL's `MaxFilter` is a square window and fattens
  convex arcs along the diagonals. The band ships as one traced closed contour
  (`fill-rule="nonzero"`, no `stroke` attribute). A constant-width offset cannot inherit the source
  raster's waviness, nicks or thickness drift. The inner half of the band is painted over by the
  wordmark and `@` layers, so the visible band stays 28 px and the `m` leg slots, the `i` dot gap
  and the `@` channel read as black.
- `outline-at` is the `@` path stroked 56 px (28 px visible outside) so the `@` keeps an independent
  black edge of the same width as the frame. `at-keyline` is the same `d` stroked 9 px
  white in the `wordmark` layer, so it lands under the red fill.
- The outline layer sits underneath, so the wordmark's white would hide the `@`'s black edge wherever
  a letterform crosses it (`m`'s right leg over the ring, `s` over the `@`'s lower right). The
  rasteriser therefore subtracts the band from 6 px to 20 px outside the `@` from the wordmark
  layer, and the edge reads again. Keep 6 px: the 9 px keyline is centred on the `@` contour, so
  only 4.5 px of it is outside. That band must lie inside the frame (the script asserts it and exits
  non-zero otherwise), otherwise the cut would punch a background hole in a letterform.
- The frame path uses `fill-rule="nonzero"` and holds exactly one subpath; the wordmark and `@`
  layers use `evenodd` and author counters as reverse subpaths on the same contour. `SHIFT_Y = 16.5`
  drops the hand-authored ink so the offset mark is centred on the canvas (`outline-frame` bbox
  centre is 512, 511).
- Traced outlines (`@`, `s`, frame) are fitted back to their mask, resampled at an even arc-length
  spacing (8 px), and emitted as a **periodic cubic spline** rather than Catmull-Rom. Catmull-Rom is
  only C1, so its curvature jumps at every sample and a long arc reads as a chain of differently
  rounded arcs with flats and kinks; the spline solves for the second derivatives that make curvature
  continuous. Even spacing and continuous curvature are both required.
- The `a` inside the `@` is not traced: its opening is fitted as an ellipse (principal axes, scaled
  to keep the traced area) and emitted as four cubic Beziers, so the inner arc is one continuous
  sweep. Hand-drawn corners use a 0.72 r Bezier handle rather than the 0.5523 r of a circular arc, so
  curvature rises from zero where the arc leaves the straight edge.
- Hand-drawn proportions follow the pre-flattening source: legs 74 px, slots 20 px, `i` stem 77 px,
  shear 0.364, and an `m` top-right shoulder radius of 34 px (the source measures about 30 px; a
  tighter shoulder reads as a kink once the 28 px offset is applied to it).
- `icon.json` groups are ordered top-first in Icon Composer 27.0 (`groups[0]` is the top layer),
  which is the reverse of the published 2.0 documentation. The `@` keeps its own group with
  `glass`, `specular`, `translucency`, `blur-material`, and `lighting: individual`; the wordmark
  group stays glass-free because `glass` adds an ~8 px rim at its boundaries.
- Keep `icon.json` in the shape Icon Composer 1.5 can produce: no top-level `features` array and no
  per-group `refractivity` object. Icon Composer 2.0 (Xcode 27) writes both, and `actool` in Xcode 26
  dies on them while archiving: first `Could not open "AppIcon.icon"`, then a nil-object exception that
  fails `ARCHIVE FAILED`. The preview iOS job runs on `macos-26-arm64`, whose newest Xcode is 26.6, so
  either key blocks every iOS preview release, while a local Xcode 27 build succeeds and hides the
  problem until CI. Restore the keys only once those runner images ship Xcode 27.
  `tests/tauri-build-configuration.test.js` asserts their absence, so a reintroduced key fails the
  local check instead of an 8-minute macOS CI job.
- `ictool` ignores the `glass` flag, so glass behaviour is only verifiable on a simulator or device.
- Desktop `src-tauri/icons/*`, `icon.icns`, `icon.ico`, and `android-background.png` must stay untouched by
  an iOS-layer-only change. They do follow the shared raster sources when a geometry change regenerates them:
  `public/brand/imsweb-app-icon.png` is itself rendered from the master over the `#e0e1e3` plate and drives the
  desktop icons, the iOS legacy `AppIcon.appiconset` and the Android legacy launcher bitmaps, while
  `android-background.png` is that same flat plate. All of them carry the flat artwork, so no client keeps the
  retired metallic look.

### 4. Validation & Error Matrix

| Condition | Required behaviour |
| --- | --- |
| `src-tauri/gen/apple` absent | `sync-ios-app-icon.js` exits 0 silently |
| `ASSETCATALOG_COMPILER_APPICON_NAME` is not `AppIcon;` | exit 1, write nothing |
| `icon:app` run twice | `project.pbxproj` still holds exactly 4 `AppIcon.icon` references |
| after changing a tracked icon file | byte count + SHA-256 in `docs/governance/assets.md` are updated |

### 5. Good / Base / Bad Cases

- Good: edit `app-icon.svg` (or re-trace one glyph from the pre-flattening source), run `--write`, then
  `--full-icon` plus `--android-background` when the geometry changed, copy the PNGs, run `icon:app`, then run
  `node scripts/testing/run-test-owner.mjs delivery app`.
- Base: changing only `icon.json` needs no rasterization; still run `icon:app` so the derived
  `gen/apple` copy is refreshed.
- Bad: hand-editing `apps/web/src-tauri/gen/apple/**` (derived output, regenerated), tracing the
  source sticker silhouette into `outline-frame` instead of offsetting the inner shapes, or tracing
  the retired metallic raster (`--from-art` now exits 1).

### 6. Tests Required

- `tests/tauri-build-configuration.test.js`
  - path ids and `data-layer` values in stacking order; `M`/`C`/`Z` only; every subpath ends in `Z`
  - `outline-at` carries `stroke-width="56"`; `outline-frame` carries no `stroke` attribute and
  exactly one subpath, and its contour stays free of kinks (peak turn under 45 deg/px);
  `at-keyline` carries `9`
  - the `@` path holds two subpaths and the second (the `a`'s counter) is a four-arc ellipse
  - the shipped `Wordmark.png` alpha keeps out of the `@`'s black edge band while the keyline stays
    drawn, decoded in-process with zlib so no image dependency is added
  - no `<text>` or `<image>` in the master
  - `icon.json` group order, `fill-specializations`, and 1024 x 1024 RGBA layer PNGs
  - `android-monochrome.png` is byte-identical to `Assets/Outline.png`
- `apps/web/tests/unit/scripts/sync-ios-app-icon.test.ts`
  - idempotent wiring, exactly 4 references, and failure when the app-icon build setting is absent

### 7. Wrong vs Correct

Wrong: bake the frame, keyline, or shadow into the artwork, or add a second contour that shadows
the fill path.

Correct: keep one hand-authored or traced `d` per shape, produce the frame by offsetting those
shapes and tracing the result, and let `stroke-width` produce the keyline, so the outline can never
drift away from the fill.

## Scenario: App viewport zoom and native back navigation

### 1. Scope / Trigger

Use this contract when the packaged App's viewport behavior or back gesture changes: pinch or
double-tap zoom, the app viewport meta, WKWebView gesture flags, or the Android system back. The
Web build keeps a zoomable, history-driven viewport; only the app target changes.

### 2. Signatures

| Owner | Entry point |
| --- | --- |
| Viewport meta | `VIEWPORT_CONTENT` in `apps/web/app/lib/app-target.ts` |
| Zoom gesture policy | `html[data-app-target="app"]` in `apps/web/app/styles/app-shell.css` |
| Back decision | `appBackHierarchyTarget` in `apps/web/app/components/app/app-tab-model.ts`, consumed by `goBack` |
| Android back | `onBackButtonPress` from `@tauri-apps/api/app` |
| iOS back swipe | `enable_ios_back_swipe` in `apps/web/src-tauri/src/lib.rs` |

### 3. Contracts

- The app viewport string adds `maximum-scale=1, user-scalable=no` to
  `width=device-width, initial-scale=1, viewport-fit=cover`; the Web string stays
  `width=device-width, initial-scale=1`. WKWebView honors the two directives, iOS Safari ignores
  them, and `touch-action: pan-x pan-y` on the app root covers double-tap zoom in both engines
  while leaving scrolling and map panning intact.
- Android back is Tauri's. `tauri 2.11.5` `AppPlugin.kt` registers an `OnBackPressedCallback` that
  calls `webView.goBack()` and exits the activity when `canGoBack()` is false. A JS
  `onBackButtonPress` listener replaces that default with a `back-button` event carrying
  `canGoBack`. Register the listener only on the routes where the app owns the destination and
  unregister on exit, so every other screen keeps back-or-exit. Registration is asynchronous, so a
  press in the first moments after arrival can still take the default path.
- iOS edge swipe is off by default. In `wry 0.55.1` the `setAllowsBackForwardNavigationGestures`
  call sits inside `#[cfg(target_os = "macos")]` (`src/wkwebview/mod.rs:512`) and
  `back_forward_navigation_gestures` defaults to `false` (`src/lib.rs:840`). Tauri exposes no
  configuration, so `setup` flips the WKWebView property through the documented `with_webview`
  hook. The native pop replays WKWebView session history, so the gesture reaches `/account/me` only
  when that parent is the entry below the subpage.
- Keep the destination rule in the Web navigation layer. Native code only enables or forwards the
  gesture; it must not duplicate section ownership.

### 4. Validation & Error Matrix

| Condition | Required behavior |
| --- | --- |
| App target document | Meta carries `maximum-scale=1`, `user-scalable=no`, `viewport-fit=cover`; root `touch-action` is `pan-x pan-y` |
| Web target document | Viewport meta unchanged and no root `touch-action`; the website stays zoomable |
| Android back on a My subpage | Run the app `goBack` and land on `/account/me` |
| Android back on any other screen | No listener, so Tauri's default back-or-exit applies |
| iOS edge swipe with the parent below | Land on `/account/me` |
| iOS edge swipe with no parent below | Known gap: the swipe pops to the previous location while the button replaces to `/account/me`; matching them needs a `popstate` correction layer |
| Desktop or non-Tauri runtime | Skip the native listener; `isTauri()` is false |

### 5. Good / Base / Bad Cases

- Good: enter My from another section, open 我的资料, then press back or swipe once; both land on
  `/account/me`, and a second back leaves My for the previous section.
- Base: a direct deep link into `/account/me/cards` makes the button replace the entry with
  `/account/me`; no parent entry exists below for the iOS gesture.
- Bad: register `onBackButtonPress` globally, which silently disables Tauri's back-or-exit behavior
  on every other screen, or claim the app cannot zoom while the Web viewport string or
  `touch-action` still allows it.

### 6. Tests Required

- App Playwright asserts the app viewport meta values and the computed root `touch-action`, plus the
  button hierarchy back from a direct entry, from a subpage entered in another section, and the
  unchanged history behavior on the Account root.
- `cargo check --target aarch64-apple-ios-sim` covers the iOS function.
- Real pinch zoom, double-tap zoom, the Android system back, and the iOS edge swipe need simulator
  or device evidence. Browser mocks and a compile check do not prove them, and the iOS gesture has
  no automated substitute, because desktop WebKit ignores the native flag.

## Scenario: iOS Liquid Glass floating controls

### 1. Scope / Trigger

Use this contract when a page wants the packaged App to draw a floating control with UIKit rather
than the DOM. Today the only page that does is the exchange map, for its 定位 button, its 菜单
触发与展开面板, and its 刷新 button.

The trigger is a rendering constraint, not a styling preference: `UIGlassEffect` samples only what
sits below it in the native layer tree, and the map canvas is opaque inside the WKWebView. A glass
view placed under the WebView is hidden by the canvas; placed above it, the glass covers the DOM
control. So the control's icon, label and press feedback have to be drawn natively, and the DOM
twin has to leave the layout.

### 2. Signatures

Web-owned client: `apps/web/app/lib/native-glass-panel.ts`.

```ts
export const NATIVE_GLASS_CONTROL_EVENT = "ims:native-glass-control"

export type NativeGlassFrame = { x: number; y: number; width: number; height: number }

export type NativeGlassMenuItem = {
  id: string
  icon: string
  label: string
  active?: boolean
  badge?: boolean
}

export type NativeGlassControl =
  | { id: string; kind: "icon-button"; icon: string; label: string; frame: NativeGlassFrame;
      cornerRadius: number; active?: boolean; disabled?: boolean }
  | { id: string; kind: "menu"; icon: string; label: string; frame: NativeGlassFrame;
      cornerRadius: number; expanded: boolean; panelWidth: number; items: NativeGlassMenuItem[] }

export type NativeGlassControlEvent = { id: string; action: "press" | "menu-item"; itemId?: string }

export function shouldUseNativeGlassControls(): boolean
export function syncNativeGlassControls(
  controls: NativeGlassControl[],
  dark: boolean
): Promise<NativeGlassStatus>
export function nativeGlassControlEvent(event: Event): NativeGlassControlEvent | null
```

React wiring: `apps/web/app/lib/native-glass-controls.tsx` exports
`NativeGlassControlsProvider({ children })` and
`useNativeGlassControl(id, spec, onEvent?) → { controlRef, panelRef }`.

Tauri command: `plugin:native-glass|set_controls`, permission
`native-glass:allow-set-controls` (`permissions/autogenerated/commands/set_controls.toml`, generated
with an underscore from the command name).

### 3. Contracts

- `frame` is CSS pixels with the origin at the WebView viewport's top-left. The iOS side converts to
  UIKit points by translating with the WebView origin in the host view and adding
  `webview.scrollView.adjustedContentInset` — not `safeAreaInsets`, which double-counts the safe
  area under `viewport-fit=cover`.
- `cornerRadius`, width and height come from the Web side. Swift never hardcodes geometry.
- `cornerRadius` is capped at half of the shorter side before it is sent. Tailwind's `rounded-full`
  compiles to `border-radius: 3.40282e38px`, and handing that number to `layer.cornerRadius` drew
  the App map refresh control as a rounded square instead of a circle. Anything at or beyond half of
  the shorter side is read as "as round as the box allows", which is the shape the twin paints.
- `setControls` replaces the whole set. Incremental updates are forbidden because they let the two
  sides diverge.
- A missing Lucide asset fails the **whole** set with `supported: false` rather than natively drawing
  part of it.
- `shouldUseNativeGlassControls()` is an admission check only (`IS_APP_TARGET && isTauri() &&
  isIosRuntimeIdentity(...)`). The real verdict is the `supported` flag the plugin returns; only a
  `true` result writes the document-root marker `data-native-glass="controls"`, which
  `app/styles/app-shell.css` uses to hide the twins:

  ```css
  html[data-native-glass="controls"] [data-native-glass-control],
  html[data-native-glass="controls"] [data-native-glass-twin] {
    display: none;
  }
  ```

  `display: none`, not transparency: a transparent twin keeps a second focus stop, a second press
  animation and a tooltip under the native surface.
- A measured twin is hidden by that rule, so `getBoundingClientRect()` returns zero. The provider
  flips it to `display: block; visibility: hidden` for the synchronous read and restores both values
  in the same task, so nothing paints and `ResizeObserver` never sees a size change.
- An open Sheet or dialog suppresses the native tab bar; the provider subscribes to the same
  `ims:native-tab-bar-suppression` event and pushes an **empty** control set while suppressed. No
  second suppression channel.
- Sync points are mount, `ResizeObserver` on each twin, `resize`, `orientationchange`,
  `visualViewport` `resize`/`scroll`, menu expand/collapse, state changes, and tab-bar show/hide.
  Map `move`/`moveend` must **not** trigger a sync: floating controls do not move during pan or zoom.
- Native taps arrive as `window` `CustomEvent`s and are routed to the handler registered with the
  matching control id. Menu events always carry `itemId`, and every native menu id maps to the
  existing React handler — never to a new business path.
- Unmount clears the set and removes the root marker.

### 4. Validation & Error Matrix

| Condition | Required behaviour |
| --- | --- |
| Not `IS_APP_TARGET`, not Tauri, or not an iOS runtime | `shouldUseNativeGlassControls()` is false; the plugin is never called |
| Plugin returns `supported: false` (iOS < 26, missing icon, inactive) | No root marker; DOM twins stay visible with their CSS glass |
| `setControls` rejects | Treated as unsupported; no root marker, no unhandled rejection |
| Marker already written, then the set stops being supported | Marker is removed on the next sync |
| Native icon asset missing | Whole set declines with `supported: false` |
| Twin radius is at or beyond half of its shorter side (`rounded-full`) | Capped to half of the shorter side before `set_controls`, so an ungrouped control stays a circle |
| Sheet or dialog open | Empty control set pushed; the map keeps its CSS twins |
| Event carries an unknown id, or a `menu-item` without `itemId`, or is not a `CustomEvent` | Ignored; `nativeGlassControlEvent` returns `null` |
| Component unmounts | Empty set pushed, marker deleted, listeners and frame callback released |

### 5. Good / Base / Bad Cases

- Good: on iOS 26 the App shows the locate, menu and refresh controls as native glass over live map
  content, the DOM versions are absent from the accessibility tree, and a tap on the native locate
  control runs the same `locateUser` handler as the DOM button.
- Base: on iOS 17 or Android the same page renders the CSS glass controls with their existing
  `aria-label`, `aria-pressed` and `aria-expanded` semantics.
- Bad: mounting `useNativeGlassControl` above `NativeGlassControlsProvider` (the context is null, so
  the control silently never registers — this is why the refresh button is its own component).
- Bad: writing `data-native-glass="controls"` from `shouldUseNativeGlassControls()` before the plugin
  answers, which blanks the controls on a device that cannot render them.

### 6. Tests Required

- `tests/unit/lib/native-glass-panel.test.ts`: event parsing for valid, malformed and partial
  details; admission truth table for Web, Android and iOS identities.
- `tests/unit/pages/community/community-exchange-app-page.test.tsx`: the App map toolbar refresh
  control still registers with the bridge (`refresh` id, `refresh-cw` icon, `刷新交换区` label) and
  carries `data-native-glass-control="refresh"`, so the DOM twin and the UIKit control can never be
  visible at the same time.
- `tests/unit/lib/native-glass-controls.test.tsx`: no plugin call when not admitted; no registration
  without a provider; marker written only after `supported: true`; `supported: false` and a rejected
  invoke both keep the twins; empty set while the tab bar is suppressed; menu panel width and items
  forwarded; a fully rounded twin capped at half of its shorter side; native events routed only to
  registered controls; a viewport change re-syncs; unmount clears the set and the marker.
- `tests/tauri-build-configuration.test.js` keeps both iOS icon inventories in agreement with the Web call
  sites and validates each packaged vector, and `cargo check --target aarch64-apple-ios-sim` covers the
  Rust side. A control icon the bundle does not carry disables the whole native path, so that parity is
  asserted rather than left to a device run.
- Real refraction, hit-testing outside the control rects, rotation and menu expansion need simulator
  or device evidence. A passing `pnpm run app ios` build is not visual proof.

### 7. Wrong vs Correct

#### Wrong

```ts
toHaveAttribute("data-native-glass-control") // on the panel as well as the trigger
```

Two elements sharing one control id make measurement ambiguous: the provider would measure whichever
element it finds first.

#### Correct

```tsx
<Button ref={controlRef} data-native-glass-control="map-tools">…</Button>
<div ref={panelRef} data-native-glass-twin="map-tools">…</div>
```

The trigger carries the measurable id; the panel carries `data-native-glass-twin`, which only the
hide rule and the panel-width read consume.

## Scenario: Android theme and system-bar synchronization

### 1. Scope / Trigger

Use this contract when a WebView theme change must update Android status- or navigation-bar icon
contrast. The change crosses the React theme state, a Tauri plugin command, a capability allowlist,
and Android window policy. It applies to Android only; iOS native-glass controls and ordinary Web
must not invoke this path.

### 2. Signatures

```ts
syncAndroidSystemBars(dark: boolean): Promise<void>
// Tauri command: plugin:native-glass|update
// capability: native-glass:allow-update (android only)
```

The plugin receives `{ options: { dark: boolean } }` and applies the result on the Android UI thread.

### 3. Contracts

- `ThemeColorSync` calls the command once when `resolvedTheme` commits in an Android Tauri runtime.
  Initial load, system-driven changes, reduced motion, circular reveal, and fade fallback share that
  immediate commit point. Animation cleanup must not make a second call.
- Android 15 and later with `targetSdk >= 35` enforce edge-to-edge. Gesture navigation is transparent,
  so `navigationBarColor` does not own its background. `html[data-app-target="app"]` paints
  `var(--background)` to carry the active Web theme under the gesture area.
- The native plugin sets status and navigation icon appearance to contrast with `dark`. It retains
  `navigationBarColor` only for lower API levels and three-button navigation, where Android can still
  honor the color.
- API 21-25 cannot draw dark navigation icons. A light theme therefore keeps a dark navigation
  background with light icons; API 23-25 may still use dark status-bar icons. API 26 and later may
  use the light navigation background with dark icons.
- Do not hand-edit `src-tauri/gen/`. Register mobile plugins in owned Rust/plugin sources and expose
  the Android command through a narrowly scoped capability.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| Web, desktop, or iOS runtime | No Android system-bar invoke |
| Android Tauri, light theme, API 26+ | Light compatibility navigation background; dark status/navigation icons |
| Android Tauri, dark theme | Dark compatibility navigation background; light status/navigation icons |
| Android Tauri, light theme, API 21-25 | Dark navigation background with light navigation icons; status icons are dark only on API 23+ |
| Android 15+ gesture navigation | Web document background reaches the transparent gesture area; icon contrast still updates |
| Android command rejects | Theme remains applied; no unhandled promise rejection |

### 5. Good / Base / Bad Cases

- Good: an Android 15 App target changes `html.dark`, paints the matching document canvas, and invokes
  the native contrast update once at the theme commit.
- Base: an Android 10 three-button device uses the native navigation color compatibility path and the
  same icon contract.
- Bad: multiplying View Transition CSS coordinates by `devicePixelRatio`, delaying native icon updates
  until animation cleanup, or expecting `navigationBarColor` to paint an Android 15 gesture bar.

### 6. Tests Required

- `apps/web/tests/unit/components/shared/theme-toggle.test.tsx`: circular/fade/reduced-motion behavior,
  CSS-pixel clip-path coordinates, and exactly one Android bridge call per theme commit.
- `apps/web/tests/unit/layouts/app-shell-styles.test.ts`: App-target document canvas paints
  `var(--background)` without changing the Web target.
- `apps/web/src-tauri/plugins/native-glass/android/src/test/java/SystemBarAppearanceTest.kt`: API 21,
  API 23-25, API 26+, and dark/light appearance branches.
- `tests/tauri-build-configuration.test.js`: Android command registration and capability scope.
- Build and install a packaged Android App on a physical API 35+ gesture-navigation device. Verify
  dark/light page canvas, status/navigation icon contrast, reduced motion, and repeated switches.

### 7. Wrong vs Correct

#### Wrong

```kotlin
window.navigationBarColor = lightColor
```

On Android 15 gesture navigation, the enforced transparent system bar can ignore this value and show
whatever the application draws beneath it.

#### Correct

```css
html[data-app-target="app"] {
  background-color: var(--background);
}
```

```kotlin
controller.isAppearanceLightNavigationBars = !dark
controller.isAppearanceLightStatusBars = !dark
```

The WebView provides the edge-to-edge background while the native plugin owns icon contrast.

## Scenario: OAuth return channel

### 1. Scope / Trigger

Use this contract when changing the packaged App's OAuth sign-in or account
linking: the mobile deep-link configuration, the system-browser handoff, the
PKCE verifier, the callback listener, or the waiting and cancel states.

The provider only ever redirects to the API's HTTPS callback. The custom-scheme
deep link is minted after that callback by the API and carries a one-time code;
the App redeems the code for a bearer session. Providers never see the scheme,
so the single HTTPS `redirect_uri` is unchanged. The API half is specified in
[API authentication](../../api/backend/authentication.md#scenario-app-oauth-return-channel-and-one-time-code-exchange);
the redemption call is specified in
[Web API, state, and contracts](./api-state-and-contracts.md#scenario-app-oauth-one-time-code-exchange).

### 2. Signatures

```jsonc
// apps/web/src-tauri/tauri.conf.json
"plugins": {
  "deep-link": {
    "mobile": [{ "scheme": ["imsweb"], "host": "oauth", "pathPrefix": ["/callback"] }]
  }
}
```

```ts
// packages/contracts/src/paths.ts
const APP_OAUTH_CALLBACK_URL = "imsweb://oauth/callback"

// app/lib/platform-oauth-deep-link.ts
parsePlatformOAuthCallbackUrl(value): PlatformOAuthCallbackPayload | null
startPlatformOAuthDeepLink(onUnclaimed?): void        // idempotent, shell-owned
subscribePlatformOAuthPayload(handler, flow = "login"): () => void

// app/lib/navigation/system-opener.ts
openSystemUrl(value): Promise<void>                    // throws outside Tauri

// app/lib/platform-oauth-app-verifier.ts
createPlatformOAuthPkcePair(): Promise<{ verifier, challenge }>
writePlatformOAuthAppVerifier(flow, verifier): void
readPlatformOAuthAppVerifier(flow): string | null
clearPlatformOAuthAppVerifier(flow): void
```

Verifier storage keys: `ims.platform.oauth-app-verifier` (login) and
`ims.platform.oauth-app-link-verifier` (link). Verifier TTL is the API's ten
minute OAuth state window; the client wait deadline is five minutes, matching the
exchange code TTL.

### 3. Contracts

- **Matching is exact.** `parsePlatformOAuthCallbackUrl` compares scheme, host,
  and path against `APP_OAUTH_CALLBACK_URL`. A URL with the same scheme and a
  different path is not ours and returns `null`.
- **`flow` is the discriminator.** Login callbacks carry no `flow` key; link
  callbacks always carry `flow=link`. Do not add a `flow=login` value, and do
  not let one flow observe the other's payload.
- **Delivery is shell-owned and idempotent.** `startPlatformOAuthDeepLink` runs
  once from `AppLayout`. A second subscription would hand the same one-time code
  to two consumers and burn it for whichever lost the race.
- **Cold start is buffered.** `getCurrent()` covers the OS launching the app with
  the callback URL and `onOpenUrl` covers a warm return. A payload that arrives
  with no listener is held, one slot per flow, and drained synchronously by the
  first matching listener. That listener receives it exactly once.
- **Unclaimed callbacks route by flow.** `AppLayout` sends `flow=link` to
  `/account/security` and everything else to `/account/login`, with
  `replace: true`.
- **The verifier never leaves the app process.** It is stored in
  `localStorage`, not `sessionStorage`, so a killed-and-relaunched process can
  still redeem the code; it is never placed in a URL, a deep link, or a log.
  A WebView that denies storage falls back to an in-memory entry.
- **The capability allow/deny list mirrors the JS guard.** `opener:allow-open-url`
  in `src-tauri/capabilities/default.json` denies the blocked schemes listed in
  `BLOCKED_SYSTEM_PROTOCOLS`. Changing one list without the other silently
  widens what the App can hand to the OS.
- **Waiting and cancel.** The App shows a waiting state while the authorization
  page is open in the system browser, with a cancel action. Cancel ends the
  state and clears the verifier; the five-minute deadline does the same.

### 4. Validation & Error Matrix

| Condition | Required result |
| --- | --- |
| URL matches scheme, host, and path | Payload parsed; `flow` present only when `flow=link` |
| Same scheme, different path | `null`, and the listener stays silent |
| Payload carries `code` | Redeemed once through the bearer exchange |
| Payload carries `error` | Mapped to the flow's reason and shown in the WebView |
| Callback arrives with no listener | Buffered per flow, then drained by the first listener |
| Cancel or five-minute deadline | Waiting state ends, verifier cleared |
| `openSystemUrl` called outside Tauri | Throws; there is no browser fallback |
| Blocked scheme reaching `openSystemUrl` | Throws before the OS sees it |

### 5. Good/Base/Bad Cases

- Good: tap a provider, authorize in the system browser, return through
  `imsweb://oauth/callback?code=…`, redeem once, and land signed in.
- Base: the user cancels in the browser, no deep link arrives, and the waiting
  state ends at the deadline or on cancel.
- Bad: subscribing from the sign-in screen (misses a cold start), letting both
  flows read one pending payload, storing the verifier in `sessionStorage`,
  adding a blocked scheme to the capability deny list only, or adding a browser
  fallback to `openSystemUrl`.

### 6. Tests Required

- Unit tests assert exact URL matching, the `flow` discriminator, one-shot drain
  per flow, cold-start buffering, and shell-level routing for both flows.
- Unit tests assert the verifier round trip, its TTL, its memory fallback, and
  that it is cleared on every terminal outcome.
- `apps/web/tests/e2e/fixtures/platform-auth.ts` supplies
  `installPlatformOAuthProvidersMock`, `platformOAuthProviderFixtures`, and
  `installRecoveringPlatformOAuthProvidersMock` for the entry and failure paths.
- **`openSystemUrl` throws outside a real Tauri runtime**, so a browser cannot
  complete the system-browser round trip. `app-oauth-sign-in.spec.ts` therefore
  covers only the visible entry, gated to the three portrait App projects. Deep
  link delivery, the exchange, and the bearer session need **simulator or device
  evidence**; a passing browser spec does not prove them.

### 7. Wrong vs Correct

#### Wrong

```ts
// A screen-owned subscription races the OS: a cold start can deliver the
// callback before the screen exists, and the code is then lost.
useEffect(() => {
  void subscribePlatformOAuthCallback(handlePayload)
}, [])
```

#### Correct

```ts
// The shell starts delivery once and holds an unclaimed payload until a
// listener appears; the flow decides the destination.
useEffect(() => {
  startPlatformOAuthDeepLink((payload) => {
    navigateRef.current(
      payload.flow === "link" ? "/account/security" : "/account/login",
      { replace: true }
    )
  })
}, [])
```
