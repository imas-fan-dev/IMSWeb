# 执行计划：登录用户绑定与换绑 OAuth / 邮箱

依赖顺序：**契约 → 仓储 ports → 仓储 SQL → OAuth 状态/回调 → 邮箱 capability →
Web 端点 → Web UI → 测试与全量校验**。每个阶段结束时都可停在一个可构建的状态。

约定：所有命令从仓库根 `/Users/texas/Workspace/IMSWeb` 执行。API 文件用四空格、分号、
单引号、`@/` 别名；Web/contracts 用本地 `.rules` 与 prettier。不要 `git commit/push/merge`。

---

## 阶段 0：开工前基线

- [ ] 读 `.trellis/spec/api/backend/architecture.md`、`data-and-errors.md`、
  `observability-and-security.md`、`testing.md`、`.trellis/spec/contracts/shared/schemas-and-exports.md`、
  `quality.md`、`.trellis/spec/guides/cross-layer-thinking-guide.md`（`implement.jsonl` 已策展）。
- [ ] 基线验证（确保失败来自本次改动）：
  ```sh
  pnpm run check:rules
  pnpm --filter @imsweb/api run typecheck
  pnpm --filter @imsweb/web run typecheck
  ```
- [ ] 若本地需要跑 PostgreSQL 仓储测试：`pnpm run dev:doctor`，按
  `docs/development/ai-environment.md` 启动 `pnpm dev` 或仅 `pnpm run dev:postgresql:up`。

产出物：干净基线结论。**回滚点 0**：不改任何文件即可退出。

---

## 阶段 1：契约（`packages/contracts`）

依赖：无。全部加到既有模块，**不改** `package.json` / `src/index.ts` / `entrypoints.json`。

- [ ] `packages/contracts/src/platform/account-security.ts`
  - 新增 `platformOAuthLinkStartQuerySchema = z.object({}).strict()`。
  - 新增 `platformEmailVerificationCodeRequestSchema`
    （`{ email: platformRegistrationEmailSchema }`，`.strict()`）。
  - 新增 `platformEmailVerificationCodeResponseSchema`
    （`successEnvelope({ queued: z.literal(true), retryAfterSeconds: z.number().int().min(1).max(600) }).strict()`）。
  - 新增 `platformEmailBindRequestSchema`
    （`{ email, code: z.string().regex(/^\d{6}$/), newPassword: platformPasswordSchema }`，`.strict()`）。
  - 新增 `platformEmailChangeRequestSchema`
    （`{ email, code, currentPassword: platformLoginPasswordSchema }`，`.strict()`）。
  - 新增 `platformEmailBindingResponseSchema`
    （`successEnvelope({ email: z.string().min(3).max(320) }).strict()`，不 transform）。
  - 派生并导出对应 `z.infer` 类型；复用 `./index.js` 已有的 email/password/provider 原子。
- [ ] `pnpm --filter @imsweb/contracts run build` 通过。
- [ ] 目视复核：新增响应 schema 无 `.transform/.default/.catch/.strip/.passthrough`。
- [ ] `pnpm run check:rules`（wire 清单只读产出，不应因新增 schema 报错）。

产出物：5 个 schema + 类型。

**评审闸门 A**：契约命名、strict/exact 策略、是否真的不需要新 export 子路径。

**回滚点 1**：`git checkout -- packages/contracts/src/platform/account-security.ts`。

---

## 阶段 2：仓储端口（`apps/api/src/ports/repositories/platform.ts`）

依赖：阶段 1 的类型名（Handler 会用到，但 port 本身不依赖契约）。

- [ ] 把 `NewPlatformOAuthStateInput`（`:160-168`）改为判别联合：
  `intent:'login'` 时 `linkingAccountId: null`；`intent:'link'` 时 `linkingAccountId: string`。
- [ ] 新增 `CreatePlatformOAuthIdentityInput` 与结果联合
  `CreatePlatformOAuthIdentityResult`：
  `created | already-linked | identity-conflict | provider-conflict | unavailable`（各带
  `identity: PlatformOAuthIdentity`，`unavailable` 除外）。
