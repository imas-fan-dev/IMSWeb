# IMSWeb Web

IMSWeb 的新前端工程。项目使用 React Router 7 framework mode 组织路由与构建，当前为纯客户端运行模式（`ssr: false`），由 Vite 构建 React 19 应用。样式基于 Tailwind CSS 4，组件采用 shadcn 的 Base UI / Nova 配置，浏览器 API 请求统一经由 alova 的 fetch adapter 发往同源 Hono 后端。

本仓库只负责新的前端页面、交互与前端静态产物。现有 Hono API、Wiki SSR、媒体处理和 Unity 资源仍由上游 Hono 工程负责，部署层必须保留这条所有权边界。

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

需要 Node.js 22.13.0 或更新版本，以及 pnpm 11。依赖统一从父仓库根目录安装：

```sh
pnpm install
pnpm dev:web
```

进入 `apps/web` 后也可直接执行该包自己的 `pnpm dev`、`pnpm check` 等脚本。

开发代理和 Playwright 的环境变量模板位于 [`.env.example`](.env.example)。工具只读取启动
进程已有的环境变量，不会把 `IMS_API_ORIGIN` 暴露给浏览器代码：

```sh
export IMS_API_ORIGIN=http://127.0.0.1:3000
pnpm dev
```

常用命令：

| 命令             | 用途                                     |
| ---------------- | ---------------------------------------- |
| `pnpm dev`       | 启动 React Router 开发服务器             |
| `pnpm build`     | 生成生产前端产物与预渲染页面             |
| `pnpm preview`   | 在 `127.0.0.1` 上预览已构建产物          |
| `pnpm lint`      | 执行 ESLint，警告也视为失败              |
| `pnpm typecheck` | 生成路由类型并执行 TypeScript 检查       |
| `pnpm test:unit` | 运行 Vitest 单元与组件测试               |
| `pnpm test:e2e`  | 运行 Playwright 桌面端和移动端测试       |
| `pnpm test`      | 依次运行单元测试与端到端测试             |
| `pnpm check`     | 运行 lint、类型检查、单元测试和生产构建  |
| `pnpm format`    | 使用 Prettier 格式化 TypeScript/TSX 文件 |

首次运行 Playwright 前，如本机还没有浏览器二进制，可执行：

```sh
pnpm exec playwright install chromium
```

## 目录边界

```text
app/
  components/ui/    shadcn 生成或维护的基础 UI 原语
  lib/               与业务无关的前端工具
  routes/            页面、layout 与路由级交互
  shared/api/        alova 客户端、Cookie/CSRF 策略、响应与错误模型
  app.css            Tailwind 入口和全局设计 token
  root.tsx           HTML shell、全局资源和顶层错误边界
  routes.ts          React Router framework route manifest
public/              构建时原样复制、且必须登记来源的静态文件
docs/                工程决策与资产来源记录
tests/unit/           跨模块单元/组件测试
tests/e2e/            浏览器流程与可访问性冒烟测试
```

边界约定：

- 页面和路由级数据编排放在 `app/routes/`，不要放进 `components/ui/`。
- `components/ui/` 只承载可复用的基础原语；跨页面业务组件应在 `app/components/` 下按领域组织。
- 所有浏览器 API 请求都通过 `app/shared/api/`，页面不要各自实现 Cookie、CSRF、错误解析或 base URL 规则。
- `public/` 不是 legacy 资产的批量入口。迁入文件必须有明确用途、来源和许可状态，并登记在 [资产来源记录](docs/ASSET_PROVENANCE.md) 中。
- Hono 路由与服务端领域逻辑不进入本仓库；接口契约的源头仍是上游 `apps/api`。

## 同源 Cookie 与 CSRF

前端按同源部署设计。API 方法应使用 `/api/...`、`/eventchronicle/...` 等相对 URL，由本地代理或生产边缘路由转发到 Hono，不在浏览器中配置跨域后端地址。

