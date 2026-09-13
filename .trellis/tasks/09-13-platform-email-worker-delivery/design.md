# 邮件投递 Worker 化技术设计

## 1. Summary

本任务把注册与密码重置验证码邮件从 HTTP 请求内同步 SMTP 投递改为 PostgreSQL outbox 加独立 Node Worker。API 只负责在一个事务中写入验证码候选和加密任务；Worker 负责领取、解密、发送、重试，并在 SMTP 明确接受后原子激活验证码。

不增加前端轮询或后台任务查询接口。Web 在入队成功后显示“请求已受理，请稍候查收”，并按响应中的 `retryAfterSeconds` 启动倒计时。异步失败属于已接受的产品风险。

实施分为两个可部署检查点：

1. 扩展阶段：上线队列表、完整 Worker、Compose 和部署支持，但 API 保持同步 SMTP。
2. 切换阶段：在不增加迁移的前提下，把 API 改为事务入队并更新 Web 文案。

## 2. Current And Target Flow

### Current

```text
Web click
  -> API validates request
  -> repository stages verification candidate
  -> API waits for SMTP
  -> success: repository activates candidate, API returns 202
  -> failure: repository revokes candidate, API returns 503
```

### Target

```text
Web click
  -> API validates request
  -> one PostgreSQL transaction:
       stage verification candidate
       insert encrypted email job
       read and snapshot the current resend policy
       persist enqueue-based cooldown
  -> API returns 202 queued with retryAfterSeconds
  -> Web starts the server-directed countdown

Independent email worker
  -> claim job with lease token
  -> decrypt payload
  -> load current SMTP settings
  -> send the message
  -> one PostgreSQL transaction:
       fence by lease token
       activate matching candidate from SMTP acceptance time
       mark job completed
```

Registration and password-reset submission remain unchanged: only delivered, unexpired and unconsumed codes can complete the business operation.

## 3. Ownership And Dependency Boundaries

### Shared contracts

`packages/contracts/src/platform/index.ts` continues to own the HTTP JSON shapes. No delivery-status route is added.

The two verification-code success payloads become explicit queue acknowledgements:

```ts
{
  success: true;
  queued: true;
  retryAfterSeconds: number;
}
```

`retryAfterSeconds` is an integer derived by the server. A successful new enqueue returns the configured interval, which defaults to 60 and is bounded to 30 through 600 seconds. Cooldown responses return the remaining interval rounded up to whole seconds. Password-reset requests for unknown emails return the same exact response as known accounts, using the current configured interval without creating a code or job.

The managed email settings contracts add `resendCooldownSeconds` to both the exact admin response and write request. Contract validation accepts only integer values from 30 through 600. The field shares the existing `expectedUpdatedAt` optimistic-concurrency boundary.

### API domain

The registration and password-reset handlers continue to own request validation, code generation, hashing, cache acceleration and wire responses. They depend on a queue port and do not import PostgreSQL, Nodemailer or the payload cipher.

The handlers no longer call `PlatformEmailSender`, `complete*Delivery` or `revoke*` after enqueue. They read the shared cooldown and policy caches for an early rejection, but the enqueue transaction reads PostgreSQL again and returns the authoritative interval. The handlers update the best-effort cooldown cache only after that transaction commits.

### Ports

Add narrow runtime-neutral capabilities:

- `PlatformEmailDeliveryQueue`: registration and password-reset issue/enqueue operations used by HTTP handlers.
- `PlatformEmailDeliveryWorkerStore`: claim, renew, complete, retry, fail, supersede and deadline-cleanup operations used only by the Worker.
- `PlatformEmailResendPolicyCache`: read and atomically write a versioned, non-secret policy record in shared Valkey.
- Sanitized delivery result/error classification on `PlatformEmailSender` so the Worker can decide retry versus terminal failure without seeing raw SMTP responses.

The queue and worker-store interfaces remain separate even if one concrete repository implements both, so the API runtime does not receive claim/failure powers.

### Infrastructure