- [ ] 新增邮箱原语类型：
  - `CreateVerifiedPlatformEmailCredentialInput`
    （accountId + credential 列 + `verification{codeHash,consumedToken,verifiedAt}` + event）
    与结果 `created(credential) | already-bound | email-conflict | verification-invalid | unavailable`。
  - `MigratePlatformEmailCredentialInput`
    （accountId + `expectedNormalizedEmail/expectedPasswordHash/expectedUpdatedAt` + 新
    `normalizedEmail/updatedAt` + verification + event）与结果
    `migrated(credential) | email-conflict | state-conflict | verification-invalid`。
- [ ] 在 `PlatformSecurityEventType`（`:272-282`）追加
  `auth.oauth.linked`、`auth.email.bound`、`auth.email.changed`。
- [ ] 在 `PlatformAccountRepository` 接口（`:314` 附近）声明四个新方法：
  `createOAuthIdentityForAccount`、`createVerifiedEmailCredentialForAccount`、
  `migrateEmailCredentialForAccount`；`consumeOAuthState` 签名不变（实现里放宽 intent）。
- [ ] `pnpm --filter @imsweb/api run check:architecture`。

产出物：port 类型与接口。**回滚点 2**：还原该文件。

---

## 阶段 3：仓储实现（`apps/api/src/infra/db/repositories/platform-account-repository.ts`）

依赖：阶段 2。逐条给出 SQL 要点；全部用 `serializeWrite` + `database.batch`。

- [ ] `isEmailConflict`（`:169-183`）保持只匹配 `platform_email_credentials_pkey`。
- [ ] 新增 `isEmailAccountConflict`，匹配 PG `23505 + platform_email_credentials_account_id_key`
  与 SQLite `UNIQUE constraint failed: platform_email_credentials.account_id`。
- [ ] 改 `createOAuthState`（`:498-521`）：INSERT 第三、四列改为
  `intent, linking_account_id`，值取 `input.intent, input.linkingAccountId`（其余不变，
  含删过期行的第一条语句）。
- [ ] 改 `consumeOAuthState`（`:524-539`）：DELETE 去掉 `AND intent='login'`，保留
  `state_hash=? AND provider_code=? AND expires_at>?`，RETURNING 不变。
- [ ] 新增 `createOAuthIdentityForAccount(input)`：
  1. 预读 `findOAuthIdentity(provider, subject)`：命中且 `account_id===input.accountId`
     → `already-linked`；命中且不同账号 → `identity-conflict`；未命中继续。
  2. batch：
     - `INSERT INTO platform_oauth_identities (provider_code, provider_subject, account_id,
        provider_display_name, provider_avatar_url, created_at, updated_at)
        SELECT ?,?,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM platform_accounts
        WHERE id=? AND status='active' AND deleted_at IS NULL)`
     - `INSERT INTO platform_security_events (...) SELECT ... WHERE EXISTS
        (SELECT 1 FROM platform_oauth_identities WHERE provider_code=? AND provider_subject=?
        AND account_id=?)`
  3. `results[0].meta.changes===1` → 重读返回 `created`；0 变更 → `unavailable`。
  4. catch `isOAuthIdentityConflict`：重读 `(provider,subject)`，同账号 → `already-linked`，
     他账号 → `identity-conflict`；若重读为空再按 `(account_id,provider)` 读 → `provider-conflict`。
- [ ] 新增 `createVerifiedEmailCredentialForAccount(input)`：五步压缩为四步 batch
  1. 消费码 UPDATE（照抄 `createVerifiedEmailAccount` `:823-837` 的 SQL 与参数顺序）。
  2. `INSERT INTO platform_email_credentials (normalized_email, account_id, algorithm,
     parameters_json, salt, password_hash, created_at, updated_at)
     SELECT ?,?,?,?,NULL,?,?,? WHERE EXISTS (verification code_hash/consumed_token/expires)
       AND EXISTS (SELECT 1 FROM platform_accounts WHERE id=? AND status='active'
                   AND deleted_at IS NULL)`。
  3. `INSERT INTO platform_security_events ... SELECT ... WHERE EXISTS(verification consumed)
     AND EXISTS(credential account+email)`。
  4. `DELETE FROM platform_email_verification_codes WHERE normalized_email=? AND code_hash=?
     AND consumed_token=? AND EXISTS(credential)`。
  判定：`results[1].meta.changes===1 && results[3].meta.changes===1` → 返回
  `created`（重读 `findEmailCredentialByAccountId`）；否则若
  `results[0].results[0]?.consumed_token !== input.verification.consumedToken` →
  `verification-invalid`，否则 `unavailable`。catch `isEmailConflict` → `email-conflict`；
  catch `isEmailAccountConflict` → `already-bound`。
