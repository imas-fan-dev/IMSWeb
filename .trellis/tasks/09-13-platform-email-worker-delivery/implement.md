# 邮件投递 Worker 化执行计划

## 0. Preconditions

- [x] 读取 `prd.md`、`design.md` 和 `research/worker-architecture.md`。
- [x] 加载 `trellis-before-dev`，读取 API、Web、contracts 与共享规范。
- [x] 按 `docs/development/ai-environment.md` 运行环境预检。
- [x] 确认并保留与本任务无关的工作区改动，尤其是 `scripts/deployment/render-preview-app-release-notes.sh` 和 `09-13-app-navigation-interaction`。
- [x] 记录基线命令结果：API typecheck、contracts build、相关 server tests、Web account tests、Compose/deployment tests。

## Release A: Queue And Worker Expansion

Release A 上线完整但空闲的 Worker。API 仍使用现有同步 SMTP 路径。

### 1. Add The Immutable Job Schema

- [x] 新增 PostgreSQL migration，创建 `platform_email_delivery_jobs`、状态约束、尝试次数约束、租约字段、deadline、bounded failure fields、claim indexes 和 terminal retention index。
- [x] 同一 additive migration 为 `platform_email_configuration` 增加 `resend_cooldown_seconds INTEGER NOT NULL DEFAULT 60`，并用数据库约束限定为 30 至 600。
- [x] 保证表中没有 plaintext email、verification code、rendered message 或 SMTP response。
- [x] 更新 migration catalog、固定顺序、最新迁移和数量断言。
- [x] 添加真实 PostgreSQL migration/schema regression。

Validation:

```sh
pnpm --filter @imsweb/api run test:migration
```

Rollback point:

- migration 只能 expand，不编辑已发布 migration。
- migration 一旦在环境中应用，pre-Release-A 镜像不能作为自动回滚目标；失败恢复使用 Release A 镜像的同步 API，生产数据库恢复仍走现有手工边界。

### 2. Introduce Ports And Encrypted Payloads

- [x] 在 API ports 中增加 `PlatformEmailDeliveryQueue` 和 `PlatformEmailDeliveryWorkerStore`，限制 API 与 Worker 各自能力。
- [x] 增加 `PlatformEmailResendPolicyCache`，只暴露严格读取和按 `updatedAt` 原子写入较新版本的能力，不把通用 Lua 或 SMTP 配置暴露给 domain；实现保持邮件域专用，不提前抽取下一版本的持久化外部服务配置缓存框架。
- [x] 定义 job、claim、state transition 和 sanitized failure-category types。
- [x] 新增 `PlatformEmailJobPayloadCipher`，使用独立 AES-256-GCM context、随机 IV、version 和 AAD。
- [x] 生成 job ID 与 delivery token 后再加密，AAD 绑定 version、job ID、purpose 和 delivery token。
- [x] 添加 round-trip、wrong-context、wrong-AAD、tamper 和 multibyte payload tests。
- [x] 在 Valkey adapter 中实现有界 Lua compare-and-set；覆盖两个 API 实例共享缓存、旧回填不能覆盖新 revision、等 revision 幂等刷新、TTL、无效 JSON 和连接失败回退。

### 3. Build The PostgreSQL Delivery Repository

- [x] 新增 `SqlPlatformEmailDeliveryRepository`。
- [x] 将验证码 issue、delivery completion 和 revoke SQL 从 `SqlPlatformAccountRepository` 收敛到新 repository；账户创建、验证码消费、密码修改和 session revoke 仍留在 account repository。
- [x] 实现 registration candidate + job 原子 enqueue；事务内读取当前 `resend_cooldown_seconds`，固化 `resend_after` 并返回权威 `retryAfterSeconds`。
- [x] 实现 password-reset account check + candidate + job 原子 enqueue；unknown email 不创建 job，但返回当前权威重发间隔。
- [x] 修复数据库 fallback 下 initial pending cooldown 错误使用 code TTL 的问题。
- [x] 实现 `FOR UPDATE SKIP LOCKED` 或等价 claim，并为每次 claim 创建随机 lease token。
- [x] 实现 lease renewal、stale-owner fencing、retry scheduling、deadline supersession 和 bounded terminal retention cleanup。
- [x] 冷却结束后允许新入队原子取代 `queued`、`retry_wait` 或 `running` 旧任务；运行中的旧 SMTP 发送可以结束，但不能激活已取代候选。
- [x] 统一验证码 aggregate 后 job row 的锁顺序，避免新入队与 Worker 完成事务互相死锁。
- [x] 实现 confirmed success transaction：state/lease fence、candidate token fence、activation、accepted-time TTL、job completion。
- [x] 实现 terminal failure transaction：state/lease fence、matching candidate cleanup、enqueue-time cooldown tombstone、job failure。
- [x] 确保 failed resend 保留旧 active code 与原 expiry。

