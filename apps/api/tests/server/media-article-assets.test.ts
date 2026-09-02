import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHonoApp } from '@/app';
import type { ObjectStorage, StoredObject } from '@/ports/object-storage';
import { articleAssetObjectKey } from '@/utils/storage/business-object-keys';

test('article body assets are served from their public upload URLs', async () => {
    const articleId = 39;
    const filename = 'body-image.webp';
    const key = articleAssetObjectKey(articleId, filename);
    const body = Uint8Array.of(0x52, 0x49, 0x46, 0x46);
    const stored: StoredObject = {
        body,
        size: body.byteLength,
        contentType: 'image/webp',
        etag: '"article-body-image"'
    };
    const storage = {
        async get(candidate: string) {
            return candidate === key ? stored : null;
        }
    } as unknown as ObjectStorage;
    const app = createHonoApp(() => ({ storage }));

    const response = await app.request(
        `http://ims.test/uploads/articles/${articleId}/${filename}`
    );
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'image/webp');
    assert.deepEqual(new Uint8Array(await response.arrayBuffer()), body);

    const head = await app.request(
        `http://ims.test/uploads/articles/${articleId}/${filename}`,
        { method: 'HEAD' }
    );
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-length'), String(body.byteLength));
    assert.equal((await head.arrayBuffer()).byteLength, 0);

    assert.equal(
        (await app.request('http://ims.test/uploads/articles/not-an-id/body-image.webp')).status,
        400
    );
});