- [ ] 新增 `migrateEmailCredentialForAccount(input)`：
  1. 消费码 UPDATE（键为**新** `normalizedEmail`）。
  2. `UPDATE platform_email_credentials SET normalized_email=?, updated_at=?
     WHERE account_id=? AND normalized_email=? AND password_hash=? AND updated_at=?
       AND EXISTS (verification code_hash/consumed_token/expires_at on new email)`。
     **只 SET 这两列**，其它列原样保留。
  3. `INSERT INTO platform_security_events ... WHERE EXISTS(credential account+new email)`。
  4. `DELETE FROM platform_email_verification_codes ... AND EXISTS(credential)`。
  判定：`results[1].meta.changes===1 && results[3].meta.changes===1` → `migrated`（重读）；
  否则若 `consumed_token` 不符 → `verification-invalid`，否则 `state-conflict`。
  catch `isEmailConflict` → `email-conflict`。
- [ ] `pnpm --filter @imsweb/api run typecheck` 与 `check:architecture`。
- [ ] 新增/扩展仓储测试 `apps/api/tests/server/platform-oauth-unlink-repository.test.ts`
  或新文件 `platform-email-binding-repository.test.ts`，覆盖：
  - 幂等重绑同账号 → `already-linked`，无新行；
  - 身份属他账号 → `identity-conflict`，identity 行数不变、无 account/profile 新增；
  - 本账号已绑同 provider 另一身份 → `provider-conflict`；
  - 补绑成功后再补绑 → `already-bound`；
  - 换绑成功后密码列不变（用迁移前 password_hash 断言）；
  - 换绑栅栏（先改密或先换绑）→ `state-conflict`；
  - 目标邮箱被他账号占用 → `email-conflict`，无部分写入；
  - 两条连接并发：`createVerifiedEmailCredentialForAccount` × 2 只有一个成功。
- [ ] `pnpm --filter @imsweb/api run test:server`（需要 PostgreSQL；纯逻辑文件在
  `IMS_TEST_POSTGRES_ENABLED=false` 下仍需通过）。

**评审闸门 B（必须人工过目）**：所有新 SQL 的栅栏、冲突映射、事务边界；`migrate` 的
SET 列表是否只含 `normalized_email/updated_at`。

**回滚点 3**：还原 repository 文件；端口类型可保留（未实现会 typecheck 失败，需一起回滚）。

---

## 阶段 4：OAuth 状态与回调（`platform-auth`）

依赖：阶段 2/3。

- [ ] 新建 `apps/api/src/domains/identity/platform-auth/contracts/oauth-pkce.ts`：
  从 `oauth-login.ts:36-50` 原样搬 `createPkcePair()` 与 `hashValue()`（重命名导出
  `hashOAuthStateValue`），纯函数、只依赖 `node:crypto`。
- [ ] 改 `apps/api/src/domains/identity/platform-auth/oauth/handlers/oauth-login.ts`：
  - 删除本地 `createPkcePair`/`hashValue`，改从 `contracts/oauth-pkce.ts` 导入；
  - `createOAuthState` 调用补 `linkingAccountId: null`；
  - `handlePlatformOAuthCallback` 消费 state 后按 `consumedState.intent` 分流：`link` 走新
    私有函数 `completeOAuthLink(c, provider, consumedState)`，`login` 走原逻辑（逐行不动）；
  - `completeOAuthLink`：要求 `consumedState.linking_account_id` 非空，调用
    `exchangeAuthorizationCode`，`findOAuthIdentity`，再
    `createOAuthIdentityForAccount({ accountId: linking_account_id, ... event:
    platformSecurityEvent(c, accountId, 'auth.oauth.linked', 'oauth_linked_by_owner') })`；
    按结果重定向 `return_path?oauth=linked|link-conflict|link-already-bound|link-failed|
    link-invalid|link-expired`。**不调用 `establishPlatformSession`，不创建账号。**
  - 注意 `platformSecurityEvent` 需要一个已登录 context；回调里手工构造 `PlatformSecurityEventInput`
    或用 `platformSecurityEvent(c, accountId, ...)`（`c` 已有 request 头信息，accountId 来自 state）。
