'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { assertReactionContract } = require('../contracts/runtime-contracts.js');

function publicCardProjection(fixture) {
    return async () => {
        const { APPROVED_BACK_THUMBNAIL_URL, APPROVED_BACK_URL, APPROVED_FRONT_THUMBNAIL_URL, APPROVED_FRONT_URL, approvedCardId, baseUrl, pendingCardId } = fixture;
        const listResponse = await fetch(`${baseUrl}/api/cards?page=1&size=25`);
        assert.equal(listResponse.status, 200);
        const page = await listResponse.json();
        assert.equal(page.total, 1);
        assert.equal(page.list.length, 1);
        assert.equal(page.list[0].image1_url, APPROVED_FRONT_URL);
        assert.equal(page.list[0].image1_thumbnail_url, APPROVED_FRONT_THUMBNAIL_URL);
        assert.equal(page.list[0].image2_thumbnail_url, APPROVED_BACK_THUMBNAIL_URL);

        for (const privateField of ['ip', 'hash1', 'hash2']) {
            assert.equal(Object.hasOwn(page.list[0], privateField), false, privateField);
        }

        const approvedResponse = await fetch(`${baseUrl}/api/card/${approvedCardId}`);
        assert.deepEqual(await approvedResponse.json(), {
            image1_url: APPROVED_FRONT_URL,
            image2_url: APPROVED_BACK_URL
        });

        const pendingResponse = await fetch(`${baseUrl}/api/card/${pendingCardId}`);
        assert.deepEqual(await pendingResponse.json(), {});
    };
}

async function namecardMediaAccess(fixture) {
    const {
        APPROVED_FRONT_THUMBNAIL_URL,
        APPROVED_FRONT_URL,
        baseUrl,
        getOpToken,
        PENDING_FRONT_THUMBNAIL_URL,
        PENDING_FRONT_URL,
        validPng
    } = fixture;
        const approved = await fetch(`${baseUrl}${APPROVED_FRONT_URL}`);
        assert.equal(approved.status, 200);
        assert.equal(approved.headers.get('content-type'), 'image/png');
        assert.deepEqual(Buffer.from(await approved.arrayBuffer()), validPng);

        const pending = await fetch(`${baseUrl}${PENDING_FRONT_URL}`);
        assert.equal(pending.status, 401);

        const token = await getOpToken();
        const pendingForOp = await fetch(`${baseUrl}${PENDING_FRONT_URL}`, {
            headers: { authorization: token }
        });
        assert.equal(pendingForOp.status, 200);
        assert.equal(pendingForOp.headers.get('content-type'), 'image/png');
        assert.equal(pendingForOp.headers.get('cache-control'), 'private, no-store');
        assert.deepEqual(Buffer.from(await pendingForOp.arrayBuffer()), validPng);

        const approvedThumbnail = await fetch(`${baseUrl}${APPROVED_FRONT_THUMBNAIL_URL}`);
        assert.equal(approvedThumbnail.status, 200);
        assert.match(approvedThumbnail.headers.get('content-type'), /^image\/jpeg/);

        const privateThumbnail = await fetch(`${baseUrl}${PENDING_FRONT_THUMBNAIL_URL}`);
        assert.equal(privateThumbnail.status, 401);

        const privateThumbnailForOp = await fetch(`${baseUrl}${PENDING_FRONT_THUMBNAIL_URL}`, {
            headers: { authorization: token }
        });
        assert.equal(privateThumbnailForOp.status, 200);
        assert.equal(privateThumbnailForOp.headers.get('cache-control'), 'private, no-store');

    const removedDynamicThumbnail = await fetch(`${baseUrl}/api/thumbnail`);
    assert.equal(removedDynamicThumbnail.status, 404);
}

function spoofedImageUpload(fixture) {
    return async () => {
        const { baseUrl, NAMECARD_DIR } = fixture;
        const uploadDir = NAMECARD_DIR;
        const before = new Set(fs.readdirSync(uploadDir));
        const form = new FormData();
        form.append('images', new Blob(['not an image'], { type: 'image/jpeg' }), 'front.jpg');
        form.append('images', new Blob(['still not an image'], { type: 'image/jpeg' }), 'back.jpg');

        const response = await fetch(`${baseUrl}/api/community/exchange/guest-submissions`, {
            method: 'POST',
            body: form
        });
        assert.equal(response.status, 400);
        assert.deepEqual(new Set(fs.readdirSync(uploadDir)), before);
    };
}

function reactionValidation(fixture) {
    return async () => {
        const { approvedCardId, baseUrl } = fixture;
        const unsupported = await fetch(`${baseUrl}/api/reactions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: Number(approvedCardId), emoji: 'not-allowed' })
        });
        assert.equal(unsupported.status, 400);

        const missingCard = await fetch(`${baseUrl}/api/reactions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: 999999, emoji: '👍' })
        });
        assert.equal(missingCard.status, 404);

        const accepted = await fetch(`${baseUrl}/api/reactions`, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ id: Number(approvedCardId), emoji: '👍' })
        });
        assert.equal(accepted.status, 200);

        const listed = await fetch(`${baseUrl}/api/reactions?id=${approvedCardId}`);
        assert.equal(listed.status, 200);
        assert.equal((await listed.json())['👍'], 1);
    };
}

function sharedReactionContract(fixture) {
    return async () => {
        const { baseUrl, fixturePool, run, seedLegacyNamecard } = fixture;
        const reactionCardId = await seedLegacyNamecard(fixturePool, {
            frontUrl: '/contract-reaction-front.webp',
            backUrl: '/contract-reaction-back.webp',
            status: 'approved'
        });
        try {
            await assertReactionContract({
                runtime: 'Node',
                cardId: reactionCardId,
                request: (requestPath, init) => fetch(`${baseUrl}${requestPath}`, init)
            });
        } finally {
            await run(fixturePool, 'DELETE FROM namecard_reactions WHERE card_id=?', [`legacy-${reactionCardId}`]);
            await run(fixturePool, 'DELETE FROM card_emojis WHERE card_id=?', [reactionCardId]);
            await run(fixturePool, 'DELETE FROM fudaba_cards WHERE card_number=?', [reactionCardId]);
            await run(fixturePool, 'DELETE FROM cards WHERE id=?', [reactionCardId]);
        }
    };
}

function registerFudabaTests(fixture) {
    const { test } = fixture;
    test('public card endpoints only expose approved non-sensitive data', () =>
        publicCardProjection(fixture)());
    test('namecard originals and stored thumbnails enforce approval or op access', () =>
        namecardMediaAccess(fixture));
    test('spoofed image uploads are rejected without leaving files behind', () =>
        spoofedImageUpload(fixture)());
    test('reactions require an approved card and a supported value', () =>
        reactionValidation(fixture)());
    test('[CORE-01] shared reaction contract runs against Node PostgreSQL', () =>
        sharedReactionContract(fixture)());
}

module.exports = { registerFudabaTests };
