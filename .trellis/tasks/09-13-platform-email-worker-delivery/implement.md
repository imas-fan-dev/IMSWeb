# 邮件投递 Worker 化执行计划

## 0. Preconditions

- [ ] 读取 `prd.md`、`design.md` 和 `research/worker-architecture.md`。
- [ ] 加载 `trellis-before-dev`，读取 API、Web、contracts 与共享规范。
- [ ] 按 `docs/development/ai-environment.md` 运行环境预检。
- [ ] 确认并保留与本任务无关的工作区改动，尤其是 `scripts/deployment/render-preview-app-release-notes.sh` 和 `09-13-app-navigation-interaction`。
- [ ] 记录基线命令结果：API typecheck、contracts build、相关 server tests、Web account tests、Compose/deployment tests。

## Release A: Queue And Worker Expansion

Release A 上线完整但空闲的 Worker。API 仍使用现有同步 SMTP 路径。

### 1. Add The Immutable Job Schema

- [ ] 新增 PostgreSQL migration，创建 `platform_email_delivery_jobs`、状态约束、尝试次数约束、租约字段、deadline、bounded failure fields、claim indexes 和 terminal retention index。
- [ ] 同一 additive migration 为 `platform_email_configuration` 增加 `resend_cooldown_seconds INTEGER NOT NULL DEFAULT 60`，并用数据库约束限定为 30 至 600。
- [ ] 保证表中没有 plaintext email、verification code、rendered message 或 SMTP response。
- [ ] 更新 migration catalog、固定顺序、最新迁移和数量断言。
- [ ] 添加真实 PostgreSQL migration/schema regression。

Validation:

```sh
pnpm --filter @imsweb/api run test:migration
```

Rollback point:

- migration 只能 expand，不编辑已发布 migration。
- migration 一旦在环境中应用，pre-Release-A 镜像不能作为自动回滚目标；失败恢复使用 Release A 镜像的同步 API，生产数据库恢复仍走现有手工边界。

### 2. Introduce Ports And Encrypted Payloads

- [ ] 在 API ports 中增加 `PlatformEmailDeliveryQueue` 和 `PlatformEmailDeliveryWorkerStore`，限制 API 与 Worker 各自能力。
- [ ] 增加 `PlatformEmailResendPolicyCache`，只暴露严格读取和按 `updatedAt` 原子写入较新版本的能力，不把通用 Lua 或 SMTP 配置暴露给 domain；实现保持邮件域专用，不提前抽取下一版本的持久化外部服务配置缓存框架。
- [ ] 定义 job、claim、state transition 和 sanitized failure-category types。
- [ ] 新增 `PlatformEmailJobPayloadCipher`，使用独立 AES-256-GCM context、随机 IV、version 和 AAD。
- [ ] 生成 job ID 与 delivery token 后再加密，AAD 绑定 version、job ID、purpose 和 delivery token。
- [ ] 添加 round-trip、wrong-context、wrong-AAD、tamper 和 multibyte payload tests。
- [ ] 在 Valkey adapter 中实现有界 Lua compare-and-set；覆盖两个 API 实例共享缓存、旧回填不能覆盖新 revision、等 revision 幂等刷新、TTL、无效 JSON 和连接失败回退。

### 3. Build The PostgreSQL Delivery Repository

- [ ] 新增 `SqlPlatformEmailDeliveryRepository`。
- [ ] 将验证码 issue、delivery completion 和 revoke SQL 从 `SqlPlatformAccountRepository` 收敛到新 repository；账户创建、验证码消费、密码修改和 session revoke 仍留在 account repository。
- [ ] 实现 registration candidate + job 原子 enqueue；事务内读取当前 `resend_cooldown_seconds`，固化 `resend_after` 并返回权威 `retryAfterSeconds`。
- [ ] 实现 password-reset account check + candidate + job 原子 enqueue；unknown email 不创建 job，但返回当前权威重发间隔。
- [ ] 修复数据库 fallback 下 initial pending cooldown 错误使用 code TTL 的问题。
- [ ] 实现 `FOR UPDATE SKIP LOCKED` 或等价 claim，并为每次 claim 创建随机 lease token。
- [ ] 实现 lease renewal、stale-owner fencing、retry scheduling、deadline supersession 和 bounded terminal retention cleanup。
- [ ] 冷却结束后允许新入队原子取代 `queued`、`retry_wait` 或 `running` 旧任务；运行中的旧 SMTP 发送可以结束，但不能激活已取代候选。
- [ ] 统一验证码 aggregate 后 job row 的锁顺序，避免新入队与 Worker 完成事务互相死锁。
- [ ] 实现 confirmed success transaction：state/lease fence、candidate token fence、activation、accepted-time TTL、job completion。
- [ ] 实现 terminal failure transaction：state/lease fence、matching candidate cleanup、enqueue-time cooldown tombstone、job failure。
- [ ] 确保 failed resend 保留旧 active code 与原 expiry。

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

