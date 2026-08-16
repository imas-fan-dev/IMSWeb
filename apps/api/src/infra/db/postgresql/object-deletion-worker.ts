import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import type { ObjectDeletionWorker, ObjectStorage } from '@/ports/object-storage';

interface ObjectDeletionJobRow {
    id: string;
    target_kind: string;
    target: string;
    attempts: number;
}

export interface PostgresqlObjectDeletionWorkerOptions {
    now?: () => number;
    maxAttempts?: number;
    completedRetentionMs?: number;
    sweepIntervalMs?: number;
}

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_COMPLETED_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 60 * 60 * 1000;
const LEASE_MS = 5 * 60 * 1000;

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

function deletionPrefix(value: string): string {
    if (
        !value.endsWith('/') || value.startsWith('/') || value.includes('\\') ||
        value.split('/').some((segment) => segment === '.' || segment === '..')
    ) {
        throw new Error('Invalid object deletion prefix');
    }
    return value;
}

export class PostgresqlObjectDeletionWorker implements ObjectDeletionWorker {
    private readonly now: () => number;
    private readonly maxAttempts: number;
    private readonly completedRetentionMs: number;
    private readonly sweepIntervalMs: number;
    private nextSweepAt = 0;
    private running?: Promise<void>;

    constructor(
        private readonly database: ManagedSqlDatabase,
        private readonly storage: ObjectStorage,
        options: PostgresqlObjectDeletionWorkerOptions = {}
    ) {
        this.now = options.now ?? Date.now;
        this.maxAttempts = options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
        this.completedRetentionMs = options.completedRetentionMs ??
            DEFAULT_COMPLETED_RETENTION_MS;
        this.sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
        if (!Number.isInteger(this.maxAttempts) || this.maxAttempts < 1) {
            throw new Error('Invalid object deletion max attempts');
        }
        if (this.completedRetentionMs < 0 || this.sweepIntervalMs < 0) {
            throw new Error('Invalid object deletion retention');
        }
    }

    run(limit = 10): Promise<void> {
        if (this.running) return this.running;
        this.running = this.runExclusive(limit).finally(() => {
            this.running = undefined;
        });
        return this.running;
    }

    async retryQuarantined(jobId: string): Promise<boolean> {
        const now = this.now();
        const released = await this.database.prepare(
            `UPDATE object_deletion_jobs
             SET state='pending', attempts=0, last_error=NULL, next_attempt_at=?,
                 lease_expires_at=NULL, quarantined_at=NULL, updated_at=?
             WHERE id=? AND quarantined_at IS NOT NULL`
        ).bind(now, now, jobId).run();
        return released.meta.changes === 1;
    }

    private async sweepCompleted(now: number): Promise<void> {
        if (now < this.nextSweepAt) return;
        await this.database.prepare(
            `DELETE FROM object_deletion_jobs WHERE id IN (
                SELECT id FROM object_deletion_jobs
                WHERE state='completed' AND completed_at<?
                ORDER BY completed_at, id LIMIT 1000
             )`
        ).bind(now - this.completedRetentionMs).run();
        this.nextSweepAt = now + this.sweepIntervalMs;
    }

    private async runExclusive(limit: number): Promise<void> {
        if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid deletion limit');
        const now = this.now();
        await this.sweepCompleted(now);
        const candidates = await this.database.prepare(
            `SELECT id, target_kind, target, attempts FROM object_deletion_jobs
             WHERE quarantined_at IS NULL AND (
                (state IN ('pending', 'failed') AND COALESCE(next_attempt_at, created_at)<=?)
                OR (state='running' AND COALESCE(lease_expires_at, updated_at + ?)<=?)
             )
             ORDER BY attempts, COALESCE(next_attempt_at, created_at), created_at, id
             LIMIT ?`
        ).bind(now, LEASE_MS, now, limit).all<ObjectDeletionJobRow>();
        for (const job of candidates.results) await this.runJob(job, now);
    }

    private async runJob(job: ObjectDeletionJobRow, now: number): Promise<void> {
        const leaseExpiresAt = now + LEASE_MS;
        const claimed = await this.database.prepare(
            `UPDATE object_deletion_jobs
             SET state='running', attempts=attempts+1, lease_expires_at=?, updated_at=?
             WHERE id=? AND quarantined_at IS NULL AND (
                (state IN ('pending', 'failed') AND COALESCE(next_attempt_at, created_at)<=?)
                OR (state='running' AND COALESCE(lease_expires_at, updated_at + ?)<=?)
             )`
        ).bind(leaseExpiresAt, now, job.id, now, LEASE_MS, now).run();
        if (claimed.meta.changes !== 1) return;
        try {
            if (job.target_kind !== 'prefix') {
                throw new Error(`Unsupported object deletion target: ${job.target_kind}`);
            }
            await this.storage.deletePrefix(deletionPrefix(job.target));
            const completedAt = this.now();
            await this.database.prepare(
                `UPDATE object_deletion_jobs
                 SET state='completed', last_error=NULL, next_attempt_at=NULL,
                     lease_expires_at=NULL, completed_at=?, updated_at=?
                 WHERE id=? AND state='running' AND lease_expires_at=?`
            ).bind(completedAt, completedAt, job.id, leaseExpiresAt).run();
        } catch (error) {
            const attempts = job.attempts + 1;
            const failedAt = this.now();
            const retryMilliseconds = Math.min(
                3_600_000,
                (2 ** (attempts - 1)) * 1000
            );
            await this.database.prepare(
                `UPDATE object_deletion_jobs
                 SET state='failed', last_error=?, lease_expires_at=NULL,
                     next_attempt_at=?, quarantined_at=?, updated_at=?
                 WHERE id=? AND state='running' AND lease_expires_at=?`
            ).bind(
                errorMessage(error),
                attempts >= this.maxAttempts ? null : failedAt + retryMilliseconds,
                attempts >= this.maxAttempts ? failedAt : null,
                failedAt,
                job.id,
                leaseExpiresAt
            ).run();
        }
    }
}
