# IMSWeb Web

IMSWeb 的新前端工程。项目使用 React Router 7 framework mode 组织路由与构建，当前为纯客户端运行模式（`ssr: false`），由 Vite 构建 React 19 应用。样式基于 Tailwind CSS 4，组件采用 shadcn 的 Base UI / Nova 配置，浏览器 API 请求统一经由 alova 的 fetch adapter 发往同源 Hono 后端。

本 workspace 负责前端页面、交互与静态产物，包括公开 Wiki 目录和剧情浏览页面。Hono API
与媒体处理仍由 `apps/api` 负责；根构建会验证并把 Web 生产产物打包进 API 发布目录。

前端位于父仓库的 `apps/web`，包名为 `@imsweb/web`。它由根目录的 `pnpm-workspace.yaml` 和 `pnpm-lock.yaml` 统一管理，不保留嵌套 `.git`、子级 workspace 或子级锁文件。

## 技术栈

- React Router 7 framework mode：文件式路由配置、预渲染与 SPA fallback 产物
- Vite 8：开发服务器与生产构建
- React 19 + TypeScript
- Tailwind CSS 4（Vite plugin）
- shadcn Base UI / Nova（`components.json` 中的 `base-nova`）
- alova 3 + `alova/fetch`：同源 API 请求、响应解析与错误归一化
- Vitest + Testing Library：单元与组件测试
- Playwright：桌面端和移动端端到端测试

## 本地开发

需要 Node.js 22.13.0 或更新版本，以及 pnpm 11。依赖统一从父仓库根目录安装。推荐从根目录
一键启动 Web、API 和本地依赖：

```sh
pnpm install --frozen-lockfile
pnpm dev
```

进入 `apps/web` 后也可直接执行该包自己的 `pnpm dev`、`pnpm check` 等脚本；这条细粒度入口
只启动 Web，适合已经单独启动 API 或只修改静态界面的场景。

开发代理和 Playwright 的环境变量模板位于 [`.env.example`](.env.example)。工具只读取启动
进程已有的环境变量，不会把 `IMS_API_ORIGIN` 暴露给浏览器代码：

默认 API 代理目标已经是 `http://127.0.0.1:3000`。只有 API 使用非默认端口时才需要在启动
Web 的进程中设置 `IMS_API_ORIGIN`；根 `pnpm dev` 会根据实际 API 端口自动完成同步。
`/brand/about/**` 的服务端代理单独使用 `IMS_PUBLIC_SITE_ORIGIN`，不得指回当前 Vite 地址。

常用命令：

| 命令                | 用途                                     |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | 启动网站目标 React Router 开发服务器     |
| `pnpm dev:app`      | 在 1420 启动 App 目标及本地 API 代理     |
| `pnpm build`        | 生成生产前端产物与预渲染页面             |
| `pnpm build:app`    | 生成带已验证远程 origin 的 App 静态产物  |
| `pnpm design:lint`  | 校验根目录 `DESIGN.md` 设计规范          |
| `pnpm preview`      | 在 `127.0.0.1` 上预览已构建产物          |
| `pnpm lint`         | 执行 ESLint 与 Tailwind canonical 类检查 |
| `pnpm typecheck`    | 生成路由类型并执行 TypeScript 检查       |
| `pnpm test:unit`    | 运行 Vitest 单元与组件测试               |
| `pnpm test:e2e`     | 运行网站目标的 Playwright 测试           |
| `pnpm test:e2e:app` | 运行 App 安全区与底栏 Playwright 矩阵    |
| `pnpm test`         | 依次运行单元测试与端到端测试             |
| `pnpm check`        | 运行 lint、类型检查、单元测试和生产构建  |
| `pnpm format`       | 使用 Prettier 格式化 TypeScript/TSX 文件 |
| `pnpm app:doctor`   | 检查 iOS/Android 打包与安装前置依赖      |
| `pnpm app`          | 设备安装入口，参数选目标、配置与设备     |

`app` 是唯一的设备入口，目标与配置都是参数：

```sh
pnpm app devices                            # 列出模拟器、模拟机、真机与 AVD
pnpm app ios                                # Debug 包装进 iOS 模拟器
pnpm app ios --target device --release      # Release 包装进 iPhone/iPad
pnpm app android --target device            # Debug 包装进 Android 真机
```

完整安装矩阵、前置依赖安装步骤和签名边界见
[App 设备安装与前置依赖](../../docs/development/app-device-delivery.md)。先跑
`pnpm app:doctor`：它逐项报告缺失的工具并给出修复命令。

`dev:app` 根据 `TAURI_DEV_HOST` 生成本地 1420 origin。真机请求仍是同源 URL，由 Vite 代理
到本机 Hono，因此读取本地数据库、对象存储和站点包；它不会继承生产
`VITE_IMS_API_ORIGIN`。需要使用另一个私网入口时显式设置 `IMS_APP_DEV_ORIGIN`。

