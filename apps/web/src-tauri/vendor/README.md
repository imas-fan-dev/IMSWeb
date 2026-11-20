# Vendored `tauri-plugin-barcode-scanner`

- Upstream: `tauri-plugin-barcode-scanner` 2.5.3 (crate tarball from crates.io).
- Patched file: `android/build.gradle.kts`.
- Change: `com.google.android.gms:play-services-mlkit-barcode-scanning:18.1.0`
  → `com.google.mlkit:barcode-scanning:17.3.0`.

## Why

The unbundled Play-services artifact asks Google Play services to provide the
barcode model at runtime. On Android devices without GMS (verified on
vivo S50 Pro mini / Android 16) the camera opens but the analyzer never decodes
anything. The bundled artifact ships the model inside the APK and needs no GMS.

## Updating

Re-download the upstream crate at the next version, re-apply the one-line
dependency swap, and keep this note in sync. Drop the patch once upstream
switches to the bundled artifact.
