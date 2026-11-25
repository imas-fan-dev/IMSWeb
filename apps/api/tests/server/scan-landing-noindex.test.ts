import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createHonoApp } from '@/app';

/**
 * 扫码落地页不索引：令牌是私下出示的凭据。这里不构建前端，只验证 notFound
 * 出口对落地页路径追加的响应头与路径判定（含尾斜杠）。
 */
function app() {
    return createHonoApp(() => ({
        staticAssets: {
            async fetchShell() {
                return new Response('<html>spa</html>', {
                    headers: { 'content-type': 'text/html' },
                });
            },
            async fetch() {
                return new Response('<html>spa</html>', {
                    headers: { 'content-type': 'text/html' },
                });
            },
        },
    }));
}

const TOKEN = 'a'.repeat(64);

test('the scan landing shell is not indexable', async () => {
    const server = app();
    for (const path of [`/exchange/scan/${TOKEN}`, `/exchange/scan/${TOKEN}/`]) {
        const response = await server.request(path);
        assert.equal(response.status, 200, path);
        assert.equal(
            response.headers.get('x-robots-tag'),
            'noindex, nofollow',
            path,
        );
    }
});

test('other frontend shells keep their headers untouched', async () => {
    const server = app();
    const response = await server.request('/exchange/scan/not-a-token');
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('x-robots-tag'), null);
});
