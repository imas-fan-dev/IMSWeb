import { env } from 'cloudflare:workers';
import { applyD1Migrations, reset } from 'cloudflare:test';
import { beforeEach, expect, it } from 'vitest';
import { createHonoApp } from '@/app';
import { D1CompensationService } from '@/adapters/cloudflare/d1-compensation-service';
import { D1CoreRepository } from '@/adapters/cloudflare/d1-core-repository';
import { D1IdempotencyStore } from '@/adapters/cloudflare/d1-idempotency-store';
import { D1RateLimiter } from '@/adapters/cloudflare/d1-rate-limiter';
import {
    fetchFinalR2Object,
    R2ObjectStorage,
    type R2UploadContext,
    type R2UploadPhase
} from '@/adapters/cloudflare/r2-object-storage';
import type { WorkerBindings } from '@/adapters/cloudflare/worker-bindings';
import { HmacTokenService } from '@/adapters/shared/hmac-token-service';
import type { CompensationService } from '@/ports/compensation-service';
import type { CoreRepository } from '@/ports/core-repository';
import type { ImageProcessor } from '@/ports/image-processor';
import type { ObjectStorage } from '@/ports/object-storage';
import type { ParsedUpload, UploadParser } from '@/ports/upload-parser';
import type { RuntimeServices } from '@/ports/runtime-services';
import {
    assertChronicleRateContract,
    assertConcurrentRateLimiterContract,
    assertCoreMutationContract,
    assertPostCommitMediaContract,
    assertRouteUploadBoundaryContract,
    type ControlledUpload
} from '../contracts/runtime-contracts.js';

const bindings = env as Cloudflare.Env & WorkerBindings;
const USERNAME = 'worker-matrix-op';
const PASSWORD = 'worker-password';
const PRODUCER = 'Worker Contract Producer';
const APPROVED_CARD_ID = 700;
const PASSWORD_HASH = '$2b$04$1RWQGTyc2pruYfMggRdx7e2v3mef7H9H/hvipHXY9EF/S5VBPcYyK';

class ControlledUploadParser implements UploadParser {
    next?: ParsedUpload;
    calls = 0;

    set(value: ControlledUpload): void {
        this.next = value;
    }

    async parse(): Promise<ParsedUpload> {
        this.calls += 1;
        if (!this.next) throw new Error('Controlled upload was not configured');
        const value = this.next;
        this.next = undefined;
        return value;
    }
}

const images: ImageProcessor = {
    async validate() {
        return { format: 'png', width: 1, height: 1, contentType: 'image/png' };
    },
    async toWebp(body) {
        return Uint8Array.of(0x52, 0x49, 0x46, 0x46, body[0] || 0);
    },
    async thumbnailPng(body) {
        return Uint8Array.of(0x89, 0x50, 0x4e, 0x47, body[0] || 0);
    },
    async resizeJpeg(body) {
        return Uint8Array.of(0xff, 0xd8, 0xff, body[0] || 0);
    }
};

beforeEach(() => reset());

async function applyCoreMigrations(): Promise<void> {
    await applyD1Migrations(bindings.CORE_DB, bindings.TEST_CORE_MIGRATIONS);
}

function clientAddress(client: string): string {
    return client === 'replay-client' ? '203.0.113.201'
        : client === 'distinct-client' ? '203.0.113.202'
            : '203.0.113.100';
}

async function physicalObjectCount(): Promise<number> {
    let cursor: string | undefined;
    let count = 0;
    do {
        const page = await bindings.MEDIA_BUCKET.list({ prefix: 'objects/', cursor });
        count += page.objects.length;
        cursor = page.truncated ? page.cursor : undefined;
    } while (cursor);
    return count;
}