Add `SqlPlatformEmailDeliveryRepository` under `apps/api/src/infra/db/repositories/`. It owns the verification-candidate plus outbox transaction boundary and the worker state transitions. Existing delivery issue/activate/revoke SQL moves out of `SqlPlatformAccountRepository`; account creation and password-reset consumption remain there because they modify account credentials and sessions.

Add a versioned job-payload cipher under the existing concrete SMTP email infrastructure. `ConfiguredPlatformEmailService` remains the only Nodemailer adapter and continues to load SMTP configuration for every attempt.

### Runtime

The API composition root receives only the enqueue capability needed by request handlers. Backoffice SMTP configuration and test-send behavior remain available in the API runtime.

A new narrow Worker composition root initializes only:

- PostgreSQL connection
- email delivery repository
- job-payload cipher
- SMTP configuration repository and credential cipher
- `ConfiguredPlatformEmailService`
- polling runner and internal health server

It does not initialize Hono routes, Valkey, S3, static files, image processing, super-admin reconciliation or object cleanup.

### Web

The existing account auth form keeps its countdown interaction. It changes success copy from “验证码已发送” to “请求已受理，请稍候查收”. No status store, polling hook, route or new page is introduced.

## 4. PostgreSQL Model

Add an immutable migration creating `platform_email_delivery_jobs` with these logical fields:

| Group | Fields |
| --- | --- |
| Identity | `id`, `purpose`, unique `delivery_token` |
| Encrypted payload | `payload_ciphertext`, `payload_version` |
| Scheduling | `state`, `attempts`, `next_attempt_at`, `deadline_at` |
| Lease fencing | `lease_token`, `lease_expires_at` |
| Bounded result | `failure_category`, `acceptance_ambiguous` |
| Lifecycle | `last_attempt_at`, `accepted_at`, `completed_at`, `failed_at`, `created_at`, `updated_at` |

`purpose` is restricted to registration and password reset. `state` is restricted to:

- `queued`
- `running`
- `retry_wait`
- `completed`
- `failed`
- `superseded`

The table stores no plaintext email, code, rendered subject/body, SMTP credential or raw provider response. Claim and retention indexes cover runnable state plus `next_attempt_at`, expired leases, deadlines and terminal cleanup.

Terminal jobs are retained for a bounded operational window, then deleted in small batches. Retention never controls user cooldown or verification validity.

The same additive migration adds `resend_cooldown_seconds` to the existing `platform_email_configuration` singleton with `NOT NULL DEFAULT 60` and a database check restricting values to integer seconds from 30 through 600. Released migrations are not edited. The migration catalog and frozen-order tests receive one additive entry.

## 5. Enqueue Transaction

The API generates a random job ID and delivery token, then prepares a versioned encrypted payload before opening the SQL transaction. The payload contains only the minimum send data:

```text
purpose, normalizedEmail, code, expiresInMinutes
```

The repository transaction:

1. Locks the email-configuration singleton and reads the current `resend_cooldown_seconds` value.
2. Locks or creates the recipient verification aggregate.
3. Applies the authoritative PostgreSQL cooldown check.
4. Once the cooldown has ended, locks and marks any prior non-terminal job for the same candidate as `superseded`, including `running`, and clears only the matching staged candidate.
5. Stages an initial candidate or a pending resend candidate.
6. Inserts exactly one `queued` job with `attempts=0`, `next_attempt_at=createdAt` and `deadline_at=createdAt+60s`.
7. Persists `resend_after=createdAt+resendCooldownSeconds` and commits the candidate, job and cooldown together.

The operation returns the interval and absolute cooldown timestamp that were committed. A stale policy-cache value can avoid unnecessary work, but it cannot choose the interval stored by the transaction.

An initial candidate remains unusable while its delivery token is present. A resend writes `pending_*` fields and leaves the old active code usable until its original expiry or successful replacement.

Provisional candidate expiry remains long enough for an attempt that began before the deadline to finish. Final code expiry is overwritten from SMTP acceptance time.

Password-reset issuance checks account existence inside the same repository operation. Unknown emails return the enumeration-safe queue acknowledgement without writing a verification candidate or delivery job.

## 6. Cooldown, Policy Cache And Expired Jobs

