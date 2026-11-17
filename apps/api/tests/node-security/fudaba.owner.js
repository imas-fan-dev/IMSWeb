'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { assertReactionContract } = require('../contracts/runtime-contracts.js');

function publicCardProjection(fixture) {
    return async () => {
        const { APPROVED_BACK_ROUTE_URL, APPROVED_FRONT_ROUTE_URL, approvedCardId, baseUrl, pendingCardId } = fixture;
        const listResponse = await fetch(`${baseUrl}/api/cards?page=1&size=25`);
        assert.equal(listResponse.status, 200);
        const page = await listResponse.json();
        assert.equal(page.total, 1);
        assert.equal(page.list.length, 1);
        const [front, back] = page.list[0].pages;
        assert.equal(front.url.startsWith(`${APPROVED_FRONT_ROUTE_URL}`), true);
        assert.equal(back.url.startsWith(`${APPROVED_BACK_ROUTE_URL}`), true);

        for (const privateField of ['ip', 'hash1', 'hash2']) {
            assert.equal(Object.hasOwn(page.list[0], privateField), false, privateField);
        }

        const approvedResponse = await fetch(`${baseUrl}/api/cards/${approvedCardId}`);
        assert.equal(approvedResponse.status, 200);
        const approvedCard = (await approvedResponse.json()).card;
        assert.equal(approvedCard?.producerName, page.list[0].producerName);
        for (const privateField of ['ip', 'hash1', 'hash2']) {
            assert.equal(Object.hasOwn(approvedCard, privateField), false, privateField);
        }

        // 未发布的名片按公开契约返回空卡片，而不是 404。
        const pendingResponse = await fetch(`${baseUrl}/api/cards/${pendingCardId}`);
        assert.equal(pendingResponse.status, 200);
        assert.deepEqual(await pendingResponse.json(), { card: null });
    };
}

async function namecardMediaAccess(fixture) {
    const {
        APPROVED_FRONT_THUMBNAIL_URL,
        APPROVED_FRONT_URL,
        baseUrl,
        getOpToken,
        PENDING_FRONT_THUMBNAIL_URL,
        PENDING_FRONT_URL
    } = fixture;
    // 旧上传/缩略图路由已退役：这些地址对匿名与 op 一律 404，
    // 公开媒体只经统一的名片页面路由提供。
    const retiredPaths = [
        APPROVED_FRONT_URL,
        APPROVED_FRONT_THUMBNAIL_URL,
        PENDING_FRONT_URL,
        PENDING_FRONT_THUMBNAIL_URL
    ];
    for (const requestPath of retiredPaths) {
        const anonymous = await fetch(`${baseUrl}${requestPath}`);
        assert.equal(anonymous.status, 404, requestPath);
    }
    const token = await getOpToken();
    for (const requestPath of retiredPaths) {
        const forOp = await fetch(`${baseUrl}${requestPath}`, {
            headers: { authorization: token }
        });
        assert.equal(forOp.status, 404, requestPath);
    }

    const removedDynamicThumbnail = await fetch(`${baseUrl}/api/thumbnail`);
    assert.equal(removedDynamicThumbnail.status, 404);
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
    test('reactions require an approved card and a supported value', () =>
        reactionValidation(fixture)());
    test('[CORE-01] shared reaction contract runs against Node PostgreSQL', () =>
        sharedReactionContract(fixture)());
}

module.exports = { registerFudabaTests };
