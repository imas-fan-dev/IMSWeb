'use strict';

const assert = require('node:assert/strict');

function legacyInformationOwnership(fixture) {
    return async () => {
        const { baseUrl, getOpToken } = fixture;
        const token = await getOpToken();
        const auth = { authorization: `Bearer ${token}` };
        const unauthorized = await fetch(`${baseUrl}/api/admin/information`);
        assert.equal(unauthorized.status, 401);

        const retired = await fetch(`${baseUrl}/api/admin/information`, {
            method: 'POST',
            headers: { ...auth, 'content-type': 'application/json' },
            body: JSON.stringify({ title: 'retired information endpoint' })
        });
        assert.equal(retired.status, 410);
        assert.match(
            (await retired.json()).error,
            /已整合至社区帖子.*\/api\/admin\/community-posts/
        );

        const publicIndex = await fetch(`${baseUrl}/api/information`);
        assert.equal(publicIndex.status, 200);
    };
}

function registerInformationTests(fixture) {
    const { test } = fixture;
    test('legacy information remains public while management points to community posts', () =>
        legacyInformationOwnership(fixture)());
}

module.exports = { registerInformationTests };
