const COMMANDS: &[&str] = &["prepare", "release", "cleanup_expired"];

fn main() {
    tauri_plugin::Builder::new(COMMANDS).ios_path("ios").build();
}
