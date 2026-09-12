# Geolocation Research

## Repository Evidence

- `ExchangeOfficeMap` directly calls `navigator.geolocation.getCurrentPosition` and owns the current marker and status behavior.
- The Web and Rust package manifests do not include the Tauri geolocation plugin.
- `src-tauri/src/lib.rs` does not register geolocation, and the current capabilities do not allow its commands.
- `Info.ios.plist` declares local-network access but no location usage description.
- The latest generated Android Release manifest has no coarse or fine location permission. Generated files are evidence only and must not be edited.

## Official Tauri 2 Contract

Sources:

- <https://v2.tauri.app/plugin/geolocation/>
- <https://v2.tauri.app/reference/javascript/geolocation/>
- <https://github.com/tauri-apps/plugins-workspace/blob/v2/plugins/geolocation/guest-js/index.ts>

The official flow is:

1. `checkPermissions()`.
2. Request `location` when the state is `prompt` or `prompt-with-rationale`.
3. Call `getCurrentPosition()` only after permission is granted.

Required Tauri permissions for this task are:

- `geolocation:allow-check-permissions`
- `geolocation:allow-request-permissions`
- `geolocation:allow-get-current-position`

The plugin adds Android `ACCESS_COARSE_LOCATION` and `ACCESS_FINE_LOCATION` permissions. iOS requires `NSLocationWhenInUseUsageDescription` in the application plist.

`PermissionStatus` contains both `location` and `coarseLocation`. On Android 12 and later, users may grant only approximate location, so the application must accept `coarseLocation === "granted"` for this map recenter action.

The plugin source states that `PositionOptions.timeout` is ignored for Android `getCurrentPosition` and on iOS. `maximumAge` is also ignored on iOS. The adapter therefore needs an application-level deadline to preserve the existing 10-second UX.

## Version Evidence

The workspace currently uses `@tauri-apps/api` 2.11.1, Tauri CLI 2.11.4, and Rust `tauri` 2.11.3. The latest published JavaScript and Rust geolocation plugin version found during planning is 2.3.2, whose Rust dependency accepts Tauri 2.8.2 or later. Installation must still use the workspace package manager and inspect the resolved lockfiles before implementation proceeds.