- [ ] Extend `ConfiguredPlatformEmailService` to classify Nodemailer/DNS outcomes without retaining raw response text.
- [ ] Keep public DNS validation, pinned IP, TLS 1.2+, hostname verification and per-attempt config reload.
- [ ] Add an absolute attempt deadline that closes the transport at the job deadline.
- [ ] Treat SMTP `4xx` and recognized temporary network errors as transient.
- [ ] Treat configuration, decrypt, SMTP `5xx`, authentication `535`, DNS policy, TLS/certificate, envelope and unknown errors as permanent.
- [ ] Require the intended recipient in Nodemailer's accepted result.
- [ ] Mark recognized post-DATA/network uncertainty only as `acceptance_ambiguous`; never activate without confirmed success.
- [ ] Preserve existing sanitized Backoffice test-send errors.

### 5. Add The Independent Worker Runtime

- [ ] Add a narrow Worker service factory that initializes only PostgreSQL, job repository/cipher, SMTP configuration/cipher, sender and runner.
- [ ] Add immediate polling with bounded concurrency and no overlapping claim cycles.
- [ ] Renew active leases and record bounded structured events.
- [ ] Add an internal-only liveness/readiness server with no host-published port.
- [ ] Make readiness depend on initialization, recent PostgreSQL poll success and non-stopping state, not SMTP availability or queue depth.
- [ ] Add `SIGINT`/`SIGTERM` handling: readiness false, stop claims, await active jobs, close health server and PostgreSQL.
- [ ] Add API workspace `dev`/`start` scripts for the Worker and ensure the existing build emits its entrypoint.
- [ ] Add runner lifecycle tests for immediate poll, bounded concurrency, graceful close, forced lease recovery and health transitions.

### 6. Integrate Development, Compose And Deployment

- [ ] Update root development orchestration to run API, Worker and Web watchers together and stop them coherently.
- [ ] Add `email-worker` to `deploy/compose.yaml` using the same immutable image, PostgreSQL-only dependency, no published port, no API data volume, Worker healthcheck and stop grace period.
- [ ] Keep `deploy/compose.preview.yaml` limited to preview-owned overrides and volumes.
- [ ] Update production deployment to pull, start and verify Worker before API; include Worker diagnostics and previous-Worker restore.
- [ ] Update preview deployment with the same Worker-first and rollback ordering.
- [ ] Verify every expected Worker replica rather than one arbitrary container.
- [ ] Update workspace boundary checks, environment examples and development/operations docs.
- [ ] Extend `tests/test_compose_deployment.py`, `tests/test_github_deployment.py` and development-environment tests.

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

- [ ] Independent review confirms API handlers still use synchronous SMTP.
- [ ] Queue table is empty under normal Release A traffic.
- [ ] Commit Release A separately.
- [ ] Push Release A to `release/v1.1` and monitor preview deployment.
- [ ] Verify API public health, Worker health, one expected Worker replica and zero failed/leased email jobs.
- [ ] Do not begin Release B until Release A is the confirmed `current` preview release.

## Release B: API Queue Cutover

Release B contains no migration.

### 8. Change Queue Acknowledgement And Policy Contracts

- [ ] Update registration and password-reset code-request success schemas to exact `{ success: true, queued: true, retryAfterSeconds: number }` payloads, with the server value constrained to positive integer seconds no greater than 600.
- [ ] Add `resendCooldownSeconds` to managed-email admin read/write contracts as an integer from 30 through 600, retaining strict objects and `expectedUpdatedAt`.
- [ ] Keep request schemas, route paths and error-body ownership unchanged.
- [ ] Update API conformance tests and Web `parsed(...)` consumers together.
- [ ] Preserve identical password-reset responses for known and unknown emails, including the current configured interval.

Validation:

```sh
pnpm --filter @imsweb/contracts run build
pnpm --filter @imsweb/api run typecheck
pnpm --filter @imsweb/web run typecheck
```

### 9. Switch HTTP Handlers To Transactional Enqueue