PostgreSQL remains authoritative for both the policy and each committed cooldown. Valkey provides two shared, cross-instance accelerators:

- Recipient cooldown entries contain the absolute `retryAfterAt` produced by the enqueue transaction. Their TTL is derived from the committed interval and is capped at 600 seconds.
- One `platform-email-resend-policy:v1` entry contains only `{ resendCooldownSeconds, updatedAt }`. It never contains SMTP usernames, passwords, credential ciphertext or the rest of the SMTP configuration.

There is no process-local L1 cache. Every API replica reads the same Valkey namespace, so an update does not depend on per-process invalidation.

Policy reads use cache-aside with strict JSON validation and a five-second TTL. A miss, malformed value or Valkey error falls back to the PostgreSQL singleton. Both database refills and successful admin updates call a specialized Valkey operation that atomically writes only when the incoming `updatedAt` is greater than or equal to the cached revision. This compare-and-set is implemented with a bounded Lua script in the Valkey adapter, preventing a slow old database read from overwriting a newer admin update.

After the PostgreSQL compare-and-swap succeeds, the admin path writes the returned policy revision through to Valkey. Cache synchronization failure does not roll back the committed PostgreSQL update. It records only a bounded operational event; the short TTL and next cache miss repair the entry. The enqueue transaction always rereads PostgreSQL and returns the committed interval, so cache lag cannot persist an incorrect cooldown.

After enqueue commit, the handler writes the returned absolute cooldown to the recipient cache. If that write fails, the next request falls back to PostgreSQL `resend_after`. A cache hit may reject an early retry without a database round trip, but cache absence never permits a retry because the transactional database check still runs.

When an initial task fails, the verification row becomes a non-consumable tombstone by clearing the delivery token and setting code attempts to zero while retaining its enqueue-time `resend_after`.

When a resend task fails, the repository copies the pending candidate's `pending_resend_after` into the active aggregate before clearing only the pending fields. The old code and its original expiry remain unchanged.

When the committed cooldown ends, a new request may atomically supersede the prior job, clear its matching staged candidate and enqueue a new candidate. This also applies when the prior job is `running` and its fixed delivery deadline has not arrived. The SMTP operation cannot be recalled, so that old email may still reach the recipient, but its Worker loses the state, lease-token and candidate-token fences required for activation. If the superseded job represented a resend, the earlier active code and its original expiry remain unchanged.

All transactions that touch both verification state and a job lock the verification aggregate before the job row. Worker completion and failure use the same order, avoiding an enqueue-versus-completion deadlock. Whichever transaction commits first defines the result: a confirmed delivery committed first becomes the active code before the new request stages a replacement; supersession committed first makes the old completion stale.

## 7. Worker State Machine

### Claim

Claim through a PostgreSQL row lock with `FOR UPDATE SKIP LOCKED` followed by `UPDATE ... RETURNING`, or an equivalent single conditional statement.

Eligibility requires:

- state is `queued`, `retry_wait`, or recoverable expired `running`
- `next_attempt_at <= now`
- `attempts < 2`
- `now < deadline_at`

Every claim:

- increments `attempts`
- creates a cryptographically random lease token
- records `last_attempt_at`
- sets a renewable lease expiry

Every later mutation includes job ID, state and exact lease token. Lease timestamp alone is not a sufficient fence.

### Attempt deadline and lease renewal

A send attempt receives the job's absolute 60-second deadline. DNS resolution and SMTP delivery are bounded by that deadline. The transport is closed when the deadline is reached.

The runner renews the lease while an attempt is active. If the process exits, the lease expires soon enough for a second worker to reclaim before the job deadline when time remains.

The deadline prevents a retry from being started after 60 seconds. An external SMTP server may still have accepted an ambiguous attempt before the local transport was closed.

### Success

Nodemailer success must include the intended recipient in the accepted result. Capture `acceptedAt` immediately, then run one transaction that:

