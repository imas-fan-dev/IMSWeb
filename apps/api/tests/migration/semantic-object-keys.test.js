'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    indexedSourcePhysicalKey,
    mediaObjectKey,
    parseArguments,
    semanticPhysicalKey,
    semanticObjectKey
} = require('../../scripts/migration/semantic-object-keys');

test('semantic object migration maps each business namespace', () => {
    assert.equal(
        semanticObjectKey('Data/sc/sakuragi_mano/icon.webp'),
        'wiki/agencies/sc/idols/sakuragi_mano/avatar.webp'
    );
    assert.equal(
        semanticObjectKey('Data/sc/sakuragi_mano/enza/card.webp'),
        'wiki/agencies/sc/idols/sakuragi_mano/story-images/enza/card.webp'
    );
    assert.equal(
        semanticObjectKey('Wiki/static/icon/agencies/sc.webp'),
        'wiki/agencies/sc/branding/icon.webp'
    );
    assert.equal(
        semanticObjectKey('Wiki/static/css/wiki.css'),
        'wiki/shared/static/css/wiki.css'
    );
    assert.equal(
        semanticObjectKey('assets/images/eventchronicle/events/used/42/a.webp'),
        'chronicle/media/published/42/a.webp'
    );
    assert.equal(
        semanticObjectKey('site-packages/demo/revisions/r1/source.zip'),
        'site-packages/demo/revisions/r1/source.zip'
    );
});

test('semantic media keys preserve public filename identity under business roles', () => {
    assert.equal(
        mediaObjectKey('uploads/news/original/release-abc.webp'),
        'editorial/news/assets/release-abc/original.webp'
    );
    assert.equal(
        mediaObjectKey('uploads/news/thumb/release-abc_thumb.png'),
        'editorial/news/assets/release-abc/thumbnail.png'
    );
    assert.equal(
        mediaObjectKey('uploads/information/index.json'),
        'editorial/information/index.json'
    );
    assert.equal(
        mediaObjectKey('uploads/namecard/original/card-front.webp'),
        'community/namecards/assets/card-front/image.webp'
    );
});

test('semantic migration apply requires an exact bucket confirmation', () => {
    assert.throws(
        () => parseArguments(['--apply'], { IMS_S3_BUCKET: 'imsweb-media-local' }),
        /--confirm-bucket imsweb-media-local/
    );
    const apply = parseArguments(
        ['--apply', '--delete-source', '--confirm-bucket', 'imsweb-media-local'],
        { IMS_S3_BUCKET: 'imsweb-media-local' }
    );
    assert.equal(apply.deleteSource, true);
    assert.match(apply.manifest, /semantic-object-keys\.json$/);
    assert.match(
        parseArguments([], { IMS_S3_BUCKET: 'imsweb-media-local' }).manifest,
        /semantic-object-keys-dry-run\.json$/
    );
});

test('semantic migration resolves old indexed objects without runtime fallback', () => {
    const config = { prefix: 'local' };
    assert.equal(
        indexedSourcePhysicalKey(config, {
            objectId: 'old-object-id',
            physicalKey: null
        }),
        'local/__ims_s3/objects/old-object-id'
    );
    assert.equal(
        semanticPhysicalKey(
            config,
            'wiki/agencies/sc/idols/mano/avatar.webp',
            'new-object-id'
        ),
        'local/wiki/agencies/sc/idols/mano/objects/new-object-id/avatar.webp'
    );
});
