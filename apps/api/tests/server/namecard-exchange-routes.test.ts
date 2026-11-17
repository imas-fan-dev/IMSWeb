/**
 * 交换路由的接线冒烟：分享页可以匿名读，写入必须登录，缺卡缺号各自回各自的错。
 * 交换本身的规则在 `namecard-exchange.test.ts` 里对着真库跑。
 */
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createTestApp } from './test-app';
import type { NamecardRepository } from '@/ports/repositories/namecards';
import type { RuntimeServices } from '@/ports/runtime-services';

function fixture(overrides: Partial<NamecardRepository> = {}) {
    const namecards: Partial<NamecardRepository> = {
        async findCardByExchangeSlug() {
            return null;
        },
        async findExchangeTarget() {
            return null;
        },
        async commitExchange() {
            throw new Error('unexpected exchange commit');
        },
        ...overrides,
    };
    return createTestApp(
        () => ({ namecards: namecards as NamecardRepository }) as RuntimeServices,
    );
}

test('an unknown share slug answers not found', async () => {
    const app = fixture();
    const response = await app.request('/api/community/exchange/card/aaaaaaaaaaaa');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: '这张名片当前不开放交换' });
});

test('a share slug that is not twelve lowercase characters never reaches the repository', async () => {
    const app = fixture();
    for (const slug of ['short', 'AAAAAAAAAAAA', 'aaaaaaaaaaa-']) {
        const response = await app.request(`/api/community/exchange/card/${slug}`);
        assert.equal(response.status, 400);
    }
});

test('writes stay behind the platform session', async () => {
    const app = fixture();
    for (const [method, path, body] of [
        ['POST', '/api/community/exchange/card/aaaaaaaaaaaa/commit', { clientExchangeId: 'client-1' }],
        ['PUT', '/api/community/exchange/me/quick', { cardNumbers: [] }],
        ['GET', '/api/community/exchange/me/collection', undefined],
        ['GET', '/api/community/exchange/me/exchanges', undefined],
        ['POST', '/api/community/exchange/scan/sessions', { cardNumbers: [1] }],
    ] as const) {
        const response = await app.request(path, {
            method,
            headers: { 'content-type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
        });
        assert.equal(response.status, 401, `${method} ${path}`);
    }
});

test('a quick handle that nobody owns answers not found', async () => {
    const app = fixture();
    const response = await app.request('/api/community/exchange/quick/ghost');
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: '找不到这位制作人' });
});
