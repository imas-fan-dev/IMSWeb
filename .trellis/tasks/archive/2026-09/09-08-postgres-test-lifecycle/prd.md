# 统一 PostgreSQL 测试生命周期

## Goal

让所有 API PostgreSQL 测试通过一个安全、可预测的生命周期核心创建和清理隔离数据库，并让测试启用条件反映真实策略。

## Requirements

- 统一管理员 URL 解析、回环地址校验、数据库命名、连接选项、迁移和强制清理。
- 同时支持 Node `TestContext` 自动清理和显式 `close()` 调用方式，差异只保留在薄适配层。
- `postgresIntegrationEnabled()` 不得固定返回 `true`；保留无显式URL时使用本地回环默认值的现有覆盖，并增加严格解析的 `IMS_TEST_POSTGRES_ENABLED=false` opt-out。
- 启用配置同时识别 `IMS_TEST_POSTGRES_ADMIN_URL` 和 CI 使用的 `IMS_TEST_DATABASE_URL`；无效布尔值、协议或非回环地址必须失败。
- 禁用时所有 PostgreSQL-backed 测试一致使用测试框架的 skip 语义，不能只跳过当前30个调用点而让其他测试继续连接数据库。
- 保留额外数据库连接和自定义 migration path 能力。
- canonical Fudaba agency seed 保持可选，并与通用生命周期核心解耦。
- PostgreSQL 仍是唯一运行时和测试数据库，不引入 SQLite fallback。

## Acceptance Criteria

- [x] 只有一套 PostgreSQL 数据库创建、迁移和清理核心。
- [x] 启用判定具有 enabled/disabled 负向回归，并在 CI 与本地受支持环境中行为明确。
- [x] 非回环管理员 URL 被拒绝，数据库名称经过安全校验。
- [x] 初始化或测试失败后不遗留数据库、连接池或挂起句柄。
- [x] 所有 PostgreSQL repository、integration 和 migration 测试通过。
- [x] API typecheck、architecture、check 和 test 门禁通过。

## Out of Scope

- 生产数据库连接与 migration 行为。
- 业务 repository 或 schema 变更。
- 远程 PostgreSQL 测试环境。
