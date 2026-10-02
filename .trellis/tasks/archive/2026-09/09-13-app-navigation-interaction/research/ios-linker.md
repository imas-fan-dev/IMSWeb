# iOS Release linker failure

## Finding

The failing link is caused by Xcode 27 SwiftPM Release symbol visibility, plus an incomplete workaround in `swift-rs` 1.0.8. It is not caused by the Lucide asset-list change, a missing Swift archive, a missing `-l` flag, or absent `llvm-tools`.

Rust declares `retain_object`, `release_object`, and `string_from_bytes` in `/Users/texas/.cargo/registry/src/index.crates.io-1949cf8c6b5b557f/swift-rs-1.0.8/src-rs/swift.rs:53`. SwiftRs 1.0.7 defines those C entry points in each generated checkout's `src-swift/lib.swift:55`. The worktree archives contain them, but only as local text symbols:

```text
$ ar -t .../Tauri/release/libTauri.a
__.SYMDEF
Tauri.o
SwiftRs.o

$ nm -arch arm64 .../Tauri/release/libTauri.a | rg '_(release_object|retain_object|string_from_bytes|data_from_bytes)$'
... t _data_from_bytes
... t _release_object
... t _retain_object
... t _string_from_bytes
```

`nm -gU` finds none. The same four local `t` symbols occur in all seven generated Release archives. Cargo bundles `Tauri.o` and `SwiftRs.o` into `.../tauri/1248fd74a5a77287/out/libtauri-1248fd74a5a77287.rlib`, which is already on the failing `cc` command. The `release/` archive and `out/Products/Release-iphonesimulator/` archive share inode `198240684`, so the selected search path is valid.

The 1.0.8 helper at `src-rs/build.rs:373` runs `llvm-objcopy`, but `globalize_cdecl_symbols` at line 491 only accepts symbols from the package's own object member. For package `Tauri`, it promotes entries from `Tauri.o` and rejects dependency member `SwiftRs.o`. This is visible in `nm`: `_register_plugin` is global `T`, while the runtime functions remain local `t`. The required `llvm-objcopy` exists at `/Users/texas/.rustup/toolchains/nightly-aarch64-apple-darwin/lib/rustlib/aarch64-apple-darwin/bin/llvm-objcopy`.

The original checkout has no comparable simulator Release archive. Its cached Debug `libTauri.a` exports all four functions as global `T`, so prior successful Debug builds do not cover this Release-only failure.

## Remedy and owner

The durable fix belongs to `swift-rs`'s Rust build helper, not app navigation or plugin Swift code. Extend the member filter so `SwiftRs.o` is eligible only while processing package `Tauri`:

```rust
in_own_member = norm(module) == pkg
    || (pkg == "tauri" && norm(module) == "swiftrs");
```

This promotes the four runtime exports in exactly one bundled archive. Promoting them in every plugin archive would create duplicate globals, which the helper's own comment warns against. Apply through an upstream or forked dependency patch, then rebuild the affected Tauri Release artifacts.

A one-shot environment-only unblock is:

```sh
CARGO_PROFILE_RELEASE_DEBUG=true IMS_ALLOW_INSECURE_LAN_APP_ORIGIN=1 VITE_IMS_API_ORIGIN=http://192.168.31.169:1420 VITE_IMS_MAP_TRANSPORT_ORIGIN=http://192.168.31.169:1420 pnpm run app ios --release --device 5607CB3B-7E75-45D6-B1F1-618F05A397E3
```

`build.rs:262` maps Cargo's `DEBUG=true` to `swift build -c debug`; the cached Debug archive proves that configuration keeps these exports global. This leaves Rust in the release profile with debug information but builds the Swift packages unoptimized, so it is an unblock, not the release-quality fix.

No build was run. The environment workaround remains unverified end to end by instruction. The CoreAudioTypes, UIUtilities, and SwiftUICore messages are warnings and do not explain these three exact undefined C symbols; they may still need separate handling after this link failure is fixed.