- [ ] 更新测试调用点：`tests/server/platform-oauth-provider-settings.test.ts:223` 补
  `linkingAccountId: null`；`tests/server/platform-oauth-wire-contract-conformance.test.ts:110`
  的 fake `createOAuthState` 记录 `input`（无需改，但断言可加强）。
- [ ] `pnpm --filter @imsweb/api run test:server`。

**评审闸门 C**：登录回调分支必须与改动前逐行一致；`git diff` 只应看到 helper 提取与新增
分支，不应有登录逻辑重排。

**回滚点 4**：还原 `oauth-login.ts` 与新建 contracts 文件。

---

## 阶段 5：OAuth 绑定 start 路由（`platform-account-security`）

依赖：阶段 1（query schema）、阶段 2/3、阶段 4（PKCE helpers）。

- [ ] 新建 `apps/api/src/domains/identity/platform-account-security/oauth-links/handlers/start-oauth-link.ts`：
  - 入参 `{ provider }`（已由 `paramSchemaValidator(platformOAuthLinkParamsSchema)` 校验）；
  - 常量 `OAUTH_LINK_RETURN_PATH = '/account/security'`；
  - `services(c).platformOAuth?.listProviders()` 找 provider；缺失或 `createAuthorizationUrl`
    返回空 → 303 到 `${OAUTH_LINK_RETURN_PATH}?oauth=link-unavailable`；
  - `createPkcePair()` → `createOAuthState({ intent:'link', linkingAccountId: claims.id,
    returnPath: OAUTH_LINK_RETURN_PATH, ... })` → 303 到授权 URL；`Cache-Control: no-store`。
- [ ] 改 `apps/api/src/domains/identity/platform-account-security/oauth-links/routes.ts`：
  新增
  `routes.get('/oauth-links/:provider/start', platformAuth, activePlatformMutation,
   platformCsrf, platformOAuthLinkRateLimit, paramSchemaValidator(platformOAuthLinkParamsSchema),
   querySchemaValidator(platformOAuthLinkStartQuerySchema), handleStartPlatformOAuthLink)`。
  GET + CSRF 是 no-op，符合 ER10 链条。
- [ ] 在 `scripts/contracts/non-json-boundaries.manifest.json` 增加一条
  `responseKind:"redirect"` 记录：`sourceFile` 指新 handler 文件、`symbol:
  handleStartPlatformOAuthLink`、`jsonErrorSchema` 指
  `packages/contracts/src/platform/account-security.ts#platformAccountSecurityErrorSchema`、
  `test` 指将要新增的契约测试文件与 symbol。
- [ ] `node scripts/contracts/compile-route-inventory.mjs --write` 重生成路由清单。
- [ ] `pnpm run check:rules`（manifest liveness + inventory freshness）。

**回滚点 5**：还原 routes/manifest，删除新 handler。

---

## 阶段 6：邮箱 capability（`platform-account-security/email`）

依赖：阶段 1、阶段 3。

- [ ] 新建 `apps/api/src/domains/identity/platform-account-security/email/email-binding-code.ts`：
  `createEmailBindingCode()`（`crypto.randomInt(0,1_000_000)` 补零 6 位）与
  `hashPlatformEmailBindingCode(normalizedEmail, code)`，HMAC-SHA256 + `PLATFORM_JWT_SECRET`，
  域前缀 `'platform-email-binding\0'`（结构照抄 `email-verification.ts:9-18`）。
- [ ] 新建 `.../email/request.ts`（如需要）：把契约解析结果映射成领域输入；或在 handler
  直接使用 `c.req.valid('json')`。不要重复解析。
- [ ] 新建 `.../email/handlers/send-email-binding-code.ts`：结构照抄
  `registration/handlers/send-verification-code.ts:26-127`，改动：
  - `claims = c.get('platformUser')!`；
  - 预检 `findEmailIdentity(input.email)`：存在且 `account_id===claims.id` → 400
    `PLATFORM_EMAIL_UNCHANGED`；存在且不同账号 → 409 `PLATFORM_EMAIL_CONFLICT`；
  - 缓存冷却 → 429 `PLATFORM_EMAIL_VERIFICATION_COOLDOWN` + `Retry-After`；
  - `enqueueRegistration({ ...prepared, codeHash: hashPlatformEmailBindingCode(...) })`
    （identity/payload 的 purpose 都是 `'registration'`，见 design §2.5）；
  - 成功 202 `{success:true, queued:true, retryAfterSeconds}`；
  - 队列/cipher/policy 缺失或抛错 → 503 `PLATFORM_EMAIL_VERIFICATION_UNAVAILABLE`。