`build:app` 默认把 API 和公共站点 origin 设为 `https://idol-master.top`，并拒绝带凭据、路径、
查询参数或非 HTTPS 公网地址的覆盖值。

`test:e2e:app` 单独启动 1420 的 App target，覆盖 320px 手机、iPhone、Pixel、横屏和 WebKit。
它验证 Web 回退底栏与模拟安全区；iOS 26 的 UIKit 底栏仍需在模拟器或真机检查。

首次运行 Playwright 前，如本机还没有浏览器二进制，可执行：

```sh
pnpm exec playwright install chromium webkit
```

## 目录边界

```text
app/
  components/ui/    shadcn 生成或维护的基础 UI 原语
  layouts/           顶层、公开站点与管理端 layout
  lib/               跨页面非 UI 基础设施与通用工具
    api/             统一 API 出口、客户端和请求策略
      endpoints/     按接口领域组织的请求函数、schema 与类型
  pages/             按 URL 与业务层级组织的 route-ready 页面模块
    admin/           后台页面及其下级页面
    <page>/components/ 复杂页面的页面专用展示与表单单元
    <page>/hooks/      页面专用请求状态与浏览器缓存逻辑
  app.css            Tailwind 入口和全局设计 token
  root.tsx           HTML shell、全局资源和顶层错误边界
  routes.ts          React Router framework route manifest
public/              构建时原样复制、且必须登记来源的公开静态文件
docs/                工程决策与资产来源记录
tests/unit/           单元与组件测试
  layouts/            按 app/layouts 归属管理的 layout 测试
  pages/              按 app/pages 层级集中管理的页面测试
  components/         按 app/components 层级管理的共享组件测试
  i18n/               国际化配置与行为测试
  lib/                按 app/lib 归属管理的基础设施与工具测试
tests/e2e/            浏览器流程与可访问性冒烟测试
```

边界约定：

- `app/routes.ts` 使用类型化配置直接建立 URL、layout 与 `app/pages/` 页面模块的关系，不为单纯转发、metadata 或参数适配创建额外 route 文件。
- 页面实现和数据编排放在 `app/pages/`，并按真实 URL 与业务层级分类；被路由配置引用的页面模块同时负责 default component、metadata 和路由参数。
- 路由 layout 统一定义在 `app/layouts/`。
- 复杂页面的入口文件只保留页面流程编排；页面专用 UI 放入本页 `components/`，页面专用请求状态与浏览器缓存放入本页 `hooks/`，纯草稿类型、格式化与校验放入聚焦的 `*-model.ts`。内部文件直接导入，不建立页面级 barrel。
- 单元测试统一放入 `tests/unit/` 并镜像 `app/` 的职责层级，使用 `~/...` 导入实现；不要把测试散落在页面入口、组件、Hook 或共享模块旁边。
- `components/ui/` 只承载可复用的基础原语；跨页面业务组件应在 `app/components/` 下按领域组织。
- 所有请求函数、schema 和 API 类型统一定义在 `app/lib/api/endpoints/`，经 `~/lib/api` 出口调用。页面不得直接使用 `fetch`、`apiClient`、API 内部子路径或页面本地 `api.ts`。
- 不再使用 `app/features/`；新增页面必须进入 `app/pages/` 对应层级。
- `public/` 不接收私有 Legacy 资产。新增文件必须有明确用途、来源和许可状态，并登记在 [资产来源记录](../../docs/governance/assets.md) 中。
- Hono 路由与服务端领域逻辑不进入本仓库；接口契约的源头仍是上游 `apps/api`。

## 同源 Cookie 与 CSRF

前端按同源部署设计。API 方法应使用 `/api/...`、`/eventchronicle/...` 等相对 URL，由本地代理或生产边缘路由转发到 Hono，不在浏览器中配置跨域后端地址。

`app/lib/api/` 对每个请求设置 `credentials: "same-origin"`，登录会话 Cookie 的签发、校验和失效仍由 Hono 负责。不要把会话 token 复制到 `localStorage`，也不要在页面中直接读取认证 Cookie。

需要 Hono 后台 CSRF 保护的写请求必须使用 `adminApiClient`，并显式附加
`withBackofficeCsrf()` 元数据。客户端会在发送前读取当前后台身份域的 `csrf_token`
Cookie，并写入 `X-CSRFToken` 请求头；缺少 Cookie 时请求会在浏览器端失败。
`same-origin` Cookie 策略不能替代 CSRF 标记，新增写接口时必须同时核对 Hono 的
中间件要求。公开请求继续使用 `apiClient`，不得触发后台 refresh。

