export type UploadState = 'uploading' | 'pending' | 'ready' | 'deleted';

const TRANSITIONS: Record<UploadState, ReadonlySet<UploadState>> = {
    uploading: new Set(['pending', 'ready', 'deleted']),
    pending: new Set(['ready', 'deleted']),
    ready: new Set(['deleted']),
    deleted: new Set(['deleted'])
};

export class D1UploadStateMachine {
    constructor(private readonly database: D1Database) {}

    async transition(operationId: string, next: UploadState): Promise<UploadState> {
        const current = await this.database.prepare(
            'SELECT state FROM upload_operations WHERE id=?'
        ).bind(operationId).first<{ state: UploadState }>();
        if (!current) throw new Error('Upload operation not found');
        if (current.state === next) return next;
        if (!TRANSITIONS[current.state].has(next)) {
            throw new Error(`Illegal upload transition: ${current.state} -> ${next}`);
        }
        const result = await this.database.prepare(
            `UPDATE upload_operations SET state=?, updated_at=CURRENT_TIMESTAMP
             WHERE id=? AND state=?`
        ).bind(next, operationId, current.state).run();
        if (result.meta.changes !== 1) throw new Error('Concurrent upload transition');
        return next;
    }

    async enqueueCompensation(kind: string, payload: unknown): Promise<string> {
        const id = crypto.randomUUID();
        await this.database.prepare(
            `INSERT INTO compensation_jobs (id, kind, payload_json, state)
             VALUES (?, ?, ?, 'pending')`
        ).bind(id, kind, JSON.stringify(payload)).run();
        return id;
    }

    async completeCompensation(id: string): Promise<void> {
        await this.database.prepare(
            `UPDATE compensation_jobs
             SET state='completed', attempts=attempts+1, updated_at=CURRENT_TIMESTAMP
             WHERE id=? AND state<>'completed'`
        ).bind(id).run();
    }
}
