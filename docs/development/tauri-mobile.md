# Tauri 移动端基础设施

> 文档类型：开发
> 状态：Active
> 权威来源：`apps/web/src-tauri/tauri.conf.json`、`apps/web/src-tauri/tauri.android.conf.json`、`apps/web/src-tauri/tauri.ios.conf.json`、`apps/web/src-tauri/Info.ios.plist`、`apps/web/src-tauri/Cargo.toml`、`apps/web/src-tauri/src/lib.rs`、`apps/web/src-tauri/capabilities/geolocation.json`、`apps/web/src-tauri/icon-sources/app-icon.json`、`apps/web/src-tauri/plugins/native-glass/`、`apps/web/app/lib/geolocation.ts`、`apps/web/app/lib/native-glass.ts` 和 `apps/web/package.json`

本文件描述 Web workspace 中 Tauri 2 移动端外壳的当前状态、前置条件和尚未打通的契约。
桌面与移动构建复用同一份 React Router SPA 产物，不存在第二套前端源码。

本文件不描述应用商店发布、签名证书管理和灰度策略。设备安装链路的前置依赖体检、命令矩阵和
签名边界见 [App 设备安装与前置依赖](app-device-delivery.md)。

## 1. 当前状态

已经落地的部分：

- `apps/web/src-tauri/` 由官方 CLI 生成，crate 名 `imsweb`，bundle identifier `top.idol-master.imsweb`。
- `tauri.conf.json` 保存各平台共用的构建、窗口与图标设置；其 `frontendDist` 指向
  `../build-app/client`，即 app target 独立的 SPA 产物。普通 Web 产物仍写入
  `../build/client`，两种构建不会互相覆盖。app 产物已包含 `__spa-fallback.html`，客户端路由
  无需额外的服务端回退。
- Tauri 自动将 `tauri.android.conf.json` 或 `tauri.ios.conf.json` 合并到基础配置。Android 配置
  只管理调试 application ID 后缀，iOS 配置只管理最低系统版本。平台文件以 JSON Merge Patch
  覆盖基础字段，数组会整体替换，因此共享字段必须继续留在基础配置。
- `src-tauri/icon-sources/app-icon.json` 为 iOS、桌面和 Android 统一生成图标。Android 使用独立背景、
  透明前景和单色图层；adaptive icon 的字标位于安全区，旧版 launcher 图标单独放大前景。
- `Info.ios.plist` 是 iOS 专属声明，Tauri 会在生成 Apple 工程时自动合并。它包含事务所地图使用期间定位的用途说明。
- `apps/web/app/lib/api/origin.ts` 提供跨源 origin 契约，三个 alova client 均已接入 `baseURL`。
- `build:app` 默认注入并校验 `https://idol-master.top`；`dev:app` 清空 API origin，
  让 Tauri dev URL 同源转发请求至本地 1420，再由 Vite 代理到 Hono。
- 站点公开地址由 `VITE_IMS_PUBLIC_SITE_ORIGIN` 单独表达，供复制外发的链接使用，见第 4 节。
- 外部 URL 在真实 Tauri runtime 中由 opener 插件交给系统浏览器或已注册 App，不替换当前
  WebView。支持 HTTP(S)、邮件、电话和自定义 App scheme；前端与 capability 都拒绝可执行或
  本地资源 scheme。
