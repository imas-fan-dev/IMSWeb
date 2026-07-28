'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    parseArguments,
    syncObjects,
    validateR2Acceptance,
    validateR2Target,
    validateTrueType
} = require('../../scripts/migration/legacy-brand-assets');

class MemoryStorage {
    constructor() {
        this.objects = new Map();
    }

    async get(key) {
        const object = this.objects.get(key);
        return object ? { ...object, body: Uint8Array.from(object.body) } : null;
    }

    async put(key, body, options = {}) {
        const object = {
            body: Uint8Array.from(body),
            size: body.byteLength,
            contentType: options.contentType || 'application/octet-stream',
            etag: 'fixture'
        };
        this.objects.set(key, object);
        return object;
    }

    async createPublicReadUrl(key) {
        return `https://assets.example.test/${key}`;
    }
}

function fontFixture() {
    const font = Buffer.alloc(60);
    font.writeUInt32BE(0x00010000, 0);
    font.writeUInt16BE(3, 4);
    ['head', 'maxp', 'name'].forEach((tag, index) => {
        const offset = 12 + index * 16;
        font.write(tag, offset, 4, 'ascii');
        font.writeUInt32BE(60, offset + 8);
        font.writeUInt32BE(0, offset + 12);
    });
    return font;
}

test('brand asset migration requires exact apply confirmations', () => {
    const environment = { IMS_LEGACY_BRAND_ASSET_BASE_URL: 'https://legacy.example/' };
    const options = parseArguments([
        '--apply',
        '--confirm-source', 'https://legacy.example',
        '--confirm-bucket', 'media-prod'
    ], environment);
    assert.equal(options.sourceBaseUrl, 'https://legacy.example');
    assert.equal(options.confirmBucket, 'media-prod');
    assert.throws(
        () => parseArguments(['--require-r2'], environment),
        /requires --expect-bucket/
    );
    assert.throws(
        () => parseArguments(['--require-r2', '--expect-bucket', 'media', '--apply'], environment),
        /read-only/
    );
});

test('brand asset migration validates the SFNT table directory', () => {
    assert.deepEqual(validateTrueType(fontFixture()), { tableCount: 3 });
    assert.throws(() => validateTrueType(Buffer.alloc(60)), /not an SFNT font/);
});

test('brand asset sync plans, writes, and recognizes unchanged objects', async () => {
    const storage = new MemoryStorage();
    const body = Buffer.from('brand-asset');
    const asset = {
        objectKey: 'brand/works/765/character.png',
        publicPath: '/assets/images/Production/765Haruka.png',
        contentType: 'image/png',
        bytes: body.byteLength,
        sha256: require('node:crypto').createHash('sha256').update(body).digest('hex'),
        body
    };
    const verifyPublic = async (_storage, entry) => ({
        publicUrl: `https://assets.example.test/${entry.objectKey}`,
        publicStatus: 200
    });
    assert.equal(
        (await syncObjects(storage, [asset], false, verifyPublic))[0].objectStatus,
        'would-upload'
    );
    assert.equal(
        (await syncObjects(storage, [asset], true, verifyPublic))[0].objectStatus,
        'uploaded'
    );

    const unchanged = await syncObjects(storage, [asset], false, verifyPublic);
    assert.equal(unchanged[0].objectStatus, 'unchanged');
    assert.equal(unchanged[0].publicStatus, 200);
});

test('brand asset R2 acceptance rejects target and content drift', () => {
    const config = {
        type: 's3',
        bucket: 'media-prod',
        region: 'auto',
        endpoint: 'https://account.r2.cloudflarestorage.com',
        forcePathStyle: false,
        prefix: '',
        publicReadUrlBase: 'https://assets.example.test'
    };
    assert.doesNotThrow(() => validateR2Target(config, 'media-prod', true));
    assert.throws(() => validateR2Target({ ...config, region: 'us-east-1' }, 'media-prod', true));
    assert.doesNotThrow(() => validateR2Acceptance([{
        objectStatus: 'unchanged',
        publicUrl: 'https://assets.example.test/object',
        publicStatus: 200
    }]));
    assert.throws(() => validateR2Acceptance([{
        objectStatus: 'would-replace',
        publicUrl: null,
        publicStatus: null
    }]), /source and objects differ/);
});
