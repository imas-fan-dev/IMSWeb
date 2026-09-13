import { randomBytes } from 'node:crypto';
import type {
    PlatformEmailDeliveryClaim,
    PlatformEmailDeliveryCompletionResult,
    PlatformEmailDeliveryEnqueueInput,
    PlatformEmailDeliveryEnqueueResult,
    PlatformEmailDeliveryFailureResult,
    PlatformEmailDeliveryPurpose,
    PlatformEmailDeliveryQueue,
    PlatformEmailDeliveryWorkerStore,
} from '@/ports/email-delivery';
import type { ManagedSqlDatabase, SqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne, sqlStatement } from '@/infra/db/sql/query';

const DELIVERY_DEADLINE_MS = 60_000;
const RETRY_DELAY_MS = 20_000;
const REGISTRATION_EXPIRY_MS = 10 * 60_000;
const PASSWORD_RESET_EXPIRY_MS = 15 * 60_000;
const PROVISIONAL_EXPIRY_MARGIN_MS = 2 * 60_000;
const ATTEMPTS_REMAINING = 5;
const HEX_BYTES = 32;

interface ConfigurationRow {
    resend_cooldown_seconds: number;
    updated_at: number;
}

interface VerificationRow {
    normalized_email: string;
    code_hash: string;
    expires_at: number;
    resend_after: number;
    attempts_remaining: number;
    consumed_marker: string | number | null;
    created_at: number;
    updated_at: number;
    delivery_token: string | null;
    pending_token: string | null;
    pending_code_hash: string | null;
    pending_expires_at: number | null;
    pending_resend_after: number | null;
    pending_attempts_remaining: number | null;
    pending_created_at: number | null;
}

interface JobRow {
    id: string;
    purpose: PlatformEmailDeliveryPurpose;
    delivery_token: string;
    payload_ciphertext: string;
    payload_version: number;
    state: string;
    attempts: number;
    next_attempt_at: number;
    deadline_at: number;
    lease_token: string | null;
    lease_expires_at: number | null;
}

function randomToken(): string {
    return randomBytes(HEX_BYTES).toString('hex');
}

function tableFor(purpose: PlatformEmailDeliveryPurpose): string {
    return purpose === 'registration'
        ? 'platform_email_verification_codes'
        : 'platform_password_reset_codes';
}

function expiryFor(purpose: PlatformEmailDeliveryPurpose): number {
    return purpose === 'registration'
        ? REGISTRATION_EXPIRY_MS
        : PASSWORD_RESET_EXPIRY_MS;
}

function verificationSelect(purpose: PlatformEmailDeliveryPurpose): string {
    const consumed = purpose === 'registration'
        ? 'consumed_token'
        : 'consumed_at';
    return `SELECT normalized_email, code_hash, expires_at, resend_after,
                   attempts_remaining, ${consumed} AS consumed_marker,
                   created_at, updated_at, delivery_token, pending_token,
                   pending_code_hash, pending_expires_at, pending_resend_after,
                   pending_attempts_remaining, pending_created_at
            FROM ${tableFor(purpose)}`;
}

function retryAfter(row: VerificationRow, now: number): number {
    if (row.pending_token && row.pending_resend_after !== null) {
        return Math.max(1, row.pending_resend_after - now);
    }
    return Math.max(1, row.resend_after - now);
}

