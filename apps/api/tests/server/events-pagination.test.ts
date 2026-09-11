import { postgresTest as test } from './postgres-test-database';
import assert from 'node:assert/strict';
import { assertContractJson as assertRawJsonConforms } from '../contracts/contract-json';
import type { TestContext } from 'node:test';
import {
    createEventResponseSchema,
    eventErrorResponseSchema,
    eventLegacyPageSchema,
    eventListItemSchema,
    eventMutationResponseSchema,
    eventPageSchema
} from '@imsweb/contracts/events';
import {
    failureMessageResponseSchema,
    messageErrorResponseSchema
} from '@imsweb/contracts/common';
import { createHonoApp } from '@/app';
import { HmacBackofficeTokenService } from '@/infra/security/hmac/token-service';
import type { IdempotencyClaim, IdempotencyResponse, IdempotencyStore } from '@/ports/cache';
import type { ParsedUpload, UploadParser } from '@/ports/http';
import type { ImageProcessor } from '@/ports/media';
import type { ObjectStorage, PutObjectOptions, StoredObject } from '@/ports/object-storage';
import type { RuntimeServices } from '@/ports/runtime-services';
import {
    decodeEventCursor,
    encodeEventCursor
} from '@/domains/content/events/event-cursor';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlEventRepository } from '@/infra/db/repositories/event-repository';
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
    request(pathname: string, init?: RequestInit): Promise<Response>;
    insert(title: string): Promise<number>;
    setUpload(value: ParsedUpload): void;
    opToken: string;
    editorToken: string;
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

class MemoryEventUploads implements UploadParser {
    private next: ParsedUpload | null = null;

    set(value: ParsedUpload): void {
        this.next = value;
    }

    async parse(): Promise<ParsedUpload> {
        if (!this.next) throw Object.assign(new Error('missing multipart fixture'), { status: 400 });
        const value = this.next;
        this.next = null;
        return value;
    }
}

class MemoryEventIdempotency implements IdempotencyStore {
    private readonly records = new Map<string, {
        fingerprint: string;
        state: 'started' | 'completed';
        generation: number;
        response?: IdempotencyResponse;
    }>();

    async claim(scope: string, key: string, fingerprint: string): Promise<IdempotencyClaim> {
        const id = `${scope}\0${key}`;
        const record = this.records.get(id);
        if (!record) {
            this.records.set(id, { fingerprint, state: 'started', generation: 1 });
            return { kind: 'acquired', recovered: false, generation: 1 };
        }
        if (record.fingerprint !== fingerprint) return { kind: 'conflict' };
        if (record.state === 'completed') return { kind: 'replay', response: record.response! };
        return { kind: 'in-progress' };
    }

    async complete(
        scope: string,
        key: string,
        fingerprint: string,
        generation: number,
        response: IdempotencyResponse
    ): Promise<void> {
        const id = `${scope}\0${key}`;
        const record = this.records.get(id);
        if (!record || record.fingerprint !== fingerprint || record.generation !== generation) {
            throw new Error('idempotency ownership lost');
        }
        this.records.set(id, { ...record, state: 'completed', response });
    }

    async fail(): Promise<void> {}
    async isCurrent(): Promise<boolean> { return true; }
}

function eventStorage(): ObjectStorage {
    const objects = new Map<string, StoredObject>();
    return {
        async get(key) { return objects.get(key) ?? null; },
        async put(key, body, options: PutObjectOptions = {}) {
            const object = {
                body: Uint8Array.from(body),
                size: body.byteLength,
                contentType: options.contentType ?? 'application/octet-stream',
                etag: `event-${objects.size + 1}`
            };
            objects.set(key, object);
            return object;
        },
        async delete(key) { objects.delete(key); },
        async exists(key) { return objects.has(key); },
        async copy(source, destination) {
            const object = objects.get(source);
            if (!object) throw new Error('missing source object');
            objects.set(destination, { ...object, body: Uint8Array.from(object.body) });
        },
        async move(source, destination) {
            const object = objects.get(source);
            if (!object) throw new Error('missing source object');
            objects.set(destination, { ...object, body: Uint8Array.from(object.body) });
            objects.delete(source);
        },
        async list(prefix) {
            return [...objects.entries()]
                .filter(([key]) => key.startsWith(prefix))
                .map(([key, object]) => ({ key, size: object.size, etag: object.etag }));
        },
        async deletePrefix(prefix) {
            for (const key of objects.keys()) if (key.startsWith(prefix)) objects.delete(key);
        },
        async publish() {}
    };
}

