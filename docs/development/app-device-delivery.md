# App 设备安装与前置依赖

> 文档类型：开发
> 状态：Active
> 权威来源：`apps/web/scripts/app-device.js`、`apps/web/scripts/app-toolchain.js`、`apps/web/package.json`、根 `package.json` 和 `tests/tauri-device-delivery.test.js`

本文件描述把 App target 装进 iOS 模拟器、Android 模拟机和两端真机所需的前置依赖、命令矩阵和
签名边界。移动外壳本身的结构、跨源 API 契约和阻塞项见
[Tauri 移动端基础设施](tauri-mobile.md)。

本文件不描述应用商店发布、证书签发和灰度策略。

## 1. 适用范围

安装链路由 `apps/web/scripts/app-device.js` 统一封装，它做四件事：解析目标与配置、调用 Tauri CLI
构建、在产物目录中定位刚生成的包、再通过平台工具安装并拉起。仓库只暴露 `app` 一个入口和
`app:doctor` 一个体检快捷方式；目标、配置和设备都是参数，不为每种组合新增 package script。
三项要么显式给出，要么由脚本按可判定的规则选中，不接受隐式回退。

`src-tauri/gen/` 是派生目录。平台工程缺失时脚本自动执行一次 `tauri ios init` 或
`tauri android init`，不需要手工准备。

## 2. 前置依赖

### 2.1 通用

- Node.js `>=22.13.0`、pnpm 11（`corepack enable`）。
- Rust 工具链，且已安装两端 target：

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

- 工作区依赖已安装（`pnpm install --frozen-lockfile`），Tauri CLI 随 `@imsweb/web` 提供。

### 2.2 iOS

- macOS 主机与**完整 Xcode**，不能只装 Command Line Tools：

```sh
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
```

- CocoaPods：`brew install cocoapods`。
- 真机安装依赖 `xcrun devicectl`（Xcode 15 及以上随附），设备需已配对并处于信任状态。
- 真机构建需要签名团队。构建前导出 Team ID，否则 Xcode 归档阶段会因缺少签名身份失败：

```sh
export TAURI_APPLE_DEVELOPMENT_TEAM=<Team ID>
```

### 2.3 Android

- Android Studio 安装 SDK Platform、Platform-Tools、Build-Tools、Command-line Tools、Emulator
  和 NDK (Side by side)。
- **Java 必须在 17-21 之间**。生成工程使用 Gradle 8.14，更高版本的 JDK 会在 `:buildSrc`
  配置阶段失败。
