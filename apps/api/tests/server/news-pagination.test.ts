import { postgresTest as test } from './postgres-test-database';
import assert from 'node:assert/strict';
import { readContractJson as contractJson } from '../contracts/contract-json';
import type { TestContext } from 'node:test';
import {
    adminRecommendationListSchema,
    newsErrorResponseSchema,
    newsMutationErrorResponseSchema,
    newsMutationSuccessSchema,
    recommendationResponseSchema,
    type Recommendation
} from '@imsweb/contracts/news';
import { createHonoApp } from '@/app';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlNewsRepository } from '@/infra/db/repositories/news-repository';
import {
    decodeDescendingIdCursor,
    encodeDescendingIdCursor
} from '@/utils/validation/descending-id-cursor';
import { createPostgresTestDatabase } from './postgres-test-database';

interface CursorNewsPage {
    items: Recommendation[];
    pageInfo: {
        nextCursor: string | null;
        hasNextPage: boolean;
        snapshotAt: string | null;
    };
}

interface NewsFixture {
    request(pathname: string): Promise<Response>;
    insert(title: string): Promise<number>;
}

async function createFixture(t: TestContext, count: number): Promise<NewsFixture> {
    const connection = await createPostgresTestDatabase(t, 'news-pagination');
    await new PostgresqlSchemaStrategy().initializeCore(connection);
    const repository = new SqlNewsRepository(connection);
    for (let id = 1; id <= count; id += 1) {
        await repository.insertNews({
            title: `News ${id}`,
            image: `/uploads/news/original/${id}.webp`,
            thumbnail: `/uploads/news/thumb/${id}.webp`,
            content: `https://example.test/news/${id}`,
            date: `2026-07-${String(id).padStart(2, '0')}`,
            author: 'Fixture'
        });
    }
    const app = createHonoApp(() => ({ news: repository }));
    t.after(() => connection.close());
    return {
        request(pathname) {
            return Promise.resolve(app.request(`http://ims.test${pathname}`));
        },
        insert(title) {
            return repository.insertNews({
                title,
                image: '/uploads/news/original/new.webp',
                thumbnail: '/uploads/news/thumb/new.webp',
                content: 'https://example.test/news/new',
                date: '2026-07-24',
                author: 'Fixture'
            });
        }
    };
}

test('news keeps its legacy array response when pagination is not requested', async (t) => {
    const fixture = await createFixture(t, 3);
    const response = await fixture.request('/api/news');

    assert.equal(response.status, 200);
    const body = await contractJson(response, recommendationResponseSchema) as Recommendation[];
    assert.equal(Array.isArray(body), true);
    assert.deepEqual(body.map((item) => item.id), [3, 2, 1]);
});

test('news cursor pagination holds an id snapshot while rows are inserted', async (t) => {
    const fixture = await createFixture(t, 5);

    const first = await fixture.request('/api/news?limit=2');
    assert.equal(first.status, 200);
    const firstBody = await contractJson(first, recommendationResponseSchema) as CursorNewsPage;
    assert.deepEqual(firstBody.items.map((item) => item.id), [5, 4]);
    assert.deepEqual(
        decodeDescendingIdCursor(firstBody.pageInfo.nextCursor ?? ''),
        { snapshotId: '5', afterId: '4' }
    );
    assert.deepEqual(
        { hasNextPage: firstBody.pageInfo.hasNextPage, snapshotAt: firstBody.pageInfo.snapshotAt },
        { hasNextPage: true, snapshotAt: '5' }
    );

    assert.equal(await fixture.insert('News 6'), 6);

    const second = await fixture.request(
        `/api/news?limit=2&cursor=${encodeURIComponent(firstBody.pageInfo.nextCursor ?? '')}`
    );
    const secondBody = await contractJson(second, recommendationResponseSchema) as CursorNewsPage;
    assert.deepEqual(secondBody.items.map((item) => item.id), [3, 2]);
    assert.equal(secondBody.pageInfo.snapshotAt, '5');

    const third = await fixture.request(
        `/api/news?limit=2&cursor=${encodeURIComponent(secondBody.pageInfo.nextCursor ?? '')}`
    );
    const thirdBody = await contractJson(third, recommendationResponseSchema) as CursorNewsPage;
    assert.deepEqual(thirdBody.items.map((item) => item.id), [1]);
    assert.deepEqual(thirdBody.pageInfo, {
        nextCursor: null,
        hasNextPage: false,
        snapshotAt: '5'
    });

    const refreshed = await fixture.request('/api/news?limit=2');
    const refreshedBody = await contractJson(refreshed, recommendationResponseSchema) as CursorNewsPage;
    assert.deepEqual(refreshedBody.items.map((item) => item.id), [6, 5]);
    assert.equal(refreshedBody.pageInfo.snapshotAt, '6');
});

