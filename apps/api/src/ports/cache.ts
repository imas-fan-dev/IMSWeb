export interface IdempotencyResponse {
    status: number;
    body: unknown;
}

export type IdempotencyClaim =
    | { kind: 'acquired'; recovered: boolean; generation: number }
    | { kind: 'replay'; response: IdempotencyResponse }
    | { kind: 'conflict' }
    | { kind: 'in-progress' };

export interface IdempotencyStore {
    claim(scope: string, key: string, fingerprint: string): Promise<IdempotencyClaim>;
    complete(
        scope: string,
        key: string,
        fingerprint: string,
        generation: number,
        response: IdempotencyResponse
    ): Promise<void>;
    fail(scope: string, key: string, fingerprint: string, generation: number): Promise<void>;
    isCurrent(
        scope: string,
        key: string,
        fingerprint: string,
        generation: number
    ): Promise<boolean>;
}

export interface RateLimitResult {
    allowed: boolean;
    remaining: number;
    resetAt: number;
}

export interface RateLimitIdentity {
    operation: string;
    identity: string;
}

export interface RateLimiter {
    consume(
        bucket: string,
        key: string,
        limit: number,
        windowSeconds: number,
        identity?: RateLimitIdentity
    ): Promise<RateLimitResult>;
}

export interface CacheServices {
    idempotency: IdempotencyStore;
    rateLimiter: RateLimiter;
}
