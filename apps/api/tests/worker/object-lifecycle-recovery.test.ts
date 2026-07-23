import { env } from 'cloudflare:workers';
import { applyD1Migrations, reset } from 'cloudflare:test';
import { beforeEach, expect, it, vi } from 'vitest';
import { createHonoApp } from '@/app';
import { D1CompensationService } from '@/adapters/cloudflare/d1-compensation-service';
import { D1CoreRepository } from '@/adapters/cloudflare/d1-core-repository';
import {
    fetchFinalR2Object,
    R2ObjectStorage
} from '@/adapters/cloudflare/r2-object-storage';
import type { WorkerBindings } from '@/adapters/cloudflare/worker-bindings';
import type { ObjectStorage } from '@/ports/object-storage';

const bindings = env as Cloudflare.Env & WorkerBindings;

function barrier(): {
    entered: Promise<void>;
    release: () => void;
    wait: () => Promise<void>;
} {
    let enter!: () => void;
    let release!: () => void;
    const entered = new Promise<void>((resolve) => { enter = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    return {
        entered,
        release,
        async wait() {
            enter();
            await released;
        }
    };
}

async function expectBarrier(value: Promise<void>, label: string): Promise<void> {
    await Promise.race([
        value,
        new Promise<never>((_, reject) => setTimeout(
            () => reject(new Error(`${label} did not reach the barrier`)),
            1_000
        ))
    ]);
}

async function backdateObject(key: string): Promise<void> {
    await bindings.CORE_DB.batch([
        bindings.CORE_DB.prepare(
            "UPDATE object_index SET updated_at=datetime('now', '-10 minutes') WHERE logical_key=?"
        ).bind(key),
        bindings.CORE_DB.prepare(
            "UPDATE upload_operations SET updated_at=datetime('now', '-10 minutes') WHERE logical_key=?"
        ).bind(key)
    ]);
}

function bucketWithPausedHead(): {
    bucket: R2Bucket;
    entered: Promise<void>;
    release: () => void;
} {
    let entered!: () => void;
    let release!: () => void;
    const headEntered = new Promise<void>((resolve) => { entered = resolve; });
    const released = new Promise<void>((resolve) => { release = resolve; });
    let shouldPause = true;
    const bucket = new Proxy(bindings.MEDIA_BUCKET, {
        get(target, property, receiver) {
            if (property === 'head') {
                return async (key: string) => {
                    if (shouldPause && key.startsWith('objects/')) {
                        shouldPause = false;
                        entered();
                        await released;
                    }
                    return target.head(key);
                };
            }
            const value = Reflect.get(target, property, receiver) as unknown;
            return typeof value === 'function' ? value.bind(target) : value;
        }
    });
    return { bucket, entered: headEntered, release };
}

beforeEach(async () => {
    reset();
    await applyD1Migrations(bindings.CORE_DB, bindings.TEST_CORE_MIGRATIONS);
});

async function lifecycleState(key: string): Promise<{
    objectId: string;
    indexState: string;
    operationState: string;
    incarnation: number;
}> {
    const row = await bindings.CORE_DB.prepare(
        `SELECT oi.object_id, oi.state AS index_state, u.state AS operation_state,
                oi.incarnation
         FROM object_index oi
         JOIN upload_operations u ON u.object_id=oi.object_id
         WHERE oi.logical_key=?`
    ).bind(key).first<{
        object_id: string;
        index_state: string;
        operation_state: string;
        incarnation: number;
    }>();
    if (!row) throw new Error(`Missing lifecycle state for ${key}`);
    return {
        objectId: row.object_id,
        indexState: row.index_state,
        operationState: row.operation_state,
        incarnation: row.incarnation
    };
}

it('isolates a new incarnation while an old physical delete is already in flight', async () => {
    const key = 'uploads/news/original/aba.png';
    const body = new TextEncoder().encode('same bytes and stable identity');
    let releaseDelete!: () => void;
    let deleteEntered!: () => void;
    const deletionReleased = new Promise<void>((resolve) => { releaseDelete = resolve; });
    const deletionEntered = new Promise<void>((resolve) => { deleteEntered = resolve; });
    let shouldBlockDelete = true;
    const deletingBucket = {
        async delete(value: string | string[]) {
            const keys = Array.isArray(value) ? value : [value];
            if (shouldBlockDelete && keys.some((candidate) => candidate.startsWith('objects/'))) {
                shouldBlockDelete = false;
                deleteEntered();
                await deletionReleased;
            }
            return bindings.MEDIA_BUCKET.delete(value);
        }
    } as unknown as R2Bucket;
    const compensation = new D1CompensationService(bindings.CORE_DB, deletingBucket);
    const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);

    await storage.put(key, body, { contentType: 'image/png' });
    const original = await lifecycleState(key);
    const staleJob = await compensation.enqueue(
        'delete-r2',
        { objectId: original.objectId, logicalKey: key },
        new Error('old delete failed')
    );
    await bindings.CORE_DB.batch([
        bindings.CORE_DB.prepare(
            `UPDATE object_index SET state='deleted' WHERE logical_key=? AND object_id=?`
        ).bind(key, original.objectId),
        bindings.CORE_DB.prepare(
            `UPDATE upload_operations SET state='deleted', target_state='deleted'
             WHERE object_id=?`
        ).bind(original.objectId)
    ]);

    const oldDelete = compensation.run(storage);
    await Promise.race([
        deletionEntered,
        new Promise<never>((_, reject) => setTimeout(
            () => reject(new Error('old compensation delete did not reach the barrier')),
            1_000
        ))
    ]);
    await storage.put(key, body, { contentType: 'image/png' });
    const republished = await lifecycleState(key);
    expect(republished).toMatchObject({
        indexState: 'ready',
        operationState: 'ready',
        incarnation: 2
    });
    expect(republished.objectId).not.toBe(original.objectId);

    releaseDelete();
    await oldDelete;

    expect(await bindings.CORE_DB.prepare(
        'SELECT state FROM compensation_jobs WHERE id=?'
    ).bind(staleJob).first<string>('state')).toBe('completed');
    expect(await bindings.MEDIA_BUCKET.head(`objects/${original.objectId}`)).toBeNull();
    expect(await bindings.MEDIA_BUCKET.head(`objects/${republished.objectId}`)).not.toBeNull();
    expect(new TextDecoder().decode((await storage.get(key))?.body)).toBe(
        'same bytes and stable identity'
    );
});

it('fences delete-object compensation to the object identity captured at enqueue time', async () => {
    const key = 'uploads/event/original/version-fenced-compensation.png';
    const body = new TextEncoder().encode('same bytes, newer incarnation');
    const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const compensation = new D1CompensationService(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await storage.put(key, body, { contentType: 'image/png' });
    const original = await lifecycleState(key);
    const job = await compensation.enqueue('delete-object', { key }, new Error('deferred delete'));

    await storage.delete(key);
    await storage.put(key, body, { contentType: 'image/png' });
    const replacement = await lifecycleState(key);
    expect(replacement).toMatchObject({ incarnation: 2, indexState: 'ready' });
    expect(replacement.objectId).not.toBe(original.objectId);

    await compensation.run(storage);

    expect(await bindings.CORE_DB.prepare(
        'SELECT state FROM compensation_jobs WHERE id=?'
    ).bind(job).first<string>('state')).toBe('completed');
    expect(await bindings.MEDIA_BUCKET.head(`objects/${replacement.objectId}`)).not.toBeNull();
    expect(new TextDecoder().decode((await storage.get(key))?.body)).toBe(
        'same bytes, newer incarnation'
    );
});

it('prevents an original put from finalizing after stale recovery steals its upload lease', async () => {
    const key = 'uploads/news/original/original-head-recovery-race.png';
    const paused = bucketWithPausedHead();
    const originalStorage = new R2ObjectStorage(bindings.CORE_DB, paused.bucket);
    const recoveryStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const originalPut = originalStorage.put(key, new TextEncoder().encode('late original upload'), {
        contentType: 'image/png'
    });
    await expectBarrier(paused.entered, 'original upload HEAD');
    await bindings.CORE_DB.prepare(
        "UPDATE upload_operations SET updated_at=datetime('now', '-10 minutes') WHERE logical_key=?"
    ).bind(key).run();

    await recoveryStorage.recoverStaleUploads(10, 300);
    paused.release();
    await expect(originalPut).rejects.toThrow('A newer object already owns the logical key');

    expect(await bindings.CORE_DB.prepare(
        'SELECT state FROM upload_operations WHERE logical_key=?'
    ).bind(key).first<string>('state')).toBe('deleted');
    expect(await bindings.CORE_DB.prepare(
        'SELECT COUNT(*) FROM object_index WHERE logical_key=?'
    ).bind(key).first<number>('COUNT(*)')).toBe(0);
    expect((await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).objects).toHaveLength(1);

    await new D1CompensationService(bindings.CORE_DB, bindings.MEDIA_BUCKET).run(recoveryStorage);
    expect(await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).toMatchObject({ objects: [] });
});

it('does not let an ordinary same-identity put steal an active upload lease', async () => {
    const key = 'uploads/news/original/active-same-identity-lease.png';
    const body = new TextEncoder().encode('one active executor');
    const upload = barrier();
    const originalStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onUploadPhase: (phase, context) => phase === 'operation-created' && context.logicalKey === key
            ? upload.wait()
            : undefined
    });
    const concurrentStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const original = originalStorage.put(key, body, { contentType: 'image/png' });
    await expectBarrier(upload.entered, 'active same-identity upload');
    const leaseBefore = await bindings.CORE_DB.prepare(
        'SELECT mutation_token FROM upload_operations WHERE logical_key=?'
    ).bind(key).first<string>('mutation_token');

    await expect(concurrentStorage.put(key, body, { contentType: 'image/png' })).rejects.toThrow(
        'Concurrent upload execution'
    );
    expect(await bindings.CORE_DB.prepare(
        'SELECT mutation_token FROM upload_operations WHERE logical_key=?'
    ).bind(key).first<string>('mutation_token')).toBe(leaseBefore);

    upload.release();
    await original;
    await expect(concurrentStorage.put(key, body, { contentType: 'image/png' })).resolves.toMatchObject({
        size: body.byteLength
    });
    expect((await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).objects).toHaveLength(1);
    expect(await lifecycleState(key)).toMatchObject({ indexState: 'ready', operationState: 'ready' });
});

