# 技术设计：登录用户绑定与换绑 OAuth / 邮箱

本文把 `prd.md` 的 ER1–ER10 / AC1–AC9 落成可执行的实现方案。所有既有事实都带
`file:line`；`[决策]` 是本文档拍板的取舍，`[修正]` 是相对 PRD/research 假设的改动。

---

## 1. 现状与约束（带锚点的事实）

### OAuth

- 公共 OAuth 前缀 `platformAuthOAuthPath()` = `/api/platform/auth/oauth`
  （`packages/contracts/src/paths.ts:56`）。三条匿名路由
  `/providers`、`/:provider/start`、`/:provider/callback`
  （`apps/api/src/domains/identity/platform-auth/oauth/routes.ts:38-53`）。
- `handlePlatformOAuthStart` 里 `createPkcePair`/`hashValue`/`safeReturnPath` 都是模块私有
  （`oauth-login.ts:22-50`），`createOAuthState` 固定写 `intent:'login'`、
  `linking_account_id=NULL`（`oauth-login.ts:86-93` +
  `platform-account-repository.ts:498-521`）。
- `consumeOAuthState` 的 DELETE 写死 `intent='login'`
  （`platform-account-repository.ts:524-539`）。表本身已备 `intent IN ('login','link')`
  与 `linking_account_id`，并有 CHECK 约束要求 `link → linking_account_id IS NOT NULL`
  （`0020_platform_accounts.sql:70-99`）。
- `NewPlatformOAuthStateInput.intent` 目前是字面量 `"login"`
  （`apps/api/src/ports/repositories/platform.ts:160-168`）。
- `createOAuthAccount`（`platform-account-repository.ts:690-758`）会同时建 account+profile；
  全仓库只有一处 `INSERT INTO platform_oauth_identities`（`:727`），**不存在**只插身份的
  原语。唯一约束为 `pkey(provider_code, provider_subject)` 与
  `unique(account_id, provider_code)`（`0020_platform_accounts.sql:47-68`），冲突经
  `isOAuthIdentityConflict`（`platform-account-repository.ts:185-196`）识别。
- provider code 是自由字符串，只约束格式
  （`packages/contracts/src/platform/index.ts:46-50`）；`listProviders()` 只返回
  enabled 且配置完整的 provider（`infra/oauth/platform-oauth-client.ts:194-206`）。
- 每个 provider 只存一个 `redirect_uri` 单列
  （`20260818010000_platform_oauth_configuration.sql:10-11`），
  子任务 `09-18-oauth-login-mobile-adaptation` 依赖该单回调地址。

### 邮箱凭据

- `platform_email_credentials`：`normalized_email` 是主键、`account_id` 是
  `NOT NULL UNIQUE`，同行保存 `algorithm/parameters_json/salt/password_hash`
  （`0020_platform_accounts.sql:128-150`）。
- `isEmailConflict` 是私有 helper，**只匹配 `platform_email_credentials_pkey`**
  （`platform-account-repository.ts:169-183`），不覆盖 `account_id` 唯一约束。
- 换绑所需的「改写已有 credential 的 normalized_email」在仓库里**不存在**：三处
  `UPDATE platform_email_credentials` 只改密码/算法
  （`platform-account-repository.ts:1037/1212/1303`），两处 INSERT 都是新建账号
  （`:797/:902`）。
- 最完整的「消费码 + 写凭据」模板是 `createVerifiedEmailAccount`
  （`platform-account-repository.ts:821-968`）：一个 `serializeWrite` 内的五步 batch，
  用 `consumed_token` 互相栅栏，最后 DELETE 码；`database.batch` 是单事务
  （`infra/db/postgresql/connection.ts:303-319`）。
- 当前密码二次校验的现成实现是 `matchesCurrentPlatformPassword`
  （`platform-account-security/password/current-password.ts:16`）；
  `updatePasswordForAccount` 用 `expectedPasswordHash + expectedUpdatedAt` 做乐观栅栏
  （`platform-account-repository.ts:1176` 起）。

### 验证码与投递

- 表 `platform_email_verification_codes` 由注册与「消费码」共用，主键是 email
  （`0025_platform_email_verification.sql:3-19`、`0026_*.sql:3-31`）。
