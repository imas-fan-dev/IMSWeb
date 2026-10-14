# Tauri 应用与浏览器的区分

## 1. Web 端现有的「运行在 Tauri 内」判定

有两个独立的信号，仓库里通常组合使用。

**信号一：`IS_APP_TARGET`（构建期常量）**
`apps/web/app/lib/app-target.ts:8`：

```
export const IS_APP_TARGET = import.meta.env.VITE_IMS_APP_TARGET === "app"
```

注释说明该值被 Vite 内联，Web 打包结果里是常量 `false`。

**信号二：`isTauri()`（运行时探测）**
来自 `@tauri-apps/api/core`，实现见 `apps/web/node_modules/@tauri-apps/api/core.js:278-281`：

```
function isTauri() {
    return !!(globalThis || window).isTauri;
}
```

判定依据是 WebView 里注入的 JS 全局变量，**不是 UA 字符串**。

**组合用法**（既有事实，遍布 Web 端）：
- `apps/web/app/lib/native-glass.ts:58`、`:73-79`
- `apps/web/app/lib/geolocation.ts:130`
- `apps/web/app/lib/navigation/system-opener.ts:6`
- `apps/web/app/components/shared/tauri-interaction-guard.tsx:30`
- `apps/web/app/components/app/app-navigation-provider.tsx:287`

形如 `if (!IS_APP_TARGET || !isTauri()) return`：先挡掉 Web 构建，再做运行时确认。

## 2. 服务端能不能拿到这个信号

不能。在 `apps/api/src` 全量 grep `isTauri` / `__TAURI__` / `IS_APP_TARGET`，零命中。API 只看到 HTTP 请求，看不到 WebView 的 JS 全局。

设备列表的 `current` 判断来自访问令牌的 `sessionId`（`list-sessions.ts:10`），与客户端类型无关。

## 3. 线上唯一现成的端类型信号

请求头 `X-IMS-Auth-Mode: bearer`：
- 常量：`apps/web/app/lib/api/platform-token-store.ts:17-18`
- 发送：`request.ts:66-73`，条件是 `usesPlatformBearerAuth && options.authRealm === "platform"`，而 `usesPlatformBearerAuth = isCrossOriginApi`（`platform-token-store.ts:15`）
- 接收：`contracts/session.ts:107-109`

既有事实：该头**只在建立会话之后**的请求上出现，且**没有持久化**。登录请求本身不带它以区分设备（它由 `isCrossOriginApi` 推导，打包客户端恒为真，浏览器恒为假）。所以列表无法回溯判断某一历史会话是不是打包客户端。

## 4. Tauri 是否设置了自定义 UA

既有事实：
- `apps/web/src-tauri/tauri.conf.json` 的 `app.windows[0]` 只有 `title` / `width` / `height` / `resizable` / `fullscreen`，没有 `userAgent`。
- `apps/web/src-tauri/tauri.android.conf.json` 只设置 `bundle.android.debugApplicationIdSuffix`。
- `apps/web/src-tauri/tauri.ios.conf.json` 只设置 `bundle.iOS.minimumSystemVersion` 与 `infoPlist`。
- 对 `apps/web/src-tauri` 全目录 grep `user.?agent`（含 Rust、JSON、TOML、plist），零命中。
- wry 0.55.1（Tauri 2.11.5 的 WebView 层）默认 `user_agent: None`（`~/.cargo/registry/src/.../wry-0.55.1/src/lib.rs:818`），只有显式传入时才落到 `setCustomUserAgent`（`wkwebview/mod.rs:648-649`，iOS）或 Android WebView 设置（`android/main_pipe.rs:220-226`）。
- Tauri 的配置 schema 里确实存在窗口级 `userAgent`（描述为 "The user agent for the webview"），当前项目没有使用。

结论：Tauri 壳没有给 UA 打任何标记，客户端发给 API 的就是所在 WebView 的默认 UA。

## 5. 能否区分「iOS 应用 / iOS 浏览器」

严格回答：**现有数据下无法可靠区分，只能做启发式判断。**

既有事实支撑：
- iOS 应用跑的是 WKWebView，UA 由系统 WebView 生成，不含应用名。
- iOS Safari 与 WKWebView 的默认 UA 在结构上确实不同。

推断（非既有事实，需要真机取样验证）：
- iOS Safari 的 UA 带 `Version/<x.y>` 与 `Safari/604.x` 段。
- 应用内 WKWebView 的 UA 通常停在 `... (KHTML, like Gecko) Mobile/15E148`，没有 `Version/` 与 `Safari/` 段。
- 因此「有 `Safari/` 段 = iOS 浏览器，无 `Safari/` 段 = iOS 应用」是一个可用的启发式，但同样会命中其它 App 的 WebView 和部分 App 内浏览器。

Android 侧情况类似：
- 推断：Android WebView 的 UA 含 `; wv` 与 `Version/4.0`，Chrome 浏览器不含。
- 但如果 Tauri 使用了自定义 UA（当前没有），或用户用的是别的 App 内 WebView，`wv` 特征会误判为「应用」。

## 6. 让区分变可靠的两种做法（供设计参考，未实施）

1. 给 Tauri 外壳配置自定义 UA（`tauri.conf.json` 与两个平台 conf 的窗口级 `userAgent`，或 Rust 侧 `.user_agent(...)`），例如追加 `IMSWebApp/0.1`。之后解析器只要查这个标记即可，历史行仍然是旧 UA。
2. 写入侧增加客户端类型列，浏览器与打包客户端分别上报。这需要改契约、迁移与 API 写入路径，超出「仅展示层解析」的范围。

两者都只能影响之后的会话，迁移前建立的会话（`user_agent` 为 NULL 或旧格式）仍然只能走启发式或显示「未知设备」。
