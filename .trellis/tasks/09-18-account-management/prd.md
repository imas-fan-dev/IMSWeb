# 完善平台帐号管理能力

## Goal

补齐平台帐号管理的四处缺口，使帐号生命周期在四个界面上都闭环：

- 已登录用户能在个人档案里自行绑定 OAuth 帐号与邮箱，不必依赖人工介入
- 网页端提供可用的帐号安全管理页，会话设备列表用简短、可辨识的标记表达“这是什么设备”，而不是丢一段原始 User-Agent
- 管理端能对平台用户（C 端帐号）做检索、查看与处置，而不只是管理后台管理员帐号
- OAuth 登录在移动 Web 与 Tauri app 内均可用，不再只在桌面浏览器里顺手

用户价值：用户自助率提升，安全事件（设备丢失、帐号被盗）有自助出口，运营侧有帐号处置手段，移动端用户能完成登录。

## Background

### 已存在的实现

平台帐号体系已在 `platform` 命名空间下成型，本次工作是在其上加能力，不是新建体系。

**API 域划分**（`apps/api/src/domains/identity/`）

- `platform-account-security/`：面向已登录用户的帐号安全，按能力分三个子域
  - `password/handlers/change-password.ts`：改密
  - `sessions/handlers/`：`list-sessions.ts`、`revoke-session.ts`、`revoke-other-sessions.ts`
  - `oauth-links/handlers/`：`list-oauth-links.ts`、`unlink-oauth-link.ts`
  - `routes.ts` 把三者挂在 `platformApiPath('/me')` 下
- `platform-auth/`：匿名与 refresh-only 调用方（注册、登录、登出、刷新、密码重置、邮箱验证码）
- `platform-profile/`：展示字段与头像
- `admin/admin-accounts/`：后台管理员帐号（`backoffice_accounts` 表），**不是**平台用户

**契约**（`packages/contracts/src/platform/account-security.ts`）

- `platformSessionDeviceSchema:49`：`id` / `current` / `userAgent` / `ipAddress` / `createdAt` / `lastSeenAt` / `expiresAt`。设备信息只有原始 `userAgent` 字符串
- `platformOAuthLinkSchema:69`：已带 `removable` 字段；`platformOAuthLinkListResponseSchema:81` 带 `passwordEnabled`——"不可解绑最后一个登录凭据"的判定已经建模
- 没有 OAuth **绑定**（link）的请求/响应契约，只有解绑

**仓储端口**（`apps/api/src/ports/repositories/platform.ts:310` `PlatformAccountRepository`）

- 已有 `listOAuthIdentitiesByAccount`、`deleteOAuthIdentity`、`findOAuthIdentity`、`createOAuthAccount`、`findAccountById`、`findAccountWithProfileById`
- `deleteOAuthIdentity` 的注释明确：末位凭据判定写在 DELETE 语句内，避免并发解绑把帐号锁死。绑定侧需要同样的原子性思考
- 未见到面向管理端的"检索全部帐号 / 禁用帐号"方法

**Web 端**（`apps/web/app/pages/account/security/`）

- `account-security-page.tsx` + `oauth-link-section.tsx` + `password-section.tsx` + `session-device-section.tsx` + `account-security-model.ts`
- 路由 `/account/security` 已在 `route-metadata.ts:143` 注册
- `session-device-section.tsx` 已消费 `PlatformSessionDevice`，但展示层没有系统/端类型解析

**OAuth provider 是动态配置的**

- `platformOAuthProviderCodeSchema`（`packages/contracts/src/platform/index.ts:46`）只约束格式（`^[a-z][a-z0-9-]*$`），不枚举具体 provider
- provider 由管理端页面 `apps/web/app/pages/admin/platform-oauth/` 配置（code / displayName / icon / buttonColor，见 `index.ts:216`）

### 子任务映射

| 子任务 | 目录 | 交付物 |
| --- | --- | --- |
| 登录用户绑定与换绑 OAuth / 邮箱 | `09-18-account-oauth-email-binding` | OAuth 绑定链路 + 邮箱绑定/换绑链路及二次校验 |
| 网页端帐号安全页与设备标记展示 | `09-18-account-security-device-display` | 设备标记解析与展示、页面可用性 |
| 管理端平台用户帐号管理 | `09-18-admin-platform-user-management` | 平台用户检索、查看、处置 |
| OAuth 登录的 Web 与移动端适配 | `09-18-oauth-login-mobile-adaptation` | 移动 Web 与 Tauri app 内可完成 OAuth 登录 |