const eventImages: ImageProcessor = {
    async validate() {
        return { format: 'png', width: 1, height: 1, contentType: 'image/png' };
    },
    async toWebp(body) { return body; },
    async thumbnailPng(body) { return body; },
    async resizeJpeg(body) { return body; }
};

async function createFixture(t: TestContext, count: number): Promise<EventFixture> {
    const connection = await createPostgresTestDatabase(t, 'events-pagination');
    await new PostgresqlSchemaStrategy().initializeCore(connection);
    const repository = new SqlEventRepository(connection);
    for (let id = 1; id <= count; id += 1) {
        await repository.insertEvent({
            title: `Event ${id}`,
            name: 'Fixture',
            contact: 'fixture@example.test',
            imageUrl: `/uploads/events/${id}.webp`
        });
    }
    const uploads = new MemoryEventUploads();
    const tokens = new HmacBackofficeTokenService('events-wire-contract-secret-at-least-32-bytes');
    const opToken = await tokens.sign({
        id: 1,
        username: 'events-op',
        producername: 'Events Op',
        dept: 'op',
        csrfSecret: 'events-csrf'
    }, 3600);
    const editorToken = await tokens.sign({
        id: 2,
        username: 'events-editor',
        producername: 'Events Editor',
        dept: 'editor',
        csrfSecret: 'events-editor-csrf'
    }, 3600);
    const runtime: RuntimeServices = {
        events: repository,
        uploads,
        images: eventImages,
        storage: eventStorage(),
        idempotency: new MemoryEventIdempotency(),
        backofficeTokens: tokens,
        audit: {
            async insertAuditLog() {},
            async listRecentAuditLogs() { return []; }
        }
    };
    const app = createHonoApp(() => runtime);
    t.after(() => connection.close());
    return {
        request(pathname, init) {
            return Promise.resolve(app.request(`http://ims.test${pathname}`, init));
        },
        setUpload(value) { uploads.set(value); },
        opToken,
        editorToken,
        insert(title) {
            return repository.insertEvent({
                title,
                name: 'Fixture',
                contact: 'fixture@example.test',
                imageUrl: '/uploads/events/new.webp'
            });
        },
        find: (id) => repository.findEvent(id),
        references: (imageUrl) => repository.countEventMediaReferences(imageUrl),
        update: (id, input, expectedImageUrl) =>
            repository.updateEvent(id, input, expectedImageUrl)
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
            cover_transform: { focalX: 0.5, focalY: 0.5, zoom: 1 },
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

test('event list responses preserve a title with legacy leading or trailing whitespace verbatim', async (t) => {
    const fixture = await createFixture(t, 0);
    const legacyTitle = '\u3010Legacy Notice\u3011\r\nLine one\r\nLine two\r\n';
    await fixture.insert(legacyTitle);

    const cursorBody = await assertRawJsonConforms(
        await fixture.request('/api/events?limit=20'),
        200,
        eventPageSchema
    );
    assert.equal(cursorBody.items[0]?.title, legacyTitle);

    const legacyBody = await assertRawJsonConforms(
        await fixture.request('/api/events'),
        200,
        eventLegacyPageSchema
    );
    assert.equal(legacyBody.list[0]?.title, legacyTitle);
});

test('events mounted JSON routes preserve shared schemas and project query and multipart extras', async (t) => {
    const fixture = await createFixture(t, 1);
    const auth = { Authorization: `Bearer ${fixture.opToken}` };

    await assertRawJsonConforms(
        await fixture.request('/api/events?ignoredQueryField=legacy'),
        200,
        eventLegacyPageSchema
    );
    await assertRawJsonConforms(
        await fixture.request('/api/events?limit=1'),
        200,
        eventPageSchema
    );
    await assertRawJsonConforms(
        await fixture.request('/api/events/not-an-id'),
        404,
        eventErrorResponseSchema
    );
    await assertRawJsonConforms(
        await fixture.request('/api/events', { method: 'POST' }),
        401,
        failureMessageResponseSchema
    );
    await assertRawJsonConforms(
        await fixture.request('/api/events', {
            method: 'POST',
            headers: { Authorization: `Bearer ${fixture.editorToken}` }
        }),
        403,
        messageErrorResponseSchema
    );
    await assertRawJsonConforms(
        await fixture.request('/api/events', {
            method: 'POST',
            headers: {
                Cookie: `ims_admin_access=${fixture.opToken}; ims_admin_csrf=events-csrf`,
                'Idempotency-Key': 'csrf-rejected'
            }
        }),
        403,
        failureMessageResponseSchema
    );
    await assertRawJsonConforms(
        await fixture.request('/api/events', {
            method: 'POST',
            headers: auth
        }),
        400,
        eventErrorResponseSchema
    );

    fixture.setUpload({
        fields: {
            title: 'Wire event',
            name: 'Wire producer',
            contact: 'wire@example.test',
            ignoredMultipartField: 'ignored'
        },
        files: {
            image: {
                filename: 'wire.png',
                contentType: 'image/png',
                body: Uint8Array.of(1, 2, 3)
            }
        }
    });
    const created = await assertRawJsonConforms(
        await fixture.request('/api/events', {
            method: 'POST',
            headers: {
                ...auth,
                'Content-Type': 'multipart/form-data; boundary=fixture',
                'Idempotency-Key': 'event-wire-success'
            },
            body: '--fixture--'
        }),
        200,
        createEventResponseSchema
    );
    await assertRawJsonConforms(
        await fixture.request(`/api/events/${created.id}`),
        200,
        eventListItemSchema
    );

    fixture.setUpload({
        fields: {
            title: 'Updated wire event',
            name: 'Wire producer',
            contact: 'wire@example.test',
            ignoredMultipartField: 'ignored'
        },
        files: {}
    });
    await assertRawJsonConforms(
        await fixture.request(`/api/events/${created.id}`, {
            method: 'PUT',
            headers: { ...auth, 'Content-Type': 'multipart/form-data; boundary=fixture' },
            body: '--fixture--'
        }),
        200,
        eventMutationResponseSchema
    );

    fixture.setUpload({
        fields: { title: '', name: 'Wire producer', contact: 'wire@example.test' },
        files: {}
    });
    await assertRawJsonConforms(
        await fixture.request(`/api/events/${created.id}`, {
            method: 'PUT',
            headers: { ...auth, 'Content-Type': 'multipart/form-data; boundary=fixture' },
            body: '--fixture--'
        }),
        400,
        eventErrorResponseSchema
    );
    fixture.setUpload({
        fields: {
            title: 'Conflicting wire event',
            name: 'Wire producer',
            contact: 'wire@example.test'
        },
        files: {
            image: {
                filename: 'wire-conflict.png',
                contentType: 'image/png',
                body: Uint8Array.of(4, 5, 6)
            }
        }
    });
    await assertRawJsonConforms(
        await fixture.request('/api/events', {
            method: 'POST',
            headers: {
                ...auth,
                'Content-Type': 'multipart/form-data; boundary=fixture',
                'Idempotency-Key': 'event-wire-success'
            },
            body: '--fixture--'
        }),
        409,
        eventErrorResponseSchema
    );
    await assertRawJsonConforms(
        await fixture.request('/api/events/999999', {
            method: 'DELETE',
            headers: auth
        }),
        404,
        eventErrorResponseSchema
    );
    await assertRawJsonConforms(
        await fixture.request(`/api/events/${created.id}`, {
            method: 'DELETE',
            headers: auth
        }),
        200,
        eventMutationResponseSchema
    );
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
