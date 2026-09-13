# Platform Email Worker Architecture Research

## Confirmed Existing Behavior

- Registration code issuance is handled by `handlePlatformRegistrationVerification` in `apps/api/src/domains/identity/platform-auth/registration/handlers/send-verification-code.ts`.
- Password-reset issuance is handled by `handlePlatformPasswordResetVerification` in `apps/api/src/domains/identity/platform-auth/password-reset/handlers/reset-password.ts`.
- Both handlers currently issue a staged candidate through `SqlPlatformAccountRepository`, await `ConfiguredPlatformEmailService`, then complete or revoke the candidate inside the HTTP request.
- Registration codes use a 10-minute TTL, 60-second cooldown, and five verification attempts. Password-reset codes use a 15-minute TTL, 60-second cooldown, and five attempts.
- Initial candidates are unusable while `delivery_token` is present. Resends use `pending_*` columns, so the old active code remains usable until the new candidate is promoted.
- `createVerifiedEmailAccount` and `completePasswordReset` consume only delivered, unexpired candidates and perform their domain changes transactionally.
- PostgreSQL remains authoritative for cooldown; Valkey cache entries are best-effort accelerators.
- Unknown password-reset emails return an enumeration-safe `202` without creating a code or email job.

## Existing Code To Reuse

- Verification persistence: `apps/api/src/infra/db/repositories/platform-account-repository.ts`
  - `issueEmailVerification`
  - `completeEmailVerificationDelivery`
  - `revokeEmailVerification`
  - `issuePasswordReset`
  - `completePasswordResetDelivery`
  - `revokePasswordReset`
- Released verification schema:
  - `apps/api/migrations/postgresql/0025_platform_email_verification.sql`
  - `apps/api/migrations/postgresql/0026_platform_email_verification_delivery.sql`
  - `apps/api/migrations/postgresql/20260818000000_platform_password_reset.sql`
- SMTP runtime: `apps/api/src/infra/email/smtp/platform-email-service.ts`
- SMTP credential cipher: `apps/api/src/infra/email/smtp/platform-email-secrets.ts`
- Leased task precedent:
  - `apps/api/src/infra/db/postgresql/object-deletion-worker.ts`
  - `apps/api/src/runtime/node-object-cleanup-runner.ts`
  - `apps/api/migrations/postgresql/20260814170000_object_deletion_jobs.sql`
  - `apps/api/tests/server/object-deletion-worker.test.ts`
  - `apps/api/tests/server/object-deletion-worker-fencing.test.ts`
  - `apps/api/tests/server/object-cleanup-lifecycle.test.ts`
- Runtime and deployment:
  - `apps/api/src/main.ts`
  - `apps/api/src/runtime/node-services.ts`
  - `apps/api/scripts/build/build-server.js`
  - `apps/api/Dockerfile`
  - `apps/api/package.json`
  - `deploy/compose.yaml`
  - `deploy/compose.preview.yaml`
  - `scripts/deployment/deploy-compose-release.sh`
  - `scripts/deployment/deploy-compose-preview.sh`

## Required Transaction Boundaries

### Enqueue

Create a new additive `platform_email_delivery_jobs` table. Issuance must use one PostgreSQL transaction that:

1. Cleans expired verification state using existing bounded cleanup behavior.
2. Inserts or stages the initial/resend verification candidate.
3. Inserts exactly one encrypted delivery job tied to the candidate delivery token.
4. Commits candidate, enqueue-time cooldown, and job atomically.

The HTTP handler must not call SMTP or activate/revoke candidates. After commit it may write the best-effort cache cooldown and return `202`.

### Successful Delivery

After Nodemailer resolves with the intended recipient accepted, one PostgreSQL transaction must:

1. Lock the running job and verify its random lease token.
2. Activate only the registration or password-reset candidate whose delivery token matches the job.
3. Set code expiry from SMTP acceptance time: `acceptedAt + 10m` for registration or `acceptedAt + 15m` for password reset.
4. Preserve the enqueue-based cooldown timestamp.
5. Mark the leased job completed.

