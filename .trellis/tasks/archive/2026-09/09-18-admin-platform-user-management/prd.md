# 管理端平台用户帐号管理

## Goal

管理端从"只能管后台管理员帐号"扩展到"能管平台用户（C 端帐号）"：运营可以检索到某个用户、看清其帐号状态，并在用户被盗号或丢凭据时执行处置动作。

用户价值：运营侧在用户自助失败时有兜底手段，安全事件响应不必依赖改数据库。

## Background

### 现状

- `apps/api/src/domains/admin/` 下只有三类能力：`admin-accounts`（后台管理员 CRUD，表 `backoffice_accounts`）、`backoffice-auth`（后台登录）、`audit`（审计日志）
- `apps/web/app/pages/admin/accounts/index.tsx` 对应的是后台管理员管理页，与平台用户无关
- `apps/api/src/infra/db/repositories/platform-account-repository.ts` 已提供 `findAccountById`、`findAccountWithProfileById`、`listOAuthIdentitiesByAccount`，但没有任何"检索全部帐号""禁用帐号"方法
- `PlatformAccountRepository` 端口（`apps/api/src/ports/repositories/platform.ts:310`）不存在管理端用途的方法
- audit 写入工具 `apps/api/src/domains/admin/audit/write-audit.ts` 已存在

### 已确认的动作集

已与需求方确认为本期范围：

| 类别 | 动作 |
| --- | --- |
| 检索与查看 | 按邮箱 / 用户名 / ID 查询，分页列表；详情含绑定状态、会话数、最近登录 |
| 帐号状态 | 禁用 / 启用 |
| 会话处置 | 强制下线（吊销该用户全部会话） |
| 凭据处置 | 触发密码重置、解绑指定 OAuth provider（沿用末位凭据保护） |

明确排除：删除帐号、管理端直接改用户邮箱。

### 约束

- 契约先行：新增请求/响应 schema 落在 `packages/contracts` 的 admin 命名空间，admin schema 加 `admin` 前缀，多来源域按"public 先于 admin"排序
- API 仅在 HTTP 校验边界对 contracts 请求 schema 做 value-import；handler / repository / 响应逻辑一律 type-only 导入
- 响应 schema 精确，不 coerce / transform / strip；HTTP 一致性测试要拿解析结果与原始 JSON 比对
- 处置动作必须走 audit 写入
- 管理端路由需要管理员鉴权 + 角色门，复用 `backoffice-auth` 既有中间件链

## Requirements

- AR1 管理端可按邮箱 / 用户名 / ID 检索平台用户，返回分页列表
- AR2 管理端可查看单个平台用户的详情：绑定状态（有无密码、已绑 OAuth provider 列表）、活跃会话数、最近登录时间
- AR3 管理端可禁用 / 启用平台用户帐号
- AR4 管理端可强制下线指定平台用户（吊销其全部会话）
- AR5 管理端可对指定平台用户触发密码重置
- AR6 管理端可解绑指定平台用户的某个 OAuth provider，且不得把该用户置于零可用登录凭据状态
- AR7 上述每个处置动作写入 audit log，记录操作人、目标用户、动作与结果
- AR8 平台用户列表与详情不得泄露任何会话 bearer 凭据（`token_hash` / `previous_token_hash` / `csrf_hash`）

## Acceptance Criteria

- [x] AC1 检索能按邮箱、用户名、ID 三种条件各自命中目标用户；无匹配时返回空列表而非错误
- [x] AC2 详情返回的绑定状态与实际一致：`hasPassword` 反映是否存在密码凭据，OAuth 列表与 `listOAuthIdentitiesByAccount` 一致
- [x] AC3 禁用后该用户无法建立新会话，且既有会话失效；启用后恢复
- [x] AC4 强制下线后该用户全部会话立即失效，重复执行不报错
- [ ] AC5 触发密码重置后用户侧收到重置邮件，重置链接可完成改密
- [x] AC6 当目标 provider 是用户末位可用登录凭据时，解绑被拒绝并返回可区分的业务错误
- [x] AC7 每个处置动作在 audit log 中留下包含操作人、目标用户、动作、结果的可检索记录
- [x] AC8 用户列表与详情响应中不出现 `token_hash` / `previous_token_hash` / `csrf_hash` 任何字段
- [ ] AC9 非法输入（不存在用户、格式错误 ID、越权 provider）返回可区分错误，且不产生 audit 噪声记录

## Out of Scope

- 删除平台用户帐号
- 管理端直接修改平台用户邮箱
- 后台管理员（`backoffice_accounts`）管理能力的调整

## Open Questions

- 无（依赖子任务 `09-18-account-oauth-email-binding` 的末位凭据判定逻辑，需在 `implement.md` 中标注顺序）

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
