import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import type { TestContext } from 'node:test';
import { SqlPlatformAccountRepository } from '@/infra/db/repositories/platform-account-repository';
import { SqlPlatformEmailDeliveryRepository } from '@/infra/db/repositories/platform-email-delivery-repository';
import { PlatformEmailJobPayloadCipherAdapter } from '@/infra/email/smtp/platform-email-job-payload';
import type { ManagedSqlDatabase, SqlSchemaStrategy } from '@/infra/db/sql/database';
import { queryAll, queryOne } from '@/infra/db/sql/query';
import type {
    PlatformEmailDeliveryEnqueueInput,
    PlatformEmailDeliveryPurpose,
} from '@/ports/email-delivery';
import type {
    NewPlatformEmailAccountInput,
    NewVerifiedPlatformEmailAccountInput,
} from '@/ports/repositories/platform';
import {
    connectPostgresTestDatabase,
    createPostgresTestDatabase,
    postgresTest as test,
} from './postgres-test-database';

const SECRET = 'platform-email-delivery-repository-test-secret-0123456789';
const cipher = new PlatformEmailJobPayloadCipherAdapter(SECRET);
const initializedSchema: SqlSchemaStrategy = {
    initializeCore: async () => undefined,
    initializePlatform: async () => undefined,
    initializeFudaba: async () => undefined,
    initializeStory: async () => undefined,
};

interface DeliveryFixture {
    input: PlatformEmailDeliveryEnqueueInput;
    code: string;
}

interface JobState {
    state: string;
    attempts: number;
    next_attempt_at: number;
    deadline_at: number;
    lease_token: string | null;
    lease_expires_at: number | null;
    failure_category: string | null;
    acceptance_ambiguous: boolean;
    updated_at: number;
}

interface VerificationState {
    code_hash: string;
    expires_at: number;
    resend_after: number;
    attempts_remaining: number;
    delivery_token: string | null;
    pending_token: string | null;
    pending_code_hash: string | null;
    pending_resend_after: number | null;
}

function hash(value: string): string {
    return createHash('sha256').update(value).digest('hex');
}

function delivery(
    purpose: PlatformEmailDeliveryPurpose,
    email: string,
    marker: string,
    createdAt: number,
): DeliveryFixture {
    const code = String(100000 + Number.parseInt(hash(marker).slice(0, 5), 16) % 900000);
    const identity = {
        jobId: hash(`job:${marker}`),
        purpose,
        deliveryToken: hash(`delivery:${marker}`),
        payloadVersion: 1,
    } as const;
    const prepared = purpose === 'registration'
        ? cipher.encrypt(identity, {
              purpose: 'registration',
              normalizedEmail: email,
              code,
              expiresInMinutes: 10,
          })
        : cipher.encrypt(identity, {
              purpose: 'password_reset',
              normalizedEmail: email,
              code,
              expiresInMinutes: 15,
          });
    return {
        code,
        input: {
            ...prepared,
            codeHash: hash(code),
            createdAt,
        },
    };
}

function emailAccount(email: string, now: number): NewPlatformEmailAccountInput {
    return {
        id: randomUUID(),
        status: 'active',
        tokenVersion: 0,
        createdAt: now,
        updatedAt: now,
        deletedAt: null,
        profile: {
            displayName: 'Email delivery test',
            avatarObjectKey: null,
            avatarExternalUrl: null,
            homeCity: null,
            bio: '',
            updatedAt: now,
        },
        credential: {
            normalizedEmail: email,
            algorithm: 'bcrypt',
            parametersJson: '{"cost":12}',
            passwordHash: hash(`password:${email}`),
            createdAt: now,
            updatedAt: now,
        },
    };
}

function verifiedAccount(
    fixture: DeliveryFixture,
    verifiedAt: number,
): NewVerifiedPlatformEmailAccountInput {
    return {
        ...emailAccount(fixture.input.normalizedEmail, verifiedAt),
        verification: {
            codeHash: fixture.input.codeHash,
            consumedToken: hash(`consume:${fixture.input.jobId}`),
            verifiedAt,
        },
    };
}

function jobState(
    database: ManagedSqlDatabase,
    jobId: string,
): Promise<JobState | null> {
    return queryOne<JobState>(
        database,
        `SELECT state, attempts, next_attempt_at, deadline_at, lease_token,
                lease_expires_at, failure_category, acceptance_ambiguous, updated_at
         FROM platform_email_delivery_jobs WHERE id=?`,
        [jobId],
    );
}

