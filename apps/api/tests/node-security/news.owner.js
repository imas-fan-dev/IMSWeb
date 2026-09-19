'use strict';

const assert = require('node:assert/strict');

function newsPagination(fixture) {
    return async () => {
        const { baseUrl, fixturePool, run } = fixture;
        const legacy = await fetch(`${baseUrl}/api/news`);
        assert.equal(legacy.status, 200);
        const legacyBody = await legacy.json();
        assert.equal(Array.isArray(legacyBody), true);
        assert.deepEqual(legacyBody.map((item) => item.id), [3, 2, 1]);

        const first = await fetch(`${baseUrl}/api/news?limit=2`);
        assert.equal(first.status, 200);
        const firstBody = await first.json();
        assert.deepEqual(firstBody.items.map((item) => item.id), [3, 2]);
        assert.equal(firstBody.pageInfo.hasNextPage, true);
        assert.equal(firstBody.pageInfo.snapshotAt, '3');

        await run(
            fixturePool,
            `INSERT INTO news (title, image, thumbnail, content, date, author)
             VALUES ('New after snapshot', '', '', 'https://example.test/new', '2026-07-24', 'Fixture')`
        );

        const second = await fetch(
            `${baseUrl}/api/news?limit=2&cursor=${encodeURIComponent(firstBody.pageInfo.nextCursor)}`
        );
        assert.equal(second.status, 200);
        const secondBody = await second.json();
        assert.deepEqual(secondBody.items.map((item) => item.id), [1]);
        assert.deepEqual(secondBody.pageInfo, {
            nextCursor: null,
            hasNextPage: false,
            snapshotAt: '3'
        });

        const refreshed = await fetch(`${baseUrl}/api/news?limit=1`);
        assert.equal((await refreshed.json()).items[0].id, 4);
        assert.equal((await fetch(`${baseUrl}/api/news?limit=0`)).status, 400);
        assert.equal((await fetch(`${baseUrl}/api/news?cursor=invalid`)).status, 400);
    };
}

function newsPublishingValidation(fixture) {
    return async () => {
        const { baseUrl, getOpToken } = fixture;
        const token = await getOpToken();
        const missingBody = await fetch(`${baseUrl}/api/admin/news`, {
            method: 'POST',
            headers: { authorization: `Bearer ${token}` }
        });
        assert.equal(missingBody.status, 400);

        const unsafeLink = await fetch(`${baseUrl}/api/admin/news`, {
            method: 'POST',
            headers: {
                authorization: `Bearer ${token}`,
                'content-type': 'application/json'
            },
            body: JSON.stringify({ title: 'unsafe', content: 'javascript:alert(1)' })
        });
        assert.equal(unsafeLink.status, 400);
        assert.equal((await fetch(`${baseUrl}/api/news`)).status, 200);
    };
}

function newsAuditMissingUser(fixture) {
    return async () => {
        const { baseUrl, fixturePool, get, getOpToken, run } = fixture;
        const token = await getOpToken();
        const beforeRow = await get(
            fixturePool,
            "SELECT COUNT(*)::integer AS total FROM logs WHERE action='发布新闻'"
        );
        const deletedUser = await get(
            fixturePool,
            `DELETE FROM users WHERE username='security-test-op'
             RETURNING username, password, dept, producername`
        );
        try {
            const response = await fetch(`${baseUrl}/api/admin/news`, {
                method: 'POST',
                headers: {
                    authorization: `Bearer ${token}`,
                    'content-type': 'application/json'
                },
                body: JSON.stringify({
                    title: 'missing-user-audit-check',
                    content: 'https://example.com/news'
                })
            });
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), {
                success: false,
                msg: '用户信息获取失败'
            });

            const afterRow = await get(
                fixturePool,
                "SELECT COUNT(*)::integer AS total FROM logs WHERE action='发布新闻'"
            );
            assert.equal(afterRow.total, beforeRow.total);
        } finally {
            await run(
                fixturePool,
                `INSERT INTO users (username, password, dept, producername)
                 VALUES (?, ?, ?, ?)`,
                [
                    deletedUser.username,
                    deletedUser.password,
                    deletedUser.dept,
                    deletedUser.producername
                ]
            );
        }
    };
}

function registerNewsTests(fixture) {
    const { test } = fixture;
    test('compiled Node news route preserves legacy responses and snapshot pagination', () =>
        newsPagination(fixture)());
    test('news publishing rejects missing bodies and unsafe links', () =>
        newsPublishingValidation(fixture)());
    test('news publishing does not write an audit record when user lookup fails', () =>
        newsAuditMissingUser(fixture)());
}

module.exports = { registerNewsTests };