1. Locks the recipient verification aggregate.
2. Locks the running job and verifies its state and lease token.
3. Activates only the candidate whose initial or pending delivery token matches.
4. Sets code expiry to `acceptedAt + 10m` for registration or `acceptedAt + 15m` for password reset.
5. Preserves the enqueue-based resend cooldown.
6. Marks the job `completed` and clears lease fields.

If the candidate disappeared, was consumed or was replaced, mark the job `superseded`; never recreate verification state.

### Failure and retry

Deterministic errors terminalize immediately. A first transient error schedules `retry_wait` at `failureAt + 20s` only when that timestamp is before the job deadline. Otherwise it terminalizes.

The second failure always terminalizes. Terminal failure revokes only the matching candidate and applies the cooldown tombstone rules above in the same transaction.

## 8. SMTP Error Classification

`ConfiguredPlatformEmailService` converts Nodemailer and DNS errors into bounded categories without preserving raw response text.

Transient categories:

- SMTP `4xx`
- connection and socket timeouts
- connection reset/refused
- temporary DNS failure such as `EAI_AGAIN`
- temporary network unreachable and broken-pipe failures

Permanent for the current job:

- missing, disabled or undecryptable SMTP configuration
- SMTP authentication failure with `5xx`, including `535`
- SMTP `5xx`
- private, reserved, mixed, empty or invalid DNS answers and `ENOTFOUND`
- certificate, hostname, protocol and required STARTTLS failure
- invalid envelope or message construction
- successful call without the intended recipient accepted
- unclassified errors, handled fail-closed

Admin test-send responses remain sanitized and do not expose these internal categories.

## 9. Encryption And Secret Rotation

Add `PlatformEmailJobPayloadCipher` using AES-256-GCM with a random IV, authentication tag and a distinct derivation context:

```text
IMSWeb platform email delivery job payload v1
```

The root secret remains `IMS_PLATFORM_JWT_SECRET`. The authenticated data binds payload version, job ID, purpose and delivery token, preventing ciphertext movement between jobs or purposes.

Rotation while jobs exist can make at most 60 seconds of queued jobs undecryptable; those jobs fail permanently and users may retry after cooldown. Operations documentation still instructs administrators to avoid root-secret rotation during a deployment cutover.

## 10. Ambiguous SMTP Acceptance

SMTP and PostgreSQL cannot share one atomic transaction. A connection can fail after the server accepted DATA but before the final response reaches Nodemailer.

For a recognized ambiguous network failure:

- record only `acceptance_ambiguous=true`
- do not activate the code
- retry the same encrypted payload once when policy permits
- accept that the same code may arrive twice

If no confirmed success occurs, terminalize and revoke the staged candidate. A late or ambiguous copy may then contain an invalid code; this is part of the explicitly accepted asynchronous failure risk.

## 11. Worker Health And Shutdown

The Worker entrypoint runs a small internal-only Node health server with no published host port:

- liveness reports that the process event loop and runner are alive
- readiness requires completed initialization, recent PostgreSQL polling success and `stopping=false`

SMTP configuration availability and queue backlog do not fail readiness; otherwise a temporary provider outage would cause container restart loops.

On `SIGINT` or `SIGTERM`:

1. readiness becomes false
2. the runner stops claiming jobs
3. active attempts are allowed to settle within the container grace period
4. leases are completed, released or left to expire safely
5. PostgreSQL and the health server close

## 12. Local Runtime And Compose

Add API workspace scripts for Worker development and production start. Root development orchestration starts the API, Worker and Web watchers together and stops them as one lifecycle.

The API runtime also composes the shared Valkey-backed resend-policy cache. The Worker does not need this policy cache because it never decides whether a user may enqueue another request.

Add `email-worker` to `deploy/compose.yaml`:

- same `${IMS_API_IMAGE}` as API
- Worker-specific command
- no published port
- no `api-data` volume
- PostgreSQL dependency only
- Worker-specific healthcheck overriding the image HTTP healthcheck
- `init: true`, restart policy and sufficient stop grace period

Multiple replicas remain safe through lease fencing. Initial deployment uses one replica; scaling does not require schema or code changes.

## 13. Deployment And Rollback

### Release A: expansion

Release A contains:

