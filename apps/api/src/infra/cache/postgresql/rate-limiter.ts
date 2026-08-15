import type { ManagedSqlDatabase, SqlDatabase } from '@/infra/db/sql/database';
import type {
    RateLimiter,
    RateLimitIdentity,
    RateLimitResult
} from '@/ports/cache';

interface RateLimitWindowRow {
    reset_at_ms: number;
    consumed: number;
}

const DEFAULT_SWEEP_INTERVAL_MS = 60_000;
const EXPIRED_WINDOW_RETENTION_MS = 24 * 60 * 60 * 1000;

export interface PostgresqlRateLimiterOptions {
    now?: () => number;
    sweepIntervalMs?: number;
}

async function lockedWindow(
    database: SqlDatabase,
    bucket: string,
    key: string
): Promise<RateLimitWindowRow | null> {
    return database.prepare(
        `SELECT reset_at_ms, consumed
         FROM rate_limit_windows
         WHERE bucket=? AND limit_key=?
         FOR UPDATE`
    ).bind(bucket, key).first<RateLimitWindowRow>();
}

export class PostgresqlRateLimiter implements RateLimiter {
    private readonly now: () => number;
    private readonly sweepIntervalMs: number;
    private nextSweepAt = 0;

    constructor(
        private readonly database: ManagedSqlDatabase,
        options: PostgresqlRateLimiterOptions = {}
    ) {
        this.now = options.now ?? Date.now;
        this.sweepIntervalMs = options.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    }

    private async sweepExpired(now: number): Promise<void> {
        if (now < this.nextSweepAt) return;
        await this.database.prepare(
            'DELETE FROM rate_limit_windows WHERE reset_at_ms<?'
        ).bind(now - EXPIRED_WINDOW_RETENTION_MS).run();
        this.nextSweepAt = now + this.sweepIntervalMs;
    }

    async consume(
        bucket: string,
        key: string,
        limit: number,
        windowSeconds: number,
        identity?: RateLimitIdentity
    ): Promise<RateLimitResult> {
        const now = this.now();
        await this.sweepExpired(now);
        return this.database.transaction(async (database) => {
            const initialResetAt = now + windowSeconds * 1000;
            await database.prepare(
                `INSERT INTO rate_limit_windows
                 (bucket, limit_key, reset_at_ms, consumed)
                 VALUES (?, ?, ?, 0)
                 ON CONFLICT (bucket, limit_key) DO NOTHING`
            ).bind(bucket, key, initialResetAt).run();

            let window = await lockedWindow(database, bucket, key);
            if (!window) throw new Error('Rate-limit window disappeared during consume');
            if (window.reset_at_ms <= now) {
                await database.prepare(
                    'DELETE FROM rate_limit_identities WHERE bucket=? AND limit_key=?'
                ).bind(bucket, key).run();
                await database.prepare(
                    `UPDATE rate_limit_windows
                     SET reset_at_ms=?, consumed=0
                     WHERE bucket=? AND limit_key=?`
                ).bind(initialResetAt, bucket, key).run();
                window = { reset_at_ms: initialResetAt, consumed: 0 };
            }

            if (identity) {
                const existing = await database.prepare(
                    `SELECT 1 AS present
                     FROM rate_limit_identities
                     WHERE bucket=? AND limit_key=? AND operation=? AND identity=?`
                ).bind(
                    bucket,
                    key,
                    identity.operation,
                    identity.identity
                ).first<number>('present');
                if (existing === 1) {
                    return {
                        allowed: true,
                        remaining: Math.max(0, limit - window.consumed),
                        resetAt: window.reset_at_ms
                    };
                }
            }

            if (window.consumed >= limit) {
                return { allowed: false, remaining: 0, resetAt: window.reset_at_ms };
            }

            if (identity) {
                await database.prepare(
                    `INSERT INTO rate_limit_identities
                     (bucket, limit_key, operation, identity)
                     VALUES (?, ?, ?, ?)`
                ).bind(
                    bucket,
                    key,
                    identity.operation,
                    identity.identity
                ).run();
            }
            const consumed = window.consumed + 1;
            await database.prepare(
                `UPDATE rate_limit_windows SET consumed=?
                 WHERE bucket=? AND limit_key=?`
            ).bind(consumed, bucket, key).run();
            return {
                allowed: true,
                remaining: Math.max(0, limit - consumed),
                resetAt: window.reset_at_ms
            };
        });
    }
}
