# 03 - 仓储层的邮箱 / OAuth 写入原语

范围：`platform-account-repository.ts`、`ports/repositories/platform.ts`、
migration `0020_platform_accounts.sql`。标记：`[事实]` = 代码；`[推断]` = 判断。

## 1. 邮箱原语

`[事实]` `isEmailConflict`（`platform-account-repository.ts:169-183`）私有 helper，
只匹配 `platform_email_credentials_pkey`（Postgres `23505` / SQLite message）。
**不覆盖** `platform_email_credentials.account_id` 的 UNIQUE（`0020:128-134`）。
它不在 `PlatformAccountRepository` 端口里，冲突只在结果类型上体现。

`[事实]` `createEmailAccount`（`:760-819`）batch 三插
`platform_accounts + platform_profiles + platform_email_credentials`；
credential 列 `(normalized_email, account_id, algorithm, parameters_json, salt, password_hash,
created_at, updated_at)`，`salt` 写死 `NULL`；捕获 `isEmailConflict` → `{status:'email-conflict'}`（`:813`）。
入参 `NewPlatformEmailAccountInput`（`platform.ts:73-82`，`algorithm:'bcrypt'`）；
返回 `CreatePlatformEmailAccountResult`（`:170-172`）=
`{status:'created', identity: PlatformAccountWithProfile}` | `{status:'email-conflict'}`
（identity **不含** credential）。

`[事实]` `createVerifiedEmailAccount`（`:821-968`）最完整的「消费码 + 写凭据」原语，
一个 serialized batch 五步：
1. `UPDATE platform_email_verification_codes`（`:823-837`）写 `consumed_token` 或扣 `attempts_remaining`，
   WHERE 含 `consumed_token IS NULL AND delivery_token IS NULL AND expires_at>? AND attempts_remaining>0`。
2. `INSERT platform_accounts ... WHERE EXISTS(码行 code_hash=? AND consumed_token=? AND expires_at>?)`（`:839-862`）。
3. `INSERT platform_profiles ... WHERE EXISTS(account + 码行)`（`:863-899`）。
4. `INSERT platform_email_credentials ... WHERE EXISTS(account + profile + 码行)`（`:900-934`）。
5. `DELETE FROM platform_email_verification_codes ... AND EXISTS(credential 已写入该 account)`（`:935-960`）。

成功需 `results[3].meta.changes===1` 且 `results[4].meta.changes===1`，
否则 `verification-invalid`（`:962-968`）；`isEmailConflict` → `email-conflict`（`:948`）。
入参 `NewVerifiedPlatformEmailAccountInput`（`platform.ts:187-194`）；
返回 `CreateVerifiedPlatformEmailAccountResult`（`:196-198`）。

`[事实]` 其余邮箱原语都是**原地改密码/算法**，不碰 `normalized_email`：
`completePasswordReset`（`:990-1130`，`UPDATE ... SET algorithm='bcrypt', parameters_json=?,
salt=NULL, password_hash=?, updated_at=? WHERE normalized_email=? AND account_id=?`，`:1035-1053`）、
`updatePasswordForAccount`（`:1176`）、`upgradeEmailCredentialToBcrypt`（`:1291`）、
`findEmailCredentialByAccountId`（`:1161-1170`）、`findEmailIdentity`（`:1132-1160`）。

## 2. OAuth 原语

`[事实]` `createOAuthAccount`（`:690-758`）batch 三插
`platform_accounts + platform_profiles + platform_oauth_identities`；
identity 列 `(provider_code, provider_subject, account_id, provider_display_name,
provider_avatar_url, created_at, updated_at)`（`:727-741`）。
返回 `CreatePlatformOAuthAccountResult`（`platform.ts:145-147`）=
`{status:'created'|'identity-conflict', identity}`；
冲突经 `isOAuthIdentityConflict`（`:185-196`）匹配
`platform_oauth_identities_pkey` 或 `..._account_id_provider_code_key`。

`[事实]` `deleteOAuthIdentity`（`:604-688`）batch 两语句：
先按同一守卫写 `platform_security_events`，再
`DELETE ... WHERE account_id=? AND provider_code=? AND <survivingLoginMethod>`。
守卫 `survivingLoginMethod`（`:628-646`）拼进 WHERE：存在邮箱 credential
**或** 存在另一个 `provider.enabled=TRUE` 的 link。命中 0 行时再读一次仅用于区分
`last-login-method` / `not-found`（`:676-687`）。这是 ER8 并发要求的现成模板。

`[事实]` `findOAuthIdentity`（`:541`）、`listOAuthIdentitiesByAccount`（`:575`）、
`createOAuthState`（`:498`，写死 `linking_account_id=NULL`）、
`consumeOAuthState`（`:524`，写死 `intent='login'`）见 `01-oauth-login-flow.md`。
**不存在** 独立插 identity 的 `createOAuthIdentity`。

## 3. 关键约束

`[事实]` `platform_email_credentials`（`0020:128-150`）：
`normalized_email` PK（全局唯一，小写 trim）、`account_id NOT NULL UNIQUE`（每账号最多一条）、
`algorithm IN ('pbkdf2-sha256','bcrypt')`、`salt` 可空且
`CHECK (algorithm <> 'pbkdf2-sha256' OR salt IS NOT NULL)`。

`[事实]` `platform_oauth_identities`（`0020:47-68`）：
`PRIMARY KEY (provider_code, provider_subject)`、`UNIQUE (account_id, provider_code)`。

## 4. 「迁移已有邮箱凭据到新邮箱并保留密码 hash」够不够？

`[结论：事实]` **不够。现有原语没有任何一条能改写已有 credential 的 `normalized_email`。**

`[事实]` 全仓库 `UPDATE platform_email_credentials` 只有三处
（`:1037 / :1212 / :1303`），SET 列表分别是算法、密码、算法，均不含 `normalized_email`；
`INSERT INTO platform_email_credentials` 只有两处（`:797 / :902`），都是新建账号场景。

`[事实]` 因为 `normalized_email` 是 PK、`account_id` 是 UNIQUE，「换绑」只能是
`UPDATE ... SET normalized_email=<新> WHERE account_id=<账号>`（保留其余列即保留 hash），
或 `DELETE` 旧行 + `INSERT` 新行（需搬运 `password_hash/algorithm/parameters_json/salt`）。
两者都要校验验证码、判定目标邮箱未占用、并发原子。

缺失清单（推断）：

| 缺口 | 说明 |
| --- | --- |
| `createVerifiedEmailCredentialForAccount` | 补绑：只插 credential 到已有账号并消费码，不建 account/profile |
| `migrateEmailCredentialForAccount` | 换绑：把 `normalized_email` 迁到新邮箱并保留密码列；检测目标占用 |
| 目标邮箱占用的可区分结果 | `isEmailConflict` 私有且只匹配 `_pkey`，需对外暴露 `email-conflict` |
| 换绑到同一邮箱的判定 | `[推断]` 应为 no-op 或 400 |
| `account_id` UNIQUE 冲突映射 | `[推断]` DELETE+INSERT 实现可能撞 `account_id` 唯一约束，该冲突目前不被识别，需覆盖 |

`[推断]` 新原语应把「校验码 + 占用判定 + 写入」放进同一个 `serializeWrite` +
`database.batch`，用 `WHERE EXISTS(...)` 与 `consumed_token=?` 表达前置条件，
对齐 `deleteOAuthIdentity` / `createVerifiedEmailAccount` 的既有模式，
才能满足 PRD ER8 / AC6。