- Rust 侧 `cargo check` 通过；iOS 与 Android 的 Rust target 已安装。
- iOS 26 及以上通过仓库内 `native-glass` Tauri 插件安装系统 `UITabBarController` 底栏；它使用与
  React 相同的 Lucide 图标，宽度和安全区间距由 UIKit 自适应。iOS 26 以下与 Android 保留 Web 底栏，
  但不启用手指位置追踪或白色触点高光。
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
和 NDK (Side by side)，并使用 Gradle 8.14 支持的 Java 21。Java 25/26 会在 `:buildSrc` 配置阶段
失败。导出：

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export NDK_HOME="$ANDROID_HOME/ndk/$(ls -1 $ANDROID_HOME/ndk | tail -1)"
export JAVA_HOME=/opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
```

未配置 Release signing key 时，Tauri 会生成 unsigned APK，不能直接安装。模拟器验证可用 Android
SDK `zipalign` 与 `apksigner` 加本机 debug keystore 签名；正式分发必须按 Android 发布流程使用
受管上传密钥，不能复用 debug keystore。

以上前置条件由 `pnpm run app:doctor` 逐项检查并给出修复命令，安装步骤见
[App 设备安装与前置依赖](app-device-delivery.md)。本地环境的其余部分沿用
[AI 开发环境](ai-environment.md)。

## 3. 命令

设备安装走 `app:*` 封装脚本，见 [App 设备安装与前置依赖](app-device-delivery.md)；
下列命令是它们底层使用的 Tauri 透传入口，子命令原样传给 Tauri CLI：

```sh
pnpm --filter @imsweb/web run dev:app              # 只启动 1420 App Web 开发服务
pnpm --filter @imsweb/web run test:e2e:app          # App 安全区与底栏浏览器矩阵
pnpm --filter @imsweb/web run icon:app              # 从 manifest 重建所有平台图标
pnpm --filter @imsweb/web run tauri dev            # 桌面 WebView 联调
pnpm --filter @imsweb/web run tauri ios init       # 生成 gen/apple，仅需一次
pnpm --filter @imsweb/web run tauri ios dev        # iOS 模拟器
pnpm --filter @imsweb/web run tauri ios dev --host <开发机局域网 IP> [设备名]
pnpm --filter @imsweb/web run tauri android init   # 生成 gen/android，仅需一次
pnpm --filter @imsweb/web run tauri android dev    # Android 模拟器
pnpm --filter @imsweb/web run tauri android dev --host <开发机局域网 IP> [设备名]
```

Tauri 的 `dev` 和 `build` 会先运行 `icon:app`，因此 Android 生成工程被删除或重建后仍会恢复专用图层。`icon:app` 还会规范化 ICNS 顶层块顺序，使相同输入的重复生成不产生二进制差异。
修改 `public/brand/imsweb-app-icon.png` 或 `src-tauri/icon-sources/` 后，也可以单独运行该命令检查派生图标。

`init` 会在 `src-tauri/gen/` 下生成平台工程。执行前先确认 identifier 与签名归属，
identifier 变更后需要重新生成。`gen/` 始终是派生产物；iOS 原生源码放在
`src-tauri/plugins/native-glass/ios/`，由插件 `build.rs` 在每次生成时接入 Swift Package，
不得把实现写进 `gen/apple`。

### iOS 26 原生 Liquid Glass

App 底栏采用运行时能力协商，而不是只解析 User-Agent：React 仅在真实 iOS Tauri runtime 调用
`plugin:native-glass|configure`，Swift 再用 `#available(iOS 26.0, *)` 判断系统 API。原生视图成功
安装并返回 `supported: true` 前，Web 回退保持可见；返回不支持或调用失败时继续使用回退，因此旧
iOS 与 Android 不会失去导航。原生 tab 选择通过 `ims:native-tab-select` DOM 事件交回 React Router，
路由、主题和模态弹层显隐通过 `update` 命令同步。Dialog、AlertDialog 或 Sheet 打开时临时隐藏
系统 tab bar，最后一个弹层关闭后恢复，避免 UIKit 层截获 Web 弹层的触点。卸载布局时调用
`destroy`，并通过把 `effect` 动画到 `nil` 移除材质，不用 alpha 隐藏原生玻璃。

Web 回退保留现有表面、单枚透镜和 tab 按压缩放，但根节点只标记 `data-glass-fallback`；不得恢复
`glass-sheen` 或 `data-glass-interactive`。这是移动端稳定性边界：旧 iOS 与 Android 不追踪指针或
手指坐标，也不显示白色触点光斑。

### 事务所地图一次性定位

真实 iOS 和 Android Tauri runtime 通过官方 geolocation 插件获取一次当前位置。前端先检查权限；
只有 `location` 和 `coarseLocation` 都未授权，且其中一项仍是 `prompt` 或
`prompt-with-rationale` 时，才请求 `location`。Android 用户只授予大致位置时仍可回到当前位置。
权限被拒绝后不调用定位命令。

