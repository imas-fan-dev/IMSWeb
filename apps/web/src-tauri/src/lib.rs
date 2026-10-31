/// iOS back is an App navigation gesture, not WebKit session history.
///
/// WKWebView defaults `allowsBackForwardNavigationGestures` to `NO`. The App
/// keeps that default: stale session entries must never be replayed. The
/// native-glass plugin installs one screen-edge recognizer, admits it only when
/// the active tab stack has a page to return to, and reports the gesture to the
/// web provider, which performs the single navigation.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init());
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_geolocation::init());
    #[cfg(mobile)]
    let builder = builder.plugin(tauri_plugin_native_glass::init());
    #[cfg(target_os = "ios")]
    let builder = builder.plugin(tauri_plugin_native_image::init());

    builder
        .setup(|app| {
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
