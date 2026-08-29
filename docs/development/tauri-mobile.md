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

- 跨源认证走 `Authorization: Bearer`，CORS 已放行打包客户端 origin，见第 5 节。

尚未落地的部分见第 6 节。**打包后的应用可以登录并调用 Platform API，
但仍有约 43 处组件的媒体地址依赖同源解析。**

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
- 非空时三个 alova client 统一加前缀，且请求 `credentials` 从 `same-origin` 切换为 `omit`：
  打包客户端用 Bearer 令牌认证，不需要任何 cookie 越过边界，API 也不下发凭据许可。
- API 响应里回传的媒体 URL 用 `resolveMediaUrl()` 归一化；绝对地址、协议相对地址和 data URI 原样透传。
- 需要拼接站点 origin 的位置用 `resolveSiteOrigin()`，不要直接读 `window.location.origin`。

路径 builder 本身仍由 `@imsweb/contracts/paths` 单一持有，前缀注入只发生在 client 层，
详见 [URL 与公共路径架构](../architecture/url-paths.md)。

## 5. Platform 令牌认证

跨源 WebView 没有和 API 共享的 cookie jar：API 下发的 `Set-Cookie` 会被丢弃，
CSRF 双提交也无从读起。因此 Platform realm 增加了一条显式的令牌通道，Web 不受影响。

请求头约定：

- `X-IMS-Auth-Mode: bearer`：调用方声明自己保管令牌。带这个头时，
  `/login`、`/register`、`/refresh` 会在响应体里回传 `accessToken` 与 `refreshToken`。
  浏览器构建从不发送它，access token 仍然只存在于 httpOnly cookie 中。
- `Authorization: Bearer <accessToken>`：认证中间件本就优先读它，且这条来源会跳过 CSRF 校验。
- `X-IMS-Refresh-Token: <refreshToken>`：刷新端点在没有 cookie 时从这里取轮换凭据。
  请求头无法被跨站表单伪造，因此这条路径不再要求 CSRF 双提交；
  cookie 来源的刷新仍然强制校验。

CORS 侧 `allowedCorsOrigin` 除 loopback 外放行 `tauri://localhost`、`http(s)://tauri.localhost`，
且**不**下发 `Access-Control-Allow-Credentials`——凭据不越界是这套设计的前提。

Web 侧由 `apps/web/app/lib/api/platform-token-store.ts` 保管令牌：
仅在 `VITE_IMS_API_ORIGIN` 非空时启用，写 `localStorage` 并在内存中镜像一份，
登出与刷新失败时清空。`hasPlatformSessionHint()` 因此在打包客户端读本地令牌，
而不是读取不到的 CSRF cookie。

**已知取舍**：`localStorage` 不是安全存储。当前 WebView 只加载本地打包资源，没有第三方脚本，
但换用系统钥匙串（Tauri secure storage 插件）仍是后续改进项。

## 6. 阻塞项

以下工作仍未完成：

1. **媒体 URL**：约 43 个组件把 API 返回的 URL 直接写进 `src`，依赖浏览器按当前页面解析相对地址。
   已收敛 6 处到 `resolveSafeMediaUrl()`，其余（Wiki 事务所与偶像图标、名片正反面、
   关于页头图、制作人地图、直播、编年史封面）跨源后仍会失效。
2. **Backoffice realm**：令牌通道只做了 Platform。app 产物已排除全部 admin 路由，
   所以这不阻塞打包客户端；若将来要在移动端进入后台，需要同样的改造。
3. **应用图标**：`src-tauri/icons/` 仍是 Tauri 默认占位图。仓库现有品牌资源是 545×188 字标，
   不能直接用作方形应用图标，需要单独产出 1024×1024 图源后用 `tauri icon` 生成。
4. **真机验证**：以上链路目前只有契约测试覆盖，尚未在真实设备上完成一次登录到拉取列表的联调。