- hash 域：注册 `'platform-email-registration\0'`
  （`platform-auth/registration/email-verification.ts:9-18`），找回
  `'platform-password-reset\0'`（`platform-auth/password-reset/password-reset.ts:9-17`）。
- `platform_email_delivery_jobs.purpose` 的 CHECK 只有
  `('registration','password_reset')`（`20260913120000_*.sql:61-63`），
  冷却表 CHECK 相同（`20260913130000_*.sql:13-14`）。
- 投递队列 `enqueueRegistration` 只接受 `purpose='registration'`、不校验邮箱占用
  （`infra/db/repositories/platform-email-delivery-repository.ts:148-158`），
  `tableFor('registration')` 落到验证码表（`:77-80`）。
- `platform_security_events.event_type` 只有正则 CHECK
  `^[a-z][a-z0-9._-]*$`（`0020_platform_accounts.sql:152-176`），无枚举，新增事件类型
  不需要迁移。管理端 `logs` 表与本流程无关。

### 中间件与路由所有权

- 账号安全所有写操作挂在 `platformApiPath('/me')`
  （`platform-account-security/routes.ts:22-24`），链为
  `platformAuth + activePlatformMutation + platformCsrf + 限流`
  （`password/routes.ts:31-41`）。`platformCsrf` 对 `GET/HEAD/OPTIONS` 直接放行
  （`middleware/hono-auth.ts:252-258`）。
- 现有 OAuth 区块只读「已绑定」列表
  （`web/app/pages/account/security/oauth-link-section.tsx:51-67`），
  从不调用 `getPlatformOAuthProviders()`
  （`web/app/lib/api/endpoints/platform/index.ts:140`），因此无法渲染未绑定行。
- 域名索引已经把 `platform-account-security` 的 capability 列为
  `password email oauth-links sessions deletion`
  （`apps/api/src/domains/README.md`），所以新增 `email` capability 是既定结构。

---

## 2. 方案选择与取舍

### 2.1 OAuth 回调：复用匿名 callback，按 `intent` 分流 `[决策]`

**选定**：不新增回调路由。`consumeOAuthState` 去掉 `intent='login'` 过滤，返回整行；
`handlePlatformOAuthCallback` 读到 `intent==='link'` 时走绑定分支，否则走原登录分支。

**否掉的方案 A：新增第二条 callback 路由。** `platform_oauth_providers.redirect_uri` 是
单列（`20260818010000_*.sql:10-11`），第二条路由要求 provider 再登记一个 redirect URI，
而列结构装不下第二个值；这要改表并让运维为每个 provider 重配。更重要的是
`09-18-oauth-login-mobile-adaptation` 已把 app 深链回流设计在「provider 只见我们现有
HTTPS 回调」之上，新增回调会直接冲掉那个前提。

**否掉的方案 B：保留 `intent` 过滤，callback 先试 login 再试 link。** 两次 DELETE 中第一
条对 link 行不匹配但不删，第二条才匹配；这是读-判断-写，行可能在两次之间被消费，且行为
依赖执行顺序。状态行唯一且不可猜，去掉过滤后由回调单点分派更直白。

**补偿控制**：回调是唯一消费者，按返回的 intent 分流；表 CHECK 保证 link 行必带
`linking_account_id`；绑定分支要求 `intent==='link' && linking_account_id`，登录行落到
绑定分支会直接被拒。登录分支保持逐行不变。

**start 放哪**：绑定 start 需要会话，放
`platform-account-security/oauth-links/handlers/start-oauth-link.ts`，路由
`GET /me/oauth-links/:provider/start`。PKCE 纯函数上移到
`platform-auth/contracts/oauth-pkce.ts`（capability 间只能通过命名 `contracts/` 协作，
见 `apps/api/src/domains/README.md` 的编写规则），`oauth-login.ts` 改为从该模块导入。

`[决策]` start 不接受客户端 `returnPath`，state 的 `return_path` 固定写
`/account/security`，回调回流到该 SPA 路由。这样绑定链路没有 open redirect 面，也不需要
新的 query schema。

### 2.2 OAuth 身份写入：新增 `createOAuthIdentityForAccount` `[决策]`

`createOAuthAccount` 会建账号，不可复用；仓库没有只插身份的原语。新原语在
`serializeWrite` 内先读后写，并靠两条唯一约束兜住竞态：

- 已存在 `(provider, subject)`：`account_id === 当前账号` → `already-linked`（幂等）；
  否则 `identity-conflict`，**不写任何行**。
