import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import type { IdempotencyStore } from '@/ports/cache';
import { chronicleUploadIdempotencyKey } from '@/middleware/rate-limit';
import type { RuntimeServices } from '@/ports/runtime-services';
import type { ChronicleErrorResponse } from '@/domains/content/chronicle/response';
import { sha256Hex } from '@/utils/crypto/sha256';
import { getClientAddress, services } from '@/middleware/hono-context';
import { deleteObjectWithCompensation } from '@/utils/storage/delete-object';

export interface IdempotencyHandle {
    store: IdempotencyStore;
    scope: string;
    key: string;
    fingerprint: string;
    generation: number;
    token: string;
    recovered: boolean;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json; charset=UTF-8' }
    });
}

export async function idempotencyFingerprint(requestFingerprint: unknown): Promise<string> {
    return sha256Hex(new TextEncoder().encode(JSON.stringify(requestFingerprint)));
}

async function acquiredHandle(
    store: IdempotencyStore,
    scope: string,
    key: string,
    fingerprint: string,
    claim: Extract<Awaited<ReturnType<IdempotencyStore['claim']>>, { kind: 'acquired' }>
): Promise<IdempotencyHandle> {
    return {
        store,
        scope,
        key,
        fingerprint,
        generation: claim.generation,
        token: await sha256Hex(new TextEncoder().encode(
            `${scope}\0${key}\0${claim.generation}`
        )),
        recovered: claim.recovered
    };
}

async function claimIdempotency(
    c: Context<AppEnvironment>,
    scope: string,
    rawKey: string | null,
    fingerprint: string
): Promise<IdempotencyHandle | Response | null> {
    if (rawKey === null) return null;
    const store = services(c).idempotency;
    if (!store) return jsonResponse({ error: '幂等服务不可用' }, 503);
    const claim = await store.claim(scope, rawKey, fingerprint);
    if (claim.kind === 'replay') {
        return jsonResponse(claim.response.body, claim.response.status);
    }
    if (claim.kind === 'conflict') {
        return jsonResponse({ error: '幂等键与请求不匹配' }, 409);
    }
    if (claim.kind === 'in-progress') {
        return jsonResponse({ error: '请求正在处理中' }, 409);
    }
    return acquiredHandle(store, scope, rawKey, fingerprint, claim);
}

export async function beginChronicleIdempotency(
    c: Context<AppEnvironment>,
    scope: string,
    requestFingerprint: unknown
): Promise<IdempotencyHandle | Response | null> {
    const key = chronicleUploadIdempotencyKey(c.req.raw);
    return claimIdempotency(c, scope, key, await idempotencyFingerprint(requestFingerprint));
}

export async function isCurrentIdempotencyHandle(
    handle: IdempotencyHandle | null
): Promise<boolean> {
    return !handle || handle.store.isCurrent(
        handle.scope,
        handle.key,
        handle.fingerprint,
        handle.generation
    );
}

export async function ensureCurrentIdempotencyHandle(
    handle: IdempotencyHandle | null
): Promise<void> {
    if (!await isCurrentIdempotencyHandle(handle)) {
        throw Object.assign(new Error('幂等租约已失效'), { status: 409 });
    }
}

export async function deleteChronicleGenerationObject(
    runtime: RuntimeServices,
    handle: IdempotencyHandle | null,
    key: string
): Promise<void> {
    if (!await isCurrentIdempotencyHandle(handle)) return;
    if (handle && runtime.storage?.deleteIfOwned) {
        await runtime.storage.deleteIfOwned(key, handle.token);
        return;
    }
    await deleteObjectWithCompensation(runtime, key);
}

export async function completeChronicleIdempotency(
    handle: IdempotencyHandle | null,
    body: unknown,
    status = 200
): Promise<Response> {
    if (handle) {
        await handle.store.complete(
            handle.scope,
            handle.key,
            handle.fingerprint,
            handle.generation,
            { status, body }
        );
    }
    return jsonResponse(body, status);
}

export async function failChronicleIdempotency(
    handle: IdempotencyHandle | null
): Promise<void> {
    if (handle) {
        await handle.store.fail(
            handle.scope,
            handle.key,
            handle.fingerprint,
            handle.generation
        ).catch(() => undefined);
    }
}

async function uploadLimit(
    c: Context<AppEnvironment>,
    identity?: string
): Promise<Response | null> {
    const limiter = services(c).rateLimiter;
    if (!limiter) return null;
    const result = await limiter.consume(
        'public-upload',
        getClientAddress(c),
        30,
        60 * 60,
        identity === undefined
            ? undefined
            : { operation: 'chronicle:upload', identity }
    );
    return result.allowed
        ? null
        : c.json({ error: 'Too many requests' } satisfies ChronicleErrorResponse, 429);
}

export async function beginChronicleUploadIdempotency(
    c: Context<AppEnvironment>,
    key: string | null,
    fingerprint: string
): Promise<IdempotencyHandle | Response | null> {
    if (key === null) return await uploadLimit(c) ?? null;
    const store = services(c).idempotency;
    if (!store) return jsonResponse({ error: '幂等服务不可用' }, 503);
    const claim = await store.claim('chronicle:upload', key, fingerprint);
    if (claim.kind === 'conflict' || claim.kind === 'in-progress') {
        const limited = await uploadLimit(c);
        if (limited) return limited;
        return claim.kind === 'conflict'
            ? jsonResponse({ error: '幂等键与请求不匹配' }, 409)
            : jsonResponse({ error: '请求正在处理中' }, 409);
    }
    const identity = `${key}:${fingerprint}`;
    const limited = await uploadLimit(c, identity);
    if (limited) {
        if (claim.kind === 'acquired') {
            await store.fail(
                'chronicle:upload',
                key,
                fingerprint,
                claim.generation
            ).catch(() => undefined);
        }
        return limited;
    }
    if (claim.kind === 'replay') {
        return jsonResponse(claim.response.body, claim.response.status);
    }
    return acquiredHandle(store, 'chronicle:upload', key, fingerprint, claim);
}
