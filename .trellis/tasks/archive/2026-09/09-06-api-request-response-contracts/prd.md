# 统一 API 请求响应契约

## Goal

将项目所有 HTTP JSON request/response wire formats 统一收敛到
`@imsweb/contracts`，包括错误响应和当前仅由 API 使用的端点；同步升级业务边界规则和自动化门禁，
避免后端 interface、前端本地 schema 与共享 schema 分别演进。

## Background

- 当前仓库包含 34 个 API `request.ts` 和 27 个 API `response.ts`。
- 23 个 `response.ts` 已引用 `@imsweb/contracts`，但其中仍有成功响应被重复声明。
- Backoffice 登录已出现实际漂移：API 允许 `dept: string`、`adminRole: null` 并返回 `token`，
  Web 本地 schema 要求 `dept === "op"`、`adminRole` 非空且未声明 `token`。
- 仓库中的账户脚本、迁移、Wiki 授权测试和架构文档确认 `editor/null` 是合法 Backoffice 账户；
  canonical 登录是 `editor` 与 `op` 共用的认证入口。当前 Web `AdminLayout` 会阻止 editor 进入其有权
  使用的 Wiki 管理页面。
- Wiki API 手写多组 mutation response；共享 schema 对部分相同端点只声明 `{ id }`，
  Web 解析时会丢弃 API 返回的额外字段。
- Information、homepage-links、events、editorial、namecards、news 等域存在可直接改为共享
  类型别名的重复成功响应。
- API request 文件多数包含 Hono context、URL 参数、query 解析、`UploadedFile`、multipart
  或仓储更新前的内部校验结果，不能按文件整体迁入 contracts。
- `pnpm run check:rules` 当前通过，说明现有门禁尚不能阻止 wire shape 在 API/Web 中重复定义。

## Requirements

- R1. 按“传输结构”而不是按文件名确定归属；所有 HTTP JSON request/response schema 及其
  `z.infer`/`z.input` 类型由 `@imsweb/contracts` 唯一定义，包括错误响应和当前仅由 API 使用
  的端点。
- R2. API `request.ts` 仅保留 Hono/runtime 上下文、参数解析、multipart/上传对象、内部校验结果
  和到业务输入的适配逻辑，不重复声明已由 contracts 拥有的 JSON body/query/params wire shape。
- R3. API `response.ts` 仅保留 view builder、仓储记录映射和非 JSON 的 API 本地响应边界；
  所有 JSON 响应必须使用 contracts 类型别名。
- R4. Web endpoint 通过 contracts schema 和 `parsed(...)` 校验 JSON response；只保留 UI 语义
  类型、浏览器请求状态、`File`/`FormData` 和明确的 Web-only input。
- R5. 优先修复 Backoffice 登录和 Wiki 已知漂移，再按业务域迁移其余重复定义。
- R6. 保持现有 HTTP 路径、状态码和兼容路由行为；除非规划明确记录，不借契约迁移改变业务响应。
- R7. 为迁移后的每个业务域增加真实 HTTP response conformance 测试，并为共享 request schema
  增加边界输入测试。
- R8. 升级静态规则，阻止新增 API/Web 本地共享 wire schema、手写成功响应和未校验 JSON response。
- R9. API 允许且只允许在 HTTP request validation 边界运行时导入并执行 contracts schema；
  Zod 继续由 contracts 封装，领域逻辑、仓储和基础设施层不得直接依赖 Zod。共享常量由 contracts
  schema 或其 runtime-neutral 模块保持单一来源。
- R10. Backoffice Web 授权与 API 的能力规则一致：`editor` 可进入 Wiki 管理页面，但不得获得
  `op` 或 `super_admin` 专属能力。
- R11. 迁移现有 request schema 时保持各端点当前的未知字段行为；新端点及后续主动修改的
  request schema 默认严格拒绝未知字段。宽松行为必须在 schema 和测试中显式体现。

## Acceptance Criteria

- [x] Backoffice 登录的 API 和 Web 使用同一个共享 schema，保留返回 `token`，并接受 `op` 与
  `editor/null` 账户。
- [x] `editor` 登录后可进入 Wiki 管理页面，但仍无法访问 `op`/`super_admin` 专属功能。
- [x] Wiki mutation contracts 保留后端当前返回且已由 API 测试覆盖的完整 payload；实际 JSON、
  contracts schema 和 Web 解析结果一致，不再依赖未知字段剥离。
- [x] 已有共享 schema 的 API 成功响应不再通过本地 interface 重复声明。
- [x] 所有 HTTP JSON request body/query/params 具有单一 schema/type 来源，包括 API-only 端点。
- [x] API route validator 在请求边界直接执行对应 contracts schema，并保持约定的 400 错误行为。
- [x] 现有 request schema 的未知字段行为在迁移前后保持一致；宽松端点具有显式 schema 策略和测试，
  新增 request schema 默认 strict。
- [x] 所有 JSON success/error response 具有单一 schema/type 来源，包括 API-only 端点。
- [x] Hono context、repository record、multipart 上传对象、stream、redirect、HTML、二进制和静态资源响应未被错误迁入 contracts。
- [x] Web JSON endpoint 均使用共享 schema 解析；例外仅限非 JSON 边界并可被自动审计。
- [x] 新静态规则能通过反例测试拒绝本地重复 wire shape，同时允许已批准的本地边界。
- [x] Contracts exports、根 namespace 和 README 与新增/调整模块同步。
- [x] Contracts、API、Web 的类型检查、边界检查、聚焦测试和全量相关门禁通过。

## Out of Scope

- 修改数据库 schema、仓储接口或业务数据。
- 改变页面设计、交互流程或路由所有权。
- 将 Hono、Node、PostgreSQL、对象存储或浏览器专属类型引入 contracts。
- 为迁移之外的历史接口重新设计业务行为。

## Key Decisions

- D1. Contracts 覆盖所有进入或离开 HTTP 路由的 JSON wire schema，包括 success、error 和
  API-only 端点。
- D2. Hono context、repository record、`File`/`UploadedFile`、multipart carrier、stream、redirect、
  HTML、二进制和静态资源响应继续由所属应用维护。
- D3. API 在 HTTP request validation 边界运行时执行 contracts schema；除该边界外，API 继续禁止
  runtime schema/Zod 依赖，应用代码仍不得直接导入 `zod`。
- D4. Canonical Backoffice 登录继续接受 `editor` 与 `op`；`adminRole === null` 对 `editor` 合法，
  授权由具体业务路由和 Web 管理页面执行。
- D5. Canonical 与兼容登录响应继续返回 `token`；Web 使用 cookie 会话但仍按完整 schema 校验响应。
- D6. Wiki mutation schema 扩展为匹配后端当前完整响应，不通过缩减 handler payload 迁就现有
  Web 的窄 schema。
- D7. 现有 request schema 迁移时保持当前未知字段行为；新端点和后续主动修改的 request schema
  默认 strict。当前宽松端点及仓库中实际出现的额外键先形成完整清单，再评估后续收紧成本。
- D8. 全部产品代码迁移收敛到一个执行子任务；业务域作为该子任务内部的 Terra 并行 work package，
  不再拆成多个 Trellis 子任务。
