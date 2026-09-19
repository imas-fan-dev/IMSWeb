# PostgreSQL 测试生命周期：技术设计

## 当前实现

数据库生命周期分散在：

- `tests/integration/postgres-harness.ts`：每次从 `template0` 创建、迁移、可选seed、显式close；
- `tests/server/postgres-test-database.ts`：一次迁移模板、每测试clone、`TestContext`自动cleanup和sibling connection；
- `tests/node-security.test.js`：suite内自行创建、迁移、启动listener并清理。

前两者共有55个调用点。三者在URL安全、命名、migration成本、seed状态和cleanup失败处理上不同。

## 共享核心

新增CJS兼容的测试数据库生命周期核心，单独拥有：

- 配置解析：`IMS_TEST_POSTGRES_ENABLED`、两个URL变量及本地默认URL；
- PostgreSQL协议和回环host校验；
- 长度受限、带label/process/random entropy的数据库名；
- admin pool、数据库创建、migration、可选template clone；
- managed sibling connection注册；
- 聚合cleanup，确保close失败也会force drop和结束admin pool。

`TestContext`与显式harness保留薄适配器。`node-security`继续拥有编译listener和文件fixture，只把数据库分配交给共享核心。

## 模板与migration

HEAD catalog使用按catalog identity缓存的已迁移模板，减少重复migration。传入自定义`migrationsPath`的历史回放测试不复用HEAD模板，保证目标migration可在旧catalog上重放。

canonical Fudaba seed在allocator之外作为可选setup执行，避免污染假定空数据库的server tests。

## 启用策略

- 默认启用并使用安全的localhost默认URL，保持当前本地工作流。
- `IMS_TEST_POSTGRES_ENABLED=false`统一跳过所有PostgreSQL-backed测试。
- `true`或未设置时识别两个URL变量，`IMS_TEST_POSTGRES_ADMIN_URL`优先。
- CI设置`IMS_TEST_DATABASE_URL`，不得产生意外skip。
- 其他flag值、非PostgreSQL协议和非回环host直接报配置错误。

## 回滚

共享核心和适配器先落地，调用方迁移单独提交。删除旧逻辑前通过搜索证明所有数据库分配已转移；失败时可回退调用方而保留新核心和测试。
