// swift-tools-version:5.9

import PackageDescription

let package = Package(
  name: "tauri-plugin-native-glass",
  platforms: [
    .iOS(.v13)
  ],
  products: [
    .library(
      name: "tauri-plugin-native-glass",
      type: .static,
      targets: ["tauri-plugin-native-glass"]
    )
  ],
  dependencies: [
    .package(name: "Tauri", path: "../.tauri/tauri-api")
  ],
  targets: [
    .target(
      name: "tauri-plugin-native-glass",
      dependencies: [
        .byName(name: "Tauri")
      ],
      path: "Sources"
    )
  ]
)
