import assert from 'node:assert/strict';
import { test } from 'node:test';
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
                : `http://127.0.0.1:9000/imsweb-media-local/${key}?signed=true`;
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
        'http://127.0.0.1:9000/imsweb-media-local/uploads/news/original/a.webp?signed=true');
    assert.equal(get?.headers.get('cache-control'), 'private, no-store');

    const head = await objectReadResponse(
        new Request('http://api.test/uploads/news/original/a.webp', { method: 'HEAD' }),
        storage,
        'uploads/news/original/a.webp'
    );
    assert.equal(head?.status, 307);
    assert.deepEqual(calls.map((call) => call.method), ['GET', 'HEAD']);
    assert.equal(gets, 0);
    assert.equal(await objectReadResponse(
        new Request('http://api.test/uploads/news/original/missing.webp'),
        storage,
        'uploads/news/original/missing.webp'
    ), null);
});
