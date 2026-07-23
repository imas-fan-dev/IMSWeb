import { env } from 'cloudflare:workers';
import { applyD1Migrations, reset } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { D1IdempotencyStore } from
    '@/adapters/cloudflare/d1-idempotency-store';
import type { WorkerBindings } from
    '@/adapters/cloudflare/worker-bindings';

const bindings = env as Cloudflare.Env & WorkerBindings;

beforeEach(() => reset());

it('D1 idempotency fences a stale owner after lease takeover', async () => {
    await applyD1Migrations(bindings.CORE_DB, bindings.TEST_CORE_MIGRATIONS);
    const store = new D1IdempotencyStore(bindings.CORE_DB);
    const first = await store.claim('chronicle:approve', 'overlap', 'same-request');
    expect(first.kind).toBe('acquired');
    if (first.kind !== 'acquired') return;

    await bindings.CORE_DB.prepare(
        `UPDATE idempotency_keys SET updated_at=datetime('now', '-10 minutes')
         WHERE scope='chronicle:approve' AND idempotency_key='overlap'`
    ).run();
    const replacement = await store.claim('chronicle:approve', 'overlap', 'same-request');
    expect(replacement.kind).toBe('acquired');
    if (replacement.kind !== 'acquired') return;
    expect(replacement.recovered).toBe(true);
    expect(replacement.generation).toBeGreaterThan(first.generation);

    await expect(store.complete(
        'chronicle:approve',
        'overlap',
        'same-request',
        first.generation,
        { status: 200, body: { owner: 'stale' } }
    )).rejects.toThrow(/lease|claim/i);
    await store.fail(
        'chronicle:approve',
        'overlap',
        'same-request',
        first.generation
    );
    expect(await store.claim('chronicle:approve', 'overlap', 'same-request')).toEqual({
        kind: 'in-progress'
    });

    await store.complete(
        'chronicle:approve',
        'overlap',
        'same-request',
        replacement.generation,
        { status: 200, body: { owner: 'replacement' } }
    );
    expect(await store.claim('chronicle:approve', 'overlap', 'same-request')).toEqual({
        kind: 'replay',
        response: { status: 200, body: { owner: 'replacement' } }
    });
});