Focused PostgreSQL coverage:

- atomic candidate/job commit and rollback
- no plaintext payload
- initial and resend candidate behavior
- pre-acceptance rejection and post-acceptance activation
- old-code preservation
- two-worker competition
- stale lease owner fencing
- lease expiry recovery
- one retry at `+20s`
- two-attempt cap
- no new attempt at/after `+60s`
- new enqueue supersedes expired task
- 30-second cooldown supersedes an in-flight task without activating its old candidate
- completion-first versus supersession-first transaction ordering
- superseded resend preserves the earlier active code
- consistent aggregate-then-job lock order
- terminal retention cleanup
- interval defaults and 30/600 database boundaries
- configuration update versus enqueue transaction ordering

### 4. Preserve Sanitized SMTP Failure Evidence

- [x] Extend `ConfiguredPlatformEmailService` to classify Nodemailer/DNS outcomes without retaining raw response text.
- [x] Keep public DNS validation, pinned IP, TLS 1.2+, hostname verification and per-attempt config reload.
- [x] Add an absolute attempt deadline that closes the transport at the job deadline.
- [x] Treat SMTP `4xx` and recognized temporary network errors as transient.
- [x] Treat configuration, decrypt, SMTP `5xx`, authentication `535`, DNS policy, TLS/certificate, envelope and unknown errors as permanent.
- [x] Require the intended recipient in Nodemailer's accepted result.
- [x] Mark recognized post-DATA/network uncertainty only as `acceptance_ambiguous`; never activate without confirmed success.
- [x] Preserve existing sanitized Backoffice test-send errors.

### 5. Add The Independent Worker Runtime

- [x] Add a narrow Worker service factory that initializes only PostgreSQL, job repository/cipher, SMTP configuration/cipher, sender and runner.
- [x] Add immediate polling with bounded concurrency and no overlapping claim cycles.
- [x] Renew active leases and record bounded structured events.
- [x] Add an internal-only liveness/readiness server with no host-published port.
- [x] Make readiness depend on initialization, recent PostgreSQL poll success and non-stopping state, not SMTP availability or queue depth.
- [x] Add `SIGINT`/`SIGTERM` handling: readiness false, stop claims, await active jobs, close health server and PostgreSQL.
- [x] Add API workspace `dev`/`start` scripts for the Worker and ensure the existing build emits its entrypoint.
- [x] Add runner lifecycle tests for immediate poll, bounded concurrency, graceful close, forced lease recovery and health transitions.

### 6. Integrate Development, Compose And Deployment

- [x] Update root development orchestration to run API, Worker and Web watchers together and stop them coherently.
- [x] Add `email-worker` to `deploy/compose.yaml` using the same immutable image, PostgreSQL-only dependency, no published port, no API data volume, Worker healthcheck and stop grace period.
- [x] Keep `deploy/compose.preview.yaml` limited to preview-owned overrides and volumes.
- [x] Update production deployment to pull, start and verify Worker before API; include Worker diagnostics and previous-Worker restore.
- [x] Update preview deployment with the same Worker-first and rollback ordering.
- [x] Verify every expected Worker replica rather than one arbitrary container.
- [x] Before candidate migrations, require the current production or preview image to contain the B1 anonymous-cooldown migration so it remains a valid automatic rollback target.
- [x] Update workspace boundary checks, environment examples and development/operations docs.
- [x] Extend `tests/test_compose_deployment.py`, `tests/test_github_deployment.py` and development-environment tests.

### 7. Release A Quality Gate

