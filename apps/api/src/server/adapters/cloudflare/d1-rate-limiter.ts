import type {
    RateLimiter,
    RateLimitIdentity,
    RateLimitResult
} from '@/ports/rate-limiter';

const RETENTION_BATCH_SIZE = 128;
const RETENTION_INTERVAL_SECONDS = 60;
const RETENTION_MAINTENANCE_ID = 1;

export class D1RateLimiter implements RateLimiter {
    constructor(private readonly database: D1Database) {}

    private async sweepExpired(nowSeconds: number): Promise<void> {
        try {
            const claimedUntil = nowSeconds + RETENTION_INTERVAL_SECONDS;
            const claimed = await this.database.prepare(
                `UPDATE rate_limit_maintenance
                 SET next_sweep_at=?
                 WHERE id=? AND next_sweep_at <= ?`
            ).bind(claimedUntil, RETENTION_MAINTENANCE_ID, nowSeconds).run();
            if (claimed.meta.changes !== 1) return;

            const deleted = await this.database.prepare(
                `DELETE FROM rate_limit_events
                 WHERE rowid IN (
                    SELECT rowid FROM rate_limit_events
                    INDEXED BY idx_rate_limit_events_expiry
                    WHERE expires_at <= ?
                    ORDER BY expires_at, rowid
                    LIMIT ?
                 )`
            ).bind(nowSeconds, RETENTION_BATCH_SIZE).run();
            if (deleted.meta.changes === RETENTION_BATCH_SIZE) {
                await this.database.prepare(
                    `UPDATE rate_limit_maintenance
                     SET next_sweep_at=?
                     WHERE id=? AND next_sweep_at=?`
                ).bind(nowSeconds, RETENTION_MAINTENANCE_ID, claimedUntil).run();
            }
        } catch (error) {
            console.warn('Failed to sweep expired rate-limit events', error);
        }
    }

    async consume(
        bucket: string,
        key: string,
        limit: number,
        windowSeconds: number,
        identity?: RateLimitIdentity
    ): Promise<RateLimitResult> {
        const nowSeconds = Math.floor(Date.now() / 1000);
        const windowStart = Math.floor(nowSeconds / windowSeconds) * windowSeconds;
        const expiresAt = windowStart + windowSeconds;
        const operation = identity?.operation || 'request';
        const eventIdentity = identity?.identity || crypto.randomUUID();
        await this.sweepExpired(nowSeconds);
        await this.database.prepare(
            `INSERT OR IGNORE INTO rate_limit_events
                (bucket, client_key, window_start, operation, event_identity, expires_at)
             SELECT ?, ?, ?, ?, ?, ?
             WHERE (
                SELECT COUNT(*) FROM rate_limit_events
                WHERE bucket=? AND client_key=? AND window_start=?
             ) < ?`
        ).bind(
            bucket, key, windowStart, operation, eventIdentity, expiresAt,
            bucket, key, windowStart, limit
        ).run();
        const row = await this.database.prepare(
            `SELECT COUNT(*) AS count,
                    COALESCE(MAX(CASE
                        WHEN operation=? AND event_identity=? THEN 1 ELSE 0
                    END), 0) AS present
             FROM rate_limit_events
             WHERE bucket=? AND client_key=? AND window_start=?`
        ).bind(operation, eventIdentity, bucket, key, windowStart).first<{
            count: number;
            present: number;
        }>();
        const count = row?.count ?? limit;
        return {
            allowed: row?.present === 1,
            remaining: Math.max(0, limit - count),
            resetAt: expiresAt * 1000
        };
    }
}
