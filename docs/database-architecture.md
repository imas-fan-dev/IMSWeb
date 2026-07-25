# 数据库架构与 PostgreSQL 迁移边界

## 当前结论

当前 Hono Node 已收敛为一个数据库入口：

```text
one application instance
  -> runtime/node-services.ts composition
  -> one SQLite connection OR one PostgreSQL pool
  -> capability Repository ports + StoryRepository
```

SQLite 使用 `IMS_SQLITE_PATH` 指向统一的 `data/imsweb.db`；PostgreSQL 使用一个
`DATABASE_URL`。Core SQL 适配器实现多个能力级 Repository port，并与 Story Repository 共享
同一底层数据库；业务侧不感知该复用。媒体二进制由本地文件
目录或 S3-compatible 对象存储保存。业务表只保存逻辑路径；S3 模式另外在同一数据库的 `s3_*`
控制面表保存对象版本映射、上传状态和补偿任务，不把对象字节写入关系数据库。

旧 `news.db` 和 `idol_data.db` 仅作为合并与对账输入，不再被 Hono 运行时读取。
当前应用运行时与默认验收只有 Node，不包含 Worker 或 D1。对象存储可以通过同一个 S3 adapter
选择 MinIO、Cloudflare R2 或其他兼容 provider；R2 不引入新的应用运行时。

## 统一表结构

统一 SQLite 当前包含 16 张业务表、15,047 行：

| 领域 | 表 | 责任 |
| --- | --- | --- |
| Core | `users` | 操作员账号，`username` 唯一 |
| Core | `logs` | 管理操作审计 |
| Core | `news` | 资讯和媒体逻辑路径 |
| Core | `events` | 活动投稿和媒体逻辑路径 |
| Core | `cards` | 名片投稿、双面媒体、哈希和审核状态 |
| Core | `card_emojis` | 表情计数，逻辑外键 `card_id -> cards.id` |
| Core | `site_packages` | 管理员上传站点的稳定 slug 与当前发布版本指针 |
| Core | `site_package_revisions` | 不可变 ZIP 版本、manifest、预览令牌和发布历史 |
| Story | `agencies` | 企划维度，`code` 唯一 |
| Story | `idols` | 偶像维度，`agency_id -> agencies.id` |
| Story | `theme_colors` | 页面主题色 |
| Story | 七张 `*_stories` | 剧情、视频和图片逻辑路径 |

七张 Story 表是 `765_stories`、`876_stories`、`cg_stories`、`ml_stories`、
`sidem_stories`、`sc_stories` 和 `gk_stories`。PostgreSQL 第一阶段采用兼容 schema 原样迁移，
确保 16 表与 15,047 行可以逐项对账；归一化为一张 story 表属于迁移后的第二阶段，避免同时
承担数据搬迁和业务查询重写。

统一库保留了 Core 源数据中 33 条历史孤立 `card_emojis`。这不是合并产生的差异。迁移先无损
导入，再添加 `NOT VALID` 外键：已有异常可对账，新写入受约束；业务清洗后再验证该 constraint。

## 抽象设计

活动运行时使用 Repository、Driver Strategy、Schema Strategy 和组合根：

```text
Hono domain -> ports/repositories.ts contracts -> RuntimeServices instances

runtime/node-services.ts -> infra/db/sqlite/{connection,schema-strategy}
                         -> infra/db/postgresql/{connection,schema-strategy}
                         -> infra/db/repositories/{core-repository,story-repository}
                         -> infra/db/sql/{database,query}

runtime/node-services.ts -> infra/oss/filesystem or infra/oss/s3
                         -> injected ManagedSqlDatabase lifecycle state
                         -> private signed URL or public CDN URL
                         -> browser -> MinIO/S3/R2
```

- 路由按能力依赖 `AuthRepository`、`NewsRepository`、`EventRepository` 等端口以及
  `StoryRepository`、`ObjectStorage`，不读取数据库或 S3 配置。
- `domain` 只从 `ports/` 导入接口，不进入 `infra/`，也不导入数据库驱动、ORM client 或 ORM
  生成类型。
- `SqlDatabase` 统一参数绑定、查询结果、写入元数据、脚本执行和原子批处理。
- Repository SQL 使用 `?` 参数；PostgreSQL Driver 安全转换为 `$1`、`$2`。
- `SqlSchemaStrategy` 隔离 SQLite/PostgreSQL DDL；Repository 内没有 provider 分支。
- `sqlite/` 与 `postgresql/` 分别封装各自连接和 schema 行为；`repositories/` 只实现可复用
  SQL 仓储，`sql/` 只提供适配器内部的 Driver 契约和查询工具。