export class SqlPlatformEmailDeliveryRepository
    implements PlatformEmailDeliveryQueue, PlatformEmailDeliveryWorkerStore
{
    constructor(private readonly database: ManagedSqlDatabase) {}

    enqueueRegistration(
        input: PlatformEmailDeliveryEnqueueInput,
    ): Promise<Exclude<PlatformEmailDeliveryEnqueueResult, { status: 'email-not-found' }>> {
        if (input.purpose !== 'registration') {
            throw new Error('Registration delivery purpose is required');
        }
        return this.enqueue(input, false) as Promise<
            Exclude<PlatformEmailDeliveryEnqueueResult, { status: 'email-not-found' }>
        >;
    }

    enqueuePasswordReset(
        input: PlatformEmailDeliveryEnqueueInput,
    ): Promise<PlatformEmailDeliveryEnqueueResult> {
        if (input.purpose !== 'password_reset') {
            throw new Error('Password reset delivery purpose is required');
        }
        return this.enqueue(input, true);
    }

    async claim(input: {
        now: number;
        limit: number;
        leaseDurationMs: number;
    }): Promise<PlatformEmailDeliveryClaim[]> {
        if (!Number.isInteger(input.limit) || input.limit < 1) {
            throw new Error('Invalid platform email delivery claim limit');
        }
        if (!Number.isInteger(input.leaseDurationMs) || input.leaseDurationMs < 1) {
            throw new Error('Invalid platform email delivery lease duration');
        }
        return this.database.transaction(async (transaction) => {
            const candidates = await queryAll<JobRow>(
                transaction,
                `SELECT id, purpose, delivery_token, payload_ciphertext,
                        payload_version, state, attempts, next_attempt_at,
                        deadline_at, lease_token, lease_expires_at
                 FROM platform_email_delivery_jobs
                 WHERE attempts<2 AND deadline_at>? AND (
                    (state IN ('queued', 'retry_wait') AND next_attempt_at<=?)
                    OR (state='running' AND lease_expires_at<=?)
                 )
                 ORDER BY attempts, next_attempt_at, created_at, id
                 FOR UPDATE SKIP LOCKED
                 LIMIT ?`,
                [input.now, input.now, input.now, input.limit],
            );
            const claims: PlatformEmailDeliveryClaim[] = [];
            for (const candidate of candidates) {
                const leaseToken = randomToken();
                const leaseExpiresAt = input.now + input.leaseDurationMs;
                const result = await sqlStatement(
                    transaction,
                    `UPDATE platform_email_delivery_jobs
                     SET state='running', attempts=attempts+1, lease_token=?,
                         lease_expires_at=?, last_attempt_at=?, updated_at=?
                     WHERE id=?
                     RETURNING id, purpose, delivery_token, payload_ciphertext,
                               payload_version, attempts, deadline_at`,
                    [
                        leaseToken,
                        leaseExpiresAt,
                        input.now,
                        input.now,
                        candidate.id,
                    ],
                ).all<JobRow>();
                const claimed = result.results[0];
                if (!claimed) continue;
                claims.push({
                    jobId: claimed.id,
                    purpose: claimed.purpose,
                    deliveryToken: claimed.delivery_token,
                    payloadCiphertext: claimed.payload_ciphertext,
                    payloadVersion: claimed.payload_version,
                    attempts: claimed.attempts,
                    deadlineAt: claimed.deadline_at,
                    leaseToken,
                    leaseExpiresAt,
                });
            }
            return claims;
        });
    }

    async renewLease(input: {
        jobId: string;
        leaseToken: string;
        now: number;
        leaseDurationMs: number;
    }): Promise<boolean> {
        const result = await executeSql(
            this.database,
            `UPDATE platform_email_delivery_jobs
             SET lease_expires_at=?, updated_at=?
             WHERE id=? AND state='running' AND lease_token=?
               AND lease_expires_at>? AND deadline_at>?`,
            [
                input.now + input.leaseDurationMs,
                input.now,
                input.jobId,
                input.leaseToken,
                input.now,
                input.now,
            ],
        );
        return result.meta.changes === 1;
    }

    async complete(input: {
        jobId: string;
        leaseToken: string;
        normalizedEmail: string;
        deliveryToken: string;
        acceptedAt: number;
    }): Promise<PlatformEmailDeliveryCompletionResult> {
        const identity = await this.jobIdentity(input.jobId);
        if (!identity) return 'lease-lost';
        return this.database.transaction(async (transaction) => {
            const aggregate = await this.lockAggregate(
                transaction,
                identity.purpose,
                input.normalizedEmail,
            );
            const job = await this.lockJob(transaction, input.jobId);
            if (!job || job.state === 'superseded') return 'superseded';
            if (
                job.state !== 'running' ||
                job.lease_token !== input.leaseToken ||
                job.delivery_token !== input.deliveryToken
            ) {
                return 'lease-lost';
            }
            const candidateMatches = Boolean(
                aggregate &&
                (aggregate.delivery_token === input.deliveryToken ||
                    aggregate.pending_token === input.deliveryToken),
            );
            if (!candidateMatches) {
                await this.markSuperseded(transaction, input.jobId, input.acceptedAt);
                return 'superseded';
            }
            await this.activateCandidate(
                transaction,
                identity.purpose,
                input.normalizedEmail,
                input.deliveryToken,
                input.acceptedAt,
            );
            await executeSql(
                transaction,
                `UPDATE platform_email_delivery_jobs
                 SET state='completed', lease_token=NULL, lease_expires_at=NULL,
                     accepted_at=?, completed_at=?, failure_category=NULL,
                     updated_at=?
                 WHERE id=? AND state='running' AND lease_token=?`,
                [
                    input.acceptedAt,
                    input.acceptedAt,
                    input.acceptedAt,
                    input.jobId,
                    input.leaseToken,
                ],
            );
            return 'completed';
        });
    }

    async recordFailure(input: {
        jobId: string;
        leaseToken: string;
        failedAt: number;
        category: Parameters<PlatformEmailDeliveryWorkerStore['recordFailure']>[0]['category'];
        transient: boolean;
        acceptanceAmbiguous: boolean;
    }): Promise<PlatformEmailDeliveryFailureResult> {
        const identity = await this.jobIdentity(input.jobId);
        if (!identity) return 'lease-lost';
        const normalizedEmail = await this.findCandidateEmail(identity);
        return this.database.transaction(async (transaction) => {
            const aggregate = normalizedEmail
                ? await this.lockAggregate(
                      transaction,
                      identity.purpose,
                      normalizedEmail,
                  )
                : null;
            const job = await this.lockJob(transaction, input.jobId);
            if (!job || job.state === 'superseded') return 'superseded';
            if (job.state !== 'running' || job.lease_token !== input.leaseToken) {
                return 'lease-lost';
            }
            if (
                !aggregate ||
                !normalizedEmail ||
                (aggregate.delivery_token !== identity.delivery_token &&
                    aggregate.pending_token !== identity.delivery_token)
            ) {
                await this.markSuperseded(transaction, input.jobId, input.failedAt);
                return 'superseded';
            }
            const nextAttemptAt = input.failedAt + RETRY_DELAY_MS;
            if (
                input.transient &&
                job.attempts < 2 &&
                nextAttemptAt < job.deadline_at
            ) {
                await executeSql(
                    transaction,
                    `UPDATE platform_email_delivery_jobs
                     SET state='retry_wait', next_attempt_at=?, lease_token=NULL,
                         lease_expires_at=NULL, failure_category=?,
                         acceptance_ambiguous=acceptance_ambiguous OR ?, updated_at=?
                     WHERE id=? AND state='running' AND lease_token=?`,
                    [
                        nextAttemptAt,
                        input.category,
                        input.acceptanceAmbiguous,
                        input.failedAt,
                        input.jobId,
                        input.leaseToken,
                    ],
                );
                return 'retry-scheduled';
            }
            await this.revokeCandidate(
                transaction,
                identity.purpose,
                normalizedEmail,
                identity.delivery_token,
                input.failedAt,
            );
            await this.markFailed(transaction, job, input);
            return 'failed';
        });
    }

    async failExpired(now: number, limit: number): Promise<number> {
        if (!Number.isInteger(limit) || limit < 1) {
            throw new Error('Invalid platform email expiry batch limit');
        }
        const candidates = await queryAll<{ id: string }>(
            this.database,
            `SELECT id FROM platform_email_delivery_jobs
             WHERE (
                state IN ('queued', 'retry_wait') AND deadline_at<=?
             ) OR (
                state='running' AND deadline_at<=? AND lease_expires_at<=?
             )
             ORDER BY deadline_at, id
             LIMIT ?`,
            [now, now, now, limit],
        );
        let failed = 0;
        for (const candidate of candidates) {
            if (await this.failExpiredJob(candidate.id, now)) failed += 1;
        }
        return failed;
    }

    async deleteTerminal(before: number, limit: number): Promise<number> {
        if (!Number.isInteger(limit) || limit < 1) {
            throw new Error('Invalid platform email retention batch limit');
        }
        const result = await executeSql(
            this.database,
            `DELETE FROM platform_email_delivery_jobs
             WHERE id IN (
                SELECT id FROM platform_email_delivery_jobs
                WHERE state IN ('completed', 'failed', 'superseded')
                  AND updated_at<?
                ORDER BY updated_at, id
                LIMIT ?
             )`,
            [before, limit],
        );
        return result.meta.changes;
    }

    private async enqueue(
        input: PlatformEmailDeliveryEnqueueInput,
        requireAccount: boolean,
    ): Promise<PlatformEmailDeliveryEnqueueResult> {
        return this.database.transaction(async (transaction) => {
            const configuration = await queryOne<ConfigurationRow>(
                transaction,
                `SELECT resend_cooldown_seconds, updated_at
                 FROM platform_email_configuration
                 WHERE singleton_id=1
                 FOR UPDATE`,
            );
            if (!configuration) {
                throw new Error('Platform email configuration is missing');
            }
            if (requireAccount) {
                const account = await queryOne<{ account_id: string }>(
                    transaction,
                    `SELECT account_id FROM platform_email_credentials
                     WHERE normalized_email=?`,
                    [input.normalizedEmail],
                );
                if (!account) {
                    return {
                        status: 'email-not-found',
                        retryAfterSeconds: configuration.resend_cooldown_seconds,
                        policyUpdatedAt: configuration.updated_at,
                    };
                }
            }
            const current = await this.lockAggregate(
                transaction,
                input.purpose,
                input.normalizedEmail,
            );
            const authoritativeResendAfter = current?.pending_token
                ? current.pending_resend_after
                : current?.resend_after;
            if (
                current &&
                authoritativeResendAfter !== null &&
                authoritativeResendAfter !== undefined &&
                authoritativeResendAfter > input.createdAt
            ) {
                return {
                    status: 'cooldown',
                    retryAfterMs: retryAfter(current, input.createdAt),
                };
            }
            const oldToken = current?.pending_token ?? current?.delivery_token;
            if (oldToken) {
                await executeSql(
                    transaction,
                    `UPDATE platform_email_delivery_jobs
                     SET state='superseded', lease_token=NULL, lease_expires_at=NULL,
                         updated_at=?
                     WHERE delivery_token=?
                       AND state IN ('queued', 'running', 'retry_wait')`,
                    [input.createdAt, oldToken],
                );
            }
            const resendAfter =
                input.createdAt + configuration.resend_cooldown_seconds * 1000;
            const provisionalExpiresAt =
                input.createdAt + expiryFor(input.purpose) +
                PROVISIONAL_EXPIRY_MARGIN_MS;
            await this.stageCandidate(
                transaction,
                input,
                current,
                provisionalExpiresAt,
                resendAfter,
            );
            await executeSql(
                transaction,
                `INSERT INTO platform_email_delivery_jobs
                    (id, purpose, delivery_token, payload_ciphertext,
                     payload_version, state, attempts, next_attempt_at,
                     deadline_at, created_at, updated_at)
                 VALUES (?, ?, ?, ?, ?, 'queued', 0, ?, ?, ?, ?)`,
                [
                    input.jobId,
                    input.purpose,
                    input.deliveryToken,
                    input.payloadCiphertext,
                    input.payloadVersion,
                    input.createdAt,
                    input.createdAt + DELIVERY_DEADLINE_MS,
                    input.createdAt,
                    input.createdAt,
                ],
            );
            return {
                status: 'queued',
                resendAfter,
                retryAfterSeconds: configuration.resend_cooldown_seconds,
                policyUpdatedAt: configuration.updated_at,
            };
        });
    }

    private async stageCandidate(
        transaction: SqlDatabase,
        input: PlatformEmailDeliveryEnqueueInput,
        current: VerificationRow | null,
        expiresAt: number,
        resendAfter: number,
    ): Promise<void> {
        const table = tableFor(input.purpose);
        if (!current) {
            const consumedColumn = input.purpose === 'registration'
                ? 'consumed_token'
                : 'consumed_at';
            await executeSql(
                transaction,
                `INSERT INTO ${table}
                    (normalized_email, code_hash, expires_at, resend_after,
                     attempts_remaining, ${consumedColumn}, created_at, updated_at,
                     delivery_token)
                 VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
                [
                    input.normalizedEmail,
                    input.codeHash,
                    expiresAt,
                    resendAfter,
                    ATTEMPTS_REMAINING,
                    input.createdAt,
                    input.createdAt,
                    input.deliveryToken,
                ],
            );
            return;
        }
        if (current.delivery_token || current.consumed_marker !== null) {
            const consumedColumn = input.purpose === 'registration'
                ? 'consumed_token'
                : 'consumed_at';
            await executeSql(
                transaction,
                `UPDATE ${table}
                 SET code_hash=?, expires_at=?, resend_after=?,
                     attempts_remaining=?, ${consumedColumn}=NULL, created_at=?,
                     updated_at=?, delivery_token=?, pending_token=NULL,
                     pending_code_hash=NULL, pending_expires_at=NULL,
                     pending_resend_after=NULL, pending_attempts_remaining=NULL,
                     pending_created_at=NULL
                 WHERE normalized_email=?`,
                [
                    input.codeHash,
                    expiresAt,
                    resendAfter,
                    ATTEMPTS_REMAINING,
                    input.createdAt,
                    input.createdAt,
                    input.deliveryToken,
                    input.normalizedEmail,
                ],
            );
            return;
        }
        await executeSql(
            transaction,
            `UPDATE ${table}
             SET pending_token=?, pending_code_hash=?, pending_expires_at=?,
                 pending_resend_after=?, pending_attempts_remaining=?,
                 pending_created_at=?, updated_at=?
             WHERE normalized_email=?`,
            [
                input.deliveryToken,
                input.codeHash,
                expiresAt,
                resendAfter,
                ATTEMPTS_REMAINING,
                input.createdAt,
                input.createdAt,
                input.normalizedEmail,
            ],
        );
    }

    private async activateCandidate(
        transaction: SqlDatabase,
        purpose: PlatformEmailDeliveryPurpose,
        normalizedEmail: string,
        deliveryToken: string,
        acceptedAt: number,
    ): Promise<void> {
        const table = tableFor(purpose);
        const expiresAt = acceptedAt + expiryFor(purpose);
        const consumedColumn = purpose === 'registration'
            ? 'consumed_token'
            : 'consumed_at';
        await executeSql(
            transaction,
            `UPDATE ${table}
             SET code_hash=CASE WHEN pending_token=? THEN pending_code_hash ELSE code_hash END,
                 expires_at=?,
                 resend_after=CASE WHEN pending_token=? THEN pending_resend_after ELSE resend_after END,
                 attempts_remaining=CASE WHEN pending_token=?
                     THEN pending_attempts_remaining ELSE attempts_remaining END,
                 ${consumedColumn}=NULL,
                 created_at=CASE WHEN pending_token=? THEN pending_created_at ELSE created_at END,
                 updated_at=?, delivery_token=NULL, pending_token=NULL,
                 pending_code_hash=NULL, pending_expires_at=NULL,
                 pending_resend_after=NULL, pending_attempts_remaining=NULL,
                 pending_created_at=NULL
             WHERE normalized_email=?
               AND (delivery_token=? OR pending_token=?)`,
            [
                deliveryToken,
                expiresAt,
                deliveryToken,
                deliveryToken,
                deliveryToken,
                acceptedAt,
                normalizedEmail,
                deliveryToken,
                deliveryToken,
            ],
        );
    }

    private async revokeCandidate(
        transaction: SqlDatabase,
        purpose: PlatformEmailDeliveryPurpose,
        normalizedEmail: string,
        deliveryToken: string,
        failedAt: number,
    ): Promise<void> {
        const table = tableFor(purpose);
        await executeSql(
            transaction,
            `UPDATE ${table}
             SET resend_after=pending_resend_after, pending_token=NULL,
                 pending_code_hash=NULL, pending_expires_at=NULL,
                 pending_resend_after=NULL, pending_attempts_remaining=NULL,
                 pending_created_at=NULL, updated_at=?
             WHERE normalized_email=? AND pending_token=?`,
            [failedAt, normalizedEmail, deliveryToken],
        );
        await executeSql(
            transaction,
            `UPDATE ${table}
             SET delivery_token=NULL, attempts_remaining=0, updated_at=?
             WHERE normalized_email=? AND delivery_token=?`,
            [failedAt, normalizedEmail, deliveryToken],
        );
    }

    private async findCandidateEmail(identity: {
        purpose: PlatformEmailDeliveryPurpose;
        delivery_token: string;
    }): Promise<string | null> {
        return queryOne<{ normalized_email: string }>(
            this.database,
            `SELECT normalized_email FROM ${tableFor(identity.purpose)}
             WHERE delivery_token=? OR pending_token=?`,
            [identity.delivery_token, identity.delivery_token],
        ).then((row) => row?.normalized_email ?? null);
    }

    private lockAggregate(
        transaction: SqlDatabase,
        purpose: PlatformEmailDeliveryPurpose,
        normalizedEmail: string,
    ): Promise<VerificationRow | null> {
        return queryOne<VerificationRow>(
            transaction,
            `${verificationSelect(purpose)}
             WHERE normalized_email=?
             FOR UPDATE`,
            [normalizedEmail],
        );
    }

    private lockJob(transaction: SqlDatabase, jobId: string): Promise<JobRow | null> {
        return queryOne<JobRow>(
            transaction,
            `SELECT id, purpose, delivery_token, payload_ciphertext,
                    payload_version, state, attempts, next_attempt_at,
                    deadline_at, lease_token, lease_expires_at
             FROM platform_email_delivery_jobs
             WHERE id=?
             FOR UPDATE`,
            [jobId],
        );
    }

    private jobIdentity(jobId: string): Promise<JobRow | null> {
        return queryOne<JobRow>(
            this.database,
            `SELECT id, purpose, delivery_token, payload_ciphertext,
                    payload_version, state, attempts, next_attempt_at,
                    deadline_at, lease_token, lease_expires_at
             FROM platform_email_delivery_jobs
             WHERE id=?`,
            [jobId],
        );
    }

    private markSuperseded(
        transaction: SqlDatabase,
        jobId: string,
        updatedAt: number,
    ): Promise<unknown> {
        return executeSql(
            transaction,
            `UPDATE platform_email_delivery_jobs
             SET state='superseded', lease_token=NULL, lease_expires_at=NULL,
                 updated_at=?
             WHERE id=? AND state IN ('queued', 'running', 'retry_wait')`,
            [updatedAt, jobId],
        );
    }

    private markFailed(
        transaction: SqlDatabase,
        job: JobRow,
        input: {
            jobId: string;
            leaseToken: string;
            failedAt: number;
            category: Parameters<PlatformEmailDeliveryWorkerStore['recordFailure']>[0]['category'];
            acceptanceAmbiguous: boolean;
        },
    ): Promise<unknown> {
        return executeSql(
            transaction,
            `UPDATE platform_email_delivery_jobs
             SET state='failed', lease_token=NULL, lease_expires_at=NULL,
                 next_attempt_at=?, failure_category=?,
                 acceptance_ambiguous=acceptance_ambiguous OR ?, failed_at=?,
                 updated_at=?
             WHERE id=? AND state='running' AND lease_token=?`,
            [
                job.next_attempt_at,
                input.category,
                input.acceptanceAmbiguous,
                input.failedAt,
                input.failedAt,
                input.jobId,
                input.leaseToken,
            ],
        );
    }

    private async failExpiredJob(jobId: string, now: number): Promise<boolean> {
        const identity = await this.jobIdentity(jobId);
        if (!identity) return false;
        const normalizedEmail = await this.findCandidateEmail(identity);
        return this.database.transaction(async (transaction) => {
            const aggregate = normalizedEmail
                ? await this.lockAggregate(
                      transaction,
                      identity.purpose,
                      normalizedEmail,
                  )
                : null;
            const job = await this.lockJob(transaction, jobId);
            if (!job) return false;
            const eligible =
                (['queued', 'retry_wait'].includes(job.state) &&
                    job.deadline_at <= now) ||
                (job.state === 'running' &&
                    job.deadline_at <= now &&
                    (job.lease_expires_at ?? Number.POSITIVE_INFINITY) <= now);
            if (!eligible) return false;
            if (
                aggregate &&
                normalizedEmail &&
                (aggregate.delivery_token === job.delivery_token ||
                    aggregate.pending_token === job.delivery_token)
            ) {
                await this.revokeCandidate(
                    transaction,
                    job.purpose,
                    normalizedEmail,
                    job.delivery_token,
                    now,
                );
            }
            await executeSql(
                transaction,
                `UPDATE platform_email_delivery_jobs
                 SET state='failed', lease_token=NULL, lease_expires_at=NULL,
                     failure_category='deadline', failed_at=?, updated_at=?
                 WHERE id=?`,
                [now, now, jobId],
            );
            return true;
        });
    }
}
