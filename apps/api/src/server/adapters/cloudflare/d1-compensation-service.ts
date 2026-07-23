import type { CompensationService } from '@/ports/compensation-service';
import type { ObjectStorage } from '@/ports/object-storage';

interface CompensationRow {
    id: string;
    kind: string;
    payload_json: string;
    attempts: number;
}

const MAX_ATTEMPTS = 5;

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error ?? 'unknown error');
}

export class D1CompensationService implements CompensationService {
    private running?: Promise<void>;

    constructor(
        private readonly database: D1Database,
        private readonly bucket: R2Bucket
    ) {}

    async enqueue(kind: string, payload: unknown, error?: unknown): Promise<string> {
        const id = crypto.randomUUID();
        let persistedPayload = payload;
        if (kind === 'delete-object' && payload && typeof payload === 'object') {
            const key = (payload as { key?: unknown }).key;
            if (typeof key === 'string' && key) {
                const active = await this.database.prepare(
                    `SELECT object_id FROM object_index
                     WHERE logical_key=? AND state IN ('pending', 'ready')`
                ).bind(key).first<string>('object_id');
                if (active) persistedPayload = { ...payload, objectId: active };
            }
        }
        await this.database.prepare(
            `INSERT INTO compensation_jobs
                (id, kind, payload_json, state, attempts, last_error, next_attempt_at, updated_at)
             VALUES (?, ?, ?, 'pending', 0, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
        ).bind(
            id,
            kind,
            JSON.stringify(persistedPayload),
            error === undefined ? null : message(error)
        ).run();
        return id;
    }

    run(storage: ObjectStorage, limit = 10): Promise<void> {
        if (this.running) return this.running;
        this.running = this.runExclusive(storage, limit).finally(() => { this.running = undefined; });
        return this.running;
    }

    private async runExclusive(storage: ObjectStorage, limit: number): Promise<void> {
        if (!Number.isInteger(limit) || limit < 1) throw new Error('Invalid compensation limit');
        await storage.recoverStaleUploads?.(limit);
        const candidates = await this.database.prepare(
            `SELECT id, kind, payload_json, attempts FROM compensation_jobs
             WHERE quarantined_at IS NULL AND (
                (state IN ('pending', 'failed')
                    AND COALESCE(next_attempt_at, created_at) <= CURRENT_TIMESTAMP)
                OR (state='running'
                    AND COALESCE(lease_expires_at, datetime(updated_at, '+5 minutes'))
                        <= CURRENT_TIMESTAMP)
             )
             ORDER BY attempts, COALESCE(next_attempt_at, created_at), created_at, id LIMIT ?`
        ).bind(limit).all<CompensationRow>();
        for (const job of candidates.results) {
            const claimed = await this.database.prepare(
                `UPDATE compensation_jobs
                 SET state='running', attempts=attempts+1,
                     lease_expires_at=datetime('now', '+5 minutes'), updated_at=CURRENT_TIMESTAMP
                 WHERE id=? AND quarantined_at IS NULL AND (
                    (state IN ('pending', 'failed')
                        AND COALESCE(next_attempt_at, created_at) <= CURRENT_TIMESTAMP)
                    OR (state='running'
                        AND COALESCE(lease_expires_at, datetime(updated_at, '+5 minutes'))
                            <= CURRENT_TIMESTAMP)
                 )`
            ).bind(job.id).run();
            if (claimed.meta.changes !== 1) continue;
            try {
                const payload = JSON.parse(job.payload_json) as { key?: unknown; objectId?: unknown };
                if (job.kind === 'delete-object') {
                    if (typeof payload.key !== 'string' || !payload.key) throw new Error('Invalid object key');
                    if (typeof payload.objectId === 'string' && payload.objectId) {
                        if (!storage.deleteIfObjectId) {
                            throw new Error('Version-fenced object deletion is unavailable');
                        }
                        await storage.deleteIfObjectId(payload.key, payload.objectId);
                    } else {
                        const live = await this.database.prepare(
                            `SELECT 1 FROM object_index
                             WHERE logical_key=? AND state IN ('pending', 'ready')`
                        ).bind(payload.key).first<number>('1');
                        if (!live) await storage.delete(payload.key);
                    }
                } else if (['delete-r2', 'delete-orphan-r2', 'delete-replaced-r2'].includes(job.kind)) {
                    if (typeof payload.objectId !== 'string' || !payload.objectId) throw new Error('Invalid R2 object ID');
                    const live = await this.database.prepare(
                        `SELECT 1 FROM object_index
                         WHERE object_id=? AND state IN ('pending', 'ready')
                         UNION ALL
                         SELECT 1 FROM upload_operations
                         WHERE object_id=? AND state IN ('uploading', 'pending', 'ready')
                         LIMIT 1`
                    ).bind(payload.objectId, payload.objectId).first<number>('1');
                    if (!live) await this.bucket.delete(`objects/${payload.objectId}`);
                } else {
                    throw new Error(`Unsupported compensation: ${job.kind}`);
                }
                await this.database.prepare(
                    `UPDATE compensation_jobs
                     SET state='completed', last_error=NULL, next_attempt_at=NULL,
                         lease_expires_at=NULL, updated_at=CURRENT_TIMESTAMP
                     WHERE id=? AND state='running'`
                ).bind(job.id).run();
            } catch (error) {
                const attempts = job.attempts + 1;
                const retrySeconds = attempts <= 1 ? 0 : Math.min(3600, 2 ** (attempts - 1));
                await this.database.prepare(
                    `UPDATE compensation_jobs
                     SET state='failed', last_error=?, lease_expires_at=NULL,
                         next_attempt_at=CASE WHEN ? >= ? THEN NULL ELSE datetime('now', ?) END,
                         quarantined_at=CASE WHEN ? >= ? THEN CURRENT_TIMESTAMP ELSE NULL END,
                         updated_at=CURRENT_TIMESTAMP
                     WHERE id=? AND state='running'`
                ).bind(
                    message(error), attempts, MAX_ATTEMPTS, `+${retrySeconds} seconds`,
                    attempts, MAX_ATTEMPTS, job.id
                ).run();
            }
        }
    }
}