- 不存在：batch `[INSERT identity ... WHERE EXISTS(active account), INSERT security_event
  ... WHERE EXISTS(identity)]`。
- 捕获 `pkey` 冲突 → 重读判 `already-linked` / `identity-conflict`；捕获
  `account_id_provider_code_key` 冲突 → `provider-conflict`（本账号已绑该 provider 的另一个
  身份，需先解绑）。

三类结果都由处理器映射成可区分 reason，不做账号合并，不搬运数据。

### 2.3 邮箱迁移：新增仓储原语，不用裸 UPDATE `[决策]`

**否掉的方案 A：handler 里直接发一条 UPDATE。** 裸 `UPDATE ... SET normalized_email=?`
必须自带三个前置条件——验证码已校验、凭据自读以来没变、目标邮箱空闲——否则就是
读-判断-写，违反 ER8/AC6，并可能消费掉验证码而没落库。用 WHERE EXISTS 表达前置条件是
仓库的活，不是 handler 的活。

**否掉的方案 B：DELETE 旧行 + INSERT 新行。** 会丢 `created_at`，且在 DELETE 与 INSERT
之间撞 `account_id` 唯一约束；行本来就存在，UPDATE 天然保留全部密码列，是 ER4「保留
password hash」的最直接表达。

**选定**：两个原语，都放在 `serializeWrite` + `database.batch`：

- `createVerifiedEmailCredentialForAccount`（补绑）：消费码 UPDATE → INSERT credential
  `WHERE EXISTS(code consumed) AND EXISTS(active account)` → 写安全事件 → DELETE 码。
- `migrateEmailCredentialForAccount`（换绑）：消费码 UPDATE（键为新邮箱）→
  `UPDATE platform_email_credentials SET normalized_email=?, updated_at=?
   WHERE account_id=? AND normalized_email=? AND password_hash=? AND updated_at=?
     AND EXISTS(code consumed on new email)`（**只动这两列**，保留 hash/算法/salt/created_at）
  → 写安全事件 → DELETE 码。

`isEmailConflict` 保持在 `_pkey` 上映射 `email-conflict`（ER7）；新增
`isEmailAccountConflict` 匹配 `platform_email_credentials_account_id_key`，补绑时映射
`already-bound`，避免把「本账号已有凭据」误报成「目标邮箱被占用」。

### 2.4 验证码 hash 域：新增 `platform-email-binding\0` `[决策]`

注册码与绑定码共用 `platform_email_verification_codes`（主键是 email），存储层无法区分
用途。若沿用注册域，`hash(email, code)` 对同一对值会产生同一个 `code_hash`，注册端点的
`createVerifiedEmailAccount`（`platform-account-repository.ts:823-837`，只比 `code_hash=?`）
就能消费绑定码，反之亦然，直接违反 ER9/AC7。域前缀把 `(email, code) → hash` 的映射按用途
分隔，使两个码空间在共享存储上互不相交。这与找回流程的
`'platform-password-reset\0'`（`password-reset.ts:11-17`）是同一手法。

### 2.5 验证码投递：复用 `registration` purpose `[决策，需产品确认]`

**选定**：绑定验证码走既有 `enqueueRegistration`，`purpose='registration'`，
`codeHash` 用新 hash 域计算。理由：投递通道、限流、`delivery_token` 协议、worker、表结构
全部复用；哈希域已经独立（2.4），跨用途复用被阻断；`tableFor` 对 registration 正好指向
验证码表。

**代价**：邮件主题固定为 "IMSWeb registration verification code"
（`infra/email/smtp/platform-email-service.ts:472-478`），与「已登录用户换绑邮箱」的语义
不符；并共享同一个 per-email 冷却桶。

**否掉的方案：新增 `email_binding` purpose。** 需要改两条 migration 的 purpose CHECK、
`PlatformEmailDeliveryPurpose`/`PlatformEmailJobPayload` 联合、payload cipher 的
authenticatedData 白名单与 `validatePayload`、`tableFor/expiryFor/verificationSelect`、
SMTP 文案、队列 port。回滚还要先删掉 `email_binding` 行才能恢复旧 CHECK。PRD 已把
「邮箱验证码的发信通道改造」列为 Out of Scope，故先不做。**此点需要产品确认**：若不能
接受错误主题，再单开一个 follow-up 加 `email_binding` purpose + migration。