If the candidate was consumed, replaced, or removed, mark the job superseded and never recreate verification state.

### Failure

Permanent failure or deadline expiry must atomically terminalize the leased job and revoke only its matching initial/pending candidate. Failed resends must preserve the old active code. A transient first failure retains the candidate and schedules the only retry for 20 seconds later.

## Job Model And Security

Recommended columns:

- identity: `id`, `purpose`, unique `delivery_token`
- encrypted content: `payload_ciphertext`
- scheduling: `state`, `attempts`, `next_attempt_at`, `deadline_at`
- fencing: random `lease_token`, `lease_expires_at`
- bounded diagnostics: `failure_category`, `acceptance_ambiguous`
- lifecycle: `accepted_at`, `completed_at`, `failed_at`, `created_at`, `updated_at`

Do not persist recipient email, verification code, rendered subject/body, SMTP credentials, or raw SMTP responses outside ciphertext. Add a versioned AES-256-GCM payload cipher with a distinct key context such as `IMSWeb platform email delivery job payload v1`. Bind job ID, purpose, and delivery token as authenticated data.

Use a recipient HMAC or the existing verification aggregate for cooldown lookup; do not add plaintext recipient indexes to the job table.

## Lease And Retry Semantics

- Claim through `FOR UPDATE SKIP LOCKED` or one conditional `UPDATE ... RETURNING`.
- Increment attempts on claim.
- Generate a random lease token for every claim and require it for retry, completion, failure, or supersession writes.
- Eligible jobs require `attempts < 2`, `next_attempt_at <= now`, and `now < deadline_at`.
- Deterministic errors fail immediately.
- Transient errors retry once at `failedAt + 20s`, only when another attempt can start before the enqueue-time 60-second deadline.
- Expired leases are reclaimable. Lease duration must exceed the bounded DNS and SMTP operation, or be renewed while sending.
- A cutoff sweeper may terminalize waiting jobs and expired leases after the deadline, but must not revoke an actively owned, unexpired attempt that started before the deadline.

## SMTP Error Classification

`ConfiguredPlatformEmailService.withTransport()` currently collapses transport errors. Introduce a sanitized delivery classification without retaining raw response text.

Transient:

- SMTP `4xx`
- `ETIMEDOUT`, `ESOCKET`, `ECONNECTION`, `ECONNRESET`, `ECONNREFUSED`
- `ENETUNREACH`, `EHOSTUNREACH`, `EPIPE`, `EAI_AGAIN`

Permanent for the current job:

- disabled/missing/undecryptable SMTP configuration
- authentication failure with SMTP `5xx`, including `535`
- SMTP `5xx`
- private/reserved/mixed/empty DNS results and `ENOTFOUND`
- certificate, hostname, protocol, and required STARTTLS failures
- invalid envelope/message construction or a resolved result that does not accept the intended recipient
- unknown unclassified errors, handled fail-closed

SMTP acceptance and PostgreSQL cannot be atomic. If the connection fails after DATA may have been accepted, record only `acceptance_ambiguous=true`, retry the same encrypted payload once, and accept possible duplicate delivery of the same code. Never activate a code without a confirmed Nodemailer success result.

## Independent Worker Runtime

Add a narrow worker factory and compiled entrypoint beside the API runtime. It should initialize only:

- PostgreSQL
- email job repository
- payload cipher
- SMTP configuration repository
- `ConfiguredPlatformEmailService`
- polling runner

It must not initialize HTTP routes, Valkey, S3, static files, image processing, super-admin reconciliation, or object cleanup.

The runner should poll immediately, support bounded concurrency, stop claims on `SIGTERM`, wait for active attempts, and release/recover through lease fencing if the container grace period expires. Expose worker liveness/readiness through a narrow internal health mechanism. SMTP availability and backlog are operational signals, not readiness failures.