function verificationState(
    database: ManagedSqlDatabase,
    purpose: PlatformEmailDeliveryPurpose,
    email: string,
): Promise<VerificationState | null> {
    const table = purpose === 'registration'
        ? 'platform_email_verification_codes'
        : 'platform_password_reset_codes';
    return queryOne<VerificationState>(
        database,
        `SELECT code_hash, expires_at, resend_after, attempts_remaining,
                delivery_token, pending_token, pending_code_hash,
                pending_resend_after
         FROM ${table} WHERE normalized_email=?`,
        [email],
    );
}

async function claimOne(
    repository: SqlPlatformEmailDeliveryRepository,
    now: number,
    leaseDurationMs = 15_000,
) {
    const claims = await repository.claim({ now, limit: 1, leaseDurationMs });
    assert.equal(claims.length, 1);
    return claims[0];
}

async function useDatabase(t: TestContext, label: string) {
    const database = await createPostgresTestDatabase(t, label);
    return {
        database,
        repository: new SqlPlatformEmailDeliveryRepository(database),
        accountRepository: new SqlPlatformAccountRepository(database, initializedSchema),
    };
}

test('registration enqueue is atomic, encrypted, and unusable until delivery completes', async (t) => {
    const { database, repository, accountRepository } = await useDatabase(
        t,
        'email-delivery-registration',
    );
    const initial = delivery(
        'registration',
        'registration@example.test',
        'registration-initial',
        10_000,
    );
    const queued = await repository.enqueueRegistration(initial.input);
    assert.deepEqual(queued, {
        status: 'queued',
        resendAfter: 70_000,
        retryAfterSeconds: 60,
        policyUpdatedAt: 0,
    });

    const storedJob = await queryOne<{
        payload_ciphertext: string;
        purpose: string;
        state: string;
    }>(
        database,
        `SELECT payload_ciphertext, purpose, state
         FROM platform_email_delivery_jobs WHERE id=?`,
        [initial.input.jobId],
    );
    assert.ok(storedJob);
    assert.equal(storedJob.purpose, 'registration');
    assert.equal(storedJob.state, 'queued');
    const serializedJob = JSON.stringify(storedJob);
    assert.equal(serializedJob.includes(initial.input.normalizedEmail), false);
    assert.equal(serializedJob.includes(initial.code), false);

    assert.equal(
        (await accountRepository.createVerifiedEmailAccount(
            verifiedAccount(initial, 11_000),
        )).status,
        'verification-invalid',
    );

    const claim = await claimOne(repository, 12_000);
    assert.equal(
        await repository.complete({
            jobId: claim.jobId,
            leaseToken: claim.leaseToken,
            normalizedEmail: initial.input.normalizedEmail,
            deliveryToken: claim.deliveryToken,
            acceptedAt: 13_000,
        }),
        'completed',
    );
    assert.deepEqual(
        await verificationState(
            database,
            'registration',
            initial.input.normalizedEmail,
        ),
        {
            code_hash: initial.input.codeHash,
            expires_at: 613_000,
            resend_after: 70_000,
            attempts_remaining: 5,
            delivery_token: null,
            pending_token: null,
            pending_code_hash: null,
            pending_resend_after: null,
        },
    );
    assert.equal(
        (await accountRepository.createVerifiedEmailAccount(
            verifiedAccount(initial, 14_000),
        )).status,
        'created',
    );
    assert.equal(
        await verificationState(
            database,
            'registration',
            initial.input.normalizedEmail,
        ),
        null,
    );

    const rollback = delivery(
        'registration',
        'rollback@example.test',
        'registration-rollback',
        20_000,
    );
    const duplicateJob = {
        ...rollback.input,
        jobId: initial.input.jobId,
    };
    await assert.rejects(repository.enqueueRegistration(duplicateJob));
    assert.equal(
        await verificationState(
            database,
            'registration',
            rollback.input.normalizedEmail,
        ),
        null,
    );
});