`capabilities/geolocation.json` 只向移动端 `main` 窗口开放权限检查、权限请求和单次定位命令。
不得加入持续监听、清除监听或后台定位权限。插件在 Android 构建中声明粗略和精确位置权限；iOS
由 `Info.ios.plist` 声明 `NSLocationWhenInUseUsageDescription`，说明位置只用于在事务所地图上
显示并回到用户当前位置。

原生插件在 Android 单次定位和 iOS 上不执行传入的 `timeout`，因此
`app/lib/geolocation.ts` 另设 10 秒截止时间，并清理已经完成的计时器。非真实 Tauri runtime
继续使用 `navigator.geolocation`；这条回退同时服务普通 Web 和 App Playwright，选项保持低精度、
10 秒超时和 30 秒缓存上限。

发布前必须在权限尚未决定的 Android 和 iOS 真机上点击“回到我的位置”，分别检查系统权限提示、
精确或大致位置授权后的地图回中，以及拒绝后的页面提示。设备构建、安装和启动仍使用
`pnpm run app ios --release` 与 `pnpm run app android --release`。

`test:e2e:app` 使用独立 Playwright 配置启动 1420 App target，覆盖 320px 手机、iPhone、Pixel、
横屏和 WebKit，并注入可重复的安全区变量。浏览器只能验证 Web 回退底栏；iOS 26 的系统
`UITabBarController` 仍需在模拟器或真机检查。

Tauri 开发服务固定使用 `1420`，普通 Web 开发服务继续使用 `5173`。普通 Web 的启动、构建、
预览和类型生成命令会显式使用 web target，不继承 shell 中残留的 app target；Tauri 开发命令
通过 `dev:app` 启动 React Router。两者可以同时运行，浏览器访问 `5173` 时不会再误用 app
目标的路由和外壳。

真机联调必须传 `--host <开发机局域网 IP>`。Tauri 会据此重写设备实际加载的 dev URL，并导出
`TAURI_DEV_HOST`。`dev:app` 用它生成
`http://<局域网地址>:1420` 作为公共站点地址，但显式清空 API origin。Tauri 的 dev URL
scheme 会把设备上的同源 API、媒体、`/sites` 和 `/site-content` 请求转发到 1420，再由 Vite
代理至本机 Hono。API 返回的本地 RustFS 绝对地址会按 `IMS_RUSTFS_BUCKET` 改写为同源桶路径，
再由 1420 代理到回环地址上的 `IMS_RUSTFS_API_PORT`；设备不直接访问 9000。这样既能使用本地
数据库、对象存储和站点包，也避免 iOS WebKit 为 API 单独发起局域网跨源请求。未设置时使用
`http://localhost:1420`。需要其他私网入口时设置
`IMS_APP_DEV_ORIGIN`；启动器拒绝公网、`0.0.0.0`、带凭据、路径、查询或 hash 的值。

这条转发链有一个已知边界：iOS 上带 `Blob`/`File` 的请求体到不了 1420。WebKit 把这类请求体
作为流交给 scheme handler，转发时被丢弃，Hono 只收到 `content-length: 0`，头像与名片上传因此
返回 500。纯文本和只含字符串字段的 `FormData` 不受影响，实测 256 KiB 仍完整送达。上传路径的
联调必须改用自包含包（`pnpm run app ios`），它的 `VITE_IMS_API_ORIGIN` 是绝对地址，请求不经过
scheme handler。原生图片选择本身在热重载会话里是正常的，失败只发生在随后的上传请求。

## 4. 跨源 API 契约

Web 构建中前端与 Hono 同源，请求保持相对路径。发布 App 的 WebView 从本地 scheme 加载页面，
相对路径无法抵达 API，因此 `build:app` 会设置构建期变量 `VITE_IMS_API_ORIGIN`。默认值为
`https://idol-master.top`；只有验证其他部署时才需要覆盖：

```sh
VITE_IMS_API_ORIGIN=https://api.example.test \
VITE_IMS_PUBLIC_SITE_ORIGIN=https://www.example.test \
pnpm --filter @imsweb/web run tauri ios build
```