it('rejects an ordinary retry while recovery owns the lease and succeeds after quarantine', async () => {
    const key = 'uploads/news/original/recovery-head-retry-race.png';
    const body = new TextEncoder().encode('retry winner');
    const crashingStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onUploadPhase(phase, context) {
            if (phase === 'operation-created' && context.logicalKey === key) {
                throw new Error('pause before initial HEAD');
            }
        }
    });
    await expect(crashingStorage.put(key, body, { contentType: 'image/png' })).rejects.toThrow(
        'pause before initial HEAD'
    );
    await bindings.CORE_DB.prepare(
        "UPDATE upload_operations SET updated_at=datetime('now', '-10 minutes') WHERE logical_key=?"
    ).bind(key).run();
    const paused = bucketWithPausedHead();
    const recoveryStorage = new R2ObjectStorage(bindings.CORE_DB, paused.bucket);
    const recovery = recoveryStorage.recoverStaleUploads(10, 300);
    await expectBarrier(paused.entered, 'recovery upload HEAD');

    const retryStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await expect(retryStorage.put(key, body, { contentType: 'image/png' })).rejects.toThrow(
        'Concurrent upload execution'
    );
    paused.release();
    await recovery;

    expect(await bindings.CORE_DB.prepare(
        'SELECT state FROM upload_operations WHERE logical_key=?'
    ).bind(key).first<string>('state')).toBe('deleted');
    await retryStorage.put(key, body, { contentType: 'image/png' });

    expect(await lifecycleState(key)).toMatchObject({
        indexState: 'ready',
        operationState: 'ready',
        incarnation: 2
    });
    await new D1CompensationService(bindings.CORE_DB, bindings.MEDIA_BUCKET).run(retryStorage);
    expect(new TextDecoder().decode((await retryStorage.get(key))?.body)).toBe('retry winner');
    expect((await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).objects).toHaveLength(1);
});

