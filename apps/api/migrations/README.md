# API 数据迁移

本目录只保留活动 PostgreSQL schema 账本：

| 目录 | 状态 | 用途 |
| --- | --- | --- |
| `postgresql/` | 活动 | PostgreSQL 结构演进的唯一执行来源 |

运行时和发布工具只读取 `postgresql/`。Core/Story 的数据完整性约束由 PostgreSQL migration
内的对账 SQL 维护。

## 活动账本约束

- 已发布文件的文件名、phase 和内容都不可修改或删除；迁移器会校验 SHA-256。
- `0001` 至 `0019` 是冻结的历史序列。新文件统一使用 14 位 UTC 时间戳，格式为
  `YYYYMMDDHHMMSS_description.sql`。
- 同一时间戳只能对应一个文件，描述只使用小写字母、数字和下划线。
- 文件必须包含一个 phase 标记。常规增量变更使用 `post-data`；只有首次导入前必须存在的结构
  才使用 `pre-data`。
- CLI 按文件名字典序执行全部待应用文件，phase 是导入边界元数据，不会改变执行顺序。
- 迁移器在同一个 PostgreSQL 事务和 advisory lock 内执行本次全部待应用文件。不要在 SQL 中
  添加事务控制，也不要使用不能在事务中执行的 DDL。
- schema 变更遵循 expand/contract：先增加兼容结构并发布新代码，破坏性清理放到后续发布。

新 migration 的最小结构：

```sql
-- ims:migration-phase: post-data

ALTER TABLE public.example
    ADD COLUMN new_value TEXT;
```

生成 UTC 前缀并检查本地账本：

```sh
date -u +%Y%m%d%H%M%S
pnpm run migration:postgresql -- --list
pnpm --filter @imsweb/api run test:migration
```

`--list` 不连接数据库，只输出排序后的文件、phase 和 checksum。实际应用前仍须确认
`DATABASE_URL` 指向预期目标，并按发布流程完成备份、回滚点和代表性业务回读。

数据导入、媒体同步和对象键整理不属于 schema 账本；统一通过
[API 操作脚本](../scripts/README.md) 中的稳定命令执行。
