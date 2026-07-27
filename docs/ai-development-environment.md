# AI 开发环境指南

本指南供 AI 编码代理在 IMSWeb 仓库中初始化、启动和验证本地开发环境。开始前仍须读取根
目录及目标 workspace 的 `.rules`；同目录的 `AGENTS.md` 与 `CLAUDE.md` 均为兼容软链接。
本指南不授权生产部署、数据迁移或清理用户已有修改。

## 1. 确认工作区

所有默认命令从仓库根目录执行：

```sh
pwd
git status --short
node --version
pnpm --version
```

要求 Node.js `>=22.13.0`，`.nvmrc` 固定最低版本，pnpm 要求 `>=11.10.0`。可以使用现有
Node 管理器切换版本；不要改写系统运行时或仓库锁文件来绕过版本错误。

## 2. 安装依赖

```sh
corepack enable
pnpm install --frozen-lockfile
```

依赖只能由根 `pnpm-lock.yaml` 安装。不要在 workspace 中生成子锁文件，也不要使用
`npm install`。安装需要下载依赖时，AI 应遵守当前网络和权限审批规则。

根 workspace 的 `prepare` 会把当前仓库的 `core.hooksPath` 配置为 `.githooks`。提交前 hook
会检查 staged diff、仓库规则与边界、Web lint/typecheck，以及 API 语法、类型和架构边界。
可用以下命令重新安装并手动执行同一组检查：

```sh
pnpm run prepare
pnpm run check:pre-commit
```

## 3. 配置本地数据

配置模板按所有者分别位于 `apps/api/.env.example`、`apps/web/.env.example` 和
`deploy/.env.example`。API 启动时自动读取 `apps/api/.env`，已有 shell 或进程管理器变量
优先。创建被 Git 忽略的 `apps/api/.env` 并填写开发变量：

```dotenv
NODE_ENV=development
IMS_JWT_SECRET=local-development-only-change-me
IMS_DATABASE=postgresql
DATABASE_URL=postgresql://imsweb:imsweb-local-password@127.0.0.1:5432/imsweb
IMS_OBJECT_STORAGE=s3
IMS_S3_BUCKET=imsweb-media-local
IMS_PUBLIC_READ_URL_BASE=http://127.0.0.1:9000/imsweb-media-local
IMS_S3_REGION=us-east-1
IMS_S3_ENDPOINT=http://127.0.0.1:9000
IMS_S3_FORCE_PATH_STYLE=true
IMS_S3_PREFIX=local
IMS_S3_READ_URL_TTL_SECONDS=300
AWS_ACCESS_KEY_ID=imsweb-local
AWS_SECRET_ACCESS_KEY=imsweb-local-password
IMS_COMPENSATION_DIR=data/core/compensation
IMS_IDEMPOTENCY_DIR=data/core/idempotency
IMS_UPLOADS_DIR=data/uploads
IMS_EVENT_BASE_DIR=data/chronicle
IMS_STORY_DATA_DIR=data/story/images
```

本地运行统一使用 PostgreSQL 与 S3 兼容的 MinIO，不再把 SQLite 或文件系统作为隐式默认值。
先启动数据库、对象存储并自动创建启用版本控制的单一业务 bucket：

```sh
pnpm run dev:postgresql:up
pnpm run dev:minio:up
docker compose -f deploy/compose.yaml ps postgres minio minio-init
```

MinIO S3 API 位于 `http://127.0.0.1:9000`，管理控制台位于
`http://127.0.0.1:9001`。`pnpm run dev:minio:down` 默认保留 `minio-data` 卷；只有明确
需要清空测试对象时才可另外执行带 `--volumes` 的 Compose 清理。
`imsweb-media-local` 对公开对象开放下载，但匿名策略拒绝包含 `__protected/` 的路径；本地公开
URL 由该 bucket 的 path-style 基址继续拼接可选 `IMS_S3_PREFIX` 和业务语义物理路径。

`data/` 被 Git 忽略，不得把数据库、上传或日志移动到 `public/`，也不得提交。
数据库职责、PostgreSQL 选项、生产路径和完整性检查见
[数据库配置](database-configuration.md)。

新空库用 `pnpm run migration:postgresql` 初始化。需要从统一 SQLite 首次导入时直接运行
`pnpm run migration:postgresql:import-sqlite -- --allow-foreign-key-violations`，不要先应用
post-data migration。该 Compose 密码仅限回环地址上的本地开发。

如果 PostgreSQL 里的活动、资讯或名片记录沿用 `/uploads/...` 地址，还必须先对账并把本地上传
同步到 MinIO；设置 `IMS_OBJECT_STORAGE=s3` 本身不会搬迁文件：

```sh
pnpm run media:uploads:sync
pnpm run media:uploads:sync -- --apply
pnpm run media:information:sync
pnpm run media:information:sync -- --apply
pnpm run wiki:media:sync -- --database "$IMS_SQLITE_PATH" --upload-existing
pnpm run wiki:metadata:audit
pnpm run wiki:metadata:audit -- --apply --strict
```

