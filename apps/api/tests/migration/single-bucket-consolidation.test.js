'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    parseSingleBucketConsolidationArguments,
    targetPlacement
} = require('../../scripts/migration/single-bucket-consolidation.ts');

const environment = {
    IMS_OBJECT_STORAGE: 's3',
    IMS_S3_BUCKET: 'ims-media-prod',
    IMS_S3_LEGACY_PRIVATE_BUCKET: 'ims-media-private-prod',
    IMS_S3_PUBLIC_READ_URL_BASE: 'https://media.example.test',
    IMS_S3_REGION: 'auto'
};

test('single bucket consolidation is read-only by default', () => {
    const options = parseSingleBucketConsolidationArguments([], environment);
    assert.equal(options.apply, false);
    assert.equal(options.legacyPrivateBucket, 'ims-media-private-prod');
    assert.equal(options.targetBucket, 'ims-media-prod');
});

test('single bucket consolidation requires exact source and target confirmation', () => {
    assert.throws(
        () => parseSingleBucketConsolidationArguments(['--apply'], environment),
        /--confirm-source-bucket ims-media-private-prod.*--confirm-target-bucket ims-media-prod/
    );
    assert.equal(parseSingleBucketConsolidationArguments([
        '--apply',
        '--confirm-source-bucket', 'ims-media-private-prod',
        '--confirm-target-bucket', 'ims-media-prod'
    ], environment).apply, true);
});

test('single bucket consolidation publishes ready objects and protects pending objects', () => {
    assert.deepEqual(targetPlacement(
        'community/namecards/assets/card/objects/id/image.webp'
    ), {
        key: 'community/namecards/assets/card/objects/id/image.webp',
        scope: 'public'
    });
    assert.deepEqual(targetPlacement(
        'tenant/site-packages/package/revisions/id/objects/object/source.zip',
        'tenant',
        true
    ), {
        key: 'tenant/__protected/site-packages/package/revisions/id/objects/object/source.zip',
        scope: 'private'
    });
});
