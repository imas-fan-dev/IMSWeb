import type {
    IdempotencyClaim,
    IdempotencyResponse,
    IdempotencyStore
} from '@/ports/idempotency-store';

interface IdempotencyRow {
    request_hash: string;
    response_status: number | null;
    response_json: string | null;
    state: 'started' | 'completed' | 'failed';
    age_seconds: number;
    generation: number;
}

const STALE_AFTER_SECONDS = 5 * 60;

export class D1IdempotencyStore implements IdempotencyStore {
    constructor(private readonly database: D1Database) {}

    private read(scope: string, key: string): Promise<IdempotencyRow | null> {
        return this.database.prepare(
            `SELECT request_hash, response_status, response_json, state, generation,
                    unixepoch('now') - unixepoch(updated_at) AS age_seconds
             FROM idempotency_keys WHERE scope=? AND idempotency_key=?`
        ).bind(scope, key).first<IdempotencyRow>();
    }

    async claim(scope: string, key: string, fingerprint: string): Promise<IdempotencyClaim> {
        const inserted = await this.database.prepare(
            `INSERT OR IGNORE INTO idempotency_keys
                (scope, idempotency_key, request_hash, state, generation, updated_at)
             VALUES (?, ?, ?, 'started', 1, CURRENT_TIMESTAMP)`
        ).bind(scope, key, fingerprint).run();
        if (inserted.meta.changes === 1) {
            return { kind: 'acquired', recovered: false, generation: 1 };
        }

        const existing = await this.read(scope, key);
        if (!existing) throw new Error('Idempotency claim disappeared');
        if (existing.request_hash !== fingerprint) return { kind: 'conflict' };
        if (existing.state === 'completed' && existing.response_status !== null &&
            existing.response_json !== null) {
            return {
                kind: 'replay',
                response: {
                    status: existing.response_status,
                    body: JSON.parse(existing.response_json) as unknown
                }
            };
        }
        if (existing.state === 'started' && existing.age_seconds < STALE_AFTER_SECONDS) {
            return { kind: 'in-progress' };
        }

        const recovered = await this.database.prepare(
            `UPDATE idempotency_keys
             SET state='started', response_status=NULL, response_json=NULL,
                 generation=generation + 1, updated_at=CURRENT_TIMESTAMP
             WHERE scope=? AND idempotency_key=? AND request_hash=?
               AND generation=?
               AND (state='failed' OR
                    (state='started' AND updated_at <= datetime('now', '-5 minutes')))`
        ).bind(scope, key, fingerprint, existing.generation).run();
        return recovered.meta.changes === 1
            ? { kind: 'acquired', recovered: true, generation: existing.generation + 1 }
            : { kind: 'in-progress' };
    }

    async isCurrent(
        scope: string,
        key: string,
        fingerprint: string,
        generation: number
    ): Promise<boolean> {
        const existing = await this.read(scope, key);
        return existing?.request_hash === fingerprint && existing.state === 'started' &&
            existing.generation === generation;
    }

    async complete(
        scope: string,
        key: string,
        fingerprint: string,
        generation: number,
        response: IdempotencyResponse
    ): Promise<void> {
        const result = await this.database.prepare(
            `UPDATE idempotency_keys
             SET response_status=?, response_json=?, state='completed', updated_at=CURRENT_TIMESTAMP
             WHERE scope=? AND idempotency_key=? AND request_hash=?
               AND generation=? AND state='started'`
        ).bind(
            response.status,
            JSON.stringify(response.body),
            scope,
            key,
            fingerprint,
            generation
        ).run();
        if (result.meta.changes !== 1) {
            const existing = await this.read(scope, key);
            if (existing?.state !== 'completed' || existing.request_hash !== fingerprint ||
                existing.generation !== generation) {
                throw new Error('Idempotency lease is no longer current');
            }
        }
    }

    async fail(
        scope: string,
        key: string,
        fingerprint: string,
        generation: number
    ): Promise<void> {
        await this.database.prepare(
            `UPDATE idempotency_keys SET state='failed', updated_at=CURRENT_TIMESTAMP
             WHERE scope=? AND idempotency_key=? AND request_hash=?
               AND generation=? AND state='started'`
        ).bind(scope, key, fingerprint, generation).run();
    }
}