async function createFixture() {
    await applyCoreMigrations();
    await bindings.CORE_DB.batch([
        bindings.CORE_DB.prepare(
            `INSERT INTO users (username, password, dept, producername)
             VALUES (?, ?, 'op', ?)`
        ).bind(USERNAME, PASSWORD_HASH, PRODUCER),
        bindings.CORE_DB.prepare(
            `INSERT INTO cards (id, image1_url, image2_url, status)
             VALUES (?, '/seed-front.webp', '/seed-back.webp', 'approved')`
        ).bind(APPROVED_CARD_ID)
    ]);

    const parser = new ControlledUploadParser();
    const compensationDelegate = new D1CompensationService(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    let businessInsertFailure = false;
    let deleteFailure = false;
    let putFailure = false;
    let publishFailure = false;
    let compensationEnqueueFailure = false;
    let storageMutations = 0;
    const coreDelegate = new D1CoreRepository(bindings.CORE_DB);
    const core = new Proxy(coreDelegate, {
        get(target, property, receiver) {
            if (property === 'insertNews') {
                return async (...args: Parameters<CoreRepository['insertNews']>) => {
                    if (businessInsertFailure) throw new Error('injected news insert failure');
                    return target.insertNews(...args);
                };
            }
            if (property === 'insertEvent') {
                return async (...args: Parameters<CoreRepository['insertEvent']>) => {
                    if (businessInsertFailure) throw new Error('injected event insert failure');
                    return target.insertEvent(...args);
                };
            }
            const value = Reflect.get(target, property, receiver) as unknown;
            return typeof value === 'function' ? value.bind(target) : value;
        }
    }) as CoreRepository;
    const compensation = new Proxy(compensationDelegate, {
        get(target, property, receiver) {
            if (property === 'enqueue') {
                return async (...args: Parameters<CompensationService['enqueue']>) => {
                    if (compensationEnqueueFailure) {
                        throw new Error('injected compensation enqueue failure');
                    }
                    return target.enqueue(...args);
                };
            }
            const value = Reflect.get(target, property, receiver) as unknown;
            return typeof value === 'function' ? value.bind(target) : value;
        }
    }) as CompensationService;
    const delegate = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, compensation);
    const storage = new Proxy(delegate, {
        get(target, property, receiver) {
            if (property === 'delete') {
                return async (key: string) => {
                    if (deleteFailure) throw new Error('injected object delete failure');
                    storageMutations += 1;
                    return target.delete(key);
                };
            }
            if (property === 'put') {
                return async (...args: Parameters<ObjectStorage['put']>) => {
                    if (putFailure) throw new Error('injected object put failure');
                    storageMutations += 1;
                    return target.put(...args);
                };
            }
            if (property === 'putIfUnchanged') {
                return async (...args: Parameters<NonNullable<ObjectStorage['putIfUnchanged']>>) => {
                    storageMutations += 1;
                    return target.putIfUnchanged(...args);
                };
            }
            if (property === 'publish') {
                return async (key: string) => {
                    if (publishFailure) throw new Error('injected object publish failure');
                    await target.publish(key);
                };
            }
            const value = Reflect.get(target, property, receiver) as unknown;
            return typeof value === 'function' ? value.bind(target) : value;
        }
    }) as ObjectStorage;
    const runtime: RuntimeServices = {
        core,
        compensation,
        storage,
        images,
        idempotency: new D1IdempotencyStore(bindings.CORE_DB),
        passwords: { async verify(value, digest) { return value === PASSWORD && digest === PASSWORD_HASH; } },
        tokens: new HmacTokenService(bindings.IMS_JWT_SECRET),
        rateLimiter: new D1RateLimiter(bindings.CORE_DB),
        uploads: parser,
        config: { cookieSecure: true, clientAddressSource: 'cloudflare' }
    };
    const app = createHonoApp(() => runtime);
    const request = (pathname: string, init: RequestInit = {}): Promise<Response> => {
        const headers = new Headers(init.headers);
        if (!headers.has('cf-connecting-ip')) headers.set('CF-Connecting-IP', clientAddress('default'));
        return Promise.resolve(app.request(`http://ims.test${pathname}`, { ...init, headers }));
    };

    const uploadSnapshot = async () => ({
        news: await bindings.CORE_DB.prepare('SELECT COUNT(*) FROM news').first<number>('COUNT(*)') ?? 0,
        events: await bindings.CORE_DB.prepare('SELECT COUNT(*) FROM events').first<number>('COUNT(*)') ?? 0,
        cards: await bindings.CORE_DB.prepare('SELECT COUNT(*) FROM cards').first<number>('COUNT(*)') ?? 0,
        chronicle: await bindings.CORE_DB.prepare(
            "SELECT COUNT(*) FROM chronicle_items WHERE status<>'deleted'"
        ).first<number>('COUNT(*)') ?? 0,
        objects: await physicalObjectCount()
    });

    const postCommitSnapshot = async () => {
        const [upload, lifecycle, compensationPending] = await Promise.all([
            uploadSnapshot(),
            bindings.CORE_DB.prepare(
                `SELECT state, COUNT(*) AS count FROM object_index
                 WHERE logical_key LIKE 'uploads/news/%'
                    OR logical_key LIKE 'uploads/event/%'
                    OR logical_key LIKE 'uploads/namecard/%'
                 GROUP BY state`
            ).all<{ state: string; count: number }>(),
            bindings.CORE_DB.prepare(
                "SELECT COUNT(*) FROM compensation_jobs WHERE state<>'completed'"
            ).first<number>('COUNT(*)')
        ]);
        const count = (state: string) => lifecycle.results
            .filter((row) => row.state === state)
            .reduce((sum, row) => sum + row.count, 0);
        return {
            news: upload.news,
            events: upload.events,
            cards: upload.cards,
            objects: upload.objects,
            compensationPending: compensationPending ?? 0,
            pendingPublications: count('pending'),
            readyPublications: count('ready')
        };
    };

    const mediaDeletionTargets = async () => ({
        news: await bindings.CORE_DB.prepare(
            "SELECT id FROM news WHERE image<>'' ORDER BY id DESC LIMIT 1"
        ).first<number>('id') ?? 0,
        event: await bindings.CORE_DB.prepare(
            "SELECT id FROM events WHERE image_url<>'' ORDER BY id DESC LIMIT 1"
        ).first<number>('id') ?? 0,
        card: await bindings.CORE_DB.prepare(
            'SELECT id FROM cards ORDER BY id DESC LIMIT 1'
        ).first<number>('id') ?? 0
    });

    const opToken = async (): Promise<string> => {
        const response = await request('/api/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: USERNAME, password: PASSWORD })
        });
        expect(response.status).toBe(200);
        return (await response.json<{ token: string }>()).token;
    };

    return {
        request,
        setUpload: (upload: ControlledUpload) => parser.set(upload),
        async snapshot() {
            const upload = await uploadSnapshot();
            const audit = await bindings.CORE_DB.prepare(
                'SELECT action FROM logs ORDER BY id'
            ).all<{ action: string }>();
            const compensationStates = await bindings.CORE_DB.prepare(
                'SELECT state FROM compensation_jobs'
            ).all<{ state: string }>();
            return {
                news: upload.news,
                events: upload.events,
                cards: upload.cards,
                reactions: await bindings.CORE_DB.prepare(
                    'SELECT COALESCE(SUM(count), 0) FROM card_emojis'
                ).first<number>('COALESCE(SUM(count), 0)') ?? 0,
                auditActions: audit.results.map((row) => row.action),
                objects: upload.objects,
                compensation: {
                    pending: compensationStates.results.filter((row) => row.state !== 'completed').length,
                    completed: compensationStates.results.filter((row) => row.state === 'completed').length
                }
            };
        },
        uploadSnapshot,
        opToken,
        failObjectDeletes(value: boolean) { deleteFailure = value; },
        failBusinessInserts(value: boolean) { businessInsertFailure = value; },
        failObjectPuts(value: boolean) { putFailure = value; },
        failObjectPublishes(value: boolean) { publishFailure = value; },
        failCompensationEnqueues(value: boolean) { compensationEnqueueFailure = value; },
        postCommitSnapshot,
        mediaDeletionTargets,
        recoverPublications: () => delegate.recoverStaleUploads(100, 0),
        runCompensation: () => compensation.run(storage, 100),
        async uploadChronicle(
            key: string,
            client: string,
            activityId: string,
            body: BodyInit = '--contract--'
        ) {
            parser.set({
                fields: { activityId, username: 'Rate Contract' },
                files: { images: [{ filename: 'rate.png', contentType: 'image/png', body: Uint8Array.of(1) }] }
            });
            const init: RequestInit & { duplex?: 'half' } = {
                method: 'POST',
                headers: {
                    'Content-Type': 'multipart/form-data; boundary=contract',
                    'Idempotency-Key': key,
                    'CF-Connecting-IP': clientAddress(client)
                },
                body
            };
            if (body instanceof ReadableStream) init.duplex = 'half';
            return request('/eventchronicle/upload', init);
        },
        async rateSnapshot(client: string) {
            return {
                count: await bindings.CORE_DB.prepare(
                    `SELECT COUNT(*) FROM rate_limit_events
                     WHERE bucket='public-upload' AND client_key=?`
                ).bind(clientAddress(client)).first<number>('COUNT(*)') ?? 0,
                writeCount: await bindings.CORE_DB.prepare(
                    `SELECT COUNT(*) FROM rate_limit_events
                     WHERE bucket='chronicle-upload-write' AND client_key=?`
                ).bind(clientAddress(client)).first<number>('COUNT(*)') ?? 0,
                attemptCount: await bindings.CORE_DB.prepare(
                    `SELECT COUNT(*) FROM rate_limit_events
                     WHERE bucket='chronicle-upload-attempt' AND client_key=?`
                ).bind(clientAddress(client)).first<number>('COUNT(*)') ?? 0,
                records: await bindings.CORE_DB.prepare(
                    "SELECT COUNT(*) FROM chronicle_items WHERE status<>'deleted'"
                ).first<number>('COUNT(*)') ?? 0,
                objects: await physicalObjectCount(),
                parserCalls: parser.calls,
                storageMutations
            };
        }
    };
}

