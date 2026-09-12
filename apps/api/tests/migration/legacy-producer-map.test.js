'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const { test } = require('node:test');
const {
    parseProducerMapContent,
    PRODUCER_MAP_PROVINCES,
    serializeProducerMapContent,
    validateProducerMapDraft
} = require('../../src/domains/content/producer-map/data.ts');
const {
    PRODUCER_MAP_OBJECT_KEY,
    producerMapAssetObjectKey
} = require('../../src/utils/storage/business-object-keys.ts');
const {
    helpText,
    initialProducerMapContent,
    nextProducerMapContent,
    parseArguments,
    parseLegacyMapScript,
    parseLegacyPage,
    syncProducerMapData,
    validateR2Acceptance,
    validateR2Target
} = require('../../scripts/migration/legacy-producer-map');

class MemoryStorage {
    constructor() {
        this.objects = new Map();
        this.revision = 0;
    }

    async get(key) {
        const object = this.objects.get(key);
        return object ? { ...object, body: Uint8Array.from(object.body) } : null;
    }

    async put(key, body, options = {}) {
        this.revision += 1;
        const object = {
            body: Uint8Array.from(body),
            size: body.byteLength,
            contentType: options.contentType || 'application/octet-stream',
            etag: `revision-${this.revision}`
        };
        this.objects.set(key, object);
        return { ...object, body: Uint8Array.from(object.body) };
    }

    async putIfUnchanged(key, expectedEtag, body, options = {}) {
        if ((this.objects.get(key)?.etag || null) !== expectedEtag) return null;
        return this.put(key, body, options);
    }
}

function dependencies() {
    return {
        objectKey: PRODUCER_MAP_OBJECT_KEY,
        parseContent: parseProducerMapContent,
        serializeContent: serializeProducerMapContent,
        validateDraft: validateProducerMapDraft
    };
}

function sourceFixture() {
    return {
        sourceBaseUrl: 'https://legacy.example',
        title: '全国偶像大师社群一览',
        subtitle: 'THE IDOLM@STER COMMUNITY MAP',
        regions: [
            {
                id: 'legacy-region-beijing',
                province: '北京市',
                name: '北京市',
                sourcePath: '/assets/images/maps/beijing.png',
                stem: 'beijing'
            },
            {
                id: 'legacy-region-guangdong',
                province: '广东省',
                name: '广东省',
                sourcePath: '/assets/images/maps/guangdong.png',
                stem: 'guangdong'
            }
        ],
        communities: [
            {
                id: 'site-owner-lounge',
                name: '站长小窝',
                platform: 'QQ',
                region: null,
                series: 'all',
                sourcePath: '/assets/images/qqcount/owner.png'
            },
            {
                id: 'ichibanboshi-lounge',
                name: '一番星の小窝',
                platform: 'QQ',
                region: null,
                series: 'all',
                sourcePath: '/assets/images/qqcount/star.jpg'
            }
        ]
    };
}

function mediaFixture(source) {
    return [...source.regions.map((item) => ({ kind: 'region', item })),
        ...source.communities.map((item) => ({ kind: 'community', item }))]
        .map(({ kind, item }) => {
            const extension = item.sourcePath.endsWith('.jpg') ? 'jpg' : 'png';
            const filename = kind === 'region'
                ? `region-${item.stem}.${extension}`
                : `community-${item.id}.${extension}`;
            const body = Buffer.from(`${kind}:${item.id}`);
            return {
                kind,
                id: item.id,
                name: item.name,
                sourcePath: item.sourcePath,
                filename,
                url: `/uploads/producer-map/${filename}`,
                key: producerMapAssetObjectKey(filename),
                bytes: body.byteLength,
                sha256: crypto.createHash('sha256').update(body).digest('hex'),
                contentType: extension === 'jpg' ? 'image/jpeg' : 'image/png',
                body
            };
        });
}

test('Producer Map migration is read-only by default and normalizes its source', () => {
    const options = parseArguments([
        '--',
        '--source-base-url',
        'https://legacy.example/',
        '--staging-dir',
        './producer-map'
    ], {});
    assert.equal(options.apply, false);
    assert.equal(options.sourceBaseUrl, 'https://legacy.example');
    assert.equal(options.staging, path.resolve('./producer-map'));
    assert.equal(options.manifest, path.resolve('./producer-map/manifest.json'));
    assert.match(helpText(), /read-only/);
    assert.throws(() => parseArguments(['--source-base-url']), /requires a value/);
    assert.throws(() => parseArguments(['--unknown']), /Unknown argument/);
});

test('Producer Map R2 acceptance arguments cannot enable writes', () => {
    const options = parseArguments([
        '--require-r2',
        '--expect-bucket',
        'imsweb-media-public-prod',
        '--expect-empty-prefix'
    ], {});
    assert.equal(options.requireR2, true);
    assert.equal(options.expectedBucket, 'imsweb-media-public-prod');
    assert.equal(options.expectEmptyPrefix, true);
    assert.throws(
        () => parseArguments([
            '--require-r2',
            '--expect-bucket',
            'imsweb-media-public-prod',
            '--apply'
        ], {}),
        /read-only/
    );
    assert.throws(
        () => parseArguments(['--require-r2'], {}),
        /requires --expect-bucket/
    );
});

