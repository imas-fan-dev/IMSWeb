// swift-tools-version:5.9

import PackageDescription

let package = Package(
  name: "tauri-plugin-native-image",
  platforms: [
    .iOS(.v14)
  ],
  products: [
    .library(
      name: "tauri-plugin-native-image",
      type: .static,
      targets: ["tauri-plugin-native-image"]
    )
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-native-image",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources"
    )
  ]
)