it('keeps crash-before-business-commit objects private and reclaims the stale orphan', async () => {
    const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const key = 'uploads/event/original/crash-before-commit.png';
    const body = new TextEncoder().encode('not committed');

    await storage.put(key, body, {
        contentType: 'image/png',
        deferredPublication: true
    });
    expect(await lifecycleState(key)).toMatchObject({
        indexState: 'pending',
        operationState: 'pending'
    });
    expect(await storage.get(key)).toBeNull();
    const app = createHonoApp(() => ({ storage }));
    const routeGet = await app.request(`http://ims.test/${key}`);
    expect(routeGet.status).toBe(404);
    const routeHead = await app.request(`http://ims.test/${key}`, { method: 'HEAD' });
    expect(routeHead.status).toBe(404);
    expect(await fetchFinalR2Object(
        bindings.CORE_DB,
        bindings.MEDIA_BUCKET,
        key,
        new Request(`http://ims.test/${key}`)
    )).toBeNull();

    await bindings.CORE_DB.batch([
        bindings.CORE_DB.prepare(
            `UPDATE object_index SET updated_at=datetime('now', '-10 minutes')
             WHERE logical_key=?`
        ).bind(key),
        bindings.CORE_DB.prepare(
            `UPDATE upload_operations SET updated_at=datetime('now', '-10 minutes')
             WHERE logical_key=?`
        ).bind(key)
    ]);
    await storage.recoverStaleUploads(10, 300);

    expect(await lifecycleState(key)).toMatchObject({
        indexState: 'deleted',
        operationState: 'deleted'
    });
    expect(await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).toMatchObject({ objects: [] });
});

it('publishes a pending object when recovery observes its committed business row', async () => {
    const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const key = 'uploads/event/original/crash-after-commit.png';
    const body = new TextEncoder().encode('committed');
    await storage.put(key, body, {
        contentType: 'image/png',
        deferredPublication: true
    });
    await bindings.CORE_DB.prepare(
        `INSERT INTO events (title, name, contact, image_url)
         VALUES ('Recovery', 'Owner', 'owner@example.test', ?)`
    ).bind(`/${key}`).run();

    await storage.recoverStaleUploads(10, 300);

    expect(await lifecycleState(key)).toMatchObject({
        indexState: 'ready',
        operationState: 'ready'
    });
    const response = await fetchFinalR2Object(
        bindings.CORE_DB,
        bindings.MEDIA_BUCKET,
        key,
        new Request(`http://ims.test/${key}`)
    );
    expect(response?.status).toBe(200);
    expect(new TextDecoder().decode(await response?.arrayBuffer())).toBe('committed');
});

it('rejects publishing a staged business object before its business row exists', async () => {
    const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const key = 'uploads/news/original/premature.png';
    await storage.put(key, new TextEncoder().encode('premature'), {
        contentType: 'image/png',
        deferredPublication: true
    });

    await expect(storage.publish(key)).rejects.toThrow(
        'Business reference required before object publication'
    );
    expect(await storage.get(key)).toBeNull();
    expect(await lifecycleState(key)).toMatchObject({
        indexState: 'pending',
        operationState: 'pending'
    });
});