---

## 3. 边界与契约

新增 schema 全部落在 `packages/contracts/src/platform/account-security.ts`。
`account-security.ts` 已经是一个已导出模块（`package.json` 的 `./platform/account-security`、
`src/index.ts` 的 `platformAccountSecurity`、`entrypoints.json` 均已有条目），
**本次不新增模块，因此 `package.json`/`src/index.ts`/`entrypoints.json` 三处同步点都不动**
`[修正]`：AC8 说的「落在 account-security.ts」成立，但不涉及 exports 同步。

请求 schema 一律 `.strict()`；响应 schema 用 `successEnvelope(...).strict()`，不
coerce/transform/default。新错误码不需要 schema（`platformAuthErrorSchema` 是
`{success:false, code: string}`，见 `platform/index.ts:175-177`），但需要 Web 的
status+code 谓词。

| 名称 | 方向 | 形状 |
| --- | --- | --- |
| `platformOAuthLinkStartQuerySchema` | 请求 query | `{}`（空对象，`.strict()`） |
| `platformEmailVerificationCodeRequestSchema` | 请求 body | `{ email: platformRegistrationEmailSchema }` |
| `platformEmailVerificationCodeResponseSchema` | 响应 | `successEnvelope({ queued: literal(true), retryAfterSeconds: int 1..600 })` |
| `platformEmailCredentialResponseSchema` | 响应 | `successEnvelope({ email: z.string().min(3).max(320).nullable() })`（`GET /me/email`） |
| `platformEmailBindRequestSchema` | 请求 body | `{ email, code: /^\d{6}$/, newPassword: platformPasswordSchema }` |
| `platformEmailChangeRequestSchema` | 请求 body | `{ email, code, currentPassword: platformLoginPasswordSchema }` |
| `platformEmailBindingResponseSchema` | 响应 | `successEnvelope({ email: z.string().min(3).max(320) })`（精确、不 transform） |

OAuth 绑定的 start/callback 都是 303 重定向，是 API-local 的 redirect success boundary，
不产生 JSON 成功体；其 JSON 错误体（401/403/429）已在
`platformHttpErrorSchema`/`platformAccountSecurityErrorSchema` 覆盖，**不新增 OAuth JSON
schema**。回调结果用查询参数 `?oauth=<reason>` 表达（API-local 重定向元数据，沿用登录回调
的既有约定），reason 集合在 §6 列全。

`platformOAuthLinkParamsSchema`（`account-security.ts:43-45`）已能校验绑定 start 的
provider 路径参数，直接复用。start 路由不需要 `returnPath`，query schema 取空严格对象。

---

## 4. 数据与迁移

**不需要 migration。** 逐条依据：

- OAuth 绑定复用 `platform_oauth_states.intent/linking_account_id`
  （`0020:70-99`），列与 CHECK 均已存在。
- 邮箱绑定复用 `platform_email_verification_codes`（`0025`/`0026`）与
  `platform_email_credentials`（`0020:128-150`），不改列。
- 安全事件类型只受正则 CHECK 约束（`0020:152-176`），新增
  `auth.oauth.linked`/`auth.email.bound`/`auth.email.changed` 只改 TS 联合
  （`ports/repositories/platform.ts:272-282`）。
- 不新增 `email_binding` purpose，因此不动两条 purpose CHECK。
- 需要的索引（`platform_email_credentials_account_idx`、
  `platform_email_verification_codes` 的 email 索引、oauth identities 的唯一约束）都已存在。

因此没有 SQL、没有文件命名、没有回滚形态需要设计；回滚等于代码回退（见 §9）。若后续产品
要求独立邮件用途，再补一条新编号 migration（放在
`apps/api/migrations/postgresql/` 下，形如 `20260920HHMMSS_platform_email_binding_purpose.sql`，
`DROP CONSTRAINT ... / ADD CONSTRAINT ...`，回滚需先清空 `email_binding` 行）。

---

## 5. 关键不变量与并发安全

`deleteOAuthIdentity` 的模板是：末位凭据判定拼进 DELETE 自身的 WHERE
（`platform-account-repository.ts:628-646`），使守卫看到的就是被删的行集。绑定侧与邮箱
迁移侧需要同等强度，逐条给出 SQL 做法。