- [ ] 新建 `.../email/handlers/bind-email-credential.ts`（补绑）：
  - `findEmailCredentialByAccountId(claims.id)` 已存在 → 409 `PLATFORM_EMAIL_ALREADY_BOUND`；
  - `passwords.hash(newPassword)` + `parametersJson = BCRYPT_PARAMETERS_JSON`；
  - 调 `createVerifiedEmailCredentialForAccount`；map `created`→200
    `{success:true, email}`、`email-conflict`→409 `PLATFORM_EMAIL_CONFLICT`、
    `already-bound`→409 `PLATFORM_EMAIL_ALREADY_BOUND`、
    `verification-invalid`→400 `PLATFORM_EMAIL_VERIFICATION_INVALID`、
    `unavailable`→403 `PLATFORM_ACCOUNT_RESTRICTED`。
- [ ] 新建 `.../email/handlers/change-email-credential.ts`（换绑）：
  - `findEmailCredentialByAccountId` 为空 → 409 `PLATFORM_EMAIL_NOT_BOUND`；
  - 新邮箱等于 `credential.normalized_email` → 400 `PLATFORM_EMAIL_UNCHANGED`；
  - `matchesCurrentPlatformPassword` 失败 → 403 `PLATFORM_PASSWORD_CURRENT_INVALID`；
  - 调 `migrateEmailCredentialForAccount({ expectedNormalizedEmail:
    credential.normalized_email, expectedPasswordHash: credential.password_hash,
    expectedUpdatedAt: credential.updated_at, ... })`；map `migrated`→200、
    `email-conflict`→409 `PLATFORM_EMAIL_CONFLICT`、`state-conflict`→409
    `PLATFORM_EMAIL_STATE_CONFLICT`、`verification-invalid`→400。
- [ ] 新建 `.../email/routes.ts`：
  `GET /email`（`platformAuth`，返回当前邮箱或 null，供 Web 区块判补绑/换绑）；
  `POST /email/verification-code`；`POST /email/bind`；`POST /email/change`。三个 POST 链：
  `platformAuth → activePlatformMutation → platformCsrf → platformEmailCredentialRateLimit →
   requirePlatformJson → jsonSchemaValidator(<对应 schema>, { errorBody: emailValidationErrorBody })`。
  `emailValidationErrorBody()` → `{success:false, code:'PLATFORM_EMAIL_INPUT_INVALID'}`。
  为 `GET /email` 加契约 `platformEmailCredentialResponseSchema`
  （`successEnvelope({ email: z.string().min(3).max(320).nullable() }).strict()`）到阶段 1 文件。
- [ ] 在 `apps/api/src/middleware/platform-mutation-limit.ts` 新增
  `platformEmailCredentialRateLimit = limiter('platform-security-email-account', 10)`。
- [ ] 改 `.../platform-account-security/routes.ts` 注册
  `app.route(platformApiPath('/me'), platformEmailRoutes())`。
- [ ] `pnpm --filter @imsweb/api run typecheck`、`check:architecture`、`test:server`。

**评审闸门 D（必须人工过目）**：hash 域字符串、发码预检的错误码、换绑的乐观栅栏参数
来源、补绑/换绑的密码哈希参数与 `change-password` 一致。

**回滚点 6**：删除 `email/` 目录与 routes/middleware 增量。

---

## 阶段 7：Web API 端点（`apps/web/app/lib/api`）

依赖：阶段 1、阶段 6（路径）。

- [ ] `apps/web/app/lib/api/endpoints/platform/index.ts`：
  - 从 `@imsweb/contracts/platform/account-security` 导入新 schema，并在文件顶部
    `export { ... } from ...` 与 `export type *` 区块补上（文件已有两处 account-security
    re-export，`index.ts:63-73`）。
  - `getPlatformEmailCredential()` → `GET platformApiPath('/me/email')`，
    `withPlatformAuth()`，`parsed(platformEmailCredentialResponseSchema, {
    errorSchema: platformAccountSecurityErrorSchema })`。
  - `sendPlatformEmailVerificationCode(input)` → `POST /me/email/verification-code`，
    `platformEmailVerificationCodeRequestSchema.parse(input)`，`withPlatformCsrf()`。
  - `bindPlatformEmail(input)` → `POST /me/email/bind`，`platformEmailBindRequestSchema.parse`。
  - `changePlatformEmail(input)` → `POST /me/email/change`，`platformEmailChangeRequestSchema.parse`。
  - `platformOAuthLinkStartUrl(provider)` → `platformApiPath(
    \`/me/oauth-links/${encodeURIComponent(platformOAuthLinkParamsSchema.shape.provider.parse(provider))}/start\`)`。
