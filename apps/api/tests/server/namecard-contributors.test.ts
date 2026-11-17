import assert from 'node:assert/strict';
import { test } from 'vitest';
import { createHonoApp } from '@/app';
import type { RuntimeServices } from '@/ports/runtime-services';
import type { FudabaRepository } from '@/ports/repositories/fudaba';
import { namecardContributorsSchema } from '@imsweb/contracts/namecards';
import { errorResponseSchema } from '@imsweb/contracts/common';
import { assertContractJson } from '../contracts/contract-json';

function fixture() {
    const calls: Array<{ page: number; pageSize: number }> = [];
    const repository: Partial<FudabaRepository> = {
        async listNamecardContributors(input) {
            calls.push(input);
            return {
                items: [{ account_id: 'producer-1', display_name: 'Producer', points: 8, cards: 3 }],
                total: 5,
            };
        },
    };
    // SAFETY: anonymous contributor reads only use the repository method above.
    const runtime = { fudaba: repository as FudabaRepository } as RuntimeServices;
    return { app: createHonoApp(() => runtime), calls };
}

test('contributors defaults, pagination and exact response contract', async () => {
    const { app, calls } = fixture();
    for (const [query, page, pageSize] of [
        ['', 1, 25], ['?page=2&limit=2', 2, 2], ['?page=1&limit=100', 1, 100],
    ] as const) {
        const body = await assertContractJson(
            await app.request(`/api/cards/contributors${query}`), 200, namecardContributorsSchema,
        );
        const totalPages = Math.ceil(5 / pageSize);
        assert.deepEqual(body, {
            contributors: [{ accountId: 'producer-1', displayName: 'Producer', points: 8, cards: 3 }],
            pageInfo: { page, pageSize, total: 5, totalPages, hasNextPage: page < totalPages },
        });
        assert.deepEqual(calls.at(-1), { page, pageSize });
    }
});

test('contributors rejects invalid queries before repository access', async () => {
    const { app, calls } = fixture();
    for (const query of [
        'page=0', 'page=-1', 'page=01', 'page=1e1', 'page=1foo', 'page=1.5',
        'page=', 'page=9007199254740992', 'limit=0', 'limit=101', 'limit=abc',
        'limit=', 'unexpected=true', 'page=1&page=2',
    ]) {
        const body = await assertContractJson(
            await app.request(`/api/cards/contributors?${query}`), 400, errorResponseSchema,
        );
        assert.deepEqual(body, { error: '贡献榜分页参数无效' });
    }
    assert.deepEqual(calls, []);
});

test('contributors returns an exact empty page without a repository', async () => {
    // SAFETY: the missing-repository branch does not access other runtime services.
    const app = createHonoApp(() => ({} as RuntimeServices));
    const body = await assertContractJson(
        await app.request('/api/cards/contributors'), 200, namecardContributorsSchema,
    );
    assert.deepEqual(body, {
        contributors: [],
        pageInfo: { page: 1, pageSize: 25, total: 0, totalPages: 0, hasNextPage: false },
    });
});