### 5.1 零可用凭据不变量（ER8/AC6）

- **绑定只增不减**：新增 email credential 或 OAuth identity 只会扩大可用凭据集合，不可能
  造成零凭据。与并发解绑交错时：未提交的绑定对 `deleteOAuthIdentity` 的
  `EXISTS(email credential)`/`EXISTS(other enabled oauth)` 不可见，解绑会被拒；已提交的
  绑定则让解绑通过。两边都不依赖读-判断-写。
- **换绑保行**：`UPDATE ... SET normalized_email` 不改变行数，凭据集合不变。
- **补绑**：`INSERT ... SELECT ... WHERE EXISTS(code consumed) AND EXISTS(active account)`；
  `account_id` 唯一约束兜住并发双补绑（第二个走 `isEmailAccountConflict` → `already-bound`）。
- **不 bump token_version、不吊销会话**：ER4/AC4 要求换绑不影响既有会话。

### 5.2 验证码一次性（对 `consumed_token` 栅栏）

两个原语都照抄 `createVerifiedEmailAccount` 的三段栅栏：

1. `UPDATE ... SET consumed_token = CASE WHEN code_hash=? THEN ? ELSE NULL END,
   attempts_remaining = attempts_remaining - CASE WHEN code_hash=? THEN 0 ELSE 1 END
   WHERE normalized_email=? AND consumed_token IS NULL AND delivery_token IS NULL
     AND expires_at>? AND attempts_remaining>0`；
2. 写入语句的 `WHERE EXISTS(... code_hash=? AND consumed_token=? AND expires_at>?)`；
3. `DELETE ... WHERE normalized_email=? AND code_hash=? AND consumed_token=?
   AND EXISTS(credential 已挂到此账号)`。

任一步的 0 变更都让整批事务（`connection.ts:303-319`）回滚或落在
`verification-invalid`；已消费但未落库的码行因第 3 步 EXISTS 失败而保留
`consumed_token`，永不可再用。

### 5.3 换绑的乐观栅栏

`UPDATE ... WHERE account_id=? AND normalized_email=? AND password_hash=? AND updated_at=?`
把「handler 读到的凭据」写进行级条件：并发的改密或另一次换绑会让本次 0 变更，返回
`state-conflict`，不会静默丢更新。这与 `updatePasswordForAccount` 的
`expectedPasswordHash/expectedUpdatedAt` 栅栏同构（`platform-account-repository.ts:1176` 起）。

### 5.4 OAuth 身份归属唯一

`INSERT` 依赖 `pkey(provider_code, provider_subject)` 与 `unique(account_id,
provider_code)`。原语不用「先读再插」决定归属，而是在唯一约束失败后重读并分类；即使两个
并发请求同时通过预读，也只有一个 INSERT 成功。

`serializeWrite` 是单进程串行点，跨进程/多实例的并发由上述唯一约束和 WHERE 栅栏兜底。

---

## 6. 错误与失败模式

### 6.1 邮箱（JSON 错误体，`{success:false, code}`）

| code | HTTP | 触发条件 | 对用户可区分 |
| --- | --- | --- | --- |
| `PLATFORM_EMAIL_CONFLICT` | 409 | 目标邮箱已属其他账号（发码前预检命中，或落库时 `_pkey` 冲突） | 是 |
| `PLATFORM_EMAIL_UNCHANGED` | 400 | 目标邮箱等于当前邮箱 | 是 |
| `PLATFORM_EMAIL_ALREADY_BOUND` | 409 | 调用补绑，但账号已有 email credential（预检或 `account_id` 冲突） | 是 |
| `PLATFORM_EMAIL_NOT_BOUND` | 409 | 调用换绑，但账号没有 email credential | 是 |
| `PLATFORM_EMAIL_VERIFICATION_INVALID` | 400 | 码错/过期/已用/投递未完成 | 是 |
| `PLATFORM_EMAIL_STATE_CONFLICT` | 409 | 换绑乐观栅栏失配（并发改密/换绑） | 是（提示重试） |
| `PLATFORM_EMAIL_VERIFICATION_COOLDOWN` | 429 | 缓存或 DB 冷却命中，带 `Retry-After` 与 `retryAfterSeconds` | 是 |
| `PLATFORM_EMAIL_VERIFICATION_UNAVAILABLE` | 503 | 队列/cipher/policy 不可用 | 是 |
| `PLATFORM_EMAIL_INPUT_INVALID` | 400 | 请求校验失败（新错误体，路由 `errorBody`） | 是 |
| `PLATFORM_PASSWORD_CURRENT_INVALID` | 403 | 换绑当前密码错误（复用既有码，匹配 `change-password` 的 403 语义） | 是 |
| `PLATFORM_ACCOUNT_RESTRICTED` | 403 | `activePlatformMutation` 拒绝（复用） | 是 |
| `PLATFORM_RATE_LIMITED` | 429 | 账号维度限流（复用） | 是 |

