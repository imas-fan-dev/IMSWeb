# IMSWeb Native Glass Plugin

This repository-local Tauri plugin owns the iOS 26 native bottom tab bar. Its Swift package overlays a system `UITabBarController` above the app WKWebView and sends native tab selections back through a DOM event. UIKit owns the Liquid Glass material, selection state, press feedback, safe-area placement, and width adaptation.

The plugin does not customize tab-bar dimensions, corner radius, shadow, material, selection animation, or minimize behavior. UIKit provides those values and animations. The React bridge passes the same Lucide icon IDs used by the Web fallback. The root Tauri `build.rs` copies the five matching Lucide 1.25.0 vector assets into the generated iOS main Asset Catalog before Xcode compiles it, so UIKit can load them from the app bundle after static linking; selected and unselected colors remain the system tab bar's responsibility.

The plugin returns `supported: false` below iOS 26. The React app then keeps its Web tab bar. Android never registers this plugin and always uses the same Web fallback.

The plugin lives outside `src-tauri/gen/` so `tauri ios init` can regenerate the platform project without deleting the implementation.
