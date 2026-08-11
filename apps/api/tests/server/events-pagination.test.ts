import assert from 'node:assert/strict';
import test, { type TestContext } from 'node:test';
import { createHonoApp } from '@/app';
import {
    decodeEventCursor,
    encodeEventCursor
} from '@/domains/events/event-cursor';
import { SqlCoreRepository } from '@/infra/db/repositories/core-repository';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { createPostgresTestDatabase } from './postgres-test-database';

interface EventListItem {
    id: number;
    title: string;
}

interface LegacyEventPage {
    list: EventListItem[];
    totalPage: number;
}

interface CursorEventPage {
    items: EventListItem[];
    pageInfo: {
        nextCursor: string | null;
        hasNextPage: boolean;
        snapshotAt: string | null;
    };
}

interface EventFixture {
    request(pathname: string): Promise<Response>;
    insert(title: string): Promise<number>;
    find(id: number): Promise<Record<string, unknown> | null>;
    references(imageUrl: string): Promise<number>;
    update(
        id: number,
        input: {
            title: string;
            name: string;
            contact: string;
            imageUrl: string;
        },
        expectedImageUrl: string
    ): Promise<boolean>;
}

async function createFixture(t: TestContext, count: number): Promise<EventFixture> {
    const connection = await createPostgresTestDatabase(t, 'events-pagination');
    const core = new SqlCoreRepository(connection, new PostgresqlSchemaStrategy());
    await core.initialize();
    for (let id = 1; id <= count; id += 1) {
        await core.insertEvent({
            title: `Event ${id}`,
            name: 'Fixture',
            contact: 'fixture@example.test',
            imageUrl: `/uploads/events/${id}.webp`
        });
    }
    const app = createHonoApp(() => ({ events: core }));
    t.after(() => core.close());
    return {
        request(pathname) {
            return Promise.resolve(app.request(`http://ims.test${pathname}`));
        },
        insert(title) {
            return core.insertEvent({
                title,
                name: 'Fixture',
                contact: 'fixture@example.test',
                imageUrl: '/uploads/events/new.webp'
            });
        },
        find: (id) => core.findEvent(id),
        references: (imageUrl) => core.countEventMediaReferences(imageUrl),
        update: (id, input, expectedImageUrl) =>
            core.updateEvent(id, input, expectedImageUrl)
    };
}

async function responseJson<T>(response: Response): Promise<T> {
    return response.json() as Promise<T>;
}

test('legacy event pagination keeps its response shape and validates page and size', async (t) => {
    const fixture = await createFixture(t, 6);

    const defaults = await fixture.request('/api/events');
    assert.equal(defaults.status, 200);
    const defaultBody = await responseJson<LegacyEventPage>(defaults);
    assert.deepEqual(defaultBody.list.map((event) => event.id), [6, 5, 4, 3, 2]);
    assert.equal(defaultBody.totalPage, 2);
    assert.deepEqual(Object.keys(defaultBody).sort(), ['list', 'totalPage']);

    const secondPage = await fixture.request('/api/events?page=2&size=2');
    assert.equal(secondPage.status, 200);
    const secondPageBody = await responseJson<LegacyEventPage>(secondPage);
    assert.deepEqual(secondPageBody.list.map((event) => event.id), [4, 3]);
    assert.equal(secondPageBody.totalPage, 3);

    for (const query of [
        'page=0', 'page=101', 'page=1.5', 'page=01', 'page=invalid',
        'size=0', 'size=101', 'size=1.5', 'size=01', 'size=invalid'
    ]) {
        const response = await fixture.request(`/api/events?${query}`);
        assert.equal(response.status, 400, query);
    }
});

