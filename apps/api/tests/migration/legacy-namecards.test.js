'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const {
    helpText,
    normalizeCard,
    normalizeReactions,
    parseArguments,
    sourceTimestamp,
    targetFilename,
    targetUrl
} = require('../../scripts/migration/legacy-namecards');

test('Legacy namecard migration is read-only by default and normalizes its source', () => {
    const options = parseArguments([
        '--',
        '--source-base-url',
        'https://legacy.example/',
        '--staging-dir',
        './namecards'
    ], {});
    assert.equal(options.apply, false);
    assert.equal(options.sourceBaseUrl, 'https://legacy.example');
    assert.equal(options.staging, path.resolve('./namecards'));
    assert.equal(options.manifest, path.resolve('./namecards/manifest.json'));
    assert.match(helpText(), /does not change PostgreSQL or S3 unless --apply/);
});

test('Legacy namecard migration accepts explicit apply confirmations', () => {
    const options = parseArguments([
        '--apply',
        '--confirm-source',
        'https://legacy.example',
        '--confirm-bucket',
        'ims-media'
    ], { IMS_LEGACY_NAMECARD_BASE_URL: 'https://legacy.example/' });
    assert.equal(options.apply, true);
    assert.equal(options.confirmSource, options.sourceBaseUrl);
    assert.equal(options.confirmBucket, 'ims-media');
    assert.throws(() => parseArguments(['--source-base-url']), /requires a value/);
    assert.throws(() => parseArguments(['--unknown']), /Unknown argument/);
});

test('Legacy namecard records become validated canonical migration inputs', () => {
    assert.deepEqual(normalizeCard({
        id: 42,
        image1_url: '/uploads/namecard/original/front.png',
        image2_url: '/uploads/namecard/original/back.webp',
        hash1: 'A'.repeat(32),
        hash2: 'b'.repeat(32),
        ip: '127.0.0.1',
        status: 'approved',
        created_at: '2026-07-25 02:12:55'
    }), {
        id: 42,
        sourceImage1Url: '/uploads/namecard/original/front.png',
        sourceImage2Url: '/uploads/namecard/original/back.webp',
        hash1: 'a'.repeat(32),
        hash2: 'b'.repeat(32),
        ip: '127.0.0.1',
        status: 'approved',
        createdAt: '2026-07-25T02:12:55.000Z'
    });
    assert.throws(() => normalizeCard({ id: 1 }), /invalid media hash/);
    assert.throws(() => normalizeCard({
        id: 1,
        image1_url: 'https://other.example/front.png',
        image2_url: '/uploads/namecard/original/back.png',
        hash1: 'a'.repeat(32),
        hash2: 'b'.repeat(32),
        status: 'approved',
        created_at: '2026-07-25 02:12:55'
    }), /media URL/i);
    assert.throws(() => normalizeCard({
        id: 1,
        image1_url: '/uploads/namecard/original/../../private.png',
        image2_url: '/uploads/namecard/original/back.png',
        hash1: 'a'.repeat(32),
        hash2: 'b'.repeat(32),
        status: 'approved',
        created_at: '2026-07-25 02:12:55'
    }), /media URL/i);
});

test('Legacy namecard targets use stable ASCII URLs and semantic key inputs', () => {
    const filename = targetFilename(42, 'front', 'webp');
    assert.equal(filename, 'card-42-front.webp');
    assert.equal(targetUrl(filename), '/uploads/namecard/original/card-42-front.webp');
    assert.equal(sourceTimestamp('2026-07-25 02:12:55'), '2026-07-25T02:12:55.000Z');
    assert.throws(() => targetFilename(42, 'side', 'webp'), /Invalid canonical/);
});

test('Legacy reactions reject invalid counts', () => {
    assert.deepEqual(normalizeReactions({ 'heart': 2, 'party': 3 }, 42), [
        { emoji: 'heart', count: 2 },
        { emoji: 'party', count: 3 }
    ]);
    assert.throws(() => normalizeReactions({ party: 0 }, 42), /invalid value/);
});
