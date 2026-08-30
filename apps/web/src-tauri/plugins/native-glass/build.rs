const COMMANDS: &[&str] = &["configure", "update", "destroy"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