## Compose And Deployment

Add an `email-worker` service to `deploy/compose.yaml` using the same immutable API image and a worker-specific command. It needs no host port and no API data volume. Override the image HTTP healthcheck for the worker and give shutdown longer than one bounded attempt.

Deployment scripts must become service-aware:

- start and verify worker before the API that can enqueue jobs
- verify every expected worker replica
- include worker logs in failure diagnostics
- restore and verify the previous worker before restoring the previous API
- preserve expand-only schema and payload compatibility across the rollback window

A safe rollout is staged:

1. Deploy additive migration, idle worker entrypoint/service, worker health support, and deployment-script changes while API remains synchronous.
2. Deploy the API switch to transactional enqueue after the worker is proven ready.
3. Keep queue schema and payload versions backward compatible until rollback targets and old queued payloads are gone.

Automatic deployment rollback is code-only; PostgreSQL is never restored. A one-release cutover would leave the previous image unable to drain newly queued jobs.

## Contracts, Web, And Tests

- Keep request paths unchanged.
- Registration enqueue success becomes `202 { success: true, queued: true, retryAfterSeconds }`, where the server value comes from the Backoffice-managed 30-through-600-second policy and defaults to 60.
- Password-reset enqueue success uses the same payload and configured interval, including enumeration-safe unknown emails.
- Update Web messages in `apps/web/app/pages/account/components/account-auth-form.tsx` and i18n resources to say the request was accepted and the user should wait. Do not add polling.

Primary tests:

- `apps/api/tests/server/platform-email-auth.contract.test.ts`
- `apps/api/tests/server/platform-email-settings.test.ts`
- new focused email-worker repository/runner/fencing/lifecycle tests
- `apps/api/tests/migration/postgres-migrations.test.js`
- `apps/web/tests/unit/pages/account/account-auth-page.test.tsx`
- `apps/web/tests/e2e/platform-auth.spec.ts`
- `tests/test_compose_deployment.py`
- `tests/test_github_deployment.py`

Coverage must include atomic enqueue, plaintext absence, pre-acceptance rejection, post-acceptance activation, old-code preservation, competing workers, stale-owner fencing, lease recovery, deterministic/transient classification, one retry at 20 seconds, two-attempt and 60-second limits, worker-down replacement, ambiguous duplicate delivery, graceful shutdown, worker-first deployment, and rollback behavior.

## Subsequent Resend-Policy Decision

The user later required the resend interval to be dynamically managed in the existing Backoffice email singleton. The interval defaults to 60 seconds and accepts integer values from 30 through 600. PostgreSQL remains authoritative and stores each enqueue's absolute `resend_after`; recipient Valkey entries mirror that committed deadline.

Because the policy is read frequently, API replicas share a Valkey policy cache containing only `resendCooldownSeconds` and the PostgreSQL `updatedAt` revision. A specialized atomic compare-and-set rejects older revisions, closing the stale-refill race that ordinary `GET`/`SET` cache-aside would create. There is no process-local L1 cache and no SMTP credential data in this policy entry. Admin writes update PostgreSQL first and then write through the returned revision. Cache miss, invalid data or synchronization failure falls back to PostgreSQL, and the final enqueue transaction always rereads PostgreSQL before it persists the cooldown.

The user accepted immediate supersession when a configured cooldown shorter than 60 seconds ends during an old SMTP attempt. The new enqueue transaction replaces the old job and staged candidate, including a `running` job. The old SMTP operation may still deliver an email, but its state, lease token and candidate token no longer authorize activation. A superseded resend leaves the earlier active code unchanged.

A shared cache for frequently read, persisted external-service configuration is deferred to the next version. That scope includes OAuth and full SMTP settings, with Valkey revision synchronization and invalidation against PostgreSQL; it is not a business-data dual-write framework. The current task implements only the email resend policy's narrow cache port, revision-aware Valkey write and PostgreSQL fallback.
