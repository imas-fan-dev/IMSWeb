# PostgreSQL 测试生命周期验证

## 集成审查结论

候选提交 `1b63e12f` 已基于当前 `release/v1.1` 主线集成。审查修复了以下问题：

- `CREATE DATABASE` 返回不确定错误时，数据库名称原先尚未登记，可能跳过强制删除。现在发出创建请求前登记所有权；除明确的 PostgreSQL `duplicate_database` 外，失败后执行 `DROP DATABASE IF EXISTS ... WITH (FORCE)`。
- allocator 关闭原先可能与 migration、template 创建或 sibling connection factory 竞争。现在关闭开始后拒绝新分配，等待在途分配和连接，再统一清理。
- connection close 失败后原先会清空跟踪状态。现在失败连接保留到 allocator 关闭时重试，数据库仍先强制删除。
- connection override 原先可覆盖已分配的 `connectionString`。现在生命周期 URL 始终优先，类型声明也排除该 override。
- `IMS_TEST_POSTGRES_ENABLED` 现在只接受原始字面值 `true` 或 `false`，带空白、大小写变体和其他值均失败。
- 两个混合 server suite 原先会在禁用 PostgreSQL 时连同 5 个纯测试一起跳过。现在只有 PostgreSQL-backed 声明使用 skip wrapper。

## 冲突处理

Cherry-pick 在 10 个已由 API test-helper convergence 修改的 server 测试中产生 import 冲突。处理结果如下：

- 保留 `contract-json` helper：`events-pagination`、`homepage-links`、`news-pagination`。
- 保留 `auth-request` cookie helper：`auth-refresh`、`backoffice-auth-boundary`。
- 保留 `auth-request` SHA-256 helper：`fudaba-office-management-repository`。
- 保留 `createMigrationCatalogBefore()` 和 canonical Fudaba seed：`fudaba-agency-migration` 及 3 个 namecard migration replay 测试。
- 只把相关 `node:test` value import 替换为 PostgreSQL-aware test wrapper；断言和测试体未改动。

相对集成前主线，这 10 个文件的 diff 只有测试 wrapper import 变化。

## 验证结果

使用本机回环 PostgreSQL：

```text
IMS_TEST_DATABASE_URL=postgresql://imsweb:imsweb-local-password@127.0.0.1:5432/postgres
```

- `node --test apps/api/tests/postgres-test-lifecycle.test.js`：13 passed、0 failed、0 skipped。
- lifecycle 负向覆盖：strict opt-out、URL precedence、invalid flag/protocol/non-loopback host、bounded name、ambiguous create、migration/template failure、force-drop retry、open sibling、connection-close retry、allocation/close race、connection/close race、aggregate close errors。
- `IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api run test:server`：352 passed、115 skipped、0 failed；5 个混合 suite 纯测试继续执行。
- `IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api run test:migration`：99 passed、13 skipped、0 failed。
- `IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api run test:node`：32 passed、36 skipped、0 failed；36 个 skip 全部来自 `node-security`。
- focused enabled concurrency、两种 adapter、4 个 historical migration catalog replay：10 passed、0 failed、0 skipped。
- focused enabled `node-security.test.js`：36 passed、0 failed、0 skipped。
- `pnpm --filter @imsweb/api exec tsc -p tests/server/tsconfig.json --noEmit`：通过。
- `pnpm --filter @imsweb/api run test`：Node 68、server 467、Wiki 64、migration 112，共 711 passed、0 failed、0 skipped。该命令包含 API build、typecheck、syntax 和 architecture check。
- `pnpm run check:rules`：通过。
- `pnpm run check:boundaries`：通过。
- `git diff --check`：通过。

## 所有权与范围

Repository search 结果：

- 可执行 `CREATE DATABASE`：1 处，`apps/api/tests/postgres-test-lifecycle.js`。
- 可执行 `DROP DATABASE`：1 处，同一 lifecycle core。
- admin URL precedence、loopback validation、database name generation：各 1 个实现 owner，同一 lifecycle core。
- 其他 `CREATE DATABASE`、`DROP DATABASE` 和 `ims_test_*` 命中均为 lifecycle 断言、fixture 或任务文档。
- API package script 数保持 41；只把 lifecycle unit test 加入现有 `test:node`，没有新增脚本。
- 变更范围只有 child task artifacts、`apps/api/package.json` 和 `apps/api/tests/**`。没有 root、Web、production source、wire contract 或 R2 变更。

## 孤儿数据库

所有测试进程退出后执行 catalog 查询：

```sql
SELECT datname
FROM pg_database
WHERE datname LIKE 'ims_test_%'
   OR datname LIKE 'imsweb_s2_platform_%'
   OR datname LIKE 'ims_security_%'
ORDER BY datname;
```

结果为空，没有遗留测试数据库。

## 主线复验

集成后首次执行完整 API 测试时，本地 `5432` 没有监听，默认启用的
`node-security` PostgreSQL 用例按设计失败，而不是被静默跳过。
`pnpm run dev:doctor` 和端口检查确认缺少的依赖后，使用文档入口
`pnpm run dev:postgresql:up` 启动回环 PostgreSQL，再次验证：

- lifecycle、disabled server、disabled migration 和 disabled node 入口均通过；
- 完整 API 仍为 Node 68、server 467、Wiki 64、migration 112，共 711 passed、0 failed、0 skipped；
- 所有测试进程退出后的孤儿数据库查询仍返回空数组。

本地 PostgreSQL 暂时保留运行，供依赖此生命周期的专项测试收敛使用。