受控私网环境可以构建一个直接连接 HTTP 局域网 API 的已签名 App。必须显式设置
`IMS_ALLOW_INSECURE_LAN_APP_ORIGIN=1`；构建脚本只会在该开关存在时接受 RFC1918 IPv4 地址，
并继续拒绝任何公网 HTTP origin：

```sh
IMS_ALLOW_INSECURE_LAN_APP_ORIGIN=1 \
VITE_IMS_API_ORIGIN=http://192.168.31.169:3000 \
pnpm --filter @imsweb/web run tauri ios build --release
```

这个开关不能用于公网部署，且不应写入仓库或长期 shell 配置。Android Release 构建会在该开关
存在且至少一个已校验 origin 使用 HTTP 时，把生成工程的 `usesCleartextTraffic` placeholder 设为
`true`；其他构建一律恢复为 `false`，避免 LAN 设置污染线上包。`src-tauri/gen/` 仍是忽略的派生目录，
该条件由 `scripts/android-release-network.js` 在每次 App build 后重新应用。若公开网站与 API 不同
主机，仍需设置 HTTPS 的 `VITE_IMS_PUBLIC_SITE_ORIGIN`，供分享和系统浏览器跳转使用。

地图源由后台 map-config 返回的完整 `styleUrl` 决定。官方 OpenFreeMap 使用绝对 HTTPS URL，
App 直接按该地址加载；自分发 style 可以使用绝对 URL，也可以使用根相对路径。只有根相对路径需要
`VITE_IMS_MAP_TRANSPORT_ORIGIN` 作为解析基址，该变量不会改变 API、后台选择或分享链接的 host。
局域网自分发应让这个 origin 指向提供完整 `/maps/exchange/**` 树、支持 HTTP Range 且为 Tauri
WebView 回显 CORS origin 的静态地图服务。当前本地工作区以 `dev:app` 的 `1420` 服务满足该契约：

```sh
IMS_ALLOW_INSECURE_LAN_APP_ORIGIN=1 \
VITE_IMS_API_ORIGIN=http://192.168.31.169:3000 \
VITE_IMS_MAP_TRANSPORT_ORIGIN=http://192.168.31.169:1420 \
pnpm --filter @imsweb/web run tauri ios build --release
```

Dev 包不使用这个线上默认值，按第 3 节通过 Tauri dev URL 的同源转发和本地代理获取配置与数据。

该变量由 Vite 内联进浏览器代码，属于公开值，不得写入任何密钥。约定如下：

- 留空时 `API_ORIGIN` 为空串，alova 拼接结果与改造前逐字节一致，Web 行为不变。
- 非空时三个 alova client 统一加前缀，且请求 `credentials` 从 `same-origin` 切换为 `omit`：
  打包客户端用 Bearer 令牌认证，不需要任何 cookie 越过边界，API 也不下发凭据许可。
- API 响应里回传的媒体 URL 用 `resolveMediaUrl()` 归一化；绝对地址、协议相对地址和 data URI 原样透传。
- 需要拼接站点 origin 的位置用 `resolveSiteOrigin()`，不要直接读 `window.location.origin`；
  但要离开本进程的链接改用 `resolveShareableOrigin()`，理由见下一节。

路径 builder 本身仍由 `@imsweb/contracts/paths` 单一持有，前缀注入只发生在 client 层，
详见 [URL 与公共路径架构](../architecture/url-paths.md)。

### 站点公开地址

`VITE_IMS_API_ORIGIN` 回答的是「请求发到哪里」。但还有一类 URL 不由本进程加载，
而是被复制进剪贴板、由人在此后任意一个浏览器里打开——名片投稿的管理链接就是这一类，
用户靠它回来查看或撤回自己的投稿。

这类链接要的是**提供页面的那台主机**的地址，而打包客户端手上的两个常量都给不出来：
API origin 指向只应答 API、不提供该页面的主机；document origin 是出了设备就毫无意义的
本地 WebView scheme。于是引入第二个构建期变量 `VITE_IMS_PUBLIC_SITE_ORIGIN`：

```sh
pnpm --filter @imsweb/web run tauri android build
```

