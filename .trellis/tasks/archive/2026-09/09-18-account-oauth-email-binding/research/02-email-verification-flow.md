# 02 - 邮箱验证码在注册流程里的完整用法

范围：`platform-auth/registration/*`、对照 `platform-auth/password-reset/*`、
`ports/email-delivery.ts`、`infra/db/repositories/platform-email-delivery-repository.ts`、
`infra/email/smtp/platform-email-*.ts`、migration `0025`、`0026`。
标记：`[事实]` = 代码；`[推断]` = 判断。

## 1. 表

`[事实]` 注册码写 `platform_email_verification_codes`（`0025_platform_email_verification.sql:3-19`）：
`normalized_email TEXT PRIMARY KEY`（小写 trim，3–320）、`code_hash`（64 hex）、
`expires_at`、`resend_after`、`attempts_remaining`（0–5）、`consumed_token`（nullable 64 hex）、
`created_at`、`updated_at`；索引 `0025:21-22`。
`0026_platform_email_verification_delivery.sql:3-31` 追加
`pending_token / pending_code_hash / pending_expires_at / pending_resend_after /
pending_attempts_remaining / pending_created_at / delivery_token`，
并约束 `delivery_token` 非空时 `pending_token` 必空。

`[事实]` 对照：密码找回写 `platform_password_reset_codes`，用 `consumed_at`（BIGINT）而非
`consumed_token`（`platform-email-delivery-repository.ts:88-92` 的 `verificationSelect`；
`platform-account-repository.ts:1001-1090` 的 `completePasswordReset`）。

`[推断]` 沿用注册表时主键仍是 email，注册码与绑定码会共享同一行，
这正是 ER9 要求独立 hash 域的原因。

## 2. 有效期、次数、限流

`[事实]` 有效期：注册 10 分钟（`platform-email-delivery-repository.ts:20`；
payload `expiresInMinutes:10`，`send-verification-code.ts:78`）；
密码找回 15 分钟（`:21`；`reset-password.ts:76`）；
未投递候选的过期时间另加 `PROVISIONAL_EXPIRY_MARGIN_MS = 2 分钟`（`:22`、`:628-630`）。

`[事实]` 尝试次数 `ATTEMPTS_REMAINING = 5`（`:23`），
校验失败 SQL 内 `attempts_remaining-1`（`platform-account-repository.ts:823-825`）。

`[事实]` 限流两层：
1. 缓存层（best-effort）`email-verification-cache.ts`：key =
   `platform-email-verification-cooldown:` + HMAC(email)（`:18-27`，域分隔符
   `'platform-email-verification-cooldown\0'`）；
   `read...`（`:59`）命中即 429、`mark...`（`:92`）写回、`clear...`（`:116`）注册成功清；
   区间 30–600 秒（`:10-12`）；读失败吞掉（`:82-85`，PostgreSQL authoritative）。
2. DB 权威层 `SqlPlatformEmailDeliveryRepository.enqueue`（`:408-427`）：
   锁 `platform_email_configuration`（`:551-566`）取 `resend_cooldown_seconds`，
   算 `activeAggregateCooldown`（`:568-586`），未过期返回 `cooldown`。

`[事实]` handler `send-verification-code.ts` 先查缓存（`:35-56`），miss 后
`enqueueRegistration`（`:79`），仍 cooldown 再回写（`:84-93`）。
429 体为 `PLATFORM_EMAIL_VERIFICATION_COOLDOWN + retryAfterSeconds`，带 `Retry-After`。

## 3. `delivery_token` 与 `consumed_token`

`[事实]` `delivery_token` = 投递作业身份标记，`createPlatformEmailDeliveryIdentityToken()`
= `randomHex(32)`（`contracts/email-delivery.ts:3-5`）。新候选先写 `pending_*`，
邮件被 SMTP 接受后 `complete()` → `activateCandidate()`（`:787-820`）提升为正式列并
`delivery_token=NULL`。消费 SQL 要求 `delivery_token IS NULL`
（`platform-account-repository.ts:831-832`），即**只有投递成功的码可校验**。

`[事实]` `consumed_token` 由调用方生成（`register.ts:65` `randomHex(32)`）。
校验事务里命中 `code_hash` 则写该值、否则置 NULL（`platform-account-repository.ts:826-833`）；
后续建账号（`:848-862`）、建 profile（`:873-899`）、写 credential（`:902-934`）、
删码（`:952-960`）全部以 `consumed_token=?` 为栅栏。码一次性，最终被 DELETE。
成功靠 `results[3]`（credential 插入）与 `results[4]`（删码）各 `meta.changes===1`，
否则 `verification-invalid`（`:962-965`）。

`[推断]` 绑定应沿用同一协议：调用方生成 `consumedToken`，仓储在 serialized batch 内
「消费码 + 写凭据」互相栅栏。