`app/shared/api/` 对每个请求设置 `credentials: "same-origin"`，登录会话 Cookie 的签发、校验和失效仍由 Hono 负责。不要把会话 token 复制到 `localStorage`，也不要在页面中直接读取认证 Cookie。

需要 Hono CSRF 保护的写请求必须显式附加 `withCsrf()` 元数据。客户端会在发送前读取当前 `csrf_token` Cookie，并写入 `X-CSRFToken` 请求头；缺少 Cookie 时请求会在浏览器端失败。`same-origin` Cookie 策略不能替代 CSRF 标记，新增写接口时必须同时核对 Hono 的中间件要求。

## 路由所有权

React Router 当前拥有以下页面：

- 预渲染公开页面：`/`、`/about`、`/events`、`/live`、`/community`、`/works`
- 动态前端页面：`/chronicle/:activityId`
- 后台页面：`/admin`、`/admin/login`、`/admin/chronicle` 与 `/admin/*` 内部 404

这是新前端构建与目标部署的所有权契约，不代表流量已经切换。现有 Hono Node 仍显式注册 `/` 并返回 legacy `index.html`；新前端接管根路径时，部署层必须在验收后明确切换该规则。

部署层必须先匹配 Hono 所有的服务端路径，再考虑前端静态文件或 SPA fallback。至少包括：

- `/api/*`
- `/wiki/*` 与 `/story*`
- `/image/*`、`/uploads/*`
- `/eventchronicle/*`
- `/assets/images/eventchronicle/events/*`，包括业务媒体和必须由 Hono 拒绝访问的内部元数据
- Unity R2 路径 `/runninggame/Build/*.data` 与 `/runninggame/BuildMobile/*.data`
- 安全保留路径 `/Data/*`、`/templates/*`、`/*.db*`、`/*.py` 与 `/*.ini`；这些规则用于进入 Hono 的敏感路径策略，不表示每个 URL 都有业务 handler
- 仍未迁入本仓库的 legacy 静态文件；不能因为前端也使用 `/assets/` 就让 SPA fallback 吞掉它们

这些路径不得返回 React Router 的 `__spa-fallback.html`。新增或迁移路由时，应同时更新边缘路由规则和对应的 Hono/前端契约测试，不能依靠 catch-all 猜测所有权。

## 预渲染与 selective SPA fallback

`react-router.config.ts` 只预渲染六个静态公开页面。构建产物中的 `__spa-fallback.html` 仅用于无法预先枚举的前端路由：

- 单段动态路由 `/chronicle/:activityId`
- `/admin` 与 `/admin/*`

边缘层应按这个 allowlist 做 selective SPA fallback。未知路径应返回 404；Hono 路径、媒体路径和 legacy 静态路径应先交给各自所有者，不能配置全站 `try_files ... __spa-fallback.html`。这是部署要求，当前 Hono Wrangler 的 `html_handling` 与 `not_found_handling` 均为 `none`，尚未替新前端实现该 fallback。

从父仓库运行 `pnpm run test:web-routing`，可以使用真实 Hono 和前端构建产物验证这份所有权契约。该命令只执行部署切流前的 contract，不会改动当前生产入口。

不要把所有以 `.data` 结尾的文件都判断为 Unity 资源。现有 Worker 只为 `GET`/`HEAD` 的 `/runninggame/Build/*.data` 与 `/runninggame/BuildMobile/*.data` 路径族查询 Unity R2 对象；React Router 预渲染在引入 loader 后也可能生成自己的 `.data` 文件。部署和发布脚本必须按完整路径规则识别 Unity，而不是按扩展名全局拦截。

## 资产迁移

当前只允许从 legacy 工程迁入 `public/brand/imsweb-logo.png`，用于内部迁移验证。权利人与许可尚未确认，不能据此推定可公开发布。来源、校验值、使用限制和未迁移候选见 [docs/ASSET_PROVENANCE.md](docs/ASSET_PROVENANCE.md)。
