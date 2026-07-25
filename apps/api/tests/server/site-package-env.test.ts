import assert from 'node:assert/strict';
import test from 'node:test';
import {
    parseSiteOrigins,
    parseSitePackageMaxUploadBytes
} from '@/config/env';
import { sitePackageFrameAncestorOrigins } from '@/domains/site-packages/site-package-support';

test('site-package content uses the explicit main-site origin', () => {
    assert.deepEqual(parseSiteOrigins({ NODE_ENV: 'development', PORT: '4100' }), {
        siteOrigin: 'http://127.0.0.1:5173'
    });
    assert.deepEqual(parseSiteOrigins({
        NODE_ENV: 'production',
        IMS_SITE_ORIGIN: 'https://www.example.com'
    }), {
        siteOrigin: 'https://www.example.com'
    });
    assert.throws(
        () => parseSiteOrigins({ NODE_ENV: 'production' }),
        /required in production/
    );
    assert.deepEqual(parseSiteOrigins({
        NODE_ENV: 'production',
        IMS_SITE_ORIGIN: 'https://www.example.co.uk'
    }), {
        siteOrigin: 'https://www.example.co.uk'
    });
    assert.throws(() => parseSiteOrigins({
        NODE_ENV: 'production',
        IMS_SITE_ORIGIN: 'https://www.example.com/path'
    }), /without a path/);
});

test('site-package frame ancestors accept loopback aliases only for local development', () => {
    assert.deepEqual(sitePackageFrameAncestorOrigins('http://127.0.0.1:5173'), [
        'http://127.0.0.1:5173',
        'http://localhost:5173',
        'http://[::1]:5173'
    ]);
    assert.deepEqual(sitePackageFrameAncestorOrigins('https://www.example.com'), [
        'https://www.example.com'
    ]);
});

test('site-package upload limit is bounded by the archive parser maximum', () => {
    assert.equal(parseSitePackageMaxUploadBytes(undefined), 25 * 1024 * 1024);
    assert.equal(parseSitePackageMaxUploadBytes('1048576'), 1_048_576);
    for (const invalid of ['0', '-1', '1.5', '26214401', 'not-a-number']) {
        assert.throws(() => parseSitePackageMaxUploadBytes(invalid), /positive safe integer/);
    }
});