test('password reset activation uses acceptance time and remains unusable while queued', async (t) => {
    const { database, repository, accountRepository } = await useDatabase(
        t,
        'email-delivery-password-reset',
    );
    const email = 'password-reset@example.test';
    const account = emailAccount(email, 1_000);
    assert.equal((await accountRepository.createEmailAccount(account)).status, 'created');
    const reset = delivery('password_reset', email, 'password-reset-initial', 2_000);
    assert.equal((await repository.enqueuePasswordReset(reset.input)).status, 'queued');

    const resetInput = {
        normalizedEmail: email,
        codeHash: reset.input.codeHash,
        passwordHash: hash('replacement-password'),
        parametersJson: '{"cost":12}',
        updatedAt: 3_000,
        event: {
            id: randomUUID(),
            accountId: account.id,
            eventType: 'auth.password_reset.completed' as const,
            requestId: null,
            ipAddress: null,
            userAgent: null,
            metadataJson: '{}',
            createdAt: 3_000,
        },
    };
    assert.equal((await accountRepository.completePasswordReset(resetInput)).status, 'invalid');

    const claim = await claimOne(repository, 4_000);
    assert.equal(
        await repository.complete({
            jobId: claim.jobId,
            leaseToken: claim.leaseToken,
            normalizedEmail: email,
            deliveryToken: claim.deliveryToken,
            acceptedAt: 5_000,
        }),
        'completed',
    );
    assert.equal(
        (await verificationState(database, 'password_reset', email))?.expires_at,
        905_000,
    );
    assert.equal(
        (await accountRepository.completePasswordReset({
            ...resetInput,
            updatedAt: 6_000,
            event: { ...resetInput.event, createdAt: 6_000 },
        })).status,
        'completed',
    );
});

test('failed resend preserves the active code and missing candidates never retry', async (t) => {
    const { database, repository } = await useDatabase(t, 'email-delivery-failure');
    const email = 'resend@example.test';
    const initial = delivery('registration', email, 'resend-active', 1_000);
    await repository.enqueueRegistration(initial.input);
    const initialClaim = await claimOne(repository, 2_000);
    await repository.complete({
        jobId: initialClaim.jobId,
        leaseToken: initialClaim.leaseToken,
        normalizedEmail: email,
        deliveryToken: initialClaim.deliveryToken,
        acceptedAt: 3_000,
    });
    const active = await verificationState(database, 'registration', email);
    assert.ok(active);

    const resend = delivery('registration', email, 'resend-failed', 61_001);
    await repository.enqueueRegistration(resend.input);
    const resendClaim = await claimOne(repository, 62_000);
    assert.equal(
        await repository.recordFailure({
            jobId: resendClaim.jobId,
            leaseToken: resendClaim.leaseToken,
            failedAt: 63_000,
            category: 'authentication',
            transient: false,
            acceptanceAmbiguous: false,
        }),
        'failed',
    );
    const afterFailure = await verificationState(database, 'registration', email);
    assert.ok(afterFailure);
    assert.equal(afterFailure.code_hash, active.code_hash);
    assert.equal(afterFailure.expires_at, active.expires_at);
    assert.equal(afterFailure.attempts_remaining, active.attempts_remaining);
    assert.equal(afterFailure.delivery_token, null);
    assert.equal(afterFailure.pending_token, null);
    assert.equal(afterFailure.resend_after, 121_001);

    const missing = delivery(
        'registration',
        'missing-candidate@example.test',
        'missing-candidate',
        100_000,
    );
    await repository.enqueueRegistration(missing.input);
    const missingClaim = await claimOne(repository, 101_000);
    await database.prepare(
        'DELETE FROM platform_email_verification_codes WHERE normalized_email=?',
    ).bind(missing.input.normalizedEmail).run();
    assert.equal(
        await repository.recordFailure({
            jobId: missingClaim.jobId,
            leaseToken: missingClaim.leaseToken,
            failedAt: 102_000,
            category: 'network',
            transient: true,
            acceptanceAmbiguous: true,
        }),
        'superseded',
    );
    assert.deepEqual(
        await jobState(database, missing.input.jobId),
        {
            state: 'superseded',
            attempts: 1,
            next_attempt_at: 100_000,
            deadline_at: 160_000,
            lease_token: null,
            lease_expires_at: null,
            failure_category: null,
            acceptance_ambiguous: false,
            updated_at: 102_000,
        },
    );
});