test('news cursor pagination validates limits, cursors, and empty snapshots', async (t) => {
    const fixture = await createFixture(t, 0);
    const empty = await fixture.request('/api/news?limit=20');
    assert.equal(empty.status, 200);
    assert.deepEqual(await contractJson(empty, recommendationResponseSchema), {
        items: [],
        pageInfo: { nextCursor: null, hasNextPage: false, snapshotAt: null }
    });

    for (const query of [
        'limit=0',
        'limit=101',
        'limit=1.5',
        'limit=01',
        'limit=invalid',
        'cursor=not-a-cursor'
    ]) {
        const response = await fixture.request(`/api/news?${query}`);
        assert.equal(response.status, 400, query);
        await contractJson(response, newsErrorResponseSchema);
    }

    const maxId = '9223372036854775807';
    const cursor = encodeDescendingIdCursor({ snapshotId: maxId, afterId: '9007199254740993' });
    assert.deepEqual(decodeDescendingIdCursor(cursor), {
        snapshotId: maxId,
        afterId: '9007199254740993'
    });
});

test('admin news parses exact success and mutation business-error envelopes', async () => {
    const app = createHonoApp(() => ({
        news: {
            listPublicNews: async () => [],
            findLatestPublicNewsId: async () => null,
            listPublicNewsByCursor: async () => [],
            listAdminNews: async () => [],
            insertNews: async () => 1,
            findNewsMedia: async () => null,
            deleteNews: async () => undefined
        },
        backofficeAuth: {
            findUserByUsername: async () => null,
            findUserById: async () => ({
                id: 1,
                username: 'operator',
                password: 'unused-password-hash',
                dept: 'op',
                producername: 'Operator',
                admin_role: 'admin' as const
            }),
            createRefreshSession: async () => undefined,
            findRefreshSessionByTokenHash: async () => null,
            rotateRefreshSession: async () => false,
            revokeRefreshSession: async () => undefined,
            deleteExpiredRefreshSessions: async () => undefined
        },
        audit: {
            insertAuditLog: async () => undefined,
            listRecentAuditLogs: async () => []
        },
        backofficeTokens: {
            sign: async () => 'op-token',
            verify: async () => ({
                id: 1,
                username: 'operator',
                producername: 'Operator',
                dept: 'op' as const,
                adminRole: 'admin' as const,
                csrfSecret: 'csrf'
            })
        }
    }));
    const request = (method: string, path: string, body?: unknown) => app.request(path, {
        method,
        headers: {
            Authorization: 'Bearer op-token',
            ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    });

    const list = await request('GET', '/api/admin/news');
    assert.equal(list.status, 200);
    await contractJson(list, adminRecommendationListSchema);

    const created = await request('POST', '/api/admin/news', {
        title: 'News',
        content: 'https://example.test/news'
    });
    assert.equal(created.status, 200);
    await contractJson(created, newsMutationSuccessSchema);

    const businessError = await request('POST', '/api/admin/news', {
        title: 'News',
        content: 'not-a-url'
    });
    assert.equal(businessError.status, 400);
    await contractJson(businessError, newsMutationErrorResponseSchema);

    const deleted = await request('DELETE', '/api/admin/news/1');
    assert.equal(deleted.status, 200);
    await contractJson(deleted, newsMutationSuccessSchema);
});
