const COMMANDS: &[&str] = &["configure", "update", "set_controls", "destroy"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
