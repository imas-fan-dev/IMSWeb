# IMSWeb Cache Architecture

## 目标

IMSWeb 的缓存用于短期、可丢失的数据，不承担账户、验证码或审核状态的权威存储。第一阶段使用 Valkey 8.1.9，并保留 Memory 实现供测试和无外部依赖的运行时使用。

## 分层模式

缓存遵循 `port -> domain/application policy -> infrastructure adapter -> runtime wiring`：

- `apps/api/src/ports/cache.ts` 定义 `CacheStore`，业务代码只依赖这个接口。
- `apps/api/src/domains/platform-auth/platform-email-cache.ts` 定义邮箱注册 cooldown 的键策略、值格式、TTL 和缓存失败时的回退行为。
- `apps/api/src/infra/cache/valkey/cache.ts` 使用 node-redis 连接 Valkey；`apps/api/src/infra/cache/memory/cache.ts` 用于测试和 Memory backend。
- `apps/api/src/runtime/node-services.ts` 根据 `IMS_CACHE_BACKEND` 选择 concrete adapter，并在 runtime shutdown 时关闭连接。

禁止 Platform auth handler 直接 import node-redis、拼接 Valkey URL 或决定缓存键。

## 邮箱注册边界

PostgreSQL 仍是邮箱注册验证码的唯一权威源，保存：

- 验证码 HMAC hash；
- 发送中和已发送状态；
- 过期时间、重发冷却、剩余尝试次数；
- 单次消费 token 和 delivery token。

Valkey 只保存短期 cooldown：

- key 使用 Platform JWT secret 对规范化邮箱做 HMAC，缓存中不出现邮箱、验证码或密码；
- value 只包含 `retryAfterAt`；
- TTL 不超过邮箱验证码 TTL；
- 缓存读取、写入或删除失败时放弃缓存优化并回退 PostgreSQL；
- 注册成功或邮件发送失败后尝试清理 cooldown。

因此 Valkey 重启、淘汰或短暂不可用不会绕过验证码校验，也不会丢失注册权威状态。

## 配置

- `IMS_CACHE_BACKEND`: `valkey` 或 `memory`；测试默认 `memory`，开发和生产要求 `valkey`。
- `IMS_VALKEY_URL`: `redis://` 或 `rediss://` URL；生产必须显式配置。
- `IMS_VALKEY_KEY_PREFIX`: 所有业务键的命名空间，默认 `imsweb:cache:`。
- `IMS_VALKEY_CONNECT_TIMEOUT_MS`: 连接超时，范围 250–30000 ms。

本地 `pnpm dev` 自动启动 `valkey/valkey:8.1.9-alpine`，并注入 `redis://127.0.0.1:6379`。Compose 通过 `local-cache` profile 管理本地实例。生产应使用独立、受访问控制的 Valkey 或托管兼容服务，不应把本地 Compose 实例作为高可用方案。

## 运行与故障策略

- API readiness 会检查 PostgreSQL 和当前 cache backend 的健康状态。
- 缓存连接初始化失败会阻止 Node runtime ready，避免误以为已经具备分布式缓存能力。
- 运行期间的单次缓存命令失败对邮箱 cooldown 采取 fail-open 到 PostgreSQL；验证码发送和消费仍由数据库流程决定。
- 当前阶段不把 idempotency store 或审核 CAS 状态迁移到 Valkey；这些能力需要持久化和事务语义，继续使用 PostgreSQL。
- 跨副本 rate limiter 已迁移到 Valkey：`ValkeyRateLimiter` 用单条原子 Lua 脚本（EVAL）完成窗口创建、过期滚动、身份重放豁免与计数，不使用非原子的 `get/set` 组合；窗口键与身份成员均为 SHA-256 散列，不落盘邮箱/IP 原文，并随窗口 TTL 自动过期，无需清理任务。内存后端（测试）使用 `MemoryRateLimiter`；与 `ValkeyCache` 共享同一条已连接的客户端，由 cache 关闭时统一释放。

## 验收

- Memory 和 Valkey adapter 覆盖 `get/set TTL/delete/ping/close`。
- 邮箱 cooldown 覆盖匿名键、过期、清理、缓存异常回退。
- 本地 Compose healthcheck 必须通过 `valkey-cli ping`。
- 开发启动器必须在 PostgreSQL/RustFS/Valkey 就绪后再执行 migrations 和启动 API/Web。
