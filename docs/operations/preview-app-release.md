# 预览 App 发布

> 文档类型：运维
> 状态：Active
> 权威来源：`.github/workflows/release-preview-app.yml`、`apps/web/scripts/app-release.js`、`scripts/deployment/render-preview-app-release-notes.sh`

本文件描述如何把 `release/v1.1` 的 Tauri 移动外壳构建成 iOS/Android 预览安装包并发布到
GitHub Release，供人工测试者自助安装。移动外壳本身的结构、跨源 API 契约和阻塞项见
[Tauri 移动端基础设施](../development/tauri-mobile.md)；设备安装与前置依赖体检见
[App 设备安装与前置依赖](../development/app-device-delivery.md)。本文件不描述正式应用商店
发布、证书签发或灰度策略。

## 1. 触发方式

`.github/workflows/release-preview-app.yml` 只构建 `release/v1.1` 可达的提交，按平台独立触发，
互不阻塞：

- 推送匹配 `app-preview-ios-*` 或 `app-preview-android-*` 的 tag 会自动触发对应平台的构建。
  tag 后缀不做任何解析，仅需在仓库内唯一，例如：

  ```sh
  git tag app-preview-ios-$(date +%s)
  git push origin app-preview-ios-$(date +%s)
  ```

- 或者在 GitHub Actions 页面手动运行 `Release preview app` workflow，选择 `platform`
  （`ios` 或 `android`）并勾选确认。

两种触发方式都会校验目标提交必须可从 `origin/release/v1.1` 到达，否则任务失败。

## 2. 版本号

可见版本号（GitHub Release 的 tag、标题，以及 App 自身的
`CFBundleShortVersionString` / Android `versionName`）统一使用太平洋时间
`YYYYMMDDHHmm`，作为 `MAJOR.MINOR.PATCH-preview.<时间戳>` 的预发布标识附加在
`tauri.conf.json` 的基础版本号后（见 `apps/web/scripts/app-release.js` 的
`previewVersion()`）。Release tag 固定为 `app-preview-<platform>-<时间戳>`。

iOS `--build-number` 与 Android `versionCode` 都是有界的数值字段（Android 上限
2,100,000,000），12 位的时间戳本身放不下，因此另外计算一个从固定基准时间起的分钟数作为纯
内部构建号（基准时间硬编码在 `release-preview-app.yml` 的 `resolve` job 里），同一个数值
同时写入两端，用户不会直接看到它。

## 3. 签名边界

- **iOS**：`tauri ios build --no-sign` 产出完全未签名的 IPA，不需要
  `TAURI_APPLE_DEVELOPMENT_TEAM`。用户侧通过 Sideloadly 之类的工具用自己的 Apple ID
  在本地重新签名安装，7 天后需要重新安装（Apple 对免费开发者签名的限制），细节见
  `scripts/deployment/render-preview-app-release-notes.sh` 渲染进 Release 正文的用户向导。
- **Android**：未签名 APK 无法直接安装，但预览分发不需要 App Store 级别的信任，只要有
  任意有效签名即可。仓库为此单独生成了一个专用"预览签名"密钥（`keytool -genkeypair`，
  别名 `androiddebugkey`，口令 `android`，与 `apps/web/scripts/app-device.js` 现有的
  `signApkLocally()` 本地验证约定一致），仅用于让用户在多个预览版本之间原地覆盖升级，
  不代表任何身份或分发资质，**不得**用于正式上架。密钥以 base64 编码存放在 GitHub
  Environment `preview` 的 `PREVIEW_ANDROID_KEYSTORE_BASE64` secret 中，CI 运行时解码到
  `$HOME/.android/debug.keystore`，构建结束后立即删除临时文件。

## 4. 构建产物与跨源配置

两端构建都显式设置 `VITE_IMS_API_ORIGIN` 与 `VITE_IMS_PUBLIC_SITE_ORIGIN` 为
`https://preview.idol-master.top`，产物因此只会连接 preview 后端，不会污染生产或本地开发
环境；跨源 origin 契约与已知阻塞项见
[Tauri 移动端基础设施](../development/tauri-mobile.md) 第 4 节与第 6 节——尤其是约 43 处
组件仍依赖同源解析的已知限制，预览包会继承这一限制。

构建统一走 `apps/web/scripts/app-release.js`，本地也可以直接调用来复现 CI 产物：

```sh
cd apps/web
VITE_IMS_API_ORIGIN=https://preview.idol-master.top \
VITE_IMS_PUBLIC_SITE_ORIGIN=https://preview.idol-master.top \
node scripts/app-release.js ios --version-suffix 202609111930 --build-number 400000
node scripts/app-release.js android --version-suffix 202609111930 --build-number 400000
```

产物写入 `apps/web/dist/app-release/`（gitignore 覆盖的派生目录）。iOS 需要 macOS 主机、完整
Xcode 和 `aarch64-apple-ios` Rust target；Android 需要 Java 17-21、Android SDK/NDK 和
`aarch64-linux-android` Rust target，与 [App 设备安装与前置依赖](../development/app-device-delivery.md)
第 2 节的前置依赖一致，可用 `pnpm run app:doctor` 体检。

## 5. 排障

| 现象 | 原因与处理 |
| -------------------------------------- | --------------------------------------------------------------------------- |
| iOS 归档报 `IPHONEOS_DEPLOYMENT_TARGET` 超出范围 | 本机或 runner 的 Xcode 版本已提高最低支持的部署目标；`tauri.ios.conf.json` 的 `minimumSystemVersion` 需要相应上调 |
| `xcodebuild` 报 `cannot be opened because it is in a future Xcode project file format` | Tauri 生成的 iOS 工程模板所用的 project 文件格式版本需要较新的 Xcode 才能打开；`build-ios` job 因此固定用 `runs-on: macos-26`（默认自带最新 Xcode），不要降级到更旧的 runner 镜像 |
| Android APK 提示签名不一致，无法覆盖安装 | 预览签名密钥被重新生成过；用户需要先卸载旧版本再安装新版本 |
| `--build-number` 或 Android `versionCode` 报超出范围 | 只应发生在系统时间被错误设置到基准时间之前；检查 runner/本机时钟 |
| 本机重复清理/重建 `src-tauri/gen/apple` 后，iOS 真机归档提示 Swift 符号未定义（`swift_rs` / `native-glass` 相关符号） | 已确认为本机构建缓存问题，不是真实的代码/配置缺陷：在 `macos-26` runner 的全新 checkout 上多次验证未复现；本机复现时先清空 `src-tauri/target` 与 `src-tauri/gen/apple` 后重新构建 |

改动触发方式、版本号规则或签名边界时，同一变更更新本文件并运行：

```sh
pnpm run check:rules
pnpm run test:infra
```
