use std::{env, fs, path::Path};

const LUCIDE_TAB_ICONS: [&str; 5] = [
    "house",
    "users",
    "map-pinned",
    "book-open-text",
    "circle-user",
];

// Lucide icons drawn by the native glass map controls. The plugin rejects the
// native path when any of them is missing from the bundle, so they ship in the
// same generated main catalog as the tab bar icons.
const LUCIDE_CONTROL_ICONS: [&str; 11] = [
    "menu",
    "x",
    "map",
    "list-filter",
    "building-2",
    "credit-card",
    "user-round",
    "info",
    "locate-fixed",
    "loader-circle",
    "refresh-cw",
];

fn replace_generated_ios_asset(source: &Path, destination: &Path, label: &str) {
    if destination.exists() {
        fs::remove_file(destination).unwrap_or_else(|error| {
            panic!(
                "remove generated iOS Lucide {label} asset {}: {error}",
                destination.display()
            )
        });
    }
    fs::copy(source, destination).unwrap_or_else(|error| {
        panic!(
            "copy generated iOS Lucide {label} asset from {}: {error}",
            source.display()
        )
    });
}

fn sync_ios_lucide_assets() {
    let manifest_dir = env::var("CARGO_MANIFEST_DIR")
        .unwrap_or_else(|error| panic!("Cargo must supply CARGO_MANIFEST_DIR: {error}"));
    let source_catalog =
        Path::new(&manifest_dir).join("plugins/native-glass/ios/Sources/Resources/Lucide.xcassets");
    let destination_catalog = Path::new(&manifest_dir).join("gen/apple/Assets.xcassets");

    for icon in LUCIDE_TAB_ICONS.into_iter().chain(LUCIDE_CONTROL_ICONS) {
        let source_set = source_catalog.join(format!("{icon}.imageset"));
        let destination_set = destination_catalog.join(format!("{icon}.imageset"));
        let source_metadata = source_set.join("Contents.json");
        let source_pdf = source_set.join(format!("{icon}.pdf"));

        println!("cargo:rerun-if-changed={}", source_metadata.display());
        println!("cargo:rerun-if-changed={}", source_pdf.display());

        if !destination_catalog.exists() {
            continue;
        }

        fs::create_dir_all(&destination_set).unwrap_or_else(|error| {
            panic!(
                "create generated iOS Lucide asset directory {}: {error}",
                destination_set.display()
            )
        });
        replace_generated_ios_asset(
            &source_metadata,
            &destination_set.join("Contents.json"),
            "metadata",
        );
        replace_generated_ios_asset(
            &source_pdf,
            &destination_set.join(format!("{icon}.pdf")),
            "vector",
        );
    }
}

fn main() {
    if env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("ios") {
        sync_ios_lucide_assets();
    }

    tauri_build::build()
}
