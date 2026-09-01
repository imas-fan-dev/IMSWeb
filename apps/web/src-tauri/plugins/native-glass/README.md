# IMSWeb Native Glass Plugin

This repository-local Tauri plugin owns the iOS 26 native bottom tab bar and disables Android WebView boundary over-scroll. Its Swift package overlays a system `UITabBarController` above the app WKWebView and sends native tab selections back through a DOM event. UIKit owns the Liquid Glass material, selection state, press feedback, safe-area placement, and width adaptation. The Android extension sets its WebView to `OVER_SCROLL_NEVER` as it loads, so reaching either vertical boundary does not stretch or bounce the page.

The plugin does not customize tab-bar dimensions, corner radius, shadow, material, selection animation, or minimize behavior. UIKit provides those values and animations. The React bridge passes the same Lucide icon IDs used by the Web fallback and supplies the selected tint as normalized RGBA values. Swift clamps each component to the `0...1` range and falls back to `#ff174f` when the field is absent; unselected items continue to use UIKit's `.secondaryLabel`. The root Tauri `build.rs` copies the five matching Lucide 1.25.0 vector assets (`house`, `calendar-days`, `layout-grid`, `map-pinned`, and `circle-user`) into the generated iOS main Asset Catalog before Xcode compiles it, so UIKit can load them from the app bundle after static linking.

The plugin returns `supported: false` below iOS 26. The React app then keeps its Web tab bar. Android registers the plugin only to disable WebView over-scroll and otherwise uses the same Web fallback.

Web modal surfaces temporarily hide the native tab bar through the existing `update` command. `Dialog`, `AlertDialog`, and `Sheet` share a reference-counted suppression marker, so nested overlays keep the bar hidden until the final surface closes. This is required because a UIKit view above the WKWebView cannot be covered by Web `z-index`.

The plugin lives outside `src-tauri/gen/` so `tauri ios init` and `tauri android init` can regenerate platform projects without deleting the implementation.
