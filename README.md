# IMSWeb Monorepo

IMSWeb 现在由三个边界明确的应用 workspace 组成。API（Hono）是当前服务端与生产运行
入口；Web 是新的 React 工程；Legacy 只用于回归对照与代码回滚，不属于当前部署拓扑。

```text
apps/
  api/       @imsweb/api，Hono + Node + Cloudflare Worker
  web/       @imsweb/web，React Router + Tailwind + shadcn/ui
  legacy/    @imsweb/legacy，Express + Flask + 原站静态前端，Python 由 UV 管理
deploy/      只指向 API Node 上游的 Nginx 配置
scripts/     monorepo 边界、数据审计和迁移前清点
tests/       仓库级部署与数据审计测试
```

根 `package.json` 只负责编排，不声明应用依赖。依赖安装和锁文件由根统一管理，应用源码、
构建产物和运行入口都属于各自 workspace。

## 默认工作流

要求 Node.js `>=22.13.0` 和 pnpm `>=11.10.0`：

```sh
corepack enable
pnpm install --frozen-lockfile
pnpm run build
pnpm run check
pnpm run test
pnpm run worker:dry-run
```

根目录的 `build` 和 `check` 同时覆盖 `@imsweb/api` 与 `@imsweb/web`；`test` 覆盖
Hono、仓库基础设施以及前端单元测试。`start`、`dev:node` 和 `worker:dry-run` 仍只执行
`@imsweb/api`，因此合并前端不会自动切换生产流量。`pnpm run check:boundaries` 额外验证
workspace、Legacy 资源归属、依赖和部署边界。

Node 本地运行：

```sh
pnpm run build
IMS_JWT_SECRET='<high-entropy-secret>' pnpm start
```

Hono 的发布产物位于 `apps/api/dist/`。Worker 配置、D1 migrations 和测试也都在
`apps/api/` 内，Wrangler 命令必须通过根脚本或 `pnpm --filter @imsweb/api ...` 执行。

## Web 工作流

```sh
pnpm run dev:web
pnpm run build:web
pnpm run preview:web
pnpm run check:web
pnpm run test:web
pnpm run test:web-routing
```

前端源码、测试和专用静态资源位于 `apps/web/`。它使用根锁文件，不得保留
嵌套 `.git`、子级 `pnpm-lock.yaml` 或 `pnpm-workspace.yaml`。`test:web` 包含桌面与
移动端 Playwright 测试；默认根 `test` 只运行前端单元测试。

当前生产入口仍由 Hono 提供 legacy 首页。新前端构建产物和 selective SPA fallback 只有在
路由 contract 通过并完成明确的部署切流后才能接管对应路径。`test:web-routing` 会用
真实的 Hono 与前端构建产物验证这条边界，但不会修改生产路由。

## Legacy 回归工作流

Legacy 命令必须显式调用，不会被默认构建或测试链路触发：

```sh
pnpm run legacy:build
pnpm run legacy:python:sync
pnpm run legacy:check
pnpm run legacy:test
pnpm run legacy:start:node
pnpm run legacy:start:flask
pnpm run legacy:backup:source
```

也可以直接进入 `apps/legacy` 独立调试：

```sh
cd apps/legacy
uv sync --frozen
pnpm run build
pnpm run start:node
# 另一个终端：pnpm run start:flask
```

Express 默认使用 `data/core/news.db`、`data/uploads/`、`data/chronicle/` 和 `public/`；
Flask 默认使用 `data/story/idol_data.db`、`data/story/images/`、`public/icon/` 与
`public/css/`。这些相对路径都从 `apps/legacy` 解析，不依赖仓库根目录。Python 依赖只由该目录内的 `pyproject.toml`、
`.python-version` 与 `uv.lock` 管理。

`pnpm run test:all` 才会在 Hono 全套门禁之后执行 Legacy 回归。Legacy 不得包含 Wrangler、
D1/R2 migration、Compose 或 Nginx 部署配置。

## 数据边界

原站的受版本管理静态资源位于 `apps/legacy/public/`；所有本地兼容数据库、上传、剧情图片、
旧版标题素材归档、编年史状态和日志统一位于被 Git 忽略的 `apps/legacy/data/`。API 构建只根据固定 allowlist 从 Legacy 资源源生成自己的
`dist/client` 与 `dist/node-client`，不会直接发布整个 Legacy 目录。新前端只在自身
`apps/web/public/` 中保存经过来源登记的专用资产。生产仍必须为所有可变 `IMS_*` 数据路径
使用独立绝对路径，并确保 Hono 与 Legacy 不会同时写入同一份数据。

Core 与 Story SQLite 的职责、`IMS_DB_PATH`/`IMS_STORY_DB_PATH` 配置示例、路径解析规则
和启动前校验见 [数据库配置](docs/database-configuration.md)。
常驻 Hono Node 可以保留本地文件系统，也可以通过 `IMS_OBJECT_STORAGE=s3` 把可变媒体切到
S3；配置、IAM 权限和迁移边界见 [Node 文件对象存储](docs/object-storage.md)。

环境模板按所有者放置，避免根目录文件混合不同进程的配置：

- `apps/api/.env.example`：Hono Node、S3、SQLite 路径和账号操作；
- `apps/web/.env.example`：Web 开发代理和 Playwright；
- `deploy/.env.example`：Nginx Compose；
- `scripts/migration/.env.example`：一次性 inventory 快照输入。

应用不会自动加载这些模板；实际值由 shell、进程管理器或显式 Compose `--env-file` 注入。
生产 staging 必须先安装完整 frozen 依赖，完成构建、检查和测试；不能在构建前用 `--prod`
删除 TypeScript 等开发依赖：

```sh
pnpm install --frozen-lockfile
pnpm run build
pnpm run check
pnpm run test:fast
```

`deploy/compose.yaml` 只运行官方 Nginx 并代理单个 Hono Node 上游；它不构建应用镜像，也不
包含 Flask、Legacy 或 `5000` 端口。

## 文档

- [API workspace](apps/api/README.md)
- [Web workspace](apps/web/README.md)
- [Legacy workspace](apps/legacy/README.md)
- [AI 开发环境指南](docs/ai-development-environment.md)
- [SQLite 数据库配置](docs/database-configuration.md)
- [Node 文件对象存储](docs/object-storage.md)
- [部署、备份与回滚](docs/operations-runbook.md)
- [Nginx 部署](deploy/nginx/README.md)