### 约束

- **存储结构不变**：设备解析只在展示层适配，不改 `platform_refresh_sessions` 存储，不新增设备字段
- 契约是唯一 wire 事实来源：新端点必须在 `@imsweb/contracts/platform/account-security.ts` 定义请求/响应 schema，API 仅在 HTTP 校验边界 value-import
- 请求 schema 默认 `strict`；响应 schema 精确（不 coerce / transform / strip）
- 所有帐号安全写操作沿用 `platformAuth` + `activePlatformMutation` + `platformCsrf` + 限流中间件链
- 管理端操作需写入 audit log（`domains/admin/audit/write-audit.ts` 已存在）

## Technical Notes

### 邮箱即登录凭据，不是 profile 字段

平台帐号的邮箱存在 `platform_email_credentials` 表，`normalized_email` 是主键（唯一约束名 `platform_email_credentials_pkey`），同一行保存 `algorithm` / `parameters_json`（密码 hash）与 `account_id`。因此：

- "绑定邮箱"实质是建立或迁移一条邮箱+密码登录凭据，不是写一个展示字段
- 换绑需要迁移主键，同时保留密码 hash 与 `account_id` 关联
- 邮箱全局唯一，冲突表现为 `platform_email_credentials` 的唯一约束错误，仓储已有 `isEmailConflict` 判定（`platform-account-repository.ts:174`）与 `email-conflict` 结果类型

### 验证码表是通用的

`platform_email_verification_codes` 带 `normalized_email` / `code_hash` / `consumed_token` / `consumed_at` / `delivery_token`，注册流程已在使用（`platform-account-repository.ts:830` 起）。验证码 hash 当前带域分隔符 `'platform-email-registration\0'`（`registration/email-verification.ts:12`）。新增用途需要各自的域分隔符，避免同一验证码跨用途复用。

### 帐号状态字段已存在

`PlatformAccountRecord` 已有 `status: PlatformAccountStatus` 与 `deleted_at: number | null`（`apps/api/src/ports/repositories/platform.ts:15`），管理端禁用/启用不需要新增存储结构。

### OAuth state 表已预留 link 语义

`platform_oauth_states` 已有 `intent IN ('login','link')` 与 `linking_account_id` 列（`apps/api/migrations/postgresql/0020_platform_accounts.sql:70-99`），但应用层写死了登录语义：`createOAuthState` 固定写 `linking_account_id=NULL`（`platform-account-repository.ts:508`），`consumeOAuthState` 固定按 `intent='login'` 消费（`:532`）。OAuth 绑定不需要新增存储结构，只需把这两个函数泛化。

### 审计表没有 result 列

`logs` 表字段为 `id/username/producername/action/target/ip/time`（`apps/api/migrations/postgresql/0001_initial_compatibility.sql:30-38`），动作是自由字符串无枚举；`writeAudit(c, action, target)` 同步 await 但吞异常（`apps/api/src/domains/admin/audit/write-audit.ts:5-22`）。AR7 要求的“结果”如何表达需在设计层定下，不能假定已有存储位。

### 帐号状态与强制下线的两个机制

- `PlatformAccountStatus = active | restricted | suspended | deleted`（`0020_platform_accounts.sql:5-13`），禁用写 `status='suspended'`；不能碰 `deleted_at`，它受 DB CHECK 约束
- `token_version` 让全部 access token 立即失效（`apps/api/src/middleware/hono-auth.ts:97-111`），与“吊销 refresh 会话”是互补的两半；强制下线需要两者一起做

### 管理端页面无现成分页组件

`apps/web/app/pages/admin/` 下没有 DataTable 或 Pagination 组件，表格与分页均需手写，可照抄 `cards/index.tsx:228-400` 的分页范式。

### 设备列表：分析依据只有原始 UA

会话记录只有 `user_agent` 与 `ip_address`（原文 trim 后截 1024），没有 device id，也没有 client 类型；刷新轮换不更新这两列。客户端虽有 `isTauri()` 与构建期 `IS_APP_TARGET`，服务端完全看不到，且 Tauri 未配置自定义 UA，因此「iOS 应用 / iOS Safari」只能靠 WebView UA 特征启发式判定，iPadOS 桌面模式的 UA 与桌面 Safari 完全一致。这是 R4/AC5 的现实上限。

