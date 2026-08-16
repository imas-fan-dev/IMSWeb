import type { ManagedSqlDatabase, SqlDatabase } from '@/infra/db/sql/database';
import type {
    IdempotencyClaim,
    IdempotencyResponse,
    IdempotencyStore
} from '@/ports/cache';

interface IdempotencyRow {
    scope: string;
    idempotency_key: string;
    fingerprint: string;
    state: 'started' | 'completed' | 'failed';
    response_status: number | null;
    response_body: unknown;
    updated_at_ms: number;
    generation: number;
}

const DEFAULT_STALE_AFTER_MS = 5 * 60 * 1000;
const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
const DEFAULT_TERMINAL_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function responseFrom(row: IdempotencyRow): IdempotencyResponse {
    if (row.response_status === null) {
        throw new Error('Completed idempotency record has no response');
    }
    return { status: row.response_status, body: row.response_body };
}

async function lockedRecord(
    database: SqlDatabase,
    scope: string,
    key: string
): Promise<IdempotencyRow | null> {
    return database.prepare(
        `SELECT scope, idempotency_key, fingerprint, state, response_status,
                response_body, updated_at_ms, generation
         FROM request_idempotency_records
         WHERE scope=? AND idempotency_key=?
         FOR UPDATE`
    ).bind(scope, key).first<IdempotencyRow>();
}

export interface PostgresqlIdempotencyStoreOptions {
    now?: () => number;
    staleAfterMs?: number;
    sweepIntervalMs?: number;
    terminalRetentionMs?: number;
}

export class PostgresqlIdempotencyStore implements IdempotencyStore {
    private readonly now: () => number;
    private readonly staleAfterMs: number;
    private readonly sweepIntervalMs: number;
    private readonly terminalRetentionMs: number;
    private nextSweepAt = 0;

    constructor(
        private readonly database: ManagedSqlDatabase,
        options: PostgresqlIdempotencyStoreOptions = {}
    ) {
        this.now = options.now ?? Date.now;
        this.staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
        this.sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
        this.terminalRetentionMs = options.terminalRetentionMs ??
            DEFAULT_TERMINAL_RETENTION_MS;
    }

    private async sweepTerminalRecords(now: number): Promise<void> {
        if (now < this.nextSweepAt) return;
        await this.database.prepare(
            `DELETE FROM request_idempotency_records
             WHERE state IN ('completed', 'failed') AND updated_at_ms<?`
        ).bind(now - this.terminalRetentionMs).run();
        this.nextSweepAt = now + this.sweepIntervalMs;
    }

    async claim(scope: string, key: string, fingerprint: string): Promise<IdempotencyClaim> {
        const now = this.now();
        await this.sweepTerminalRecords(now);
        return this.database.transaction(async (database) => {
            const inserted = await database.prepare(
                `INSERT INTO request_idempotency_records
                 (scope, idempotency_key, fingerprint, state, response_status,
                  response_body, updated_at_ms, generation)
                 VALUES (?, ?, ?, 'started', NULL, NULL, ?, 1)
                 ON CONFLICT (scope, idempotency_key) DO NOTHING
                 RETURNING generation`
            ).bind(scope, key, fingerprint, now).first<number>('generation');
            if (inserted !== null) {
                return { kind: 'acquired', recovered: false, generation: inserted };
            }

            const existing = await lockedRecord(database, scope, key);
            if (!existing) throw new Error('Idempotency record disappeared during claim');
            if (existing.fingerprint !== fingerprint) return { kind: 'conflict' };
            if (existing.state === 'completed') {
                return { kind: 'replay', response: responseFrom(existing) };
            }
            if (
                existing.state === 'started' &&
                now - existing.updated_at_ms < this.staleAfterMs
            ) {
                return { kind: 'in-progress' };
            }

            const generation = existing.generation + 1;
            await database.prepare(
                `UPDATE request_idempotency_records
                 SET state='started', response_status=NULL, response_body=NULL,
                     updated_at_ms=?, generation=?
                 WHERE scope=? AND idempotency_key=?`
            ).bind(now, generation, scope, key).run();
            return { kind: 'acquired', recovered: true, generation };
        });
    }

    async isCurrent(
        scope: string,
        key: string,
        fingerprint: string,
        generation: number
    ): Promise<boolean> {
        const current = await this.database.prepare(
            `SELECT 1 AS current
             FROM request_idempotency_records
             WHERE scope=? AND idempotency_key=? AND fingerprint=?
               AND state='started' AND generation=?`
        ).bind(scope, key, fingerprint, generation).first<number>('current');
        return current === 1;
    }

    complete(
        scope: string,
        key: string,
        fingerprint: string,
        generation: number,
        response: IdempotencyResponse
    ): Promise<void> {
        const serializedBody = JSON.stringify(response.body);
        if (serializedBody === undefined) {
            return Promise.reject(new Error('Idempotency response must be JSON serializable'));
        }
        return this.database.transaction(async (database) => {
            const existing = await lockedRecord(database, scope, key);
            if (
                existing?.fingerprint === fingerprint &&
                existing.generation === generation &&
                existing.state === 'completed'
            ) {
                return;
            }
            if (
                !existing || existing.fingerprint !== fingerprint ||
                existing.generation !== generation || existing.state !== 'started'
            ) {
                throw new Error('Idempotency lease is no longer current');
            }
            await database.prepare(
                `UPDATE request_idempotency_records
                 SET state='completed', response_status=?, response_body=?::jsonb,
                     updated_at_ms=?
                 WHERE scope=? AND idempotency_key=?`
            ).bind(
                response.status,
                serializedBody,
                this.now(),
                scope,
                key
            ).run();
        });
    }

    async fail(
        scope: string,
        key: string,
        fingerprint: string,
        generation: number
    ): Promise<void> {
        await this.database.prepare(
            `UPDATE request_idempotency_records
             SET state='failed', response_status=NULL, response_body=NULL,
                 updated_at_ms=?
             WHERE scope=? AND idempotency_key=? AND fingerprint=?
               AND state='started' AND generation=?`
        ).bind(this.now(), scope, key, fingerprint, generation).run();
    }
}