## 路由所有权

React Router 当前拥有以下页面：

- 预渲染公开页面：`/`、`/about`、`/events`、`/recommendations`、`/live`、
  `/community`、`/community/cards`、`/works`、`/works/:workSlug`
  的已登记专题、新版 `/wiki`、`/story` 及其 `/modern` 兼容入口、经典版
  `/wiki/classic`、`/story/classic`、`/chronicle`
- 动态前端页面：`/information/:contentId`、`/chronicle/:activityId`
- 后台页面：`/admin`、`/admin/login`、`/admin/events`、`/admin/cards`、
  `/admin/chronicle` 与其他 `/admin/*` 业务页

这些页面由当前 Web 构建拥有。Hono 在可发布客户端存在时从
`apps/api/dist/node-client` 提供根页面和静态资源。

部署层必须先匹配 Hono 所有的服务端路径，再考虑前端静态文件或 SPA fallback。至少包括：

- `/api/*`，包括公开和受保护的 Wiki 数据接口
- `/image/*`、`/uploads/*`
- `/eventchronicle/*`
- `/assets/images/eventchronicle/events/*`，包括业务媒体和必须由 Hono 拒绝访问的内部元数据
- 安全保留路径 `/Data/*`、`/templates/*`、`/*.db*`、`/*.py` 与 `/*.ini`；这些规则用于进入 Hono 的敏感路径策略，不表示每个 URL 都有业务 handler

这些路径不得返回 React Router 的 `__spa-fallback.html`。新增或迁移路由时，应同时更新边缘路由规则和对应的 Hono/前端契约测试，不能依靠 catch-all 猜测所有权。

## 预渲染与 selective SPA fallback

`react-router.config.ts` 预渲染公开入口、已登记的作品专题、现代 `/wiki`、`/story`
与兼容旧模板交互的 `/wiki/classic`、`/story/classic`。查询参数由浏览器端读取，
构建产物中的 `__spa-fallback.html` 仅用于无法预先枚举的前端路由：

- 单段动态内容路由 `/information/:contentId`、`/chronicle/:activityId`
- `/admin` 与 `/admin/*`

Hono 应按这个 allowlist 做 selective SPA fallback。未知路径应返回 404；API 与媒体路径必须
先交给服务端路由，不能配置全站 `try_files ... __spa-fallback.html`。

从父仓库运行 `pnpm run test:web-routing`，可以使用真实 Hono 和前端构建产物验证这份所有权契约。该命令只执行部署切流前的 contract，不会改动当前生产入口。

React Router 预渲染在引入 loader 后可能生成 `.data` 文件。部署和发布脚本不得仅凭扩展名
拒绝这些构建产物，应以 manifest 和服务端保留路径为准。

## 公开资产

Web 不包含从私有 Legacy 仓库迁入的图片、字体、音视频或品牌标识。新增公开资产前必须完成
[来源与许可登记](../../docs/governance/assets.md)。

## App icon

`public/brand/imsweb-app-icon.png` 是客户端 1:1 图标的默认源文件。图标经 `gpt-image-2` 生成与图像编辑，采用与主站 logo 呼应的左上 `im` 与右下 `@s` 阶梯布局；两层保持原有的纵向位置，仅横向向中心收拢，整组字标居中于画布。红色 `@` 位于前景并压住相邻银色字面，所有字形保留连续的金属字面、黑白双层描边和右倾斜体。32 px 下仍保留清晰的 `@` 强调。

Android 另外使用 `src-tauri/icon-sources/` 中的背景、透明前景和单色图层。前景字标位于 adaptive icon 安全区，旧版 launcher 图标通过 `android_fg_scale` 提高占比；Android 13 及以上可以使用单色层生成主题图标。`app-icon.json` 是 Tauri icon manifest，默认图仍供 iOS、桌面和商店图标使用。

`src-tauri/icons/` 下的全部 PNG、`icon.icns` 和 `icon.ico` 都是派生产物，不要手改。替换默认图或 Android 图层后，从本 workspace 重新生成：

```sh
pnpm run icon:app
```

该命令在 Tauri 生成图标后规范化 `icon.icns` 的顶层块顺序，避免相同源图因无序容器写入产生不同的 Git blob。不要绕过 workspace 命令直接运行 `tauri icon`。Tauri 的 `dev` 与 `build` 入口会在启动前自动运行这条命令，确保被忽略的 `src-tauri/gen/android/` 使用同一套图层。`tauri.conf.json` 的 `bundle.icon` 列表保持不变。图标的字形来源、许可与 SHA-256 记录在[来源与许可登记](../../docs/governance/assets.md)，替换源文件后需同步更新。

站点 `public/favicon.ico` 不由这条命令产出，仍是独立的 fallback 资产。