it('lets later jobs progress when the oldest compensation job is poison', async () => {
    const poisonKey = 'fixture/poison';
    const healthyKey = 'fixture/healthy';
    const remove = vi.fn(async (key: string) => {
        if (key === poisonKey) throw new Error('permanent failure');
    });
    const storage = { delete: remove } as unknown as ObjectStorage;
    const compensation = new D1CompensationService(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const poisonJob = await compensation.enqueue('delete-object', { key: poisonKey });

    await compensation.run(storage, 1);
    const healthyJob = await compensation.enqueue('delete-object', { key: healthyKey });
    await compensation.run(storage, 1);

    expect(await bindings.CORE_DB.prepare(
        'SELECT state FROM compensation_jobs WHERE id=?'
    ).bind(poisonJob).first<string>('state')).toBe('failed');
    expect(await bindings.CORE_DB.prepare(
        'SELECT state FROM compensation_jobs WHERE id=?'
    ).bind(healthyJob).first<string>('state')).toBe('completed');
    expect(remove.mock.calls.map(([key]) => key)).toEqual([poisonKey, healthyKey]);
});

it('fences conditional move and delete with the persisted owner token', async () => {
    const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const source = 'assets/images/eventchronicle/events/upload/owner/item.png';
    const destination = 'assets/images/eventchronicle/events/used/owner/item.png';
    await storage.put(source, new TextEncoder().encode('owned'), {
        contentType: 'image/png',
        ownerToken: 'generation-2'
    });
    expect(await storage.get(source)).not.toBeNull();

    await expect(storage.moveIfOwned(source, destination, 'generation-1')).resolves.toBe(false);
    await expect(storage.deleteIfOwned(source, 'generation-1')).resolves.toBe(false);
    expect(await storage.exists(source)).toBe(true);

    await expect(storage.moveIfOwned(source, destination, 'generation-2')).resolves.toBe(true);
    expect(await storage.exists(source)).toBe(false);
    expect(await storage.exists(destination)).toBe(true);
    await expect(storage.deleteIfOwned(destination, 'generation-2')).resolves.toBe(true);
    expect(await storage.exists(destination)).toBe(false);
});

it('does not let a stale delete tombstone or physically delete an object moved after its read', async () => {
    const source = 'fixtures/object-lifecycle/delete-race/source.png';
    const destination = 'fixtures/object-lifecycle/delete-race/destination.png';
    const mutation = barrier();
    const staleStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onMutationPhase: (phase, context) => phase === 'delete-read' && context.logicalKey === source
            ? mutation.wait()
            : undefined
    });
    const winningStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await staleStorage.put(source, new TextEncoder().encode('survives stale delete'), {
        contentType: 'image/png'
    });
    const original = await lifecycleState(source);

    const staleDelete = staleStorage.delete(source);
    await expectBarrier(mutation.entered, 'stale delete');
    await winningStorage.move(source, destination);
    mutation.release();
    await staleDelete;

    expect(await winningStorage.exists(source)).toBe(false);
    expect(await winningStorage.exists(destination)).toBe(true);
    expect(new TextDecoder().decode((await winningStorage.get(destination))?.body)).toBe(
        'survives stale delete'
    );
    expect(await bindings.MEDIA_BUCKET.head(`objects/${original.objectId}`)).not.toBeNull();
    expect(await lifecycleState(destination)).toMatchObject({
        objectId: original.objectId,
        indexState: 'ready',
        operationState: 'ready'
    });
});

it('keeps object_index and upload_operations together when a stale move loses its CAS', async () => {
    const source = 'assets/images/eventchronicle/events/upload/move-race/item.png';
    const staleDestination = 'assets/images/eventchronicle/events/used/move-race/stale.png';
    const winnerDestination = 'assets/images/eventchronicle/events/used/move-race/winner.png';
    const mutation = barrier();
    const staleStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onMutationPhase: (phase, context) => phase === 'move-read' && context.logicalKey === source
            ? mutation.wait()
            : undefined
    });
    const winningStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await staleStorage.put(source, new TextEncoder().encode('single destination'), {
        contentType: 'image/png'
    });

    const staleMove = staleStorage.move(source, staleDestination);
    await expectBarrier(mutation.entered, 'stale move');
    await winningStorage.move(source, winnerDestination);
    mutation.release();
    await expect(staleMove).rejects.toThrow('Concurrent object move');

    expect(await winningStorage.exists(staleDestination)).toBe(false);
    expect(await winningStorage.exists(winnerDestination)).toBe(true);
    const rows = await bindings.CORE_DB.prepare(
        `SELECT oi.logical_key AS index_key, u.logical_key AS operation_key,
                oi.state AS index_state, u.state AS operation_state
         FROM object_index oi JOIN upload_operations u ON u.object_id=oi.object_id
         WHERE oi.logical_key IN (?, ?)`
    ).bind(staleDestination, winnerDestination).all<{
        index_key: string;
        operation_key: string;
        index_state: string;
        operation_state: string;
    }>();
    expect(rows.results).toEqual([{
        index_key: winnerDestination,
        operation_key: winnerDestination,
        index_state: 'ready',
        operation_state: 'ready'
    }]);
});

it('does not let stale owner-conditional deletion damage a concurrently moved object', async () => {
    const source = 'assets/images/eventchronicle/events/upload/owned-delete-race/item.png';
    const destination = 'assets/images/eventchronicle/events/used/owned-delete-race/item.png';
    const ownerToken = 'owned-delete-generation';
    const mutation = barrier();
    const staleStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onMutationPhase: (phase, context) => phase === 'delete-read' && context.logicalKey === source
            ? mutation.wait()
            : undefined
    });
    const winningStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await staleStorage.put(source, new TextEncoder().encode('owned survivor'), {
        contentType: 'image/png',
        ownerToken
    });
    const original = await lifecycleState(source);

    const staleDelete = staleStorage.deleteIfOwned(source, ownerToken);
    await expectBarrier(mutation.entered, 'stale conditional delete');
    await expect(winningStorage.moveIfOwned(source, destination, ownerToken)).resolves.toBe(true);
    mutation.release();
    await expect(staleDelete).resolves.toBe(false);

    expect(await winningStorage.exists(destination)).toBe(true);
    expect(await bindings.MEDIA_BUCKET.head(`objects/${original.objectId}`)).not.toBeNull();
    expect(await lifecycleState(destination)).toMatchObject({
        objectId: original.objectId,
        indexState: 'ready',
        operationState: 'ready'
    });
});

