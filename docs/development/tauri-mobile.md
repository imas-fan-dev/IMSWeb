# Tauri 移动端基础设施

> 文档类型：开发
> 状态：Active
> 权威来源：`apps/web/src-tauri/tauri.conf.json`、`apps/web/app/lib/api/origin.ts` 和 `apps/web/package.json`

本文件描述 Web workspace 中 Tauri 2 移动端外壳的当前状态、前置条件和尚未打通的契约。
桌面与移动构建复用同一份 React Router SPA 产物，不存在第二套前端源码。

本文件不描述应用商店发布、签名证书管理和灰度策略。

## 1. 当前状态

已经落地的部分：

- `apps/web/src-tauri/` 由官方 CLI 生成，crate 名 `imsweb`，bundle identifier `top.idol-master.imsweb`。
- `tauri.conf.json` 的 `frontendDist` 指向 `../build/client`，即 `react-router build` 的 SPA 产物。
  该产物已包含 `__spa-fallback.html`，客户端路由无需额外的服务端回退。
- `apps/web/app/lib/api/origin.ts` 提供跨源 origin 契约，三个 alova client 均已接入 `baseURL`。
- Rust 侧 `cargo check` 通过；iOS 与 Android 的 Rust target 已安装。

尚未落地、且会阻塞真机联调的部分见第 5 节。**在这些项完成之前，打包后的应用可以渲染界面，
但所有 API 请求都会失败。**

## 2. 前置条件

Rust target（已安装，重建环境时需要）：

```sh
rustup target add aarch64-apple-ios aarch64-apple-ios-sim x86_64-apple-ios
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

iOS 还需要完整 Xcode（非仅 Command Line Tools）和 CocoaPods。

Android 需要 Android Studio 安装 SDK Platform、Platform-Tools、Build-Tools、Command-line Tools
和 NDK (Side by side)，并导出：

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 $ANDROID_HOME/ndk | tail -1)"
```

本地环境的其余部分沿用 [AI 开发环境](ai-environment.md)。

## 3. 命令

Web workspace 只暴露一个 `tauri` 透传脚本，子命令原样传给 Tauri CLI：

```sh
pnpm --filter @imsweb/web run tauri dev            # 桌面 WebView 联调
pnpm --filter @imsweb/web run tauri ios init       # 生成 gen/ios，仅需一次
pnpm --filter @imsweb/web run tauri ios dev
pnpm --filter @imsweb/web run tauri android init   # 生成 gen/android，仅需一次
pnpm --filter @imsweb/web run tauri android dev
```

`init` 会在 `src-tauri/gen/` 下生成平台工程。执行前先确认 identifier 与签名归属，
identifier 变更后需要重新生成。

真机联调时 Tauri 会导出 `TAURI_DEV_HOST`，`vite.config.ts` 据此把 dev server 绑定到 LAN 地址
并固定 HMR 端口；未设置时开发行为与纯 Web 完全一致。

## 4. 跨源 API 契约

Web 构建中前端与 Hono 同源，请求保持相对路径。移动端 WebView 从本地 scheme 加载页面，
相对路径无法抵达 API，因此引入构建期变量 `VITE_IMS_API_ORIGIN`：

```sh
VITE_IMS_API_ORIGIN=https://idol-master.top pnpm --filter @imsweb/web run tauri ios build
```

该变量由 Vite 内联进浏览器代码，属于公开值，不得写入任何密钥。约定如下：

- 留空时 `API_ORIGIN` 为空串，alova 拼接结果与改造前逐字节一致，Web 行为不变。
- 非空时三个 alova client 统一加前缀，且请求 `credentials` 从 `same-origin` 切换为 `include`。
- API 响应里回传的媒体 URL 用 `resolveMediaUrl()` 归一化；绝对地址、协议相对地址和 data URI 原样透传。
- 需要拼接站点 origin 的位置用 `resolveSiteOrigin()`，不要直接读 `window.location.origin`。

路径 builder 本身仍由 `@imsweb/contracts/paths` 单一持有，前缀注入只发生在 client 层，
详见 [URL 与公共路径架构](../architecture/url-paths.md)。

## 5. 阻塞项

以下工作必须完成，移动端才能真正联调。它们都涉及 API 侧或跨模块改造，不属于本次基础设施范围：

1. **CORS**：`apps/api` 目前只允许 loopback origin，且未下发 `Access-Control-Allow-Credentials`。
   需要放行打包后的 WebView origin 并开启凭据。
2. **会话 Cookie**：`SameSite=Lax` 不会随跨站请求发送。要么放宽为 `None; Secure`，
   要么改用 API 已经支持但 Web 未使用的 `Authorization: Bearer` 通道。
3. **CSRF**：双提交模式依赖 `document.cookie` 读取非 httpOnly 的 CSRF cookie，跨源后读不到。
   该方案需要跟随第 2 项一并重新设计。
4. **媒体 URL**：约 41 个组件把 API 返回的 URL 直接写进 `src`，依赖浏览器按当前页面解析相对地址。
   这些位置需要改为走 `resolveMediaUrl()`。
5. **地图资源**：`exchange-map-model.ts` 的同源校验会拒绝全部跨源地图资源，调用点需改用 `resolveSiteOrigin()`。
6. **应用图标**：`src-tauri/icons/` 仍是 Tauri 默认占位图。仓库现有品牌资源是 545×188 字标，
   不能直接用作方形应用图标，需要单独产出 1024×1024 图源后用 `tauri icon` 生成。
