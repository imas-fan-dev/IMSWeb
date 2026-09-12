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