test('Producer Map R2 acceptance validates the exact storage target', () => {
    const target = {
        type: 's3',
        bucket: 'imsweb-media-public-prod',
        region: 'auto',
        endpoint: 'https://example-account.r2.cloudflarestorage.com',
        forcePathStyle: false,
        prefix: '',
        readUrlTtlSeconds: 300
    };
    assert.doesNotThrow(() => validateR2Target(
        target,
        'imsweb-media-public-prod',
        true
    ));
    assert.throws(
        () => validateR2Target({ ...target, endpoint: 'http://127.0.0.1:9000' },
            target.bucket, true),
        /Cloudflare R2 S3 API endpoint/
    );
    assert.throws(
        () => validateR2Target({ ...target, region: 'us-east-1' }, target.bucket, true),
        /IMS_S3_REGION=auto/
    );
    assert.throws(
        () => validateR2Target(target, 'another-bucket', true),
        /IMS_S3_BUCKET=another-bucket/
    );
    assert.throws(
        () => validateR2Target({ ...target, prefix: 'production' }, target.bucket, true),
        /empty IMS_S3_PREFIX/
    );
});

test('Producer Map R2 acceptance fails unless source and objects are unchanged', () => {
    const accepted = {
        configStatus: 'unchanged',
        regionsAdded: 0,
        communitiesAdded: 0,
        imagesLinked: 0,
        media: [{ objectStatus: 'unchanged' }]
    };
    assert.doesNotThrow(() => validateR2Acceptance(accepted));
    assert.throws(
        () => validateR2Acceptance({
            ...accepted,
            media: [{ objectStatus: 'would-replace' }]
        }),
        /configuration or media differs/
    );
    assert.throws(
        () => validateR2Acceptance({ ...accepted, configStatus: 'would-write' }),
        /configuration or media differs/
    );
});

test('Producer Map parser reads legacy titles and community image paths', async () => {
    const content = await parseLegacyPage(`<!doctype html><html><body>
        <h1>全国偶像大师社群一览</h1>
        <p>THE IDOLM@STER COMMUNITY MAP</p>
        <a class="infonews-card" data-img="./assets/images/qqcount/owner.png">
            站长小窝
        </a>
        <a class="infonews-card" data-img="/assets/images/qqcount/U149_QQ.png">
            U149同好群
        </a>
    </body></html>`);
    assert.equal(content.title, '全国偶像大师社群一览');
    assert.deepEqual(content.communities.map((item) => item.id), [
        'site-owner-lounge',
        'u149-lounge'
    ]);
    assert.equal(content.communities[1].sourcePath, '/assets/images/qqcount/U149_QQ.png');
});

test('Producer Map parser requires one image for every canonical province', () => {
    const script = `const imgMap = {\n${PRODUCER_MAP_PROVINCES.map((province, index) =>
        `    "${province}": "/assets/images/maps/region${index}.png"`
    ).join(',\n')}\n};`;
    const regions = parseLegacyMapScript(script, PRODUCER_MAP_PROVINCES);
    assert.equal(regions.length, 34);
    assert.equal(regions[0].province, '北京市');
    assert.throws(
        () => parseLegacyMapScript(script.replace(/.*澳门特别行政区.*\n/, ''), PRODUCER_MAP_PROVINCES),
        /must map all 34/
    );
});

test('Producer Map migration applies idempotently and preserves admin edits', async () => {
    const storage = new MemoryStorage();
    const source = sourceFixture();
    const media = mediaFixture(source);

    const dryRun = await syncProducerMapData(storage, source, media, false, dependencies());
    assert.equal(dryRun.configStatus, 'would-write');
    assert.deepEqual(dryRun.media.map((item) => item.objectStatus), [
        'would-upload',
        'would-upload',
        'would-upload',
        'would-upload'
    ]);
    assert.equal(storage.objects.size, 0);

    const applied = await syncProducerMapData(storage, source, media, true, dependencies());
    assert.equal(applied.configStatus, 'created');
    assert.equal(applied.regionsAdded, 2);
    assert.equal(applied.imagesLinked, 4);
    assert.equal(storage.objects.size, 5);

    const rerun = await syncProducerMapData(storage, source, media, true, dependencies());
    assert.equal(rerun.configStatus, 'unchanged');
    assert.ok(rerun.media.every((item) => item.objectStatus === 'unchanged'));
    assert.equal(storage.objects.size, 5);

    const stored = await storage.get(PRODUCER_MAP_OBJECT_KEY);
    const customized = parseProducerMapContent(stored.body);
    customized.regions[0].summary = '管理员维护的北京社群说明';
    customized.regions[0].imageUrl = 'https://example.com/custom-beijing.png';
    customized.communities.at(-1).imageUrl = 'https://example.com/custom-star.png';
    await storage.put(
        PRODUCER_MAP_OBJECT_KEY,
        serializeProducerMapContent(customized),
        { contentType: 'application/json; charset=utf-8' }
    );

    const preserved = await syncProducerMapData(storage, source, media, true, dependencies());
    assert.equal(preserved.configStatus, 'unchanged');
    const final = parseProducerMapContent((await storage.get(PRODUCER_MAP_OBJECT_KEY)).body);
    assert.equal(final.regions[0].summary, '管理员维护的北京社群说明');
    assert.equal(final.regions[0].imageUrl, 'https://example.com/custom-beijing.png');
    assert.equal(final.communities.at(-1).imageUrl, 'https://example.com/custom-star.png');
});

test('Producer Map merge fails closed when staged media is incomplete', () => {
    const source = sourceFixture();
    assert.throws(
        () => nextProducerMapContent(initialProducerMapContent(source), source, []),
        /media is missing region/
    );
});