每组的第二条命令才会写入，且会通过当前对象状态机维护 PostgreSQL 索引并从 MinIO 回读核对。
前一组迁移 Event、News 和名片上传，后一组迁移首页活动资讯索引及其 6 张历史原图。
Wiki 媒体先按清单同步，再由元数据审计关联数据库逻辑键；活动数据报告未归零时不得切换 Wiki
读模型。`--apply` 不创建业务实体，只关联已经存在且可回读的企划图标和偶像头像。
已有 S3/MinIO bucket 的旧逻辑 key 使用 `pnpm run migration:object-keys` 盘点，再以
`--apply --delete-source --confirm-bucket <bucket>` 一次性切换；运行时不提供旧路径双读。
已有受保护但应公开的 ready 媒体使用 `pnpm run migration:public-objects` 生成位置报告；只有在
停写窗口精确确认当前单一 bucket 后才执行 `--apply`。

需要打包并私下分享当前开发容器的 PostgreSQL 与 MinIO 数据时，使用 API workspace 提供的
逻辑快照命令。默认产物和 SHA-256 sidecar 位于 Git 忽略的 `data/exports/`：

```sh
pnpm run dev:data:export
pnpm run dev:data:restore -- data/exports/<snapshot>.tar.gz
```

归档包含用户资料和密码哈希，不得提交到 Git。恢复到非空开发容器必须人工确认后增加
`--force`；详细格式、覆盖语义和自定义输出路径见 `apps/api/scripts/README.md`。

## 4. 启动服务

需要以 Compose 运行完整 Hono API 栈时执行：

```sh
pnpm run dev:api:up
curl --fail --silent --show-error \
  http://127.0.0.1:3000/api/wiki/test >/dev/null
```

该路径使用构建后的镜像，不提供源码热更新。Compose 会等待 PostgreSQL 与 MinIO 就绪、创建
bucket、幂等应用 migrations，再启动 API；本地变量见 `deploy/.env.example`。

需要让本地 Compose API 直接测试 Cloudflare R2 时，在被 Git 忽略的 `apps/api/.env` 中配置
`IMS_S3_*`、`AWS_ACCESS_KEY_ID` 和 `AWS_SECRET_ACCESS_KEY`，并使用独立入口：

```sh
pnpm run dev:api:r2:config
pnpm run dev:api:r2:up
curl --fail --silent --show-error \
  http://127.0.0.1:3000/api/wiki/test >/dev/null
```

该入口继续使用 Compose 内的本地 PostgreSQL、开发模式和 3000 端口，但不启用或依赖 MinIO；
R2 凭据不会写入命令、Compose 文件或 Git。R2 使用 `auto` region、S3 API endpoint 和关闭
path-style 寻址，公开读取基址应使用绑定到该 bucket 的自定义域名。优先为本地测试使用独立
bucket 或限制到目标 bucket 的凭据，避免测试写入污染其他环境。

需要修改 API 源码时使用下方热更新流程。先确认端口没有被无关进程或 Compose API 占用；不要
未经确认终止已有进程：

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

终端一启动 Hono Node。该命令使用 `tsx watch`，修改 API 导入的 TypeScript 源码或
`apps/api/.env` 都会自动重启进程：

```sh
pnpm run dev:node
```

终端二启动 Web，并将开发代理指向 Hono：

```sh
IMS_API_ORIGIN=http://127.0.0.1:3000 pnpm run dev:web
```

Hono 默认地址是 `http://127.0.0.1:3000`。Web 地址以 Vite 实际输出为准；如果端口冲突，
为 Hono 设置其他 `PORT` 时必须同步修改 `IMS_API_ORIGIN`。

启动后至少验证：

```sh
curl --fail --silent --show-error \
  http://127.0.0.1:3000/api/news >/dev/null
```

还应使用浏览器或 Playwright 检查本次修改涉及的真实页面。若用户要求“启动环境”，AI 必须
报告实际可访问 URL 和探测结果；除非用户要求停止，否则不要在验证后悄悄终止其开发服务。

## 5. 选择验证门禁

```sh
# 仓库边界或文档
pnpm run check:rules
pnpm run check:root
pnpm run test:infra

# API
pnpm run check:api
pnpm run test:api

# Web
pnpm run check:web
pnpm run test:web

# 跨 workspace 变更
pnpm run check
pnpm run test

```

先运行与修改范围匹配的最小门禁，再按影响面扩大。测试需要监听回环端口、写工具缓存或下载
浏览器时，应把环境权限问题与产品失败分开报告，不要通过修改业务代码规避沙箱限制。

## 6. AI 操作边界

- 保留开始时已经存在的 staged、unstaged 和 untracked 修改。
- 不提交密钥、数据库、上传、日志、构建产物或 `.env`。
- 不执行 PostgreSQL 生产迁移、数据切换或清理；这些操作需要独立审批和对账证据。
- `deploy/compose.yaml` 保存 PostgreSQL 和构建后的 Hono API；本地 `local-storage` profile
  额外启动 MinIO，生产可关闭该 profile 并直接配置 R2。Compose 不包含反向代理或 TLS 入口；
  `deploy/nginx/` 仅保存宿主机入口模板，不由开发 Compose 启动。
- Cloudflare R2 仅作为 S3-compatible 对象存储与自定义域名 CDN；本计划不部署 Worker 或 D1。
- 不使用破坏性 Git、数据库或文件清理命令，除非用户明确授权并已核对目标。
- 完成时报告修改文件、实际运行的门禁、未通过原因、运行中的服务和可访问地址。
