# 全量 JSON Wire 契约迁移

## Goal

在一个执行子任务中完成项目全部 HTTP JSON request/response contract 迁移，使
`@imsweb/contracts` 成为 wire schema 和类型的唯一来源，并通过 Terra 业务批次并行实施后统一集成。

父任务 `.trellis/tasks/09-06-api-request-response-contracts` 的 PRD 和设计是本任务的需求与架构权威；
本任务负责一次性落实并提供验收证据。

## Requirements

- C1. 所有 JSON body、query、params、success、HTTP error 和 `2xx` business-error schema/type 迁入
  `@imsweb/contracts`。
- C2. API 只在 HTTP request-validation 边界运行 contracts schema；其他 API 层只使用 type，且应用代码
  不直接导入 Zod。
- C3. API JSON response 使用 contracts 类型；view builder 和 repository-record mapping 保持本地。
- C4. Web 所有 JSON endpoint 使用 contracts success/error/business-error schema；UI 类型、`File`、
  `FormData` 和浏览器状态保持本地。
- C5. 保持所有既有路径、状态码、错误文案、Cookie、CSRF、redirect、兼容路由和未知字段行为。
- C6. Canonical Backoffice login 接受 `op` 与 `editor/null` 并保留 `token`；legacy operator gate 不变。
- C7. Web editor 可进入 Wiki 管理功能，但不能获得 op/super_admin 能力。
- C8. Wiki mutation contract 匹配后端已测试的完整 payload；multipart、form-urlencoded、legacy lookup 和
  query/body precedence 不变。
- C9. Existing request schema 显式选择 strict、strip 或 passthrough；新 request schema 默认 strict。
- C10. Response schema exact，不能通过 strip/default/coercion/transform 隐藏 wire drift。
- C11. 非 JSON success 保持应用本地并进入 symbol-level exception audit，其 JSON error 仍由 contracts 拥有。
- C12. 静态门禁能阻止新增 API/Web 本地 wire shape、未校验 Web JSON、非 validation runtime schema import
  和未登记非 JSON success。
- C13. 并行 agents 使用 Terra 模型和独立 worktree；共享基础设施先串行，业务批次并行，门禁最后串行。

## Acceptance Criteria

- [x] 父任务的全部 Acceptance Criteria 均有对应文件和测试证据。
- [x] 223 个 method/path 实例和 283 个 request carrier 边界均被迁移或明确分类。
- [x] 41 reject、161 project、17 passthrough 和 64 N/A 的未知字段基线保持。
- [x] 生产媒体和 site-content 的 `v` query 保持可用。
- [x] Backoffice login、session、compatibility cookies/headers 和 editor Wiki capability 通过 HTTP/Web 测试。
- [x] Wiki raw JSON、contracts parse 与 Web parse 深度一致，不再静默丢字段。
- [x] 每个业务域具有 valid、invalid、error、unknown-policy 和 raw-equality 聚焦测试。
- [x] API runtime Zod/schema import 只存在于批准的 request-validation 边界。
- [x] Web JSON endpoint 全部声明 shared success/error schema，生产代码不存在 `skipContractCheck`。
- [x] 非 JSON success exception 均绑定稳定 ID、symbol、理由、JSON error schema 和聚焦测试。
- [x] Contracts exports、root namespace、README、entrypoint classification 与 build output 一致。
- [x] Contracts/API/Web typecheck、source rules、boundaries、聚焦测试和最终全量门禁通过。

## Out of Scope

- 将现有 161 project 或 17 Editorial passthrough 边界统一改成 strict。
- 收紧通用 multipart/Wiki field bag。
- 删除 Backoffice 兼容路由、Cookie 或 token 字段。
- 修改数据库 schema、repository contract 或业务数据。
- 重设计历史 API、页面交互或路由所有权。
- 删除仍调用 `410` Information 路由的产品功能。

## Key Decisions

- K1. 只有一个执行子任务；业务域是内部 work package，不创建更多 Trellis 子任务。
- K2. 不引入全局 endpoint descriptor 或第二套手写 route manifest。
- K3. 基础层与最终门禁串行；业务域使用 Terra 独立 worktree 并行实现。
- K4. 全局共享文件由集成阶段统一修改；domain agents 只提交领域文件和必要的 surface delta 说明。
- K5. 父任务 PRD、design 和 research 在冲突时优先于 agent 推断。