it('[CORE-01] shared mutation contract uses Worker D1/R2 adapters', { timeout: 60_000 }, async () => {
    const fixture = await createFixture();
    await assertCoreMutationContract({
        runtime: 'Worker',
        username: USERNAME,
        password: PASSWORD,
        producername: PRODUCER,
        approvedCardId: APPROVED_CARD_ID,
        ...fixture
    });
});

it('[STATE-01] post-commit media failures remain recoverable in Worker D1/R2', async () => {
    const fixture = await createFixture();
    await assertPostCommitMediaContract({ runtime: 'Worker', ...fixture });
});

it('[MEDIA-01] shared route boundaries use Worker D1/R2 adapters', { timeout: 120_000 }, async () => {
    const fixture = await createFixture();
    await assertRouteUploadBoundaryContract({ runtime: 'Worker', ...fixture });
});

it('[STATE-01] shared Chronicle upload budgets run before parsing with the Worker limiter', { timeout: 120_000 }, async () => {
    const fixture = await createFixture();
    await assertChronicleRateContract({ runtime: 'Worker', ...fixture });
});

it('[STATE-01] concurrent rate identities remain atomic in D1', async () => {
    await applyCoreMigrations();
    const limiter = new D1RateLimiter(bindings.CORE_DB);
    await assertConcurrentRateLimiterContract({
        runtime: 'Worker',
        consume: (client, identity) => limiter.consume(
            'concurrent-contract', client, 30, 60 * 60,
            { operation: 'chronicle:upload', identity }
        ),
        async count(client) {
            return await bindings.CORE_DB.prepare(
                `SELECT COUNT(*) FROM rate_limit_events
                 WHERE bucket='concurrent-contract' AND client_key=?`
            ).bind(client).first<number>('COUNT(*)') ?? 0;
        }
    });
});

