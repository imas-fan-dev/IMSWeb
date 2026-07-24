import crypto from 'node:crypto';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import type { CompensationService, ObjectStorage } from '@/ports/object-storage';
import { S3UploadStateMachine } from '@/infra/oss/s3/upload-state-machine';

interface CompensationRow {
    id: string;
    kind: string;
    payload_json: string;
    attempts: number;
}

export type S3PhysicalObjectDelete = (objectId: string) => Promise<void>;

const MAX_ATTEMPTS = 5;

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

export class S3CompensationService implements CompensationService {
    private running?: Promise<void>;

    constructor(
        private readonly database: ManagedSqlDatabase,
        private readonly state: S3UploadStateMachine,
        private readonly deletePhysicalObject: S3PhysicalObjectDelete
    ) {}

    async enqueue(kind: string, payload: unknown, error?: unknown): Promise<string> {
        let persistedPayload = payload;
        if (kind === 'delete-object' && payload && typeof payload === 'object') {
            const key = (payload as { key?: unknown }).key;
            if (typeof key === 'string' && key) {
                const objectId = await this.state.currentObjectId(key);
                if (objectId) persistedPayload = { ...payload, objectId };
            }
        }
        const id = crypto.randomUUID();
        const now = Date.now();
        await this.database.prepare(
            `INSERT INTO s3_compensation_jobs
                (id, kind, payload_json, state, attempts, last_error,
                 next_attempt_at, created_at, updated_at)
             VALUES (?, ?, ?, 'pending', 0, ?, ?, ?, ?)`
        ).bind(
            id,
            kind,
            JSON.stringify(persistedPayload),
            error === undefined ? null : message(error),
            now,
            now,
            now
        ).run();
        return id;
    }

    run(storage: ObjectStorage, limit = 10): Promise<void> {
        if (this.running) return this.running;
        this.running = this.runExclusive(storage, limit).finally(() => {
            this.running = undefined;
        });
        return this.running;
    }

    private async runExclusive(storage: ObjectStorage, limit: number): Promise<void> {
        if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid compensation limit');
        await storage.recoverStaleUploads?.(limit);
        const now = Date.now();
        const candidates = await this.database.prepare(
            `SELECT id, kind, payload_json, attempts FROM s3_compensation_jobs
             WHERE quarantined_at IS NULL AND (
                (state IN ('pending', 'failed') AND COALESCE(next_attempt_at, created_at) <= ?)
                OR (state='running' AND COALESCE(lease_expires_at, updated_at + 300000) <= ?)
             )
             ORDER BY attempts, COALESCE(next_attempt_at, created_at), created_at, id LIMIT ?`
        ).bind(now, now, limit).all<CompensationRow>();
        for (const job of candidates.results) await this.runJob(storage, job, now);
    }

    private async runJob(storage: ObjectStorage, job: CompensationRow, now: number): Promise<void> {
        const claimed = await this.database.prepare(
            `UPDATE s3_compensation_jobs
             SET state='running', attempts=attempts+1, lease_expires_at=?, updated_at=?
             WHERE id=? AND quarantined_at IS NULL AND (
                (state IN ('pending', 'failed') AND COALESCE(next_attempt_at, created_at) <= ?)
                OR (state='running' AND COALESCE(lease_expires_at, updated_at + 300000) <= ?)
             )`
        ).bind(now + 300_000, now, job.id, now, now).run();
        if (claimed.meta.changes !== 1) return;
        try {
            const payload = JSON.parse(job.payload_json) as {
                key?: unknown;
                objectId?: unknown;
            };
            if (job.kind === 'delete-object') {
                if (typeof payload.key !== 'string' || !payload.key) {
                    throw new Error('Invalid object key');
                }
                if (typeof payload.objectId === 'string' && payload.objectId) {
                    if (!storage.deleteIfObjectId) {
                        throw new Error('Version-fenced object deletion is unavailable');
                    }
                    await storage.deleteIfObjectId(payload.key, payload.objectId);
                } else {
                    await storage.delete(payload.key);
                }
            } else if (job.kind === 'delete-s3-object') {
                if (typeof payload.objectId !== 'string' || !payload.objectId) {
                    throw new Error('Invalid S3 object ID');
                }
                if (!await this.state.isObjectReferenced(payload.objectId)) {
                    await this.deletePhysicalObject(payload.objectId);
                    await this.state.removeVersionIfUnreferenced(payload.objectId);
                }
            } else {
                throw new Error(`Unsupported compensation: ${job.kind}`);
            }
            await this.database.prepare(
                `UPDATE s3_compensation_jobs
                 SET state='completed', last_error=NULL, next_attempt_at=NULL,
                     lease_expires_at=NULL, updated_at=?
                 WHERE id=? AND state='running'`
            ).bind(Date.now(), job.id).run();
        } catch (error) {
            const attempts = job.attempts + 1;
            const retryMilliseconds = attempts <= 1
                ? 0
                : Math.min(3_600_000, (2 ** (attempts - 1)) * 1000);
            const failedAt = Date.now();
            await this.database.prepare(
                `UPDATE s3_compensation_jobs
                 SET state='failed', last_error=?, lease_expires_at=NULL,
                     next_attempt_at=?, quarantined_at=?, updated_at=?
                 WHERE id=? AND state='running'`
            ).bind(
                message(error),
                attempts >= MAX_ATTEMPTS ? null : failedAt + retryMilliseconds,
                attempts >= MAX_ATTEMPTS ? failedAt : null,
                failedAt,
                job.id
            ).run();
        }
    }
}
