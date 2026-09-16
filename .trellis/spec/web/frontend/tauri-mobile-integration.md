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
  `node --test tests/tauri-build-configuration.test.js`.
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
