# 数据库配置

Hono Node 的硬约束是“一个实例、一个物理数据库”。活动运行时统一使用 PostgreSQL；Core 与
Story 是同一数据库上的两个逻辑 Repository，不是两个连接或两个数据源。SQLite 只保留给
显式迁移、测试和离线兼容流程。API 启动时自动读取 `apps/api/.env`，shell 或进程管理器中
已有的变量优先于文件值。
启用 S3 时，同一个数据库还保存 `s3_*` 生命周期控制面数据；对象字节仍只保存在 bucket，
domain 不直接访问这些中间件表。

完整表结构、抽象边界和 Prisma 评估见
[数据库架构与 PostgreSQL 迁移边界](database-architecture.md)。

## SQLite 迁移兼容模式

只有显式设置 `IMS_DATABASE=sqlite` 时，Hono Node 才读取 `IMS_SQLITE_PATH`：

| 变量 | 本地默认值 | 用途 |
| --- | --- | --- |
| `IMS_DATABASE` | 必须显式设置为 `sqlite` | 迁移兼容数据库驱动 |
| `IMS_SQLITE_PATH` | `data/imsweb.db` | 唯一 SQLite 数据库 |

本地启动：

```sh
export IMS_DATABASE=sqlite
export IMS_SQLITE_PATH="$PWD/data/imsweb.db"
export IMS_COMPENSATION_DIR="$PWD/data/core/compensation"
test -f "$IMS_SQLITE_PATH"
sqlite3 "$IMS_SQLITE_PATH" 'PRAGMA quick_check;'
IMS_JWT_SECRET='<high-entropy-secret>' pnpm run dev:node
```

生产必须使用 release 目录之外的绝对路径：

```sh
export IMS_DATABASE=sqlite
export IMS_SQLITE_PATH=/srv/ims/shared/database/imsweb.db
export IMS_COMPENSATION_DIR=/srv/ims/shared/database/compensation
```

SQLite 在目标不存在时可能创建空文件，因此不能把“进程成功启动”当作配置正确。启动前必须
确认文件存在，且 `PRAGMA quick_check` 输出 `ok`。不要直接复制正在写入的 `.db`，也不要手工
删除活动数据库的 `-wal` 或 `-shm` 文件。

## 两库合并

旧版数据仍保留为两个只读迁移输入：

| 输入 | 默认路径 | 表 |
| --- | --- | --- |
| Core | `data/import/core/news.db` | `users`, `logs`, `news`, `events`, `cards`, `card_emojis` |
| Story | `data/import/story/idol_data.db` | `agencies`, `idols`, `theme_colors`, 七张 `*_stories` |

它们不再是 Hono 的运行时配置。首次生成统一数据库时执行：

```sh
pnpm run migration:sqlite:merge
```

合并器不会覆盖已有目标，使用同目录临时文件、事务复制、逐表行数核对、
`PRAGMA foreign_key_check` 和 `PRAGMA quick_check`，全部完成后才原子发布。可以用
`--core`、`--story`、`--output` 覆盖三个路径。

当前 Core 源库有 33 条历史 `card_emojis.card_id -> cards.id` 孤立引用。默认严格模式会拒绝
发布；需要无损保留现状时必须显式执行：

```sh
pnpm run migration:sqlite:merge -- --allow-foreign-key-violations
```

命令会在报告中列出全部异常，不会静默删除数据。PostgreSQL 兼容性迁移会继续无损保留这些
记录，并在导入后添加 `NOT VALID` 外键；新写入立即受约束，历史异常则等待业务确认后清洗。

这些源库只是一次性迁移输入，不得注入 Hono Node 生产进程。完成迁移与对账后，应按数据
保留策略从工作目录清理或归档到受控存储。

## PostgreSQL 单库

当前稳定基线固定为 PostgreSQL 18.4。PostgreSQL 19 在 2026-07-23 仍是 Beta，不进入运行
基线；精确版本依据 PostgreSQL 官方[版本策略](https://www.postgresql.org/support/versioning/)和
[18.4 发布说明](https://www.postgresql.org/docs/18/release-18-4.html)。本地启动：

```sh
pnpm run dev:postgresql:up
docker compose -f deploy/compose.yaml ps postgres
```

不设置 `IMS_DATABASE` 或设置为 `postgresql` 时，Hono Node 忽略 SQLite 路径，通过一个
必填的 `DATABASE_URL` 创建共享连接池：

```sh
export IMS_DATABASE=postgresql
export DATABASE_URL='postgresql://imsweb:<password>@127.0.0.1:5432/imsweb'
export IMS_PG_POOL_MAX=10
export IMS_PG_IDLE_TIMEOUT_MS=30000
export IMS_PG_CONNECTION_TIMEOUT_MS=5000
export IMS_PG_STATEMENT_TIMEOUT_MS=30000
export IMS_PG_IDLE_TRANSACTION_TIMEOUT_MS=30000
IMS_JWT_SECRET='<high-entropy-secret>' pnpm run dev:node
```

连接池默认最多 10 条连接。Core/Story Repository 共享同一个 pool 和默认 schema；批处理只在
同一连接上的短事务内执行，普通查询使用未命名参数化语句。`DATABASE_URL` 和凭据只能由进程
环境或密钥管理系统注入。

PostgreSQL 不允许应用启动自动建表。普通空库先执行版本化 schema migration：

```sh
DATABASE_URL='postgresql://imsweb:<password>@127.0.0.1:5432/imsweb' \
  pnpm run migration:postgresql
```

S3 模式还会在启动时验证 `0003_s3_object_lifecycle`。缺少该 migration 时不会退回 filesystem，
也不会由应用进程临时建表。

从统一 SQLite 首次迁移时，目标必须为空，并直接执行导入器：

```sh
IMS_SQLITE_PATH="$PWD/data/imsweb.db" \
DATABASE_URL='postgresql://imsweb:<password>@127.0.0.1:5432/imsweb' \
  pnpm run migration:postgresql:import-sqlite -- \
  --allow-foreign-key-violations
```

导入器只读 SQLite，在一个 PostgreSQL 事务内完成 pre-data schema、分批导入、identity 序列
校准、post-data 外键和逐表计数对账。它记录源 SHA-256 和异常明细，拒绝非空目标和迁移文件
checksum 漂移。生产唯一写源切换仍需独立完成停写增量、媒体引用核验和回滚演练。