- 导出环境变量：

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 $ANDROID_HOME/ndk | tail -1)"
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
```

`adb` 与 `emulator` 不必进入 `PATH`；脚本会先在 `$ANDROID_HOME` 下按 SDK 布局查找，再回退到
`PATH`。

### 2.4 体检

前置依赖以可执行检查为准，不以本文件的清单为准：

```sh
pnpm run app:doctor
```

它按「通用 / iOS / Android」三组输出 `ok`、`warn`、`fail` 三种状态，并为每条失败项给出修复命令。
存在 `fail` 时退出码为 1。`warn` 不阻塞构建，只说明某条路径尚未就绪，例如未设置 Apple Team ID 时
模拟器安装仍然可用。只关心单端时加 `--platform ios` 或 `--platform android`。

查看当前可用目标：

```sh
pnpm run app devices
```

输出包含 iOS 模拟器（`*` 标记已启动）、已配对 iOS 真机及其连接状态、`adb` 可见的 Android 目标，
以及可启动的 AVD 名称。

## 3. 安装命令矩阵

以下命令从仓库根目录执行，均为「构建自包含包 → 安装 → 拉起」的完整链路：

| 目标           | Debug                                  | Release                                          |
| -------------- | -------------------------------------- | ------------------------------------------------ |
| iOS 模拟器     | `pnpm run app ios`                     | `pnpm run app ios --release`                     |
| iOS 真机       | `pnpm run app ios --target device`     | `pnpm run app ios --target device --release`     |
| Android 模拟机 | `pnpm run app android`                 | `pnpm run app android --release`                 |
| Android 真机   | `pnpm run app android --target device` | `pnpm run app android --target device --release` |

iOS 默认目标是 `simulator`，Android 默认是 `emulator`，两者默认配置都是 `debug`。其余需求追加参数：

```sh
pnpm run app ios --device "iPhone 17 Pro"
pnpm run app android --target device --skip-build
pnpm run app ios --target device -- --verbose
```

选项语义：

- `--device <名称|UDID|序列号>`：名称按不区分大小写的子串匹配。省略时，iOS 模拟器优先选择已启动
  的那台，iOS 真机优先选择已连接的那台；仍无法判定唯一目标时报错并列出候选，不随机挑选。
- `--skip-build`：复用产物目录中最新的匹配包，用于重复安装同一次构建。
- `--no-launch`：安装后不拉起。
- `--open`：打开 Xcode 或 Android Studio，不直接运行。
- `--`：其后参数原样传给 Tauri CLI。

Android 的 ABI 由目标设备决定：脚本读取 `ro.product.cpu.abi` 并只构建对应 target，因此不会为
一次真机验证编译四套 ABI。iOS 模拟器切片按主机架构选择 `aarch64-sim` 或 `x86_64`。

## 4. 产物与 origin

安装脚本不自行拼接 API 地址。构建前它调用 `scripts/build-app.js` 的同一套校验并打印生效 origin，
因此非法组合在 Rust 编译前就会失败。默认值和覆盖规则见
[Tauri 移动端基础设施](tauri-mobile.md) 第 4 节。

连接局域网 API 的包必须显式开启不安全开关，例如：

```sh
IMS_ALLOW_INSECURE_LAN_APP_ORIGIN=1 \
VITE_IMS_API_ORIGIN=http://192.168.31.169:3000 \
VITE_IMS_MAP_TRANSPORT_ORIGIN=http://192.168.31.169:1420 \
pnpm run app ios --target device --release
```

产物位置固定在 `src-tauri/gen/` 下，脚本按修改时间选出本次构建的包：

- iOS 模拟器：`gen/apple/build/<arch>-sim/<productName>.app`
- iOS 真机：`gen/apple/build/<arch>/<productName>.ipa`，安装前解包到 `gen/apple/build/.device-install/`
- Android：`gen/android/app/build/outputs/apk/<abi>/<profile>/*.apk`

## 5. 签名边界

iOS 真机包通过 `--export-method debugging` 导出，适用于开发签名的侧载安装。需要 TestFlight 或
商店导出时用 `IMS_IOS_EXPORT_METHOD` 覆盖为 `release-testing` 或 `app-store-connect`，并自行准备
对应描述文件。

Android Release 构建在未配置 signing key 时产出 `-unsigned` APK，无法安装。脚本默认拒绝安装这类
包并说明原因。仅在本机验证时可以显式开启本地签名：

```sh
IMS_ANDROID_LOCAL_SIGNING=1 pnpm run app android --target device --release
```

它用 `~/.android/debug.keystore` 经 `zipalign` 与 `apksigner` 重新签名，只为让 Release 构建能在本机
装上。**正式分发必须使用受管上传密钥，不得复用 debug keystore**，该开关也不得写入仓库或长期 shell
配置。

## 6. 热重载会话

安装自包含包适合验收和交付；改一行代码就要看效果时改用热重载会话：

```sh
pnpm run app ios --live
pnpm run app android --live
```

它转发到 `tauri <platform> dev`，前端由 `dev:app` 提供，API 与媒体走同源转发，因此使用本机数据库、
对象存储和站点包。真机联调需要局域网地址：

```sh
pnpm run app ios --live --host
```

`--host` 不带值时脚本探测本机私网 IPv4 并显式传给 Tauri，探测不到时报错要求手动指定。会话语义与
限制见 [Tauri 移动端基础设施](tauri-mobile.md) 第 3 节。

## 7. 排障

| 现象                     | 原因与处理                                                     |
| ------------------------ | -------------------------------------------------------------- |
| `:buildSrc` 配置阶段失败 | JDK 超出 17-21，按 2.3 节切换 `JAVA_HOME`                      |
| 找不到 adb / SDK         | `ANDROID_HOME` 未导出，运行 `pnpm run app:doctor` 查看解析结果 |
| Release APK 拒绝安装     | 产物未签名，见第 5 节                                          |
| iOS 归档缺少签名身份     | 未设置 `TAURI_APPLE_DEVELOPMENT_TEAM`                          |
| 提示存在多个目标         | 用 `--device` 指定，或先运行 `pnpm run app devices`            |
| 找不到产物               | 上一次构建失败，去掉 `--skip-build` 重新构建                   |

改动安装链路、脚本参数或平台工具契约时，同一变更更新本文件并运行：

```sh
pnpm run check:rules
pnpm run test:infra
```
