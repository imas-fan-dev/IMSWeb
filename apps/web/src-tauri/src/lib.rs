/// Opens the iOS edge-swipe back gesture.
///
/// WKWebView defaults `allowsBackForwardNavigationGestures` to `NO`, and wry
/// 0.55 only applies `back_forward_navigation_gestures` on macOS (its own docs
/// mark the attribute unsupported on iOS), so the packaged app ships without a
/// native back swipe. Tauri exposes no configuration for it, so the shell flips
/// the WKWebView property directly through the documented `with_webview` hook.
/// The gesture still replays session history rather than the web app's page
/// tree, so the web provider corrects a pop that lands away from the logical
/// parent. Tab roots have no parent and keep the plain history behavior.
#[cfg(target_os = "ios")]
fn enable_ios_back_swipe(app: &tauri::AppHandle) {
    use objc2::runtime::AnyObject;
    use tauri::Manager;

    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    let _ = window.with_webview(|webview| {
        let webview: *mut AnyObject = webview.inner().cast();
        unsafe {
            let _: () = objc2::msg_send![
                webview,
                setAllowsBackForwardNavigationGestures: true
            ];
        }
    });
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init());
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_geolocation::init());
    #[cfg(target_os = "ios")]
    let builder = builder
        .plugin(tauri_plugin_native_glass::init())
        .plugin(tauri_plugin_native_image::init());

    builder
        .setup(|app| {
            #[cfg(target_os = "ios")]
            enable_ios_back_swipe(app.handle());

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
