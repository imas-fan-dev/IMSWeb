import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { FilesystemCompensationService } from '@/infra/oss/filesystem/compensation-service';
import { FilesystemIdempotencyStore } from '@/infra/cache/filesystem/idempotency-store';
import { FilesystemObjectStorage } from '@/infra/oss/filesystem/object-storage';
import { NodeStaticAssets } from '@/infra/http/filesystem/static-assets';
import type { ObjectStorage } from '@/ports/object-storage';
import type { RuntimeServices } from '@/ports/runtime-services';
import {
    createNodeServiceLifecycle,
    initializeNodeRepositories
} from '@/runtime/node-services';
import { parseClientAddressSource, parseStoryMaxUploadBytes } from '@/config/env';
import { parseNodeDatabaseConfig } from '@/config/database';
import { parseNodeObjectStorageConfig } from '@/config/object-storage';

async function temporaryDirectory(prefix: string): Promise<string> {
    return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test('Node repository initialization closes every constructed resource after partial failure', async () => {
    const calls: string[] = [];
    const core = {
        async initialize() { calls.push('core:init'); },
        async close() { calls.push('core:close'); }
    };
    const story = {
        async initialize() { calls.push('story:init'); throw new Error('story init failed'); },
        async close() { calls.push('story:close'); }
    };

    await assert.rejects(initializeNodeRepositories(core, story), /story init failed/);
    assert.deepEqual(calls, ['core:init', 'story:init', 'story:close', 'core:close']);
});

test('story upload byte limit accepts only a positive bounded safe integer', () => {
    assert.equal(parseStoryMaxUploadBytes(undefined), 50 * 1024 * 1024);
    assert.equal(parseStoryMaxUploadBytes('1'), 1);
    assert.equal(parseStoryMaxUploadBytes('52428800'), 50 * 1024 * 1024);
    for (const value of ['', 'abc', '0', '-1', '1.5', 'Infinity', '52428801']) {
        assert.throws(() => parseStoryMaxUploadBytes(value), /IMS_STORY_MAX_UPLOAD_BYTES must be/);
    }
});

test('Node trusts proxy address headers only when Nginx is explicit', () => {
    assert.equal(parseClientAddressSource(undefined), 'direct');
    assert.equal(parseClientAddressSource(' nginx '), 'nginx');
    assert.throws(
        () => parseClientAddressSource('automatic'),
        /IMS_CLIENT_ADDRESS_SOURCE must be direct or nginx/
    );
});

test('early close does not poison a later Node service and concurrent close is idempotent', async () => {
    let creates = 0;
    let coreCloses = 0;
    let storyCloses = 0;
    let storageCloses = 0;
    const lifecycle = createNodeServiceLifecycle(async () => {
        creates += 1;
        return {
            auth: { close: async () => { coreCloses += 1; } },
            story: { close: async () => { storyCloses += 1; } },
            storage: { close: () => { storageCloses += 1; } }
        } as unknown as RuntimeServices;
    });

    await lifecycle.close();
    await lifecycle.resolve();
    await Promise.all([lifecycle.close(), lifecycle.close()]);
    assert.deepEqual(
        { creates, coreCloses, storyCloses, storageCloses },
        { creates: 1, coreCloses: 1, storyCloses: 1, storageCloses: 1 }
    );

    await lifecycle.resolve();
    await lifecycle.close();
    assert.deepEqual(
        { creates, coreCloses, storyCloses, storageCloses },
        { creates: 2, coreCloses: 2, storyCloses: 2, storageCloses: 2 }
    );
});

test('Node object storage configuration defaults locally and validates S3 settings', () => {
    assert.deepEqual(parseNodeObjectStorageConfig({}), { type: 'filesystem' });
    assert.deepEqual(parseNodeObjectStorageConfig({
        IMS_OBJECT_STORAGE: ' S3 ',
        IMS_S3_BUCKET: 'ims-media-prod',
        AWS_REGION: 'ap-northeast-1',
        IMS_S3_ENDPOINT: 'https://objects.example.test/',
        IMS_S3_FORCE_PATH_STYLE: 'yes',
        IMS_S3_PREFIX: '/ims/production/'
    }), {
        type: 's3',
        bucket: 'ims-media-prod',
        region: 'ap-northeast-1',
        endpoint: 'https://objects.example.test',
        forcePathStyle: true,
        prefix: 'ims/production',
        readUrlTtlSeconds: 300
    });

    assert.throws(
        () => parseNodeObjectStorageConfig({ IMS_OBJECT_STORAGE: 's3' }),
        /IMS_S3_BUCKET is required/
    );
    assert.throws(
        () => parseNodeObjectStorageConfig({
            IMS_OBJECT_STORAGE: 's3',
            IMS_S3_BUCKET: 'ims-media-prod'
        }),
        /IMS_S3_REGION or AWS_REGION is required/
    );
    assert.throws(
        () => parseNodeObjectStorageConfig({ IMS_OBJECT_STORAGE: 'database' }),
        /filesystem or s3/
    );
    assert.throws(
        () => parseNodeObjectStorageConfig({
            IMS_OBJECT_STORAGE: 's3',
            IMS_S3_BUCKET: 'ims-media-prod',
            IMS_S3_REGION: 'ap-northeast-1',
            IMS_S3_FORCE_PATH_STYLE: 'sometimes'
        }),
        /must be true or false/
    );
    assert.throws(
        () => parseNodeObjectStorageConfig({
            IMS_OBJECT_STORAGE: 's3',
            IMS_S3_BUCKET: 'ims-media-prod',
            IMS_S3_REGION: 'ap-northeast-1',
            IMS_S3_READ_URL_TTL_SECONDS: '10'
        }),
        /IMS_S3_READ_URL_TTL_SECONDS must be/
    );
});

test('Node database configuration selects SQLite or one bounded PostgreSQL pool', () => {
    const defaults = { path: '/data/imsweb.db' };
    assert.deepEqual(parseNodeDatabaseConfig({}, defaults), {
        type: 'sqlite',
        path: '/data/imsweb.db'
    });
    assert.deepEqual(parseNodeDatabaseConfig({
        IMS_DATABASE: ' pgsql ',
        DATABASE_URL: 'postgresql://ims:secret@db.example.test:5432/ims',
        IMS_PG_POOL_MAX: '8',
        IMS_PG_IDLE_TIMEOUT_MS: '45000'
    }, defaults), {
        type: 'postgresql',
        connectionString: 'postgresql://ims:secret@db.example.test:5432/ims',
        maxConnections: 8,
        idleTimeoutMs: 45_000,
        connectionTimeoutMs: 5_000,
        statementTimeoutMs: 30_000,
        idleInTransactionTimeoutMs: 30_000
    });
    assert.throws(
        () => parseNodeDatabaseConfig({ IMS_DATABASE: 'postgresql' }, defaults),
        /DATABASE_URL is required/
    );
    assert.throws(
        () => parseNodeDatabaseConfig({
            IMS_DATABASE: 'postgresql',
            DATABASE_URL: 'sqlite:///tmp/core.db'
        }, defaults),
        /valid PostgreSQL URL/
    );
    assert.throws(
        () => parseNodeDatabaseConfig({
            IMS_DATABASE: 'postgresql',
            DATABASE_URL: 'postgresql://localhost/ims',
            IMS_PG_POOL_MAX: '101'
        }, defaults),
        /IMS_PG_POOL_MAX must be an integer between 1 and 100/
    );
});

test('FilesystemObjectStorage maps Data keys exclusively to storyDataDir', async (t) => {
    const root = await temporaryDirectory('ims-storage-roots-');
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const publicDir = path.join(root, 'public');
    const storyDataDir = path.join(root, 'story-data');
    const storage = new FilesystemObjectStorage({
        publicDir,
        storyDataDir,
        uploadsDir: path.join(root, 'uploads'),
        chronicleDir: path.join(root, 'chronicle')
    });
    const key = 'Data/sc/idol/card.webp';
    const body = new Uint8Array([1, 2, 3, 4]);

    await storage.put(key, body, { contentType: 'image/webp' });
    assert.deepEqual((await storage.get(key))?.body, body);
    assert.deepEqual((await storage.list('Data/sc')).map((entry) => entry.key), [key]);
    await assert.rejects(fs.lstat(path.join(publicDir, key)), { code: 'ENOENT' });
    assert.deepEqual(new Uint8Array(await fs.readFile(path.join(storyDataDir, 'sc/idol/card.webp'))), body);
    await storage.delete(key);
    assert.equal(await storage.exists(key), false);

    const thumbnailKey = 'uploads/news/thumb/legacy_thumb.jpg';
    await storage.put(thumbnailKey, new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
        contentType: 'image/png'
    });
    assert.equal((await storage.get(thumbnailKey))?.contentType, 'image/png');
    await assert.rejects(fs.lstat(path.join(publicDir, thumbnailKey)), { code: 'ENOENT' });
});