interface RecoverySnapshot {
    operations: Array<Record<string, unknown>>;
    index: Array<Record<string, unknown>>;
    jobs: Array<Record<string, unknown>>;
    physicalKeys: string[];
}

async function recoverySnapshot(): Promise<RecoverySnapshot> {
    const [operations, index, jobs, objects] = await Promise.all([
        bindings.CORE_DB.prepare(
            `SELECT id, state, logical_key, object_id, target_state, byte_size, content_type
             FROM upload_operations ORDER BY id`
        ).all<Record<string, unknown>>(),
        bindings.CORE_DB.prepare(
            'SELECT logical_key, object_id, state, byte_size, content_type FROM object_index ORDER BY logical_key'
        ).all<Record<string, unknown>>(),
        bindings.CORE_DB.prepare(
            'SELECT id, kind, state, attempts FROM compensation_jobs ORDER BY id'
        ).all<Record<string, unknown>>(),
        bindings.MEDIA_BUCKET.list({ prefix: 'objects/' })
    ]);
    return {
        operations: operations.results,
        index: index.results,
        jobs: jobs.results,
        physicalKeys: objects.objects.map((object) => object.key).sort()
    };
}

for (const phase of ['operation-created', 'object-uploaded', 'index-written'] as const) {
    it(`[STATE-01] stale scanner converges after ${phase} crash`, async () => {
        await applyCoreMigrations();
        const key = `uploads/news/original/crash-${phase}.png`;
        const body = new TextEncoder().encode(`crash-${phase}`);
        let crashed = false;
        const storage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
            onUploadPhase(current: R2UploadPhase) {
                if (!crashed && current === phase) {
                    crashed = true;
                    throw new Error(`simulated hard crash at ${phase}`);
                }
            }
        });

        await expect(storage.put(key, body, { contentType: 'image/png' })).rejects.toThrow(
            `simulated hard crash at ${phase}`
        );
        expect(crashed).toBe(true);
        expect(await fetchFinalR2Object(
            bindings.CORE_DB,
            bindings.MEDIA_BUCKET,
            key,
            new Request(`http://ims.test/${key}`)
        )).toBeNull();

        await bindings.CORE_DB.prepare(
            "UPDATE upload_operations SET updated_at=datetime('now', '-10 minutes') WHERE logical_key=?"
        ).bind(key).run();
        await storage.recoverStaleUploads(10, 0);
        const first = await recoverySnapshot();
        await storage.recoverStaleUploads(10, 0);
        const second = await recoverySnapshot();
        expect(second).toEqual(first);

        const operation = first.operations.find((row) => row.logical_key === key);
        expect(operation).toBeTruthy();
        if (phase === 'operation-created') {
            expect(operation?.state).toBe('deleted');
            expect(first.index).toEqual([]);
            expect(first.physicalKeys).toEqual([]);
            expect(await fetchFinalR2Object(
                bindings.CORE_DB, bindings.MEDIA_BUCKET, key,
                new Request(`http://ims.test/${key}`)
            )).toBeNull();
        } else {
            expect(operation?.state).toBe('ready');
            expect(first.index).toEqual([
                expect.objectContaining({ logical_key: key, state: 'ready' })
            ]);
            expect(first.physicalKeys).toHaveLength(1);
            const response = await fetchFinalR2Object(
                bindings.CORE_DB, bindings.MEDIA_BUCKET, key,
                new Request(`http://ims.test/${key}`)
            );
            expect(response?.status).toBe(200);
            expect(new TextDecoder().decode(await response?.arrayBuffer())).toBe(`crash-${phase}`);
        }
    });
}