test('competing claims, lease expiry, renewal, and stale owners are fenced', async (t) => {
    const { database, repository } = await useDatabase(t, 'email-delivery-leases');
    const siblingDatabase = connectPostgresTestDatabase(t, database);
    const sibling = new SqlPlatformEmailDeliveryRepository(siblingDatabase);
    const queued = delivery(
        'registration',
        'claims@example.test',
        'claims-competing',
        1_000,
    );
    await repository.enqueueRegistration(queued.input);

    const claims = (await Promise.all([
        repository.claim({ now: 2_000, limit: 1, leaseDurationMs: 1_000 }),
        sibling.claim({ now: 2_000, limit: 1, leaseDurationMs: 1_000 }),
    ])).flat();
    assert.equal(claims.length, 1);
    const first = claims[0];
    assert.equal(
        await repository.renewLease({
            jobId: first.jobId,
            leaseToken: first.leaseToken,
            now: 2_500,
            leaseDurationMs: 1_000,
        }),
        true,
    );
    assert.equal(
        await repository.renewLease({
            jobId: first.jobId,
            leaseToken: first.leaseToken,
            now: 3_500,
            leaseDurationMs: 1_000,
        }),
        false,
    );

    const second = await claimOne(sibling, 3_501, 1_000);
    assert.equal(second.attempts, 2);
    assert.equal(
        await repository.complete({
            jobId: first.jobId,
            leaseToken: first.leaseToken,
            normalizedEmail: queued.input.normalizedEmail,
            deliveryToken: first.deliveryToken,
            acceptedAt: 3_600,
        }),
        'lease-lost',
    );
    assert.equal(
        await sibling.complete({
            jobId: second.jobId,
            leaseToken: second.leaseToken,
            normalizedEmail: queued.input.normalizedEmail,
            deliveryToken: second.deliveryToken,
            acceptedAt: 3_700,
        }),
        'completed',
    );

    const deadline = delivery(
        'registration',
        'deadline-renewal@example.test',
        'deadline-renewal',
        100_000,
    );
    await repository.enqueueRegistration(deadline.input);
    const deadlineClaim = await claimOne(repository, 100_001, 120_000);
    assert.equal(
        await repository.renewLease({
            jobId: deadlineClaim.jobId,
            leaseToken: deadlineClaim.leaseToken,
            now: 160_000,
            leaseDurationMs: 1_000,
        }),
        false,
    );
});

test('retry, attempt, deadline, expiry, and retention limits are enforced', async (t) => {
    const { database, repository } = await useDatabase(t, 'email-delivery-retry');
    const retry = delivery('registration', 'retry@example.test', 'retry-job', 1_000);
    await repository.enqueueRegistration(retry.input);
    const first = await claimOne(repository, 2_000);
    assert.equal(
        await repository.recordFailure({
            jobId: first.jobId,
            leaseToken: first.leaseToken,
            failedAt: 3_000,
            category: 'network',
            transient: true,
            acceptanceAmbiguous: true,
        }),
        'retry-scheduled',
    );
    assert.equal((await repository.claim({
        now: 22_999,
        limit: 1,
        leaseDurationMs: 1_000,
    })).length, 0);
    const second = await claimOne(repository, 23_000, 1_000);
    assert.equal(second.attempts, 2);
    assert.equal(
        await repository.recordFailure({
            jobId: second.jobId,
            leaseToken: second.leaseToken,
            failedAt: 24_000,
            category: 'smtp_transient',
            transient: true,
            acceptanceAmbiguous: false,
        }),
        'failed',
    );
    assert.equal((await jobState(database, retry.input.jobId))?.failure_category, 'smtp_transient');

    const tooLate = delivery(
        'registration',
        'late-retry@example.test',
        'late-retry-job',
        100_000,
    );
    await repository.enqueueRegistration(tooLate.input);
    const lateClaim = await claimOne(repository, 140_000, 30_000);
    assert.equal(
        await repository.recordFailure({
            jobId: lateClaim.jobId,
            leaseToken: lateClaim.leaseToken,
            failedAt: 145_000,
            category: 'network',
            transient: true,
            acceptanceAmbiguous: false,
        }),
        'failed',
    );

    const expired = delivery(
        'registration',
        'expired@example.test',
        'expired-job',
        200_000,
    );
    await repository.enqueueRegistration(expired.input);
    assert.equal(await repository.failExpired(260_000, 1), 1);
    assert.equal((await jobState(database, expired.input.jobId))?.failure_category, 'deadline');
    assert.equal(
        (await verificationState(
            database,
            'registration',
            expired.input.normalizedEmail,
        ))?.attempts_remaining,
        0,
    );

    assert.equal(await repository.deleteTerminal(200_001, 2), 2);
    const terminal = await queryAll<{ id: string }>(
        database,
        `SELECT id FROM platform_email_delivery_jobs
         WHERE state IN ('completed', 'failed', 'superseded')`,
    );
    assert.equal(terminal.length, 1);
});

