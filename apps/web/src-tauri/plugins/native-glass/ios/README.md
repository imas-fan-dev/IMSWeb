# iOS Native Glass

`NativeGlassPlugin.swift` is compiled into the generated Tauri iOS project through the plugin build script. On iOS 26 and later it uses the system `UITabBarController`, which receives Liquid Glass automatically from UIKit. The plugin does not override its material, geometry, shadow, selection animation, or minimize behavior. The controller lays itself out against the host safe area, so no fixed native tab-bar width or capsule geometry is maintained by this plugin.

`Sources/Resources/Lucide.xcassets` owns the five Lucide 1.25.0 PDF assets used by the React fallback. The root Tauri `build.rs` copies those imagesets into the generated iOS main Asset Catalog before Xcode compiles it, because a static Tauri plugin cannot rely on a separate SwiftPM resource bundle. `LUCIDE-NOTICE.md` and `LUCIDE-LICENSE` record their ISC license. The package keeps an iOS 13 deployment target so the app can return a Web fallback on older systems.