it('[STATE-01] direct retry reuses stable operation and object after R2 PUT crash', async () => {
    await applyCoreMigrations();
    const key = 'uploads/news/original/direct-retry.png';
    const body = new TextEncoder().encode('direct-retry-body');
    let context: R2UploadContext | undefined;
    const crashing = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET, undefined, {
        onUploadPhase(phase, current) {
            if (phase === 'object-uploaded') {
                context = current;
                throw new Error('simulated retryable PUT crash');
            }
        }
    });
    await expect(crashing.put(key, body, { contentType: 'image/png' })).rejects.toThrow(
        'simulated retryable PUT crash'
    );
    expect(context).toBeTruthy();
    const crashed = await recoverySnapshot();
    expect(crashed.operations).toEqual([
        expect.objectContaining({
            id: context?.operationId,
            object_id: context?.objectId,
            logical_key: key,
            state: 'uploading'
        })
    ]);
    expect(crashed.physicalKeys).toEqual([`objects/${context?.objectId}`]);
    expect(crashed.index).toEqual([]);

    const retrying = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);
    await retrying.put(key, body, { contentType: 'image/png' });
    const completed = await recoverySnapshot();
    expect(completed.operations).toEqual([
        expect.objectContaining({
            id: context?.operationId,
            object_id: context?.objectId,
            logical_key: key,
            state: 'ready'
        })
    ]);
    expect(completed.index).toEqual([
        expect.objectContaining({ logical_key: key, object_id: context?.objectId, state: 'ready' })
    ]);
    expect(completed.physicalKeys).toEqual([`objects/${context?.objectId}`]);

    await retrying.put(key, body, { contentType: 'image/png' });
    expect(await recoverySnapshot()).toEqual(completed);
    const response = await fetchFinalR2Object(
        bindings.CORE_DB, bindings.MEDIA_BUCKET, key,
        new Request(`http://ims.test/${key}`)
    );
    expect(response?.status).toBe(200);
    expect(new TextDecoder().decode(await response?.arrayBuffer())).toBe('direct-retry-body');
});