- [ ] `apps/web/tests/unit/lib/api/endpoints/platform-account-security.test.ts`：新增
  「发码带 CSRF header」「bind/change 用正确路径与 body」「GET /me/email 无 CSRF」
  「start URL 正确编码 provider」「`parsed` 拒绝缺字段响应」。
- [ ] `pnpm --filter @imsweb/web run typecheck`、`test:unit`。

**回滚点 7**：还原端点文件与其测试。

---

## 阶段 8：Web UI 与 i18n

依赖：阶段 7。

- [ ] `apps/web/app/pages/account/security/account-security-model.ts`：新增谓词
  `isEmailConflict`(409 `PLATFORM_EMAIL_CONFLICT`)、`isEmailUnchanged`(400)、
  `isEmailAlreadyBound`(409)、`isEmailNotBound`(409)、`isEmailVerificationInvalid`(400)、
  `isEmailStateConflict`(409)、`isEmailInputInvalid`(400)、`isEmailUnavailable`(503)；
  `isRateLimited`、`isCurrentPasswordInvalid` 已有，直接复用。
- [ ] `apps/web/app/pages/account/security/oauth-link-section.tsx`：
  - 并行拉 `getPlatformOAuthLinks()` 与 `getPlatformOAuthProviders()`
    （`~/lib/api` 已导出后者）。
  - `linked = new Set(links.map(l => l.provider))`，
    `unlinked = providers.filter(p => !linked.has(p.code))`。
  - 已绑定行保持现有渲染与解绑按钮；新增未绑定行：provider 名 + 「绑定」按钮，
    `render={<a href={platformOAuthLinkStartUrl(provider.code)} />}`（全页导航到 API，
    与登录页 provider 按钮一致，见 `account-auth-form.tsx:892-894`）。
  - `readOnly` 时绑定按钮同样禁用。
  - 读取 `useSearchParams().get("oauth")` 映射成功/失败反馈，并把参数从 URL 清掉
    （`setSearchParams({}, { replace: true })`）。
  - 空状态仅在 `links.length===0 && providers.length===0` 时显示。
- [ ] 新建 `apps/web/app/pages/account/security/email-credential-section.tsx`：
  props `{ readOnly, passwordEnabled, onEmailChanged }`；
  `passwordEnabled === null` → skeleton；`false` → 补绑表单（email + code + newPassword +
  发码按钮）；`true` → 换绑表单（email + code + currentPassword + 发码按钮）。
  错误按阶段 8 谓词映射；成功后 `onEmailChanged(email)`。
- [ ] `apps/web/app/pages/account/security/account-security-page.tsx`：
  - `handleLoginMethodsLoaded` 保持；新增 `passwordEnabled` 的写入口供补绑成功后置 true；
  - 在 `PasswordSection` 与 `SessionDeviceSection` 之间（或紧邻 PasswordSection）插入
    `<EmailCredentialSection readOnly={readOnly} passwordEnabled={passwordEnabled}
    onEmailChanged={() => setPasswordEnabled(true)} />`；
  - OAuth 区块保持在最后。
- [ ] `apps/web/app/i18n/resources.ts`：在 `platformAccount.security.oauth`（zh `:292` /
  en `:710`）新增 `link/linking/linkLabel/linked/linkFailed/linkUnavailable/linkExpired/
  linkConflict/linkAlreadyBound/availableHint`；新增
  `platformAccount.security.email.*`（title/description/emailLabel/codeLabel/sendCode/
  sendingCode/codeSent/newPasswordLabel/currentPasswordLabel/submitBind/submitChange/
  submitting/success 与全部错误键）。**zh 与 en 都要有，键名逐字对应。**
- [ ] `apps/web/tests/unit/pages/account/account-security-page.test.tsx`：新增
  「未绑定 provider 渲染绑定入口且受 readOnly 约束」「`?oauth=link-conflict` 显示可读错误」
  「OAuth-only 账号显示补绑表单」「已有邮箱显示换绑表单」「换绑当前密码错误显示字段错误」。