it('returns false without splitting state when an owner-conditional move loses its CAS', async () => {
    const source = 'assets/images/eventchronicle/events/upload/owned-move-race/item.png';
    const staleDestination = 'assets/images/eventchronicle/events/used/owned-move-race/stale.png';
    const winnerDestination = 'assets/images/eventchronicle/events/used/owned-move-race/winner.png';
    const ownerToken = 'owned-move-generation';
    const mutation = barrier();
    const staleStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onMutationPhase: (phase, context) => phase === 'move-read' && context.logicalKey === source
            ? mutation.wait()
            : undefined
    });
    const winningStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await staleStorage.put(source, new TextEncoder().encode('owned move winner'), {
        contentType: 'image/png',
        ownerToken
    });

    const staleMove = staleStorage.moveIfOwned(source, staleDestination, ownerToken);
    await expectBarrier(mutation.entered, 'stale conditional move');
    await expect(winningStorage.moveIfOwned(source, winnerDestination, ownerToken)).resolves.toBe(true);
    mutation.release();
    await expect(staleMove).resolves.toBe(false);

    expect(await winningStorage.exists(staleDestination)).toBe(false);
    expect(await winningStorage.exists(winnerDestination)).toBe(true);
    expect(await lifecycleState(winnerDestination)).toMatchObject({
        indexState: 'ready',
        operationState: 'ready'
    });
});

it('atomically lets a business insert defeat stale pending-object recovery', async () => {
    const key = 'uploads/event/original/recovery-insert-race.png';
    const recovery = barrier();
    const recoveringStorage = new R2ObjectStorage(
        bindings.CORE_DB,
        bindings.MEDIA_BUCKET,
        undefined,
        {
            onRecoveryPhase: (phase, context) =>
                phase === 'before-pending-delete-cas' && context.logicalKey === key
                    ? recovery.wait()
                    : undefined
        }
    );
    await recoveringStorage.put(key, new TextEncoder().encode('business commit wins'), {
        contentType: 'image/png',
        deferredPublication: true
    });
    await backdateObject(key);

    const staleRecovery = recoveringStorage.recoverStaleUploads(10, 300);
    await expectBarrier(recovery.entered, 'pending-object recovery');
    const repository = new D1CoreRepository(bindings.CORE_DB);
    await expect(repository.insertEvent({
        title: 'Recovery race',
        name: 'Owner',
        contact: 'owner@example.test',
        imageUrl: `/${key}`
    })).resolves.toBeTypeOf('number');
    recovery.release();
    await staleRecovery;

    expect(await lifecycleState(key)).toMatchObject({
        indexState: 'pending',
        operationState: 'pending'
    });
    expect(await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).toMatchObject({
        objects: [{ key: expect.any(String) }]
    });
    await new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET).recoverStaleUploads(10, 300);
    expect(await lifecycleState(key)).toMatchObject({
        indexState: 'ready',
        operationState: 'ready'
    });
});

it('preserves referenced Chronicle uploads and rejects metadata pointing at a deleted object', async () => {
    const activityId = 'chronicle-pending-recovery';
    const filename = 'pending.png';
    const uploadKey = `assets/images/eventchronicle/events/upload/${activityId}/${filename}`;
    const metadataKey = `assets/images/eventchronicle/events/meta/${activityId}.json`;
    const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const metadata = new TextEncoder().encode(JSON.stringify({
        records: [{
            filename,
            status: 'pending',
            uploader: 'Producer',
            time: '2026-07-21T00:00:00.000Z',
            idempotencyKey: 'chronicle-pending'
        }]
    }));
    await storage.put(uploadKey, new TextEncoder().encode('pending image'), {
        contentType: 'image/png'
    });
    await storage.put(metadataKey, metadata, { contentType: 'application/json' });
    await backdateObject(uploadKey);

    await storage.recoverStaleUploads(10, 300);
    expect(await lifecycleState(uploadKey)).toMatchObject({
        indexState: 'pending',
        operationState: 'pending'
    });
    expect(await storage.get(uploadKey)).not.toBeNull();

    const inactiveActivityId = 'chronicle-inactive-commit';
    const inactiveFilename = 'inactive.png';
    const inactiveUploadKey =
        `assets/images/eventchronicle/events/upload/${inactiveActivityId}/${inactiveFilename}`;
    const inactiveMetadataKey =
        `assets/images/eventchronicle/events/meta/${inactiveActivityId}.json`;
    await storage.put(inactiveUploadKey, new TextEncoder().encode('deleted before commit'), {
        contentType: 'image/png'
    });
    await storage.delete(inactiveUploadKey);
    await expect(storage.put(inactiveMetadataKey, new TextEncoder().encode(JSON.stringify({
        records: [{
            filename: inactiveFilename,
            status: 'pending',
            idempotencyKey: 'chronicle-inactive'
        }]
    })), {
        contentType: 'application/json'
    })).rejects.toThrow('Chronicle metadata references an inactive object');
    expect(await bindings.CORE_DB.prepare(
        'SELECT COUNT(*) FROM chronicle_metadata WHERE activity_id=?'
    ).bind(inactiveActivityId).first<number>('COUNT(*)')).toBe(0);
    expect(await bindings.CORE_DB.prepare(
        'SELECT COUNT(*) FROM chronicle_items WHERE activity_id=?'
    ).bind(inactiveActivityId).first<number>('COUNT(*)')).toBe(0);
});

