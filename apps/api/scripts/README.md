# API 操作脚本

日常使用从 monorepo 根调用稳定命令，或显式使用
`pnpm --filter @imsweb/api run <command>`。当前活动运行时只有 Hono Node；历史 Worker、D1、R2
脚本不属于默认构建、检查、测试或 PostgreSQL 迁移方案。

| 分类 | 路径 | 数据影响 | 稳定入口 |
| --- | --- | --- | --- |
| 构建 | `build/` | 构建 `dist/server` 并打包已验证的 Web 静态资源 | `pnpm run build` |
| 检查 | `checks/` | 只读架构边界 | `pnpm run check` |
| SQLite 合并 | `migration/merge-sqlite-databases.js` | 从两个历史源生成一个新目标 | `pnpm run migration:sqlite:merge` |
| PostgreSQL schema | `migration/postgres-migrations.js` | 对一个 PostgreSQL 数据库执行版本化 migration | `pnpm run migration:postgresql` |
| PostgreSQL 导入 | `migration/sqlite-to-postgresql.js` | 从统一 SQLite 只读导入一个空 PostgreSQL | `pnpm run migration:postgresql:import-sqlite` |
| 首页活动资讯 | `migration/legacy-information-media.js` | 审计静态 Information 卡片；可显式写当前 S3 索引 | `pnpm run media:information:sync` |
| 本地上传媒体 | `migration/local-upload-media.js` | 审计本地上传；可显式写当前 S3 和对象索引 | `pnpm run media:uploads:sync` |
| Wiki 媒体 | `migration/wiki-media-sync.js` | 读取统一 SQLite；可显式写 S3 | `pnpm run wiki:media:sync` |
| Wiki 元数据 | `migration/wiki-metadata-audit.ts` | 默认只读审计；`--apply` 只关联已存在的语义媒体 | `pnpm run wiki:metadata:audit` |
| 账号运维 | `operations/accounts/` | `add-user` 写统一 SQLite | `pnpm run ops:account:add` |

## SQLite 合并

默认输入是 `data/import/core/news.db` 和
`data/import/story/idol_data.db`，默认输出是
`data/imsweb.db`。三个路径必须不同，目标已存在时命令拒绝覆盖：

```sh
pnpm run migration:sqlite:merge
```

合并器会核对 schema 冲突、逐表行数、外键和 `quick_check`，然后原子发布。当前 Core 源库有
33 条历史孤立表情；需要完整保留并在报告中列出时使用：

```sh
pnpm run migration:sqlite:merge -- --allow-foreign-key-violations
```

生产输入覆盖只用于受控迁移 shell：`--core FILE --story FILE --output FILE`。不要指向正在被写入
的 SQLite 主文件；先生成在线备份，并把输出放在相同持久卷中的新路径。

## PostgreSQL 迁移

PostgreSQL schema 只通过 `migrations/postgresql/` 下的版本化文件更新，应用启动不会自动建表。
普通空库初始化使用：

```sh
DATABASE_URL='postgresql://imsweb:<password>@127.0.0.1:5432/imsweb' \
  pnpm run migration:postgresql
```

从统一 SQLite 首次导入时，不要提前单独运行上述命令。导入器会在同一受控事务内依次执行
pre-data migration、批量导入、identity 校准、post-data constraint 和逐表对账：

```sh
IMS_SQLITE_PATH="$PWD/data/imsweb.db" \
DATABASE_URL='postgresql://imsweb:<password>@127.0.0.1:5432/imsweb' \
  pnpm run migration:postgresql:import-sqlite -- \
  --allow-foreign-key-violations
```

源文件必须是无 WAL/SHM/journal sidecar 的稳定快照，目标 16 张业务表必须为空。命令按源文件
SHA-256 记录 `ims_data_migrations`，同一快照重复执行只做计数核对；不同数据不会覆盖已有目标。
当前 33 条 `card_emojis` 孤儿记录会原样保留，随后添加 `NOT VALID` 外键，因此新写入受约束，
历史异常仍可独立清洗和最终 `VALIDATE CONSTRAINT`。

## 首页活动资讯

旧首页的 6 条“活动资讯与同人活动”曾同时存在于 API 和 React 常量中。当前运行时不再提供代码
兜底；首次准备新的 PostgreSQL + MinIO 环境时先执行只读审计，再显式写入：

```sh
pnpm run media:information:sync
pnpm run media:information:sync -- --apply
```

迁移器读取 `IMS_INFORMATION_SOURCE_DIR` 指定的私有历史导出目录，把图片写到
`editorial/information/assets/<asset>/cover.<ext>`，并通过条件写创建
`editorial/information/index.json`。已有管理员卡片保持不变；已迁移内容再次执行只做回读
校验。默认报告写到被 Git 忽略的 `data/migration/information-media-migration.json`。

## 本地上传媒体

切换到 MinIO/S3 后，数据库中的 `/uploads/...` 地址不会自动搬运对应文件。先在已经设置
PostgreSQL、`IMS_UPLOADS_DIR` 和 S3 变量的 shell 中执行只读对账：

```sh
pnpm run media:uploads:sync
```

确认报告后显式写入；同步器会把 event、news 和 information 映射到 `editorial/...`，把
namecard 映射到 `community/namecards/...`，通过当前对象状态机写入并从目标重新读取校验
SHA-256：

```sh
pnpm run media:uploads:sync -- --apply
```

默认审计报告写到被 Git 忽略的 `data/migration/upload-media-manifest.json`。相同内容再次执行
会标记为 `unchanged`，不会创建新对象版本。可用 `--source` 和 `--manifest` 覆盖本地输入与报告
路径；命令只接受 `IMS_OBJECT_STORAGE=s3`。

## Wiki 媒体

`wiki:media:sync` 默认读取 `IMS_SQLITE_PATH`，将来源素材写入 Git 忽略的 staging，并生成 URL、
SHA-256、MIME、大小和目标对象键清单。只有 `--upload` 或 `--upload-existing` 会写配置的 S3。

```sh
pnpm run wiki:media:sync -- \
  --database "$IMS_SQLITE_PATH" \
  --staging-dir "$PWD/data/migration/wiki-import"
```

应用 `0007_wiki_catalog_metadata` 后，企划、分组、成员、分类顺序和媒体逻辑键均从数据库读取。
先对活动 PostgreSQL 与目标对象存储执行只读审计：

```sh
pnpm run wiki:metadata:audit
pnpm run wiki:metadata:audit -- --strict
```

默认报告写到 `data/migration/wiki-metadata-audit.json`。媒体同步已经产生语义化企划图标或头像，
但数据库关联仍为空时，显式执行 `--apply` 只回填能够从当前 `ObjectStorage` 回读的逻辑键，随后
重新生成完整报告。生产切换要求 `--strict` 为零；该工具不会根据对象目录创建企划、偶像、分组
或分类，也不会恢复旧站 URL。

## 账号运维

`operations/` 命令属于人工确认操作。新增账号前必须显式设置 `IMS_SQLITE_PATH`、确认已备份，
并只在受控 shell 中短暂注入 `IMS_NEW_USER_PASSWORD`。真实密钥、密码、数据库、清单和备份不得
写回仓库。

兼容命令 `pnpm run user:add` 和 `pnpm run password:hash` 暂时保留，分别转发到新的 `ops:*`
命令。