### 6.2 OAuth（重定向 `?oauth=<reason>`，非 JSON）

| reason | 触发 |
| --- | --- |
| `link-unavailable` | start 时 provider 未启用/未配置，或拿不到授权 URL |
| `link-invalid` | 回调缺 state/code，或 provider 返回 error |
| `link-expired` | state 不存在/过期，或缺 `code_verifier` |
| `link-failed` | code 换 token 或拉 profile 失败 |
| `link-conflict` | 身份已属其他账号，拒绝绑定 |
| `link-already-bound` | 本账号已绑该 provider 的另一个身份 |
| `linked` | 绑定成功（含幂等重复绑定） |

登录分支保持原有 `unavailable/invalid/denied/expired/failed`。

`[修正]` 绑定失败不可区分到「用户下一步该用哪个 OAuth 登录」以外；`link-conflict` 的文案
明确引导「改用该 OAuth 登录」，不做账号合并。

---

## 7. 安全与权限

- **中间件链**（ER10）：`/me/email/*` 与 `/me/oauth-links/:provider/start` 统一挂
  `platformAuth → activePlatformMutation → platformCsrf → 限流`
  （沿用 `password/routes.ts:31-41` 的顺序与 `oauth-links/routes.ts:27-40` 的删链）。
  `platformCsrf` 对 GET 是 no-op（`hono-auth.ts:252-258`），所以 start 用 GET 仍满足链要求；
  邮箱三个端点都是 POST，CSRF 真正生效。
- **限流**：新增账号维度桶 `platformEmailCredentialRateLimit =
  limiter('platform-security-email-account', 10)`（`middleware/platform-mutation-limit.ts`）；
  OAuth start 复用 `platformOAuthLinkRateLimit`（`:40`，30/h）。
- **回调无法带 CSRF**：绑定回调是 provider 发起的顶层 GET，不可能带 CSRF 头；该链路的
  控制是 PKCE + 不可猜 state + provider 授权。这是 OAuth 的固有边界，不是遗漏；start 的
  state 已绑定发起账号，回调只认 state 行里的 `linking_account_id`。
- **二次校验**：换绑必须过 `matchesCurrentPlatformPassword`（两种算法都接受），仓库再用
  `expectedPasswordHash/expectedUpdatedAt` 栅栏，保证「校验过的那个密码」就是被迁移的
  凭据。补绑要求客户端提交并哈希 `newPassword`（bcrypt，`BCRYPT_PARAMETERS_JSON`，与
  `change-password.ts:22-25` 一致）。
- **枚举防护**：发码预检对「邮箱被其他账号占用」返回 409，但对调用者只能看到自己 session
  的事实；这不泄露任意邮箱的占用状态给未登录者，因为端点需要 `platformAuth`。OAuth 冲突
  只在回调后、以 reason 形式返回，不暴露 subject。
- **不记录敏感值**：安全事件 metadata 只有 `{reason}`，不含邮箱、subject、token
  （沿用 `platformSecurityEvent`，`session.ts:153-169`）。

---

## 8. 可观测性

- 审计写入 `platform_security_events`，新增三种类型（只改
  `ports/repositories/platform.ts:272-282` 联合）：`auth.oauth.linked`、
  `auth.email.bound`、`auth.email.changed`。metadata 统一
  `{"reason":"oauth_linked_by_owner"}` / `"email_bound_by_owner"` /
  `"email_changed_by_owner"`，不带 PII。
- 与 `deleteOAuthIdentity` 一样，事件写入与主写入放同一 batch，靠 `WHERE EXISTS` 栅栏，
  保证事件条数等于实际发生的写入（`platform-account-repository.ts:651-680`）。
- 请求级观测沿用 `request-observability.ts` 的结构化事件与 Hono request id，不新增
  `console.log`。