it('restores referenced trash to its recorded source and reclaims unreferenced trash', async () => {
    const activityId = 'trash-recovery';
    const filename = 'recover.png';
    const source = `assets/images/eventchronicle/events/upload/${activityId}/${filename}`;
    const firstTrash = `assets/images/eventchronicle/events/.trash/token-a/${filename}`;
    const secondTrash = `assets/images/eventchronicle/events/.trash/token-b/${filename}`;
    const metadataKey = `assets/images/eventchronicle/events/meta/${activityId}.json`;
    const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await storage.put(source, new TextEncoder().encode('recoverable trash'), {
        contentType: 'image/png'
    });
    await storage.put(metadataKey, new TextEncoder().encode(JSON.stringify({
        records: [{ filename, status: 'pending', idempotencyKey: 'trash-recovery' }]
    })), { contentType: 'application/json' });

    await storage.move(source, firstTrash);
    await backdateObject(firstTrash);
    await storage.recoverStaleUploads(10, 300);
    expect(await storage.exists(firstTrash)).toBe(false);
    expect(await storage.exists(source)).toBe(true);
    expect((await lifecycleState(source)).indexState).toBe('pending');

    await storage.move(source, secondTrash);
    await storage.put(metadataKey, new TextEncoder().encode(JSON.stringify({ records: [] })), {
        contentType: 'application/json'
    });
    await backdateObject(secondTrash);
    await storage.recoverStaleUploads(10, 300);
    expect(await storage.exists(secondTrash)).toBe(false);
    expect(await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).toMatchObject({ objects: [] });
});

it('quarantines and cleans the losing physical object in a concurrent different-digest put', async () => {
    const key = 'uploads/news/original/different-digest-race.png';
    const upload = barrier();
    const losingStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onUploadPhase: (phase, context) => phase === 'object-uploaded' && context.logicalKey === key
            ? upload.wait()
            : undefined
    });
    const winningStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const losingPut = losingStorage.put(key, new TextEncoder().encode('loser'), {
        contentType: 'image/png'
    });
    await expectBarrier(upload.entered, 'losing upload');
    await winningStorage.put(key, new TextEncoder().encode('winner'), {
        contentType: 'image/png'
    });
    upload.release();
    await expect(losingPut).rejects.toThrow('A newer object already owns the logical key');

    expect(new TextDecoder().decode((await winningStorage.get(key))?.body)).toBe('winner');
    const operations = await bindings.CORE_DB.prepare(
        `SELECT object_id, state FROM upload_operations WHERE logical_key=? ORDER BY state`
    ).bind(key).all<{ object_id: string; state: string }>();
    expect(operations.results.map((operation) => operation.state).sort()).toEqual(['deleted', 'ready']);
    expect(await bindings.CORE_DB.prepare(
        "SELECT COUNT(*) FROM compensation_jobs WHERE kind='delete-orphan-r2' AND state='pending'"
    ).first<number>('COUNT(*)')).toBe(1);

    await new D1CompensationService(bindings.CORE_DB, bindings.MEDIA_BUCKET).run(winningStorage);
    const physical = await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' });
    expect(physical.objects).toHaveLength(1);
    expect(physical.objects[0]?.key).toBe(`objects/${(await lifecycleState(key)).objectId}`);
});

it('preserves the previous object when it moves before its replacement is finalized', async () => {
    const source = 'fixtures/object-lifecycle/replace-move/source.png';
    const destination = 'fixtures/object-lifecycle/replace-move/destination.png';
    const upload = barrier();
    const replacingStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onUploadPhase: (phase, context) => phase === 'operation-created' && context.logicalKey === source
            ? upload.wait()
            : undefined
    });
    const movingStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await movingStorage.put(source, new TextEncoder().encode('previous object'), {
        contentType: 'image/png'
    });
    const previous = await lifecycleState(source);

    const replacement = replacingStorage.put(source, new TextEncoder().encode('replacement object'), {
        contentType: 'image/png'
    });
    await expectBarrier(upload.entered, 'replacement upload');
    try {
        await Promise.race([
            movingStorage.move(source, destination),
            new Promise<never>((_, reject) => setTimeout(
                () => reject(new Error('move did not complete while replacement was paused')),
                1_000
            ))
        ]);
    } finally {
        upload.release();
    }
    await expect(Promise.race([
        replacement,
        new Promise<never>((_, reject) => setTimeout(
            () => reject(new Error('replacement did not stop after move won')),
            1_000
        ))
    ])).rejects.toThrow('A newer object already owns the logical key');

    expect(await movingStorage.exists(source)).toBe(false);
    expect(new TextDecoder().decode((await movingStorage.get(destination))?.body)).toBe('previous object');
    expect(await lifecycleState(destination)).toMatchObject({
        objectId: previous.objectId,
        indexState: 'ready',
        operationState: 'ready'
    });
    expect(await bindings.MEDIA_BUCKET.head(`objects/${previous.objectId}`)).not.toBeNull();

    await replacingStorage.put(source, new TextEncoder().encode('replacement object'), {
        contentType: 'image/png'
    });
    await new D1CompensationService(bindings.CORE_DB, bindings.MEDIA_BUCKET).run(movingStorage);
    expect(new TextDecoder().decode((await movingStorage.get(source))?.body)).toBe('replacement object');
    expect(new TextDecoder().decode((await movingStorage.get(destination))?.body)).toBe('previous object');
    expect((await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).objects).toHaveLength(2);
});

it('keeps the replacement intact when it wins before a stale move CAS', async () => {
    const source = 'fixtures/object-lifecycle/move-replace/source.png';
    const destination = 'fixtures/object-lifecycle/move-replace/destination.png';
    const mutation = barrier();
    const movingStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onMutationPhase: (phase, context) => phase === 'move-read' && context.logicalKey === source
            ? mutation.wait()
            : undefined
    });
    const replacingStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await replacingStorage.put(source, new TextEncoder().encode('old object'), {
        contentType: 'image/png'
    });
    const previous = await lifecycleState(source);

    const staleMove = movingStorage.move(source, destination);
    await expectBarrier(mutation.entered, 'stale move before replacement');
    await replacingStorage.put(source, new TextEncoder().encode('new object'), {
        contentType: 'image/png'
    });
    mutation.release();
    await expect(staleMove).rejects.toThrow('Concurrent object move');

    expect(await replacingStorage.exists(destination)).toBe(false);
    expect(new TextDecoder().decode((await replacingStorage.get(source))?.body)).toBe('new object');
    expect(await bindings.MEDIA_BUCKET.head(`objects/${previous.objectId}`)).toBeNull();
    expect(await lifecycleState(source)).toMatchObject({
        indexState: 'ready',
        operationState: 'ready'
    });
});

