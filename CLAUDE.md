# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此仓库中工作时提供指导。

## 项目身份

IMSWeb（偶像大师交流站）—— 偶像大师粉丝社区站点。这是一个 pnpm monorepo，正在从旧的 Express + Flask + 静态 HTML 技术栈迁移到 Hono TypeScript API 后端 + React Router 7 前端，可同时部署到 Node.js 和 Cloudflare Workers。

## Monorepo 结构

```
apps/api/       @imsweb/api   — Hono 后端（Node + Cloudflare Worker）
apps/web/       @imsweb/web   — React Router 7 SPA 前端
apps/legacy/    @imsweb/legacy — Express + Flask（仅用于回归与回滚）
```

根 `package.json` 只负责编排，不声明应用依赖。所有依赖由 pnpm 统一提升，但归属各自的 workspace。Workspace 边界由 `scripts/check-workspace-boundaries.mjs` 强制检查。

## 环境要求

- Node.js `>=22.13.0`（`.nvmrc` 固定版本）
- pnpm `>=11.10.0`

```sh
corepack enable
pnpm install --frozen-lockfile
```

## 常用命令

以下命令如未特别说明，均从仓库根目录执行。

### 开发

```sh
pnpm dev:node          # 监听启动 Hono Node 服务器（tsx watch，端口 3000）
pnpm dev:web           # React Router 开发服务器（Vite，API 代理到 127.0.0.1:3000）
pnpm dev:minio:up      # 启动 MinIO 作为本地 S3 兼容存储
```

### 构建

```sh
pnpm build             # 检查边界 + 构建 API + 构建 Web
pnpm build:api         # 构建客户端白名单资源 + Hono 服务器
pnpm build:web         # 构建 React Router SPA
```

### 检查与 Lint

```sh
pnpm check             # 全量：根检查 + API 检查 + Web 检查
pnpm check:api         # 构建 + 语法 + 架构 + 资源 + 迁移 + Worker bundle
pnpm check:web         # ESLint + 类型检查 + 单元测试 + 生产构建
pnpm check:root        # Workspace 边界 + shell 语法
```

Web 的 ESLint 配置将警告视为错误。使用 `pnpm --filter @imsweb/web run format` 格式化前端代码。

### 测试

```sh
pnpm test              # 基础设施测试 (Python) + API 测试 + Web 单元 + 路由契约
pnpm test:api          # Node + 服务器 + Wiki + Worker + 迁移测试
pnpm test:web          # Vitest 单元测试 + Playwright E2E（桌面端 + 移动端）
pnpm test:web-routing  # 真实 Hono + Web 构建产物的路由所有权契约测试
pnpm test:infra        # 仅 Python 基础设施测试
pnpm test:all          # 全量测试 + Legacy 回归测试
```

API 精细测试套件：`test:node`、`test:server`、`test:wiki`、`test:migration`、`test:worker`。

### 运行 / 预览

```sh
IMS_JWT_SECRET='<secret>' pnpm start        # 生产 Hono Node 服务器
pnpm preview:web                             # 预览已构建的 Web SPA
pnpm worker:dry-run                          # 验证 Cloudflare Worker 打包
```

## 架构

### API：端口与适配器（六边形架构）

Hono 应用（`apps/api/src/server/app.ts`）与运行时无关。业务逻辑绝不直接导入 Node 专有模块或 Cloudflare 绑定。

- **`ports/`** — 接口（契约）：`CoreRepository`、`ObjectStorage`、`ImageProcessor`、`TokenService`、`RateLimiter` 等
- **`adapters/node/`** — Node 实现（SQLite、文件系统/S3、Sharp）
- **`adapters/cloudflare/`** — Worker 实现（D1、R2、Cloudflare Images）
- **`adapters/shared/`** — 运行时无关的实现（HMAC token、上传解析器）
- **`domains/<domain>/`** — 按领域组织的业务逻辑（auth、news、media、wiki、events 等），每个领域有自己的 `hono-routes.ts`
- **`middleware/`** — Hono 中间件（JWT 认证、速率限制、请求体大小限制）
- **`runtime/`** — 环境装配与 DI 容器（`RuntimeServices`）

`RuntimeServices` 接口打包了所有服务依赖。应用接收一个 `resolveServices` 工厂函数——Node 从 `runtime/node-services.ts` 解析，Worker 从 `adapters/cloudflare/cloudflare-services.ts` 解析。

内部导入使用 `@/` 别名，根路径为 `apps/api/src/server`。

### Web：React Router 7 SPA