- **`logs` 表不参与本流程**：它是管理端审计表，没有 result 列
  （`0001_initial_compatibility.sql:30-38`）。用户自助绑定/换绑的结果通过
  `platform_security_events` + HTTP 响应码表达，不需要在 `logs` 里补 result。

---

## 9. 兼容性与回滚

- **对登录/注册流程的影响面**：
  - `createOAuthState` 入参改成判别联合（`intent:'login'` 必须 `linkingAccountId:null`；
    `intent:'link'` 必须非空字符串），生产调用点只有 `oauth-login.ts:86`，补
    `linkingAccountId: null`；测试调用点
    `tests/server/platform-oauth-provider-settings.test.ts:223`、
    `tests/server/platform-oauth-wire-contract-conformance.test.ts:110` 同步。
  - `consumeOAuthState` 去掉 `intent='login'` 谓词。对 login state 行为不变；回调新增
    link 分支。登录分支逐行保留。
  - 注册/找回的 hash 域与投递路径完全不动；绑定只是新增一个 `codeHash` 计算入口。
  - `/me/oauth-links`、`/me/password`、`/me/sessions` 的既有契约不动。
- **无 migration** → 回滚就是代码回退。数据侧：
  - 未消费的 link state 最多 10 分钟自然过期（`DELETE ... WHERE expires_at<=?` 在每次
    start 时顺手清理，`platform-account-repository.ts:499-504`）。
  - 已验证的绑定码最多 10 分钟过期；已落库的 identity / 新邮箱是用户数据，回滚不回退，
    也不影响旧代码读取。
- **新旧版本混跑**：API 先上、Web 后上时，旧 Web 不会调用新端点，新 start 路由闲置；Web
  先上、API 未上时，邮箱区块会收到 404，按 `loadFailed` 降级展示（新增 UI 状态）。
  OAuth 区块新增的 providers 差集在旧 API 下仍能工作（`/providers` 本就存在）。

---

## 10. 风险清单（按严重度）

1. **登录被 state 泛化波及（高）** — 触发：`consumeOAuthState` 不再过滤 intent，回调分派
   写错。缓解：只在回调内按 `consumedState.intent` 分派；link 分支硬性要求
   `intent==='link' && linking_account_id`；回归测试覆盖「link state 不能建会话」「login
   state 不能写 link」。
2. **并发下出现零凭据账号（高）** — 触发：绑定/换绑/解绑用读-判断-写。缓解：所有前置条件
   写进 SQL（§5）；用两条连接做并发解绑×绑定、并发补绑的仓储测试（AC6）。
3. **验证码跨用途复用（高）** — 触发：binding 复用注册 hash 域。缓解：
   `platform-email-binding\0`；测试「注册码不能过绑定校验、绑定码不能过注册校验」（AC7）。
4. **换绑丢密码 hash（高）** — 触发：DELETE+INSERT 或 UPDATE 顺带改密码列。缓解：只
   `SET normalized_email, updated_at`；仓储测试迁移后用迁移前密码验签（AC4）。
5. **OAuth 身份冲突时误写数据（高）** — 触发：不分类唯一冲突就直接插。缓解：先读后写 +
   唯一约束失败重读分类；测试「冲突无写入、不建账号、原 owner 不变」（AC1a）。
6. **邮件主题语义错误（中，待产品确认）** — 触发：复用 `registration` purpose（§2.5）。
   缓解：文案层在 Web 侧说明「邮箱验证码」；若产品否决，走 `email_binding` purpose +
   migration 的 follow-up。
7. **验证码被消费但凭据未落库（中）** — 触发：消费与写入不在同一事务。缓解：单
   `database.batch`；失败时码行保留 `consumed_token`，不可复用。
8. **open redirect（中）** — 触发：绑定 start 接受客户端 `returnPath`。缓解：不提供该入参，
   state `return_path` 固定常量；回调仍走 `new URL(return_path, c.req.url)`，值来自服务端。
9. **回调 CSRF 缺失（低）** — 固有边界，控制为 PKCE + state；start 的 state 与账号绑定。
10. **限流桶串味（低）** — 新增独立账号维度桶；测试断言 bucket 名与 429 行为。
11. **Web/API 版本错配（低）** — 邮箱区块对 404/失败降级展示；OAuth 区块逻辑对旧 API 兼容。