Run focused checks first, then full checks:

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/api run check:architecture
pnpm --filter @imsweb/api run test:server
pnpm --filter @imsweb/api run test:migration
python3 -m unittest tests.test_compose_deployment tests.test_github_deployment
pnpm run check:rules
pnpm run check:boundaries
git diff --check
pnpm install --frozen-lockfile
pnpm run check
pnpm run test
```

Release gate:

- [x] Independent review confirms API handlers still use synchronous SMTP.
- [x] Queue table is empty under normal Release A traffic.
- [x] Commit Release A separately.
- [x] Push Release A to `release/v1.1` and monitor preview deployment.
- [x] Verify API public health, Worker health, one expected Worker replica and zero failed/leased email jobs.
- [x] Do not begin Release B1 until Release A is the confirmed `current` preview release.

## Release B1: Anonymous Cooldown Schema

Release B1 adds the PostgreSQL fallback needed for exact unknown-address password-reset cooldowns. Public API behavior remains the deployed Release A behavior throughout this checkpoint.

### 8. Add The Anonymous Cooldown Schema

- [x] Add `20260913130000_platform_email_request_cooldowns.sql` after the Release A queue migration.
- [x] Create only `platform_email_request_cooldowns` with `purpose`, a 64-character lowercase hexadecimal HMAC recipient key, `enqueued_at`, `resend_after` and `updated_at`.
- [x] Enforce the purpose set, key format, composite primary key, nonnegative enqueue time, `resend_after >= enqueued_at`, a maximum 600-second window and `updated_at >= enqueued_at`.
- [x] Add an expiry/cleanup index led by `resend_after`.
- [x] Update the frozen migration order, count, latest version, repeatability list and live PostgreSQL schema assertions.
- [x] Keep public behavior identical to Release A. Do not edit handlers, contracts, runtime composition, repository implementations or Web behavior before the B1 preview checkpoint.

Validation:

```sh
pnpm --filter @imsweb/api run test:migration
pnpm run check:rules
```

Release gate:

- [x] Commit Release B1 separately.
- [x] Push Release B1 to `release/v1.1` and monitor preview deployment.
- [x] Verify the public API still behaves like Release A and normal traffic does not write anonymous cooldown rows.
- [x] Do not begin Release B2 until Release B1 is the confirmed `current` preview release.

Rollback point:

- B1 is additive, but pre-B1 images reject the applied migration as unknown.
- If B1 fails after migration, recover with the B1 image while preserving Release A API behavior, or use the existing manual production database recovery boundary.
- Preview has no automatic database restore.

## Release B2: API Queue Cutover

Release B2 uses the B1 table for unknown password-reset cooldown fallback and contains no migration.

### 9. Change Queue Acknowledgement And Policy Contracts

- [x] Update registration and password-reset code-request success schemas to exact `{ success: true, queued: true, retryAfterSeconds: number }` payloads, with the server value constrained to positive integer seconds no greater than 600.
- [x] Add `resendCooldownSeconds` to managed-email admin read/write contracts as an integer from 30 through 600, retaining strict objects and `expectedUpdatedAt`.
- [x] Keep request schemas, route paths and error-body ownership unchanged.
- [x] Update API conformance tests and Web `parsed(...)` consumers together.
- [x] Preserve identical password-reset responses for known and unknown emails, including the current configured interval.

Validation:

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
```

### 10. Switch HTTP Handlers To Transactional Enqueue

- [x] Remove request-time SMTP availability checks and `sendMail` awaits from registration/password-reset handlers.
- [x] Generate/hash the code and call `PlatformEmailDeliveryQueue`.
- [x] Read recipient cooldown and resend-policy entries from shared Valkey for early rejection, but require the enqueue transaction to reread PostgreSQL and return the authoritative interval.
- [x] After commit, write the absolute recipient cooldown and returned policy revision to Valkey; rejection and never-settling commands must stop waiting after the shared short deadline, abort commands still waiting in node-redis, then fall back to PostgreSQL.
- [x] Wire successful Backoffice policy updates to the revision-aware Valkey write-through path. Do not cache SMTP credentials or add an L1 cache.
- [x] Return `202 queued` immediately after durable enqueue with the backend-calculated `retryAfterSeconds`.
- [x] Keep immediate database/enqueue failures as explicit request failures; do not return success without a durable job.
- [x] Keep unknown password-reset emails enumeration-safe and job-free; persist only their HMAC-keyed cooldown row from B1 so PostgreSQL remains authoritative during Valkey miss or outage.
- [x] Remove obsolete handler compensation paths while retaining worker-side terminal compensation.

### 11. Update Backoffice Policy And Web Countdown

- [x] Add a labeled integer-seconds control for the 30-through-600 resend interval to the existing Backoffice “邮件服务” policy section; default to 60 and preserve revision-conflict refresh behavior.
- [x] Keep the existing send button and local countdown flow, but initialize an absolute deadline exclusively from response `retryAfterSeconds` with no fixed 60-second fallback; recalculate from elapsed wall time after delayed callbacks.
- [x] Change registration and password-reset success copy to “请求已受理，请稍候查收”.
- [x] Do not add polling, status queries or asynchronous failure UI.
- [x] Update Chinese and English i18n resources without changing unrelated strings.
- [x] Cover registration and password-reset countdown behavior at desktop/mobile-relevant component boundaries.

### 12. Cutover Regression Coverage

