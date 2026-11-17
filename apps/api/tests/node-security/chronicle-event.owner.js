'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');

function unauthenticatedManagementRoutes(fixture) {
    return async () => {
        const { baseUrl } = fixture;
        const requests = [
            ['/api/events', { method: 'POST' }],
            ['/api/events/1', { method: 'DELETE' }],
            ['/eventchronicle/admin', {}],
            ['/eventchronicle/admin/pending', {}],
            ['/eventchronicle/admin/used', {}],
            ['/eventchronicle/admin/approve/1/photo.jpg', { method: 'POST' }],
            ['/eventchronicle/admin/reject/1/photo.jpg', { method: 'POST' }],
            ['/eventchronicle/admin/delete-used/1/photo.jpg', { method: 'DELETE' }]
        ];

        for (const [requestPath, options] of requests) {
            const response = await fetch(`${baseUrl}${requestPath}`, options);
            assert.equal(response.status, 401, `${options.method || 'GET'} ${requestPath}`);
        }
    };
}

function eventDeletionCleanupFailure(fixture) {
    return async () => {
        const { baseUrl, EVENT_DIR, fixturePool, get, getOpToken, run, TEST_FILE_PREFIX } = fixture;
        const filename = `${TEST_FILE_PREFIX}-cleanup-failure.png`;
        const extension = path.extname(filename);
        const mediaPath = path.join(
            EVENT_DIR,
            path.basename(filename, extension),
            `poster${extension}`
        );
        fs.mkdirSync(path.dirname(mediaPath), { recursive: true });
        fs.mkdirSync(mediaPath);

        const insert = await run(
            fixturePool,
            'INSERT INTO events (title, name, contact, image_url) VALUES (?, ?, ?, ?) RETURNING id',
            ['cleanup test', 'test', 'test', `/uploads/event/original/${filename}`]
        );

        try {
            const token = await getOpToken();
            const response = await fetch(`${baseUrl}/api/events/${insert.lastID}`, {
                method: 'DELETE',
                headers: { authorization: token }
            });
            assert.equal(response.status, 200);

            const row = await get(fixturePool, 'SELECT id FROM events WHERE id = ?', [insert.lastID]);
            assert.equal(row, undefined);
            assert.equal(fs.lstatSync(mediaPath).isDirectory(), true);
        } finally {
            fs.rmSync(mediaPath, { recursive: true, force: true });
        }
    };
}