- `runtime/` 是唯一组合根，每个实例只创建一个 Driver；同一个 Core SQL 适配器按能力注入多个
  Repository port，Story 适配器共享该 Driver。
- `runtime/` 独立选择 filesystem/S3；S3 状态机只依赖 `ManagedSqlDatabase`，不依赖具体 driver。
- S3 受保护读取通过 ObjectStorage port 签发短期 URL；所有 ready 对象使用单一 bucket 的
  CDN URL，上传和业务提交仍只经过 Hono。
- S3 使用 `s3_object_versions`、`s3_object_index`、`s3_upload_operations` 和
  `s3_compensation_jobs` 实现延迟发布、版本 fencing、过期恢复和有租约补偿。
- `s3_object_versions.storage_scope` 与 `s3_upload_operations.storage_scope` 记录对象访问级别；
  受保护对象写入 `__protected/`，发布时在同一 bucket 生成新的公开 ready 版本。
- SQLite/PG `close()` 都是幂等的，支持多个 Repository 端口共享同一底层资源。

PostgreSQL Driver 使用有界连接池、连接/语句/空闲事务超时、未命名参数化查询和同连接短事务。
生产 schema 只接受 `migrations/postgresql/` 的版本化状态，应用启动只验证所需 migration，不再
执行 DDL。

站点包使用文本 UUID 主键。创建包和首版本、添加版本号、发布或回滚指针都通过数据库短事务
完成；发布不会覆盖历史对象，只把 `site_packages.published_revision_id` 原子切换到一个
`ready` 版本。PostgreSQL `0004_site_packages` 创建表，增量 `0005_site_package_publication_owner`
用复合外键保证发布指针只能指向本包版本；两者都是 pre-data migration。SQLite 使用同等
slug/hash 约束和兼容触发器。SQLite 到 PostgreSQL 导入把这两张表视为可选，因此旧快照不含
站点包表时仍可迁移，新快照则一并对账。
每个版本持久化源 ZIP 的 `source_sha256`；预览 bearer 只在创建或旋转响应中返回一次，数据库
仅保存 `preview_token_hash`，管理列表不会暴露对象键、内部 manifest 或令牌摘要。

## Prisma 成本评估

本阶段不引入 Prisma，也不允许 domain 直接依赖 `PrismaClient`。直接依赖会把业务从数据库驱动
耦合转成 ORM 耦合，并让生成 Model、查询参数和异常语义穿透 Repository port，不符合本项目的
解耦目标。

Prisma 可以作为未来的具体实现，但只能放在 `infra/db/prisma/`，实现现有能力级 Repository
ports 与 `StoryRepository`，把 Prisma 记录映射为 `ports/repositories.ts` 自有类型，并由
`runtime/` 实例化。
当前不采用的主要原因是 Node 仍需在 SQLite/PostgreSQL 间切换，项目还有动态 Story 表、
兼容 schema 和 provider 差异；ORM 无法消除这些逻辑，反而会在数据迁移尚未稳定时增加生成
类型和 migration 工具链。

更合适的顺序是：

1. 保持当前 ports/infra 依赖方向与具体中间件目录，完成 SQLite/PostgreSQL 行为对等。
2. 建立 PostgreSQL versioned migration，清洗 33 条孤立引用并归一化 Story 表。
3. SQLite 退役后，再用一个 repository 做 Prisma 试点，验证 SQL、事务、bundle 和性能证据。
4. 试点通过后，也只替换 `infra/db` 实现，不修改 domain 合同。

届时 Prisma 只替换基础设施实现，不改变业务 Repository 合同，成本会从“高”降到“中低”。

## PostgreSQL 后续门禁

1. 在 PostgreSQL 18.4 真实实例执行版本化 migration、全量导入与 15,047 行对账。
2. 业务确认并清洗 33 条孤立表情，执行 `VALIDATE CONSTRAINT`。
3. 归一化七张 Story 表，保留来源表和来源 ID 以便双向对账。
4. 核对关键字段、唯一键和媒体逻辑路径，而不只核对行数。
5. 运行影子读、停写增量、唯一写源切换和回滚演练。
