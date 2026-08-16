'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    parseNamecardThumbnailBackfillArguments
} = require('../../scripts/migration/namecard-thumbnail-backfill.ts');

const environment = {
    IMS_OBJECT_STORAGE: 's3',
    IMS_S3_BUCKET: 'ims-media',
    IMS_S3_REGION: 'auto',
    IMS_S3_ENDPOINT: 'https://example.r2.cloudflarestorage.com'
};

test('namecard thumbnail backfill is dry-run by default', () => {
    const options = parseNamecardThumbnailBackfillArguments([], environment);
    assert.equal(options.apply, false);
    assert.equal(options.concurrency, 6);
    assert.match(options.report, /namecard-thumbnail-backfill-dry-run\.json$/);
});

test('namecard thumbnail backfill accepts bounded audit concurrency', () => {
    assert.equal(parseNamecardThumbnailBackfillArguments([
        '--concurrency', '8'
    ], environment).concurrency, 8);
    assert.throws(
        () => parseNamecardThumbnailBackfillArguments(['--concurrency', '0'], environment),
        /integer between 1 and 16/
    );
    assert.throws(
        () => parseNamecardThumbnailBackfillArguments(['--concurrency', '17'], environment),
        /integer between 1 and 16/
    );
});

test('namecard thumbnail backfill apply requires the exact bucket confirmation', () => {
    assert.throws(
        () => parseNamecardThumbnailBackfillArguments(['--apply'], environment),
        /--confirm-bucket ims-media/
    );
    const options = parseNamecardThumbnailBackfillArguments([
        '--apply',
        '--confirm-bucket', 'ims-media'
    ], environment);
    assert.equal(options.apply, true);
    assert.match(options.report, /namecard-thumbnail-backfill\.json$/);
});

test('namecard thumbnail backfill requires S3 object storage', () => {
    assert.throws(
        () => parseNamecardThumbnailBackfillArguments([], {
            IMS_OBJECT_STORAGE: 'filesystem',
            IMS_S3_BUCKET: 'ims-media'
        }),
        /IMS_OBJECT_STORAGE=s3 is required/
    );
});
