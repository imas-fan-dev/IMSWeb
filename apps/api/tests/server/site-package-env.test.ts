import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSitePackageMaxUploadBytes } from '@/config/env';
import {
    sitePackageFrameAncestorOrigins,
    sitePackageRequestOrigin
} from '@/domains/site-packages/site-package-support';

test('site-package content uses the current request origin', () => {
    const forwarded = new Request('http://upstream.test/sites/hiro-2026', {
        headers: {
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'preview.idol-master.top'
        }
    });
    assert.equal(sitePackageRequestOrigin(forwarded, 'direct'), 'http://upstream.test');
    assert.equal(
        sitePackageRequestOrigin(forwarded, 'nginx'),
        'https://preview.idol-master.top'
    );
    assert.equal(sitePackageRequestOrigin(new Request('http://upstream.test', {
        headers: {
            'x-forwarded-proto': 'http',
            'x-forwarded-host': 'main.test',
            'x-forwarded-port': '8080'
        }
    }), 'nginx'), 'http://main.test:8080');

    const invalidForwardedHeaders: Array<Record<string, string>> = [
        { 'x-forwarded-proto': 'javascript', 'x-forwarded-host': 'main.test' },
        { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'main.test/path' },
        { 'x-forwarded-proto': 'https', 'x-forwarded-host': 'main.test,evil.test' },
        {
            'x-forwarded-proto': 'https',
            'x-forwarded-host': 'main.test',
            'x-forwarded-port': '70000'
        }
    ];
    for (const headers of invalidForwardedHeaders) {
        assert.equal(
            sitePackageRequestOrigin(new Request('http://upstream.test', { headers }), 'nginx'),
            'http://upstream.test'
        );
    }
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