- additive job migration
- payload cipher and job repository
- complete idle Worker runtime
- Compose and deployment-script Worker lifecycle
- tests and operations documentation

The API remains on synchronous SMTP, so the new queue is empty. Deployment starts and verifies the Worker before declaring the release healthy.

Because IMSWeb rejects migrations unknown to an older image, applying Release A's migration makes the pre-A image unsuitable for automatic code rollback. If Release A fails after migration, recovery must use the Release A image with the API kept on its still-synchronous path, or restore the database through the existing manual production recovery boundary. Preview has no automatic database restore.

### Release B: cutover

Release B has no migration. It changes:

- handlers from synchronous SMTP to transactional enqueue
- queue acknowledgement contracts
- Web success text
- contract and workflow tests

Deployment starts and verifies the Release B Worker before starting the enqueueing API.

If Release B fails, automatic rollback returns to Release A. Release A's Worker understands and drains any jobs created during the candidate window, while its API returns to synchronous delivery. Queue schema and payload version remain compatible across this rollback window.

### Deployment scripts

Production and preview deployment scripts must:

- pull/start Worker and API from the same immutable image
- run migrations before Worker startup
- verify all expected Worker replicas before starting the candidate API
- include Worker state and logs in failure diagnostics
- restore and verify the previous Worker before restoring the previous API
- leave PostgreSQL unchanged during code rollback

## 14. Observability

Emit bounded structured Worker events for:

- claim
- confirmed completion
- retry scheduled
- permanent failure
- supersession
- lease loss
- runner initialization/shutdown failure

Allowed fields are job ID, purpose, attempt number, category, duration and ambiguous-acceptance boolean. Never log recipient email, code, ciphertext, rendered content, SMTP credentials or raw SMTP responses.

No Backoffice queue page or manual retry API is added in this phase.

## 15. Main Risks And Mitigations

| Risk | Mitigation |
| --- | --- |
| Candidate and job diverge | Write both in one transaction |
| Two workers send one claim concurrently | `SKIP LOCKED` plus random lease-token fencing and renewal |
| SMTP accepted but DB update failed | Retry the same encrypted payload; accept duplicate same-code mail |
| Stale worker activates replaced code | Match job state, lease token and candidate delivery token under one transaction |
| A 30-second cooldown ends during an old SMTP attempt | Supersede the running job and candidate; accept that the in-flight old email may arrive with an invalid code |
| Failed resend invalidates old code | Clear only matching pending fields; keep active hash/expiry |
| Frontend cooldown is bypassed | Keep the transactionally persisted PostgreSQL cooldown authoritative and use the returned interval in Web |
| Slow cache refill overwrites a new policy | Compare `updatedAt` atomically in Valkey and reject older writes |
| Valkey update fails after database commit | Fall back to PostgreSQL, bound cache TTL to five seconds and repair on the next miss |
| Queue leaks email/code | Encrypt minimal payload and bind it with AES-GCM authenticated data |
| Provider outage causes restart loop | Exclude SMTP availability from Worker readiness |
| Previous image cannot read new migration | Two-release rollout; Release B rolls back only to Worker-capable Release A |
| Worker process is killed mid-attempt | Stop claims first; bounded grace period; recover through lease expiry |

## 16. Rejected Alternatives

- API process in-process runner: rejected because Worker must be independently deployed and scaled.
- Frontend status polling: rejected by product decision; asynchronous failure is acceptable.
- External Redis/Valkey queue: rejected because PostgreSQL already owns candidate consistency and offers the required transactional outbox boundary.
- Plaintext job payloads: rejected because they would expose email addresses and verification codes at rest.
- Activating the code before SMTP: rejected because users could verify with a code that was never accepted for delivery.
- One-release migration plus cutover: rejected because the previous image would not understand the queue migration or drain newly created jobs.
- A shared persisted-configuration cache abstraction: deferred to the next version. That work will unify Valkey reads, revision synchronization and invalidation for frequently read external-service configuration such as OAuth and full SMTP settings. It is not a business-data dual-write framework. This task keeps the cache port, revision comparison and fallback specific to the email resend policy.
