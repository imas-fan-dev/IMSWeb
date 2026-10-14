# 全项目测试治理收敛

## Goal

把已经转绿的测试门禁继续收敛为可维护、职责清晰且能稳定执行的测试体系，并修复唯一仍被明确标记为外部阻塞的 R2 字体 CORS 问题。

## Background

普通 Web Playwright、客户端资产 allowlist 和 JSON wire contracts 已进入正式门禁。最近一次本地 CI 模式普通 Web Playwright 结果为 252 passed、24 skipped、0 failed。后续治理仍有六类已确认缺口，覆盖 API 测试数据库生命周期、API/Web 测试辅助层、前端路由元数据、测试目录与脚本职责、Node 安全测试与生成式 inventory，以及 R2 字体交付。

R2 只读调查确认生产桶为 `imsweb-media-public-prod`，生产 custom domain 为 `imas-assets.texasoct.tech`。测试桶为 `imsweb-media-public-test`，custom domain 为 `test.imas-assets.texasoct.tech`；相同字体对象存在并返回 `200 font/ttf`。测试桶当前 CORS 是允许任意 origin 的宽策略，生产桶仍缺少所需 origin。用户要求先在测试桶验证候选策略，生产写入需要后续单独批准。

## Requirements

### R1 PostgreSQL 测试生命周期

- 统一 API 测试中的 PostgreSQL 数据库创建、迁移、连接派生和清理职责。
- `postgresIntegrationEnabled()` 必须表达真实可用性或显式启用策略，不能固定返回 `true`。
- 保留仅允许本机回环 PostgreSQL、隔离测试数据库、可靠强制清理和并行测试安全约束。
- 不重新引入 SQLite 作为运行时或测试持久层。

### R2 API 测试辅助层

- 收敛重复且语义一致的 JSON、认证、CSRF、cookie 辅助代码。
- 收敛重复的迁移和 Fudaba fixture，但不得把不同业务规则硬塞进带模式开关的通用 helper。
- 保留现有断言强度、HTTP 原始响应验证和 contracts 单一来源约束。

### R3 Web Playwright API 边界

- 建立严格、contracts 驱动的 Playwright API dispatcher 或等价单一边界。
- 未注册请求、错误 method/path、无效成功/错误 payload 应在测试中立即失败。
- 逐步迁移现有共享认证、Editorial、Homepage、Namecard 等 fixture，避免再次出现静默 401、旧 endpoint 和字段缺失。
- 不通过放宽 contracts schema、`skipContractCheck` 或吞掉未匹配请求来换取测试通过。

### R4 前端路由和测试编排

- 建立一个规范化的前端路由元数据来源，消除需要人工同步的重复清单。
- 测试目录与 root/workspace 脚本按职责分类，并让每个不变量只有一个执行 owner。
- 现有 root `test`/`check` 保持轻量，只负责调度，不重复构建或重复运行同一测试族。
- 治理规则禁止新增 `test:all`；所有收敛必须在现有 root、API、Web 脚本数量上限内完成。
- 保持现有 GitHub affected-workspace 路由和根脚本数量边界。

### R5 专项测试与 inventory 治理

- 缩减 `node-security` 的重复职责，只保留编译后 Node listener smoke 和共享适配器边界覆盖；已由其他门禁拥有的检查不重复执行。
- 把误置在 Wiki conformance 范围内的 Platform 测试移回对应 Platform 测试所有者。
- 生成式 route inventory 只保留必要的机器可读权威产物；Markdown 报告按需生成，避免无语义 churn。
- 不删除独有断言；任何删除必须先证明已有单一 owner 覆盖同一不变量。

### R6 R2 字体 CORS

- 第一检查点只更新 `imsweb-media-public-test`。更新前保存完整 CORS 快照，把已审查的候选策略应用到测试桶，并验证允许与拒绝的 origin、字体 MIME 和真实浏览器加载。
- 测试桶验证通过后停止远端操作并提交证据；没有新的用户授权，不得更新 `imsweb-media-public-prod`。
- 生产获批后，对生产桶重复快照、最小策略、控制面 readback、HTTP 和三浏览器验证。
- 修复必须落在 R2 bucket CORS policy，并提供可重复验证命令和完整回滚方式。
- 不提交 Cloudflare 凭据、账户标识、回滚快照或生产数据。
- 只有生产 URL 验证成功后才能移除对应 Playwright `fixme`；测试桶验证不得通过修改生产Web字体常量来代替。

## Constraints

- 本任务只治理测试、测试基础设施、CI/脚本、生成式测试资产和字体交付配置；不改变业务功能、公开 JSON wire contracts 或页面 UX。
- 先补齐执行 owner 和稳定性证据，再删除重复测试或移动目录。
- 所有重构必须保持现有测试语义；无法证明等价时保留原测试。
- 当前 Wrangler OAuth 身份只获准尝试测试桶 CORS 更新。写权限、目标归属或 readback 不符合预期时必须停止；生产桶保持只读，等待后续单独授权。
- 不挂接到现有名片移动端任务，父任务负责六项工作包的统一验收。

## Acceptance Criteria

- [x] AC1：PostgreSQL 测试只使用一套共享生命周期核心，启用判定有正反回归，并通过所有 PostgreSQL 相关 API 测试。
- [x] AC2：重复 API 测试辅助代码和迁移 fixture 已按稳定语义收敛；现有原始 JSON、认证、CSRF、cookie 和迁移断言无损保留。
- [x] AC3：普通 Web Playwright 的 HTTP mock 经过严格 dispatcher；未注册请求和 contract-invalid payload 有负向测试，完整 276 项矩阵在 CI 模式下通过。
- [x] AC4：前端路由元数据有单一权威来源；测试目录和脚本职责符合批准的 taxonomy，affected-workspace 与脚本边界测试通过。
- [x] AC5：`node-security`、Platform 测试归属和 route inventory 已收敛，机器可读 inventory 可确定性再生成，Markdown 不再是提交时同步负担。
- [ ] AC6：测试桶先完成可回滚的候选策略验证；后续单独获批的生产更新让真实生产字体 URL 返回正确 CORS 头，三浏览器字体加载通过，相关 `fixme` 被移除。
- [ ] AC7：`pnpm run check`、`pnpm run test`、普通 Web Playwright CI 模式及所有新增治理负向测试通过。
- [ ] AC8：每个工作包有独立提交和验证证据；父任务最终验收时工作区干净且目标分支已同步。

## Out of Scope

- 业务功能、页面视觉或交互重设计。
- API wire contract、数据库业务 schema 或生产数据迁移。
- 与测试职责无关的生产代码重构。
- 不属于 `iris-idol.ttf` 交付链路的 Cloudflare 基础设施调整。

## Confirmed Decisions

- 当前 OAuth 身份可用于测试桶的最小 CORS 更新尝试，但不代表已证明写权限；权限失败时停止。
- 生产桶在测试证据审查前保持只读。生产更新需要新的明确授权，因此它不是启动其余工作包的前置条件，但仍是 AC6 和父任务最终完成的前置条件。