async function pendingChronicleMediaAuth(fixture) {
    const { baseUrl, chronicleBase, getOpToken } = fixture;
    const pendingDir = path.join(chronicleBase, 'media/pending', 'activity-one');
    const pendingBody = Buffer.from('test image');
    const pendingUrl =
        `${baseUrl}/assets/images/eventchronicle/events/upload/activity-one/photo.jpg`;
    fs.mkdirSync(pendingDir, { recursive: true });
    fs.writeFileSync(path.join(pendingDir, 'photo.jpg'), pendingBody);

    const unauthenticated = await fetch(pendingUrl);
    assert.equal(unauthenticated.status, 401);

    const token = await getOpToken();
    const headers = { authorization: token };
    const authenticated = await fetch(pendingUrl, { headers });
    assert.equal(authenticated.status, 200);
    assert.equal(authenticated.headers.get('content-type'), 'image/jpeg');
    assert.equal(authenticated.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(Buffer.from(await authenticated.arrayBuffer()), pendingBody);

    const authenticatedHead = await fetch(pendingUrl, { method: 'HEAD', headers });
    assert.equal(authenticatedHead.status, 200);
    assert.equal(authenticatedHead.headers.get('content-type'), 'image/jpeg');
    assert.equal((await authenticatedHead.arrayBuffer()).byteLength, 0);

    const missing = await fetch(
        `${baseUrl}/assets/images/eventchronicle/events/upload/activity-one/missing.jpg`,
        { headers }
    );
    assert.equal(missing.status, 404);
    assert.equal(missing.headers.get('content-type'), 'text/plain; charset=UTF-8');
    assert.equal(await missing.text(), 'Not Found');

    const adminRedirect = await fetch(`${baseUrl}/eventchronicle/admin`, {
        headers,
        redirect: 'manual'
    });
    assert.equal(adminRedirect.status, 301);
    assert.equal(adminRedirect.headers.get('location'), '/admin/chronicle');
}

function chronicleUploadActivityId(fixture) {
    return async () => {
        const { baseUrl, chronicleBase, validPng } = fixture;
        const activityId = 'activity-file-first';
        const form = new FormData();
        form.append('images', new Blob([validPng], { type: 'image/png' }), 'ordered.png');
        form.append('activityId', activityId);
        form.append('username', 'Uploader');

        const response = await fetch(`${baseUrl}/eventchronicle/upload`, {
            method: 'POST',
            body: form
        });
        assert.equal(response.status, 200);

        const metaPath = path.join(chronicleBase, 'metadata', `${activityId}.json`);
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        assert.equal(meta.records.length, 1);
        assert.equal(
            fs.existsSync(path.join(
                chronicleBase,
                'media/pending',
                activityId,
                meta.records[0].filename
            )),
            true
        );
        assert.deepEqual(fs.readdirSync(path.join(chronicleBase, '.staging')), []);
    };
}

function chroniclePendingState(fixture) {
    return async () => {
        const { baseUrl, chronicleBase, getOpToken, validPng } = fixture;
        const activityId = 'activity-state';
        const uploadDir = path.join(chronicleBase, 'media/pending', activityId);
        const usedDir = path.join(chronicleBase, 'media/published', activityId);
        const metaPath = path.join(chronicleBase, 'metadata', `${activityId}.json`);
        fs.mkdirSync(uploadDir, { recursive: true });
        fs.mkdirSync(usedDir, { recursive: true });
        fs.writeFileSync(path.join(uploadDir, 'pending.png'), validPng);
        fs.writeFileSync(path.join(uploadDir, 'orphan.png'), validPng);
        fs.writeFileSync(path.join(usedDir, 'approved.png'), validPng);
        fs.writeFileSync(metaPath, JSON.stringify({
            title: 'State test',
            records: [
                { filename: 'pending.png', status: 'pending' },
                { filename: 'approved.png', status: 'approved' },
                { filename: 'missing.png', status: 'pending' }
            ]
        }));
        const token = await getOpToken();
        const headers = { authorization: token };

        const approved = await fetch(
            `${baseUrl}/eventchronicle/admin/approve/${activityId}/pending.png`,
            { method: 'POST', headers }
        );
        assert.equal(approved.status, 200);
        assert.equal(fs.existsSync(path.join(usedDir, 'pending.png')), true);

        const orphan = await fetch(
            `${baseUrl}/eventchronicle/admin/approve/${activityId}/orphan.png`,
            { method: 'POST', headers }
        );
        assert.equal(orphan.status, 409);
        assert.equal(fs.existsSync(path.join(uploadDir, 'orphan.png')), true);

        const rejectApproved = await fetch(
            `${baseUrl}/eventchronicle/admin/reject/${activityId}/approved.png`,
            { method: 'POST', headers }
        );
        assert.equal(rejectApproved.status, 409);

        const rejectMissingFile = await fetch(
            `${baseUrl}/eventchronicle/admin/reject/${activityId}/missing.png`,
            { method: 'POST', headers }
        );
        assert.equal(rejectMissingFile.status, 200);

        const finalMeta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        assert.equal(finalMeta.records.find(record => record.filename === 'pending.png').status, 'approved');
        assert.equal(finalMeta.records.some(record => record.filename === 'approved.png'), true);
        assert.equal(finalMeta.records.some(record => record.filename === 'missing.png'), false);
    };
}

function chronicleListingFormats(fixture) {
    return async () => {
        const { baseUrl, chronicleBase, getOpToken, validPng } = fixture;
        const activityId = 'activity-formats';
        const usedDir = path.join(chronicleBase, 'media/published', activityId);
        const metaDir = path.join(chronicleBase, 'metadata');
        fs.mkdirSync(usedDir, { recursive: true });
        fs.mkdirSync(metaDir, { recursive: true });
        fs.writeFileSync(
            path.join(usedDir, 'photo.jfif'),
            await sharp(validPng).jpeg().toBuffer()
        );
        fs.writeFileSync(path.join(metaDir, 'legacy-xss.json'), JSON.stringify({
            records: [{
                filename: 'legacy"><img src=x onerror=alert(1)>.jpg',
                uploader: '<img src=x onerror=alert(1)>',
                status: 'pending'
            }]
        }));

        const token = await getOpToken();
        const used = await fetch(`${baseUrl}/eventchronicle/admin/used`, {
            headers: { authorization: token }
        });
        const usedData = await used.json();
        assert.equal(usedData[activityId][0].filename, 'photo.jfif');

        const pending = await fetch(`${baseUrl}/eventchronicle/admin/pending`, {
            headers: { authorization: token }
        });
        const pendingData = await pending.json();
        assert.match(pendingData['legacy-xss'][0].url, /%22%3E%3Cimg/);
    };
}

function chronicleDeletionMetadata(fixture) {
    return async () => {
        const { baseUrl, chronicleBase, getOpToken } = fixture;
        const activityId = 'activity-delete';
        const usedDir = path.join(chronicleBase, 'media/published', activityId);
        const metaDir = path.join(chronicleBase, 'metadata');
        fs.mkdirSync(usedDir, { recursive: true });
        fs.mkdirSync(metaDir, { recursive: true });
        fs.writeFileSync(path.join(usedDir, 'photo.jpg'), 'test image');
        fs.writeFileSync(path.join(metaDir, `${activityId}.json`), JSON.stringify({
            title: 'Keep this title',
            records: [
                { filename: 'photo.jpg', status: 'approved' },
                { filename: 'other.jpg', status: 'approved' }
            ]
        }));

        const token = await getOpToken();
        const response = await fetch(
            `${baseUrl}/eventchronicle/admin/delete-used/${activityId}/photo.jpg`,
            { method: 'DELETE', headers: { authorization: token } }
        );
        assert.equal(response.status, 200);
        assert.equal(fs.existsSync(path.join(usedDir, 'photo.jpg')), false);

        const meta = JSON.parse(fs.readFileSync(path.join(metaDir, `${activityId}.json`), 'utf8'));
        assert.equal(meta.title, 'Keep this title');
        assert.deepEqual(meta.records, [{ filename: 'other.jpg', status: 'approved' }]);

        const traversal = await fetch(
            `${baseUrl}/eventchronicle/admin/delete-used/bad%2Fid/photo.jpg`,
            { method: 'DELETE', headers: { authorization: token } }
        );
        assert.equal(traversal.status, 400);
    };
}

function chronicleUnicodeIdentity(fixture) {
    return async () => {
        const { baseUrl, chronicleBase, getOpToken, validPng } = fixture;
        const activityId = 'activity-e\u0301';
        const filename = 'photo-e\u0301.png';
        const usedDir = path.join(chronicleBase, 'media/published', activityId);
        const metaPath = path.join(chronicleBase, 'metadata', `${activityId}.json`);
        fs.mkdirSync(usedDir, { recursive: true });
        fs.writeFileSync(path.join(usedDir, filename), validPng);
        fs.writeFileSync(metaPath, JSON.stringify({
            records: [{ filename, status: 'approved' }]
        }));

        const token = await getOpToken();
        const response = await fetch(
            `${baseUrl}/eventchronicle/admin/delete-used/${encodeURIComponent(activityId)}/${encodeURIComponent(filename)}`,
            { method: 'DELETE', headers: { authorization: token } }
        );
        assert.equal(response.status, 200);
        assert.equal(fs.existsSync(path.join(usedDir, filename)), false);
    };
}

function registerChronicleEventTests(fixture) {
    const { test } = fixture;
    test('unauthenticated management routes return 401', () =>
        unauthenticatedManagementRoutes(fixture)());
    test('event deletion survives media cleanup failure after database commit', () =>
        eventDeletionCleanupFailure(fixture)());
    test('pending chronicle media requires op authentication', () =>
        pendingChronicleMediaAuth(fixture));
    test('chronicle upload commits files using the final multipart activityId', () =>
        chronicleUploadActivityId(fixture)());
    test('chronicle approval and rejection enforce pending state', () =>
        chroniclePendingState(fixture)());
    test('chronicle listings share upload formats and safely encode legacy metadata', () =>
        chronicleListingFormats(fixture)());
    test('chronicle deletion preserves object metadata and rejects traversal', () =>
        chronicleDeletionMetadata(fixture)());
    test('chronicle operations preserve decomposed Unicode path identity', () =>
        chronicleUnicodeIdentity(fixture)());
}

module.exports = { registerChronicleEventTests };