test('a 30-second policy supersedes queued, retrying, and running deliveries', async (t) => {
    const { database, repository } = await useDatabase(t, 'email-delivery-supersession');
    await database.prepare(
        `UPDATE platform_email_configuration
         SET resend_cooldown_seconds=30, updated_at=1 WHERE singleton_id=1`,
    ).run();

    for (const [state, base] of [
        ['queued', 1_000],
        ['retry_wait', 100_000],
        ['running', 200_000],
    ] as const) {
        const email = `${state}@example.test`;
        const oldDelivery = delivery('registration', email, `${state}:old`, base);
        await repository.enqueueRegistration(oldDelivery.input);
        let oldClaim;
        if (state !== 'queued') {
            oldClaim = await claimOne(repository, base + 100, 60_000);
        }
        if (state === 'retry_wait') {
            assert.equal(
                await repository.recordFailure({
                    jobId: oldClaim!.jobId,
                    leaseToken: oldClaim!.leaseToken,
                    failedAt: base + 200,
                    category: 'network',
                    transient: true,
                    acceptanceAmbiguous: false,
                }),
                'retry-scheduled',
            );
        }
        const replacement = delivery(
            'registration',
            email,
            `${state}:replacement`,
            base + 30_001,
        );
        assert.equal(
            (await repository.enqueueRegistration(replacement.input)).status,
            'queued',
        );
        assert.equal((await jobState(database, oldDelivery.input.jobId))?.state, 'superseded');
        assert.equal(
            (await verificationState(database, 'registration', email))?.delivery_token,
            replacement.input.deliveryToken,
        );
        if (state === 'running') {
            assert.equal(
                await repository.complete({
                    jobId: oldClaim!.jobId,
                    leaseToken: oldClaim!.leaseToken,
                    normalizedEmail: email,
                    deliveryToken: oldClaim!.deliveryToken,
                    acceptedAt: base + 30_002,
                }),
                'superseded',
            );
        }
    }
});

test('completion-first and supersession-first ordering preserve the intended candidate', async (t) => {
    const { database, repository } = await useDatabase(t, 'email-delivery-ordering');
    await database.prepare(
        'UPDATE platform_email_configuration SET resend_cooldown_seconds=30 WHERE singleton_id=1',
    ).run();

    const completionEmail = 'completion-first@example.test';
    const completed = delivery(
        'registration',
        completionEmail,
        'completion-first:old',
        1_000,
    );
    await repository.enqueueRegistration(completed.input);
    const completedClaim = await claimOne(repository, 2_000);
    await repository.complete({
        jobId: completedClaim.jobId,
        leaseToken: completedClaim.leaseToken,
        normalizedEmail: completionEmail,
        deliveryToken: completedClaim.deliveryToken,
        acceptedAt: 3_000,
    });
    const completionReplacement = delivery(
        'registration',
        completionEmail,
        'completion-first:new',
        31_001,
    );
    await repository.enqueueRegistration(completionReplacement.input);
    const completionState = await verificationState(
        database,
        'registration',
        completionEmail,
    );
    assert.ok(completionState);
    assert.equal(completionState.code_hash, completed.input.codeHash);
    assert.equal(completionState.pending_token, completionReplacement.input.deliveryToken);
    assert.equal((await jobState(database, completed.input.jobId))?.state, 'completed');

    const supersessionEmail = 'supersession-first@example.test';
    const active = delivery(
        'registration',
        supersessionEmail,
        'supersession-first:active',
        100_000,
    );
    await repository.enqueueRegistration(active.input);
    const activeClaim = await claimOne(repository, 101_000);
    await repository.complete({
        jobId: activeClaim.jobId,
        leaseToken: activeClaim.leaseToken,
        normalizedEmail: supersessionEmail,
        deliveryToken: activeClaim.deliveryToken,
        acceptedAt: 102_000,
    });
    const runningResend = delivery(
        'registration',
        supersessionEmail,
        'supersession-first:running',
        130_001,
    );
    await repository.enqueueRegistration(runningResend.input);
    const runningClaim = await claimOne(repository, 130_100, 60_000);
    const replacement = delivery(
        'registration',
        supersessionEmail,
        'supersession-first:replacement',
        160_002,
    );
    await repository.enqueueRegistration(replacement.input);
    assert.equal(
        await repository.complete({
            jobId: runningClaim.jobId,
            leaseToken: runningClaim.leaseToken,
            normalizedEmail: supersessionEmail,
            deliveryToken: runningClaim.deliveryToken,
            acceptedAt: 160_003,
        }),
        'superseded',
    );
    const supersessionState = await verificationState(
        database,
        'registration',
        supersessionEmail,
    );
    assert.ok(supersessionState);
    assert.equal(supersessionState.code_hash, active.input.codeHash);
    assert.equal(supersessionState.pending_token, replacement.input.deliveryToken);
});