test('cursor event pagination holds an id snapshot while new events are inserted', async (t) => {
    const fixture = await createFixture(t, 5);

    const first = await fixture.request('/api/events?limit=2');
    assert.equal(first.status, 200);
    const firstBody = await responseJson<CursorEventPage>(first);
    assert.deepEqual(firstBody.items.map((event) => event.id), [5, 4]);
    assert.deepEqual(
        decodeEventCursor(firstBody.pageInfo.nextCursor ?? ''),
        { snapshotId: '5', afterId: '4' }
    );
    assert.deepEqual(
        { hasNextPage: firstBody.pageInfo.hasNextPage, snapshotAt: firstBody.pageInfo.snapshotAt },
        { hasNextPage: true, snapshotAt: '5' }
    );

    assert.equal(await fixture.insert('Event 6'), 6);

    const second = await fixture.request(
        `/api/events?limit=2&cursor=${encodeURIComponent(firstBody.pageInfo.nextCursor ?? '')}`
    );
    const secondBody = await responseJson<CursorEventPage>(second);
    assert.deepEqual(secondBody.items.map((event) => event.id), [3, 2]);
    assert.equal(secondBody.pageInfo.snapshotAt, '5');
    assert.equal(secondBody.pageInfo.hasNextPage, true);

    const third = await fixture.request(
        `/api/events?limit=2&cursor=${encodeURIComponent(secondBody.pageInfo.nextCursor ?? '')}`
    );
    const thirdBody = await responseJson<CursorEventPage>(third);
    assert.deepEqual(thirdBody.items.map((event) => event.id), [1]);
    assert.deepEqual(thirdBody.pageInfo, {
        nextCursor: null,
        hasNextPage: false,
        snapshotAt: '5'
    });

    const refreshed = await fixture.request('/api/events?limit=2');
    const refreshedBody = await responseJson<CursorEventPage>(refreshed);
    assert.deepEqual(refreshedBody.items.map((event) => event.id), [6, 5]);
    assert.equal(refreshedBody.pageInfo.snapshotAt, '6');
});

test('cursor event pagination returns an explicit empty snapshot', async (t) => {
    const fixture = await createFixture(t, 0);
    const response = await fixture.request('/api/events?limit=20');
    assert.equal(response.status, 200);
    assert.deepEqual(await responseJson<CursorEventPage>(response), {
        items: [],
        pageInfo: { nextCursor: null, hasNextPage: false, snapshotAt: null }
    });
});

test('event updates require the expected current image reference', async (t) => {
    const fixture = await createFixture(t, 1);
    const replacement = {
        title: 'Updated event',
        name: 'Updated organizer',
        contact: 'updated@example.test',
        imageUrl: '/uploads/events/replacement.webp'
    };

    assert.equal(await fixture.update(
        1,
        replacement,
        '/uploads/events/1.webp'
    ), true);
    assert.deepEqual(
        await fixture.find(1),
        {
            id: 1,
            title: replacement.title,
            name: replacement.name,
            contact: replacement.contact,
            image_url: replacement.imageUrl,
            created_at: (await fixture.find(1))?.created_at
        }
    );

    assert.equal(await fixture.update(
        1,
        { ...replacement, title: 'Stale overwrite' },
        '/uploads/events/1.webp'
    ), false);
    assert.equal((await fixture.find(1))?.title, replacement.title);

    await fixture.insert('Shared image 1');
    await fixture.insert('Shared image 2');
    assert.equal(await fixture.references('/uploads/events/new.webp'), 2);
});

test('event cursors retain decimal BIGINT ids and reject invalid pagination modes', async (t) => {
    const maxId = '9223372036854775807';
    const cursor = encodeEventCursor({ snapshotId: maxId, afterId: '9007199254740993' });
    assert.deepEqual(decodeEventCursor(cursor), {
        snapshotId: maxId,
        afterId: '9007199254740993'
    });
    assert.equal(decodeEventCursor('not-a-cursor'), null);
    assert.equal(decodeEventCursor(Buffer.from(JSON.stringify({
        version: 1,
        snapshotId: '9223372036854775808',
        afterId: '1'
    })).toString('base64url')), null);

    const fixture = await createFixture(t, 1);
    for (const query of [
        'limit=0',
        'limit=101',
        'limit=1.5',
        'limit=01',
        'limit=invalid',
        'cursor=not-a-cursor',
        'page=1&limit=10',
        'size=5&cursor=not-a-cursor'
    ]) {
        const response = await fixture.request(`/api/events?${query}`);
        assert.equal(response.status, 400, query);
    }
});
