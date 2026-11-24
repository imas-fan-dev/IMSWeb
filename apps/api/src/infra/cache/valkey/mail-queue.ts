import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import type { PlatformEmailJobIdentity } from '@/ports/email-delivery';

export type MailJob =
    | (PlatformEmailJobIdentity & {
        kind: 'verification';
        payloadCiphertext: string;
        deadlineAt: number;
    })
    | { kind: 'station'; jobId: string; messageId: string; accountId: string; maxAttempts: number };

export type MailOutcome = { acceptedAt: number } | { failure: string } | { skipped: true };

export interface MailClaim {
    job: MailJob;
    lease: string;
    leaseExpiresAt: number;
    attempts: number;
    attemptInProgress?: boolean;
    outcome?: MailOutcome;
}

interface MailQueueClient {
    sendCommand<T>(args: string[], options: { abortSignal: AbortSignal }): Promise<T>;
    destroy(): void;
}

// Each lane has a due-time index and a hash of live jobs. A lease moves the due
// time forward; crash recovery never depends on process-local state. All state
// transitions (including finalization) compare the current lease and its expiry.
const SCRIPT = `
local op, id = ARGV[1], ARGV[2]
local clock = redis.call('TIME')
local now = tonumber(clock[1]) * 1000 + math.floor(tonumber(clock[2]) / 1000)
if op == 'enqueue' then
    if redis.call('HEXISTS', KEYS[2], id) == 1 then return 0 end
    if redis.call('HLEN', KEYS[2]) >= tonumber(ARGV[5]) then
        return redis.error_reply('MAIL_QUEUE_FULL')
    end
    redis.call('HSET', KEYS[2], id, ARGV[3])
    redis.call('ZADD', KEYS[1], now + tonumber(ARGV[4]), id)
    return 1
end
if op == 'claim' then
    local ids = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now, 'LIMIT', 0, tonumber(ARGV[4]))
    local claims = {}
    for i, jobId in ipairs(ids) do
        local entry = cjson.decode(redis.call('HGET', KEYS[2], jobId))
        entry.lease = id .. ':' .. i
        entry.leaseExpiresAt = now + tonumber(ARGV[3])
        local encoded = cjson.encode(entry)
        redis.call('HSET', KEYS[2], jobId, encoded)
        redis.call('ZADD', KEYS[1], entry.leaseExpiresAt, jobId)
        claims[i] = encoded
    end
    return claims
end
local stored = redis.call('HGET', KEYS[2], id)
if not stored then return 0 end
local entry = cjson.decode(stored)
if entry.lease ~= ARGV[3] or entry.leaseExpiresAt <= now then return 0 end
if op == 'ack' then
    redis.call('ZREM', KEYS[1], id)
    redis.call('HDEL', KEYS[2], id)
elseif op == 'attempt' then
    if entry.attemptInProgress or entry.outcome then return 0 end
    entry.attempts = entry.attempts + 1
    entry.attemptInProgress = true
    redis.call('HSET', KEYS[2], id, cjson.encode(entry))
elseif op == 'outcome' then
    if entry.outcome then return 0 end
    entry.outcome = cjson.decode(ARGV[4])
    entry.attemptInProgress = nil
    redis.call('HSET', KEYS[2], id, cjson.encode(entry))
elseif op == 'retry' then
    entry.attemptInProgress = nil
    entry.lease = nil
    entry.leaseExpiresAt = nil
    redis.call('HSET', KEYS[2], id, cjson.encode(entry))
    redis.call('ZADD', KEYS[1], now + tonumber(ARGV[4]), id)
end
return 1
`;

const MAIL_LEASE_MS = 45_000;
const MAX_JOB_BYTES = 4_096;
const MAX_LANE_JOBS = 8_192;

export function requireMailQueueUrl(environment: NodeJS.ProcessEnv): string {
    const url = environment.IMS_MAIL_QUEUE_URL?.trim();
    if (!url) throw new Error('IMS_MAIL_QUEUE_URL must point to the dedicated mail queue');
    return url;
}

export class ValkeyMailQueue {
    constructor(private readonly client: MailQueueClient) {}

    async ping(): Promise<void> {
        await this.client.sendCommand(['PING'], { abortSignal: AbortSignal.timeout(2_000) });
    }

    close(): void {
        this.client.destroy();
    }

    async enqueue(job: MailJob, delayMs = 0): Promise<boolean> {
        const entry = JSON.stringify({ job, attempts: 0 });
        if (Buffer.byteLength(entry) > MAX_JOB_BYTES) throw new Error('Mail job exceeds queue size limit');
        return (await this.run<number>(job.kind, 'enqueue', job.jobId,
            entry, String(delayMs), String(MAX_LANE_JOBS))) === 1;
    }

    async claim(kind: MailJob['kind'], limit: number): Promise<MailClaim[]> {
        const claims = await this.run<string[]>(kind, 'claim', randomUUID(),
            String(MAIL_LEASE_MS), String(limit));
        return claims.map((claim) => JSON.parse(claim) as MailClaim);
    }

    beginAttempt(claim: MailClaim): Promise<boolean> {
        return this.transition(claim, 'attempt');
    }

    retry(claim: MailClaim, delayMs: number): Promise<boolean> {
        return this.transition(claim, 'retry', String(delayMs));
    }

    recordOutcome(claim: MailClaim, outcome: MailOutcome): Promise<boolean> {
        return this.transition(claim, 'outcome', JSON.stringify(outcome));
    }

    ack(claim: MailClaim): Promise<boolean> {
        return this.transition(claim, 'ack');
    }

    private async transition(claim: MailClaim, op: string, value = ''): Promise<boolean> {
        return (await this.run<number>(claim.job.kind, op, claim.job.jobId, claim.lease, value)) === 1;
    }

    private run<T>(kind: MailJob['kind'], ...args: string[]): Promise<T> {
        const prefix = `imsweb:mail:v1:{${kind}}`;
        return this.client.sendCommand<T>(['EVAL', SCRIPT, '2', `${prefix}:due`, `${prefix}:jobs`, ...args], {
            abortSignal: AbortSignal.timeout(2_000),
        });
    }
}

export async function openValkeyMailQueue(url: string): Promise<ValkeyMailQueue> {
    const client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 2_000 } });
    client.on('error', () => {
        console.error(JSON.stringify({ event: 'mail_queue_connection_error' }));
    });
    // An unavailable queue fails startup instead of falling back to SQL writes.
    let timer: NodeJS.Timeout | undefined;
    try {
        await Promise.race([
            client.connect(),
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error('Mail queue connection timed out')), 5_000);
            }),
        ]);
        return new ValkeyMailQueue(client);
    } catch (error) {
        if (client.isOpen) client.destroy();
        throw error;
    } finally {
        if (timer) clearTimeout(timer);
    }
}
