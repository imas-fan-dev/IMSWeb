const COMMANDS: &[&str] = &[
    "configure",
    "update",
    "set_controls",
    "set_search",
    "remove_search",
    "destroy",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .ios_path("ios")
        .build();
}
