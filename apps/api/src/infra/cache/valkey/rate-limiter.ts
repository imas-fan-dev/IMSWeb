import crypto from "node:crypto";
import type {
    RateLimiter,
    RateLimitIdentity,
    RateLimitResult,
} from "@/ports/cache";

interface ValkeyRateLimitClientLike {
    sendCommand<T = unknown>(args: readonly string[]): Promise<T>;
}

export interface ValkeyRateLimiterOptions {
    keyPrefix: string;
    now?: () => number;
}

const IDENTITY_SEPARATOR = "\u001f";

/**
 * One atomic fixed-window consume. The script owns window creation, expiry
 * rollover, per-identity replay exemption, and TTL-based cleanup, so
 * concurrent replicas sharing one Valkey never double-consume a window.
 * Returns [allowed, remaining, resetAtMs].
 */
export const VALKEY_RATE_LIMIT_SCRIPT = `
local window = KEYS[1]
local identities = KEYS[2]
local now = tonumber(ARGV[1])
local limit = tonumber(ARGV[2])
local windowMs = tonumber(ARGV[3])
local member = ARGV[4]
local resetAt = tonumber(redis.call('HGET', window, 'reset_at_ms'))
local consumed = tonumber(redis.call('HGET', window, 'consumed'))
if (not resetAt) or (not consumed) or resetAt <= now then
  resetAt = now + windowMs
  consumed = 0
  redis.call('DEL', identities)
  redis.call('HSET', window, 'reset_at_ms', resetAt, 'consumed', 0)
end
local ttl = resetAt - now
redis.call('PEXPIRE', window, ttl)
if member ~= '' then
  if redis.call('SISMEMBER', identities, member) == 1 then
    local remaining = limit - consumed
    if remaining < 0 then remaining = 0 end
    return {1, remaining, resetAt}
  end
end
if consumed >= limit then
  return {0, 0, resetAt}
end
if member ~= '' then
  redis.call('SADD', identities, member)
  redis.call('PEXPIRE', identities, ttl)
end
consumed = consumed + 1
redis.call('HSET', window, 'consumed', consumed)
local remaining = limit - consumed
if remaining < 0 then remaining = 0 end
return {1, remaining, resetAt}
`.trim();

function hashRateLimitComponent(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
}

export const valkeyRateLimitWindowKey = (
    keyPrefix: string,
    bucket: string,
    key: string
): string => `${keyPrefix}rate-limit:${bucket}:${hashRateLimitComponent(key)}`;

export function valkeyRateLimitIdentitySetKey(
    keyPrefix: string,
    bucket: string,
    key: string,
): string {
    return (
        `${keyPrefix}rate-limit-identities:${bucket}:` +
        hashRateLimitComponent(key)
    );
}

function assertBucket(bucket: string): void {
    if (!bucket || bucket.length > 128 || /[^a-z0-9:_-]/i.test(bucket)) {
        throw new Error("Rate-limit bucket must be a short safe identifier");
    }
}

function assertWindow(limit: number, windowSeconds: number): void {
    if (!Number.isSafeInteger(limit) || limit < 1) {
        throw new Error("Rate limit must be a positive safe integer");
    }
    if (!Number.isSafeInteger(windowSeconds) || windowSeconds < 1) {
        throw new Error(
            "Rate-limit window must be a positive safe integer of seconds",
        );
    }
}

export class ValkeyRateLimiter implements RateLimiter {
    private readonly now: () => number;

    constructor(
        private readonly client: ValkeyRateLimitClientLike,
        private readonly options: ValkeyRateLimiterOptions,
    ) {
        this.now = options.now ?? Date.now;
    }

    private windowKey(bucket: string, key: string): string {
        return valkeyRateLimitWindowKey(this.options.keyPrefix, bucket, key);
    }

    private identitySetKey(bucket: string, key: string): string {
        return valkeyRateLimitIdentitySetKey(
            this.options.keyPrefix,
            bucket,
            key,
        );
    }

    async consume(
        bucket: string,
        key: string,
        limit: number,
        windowSeconds: number,
        identity?: RateLimitIdentity,
    ): Promise<RateLimitResult> {
        assertBucket(bucket);
        assertWindow(limit, windowSeconds);
        const member = identity
            ? hashRateLimitComponent(
                  `${identity.operation}${IDENTITY_SEPARATOR}${identity.identity}`,
              )
            : "";
        const reply = await this.client.sendCommand<[number, number, number]>([
            "EVAL",
            VALKEY_RATE_LIMIT_SCRIPT,
            "2",
            this.windowKey(bucket, key),
            this.identitySetKey(bucket, key),
            String(this.now()),
            String(limit),
            String(windowSeconds * 1000),
            member,
        ]);
        if (!Array.isArray(reply) || reply.length !== 3) {
            throw new Error(
                "Valkey rate-limit script returned an unexpected reply",
            );
        }
        return {
            allowed: Number(reply[0]) === 1,
            remaining: Number(reply[1]),
            resetAt: Number(reply[2]),
        };
    }
}