it('rejects a replacement after its predecessor moves away and back with a new mutation epoch', async () => {
    const source = 'fixtures/object-lifecycle/move-aba/source.png';
    const destination = 'fixtures/object-lifecycle/move-aba/destination.png';
    const upload = barrier();
    const replacingStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onUploadPhase: (phase, context) => phase === 'operation-created' && context.logicalKey === source
            ? upload.wait()
            : undefined
    });
    const movingStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await movingStorage.put(source, new TextEncoder().encode('epoch owner'), {
        contentType: 'image/png'
    });
    const original = await lifecycleState(source);

    const replacement = replacingStorage.put(source, new TextEncoder().encode('stale replacement'), {
        contentType: 'image/png'
    });
    await expectBarrier(upload.entered, 'ABA replacement upload');
    await movingStorage.move(source, destination);
    await movingStorage.move(destination, source);
    upload.release();
    await expect(replacement).rejects.toThrow('A newer object already owns the logical key');

    expect(await lifecycleState(source)).toMatchObject({
        objectId: original.objectId,
        indexState: 'ready',
        operationState: 'ready'
    });
    expect(new TextDecoder().decode((await movingStorage.get(source))?.body)).toBe('epoch owner');
});

it('does not overwrite an unrelated tombstone created after an absent predecessor snapshot', async () => {
    const key = 'fixtures/object-lifecycle/absent-tombstone/key.png';
    const upload = barrier();
    const staleStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onUploadPhase: (phase, context) => phase === 'operation-created' && context.logicalKey === key
            ? upload.wait()
            : undefined
    });
    const interveningStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const stalePut = staleStorage.put(key, new TextEncoder().encode('stale absent snapshot'), {
        contentType: 'image/png'
    });
    await expectBarrier(upload.entered, 'absent predecessor upload');
    await interveningStorage.put(key, new TextEncoder().encode('intervening object'), {
        contentType: 'image/png'
    });
    const intervening = await lifecycleState(key);
    await interveningStorage.delete(key);
    upload.release();
    await expect(stalePut).rejects.toThrow('A newer object already owns the logical key');

    const tombstone = await bindings.CORE_DB.prepare(
        'SELECT object_id, state FROM object_index WHERE logical_key=?'
    ).bind(key).first<{ object_id: string; state: string }>();
    expect(tombstone).toEqual({ object_id: intervening.objectId, state: 'deleted' });
    await new D1CompensationService(bindings.CORE_DB, bindings.MEDIA_BUCKET).run(interveningStorage);
    expect(await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).toMatchObject({ objects: [] });
});

it('treats the same object already moved to the desired destination as converged', async () => {
    const source = 'fixtures/object-lifecycle/converged-move/source.png';
    const destination = 'fixtures/object-lifecycle/converged-move/destination.png';
    const firstRead = barrier();
    const secondRead = barrier();
    const firstStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onMutationPhase: (phase, context) => phase === 'move-read' && context.logicalKey === source
            ? firstRead.wait()
            : undefined
    });
    const secondStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onMutationPhase: (phase, context) => phase === 'move-read' && context.logicalKey === source
            ? secondRead.wait()
            : undefined
    });
    await firstStorage.put(source, new TextEncoder().encode('one physical object'), {
        contentType: 'image/png'
    });
    const original = await lifecycleState(source);

    const firstMove = firstStorage.move(source, destination);
    await expectBarrier(firstRead.entered, 'first convergent move');
    const secondMove = secondStorage.move(source, destination);
    await expectBarrier(secondRead.entered, 'second convergent move');
    firstRead.release();
    await firstMove;
    secondRead.release();
    await expect(secondMove).resolves.toBeUndefined();

    expect(await lifecycleState(destination)).toMatchObject({
        objectId: original.objectId,
        indexState: 'ready',
        operationState: 'ready'
    });
    expect(await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).toMatchObject({
        objects: [{ key: `objects/${original.objectId}` }]
    });
});

it('releases the source put identity after move and preserves the active destination', async () => {
    const source = 'fixtures/object-lifecycle/move-source-reuse/source.png';
    const destination = 'fixtures/object-lifecycle/move-source-reuse/destination.png';
    const body = new TextEncoder().encode('source identity can be reused');
    const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await storage.put(source, body, { contentType: 'image/png' });
    const movedObject = await lifecycleState(source);

    await storage.move(source, destination);
    expect(await lifecycleState(destination)).toMatchObject({
        objectId: movedObject.objectId,
        indexState: 'ready',
        operationState: 'ready'
    });
    await storage.put(source, body, { contentType: 'image/png' });

    const reusedSource = await lifecycleState(source);
    expect(reusedSource).toMatchObject({
        indexState: 'ready',
        operationState: 'ready',
        incarnation: 2
    });
    expect(reusedSource.objectId).not.toBe(movedObject.objectId);
    expect(await lifecycleState(destination)).toMatchObject({
        objectId: movedObject.objectId,
        indexState: 'ready',
        operationState: 'ready'
    });
    expect(new TextDecoder().decode((await storage.get(source))?.body)).toBe(
        'source identity can be reused'
    );
    expect(new TextDecoder().decode((await storage.get(destination))?.body)).toBe(
        'source identity can be reused'
    );
    expect((await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).objects).toHaveLength(2);
});