test('NodeStaticAssets does not open a body for HEAD and opens only the requested byte range', async (t) => {
    const root = await temporaryDirectory('ims-static-range-');
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const filePath = path.join(root, 'runninggame/Build/game.data');
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, Buffer.from('0123456789abcdef'));
    const opened: Array<{ start?: number; end?: number } | undefined> = [];
    const assets = new NodeStaticAssets(root, {
        lstat: (candidate) => fs.lstat(candidate),
        createReadStream(candidate, options) {
            opened.push(options);
            return createReadStream(candidate, options);
        }
    });

    const head = await assets.fetch(new Request('http://ims.test/runninggame/Build/game.data', {
        method: 'HEAD', headers: { Range: 'bytes=3-6' }
    }));
    assert.equal(head.status, 206);
    assert.equal(head.headers.get('content-length'), '4');
    assert.equal(head.headers.get('content-range'), 'bytes 3-6/16');
    assert.equal(head.headers.get('content-type'), 'application/octet-stream');
    assert.deepEqual(opened, []);

    const get = await assets.fetch(new Request('http://ims.test/runninggame/Build/game.data', {
        headers: { Range: 'bytes=3-6' }
    }));
    assert.equal(get.status, 206);
    assert.equal(await get.text(), '3456');
    assert.deepEqual(opened, [{ start: 3, end: 6 }]);

    const currentEtag = get.headers.get('etag');
    const lastModified = get.headers.get('last-modified');
    assert.ok(currentEtag);
    assert.ok(lastModified);
    const byEtag = await assets.fetch(new Request('http://ims.test/runninggame/Build/game.data', {
        headers: { 'If-None-Match': `W/${currentEtag}` }
    }));
    assert.equal(byEtag.status, 304);
    assert.equal(await byEtag.text(), '');
    const byDate = await assets.fetch(new Request('http://ims.test/runninggame/Build/game.data', {
        headers: { 'If-Modified-Since': lastModified }
    }));
    assert.equal(byDate.status, 304);
    assert.deepEqual(opened, [{ start: 3, end: 6 }]);

    const staleIfRange = await assets.fetch(new Request('http://ims.test/runninggame/Build/game.data', {
        headers: { Range: 'bytes=3-6', 'If-Range': '"stale"' }
    }));
    assert.equal(staleIfRange.status, 200);
    assert.equal(await staleIfRange.text(), '0123456789abcdef');
    const matchingIfRange = await assets.fetch(new Request('http://ims.test/runninggame/Build/game.data', {
        headers: { Range: 'bytes=3-6', 'If-Range': currentEtag }
    }));
    assert.equal(matchingIfRange.status, 206);
    assert.equal(await matchingIfRange.text(), '3456');
    assert.deepEqual(opened, [
        { start: 3, end: 6 },
        undefined,
        { start: 3, end: 6 }
    ]);

    const invalid = await assets.fetch(new Request('http://ims.test/runninggame/Build/game.data', {
        headers: { Range: 'bytes=99-100' }
    }));
    assert.equal(invalid.status, 416);
    assert.equal(invalid.headers.get('content-range'), 'bytes */16');
    assert.equal(opened.length, 3);
});