## 4. 发信接口

`[事实]` handler 流程（`send-verification-code.ts:62-83`）：
`createPlatformEmailVerificationCode()`（6 位数字，`email-verification.ts:4-6`）→
identity `{jobId, purpose:'registration', deliveryToken, payloadVersion:1}` →
`platformEmailJobPayloadCipher.encrypt(...)` →
`platformEmailDeliveryQueue.enqueueRegistration({...prepared, codeHash, createdAt})`。

`[事实]` 端口 `ports/email-delivery.ts`：
`PlatformEmailDeliveryPurpose = 'registration' | 'password_reset'`（`:3`）、
`PlatformEmailJobPayload` 联合（`:27-34`）、
`PlatformEmailDeliveryQueue.enqueueRegistration / enqueuePasswordReset`（`:88-96`）、
`PlatformEmailDeliveryWorkerStore`（`:110-149`）。

`[事实]` 实现 `SqlPlatformEmailDeliveryRepository`
（`platform-email-delivery-repository.ts:139`）：
`enqueueRegistration`（`:148-158`）只接受 registration 且**不校验邮箱占用**；
`enqueuePasswordReset`（`:160-172`）要求现有 credential，否则 `email-not-found`（`:487-505`）；
`tableFor`（`:77`）/`expiryFor`（`:83`）按 purpose 分派。
runner：`runtime/node-email-delivery-runner.ts`。

`[事实]` payload 加密 `PlatformEmailJobPayloadCipherAdapter`
（`infra/email/smtp/platform-email-job-payload.ts:89`）：
`authenticatedData` 白名单只有两种 purpose（`:36`）；
`validatePayload` 的 `expiresInMinutes` 按 registration=10/其它=15 二分（`:60`），
只返回两种字面量（`:74-88`）。
SMTP 文案 `platform-email-service.ts:472-478` 按 purpose 选 subject/content。

`[事实]` 哈希域（ER9 关键）：注册 = HMAC-SHA256(`PLATFORM_JWT_SECRET`) 前缀
`'platform-email-registration\0'`（`email-verification.ts:12-18`）；
找回 = `'platform-password-reset\0'`（`password-reset.ts:11-17`）。

`[事实]` 注册写库 `handlePlatformRegister`（`register.ts`）→
`createVerifiedEmailAccount`（`platform-account-repository.ts:821`）；
失败 400 `PLATFORM_EMAIL_VERIFICATION_INVALID`（`:73-80`）、
冲突 409 `PLATFORM_EMAIL_EXISTS` 并清 cooldown（`:81-88`）。

## 5. 可直接复用 / 不能复用 / 需新增

可直接复用（既有）：
`createPlatformEmailVerificationCode`（`:4`）、
`createPlatformEmailDeliveryIdentityToken`（`email-delivery.ts:3`）、
`platformEmailJobPayloadCipher.encrypt`（端口 `:44`）、
`queue.enqueueRegistration`（`:89`，不校验占用，适合新邮箱）、
`read/mark/clearPlatformEmailVerificationCooldown`（`:59/:92/:116`）、
`withBoundedCacheOperation`、runtime 服务
（`send-verification-code.ts:33-39` 的 `cache / platformEmailDeliveryQueue /
platformEmailJobPayloadCipher / platformEmailResendPolicy / platformEmailResendPolicyCache`）。

不能复用（既有）：`hashPlatformEmailVerificationCode`（域写死注册）、
`handlePlatformRegistrationVerification`（匿名、只收 `{email}`、无账号）、
`enqueuePasswordReset`（要求目标邮箱已有 credential，补绑场景恰恰没有）、
`createVerifiedEmailAccount`（建新账号）。

需新增（推断）：
1. 新 hash 域函数（如 `hashPlatformEmailBindingCode`，前缀 `'platform-email-binding\0'`）。
2. 已登录的验证码发送 handler（结构照抄 `send-verification-code.ts`，挂账号安全中间件链）。
3. 「消费码 + 写已有账号凭据」仓储原语（见 `03`）。
4. 契约 schema（`packages/contracts/src/platform/account-security.ts`）。

`[推断]` 若新增邮件 purpose，则要同步改 `ports/email-delivery.ts:3`、
两条 migration 的 purpose CHECK（`20260913120000_...sql:61-63`、
`20260913130000_...sql:14`）、`tableFor/expiryFor/consumed` 分派（`:77/:83/:89`）、
payload 白名单（`platform-email-job-payload.ts:36/:60/:74`）、
SMTP 文案（`platform-email-service.ts:472-478`）。
若时间有限可用 registration purpose + 新 hash 域，代价是邮件主题仍写 "registration"
且与注册共享表与冷却桶。
