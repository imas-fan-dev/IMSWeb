import assert from 'node:assert/strict';
import test from 'node:test';
import type { ObjectStorage } from '@/ports/object-storage';
import {
    requirePublicObjectUrl,
    resolvePublicMediaFields,
    resolvePublicMediaUrl,
    resolvePublicObjectUrl
} from '@/utils/storage/public-object-url';

function storageWithPublicUrls(
    resolve: (key: string) => string | null | Promise<string | null>
): ObjectStorage {
    return {
        async createPublicReadUrl(key) { return resolve(key); },
        async get() { return null; },
        async put() { throw new Error('not implemented'); },
        async delete() {},
        async exists() { return false; },
        async copy() {},
        async move() {},
        async list() { return []; },
        async deletePrefix() {}
    };
}

test('public media URLs resolve legacy business paths to CDN object URLs', async () => {
    const keys: string[] = [];
    const storage = storageWithPublicUrls((key) => {
        keys.push(key);
        return `https://cdn.example.test/${key}`;
    });

    assert.equal(
        await resolvePublicMediaUrl(storage, '/uploads/namecard/original/card-7-front.webp'),
        'https://cdn.example.test/community/namecards/assets/card-7-front/image.webp'
    );
    assert.equal(
        await resolvePublicMediaUrl(storage, '/uploads/news/thumb/news_thumb.png'),
        'https://cdn.example.test/editorial/news/assets/news/thumbnail.png'
    );
    assert.deepEqual(keys, [
        'community/namecards/assets/card-7-front/image.webp',
        'editorial/news/assets/news/thumbnail.png'
    ]);
});

test('public URL resolution preserves external, private, and unsupported fallbacks', async () => {
    const storage = storageWithPublicUrls(() => null);
    assert.equal(
        await resolvePublicMediaUrl(storage, 'https://images.example.test/cover.webp'),
        'https://images.example.test/cover.webp'
    );
    assert.equal(
        await resolvePublicMediaUrl(storage, '/private/unmapped.webp'),
        '/private/unmapped.webp'
    );
    assert.equal(
        await resolvePublicObjectUrl(storage, 'private/object.webp', '/media/fallback.webp'),
        '/media/fallback.webp'
    );
});

test('required public URLs fail closed instead of returning an application fallback', async () => {
    const directStorage = storageWithPublicUrls(
        (key) => `https://cdn.example.test/${key}`
    );
    assert.equal(
        await requirePublicObjectUrl(directStorage, 'wiki/shared.webp'),
        'https://cdn.example.test/wiki/shared.webp'
    );

    const unavailableStorage = storageWithPublicUrls(() => null);
    await assert.rejects(
        requirePublicObjectUrl(unavailableStorage, 'wiki/shared.webp'),
        (error: Error & { status?: number }) =>
            error.status === 503 && /公开对象读取地址/.test(error.message)
    );
});

test('public media field rewriting changes only declared string fields', async () => {
    const storage = storageWithPublicUrls((key) => `https://cdn.example.test/${key}`);
    const source = {
        id: 8,
        image1_url: '/uploads/namecard/original/front.webp',
        image2_url: '/uploads/namecard/original/back.webp',
        status: 'approved'
    };
    const result = await resolvePublicMediaFields(
        storage,
        source,
        ['image1_url', 'image2_url']
    );
    assert.notEqual(result, source);
    assert.equal(source.image1_url, '/uploads/namecard/original/front.webp');
    assert.equal(
        result.image1_url,
        'https://cdn.example.test/community/namecards/assets/front/image.webp'
    );
    assert.equal(result.status, 'approved');
});