test('filesystem idempotency persists replay, rejects fingerprint reuse, and recovers failure', async (t) => {
    const root = await temporaryDirectory('ims-idempotency-');
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    const first = new FilesystemIdempotencyStore(root);
    const firstClaim = await first.claim('scope', 'key', 'fingerprint');
    assert.deepEqual(firstClaim, { kind: 'acquired', recovered: false, generation: 1 });
    if (firstClaim.kind !== 'acquired') return;
    assert.deepEqual(await first.claim('scope', 'key', 'fingerprint'), { kind: 'in-progress' });
    await first.complete(
        'scope', 'key', 'fingerprint', firstClaim.generation,
        { status: 201, body: { ok: true } }
    );

    const restarted = new FilesystemIdempotencyStore(root);
    assert.deepEqual(await restarted.claim('scope', 'key', 'fingerprint'), {
        kind: 'replay', response: { status: 201, body: { ok: true } }
    });
    assert.deepEqual(await restarted.claim('scope', 'key', 'different'), { kind: 'conflict' });
    const retry = await restarted.claim('scope', 'retry', 'same');
    assert.deepEqual(retry, { kind: 'acquired', recovered: false, generation: 1 });
    if (retry.kind !== 'acquired') return;
    await restarted.fail('scope', 'retry', 'same', retry.generation);
    assert.deepEqual(await restarted.claim('scope', 'retry', 'same'), {
        kind: 'acquired', recovered: true, generation: 2
    });
});

test('filesystem compensation journal retries a failed idempotent delete to completion', async (t) => {
    const root = await temporaryDirectory('ims-compensation-');
    t.after(() => fs.rm(root, { recursive: true, force: true }));
    let attempts = 0;
    const storage = {
        async delete() {
            attempts += 1;
            if (attempts === 1) throw new Error('temporary delete failure');
        }
    } as unknown as ObjectStorage;
    const service = new FilesystemCompensationService(root);
    const id = await service.enqueue('delete-object', { key: 'uploads/event/original/a.png' });
    await service.run(storage);
    let entry = JSON.parse(await fs.readFile(path.join(root, `${id}.json`), 'utf8'));
    assert.equal(entry.state, 'failed');
    assert.equal(entry.attempts, 1);
    await service.run(storage);
    await service.run(storage);
    entry = JSON.parse(await fs.readFile(path.join(root, `${id}.json`), 'utf8'));
    assert.equal(entry.state, 'completed');
    assert.equal(entry.attempts, 2);
    assert.equal(attempts, 2);
});