- [ ] `pnpm --filter @imsweb/web run lint`、`typecheck`、`test:unit`。

**评审闸门 E（必须人工过目）**：新增 i18n 键在两个 locale 的对应关系、绑定按钮的
`readOnly` 约束、OAuth 成功/失败反馈的清理逻辑。

**回滚点 8**：还原 UI/i18n 文件与页面测试。

---

## 阶段 9：API 契约与并发测试（补齐 AC）

依赖：阶段 3–6。

- [ ] `apps/api/tests/server/platform-account-security.contract.test.ts`：新增
  - 绑定 start 302/303 到 provider、未配置 provider 回流 `?oauth=link-unavailable`、匿名 401；
  - 回调 link 分支：成功写 identity 且**不建会话**、重复绑定幂等、他账号身份被拒且无写入；
  - 登录 state 不能进 link 分支、link state 不能建会话（AC1b）；
  - 邮箱：码错 400、未验证不落库、补绑已存在 409、换绑密码错 403 且原凭据不变、目标占用 409、
    成功后可用旧密码登录（AC2/AC3/AC4/AC5）；
  - 限流桶断言（新 bucket 与既有桶互不影响）。
- [ ] `apps/api/tests/server/platform-oauth-wire-contract-conformance.test.ts`：把新 start
  路由纳入 mounted 路由覆盖面。
- [ ] 并发用例（需要真实 PostgreSQL，放 `test:server`）：
  - 并发解绑最后一个 OAuth × 同时补绑邮箱：结果不是零凭据（AC6）；
  - 并发两次补绑：仅一个 `created`；
  - 并发换绑 + 改密：至少一个 `state-conflict`，凭据不丢。
- [ ] `pnpm --filter @imsweb/api run test:server` 与 `test:node`。

**评审闸门 F**：并发用例是否真的用两条连接触发竞争，而不是串行调用。

---

## 阶段 10：全量校验与收尾

- [ ] 静态与边界：
  ```sh
  pnpm --filter @imsweb/contracts run build
  pnpm run check:rules
  pnpm run check:boundaries
  pnpm --filter @imsweb/api run check:architecture
  pnpm --filter @imsweb/api run typecheck
  pnpm --filter @imsweb/web run typecheck
  pnpm --filter @imsweb/web run lint
  ```
- [ ] 测试：
  ```sh
  pnpm --filter @imsweb/api run test
  pnpm --filter @imsweb/web run test:unit
  pnpm run test:web-routing
  ```
- [ ] 纯逻辑快速回归（无 PostgreSQL）：
  ```sh
  IMS_TEST_POSTGRES_ENABLED=false pnpm --filter @imsweb/api run test:server
  ```
- [ ] 提交前钩子等价检查：`pnpm run check:pre-commit`。
- [ ] 若动了路由清单或 non-JSON manifest，确认已 `--write` 且 `check:rules` 无 stale 报错。
- [ ] 人工复核 `git diff`：确认未意外改动登录/注册逻辑、未新增 migration、未改
  `packages/contracts/package.json` / `src/index.ts` / `entrypoints.json`。
- [ ] 归档验证证据到任务 notes（命令 + 结果摘要）；**不要** commit/push/merge。

---

## 完成定义（DoD）

- AC1/AC1a/AC1b：OAuth 绑定 start+回调可用，冲突可区分且无写入，幂等，不退化为登录。
- AC2/AC3/AC4/AC5：补绑/换绑在验证码通过前不落库；换绑要当前密码且保留 hash；冲突可区分；
  迁移后旧密码可登录新邮箱，既有会话不受影响。
- AC6：并发用例证明不会出现零凭据账号（仓储层原子判定）。
- AC7：`platform-email-binding\0` 域与注册域隔离，跨用途码不可复用。
- AC8：新 schema 全部在 `account-security.ts`，请求 strict、响应精确。
- AC9：Web OAuth 区块区分未绑定/已绑定，绑定失败有可读反馈；邮箱区块区分补绑/换绑。

## 待产品确认（阻塞项之外的显式缺口）

- 复用 `registration` 邮件 purpose 会让主题写成「registration verification code」。
  若产品不接受，需单开 follow-up：新增 `email_binding` purpose + 两条 CHECK migration
  + cipher/SMTP/队列改动（design §2.5、§4）。
