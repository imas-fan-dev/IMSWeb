import assert from 'node:assert/strict';
import test from 'node:test';
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
