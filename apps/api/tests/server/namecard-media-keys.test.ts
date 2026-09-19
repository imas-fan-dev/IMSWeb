import assert from 'node:assert/strict';
import { test } from 'vitest';
import { ensureNamecardThumbnails } from '@/domains/community/fudaba/card-media-assets';
import {
    namecardCardMediaObjectKey,
    namecardClaimMediaObjectKey,
    namecardMediaObjectKeys,
    namecardOriginalUrlFromObjectKey,
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

// A claim copies a legacy card's media onto a row that the public wall still
// publishes (`origin` is immutable provenance, so it stays 'legacy'). Writing a
// Fudaba-layout key there has no public form, so the wall's key reversal threw
// and took the entire card list down with it. These tests pin the layout.
test('claimed legacy media keeps the canonical namecards layout', () => {
    const sourceKey = 'community/namecards/assets/legacy-original/image.webp';
    const front = namecardClaimMediaObjectKey(sourceKey, 'legacy-12', 'front');
    const back = namecardClaimMediaObjectKey(sourceKey, 'legacy-12', 'back');
    assert.equal(front, 'community/namecards/assets/legacy-12-front/image.webp');
    assert.equal(back, 'community/namecards/assets/legacy-12-back/image.webp');
    assert.equal(
        namecardOriginalUrlFromObjectKey(front),
        '/uploads/namecard/original/legacy-12-front.webp'
    );
    assert.equal(
        namecardOriginalUrlFromObjectKey(back),
        '/uploads/namecard/original/legacy-12-back.webp'
    );
});

test('claimed media round-trips through the public media chain', () => {
    const key = namecardClaimMediaObjectKey(
        'community/namecards/assets/legacy-original/image.webp',
        'legacy-12',
        'front'
    );
    const publicUrl = namecardOriginalUrlFromObjectKey(key);
    assert.equal(publicMediaObjectKey(publicUrl), key);
    assert.deepEqual(namecardMediaObjectKeys(publicUrl), [
        key,
        'community/namecards/assets/legacy-12-front/thumbnail.jpg'
    ]);
});

test('claimed media keeps the source extension and never reuses the source', () => {
    const sourceKey = 'community/namecards/assets/legacy-original/image.png';
    assert.equal(
        namecardClaimMediaObjectKey(sourceKey, 'legacy-7', 'front'),
        'community/namecards/assets/legacy-7-front/image.png'
    );
    for (const side of ['front', 'back'] as const) {
        assert.notEqual(
            namecardClaimMediaObjectKey(sourceKey, 'legacy-7', side),
            sourceKey
        );
    }
});

// Every writer that targets a compatibility row goes through this one builder,
// so pin its output against the readers that will reverse it back. A key the
// reversal cannot read takes down the whole listing that contains it.
test('card media keys stay readable by the namecard readers', () => {
    const key = namecardCardMediaObjectKey('legacy-42', 'front');
    assert.equal(key, 'community/namecards/assets/legacy-42-front/image.webp');
    assert.equal(
        namecardOriginalUrlFromObjectKey(key),
        '/uploads/namecard/original/legacy-42-front.webp'
    );
    assert.equal(publicMediaObjectKey(namecardOriginalUrlFromObjectKey(key)), key);
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
