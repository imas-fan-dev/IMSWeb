import type {
    RateLimiter,
    RateLimitIdentity,
    RateLimitResult
} from '@/ports/cache';

export class MemoryRateLimiter implements RateLimiter {
    private readonly windows = new Map<string, { identities: Set<string>; resetAt: number }>();
    private nextSweepAt = 0;

    constructor(
        private readonly now: () => number = Date.now,
        private readonly sweepIntervalMs = 60_000
    ) {}

    private sweepExpired(now: number): void {
        if (now < this.nextSweepAt) return;
        for (const [id, window] of this.windows) {
            if (window.resetAt <= now) this.windows.delete(id);
        }
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
        this.sweepExpired(now);
        const id = `${bucket}\u0000${key}`;
        let window = this.windows.get(id);
        if (!window || window.resetAt <= now) {
            window = { identities: new Set(), resetAt: now + windowSeconds * 1000 };
            this.windows.set(id, window);
        }
        const eventIdentity = identity
            ? `${identity.operation}\u0000${identity.identity}`
            : crypto.randomUUID();
        if (window.identities.has(eventIdentity)) {
            return {
                allowed: true,
                remaining: Math.max(0, limit - window.identities.size),
                resetAt: window.resetAt
            };
        }
        if (window.identities.size >= limit) {
            return { allowed: false, remaining: 0, resetAt: window.resetAt };
        }
        window.identities.add(eventIdentity);
        return {
            allowed: true,
            remaining: Math.max(0, limit - window.identities.size),
            resetAt: window.resetAt
        };
    }
}
