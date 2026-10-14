# Tauri app 的深链与外部浏览器能力现状

范围：`apps/web/src-tauri/`（以仓库内配置源为准）与 `apps/web/package.json`。
`apps/web/src-tauri/gen/` 是派生产物，按 `AGENTS.md` 不作为配置来源。

## 1. 自定义 URL scheme / universal link / app link

**不存在。**

- `apps/web/src-tauri/Info.ios.plist:1-47` 只有 `NSAppTransportSecurity`、`NSLocalNetworkUsageDescription`、`NSLocationWhenInUseUsageDescription`、`UIApplicationSceneManifest`。**没有 `CFBundleURLTypes`**，因此没有注册自定义 scheme，也没有 universal link 所需的 `com.apple.developer.associated-domains`。
- `apps/web/src-tauri/tauri.conf.json:1-37` 没有 `plugins.deep-link` 段，没有 `app.deepLink` 配置。
- `apps/web/src-tauri/tauri.conf.json` 的 `bundle` 段（`:26-36`）只有 `active` / `targets` / `icon`。
- `apps/web/src-tauri/Info.ios.plist` 之外没有其他 plist 覆盖文件；`tauri.ios.conf.json`（`:1-7`）只设了 `minimumSystemVersion` 和 `infoPlist` 指向，`tauri.android.conf.json`（`:1-6`）只设了 `debugApplicationIdSuffix`。
- Android 的 `AndroidManifest.xml` 只存在于 `src-tauri/gen/android/...`（派生产物），仓库里没有手写源。因此当前没有任何地方声明 `<intent-filter>` 或 `android:scheme`。

## 2. 已安装的插件

`apps/web/src-tauri/Cargo.toml:21-36`：

- `tauri-plugin-log`（`:26`）
- `tauri-plugin-opener`（`:27`）
- `tauri-plugin-dialog`（`:28`）
- `tauri-plugin-fs`（`:29`）
- 移动端专属：`tauri-plugin-geolocation`（`:32`）、本地插件 `tauri-plugin-native-glass`（`:33`）
- iOS 专属：本地插件 `tauri-plugin-native-image`（`:36`）、`objc2`（`:39`）

注册处：`apps/web/src-tauri/src/lib.rs:32-41`。

前端依赖：`apps/web/package.json` 有 `@tauri-apps/api`、`@tauri-apps/plugin-fs`、`@tauri-apps/plugin-geolocation`、`@tauri-apps/plugin-opener`。

**没有 `tauri-plugin-deep-link`、`tauri-plugin-shell`、`tauri-plugin-http`、`tauri-plugin-websocket`、`tauri-plugin-localhost`。** 在 `pnpm-lock.yaml`、`apps/web/package.json`、`apps/web/src-tauri/Cargo.toml` 里全文搜索 `deep-link` / `plugin-shell` 均无命中。

## 3. in-app 浏览器可用性（对应调研问题 5）

### 3.1 现有的「打开外部 URL」封装

有，而且已经收敛成一层：

- `apps/web/app/lib/navigation/system-opener.ts:5-7` —— `shouldUseSystemOpener() = IS_APP_TARGET && isTauri()`。
- `:9-19` `BLOCKED_SYSTEM_PROTOCOLS`：`about:` / `asset:` / `blob:` / `content:` / `data:` / `file:` / `filesystem:` / `javascript:` / `tauri:`。
- `:21-38` `normalizeSystemUrl` 拒绝带用户名密码的 URL 和上述 scheme。
- `:44-56` `openSystemUrl` —— 动态 `import("@tauri-apps/plugin-opener")` 后 `openUrl(normalizedUrl)`。
- 声明式入口：`apps/web/app/components/navigation/navigation-link.tsx:69-81`（`decision.kind === "system"` 时 `event.preventDefault()` + `openSystemUrl`）。
- 命令式入口：`apps/web/app/lib/navigation/use-navigation.ts:33-38`。
- 决策层：`apps/web/app/lib/navigation/resolve-navigation.ts:142-148`（带 scheme 的 URL 在 app target 下返回 `{kind:"system"}`）、`:87-101`（`publicPage` 语义）。
- 权限：`apps/web/src-tauri/capabilities/default.json:8-22` 允许 `opener:allow-open-url` 匹配 `*`，deny 掉上面那批 scheme。

`openUrl` 走的是**系统浏览器**（iOS 上等价于 `UIApplication.open`），不是 WebView 内的 SFSafariViewController/Chrome Custom Tabs。也就是说：**它把用户送出 app，送不回来。**

### 3.2 在 app 内打开 OAuth 授权页，现在有没有可用的现成工具

**没有可用的完整工具。** 有的只是「打开外部浏览器」这一半：

- 可用：`openSystemUrl(...)` 能把授权页交给系统浏览器（需要显式传绝对 HTTPS URL，`normalizeSystemUrl` 会拒绝 `tauri:` 等 scheme）。
- 缺失：授权完成后的回跳通道。没有 deep link 插件、没有注册 scheme，因此系统浏览器里完成的授权无法把结果交回 app。

### 3.3 需要新增什么

按最小依赖判断：

- `tauri-plugin-deep-link`（Rust crate + npm 包 `@tauri-apps/plugin-deep-link`），并在 iOS `Info.ios.plist` 加 `CFBundleURLTypes`、在 Android 侧声明 intent-filter。由于 `src-tauri/gen/` 不手改，Android 的 manifest 变更需要走 Tauri 的 Android 工程生成流程或 `src-tauri/gen` 之外的可配置入口（当前仓库未见此类入口，见第 4 节）。
- 若要 in-app 浏览器而不是外跳，需要额外方案（例如 `tauri-plugin-opener` 不提供；iOS 需自定义 Swift/objc2 打开 `SFSafariViewController`，Android 需 Custom Tabs）。仓库现有本地插件范式可参考 `apps/web/src-tauri/plugins/native-glass`、`native-image`。

## 4. Android manifest 的可配置性

`gen/` 确实被忽略：`apps/web/src-tauri/.gitignore:10` 是 `/gen/`，`git check-ignore` 对 `apps/web/src-tauri/gen/android/app/src/main/AndroidManifest.xml` 有命中，`git ls-files apps/web/src-tauri/gen` 无输出。

遗留问题：Android 的 scheme 声明只能落在生成的 `AndroidManifest.xml` 里，而该文件所在目录被忽略。`tauri.conf.json`（`apps/web/src-tauri/tauri.conf.json:1-37`）没有注入 intent-filter 的字段。仓库里已有的应对范式是 `scripts/android-release-network.js`（`apps/web/scripts/build-app.js:7, 112` 引用），它在每次 app build 之后重新应用生成的 Android 工程变更，并由 `docs/development/tauri-mobile.md:198-203` 记录。

推断：自定义 scheme 的 Android 声明需要一个同类的「构建后重新应用」脚本，或者一个本地 Tauri 插件。这决定「深链方案能否只靠配置落地」，需要在本子任务设计阶段确认。

## 5. 相关文档已有结论

`docs/development/tauri-mobile.md:321-323` 已经是仓库内权威记录：

> **Platform OAuth**：当前 callback 建立 cookie session，并重定向到 API origin 下的页面；这与 App 的 Bearer token 和本地 WebView 返回地址不兼容。App 暂不显示 OAuth provider，后续需要 deep link 与一次性 token exchange 后才能开放。

即：本子任务的目标与文档记录的方向一致，而且文档已经把方案粗定为「deep link + 一次性 token exchange」。