- [x] Extend API HTTP contract tests for exact queued responses.
- [x] Prove SMTP is not called in the request path.
- [x] Prove a committed job survives API process closure and is later delivered by Worker.
- [x] Prove a code cannot register/reset before confirmed delivery.
- [x] Prove accepted-time TTL and single-use consumption.
- [x] Prove failed resend preserves the old code.
- [x] Prove a configured 30-second cooldown can supersede a still-running old attempt; late old completion cannot activate its code, while a superseded resend keeps the earlier active code usable.
- [x] Prove unknown password-reset email returns the same payload and configured interval while creating no verification candidate or job, and that Valkey miss or outage reads the HMAC-keyed B1 cooldown row.
- [x] Prove Valkey policy reads are shared across API instances, write-through is revision-monotonic, a stale refill cannot overwrite a newer setting, invalid/missing/never-settling cache operations abort their concrete command and fall back to PostgreSQL within an outer test deadline, and the enqueue transaction wins over stale cache input.
- [x] Prove successful, `429` and `Retry-After` values use the same ceiling calculation for intervals of 30, 60 and 600 seconds.
- [x] Prove Web starts countdown after enqueue acknowledgement, uses the returned interval without a fallback, and shows the new message.
- [x] Cover Backoffice policy bounds, CSRF, optimistic conflicts, cache update failure and successful cross-instance refresh.
- [x] Prove Worker claim timestamps are captured after maintenance, both verification-issuance routes share the dedicated IP budget, deployment rejects a pre-B1 rollback image, and Web countdowns recover from throttled callbacks.
- [x] Regenerate route/wire inventory only if semantic output requires it; update exact snapshot totals rather than compatibility baselines unless counts actually change.

### 13. Release B2 Quality Gate

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/api run check:architecture
pnpm --filter @imsweb/api run test
pnpm --filter @imsweb/web run format
pnpm --filter @imsweb/web run lint
pnpm --filter @imsweb/web run typecheck
pnpm --filter @imsweb/web run test:unit
pnpm --filter @imsweb/web run build
pnpm run check:rules
pnpm run check:boundaries
pnpm run test:web-routing
git diff --check
pnpm install --frozen-lockfile
pnpm run check
pnpm run test
```

Release gate:

- [x] Independent review verifies every PRD acceptance criterion and both deployment rollback paths.
- [x] Commit Release B2 separately from Release B1.
- [x] Push Release B2 to `release/v1.1` and monitor preview deployment.
- [x] Verify Worker becomes ready before candidate API.
- [x] Request one registration code and one password-reset code in preview; require enqueue latency independent of SMTP response time and confirm delivery/activation through the normal workflows. The user confirmed the complete preview workflow operates normally on 2026-09-14.
- [x] Verify no plaintext code/email in job rows or logs. Static schema and automated coverage pass; the live job table has zero plaintext email/code/content/credential columns, and the latest 500 Worker log lines contain zero email-address or sensitive-field patterns.
- [x] Verify queue drains and no job remains stuck beyond its deadline/lease. The post-acceptance preview queue contains one `completed` job and no runnable or expired non-terminal jobs; the Worker remains healthy.

Rollback point:

- Release B2 contains no schema change.
- Automatic rollback restores the B1 Worker first and then the B1 API.
- The B1 Worker continues draining B2 jobs because schema and payload version are identical.
- The B1 API returns to synchronous SMTP for new requests while retaining the anonymous cooldown table in its migration catalog.

## 14. Finish

- [x] Run `trellis-check` against the final scope.
- [x] Update relevant Trellis specs only for durable new project conventions, not task-specific details.
- [x] Record the deferred persisted external-service configuration cache as next-version scope for OAuth and full SMTP settings; do not implement a business-data dual-write framework or migrate unrelated caches in this task.
- [x] Record the Release A, B1 and B2 commit IDs and preview deployment evidence.
- [x] Confirm unrelated working-tree changes remain untouched.
- [x] Commit any final documentation/spec-only changes using Conventional Commit style.
- [x] Archive the Trellis task only after all three preview checkpoints and the full final quality gate pass.

Release evidence:

- Release A: `7f38ec6585153af958b25bfa2bcaed4fb5430012`; preview workflow `34764019009` succeeded with the independent Worker ready.
- Release B1 schema checkpoint: `ac002671`; preview workflow `34775694762` succeeded at head `bc895f1c` after the PostgreSQL cleanup fixes.
- Release B2: `097121ae4bfe6b34e7dc486de3cef1a3b985f739`, followed by deterministic Web test fix `07e1a0041ad34a17594f57a220226521a4be4886`; preview workflow `34782793876` passed source resolution, static and repository checks, immutable-image verification, deployment, Worker-before-API readiness, and SSH verification. Remote `current` resolved to `preview-07e1a0041ad3`, with API and Worker both `running/healthy`.
- The complete local `pnpm run check && pnpm run test` gate passed before the B2 commit. The test-only follow-up passed the complete Web `check` gate and ten consecutive focused runs.
- On 2026-09-14 the user confirmed that the complete preview email workflow operates normally. A final read-only runtime check found SMTP enabled with all required configuration fields present, API and Worker both healthy, one completed delivery job with no non-terminal backlog, zero plaintext-sensitive columns in the job table, and no email-address or sensitive-field patterns in the latest 500 Worker log lines.