### OAuth 回调：provider 只见 HTTPS，app 回跳在我们自己的回调之后

每个 provider 只存一个 `redirect_uri`（`apps/api/migrations/postgresql/20260818010000_platform_oauth_configuration.sql:10-11`）。调研阶段曾担心这会把 app 逼向「让 provider 直接回调 app scheme」，但 provider 侧政策不允许：

- **Google**：Android 客户端默认禁止自定义 URI scheme（报错 `Custom URI scheme is not supported on Android or Chrome apps`），iOS 仍支持 reverse-DNS 形式且 scheme 必须含点号；loopback 对 iOS / Android 已废弃
- **GitHub**：`redirect_uri` 需与登记 callback URL host/port 精确匹配

因此方案定为：**provider 继续只看到我们既有的 HTTPS 回调**，app 回跳发生在我们自己的回调之后。好处是 provider 配置不变、`validatePlatformOAuthRedirectUri` 的 HTTPS 校验不放宽、不需要为绕开 Google Android scheme 禁令去写原生 SDK 插件。

另一半约束是会话：`establishPlatformSession`（`platform-auth/contracts/session.ts:204-253`）无条件写 cookie，但 Tauri WebView **无法继承回调 cookie**（origin 不同 + API 不给 credentials + 前端主动 omit）。app 侧必须走已存在的 bearer 通道（`x-ims-auth-mode: bearer` / `capturePlatformTokens` / `platform-token-store.ts:20-21`）。`docs/development/tauri-mobile.md:321-323` 已把方向写成 “deep link + 一次性 token exchange”。

### app 深链能力尚不存在

`Info.ios.plist` 无 `CFBundleURLTypes`、`tauri.conf.json` 无 `plugins.deep-link`、`Cargo.toml` 无 `tauri-plugin-deep-link`。已有 `tauri-plugin-opener` 与 `system-opener.ts:44-56` 的 `openSystemUrl`，但只负责送出去。`src-tauri/gen/` 是派生产物，Android scheme 声明需走构建后重新应用脚本（参照 `android-release-network.js`）。

## Requirements

- R1 已登录用户可在个人档案中发起 OAuth 帐号绑定，绑定成功后该 provider 在 OAuth 链接列表中显示为已绑定（已确认冲突策略）
  - 目标 OAuth 身份已归属其他帐号：拒绝绑定，返回可区分业务错误并引导改用该身份登录，不转移任何数据
  - 目标 OAuth 身份本就属于当前帐号（重复绑定）：幂等成功，返回当前链接
  - 保持“一个 OAuth 身份唯一归属一个帐号”不变量，不做帐号合并
- R2 已登录用户可在个人档案中建立或迁移邮箱凭据（已确认规则）
  - 补绑（帐号尚无邮箱凭据）：新邮箱验证码 + 设置新密码
  - 换绑（帐号已有邮箱凭据）：新邮箱验证码 + 当前密码
  - 目标邮箱已被占用时返回 `email-conflict` 类可区分业务错误
- R3 绑定/换绑操作需通过服务端二次校验，且不得让用户失去最后一个可用登录凭据
- R4 网页端帐号安全页在设备列表中以简短标记展示操作系统、端类型（手机/PC）与设备名，不再直接展示原始 User-Agent
- R5 设备解析仅作用于展示层，存储与 wire 契约的既有字段语义不变
- R6 管理端可检索与查看平台用户帐号信息
- R7 管理端可对平台用户执行以下处置动作（已确认范围）
  - 检索与查看：按邮箱 / 用户名 / ID 查询，分页列表；详情含绑定状态、会话数、最近登录
  - 帐号状态：禁用 / 启用
  - 会话处置：强制下线（吊销该用户全部会话）
  - 凭据处置：触发密码重置、解绑指定 OAuth provider（沿用末位凭据保护）
- R8 管理端的帐号处置动作写入 audit log
- R9 OAuth 登录在移动 Web（小屏浏览器）与 Tauri app 内均可完成，不依赖桌面浏览器专属能力
- R10 移动端 OAuth 登录的会话建立方式与既有 Web 流程一致，不引入第二套会话机制
- R11 app 回跳使用一次性短时效授权码，不把长期凭据放进 URL；provider 配置与 HTTPS 回调校验保持不变。**已确认**：回跳用自定义 scheme + `code_verifier` 强化（verifier 从不经深链），iOS 与 Android 同期交付

