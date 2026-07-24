# AI 开发环境指南

本指南供 AI 编码代理在 IMSWeb 仓库中初始化、启动和验证本地开发环境。开始前仍须读取根
`AGENTS.md` 以及目标 workspace 内的同名文件；本指南不授权生产部署、数据迁移或清理
用户已有修改。

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

只有修改或验证 `apps/legacy/flask` 时才准备 Python 环境：

```sh
cd apps/legacy
uv sync --frozen
cd ../..
```

## 3. 配置本地数据

应用不会自动读取 `.env`。模板按所有者分别位于 `apps/api/.env.example`、
`apps/web/.env.example`、`deploy/.env.example` 和 `scripts/migration/.env.example`；在启动
进程的 shell 中显式设置开发变量：

```sh
export NODE_ENV=development
export IMS_PROJECT_ROOT="$PWD"
export IMS_JWT_SECRET='local-development-only-change-me'
export IMS_DATABASE=sqlite
export IMS_SQLITE_PATH="$PWD/apps/legacy/data/imsweb.db"
export IMS_COMPENSATION_DIR="$PWD/apps/legacy/data/core/compensation"
export IMS_UPLOADS_DIR="$PWD/apps/legacy/data/uploads"
export IMS_EVENT_BASE_DIR="$PWD/apps/legacy/data/chronicle"
export IMS_STORY_DATA_DIR="$PWD/apps/legacy/data/story/images"

test -f "$IMS_SQLITE_PATH"
sqlite3 "$IMS_SQLITE_PATH" 'PRAGMA quick_check;'
pnpm run audit:data
```

统一库不存在时，先阅读[数据库配置](database-configuration.md)，再执行一次
`pnpm run migration:sqlite:merge`。合并命令不会覆盖已有目标。

本地联调可变图片时统一使用 S3 兼容的 MinIO，不再使用文件系统模拟 OSS。先启动并自动创建
`imsweb-test` bucket：

```sh
pnpm run dev:minio:up
docker compose -f deploy/compose.yaml ps minio minio-init

export IMS_OBJECT_STORAGE=s3
export IMS_S3_BUCKET=imsweb-test
export IMS_S3_REGION=us-east-1
export IMS_S3_ENDPOINT=http://127.0.0.1:9000
export IMS_S3_FORCE_PATH_STYLE=true
export IMS_S3_PREFIX=local
export IMS_S3_READ_URL_TTL_SECONDS=300
export AWS_ACCESS_KEY_ID=imsweb-local
export AWS_SECRET_ACCESS_KEY=imsweb-local-password
```

MinIO S3 API 位于 `http://127.0.0.1:9000`，管理控制台位于
`http://127.0.0.1:9001`。`pnpm run dev:minio:down` 默认保留 `minio-data` 卷；只有明确
需要清空测试对象时才可另外执行带 `--volumes` 的 Compose 清理。

`apps/legacy/data/` 被 Git 忽略，不得把数据库、上传或日志移动回 `public/`，也不得提交。
数据库职责、PostgreSQL 选项、生产路径和完整性检查见
[数据库配置](database-configuration.md)。

需要 PostgreSQL 联调时，使用精确固定的 PostgreSQL 18.4 本地栈：

```sh
pnpm run dev:postgresql:up
docker compose -f deploy/compose.yaml ps postgres
export IMS_DATABASE=postgresql
export DATABASE_URL='postgresql://imsweb:imsweb-local-password@127.0.0.1:5432/imsweb'
```

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
```

每组的第二条命令才会写入，且会通过当前对象状态机维护 PostgreSQL 索引并从 MinIO 回读核对。
前一组迁移 Event、News 和名片上传，后一组迁移首页活动资讯索引及其 6 张历史原图。

## 4. 启动服务

先确认端口没有被无关进程占用；不要未经确认终止已有进程：

```sh
lsof -nP -iTCP:3000 -sTCP:LISTEN
```

终端一在上述 MinIO 环境变量所在的 shell 中启动 Hono Node：

```sh
pnpm run dev:node
```

终端二启动 Web，并将开发代理指向 Hono：

```sh
IMS_API_ORIGIN=http://127.0.0.1:3000 pnpm run dev:web
```

Hono 默认地址是 `http://127.0.0.1:3000`。Web 地址以 Vite 实际输出为准；如果端口冲突，
为 Hono 设置其他 `PORT` 时必须同步修改 `IMS_API_ORIGIN`。Legacy Express 也默认使用
`3000`，只在明确进行 Legacy 回归时启动，并避免与 Hono 同时占用该端口。

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

# 仅在 Legacy 受影响时
pnpm run legacy:check
```

先运行与修改范围匹配的最小门禁，再按影响面扩大。测试需要监听回环端口、写工具缓存或下载
浏览器时，应把环境权限问题与产品失败分开报告，不要通过修改业务代码规避沙箱限制。

## 6. AI 操作边界

- 保留开始时已经存在的 staged、unstaged 和 untracked 修改。
- 不提交密钥、数据库、上传、日志、构建产物或 `.env`。
- 不执行 PostgreSQL 生产迁移、数据切换或清理；这些操作需要独立审批和对账证据。
- `deploy/compose.yaml` 统一保存当前 Nginx、PostgreSQL 和 MinIO 服务；本地 API/Web 只按需
  启动其中的 PostgreSQL 或 MinIO；Nginx 位于可选 `proxy` profile，不是启动前置依赖。
- 不使用破坏性 Git、数据库或文件清理命令，除非用户明确授权并已核对目标。
- 完成时报告修改文件、实际运行的门禁、未通过原因、运行中的服务和可访问地址。