当前组合部署使用脚本默认的 `https://idol-master.top`。API 与站点分开部署时，按上一节示例
同时覆盖两个 origin。

约定与 `VITE_IMS_API_ORIGIN` 逐条对齐：同样由 Vite 内联进浏览器代码，同样属于公开值、
不得写入任何密钥，同样留空即 Web 行为不变。

- 留空时 `PUBLIC_SITE_ORIGIN` 为空串，`resolveShareableOrigin()` 退回 `resolveSiteOrigin()`。
  Web 构建下这就是 document origin，链接与改造前逐字节一致。
- 打包构建漏配时同样退回 `resolveSiteOrigin()`，即 API origin。当前站点与 API 共用一台主机，
  这个兜底恰好是对的；更要紧的是它保证产物永远是可粘贴的 `http(s)` 地址，绝不会漏出 `tauri://`。
  漏配在开发模式下打一条 `console.warn` 暴露出来，生产不拿用户的链接当惩罚。
- 两个 helper 的分工要在调用点一眼可辨：
  - `resolveSiteOrigin()`——本进程要去加载的 URL，即 API 与媒体路由。
  - `resolveShareableOrigin()`——要离开本进程的 URL，即复制、分享、外部浏览器打开。

变量声明在 `apps/web/app/env.d.ts`，示例见 `apps/web/.env.example`。

### 统一导航

页面和业务组件不直接判断 `VITE_IMS_APP_TARGET`，也不直接使用 React Router 的 `Link`、
`NavLink`、`useNavigate` 或浏览器的 `window.location` 跳转。声明式入口统一使用
`NavigationLink`/`NavigationNavLink`，命令式入口使用 `useNavigation()`；纯决策逻辑位于
`apps/web/app/lib/navigation/`。

导航层按目标语义处理运行环境：

- `to` 是前端路由，Web 和 App 都交给 React Router。
- `href` 保留文档导航语义；HTTP(S)、邮件、电话及自定义 App scheme 在 App 中交给系统应用。
- `publicSite(slug)` 代表网站提供的公开页面。Web 使用根相对地址，App 使用
  `VITE_IMS_PUBLIC_SITE_ORIGIN` 生成绝对地址并打开系统浏览器。
- `webOnly(to)` 代表未进入 App 路由清单的页面，App 构建不渲染对应入口。
- skip link、页内 hash 和下载链接保留原生 `<a>`，不经过路由抽象。

ESLint 禁止页面重新直接导入 React Router 导航 API或调用 `window.open`、
`location.assign`、`location.replace`。原生 `href` 只在已审计的 skip/hash 文件中放行。

### 静态站点包

App 的 `/packages/<slug>` 先从当前 API 获取站点信息，再通过 `publicSite(slug)` 构造公开页面目标，
不使用 API 请求 origin 推导站点地址。普通浏览器继续访问 `/sites/<slug>`；真实 Tauri runtime
调用 `@tauri-apps/plugin-opener`，把绝对 HTTPS 地址交给系统浏览器，因此上传的站点脚本不会在
App WebView 中执行。

Tauri capability 允许系统处理 HTTP(S)、`mailto:`、`tel:`、`sms:`、`geo:`、`intent:` 及
第三方 App 注册的自定义 scheme。前端和 capability 同时拒绝带用户名密码的 URL，以及
`javascript:`、`data:`、`file:`、`content:`、`tauri:` 等可执行或本地资源 scheme。Dev 包用
`VITE_IMS_PUBLIC_SITE_ORIGIN` 指向本地 1420/LAN Vite 代理，发布包默认指向
`https://idol-master.top`。

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
3. **Platform OAuth**：当前 callback 建立 cookie session，并重定向到 API origin 下的页面；
   这与 App 的 Bearer token 和本地 WebView 返回地址不兼容。App 暂不显示 OAuth provider，
   后续需要 deep link 与一次性 token exchange 后才能开放。
4. **真机验证**：Platform 登录到拉取列表的完整链路仍需纳入发布前设备门禁；站点包的本地
   LAN 访问和系统浏览器跳转已由构建、组件与浏览器回归测试覆盖。