## Acceptance Criteria

- [ ] AC1 未绑定某 provider 的用户完成绑定后，`GET /me/oauth-links` 返回该 provider 且 `removable` 与实际可解绑性一致
- [ ] AC1a 绑定已归属其他帐号的 OAuth 身份被拒且不产生任何写入；重复绑定自己已绑的 provider 幂等成功
- [ ] AC2 邮箱补绑与换绑均在验证码校验通过前不落库；换绑在当前密码校验失败时拒绝；冲突邮箱返回可区分业务错误
- [ ] AC2a 邮箱凭据迁移后密码登录仍使用原密码 hash，不需重新设置密码；迁移前已存在的会话不受影响
- [ ] AC3 任一绑定/换绑路径都不会产生"零个可用登录凭据"的帐号状态，并发场景下同样成立
- [ ] AC4 设备列表对 iOS / Android / Windows / Linux / macOS 各返回可辨识的系统标记，并区分手机与 PC
- [ ] AC4a 同一 UA 的同型号设备靠会话 id 短后缀区分，后缀短且跨刷新稳定；设备名使用平台词而非硬件型号
- [ ] AC4b 「已知系统但端类型未知」与「完全未知设备」分开展示，两套文案均在 zh-CN 与 en 存在
- [ ] AC5 同一用户的多个同型号设备在列表中可区分（设备名具备唯一性）
- [ ] AC6 设备解析不改变 `platformSessionDeviceSchema` 字段语义，API 存储层无 schema 变更
- [ ] AC7 管理端能按条件检出目标平台用户并查看其帐号状态
- [ ] AC8 禁用后该用户无法建立新会话且既有会话失效；启用后恢复；强制下线后该用户全部会话失效
- [ ] AC9 管理端解绑 OAuth 时，末位登录凭据保护同样生效，不允许通过管理端把帐号置于零凭据状态
- [ ] AC10 每次管理端处置动作在 audit log 中留下可检索记录
- [ ] AC11 移动 Web 与 Tauri app 内均可从登录页发起 OAuth 登录并回到原界面，登录完成后会话与 Web 流程一致
- [ ] AC12 单 `redirect_uri` 配置下，Web 与 app 两条发起路径都能正确回流，回调不互相串味

## Out of Scope

- 存储结构变更与历史 User-Agent 回填
- 新建帐号体系或替换现有 auth 流程
- 后台管理员（`backoffice_accounts`）管理能力的调整
- 管理端删除帐号：不可逆，且与保留审计轨迹冲突
- 管理端直接改用户邮箱：等同于给管理员 impersonation 能力，需要更强的角色门与审计，另行评估

## Open Questions

- 无。产品侧决策已全部收敛。

## 已按推荐定夺（可在审阅时推翻）

设计过程中出现的三处取舍，均取了成本更低的选项，理由如下。若审阅时不认可，改动量已在括号内标出：

1. **验证码邮件的 purpose 复用**（子任务 `account-oauth-email-binding`）。绑定与换绑的验证码复用注册流程的投递 purpose，因此邮件文案里会写「注册验证码」。要改成独立措辞，需新增 `email_binding` purpose 与两条 CHECK 约束迁移。取低成本选项的理由：正文里的验证码本身正确且可用，措辞不准确不影响安全性；但这是用户可见的瑕疵，若在意值得付那两条迁移
2. **设备图标只按端类型区分**（子任务 `account-security-device-display`）。原 AC4 要求图标随系统与端类型同时变化，但 Lucide 已移除品牌图形，没有 Apple / Windows 这类 OS 图标，该 AC 按原文无法满足。已改写为只按端类型（手机 / 平板 / PC / 未知）区分，系统差异交给平台词承担。（改动量为 select 图标的映射表，很小）
3. **app 内 OAuth 采用「跳出去再回来」**（子任务 `oauth-login-mobile-adaptation`）。外部浏览器体验不是内嵌的。这是 provider 政策与现有依赖（无 in-app 浏览器）双重限制下的唯一可行路径，且 `docs/development/tauri-mobile.md:321-323` 已写定深链方向。iOS 从 303 跳自定义 scheme 的行为需真机结论；若真机不成立，改用 HTTPS 中转页，第 1 至 5 步不变

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
