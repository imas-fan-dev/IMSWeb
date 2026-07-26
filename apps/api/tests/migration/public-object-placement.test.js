'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    parsePublicObjectPlacementArguments
} = require('../../scripts/migration/public-object-placement.ts');

const environment = {
    IMS_OBJECT_STORAGE: 's3',
    IMS_S3_BUCKET: 'ims-media',
    IMS_S3_PUBLIC_READ_URL_BASE: 'https://media.example.test',
    IMS_S3_REGION: 'auto'
};

test('public object placement is dry-run by default', () => {
    const options = parsePublicObjectPlacementArguments([], environment);
    assert.equal(options.apply, false);
    assert.equal(options.concurrency, 16);
    assert.match(options.report, /public-object-placement-dry-run\.json$/);
});

test('public object placement accepts bounded audit concurrency', () => {
    assert.equal(parsePublicObjectPlacementArguments([
        '--concurrency', '32'
    ], environment).concurrency, 32);
    assert.throws(
        () => parsePublicObjectPlacementArguments(['--concurrency', '0'], environment),
        /integer between 1 and 64/
    );
    assert.throws(
        () => parsePublicObjectPlacementArguments(['--concurrency', '65'], environment),
        /integer between 1 and 64/
    );
});

test('public object placement apply requires the exact single bucket confirmation', () => {
    assert.throws(
        () => parsePublicObjectPlacementArguments(['--apply'], environment),
        /--confirm-bucket ims-media/
    );
    assert.equal(parsePublicObjectPlacementArguments([
        '--apply',
        '--confirm-bucket', 'ims-media'
    ], environment).apply, true);
});

test('public object placement requires a public read URL', () => {
    assert.throws(() => parsePublicObjectPlacementArguments([], {
        IMS_OBJECT_STORAGE: 's3',
        IMS_S3_BUCKET: 'ims-media',
        IMS_S3_REGION: 'auto'
    }), /IMS_PUBLIC_READ_URL_BASE is required/);
});
