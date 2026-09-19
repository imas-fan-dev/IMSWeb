import assert from 'node:assert/strict';
import { test } from 'vitest';
import type { ObjectReadUrlOptions, ObjectStorage } from '@/ports/object-storage';
import { objectReadResponse } from '@/utils/http/object-read-response';

test('S3-capable media responses redirect GET and HEAD without loading object bytes', async () => {
    const calls: Array<{ key: string; method?: 'GET' | 'HEAD' }> = [];
    let gets = 0;
    const storage = {
        async createReadUrl(key: string, options?: ObjectReadUrlOptions) {
            calls.push({ key, method: options?.method });
            return key.endsWith('missing.webp')
                ? null
                : {
                    url: `http://127.0.0.1:9000/imsweb-media-local/${key}` +
                        (key.includes('/private/') ? '?signed=true' : ''),
                    visibility: key.includes('/private/') ? 'private' : 'public'
                } as const;
        },
        async get() {
            gets += 1;
            return null;
        }
    } as unknown as ObjectStorage;

    const get = await objectReadResponse(
        new Request('http://api.test/uploads/news/original/a.webp'),
        storage,
        'uploads/news/original/a.webp',
        { 'Cache-Control': 'public, max-age=31536000' }
    );
    assert.equal(get?.status, 307);
    assert.equal(get?.headers.get('location'),
        'http://127.0.0.1:9000/imsweb-media-local/uploads/news/original/a.webp');
    assert.equal(get?.headers.get('cache-control'), 'public, max-age=31536000');

    const head = await objectReadResponse(
        new Request('http://api.test/private/a.webp', { method: 'HEAD' }),
        storage,
        'uploads/private/a.webp'
    );
    assert.equal(head?.status, 307);
    assert.equal(head?.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(calls.map((call) => call.method), ['GET', 'HEAD']);
    assert.equal(gets, 0);
    assert.equal(await objectReadResponse(
        new Request('http://api.test/uploads/news/original/missing.webp'),
        storage,
        'uploads/news/original/missing.webp'
    ), null);
});

test('proxy mode bypasses signed URLs and preserves stored byte semantics', async () => {
    let readUrls = 0;
    let gets = 0;
    const body = new Uint8Array([0x52, 0x49, 0x46, 0x46]);
    const storage = {
        async createReadUrl() {
            readUrls += 1;
            return {
                url: 'https://private-media.example.test/avatar.webp?signed=1',
                visibility: 'private'
            } as const;
        },
        async get() {
            gets += 1;
            return {
                body,
                size: body.byteLength,
                contentType: 'image/webp',
                etag: 'avatar-etag'
            };
        }
    } as unknown as ObjectStorage;

    const response = await objectReadResponse(
        new Request('http://api.test/api/platform/me/avatar', {
            headers: { range: 'bytes=1-2' }
        }),
        storage,
        'protected/platform/avatar.webp',
        { 'Cache-Control': 'private, no-store' },
        { mode: 'proxy' }
    );

    assert.equal(response?.status, 206);
    assert.equal(response?.headers.get('content-type'), 'image/webp');
    assert.equal(response?.headers.get('content-range'), 'bytes 1-2/4');
    assert.equal(response?.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(new Uint8Array(await response!.arrayBuffer()), body.slice(1, 3));
    assert.equal(readUrls, 0);
    assert.equal(gets, 1);
});

test('public redirects receive a bounded cache policy when the handler has none', async () => {
    const storage = {
        async createReadUrl() {
            return { url: 'https://cdn.example.test/wiki/icon.webp', visibility: 'public' } as const;
        }
    } as unknown as ObjectStorage;
    const response = await objectReadResponse(
        new Request('http://api.test/image/sc/mano/icon.webp'),
        storage,
        'wiki/agencies/sc/idols/mano/avatar/icon.webp'
    );
    assert.equal(response?.headers.get('cache-control'), 'public, max-age=300');
});
