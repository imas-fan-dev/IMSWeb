'use strict';

const assert = require('node:assert/strict');
const nodeCrypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {
    assertMediaRangeContract,
    assertMultipartParserContract
} = require('../contracts/runtime-contracts.js');

async function sensitiveFilesAndVirtualEnvironments(fixture) {
    const { baseUrl } = fixture;
    const sensitivePaths = [
            '/idol_data.db',
            '/uploads/idol_data.db',
            '/idol_data.db-wal',
            '/idol_data.db-journal',
            '/database-cache.wal',
            '/app.py',
            '/uwsgi.ini',
            '/logs/error.log',
            '/requirements.txt',
            '/README.md',
            '/templates/story.html',
            '/Data/private-image.webp',
            '/assets/images/eventchronicle/events/meta/private.json',
            '/assets/images/eventchronicle/events/.idempotency/private.json',
            '/icon/title(1).7z',
            '/venv/lib/python/site.py',
            // pi-lens-ignore: typos
            '/3250ee7dc65bd965bbd1529ba5c2d732_venv/get-pip.py',
            '/%2561pp.py'
        ];

    for (const requestPath of sensitivePaths) {
        const response = await fetch(`${baseUrl}${requestPath}`);
        assert.equal(response.status, 403, requestPath);
        assert.equal(await response.text(), 'Forbidden', requestPath);
        assert.equal(
            response.headers.get('content-type'),
            'text/plain; charset=UTF-8',
            requestPath
        );
    }
}

function rawDotSegments(fixture) {
    return async () => {
        const { rawRequest } = fixture;
        const paths = [
            '/x/../templates/story.html',
            '/assets/images/eventchronicle/events/x/../meta/2026IFE2.json',
            '/assets/images/eventchronicle/events/%2e%2e/meta/private.json'
        ];
        for (const requestPath of paths) {
            const response = await rawRequest(requestPath);
            assert.equal(response.statusCode, 403, requestPath);
        }
    };
}

function mediaRangeMatrix(fixture) {
    return async () => {
        const { APPROVED_FRONT_URL, baseUrl, validPng } = fixture;
        await assertMediaRangeContract({
            runtime: 'Node',
            path: APPROVED_FRONT_URL,
            body: new Uint8Array(validPng),
            contentType: 'image/png',
            etag: `"${nodeCrypto.createHash('sha256').update(validPng).digest('hex')}"`,
            request: (requestPath, init) => fetch(`${baseUrl}${requestPath}`, init)
        });
    };
}

function streamingMultipartContract(fixture) {
    return async () => {
        const { PROJECT_ROOT } = fixture;
        const { StreamingUploadParser } = require(path.join(
            PROJECT_ROOT,
            'dist/server/infra/http/busboy/upload-parser.js'
        ));
        const parser = new StreamingUploadParser();
        await assertMultipartParserContract({
            runtime: 'Node',
            parse: (request, options) => parser.parse(request, options),
            request(body, contentType) {
                return new Request('http://ims.test/upload', {
                    method: 'POST',
                    headers: { 'Content-Type': contentType },
                    body
                });
            }
        });
    };
}

function publicUploadLimiter(fixture) {
    return async () => {
        const { baseUrl, chronicleBase, NAMECARD_DIR, validPng } = fixture;
        const clientHeaders = { 'x-forwarded-for': '192.0.2.81' };
        let limited = false;
        for (let attempt = 0; attempt < 35; attempt += 1) {
            const form = new FormData();
            form.append('images', new Blob(['invalid'], { type: 'text/plain' }), 'invalid.txt');
            const response = await fetch(`${baseUrl}/api/community/exchange/guest-submissions`, {
                method: 'POST',
                headers: clientHeaders,
                body: form
            });
            if (response.status === 429) {
                limited = true;
                break;
            }
            assert.equal(response.status, 400);
        }
        assert.equal(limited, true);

        const namecardsBefore = new Set(fs.readdirSync(NAMECARD_DIR));
        const validNamecard = new FormData();
        validNamecard.append('images', new Blob([validPng], { type: 'image/png' }), 'front.png');
        validNamecard.append('images', new Blob([validPng], { type: 'image/png' }), 'back.png');
        const namecardResponse = await fetch(`${baseUrl}/api/community/exchange/guest-submissions`, {
            method: 'POST',
            headers: clientHeaders,
            body: validNamecard
        });
        assert.equal(namecardResponse.status, 429);
        assert.deepEqual(new Set(fs.readdirSync(NAMECARD_DIR)), namecardsBefore);

        const blockedActivity = 'rate-limited-activity';
        const validChronicle = new FormData();
        validChronicle.append('activityId', blockedActivity);
        validChronicle.append('images', new Blob([validPng], { type: 'image/png' }), 'photo.png');
        const chronicleResponse = await fetch(`${baseUrl}/eventchronicle/upload`, {
            method: 'POST',
            headers: clientHeaders,
            body: validChronicle
        });
        assert.equal(chronicleResponse.status, 429);
        assert.equal(
            fs.existsSync(path.join(chronicleBase, 'upload', blockedActivity)),
            false
        );
    };
}

function registerCompiledListenerStaticAdapterTests(fixture) {
    const { test } = fixture;
    test('sensitive files and virtual environments are blocked before static serving', () =>
        sensitiveFilesAndVirtualEnvironments(fixture));
    test('raw dot segments cannot bypass sensitive static path checks', () =>
        rawDotSegments(fixture)());
    test('[MEDIA-01] shared GET/HEAD and range matrix runs against Node filesystem media', () =>
        mediaRangeMatrix(fixture)());
    test('[MEDIA-01 NODE-01] shared multipart contract runs against Node streaming parser', () =>
        streamingMultipartContract(fixture)());
    test('public upload limiter rejects before Multer writes to disk', () =>
        publicUploadLimiter(fixture)());
}

module.exports = { registerCompiledListenerStaticAdapterTests };
