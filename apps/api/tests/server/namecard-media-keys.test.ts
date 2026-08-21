import assert from 'node:assert/strict';
import test from 'node:test';
import { ensureNamecardThumbnails } from '@/domains/community/namecards/media-assets';
import {
    namecardMediaObjectKeys,
    namecardThumbnailObjectKey,
    namecardThumbnailPublicUrl,
    publicMediaObjectKey
} from '@/utils/storage/business-object-keys';

test('namecard thumbnail keys share the original stem under a thumbnail role', () => {
    assert.equal(
        namecardThumbnailObjectKey('card-front.webp'),
        'community/namecards/assets/card-front/thumbnail.jpg'
    );
    assert.equal(
        namecardThumbnailObjectKey('card-front.png'),
        'community/namecards/assets/card-front/thumbnail.jpg'
    );
});

test('namecard thumbnail public URLs keep the original filename identity', () => {
    assert.equal(
        namecardThumbnailPublicUrl('/uploads/namecard/original/card-front.webp'),
        '/uploads/namecard/thumbnail/card-front.webp.jpg'
    );
    assert.throws(
        () => namecardThumbnailPublicUrl('/uploads/namecard/original/../escape.webp'),
        /Invalid business object key/
    );
    assert.throws(
        () => namecardThumbnailPublicUrl('/uploads/news/original/card-front.webp'),
        /Unsupported namecard media path/
    );
});

test('namecard media key pairs cover the original and its stored thumbnail', () => {
    assert.deepEqual(
        namecardMediaObjectKeys('/uploads/namecard/original/card-front.webp'),
        [
            'community/namecards/assets/card-front/image.webp',
            'community/namecards/assets/card-front/thumbnail.jpg'
        ]
    );
});

test('legacy thumbnail paths map back to the canonical thumbnail key', () => {
    assert.equal(
        publicMediaObjectKey('uploads/namecard/thumbnail/card-front.webp.jpg'),
        'community/namecards/assets/card-front/thumbnail.jpg'
    );
    assert.throws(
        () => publicMediaObjectKey('uploads/namecard/thumbnail/card-front.webp.png'),
        /Unsupported namecard thumbnail path/
    );
    assert.throws(
        () => publicMediaObjectKey('uploads/namecard/thumbnail/.jpg'),
        /Unsupported namecard thumbnail path/
    );
});

function stubThumbnailRuntime(overrides: {
    exists: (key: string) => boolean | Promise<boolean>;
    get: (key: string) => { body: Uint8Array } | null | Promise<{ body: Uint8Array } | null>;
}) {
    const written: Array<{ key: string; bytes: number }> = [];
    const storage = {
        async get(key: string) { return overrides.get(key); },
        async put(key: string, body: Uint8Array) {
            written.push({ key, bytes: body.byteLength });
        },
        async exists(key: string) { return overrides.exists(key); },
        async delete() {},
        async copy() {},
        async move() {},
        async list() { return []; },
        async deletePrefix() {}
    };
    const images = {
        async validate() { throw new Error('unexpected validate'); },
        async toWebp() { throw new Error('unexpected toWebp'); },
        async thumbnailPng() { throw new Error('unexpected thumbnailPng'); },
        async resizeJpeg(body: Uint8Array) { return new Uint8Array(body.byteLength + 8); }
    };
    return { storage, images, written };
}

test('ensureNamecardThumbnails skips sides whose thumbnails already exist', async () => {
    const runtime = stubThumbnailRuntime({
        exists: () => true,
        get: () => { throw new Error('unexpected original read'); }
    });
    await ensureNamecardThumbnails(runtime as never, [
        '/uploads/namecard/original/front.webp',
        '/uploads/namecard/original/back.webp'
    ]);
    assert.equal(runtime.written.length, 0);
});

test('ensureNamecardThumbnails generates missing thumbnails from originals', async () => {
    const originals = new Map([
        ['community/namecards/assets/front/image.webp', new Uint8Array(12)],
        ['community/namecards/assets/back/image.webp', new Uint8Array(4)]
    ]);
    const runtime = stubThumbnailRuntime({
        exists: (key) => key.endsWith('/front/thumbnail.jpg'),
        get: (key) => originals.has(key) ? { body: originals.get(key)! } : null
    });
    await ensureNamecardThumbnails(runtime as never, [
        '/uploads/namecard/original/front.webp',
        '/uploads/namecard/original/back.webp'
    ]);
    assert.deepEqual(runtime.written, [
        { key: 'community/namecards/assets/back/thumbnail.jpg', bytes: 12 }
    ]);
});

test('ensureNamecardThumbnails rejects when the original object is missing', async () => {
    const runtime = stubThumbnailRuntime({
        exists: () => false,
        get: () => null
    });
    await assert.rejects(
        ensureNamecardThumbnails(runtime as never, [
            '/uploads/namecard/original/front.webp'
        ]),
        /Namecard original object not found/
    );
    assert.equal(runtime.written.length, 0);
});