- **`app/routes.ts`** — 路由清单（基于文件的路由，framework mode）
- **`app/routes/`** — 页面组件与布局（公开页面布局 + 后台布局）
- **`app/components/ui/`** — shadcn/Base UI 基础原语（button、alert、sheet 等）
- **`app/components/<domain>/`** — 按领域组织的可复用业务组件
- **`app/shared/api/`** — alova 客户端、Cookie/CSRF 策略、响应模型（所有浏览器 API 访问必须通过此层）
- **`app/features/`** — 领域功能模块（home、admin、information）
- **`app/i18n/`** — i18next 配置与语言资源

六个公开页面在构建时预渲染（`/`、`/about`、`/events`、`/live`、`/community`、`/works`）。动态路由（`/chronicle/:activityId`、`/admin/*`）使用 SPA fallback。

内部导入使用 `~/` 别名，根路径为 `apps/web/app`。

### 双数据库 CQRS

Core（新闻/内容）与 Story 数据库是独立的 SQLite 文件，有各自独立的 repository（`core-repository`、`story-repository`）。在 Cloudflare 上它们映射到独立的 D1 数据库。由 `IMS_DB_PATH` 和 `IMS_STORY_DB_PATH` 配置其位置。

### 静态资源白名单

只有 `scripts/build/client-allowlist.json` 中明确列出的 `apps/legacy/public/` 文件才会被复制到 API 的 `dist/client/` 中。Legacy 新增文件不会被自动发布。

## 路由所有权与部署边界

Hono 拥有所有服务端路径，必须在任何 SPA fallback 之前匹配：

- `/api/*`、`/wiki/*`、`/story*`、`/image/*`、`/uploads/*`、`/eventchronicle/*`
- Unity R2 路径：`/runninggame/Build/*.data`、`/runninggame/BuildMobile/*.data`
- 安全拦截路径：`/Data/*`、`/templates/*`、`/*.db*`、`/*.py`、`/*.ini`

React Router 拥有六个预渲染页面以及 `/chronicle/:activityId` 和 `/admin/*`。路由契约测试（`pnpm test:web-routing`）验证此边界。生产流量尚未切换——Hono 仍在 `/` 提供旧的 `index.html`。

## 代码风格

- **API**：TypeScript strict 模式，4 空格缩进，分号，单引号，kebab-case 文件名
- **Web**：TypeScript strict 模式，2 空格缩进，无分号，双引号，80 列宽限制，kebab-case 文件名，PascalCase 组件名。提交前运行 `pnpm --filter @imsweb/web format`。

## 测试规范

- API 的 Node/server/migration 测试使用 Node 原生 test runner；Worker 测试使用 Vitest + Cloudflare pool
- Web 单元/组件测试使用 Vitest + Testing Library（`*.test.ts(x)`）
- Web E2E 使用 Playwright，包含桌面端和移动端两个项目（`tests/e2e/*.spec.ts`）
- 基础设施测试使用 Python `unittest`（`test_*.py`）
- 涉及共享 API 契约的变更必须覆盖 Node 和 Worker 两个运行时
- Web 数据驱动的 UI 必须覆盖加载中、错误、空数据和成功四种状态

## 安全

- 绝不提交密钥、数据库、上传文件、日志或构建产物
- 生产环境需要高熵 `IMS_JWT_SECRET`（≥32 字节）
- Wrangler 中的 D1/R2 标识符为占位值——生产部署前必须创建并绑定真实资源
- Web 的写请求必须通过共享 CSRF 机制（`app/shared/api/` 中的 `withCsrf()`），不得自行构造请求头
- 会话 Cookie 使用 `same-origin` 策略；绝不将 token 复制到 `localStorage`
- `deploy/compose.yaml` 仅用于 Nginx 部署验证，不是本地开发的前置条件

## 环境配置

环境变量模板按所有者分开放置，不会被自动加载：
- `apps/api/.env.example` — Hono Node、S3、SQLite 路径
- `apps/web/.env.example` — Web 开发代理、Playwright
- `deploy/.env.example` — Nginx Compose
- `scripts/migration/.env.example` — 一次性存量快照

本地开发时在 shell 中显式设置变量。完整本地搭建步骤（包括 MinIO S3 兼容存储）见 `docs/ai-development-environment.md`。

## 文档

- [AI 开发环境指南](docs/ai-development-environment.md) — 完整本地搭建流程
- [数据库配置](docs/database-configuration.md) — SQLite 路径、职责分工、完整性校验
- [对象存储](docs/object-storage.md) — Node 部署的 S3/MinIO 配置
- [运维手册](docs/operations-runbook.md) — 部署、备份、回滚
- [Cloudflare 迁移](docs/cloudflare-migration.md)
- [Legacy 架构](docs/legacy-architecture.md)