it('restores source metadata when reusing a moved identity after destination deletion', async () => {
    const source = 'fixtures/object-lifecycle/move-delete-source-reuse/source.png';
    const destination = 'fixtures/object-lifecycle/move-delete-source-reuse/destination.png';
    const body = new TextEncoder().encode('deleted destination releases source');
    const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await storage.put(source, body, { contentType: 'image/png' });
    const original = await lifecycleState(source);
    await storage.move(source, destination);
    await storage.delete(destination);

    await expect(storage.put(source, body, { contentType: 'image/png' })).resolves.toMatchObject({
        size: body.byteLength
    });
    const reused = await lifecycleState(source);
    expect(reused).toMatchObject({
        indexState: 'ready',
        operationState: 'ready',
        incarnation: 2
    });
    expect(reused.objectId).not.toBe(original.objectId);
    expect(await storage.exists(destination)).toBe(false);
    expect((await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).objects).toHaveLength(1);
});

it('does not let referenced Chronicle pending objects starve a later orphan from recovery', async () => {
    const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const referencedKeys: string[] = [];
    for (let index = 0; index < 12; index += 1) {
        const activityId = `pending-starvation-${String(index).padStart(2, '0')}`;
        const filename = 'referenced.png';
        const key = `assets/images/eventchronicle/events/upload/${activityId}/${filename}`;
        referencedKeys.push(key);
        await storage.put(key, new TextEncoder().encode(`referenced-${index}`), {
            contentType: 'image/png'
        });
        await storage.put(
            `assets/images/eventchronicle/events/meta/${activityId}.json`,
            new TextEncoder().encode(JSON.stringify({
                records: [{ filename, status: 'pending', idempotencyKey: `referenced-${index}` }]
            })),
            { contentType: 'application/json' }
        );
        await backdateObject(key);
    }
    const orphan = 'assets/images/eventchronicle/events/upload/pending-starvation-zz/orphan.png';
    await storage.put(orphan, new TextEncoder().encode('orphan'), { contentType: 'image/png' });
    await backdateObject(orphan);

    await storage.recoverStaleUploads(10, 300);
    await storage.recoverStaleUploads(10, 300);

    expect(await storage.exists(orphan)).toBe(false);
    for (const key of referencedKeys) {
        expect(await lifecycleState(key)).toMatchObject({
            indexState: 'pending',
            operationState: 'pending'
        });
    }
});

it('reclaims stale ready orphans left by metadata-first Chronicle and business deletion', async () => {
    const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    const repository = new D1CoreRepository(bindings.CORE_DB);

    const activityId = 'ready-orphan';
    const filename = 'used.png';
    const usedKey = `assets/images/eventchronicle/events/used/${activityId}/${filename}`;
    const metadataKey = `assets/images/eventchronicle/events/meta/${activityId}.json`;
    await storage.put(usedKey, new TextEncoder().encode('used orphan'), { contentType: 'image/png' });
    await storage.put(metadataKey, new TextEncoder().encode(JSON.stringify({
        records: [{ filename, status: 'approved', idempotencyKey: 'ready-orphan' }]
    })), { contentType: 'application/json' });
    await storage.put(metadataKey, new TextEncoder().encode(JSON.stringify({ records: [] })), {
        contentType: 'application/json'
    });
    await backdateObject(usedKey);

    const newsKey = 'uploads/news/original/ready-orphan.png';
    await storage.put(newsKey, new TextEncoder().encode('news orphan'), {
        contentType: 'image/png',
        deferredPublication: true
    });
    const newsId = await repository.insertNews({
        title: 'Ready orphan',
        image: `/${newsKey}`,
        thumbnail: '',
        content: 'https://example.test/news',
        date: '2026-07-21T00:00:00.000Z',
        author: 'Producer'
    });
    await storage.publish(newsKey);
    await repository.deleteNews(newsId);
    await backdateObject(newsKey);

    const eventKey = 'uploads/event/original/ready-orphan.png';
    await storage.put(eventKey, new TextEncoder().encode('event orphan'), {
        contentType: 'image/png',
        deferredPublication: true
    });
    const eventId = await repository.insertEvent({
        title: 'Ready orphan',
        name: 'Owner',
        contact: 'owner@example.test',
        imageUrl: `/${eventKey}`
    });
    await storage.publish(eventKey);
    await repository.deleteEvent(eventId);
    await backdateObject(eventKey);

    const cardFront = 'uploads/namecard/original/ready-orphan-front.webp';
    const cardBack = 'uploads/namecard/original/ready-orphan-back.webp';
    await storage.put(cardFront, new TextEncoder().encode('card front'), { contentType: 'image/webp' });
    await storage.put(cardBack, new TextEncoder().encode('card back'), { contentType: 'image/webp' });
    const cardId = await repository.insertPendingCard({
        image1Url: `/${cardFront}`,
        image2Url: `/${cardBack}`,
        hash1: 'front-hash',
        hash2: 'back-hash',
        ip: '203.0.113.80'
    });
    await repository.deleteCard(cardId);
    await backdateObject(cardFront);
    await backdateObject(cardBack);

    await storage.recoverStaleUploads(10, 300);

    for (const key of [usedKey, newsKey, eventKey, cardFront, cardBack]) {
        expect(await storage.exists(key)).toBe(false);
        expect(await lifecycleState(key)).toMatchObject({
            indexState: 'deleted',
            operationState: 'deleted'
        });
    }
    expect(await bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })).toMatchObject({ objects: [] });
});
