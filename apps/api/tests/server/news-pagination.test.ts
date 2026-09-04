import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHonoApp } from '@/app';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlNewsRepository } from '@/infra/db/repositories/news-repository';
import {
    decodeDescendingIdCursor,
    encodeDescendingIdCursor
} from '@/utils/validation/descending-id-cursor';
import { createPostgresTestDatabase } from './postgres-test-database';

interface NewsListItem {
    id: number;
    title: string;
}

interface CursorNewsPage {
    items: NewsListItem[];
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

async function responseJson<T>(response: Response): Promise<T> {
    return response.json() as Promise<T>;
}

test('news keeps its legacy array response when pagination is not requested', async (t) => {
    const fixture = await createFixture(t, 3);
    const response = await fixture.request('/api/news');

    assert.equal(response.status, 200);
    const body = await responseJson<NewsListItem[]>(response);
    assert.equal(Array.isArray(body), true);
    assert.deepEqual(body.map((item) => item.id), [3, 2, 1]);
});

test('news cursor pagination holds an id snapshot while rows are inserted', async (t) => {
    const fixture = await createFixture(t, 5);

    const first = await fixture.request('/api/news?limit=2');
    assert.equal(first.status, 200);
    const firstBody = await responseJson<CursorNewsPage>(first);
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
    const secondBody = await responseJson<CursorNewsPage>(second);
    assert.deepEqual(secondBody.items.map((item) => item.id), [3, 2]);
    assert.equal(secondBody.pageInfo.snapshotAt, '5');

    const third = await fixture.request(
        `/api/news?limit=2&cursor=${encodeURIComponent(secondBody.pageInfo.nextCursor ?? '')}`
    );
    const thirdBody = await responseJson<CursorNewsPage>(third);
    assert.deepEqual(thirdBody.items.map((item) => item.id), [1]);
    assert.deepEqual(thirdBody.pageInfo, {
        nextCursor: null,
        hasNextPage: false,
        snapshotAt: '5'
    });

    const refreshed = await fixture.request('/api/news?limit=2');
    const refreshedBody = await responseJson<CursorNewsPage>(refreshed);
    assert.deepEqual(refreshedBody.items.map((item) => item.id), [6, 5]);
    assert.equal(refreshedBody.pageInfo.snapshotAt, '6');
});

test('news cursor pagination validates limits, cursors, and empty snapshots', async (t) => {
    const fixture = await createFixture(t, 0);
    const empty = await fixture.request('/api/news?limit=20');
    assert.equal(empty.status, 200);
    assert.deepEqual(await responseJson<CursorNewsPage>(empty), {
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
    }

    const maxId = '9223372036854775807';
    const cursor = encodeDescendingIdCursor({ snapshotId: maxId, afterId: '9007199254740993' });
    assert.deepEqual(decodeDescendingIdCursor(cursor), {
        snapshotId: maxId,
        afterId: '9007199254740993'
    });
});
