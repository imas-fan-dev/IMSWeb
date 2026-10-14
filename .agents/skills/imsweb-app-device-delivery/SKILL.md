---
name: imsweb-app-device-delivery
description: Build and verify local IMSWeb Tauri App packages on simulators, emulators, or paired devices, and route published-artifact installs to their dedicated skills.
---

## When to Use

Use when installing a locally built IMSWeb App, preparing a device check, diagnosing App toolchain/target selection, or deciding whether a request concerns a local package or a published preview.

## Procedure

1. Read `docs/development/app-device-delivery.md` and `apps/web/.rules`. Run `pnpm run app:doctor` and `pnpm run app devices` from the repository root. To restrict the check, use `pnpm run app doctor --platform ios` or `pnpm run app doctor --platform android`.
2. Establish the install source and target before building:
   - Local source build: select the requested platform, simulator/emulator/device, profile, and required API/site origins. Use `pnpm run app ios` or `pnpm run app android` with documented flags. This wrapper owns build, install and launch.
   - Published Android preview APK: delegate to `imsweb-android-preview-install` in the project skill library. It verifies Release asset digest and installs the signed artifact; do not rebuild it as a substitute.
   - Current-source iOS personal-team physical install: delegate to `imsweb-ios-personal-team-install`. Its build is local debug and not the published preview IPA.
3. Match the exact target from `pnpm run app devices`; if multiple candidates exist, ask the user to select. Confirm origin/environment and build profile, especially before producing a package that reaches a non-production or production service.
4. Use only the `app` wrapper and its documented flags. Do not invoke Tauri CLI directly for device work or edit `src-tauri/gen/`.
5. Verify the exact device has the expected package/version and that launch succeeds. For locked/unavailable devices, report the state and request the needed action rather than claiming success.
6. Report platform, target, source (local or release), profile/origin, version and evidence. Obtain explicit authorization before release distribution, signing changes, uninstall, downgrade, or data clearing.

## Pitfalls

- Root shortcut is `pnpm run app:doctor`; use platform-specific arguments only as documented in the device-delivery guide and wrapper.
- `--skip-build` reuses a matching package in generated output; it does not install an arbitrary external APK. Use the dedicated Android Release skill for published assets.
- iOS personal-team source builds, signed preview releases, and App WebView Playwright are different verification paths.
- Never randomly choose among devices; model name is not always the device identifier.
- Never uninstall, downgrade, clear app data, write signing bypasses into the repo/profile, or publish without explicit user consent.

## Verification

- `app:doctor` has no blocking failures for the target platform and the exact target is identified.
- Installation reports success; installed package identity/version and launch are confirmed on that target.
- For preview artifact installation, follow the delegated skill's digest and release-tag checks.
- For native plugins, OAuth system-browser return, deep links, or other platform behavior, collect simulator/device evidence, not Playwright-only evidence.

## Authority

- `docs/development/app-device-delivery.md`
- `apps/web/scripts/app-device.js`
- `apps/web/scripts/app-toolchain.js`
- `apps/web/.rules`
- `imsweb-android-preview-install` and `imsweb-ios-personal-team-install` for their dedicated published/local install paths