- [ ] Remove request-time SMTP availability checks and `sendMail` awaits from registration/password-reset handlers.
- [ ] Generate/hash the code and call `PlatformEmailDeliveryQueue`.
- [ ] Read recipient cooldown and resend-policy entries from shared Valkey for early rejection, but require the enqueue transaction to reread PostgreSQL and return the authoritative interval.
- [ ] After commit, write the absolute recipient cooldown and returned policy revision to Valkey; update failures remain bounded and fall back to PostgreSQL.
- [ ] Wire successful Backoffice policy updates to the revision-aware Valkey write-through path. Do not cache SMTP credentials or add an L1 cache.
- [ ] Return `202 queued` immediately after durable enqueue with the backend-calculated `retryAfterSeconds`.
- [ ] Keep immediate database/enqueue failures as explicit request failures; do not return success without a durable job.
- [ ] Keep unknown password-reset emails enumeration-safe and job-free.
- [ ] Remove obsolete handler compensation paths while retaining worker-side terminal compensation.

### 10. Update Backoffice Policy And Web Countdown

- [ ] Add a labeled integer-seconds control for the 30-through-600 resend interval to the existing Backoffice “邮件服务” policy section; default to 60 and preserve revision-conflict refresh behavior.
- [ ] Keep the existing send button and local countdown flow, but initialize it exclusively from response `retryAfterSeconds` with no fixed 60-second fallback.
- [ ] Change registration and password-reset success copy to “请求已受理，请稍候查收”.
- [ ] Do not add polling, status queries or asynchronous failure UI.
- [ ] Update Chinese and English i18n resources without changing unrelated strings.
- [ ] Cover registration and password-reset countdown behavior at desktop/mobile-relevant component boundaries.

### 11. Cutover Regression Coverage

- [ ] Extend API HTTP contract tests for exact queued responses.
- [ ] Prove SMTP is not called in the request path.
- [ ] Prove a committed job survives API process closure and is later delivered by Worker.
- [ ] Prove a code cannot register/reset before confirmed delivery.
- [ ] Prove accepted-time TTL and single-use consumption.
- [ ] Prove failed resend preserves the old code.
- [ ] Prove a configured 30-second cooldown can supersede a still-running old attempt; late old completion cannot activate its code, while a superseded resend keeps the earlier active code usable.
- [ ] Prove unknown password-reset email returns the same payload and configured interval while creating no job.
- [ ] Prove Valkey policy reads are shared across API instances, write-through is revision-monotonic, a stale refill cannot overwrite a newer setting, invalid/missing cache data falls back to PostgreSQL, and the enqueue transaction wins over stale cache input.
- [ ] Prove successful, `429` and `Retry-After` values use the same ceiling calculation for intervals of 30, 60 and 600 seconds.
- [ ] Prove Web starts countdown after enqueue acknowledgement, uses the returned interval without a fallback, and shows the new message.
- [ ] Cover Backoffice policy bounds, CSRF, optimistic conflicts, cache update failure and successful cross-instance refresh.
- [ ] Regenerate route/wire inventory only if semantic output requires it; update exact snapshot totals rather than compatibility baselines unless counts actually change.

### 12. Release B Quality Gate

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

- [ ] Independent review verifies every PRD acceptance criterion and both deployment rollback paths.
- [ ] Commit Release B separately from Release A.
- [ ] Push Release B to `release/v1.1` and monitor preview deployment.
- [ ] Verify Worker becomes ready before candidate API.
- [ ] Request one registration code and one password-reset code in preview; require enqueue latency independent of SMTP response time and confirm delivery/activation through the normal workflows.
- [ ] Verify no plaintext code/email in job rows or logs.
- [ ] Verify queue drains and no job remains stuck beyond its deadline/lease.

Rollback point:

- Release B contains no schema change.
- Automatic rollback restores Release A Worker first and then Release A API.
- Release A Worker continues draining Release B jobs because schema and payload version are identical.
- Release A API returns to synchronous SMTP for new requests.

## 13. Finish

- [ ] Run `trellis-check` against the final scope.
- [ ] Update relevant Trellis specs only for durable new project conventions, not task-specific details.
- [ ] Record the deferred persisted external-service configuration cache as next-version scope for OAuth and full SMTP settings; do not implement a business-data dual-write framework or migrate unrelated caches in this task.
- [ ] Record both release commit IDs and preview deployment evidence.
- [ ] Confirm unrelated working-tree changes remain untouched.
- [ ] Commit any final documentation/spec-only changes using Conventional Commit style.
- [ ] Archive the Trellis task only after both preview checkpoints and the full final quality gate pass.
