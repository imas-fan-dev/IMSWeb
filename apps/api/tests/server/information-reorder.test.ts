import assert from 'node:assert/strict';
import { readContractJson as contractJson } from '../contracts/contract-json';
import crypto from 'node:crypto';
import test from 'node:test';
import {
    informationDetailSchema,
    informationErrorResponseSchema,
    informationListSchema
} from '@imsweb/contracts/information';
import { createHonoApp } from '@/app';
import { parseInformationIndex, serializeInformationIndex } from '@/domains/content/information/data';
import type {
    ListedObject,
    ObjectStorage,
    PutObjectOptions,
    StoredObject
} from '@/ports/object-storage';
import { INFORMATION_INDEX_OBJECT_KEY } from '@/utils/storage/business-object-keys';

class MemoryStorage implements ObjectStorage {
    object: StoredObject | null = null;

    get(key: string): Promise<StoredObject | null> {
        return Promise.resolve(key === INFORMATION_INDEX_OBJECT_KEY ? this.object : null);
    }

    put(
        key: string,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject> {
        assert.equal(key, INFORMATION_INDEX_OBJECT_KEY);
        this.object = {
            body,
            size: body.byteLength,
            contentType: options.contentType || 'application/json',
            etag: crypto.createHash('sha256').update(body).digest('hex')
        };
        return Promise.resolve(this.object);
    }

    async putIfUnchanged(
        key: string,
        expectedEtag: string | null,
        body: Uint8Array,
        options: PutObjectOptions = {}
    ): Promise<StoredObject | null> {
        if ((this.object?.etag ?? null) !== expectedEtag) return null;
        return this.put(key, body, options);
    }

    delete(): Promise<void> { return Promise.resolve(); }
    exists(): Promise<boolean> { return Promise.resolve(Boolean(this.object)); }
    copy(): Promise<void> { return Promise.resolve(); }
    move(): Promise<void> { return Promise.resolve(); }
    list(): Promise<ListedObject[]> { return Promise.resolve([]); }
    deletePrefix(): Promise<void> { return Promise.resolve(); }
}

test('Information admin reordering is retired after community post unification', async () => {
    const storage = new MemoryStorage();
    const image = '/uploads/information/original/cover.webp';
    const card = (
        id: string,
        title: string,
        contentType: 'external' | 'html' = 'external'
    ) => ({
        id,
        category: 'activity' as const,
        contentType,
        image,
        link: `https://example.test/${id}`,
        ...(contentType === 'html' ? { html: '<p>活动正文</p>' } : {}),
        title,
        updatedAt: '2026-07-31T00:00:00.000Z'
    });
    await storage.put(INFORMATION_INDEX_OBJECT_KEY, serializeInformationIndex({
        version: 1,
        assets: [image],
        cards: [
            card('information-first', '第一项', 'html'),
            card('information-second', '第二项')
        ]
    }));
    const app = createHonoApp(() => ({
        storage,
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
                dept: 'op',
                adminRole: 'admin' as const,
                csrfSecret: 'csrf'
            })
        }
    }));
    const publicList = await app.request('/api/information');
    assert.equal(publicList.status, 200);
    await contractJson(publicList, informationListSchema);

    const publicDetail = await app.request('/api/information/information-first');
    assert.equal(publicDetail.status, 200);
    await contractJson(publicDetail, informationDetailSchema);

    const missing = await app.request('/api/information/missing');
    assert.equal(missing.status, 404);
    await contractJson(missing, informationErrorResponseSchema);

    // Content delivery intentionally remains HTML, while the reachable missing error is JSON.
    const content = await app.request('/information/information-first/content');
    assert.equal(content.status, 200);
    assert.match(content.headers.get('content-type') ?? '', /^text\/html/);
    const contentBody = await content.text();
    assert.match(contentBody, /<title>第一项<\/title>/);
    assert.match(contentBody, /<p>活动正文<\/p>/);

    const request = (ids: string[]) => app.request('/api/admin/information/order', {
        method: 'PUT',
        headers: {
            Authorization: 'Bearer op-token',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ids })
    });

    const response = await request(['information-second', 'information-first']);
    assert.equal(response.status, 410);
    assert.deepEqual(await contractJson(response, informationErrorResponseSchema), {
        error: '活动资讯后台已整合至社区帖子，请使用 /api/admin/community-posts'
    });
    assert.deepEqual(
        parseInformationIndex(storage.object!.body).cards.map((item) => item.id),
        ['information-first', 'information-second']
    );

    const retiredRequests: Array<[string, string, unknown?]> = [
        ['GET', '/api/admin/information'],
        ['POST', '/api/admin/information', {}],
        ['PUT', '/api/admin/information/information-first', {}],
        ['DELETE', '/api/admin/information/information-first'],
        ['POST', '/api/admin/information/assets', {}],
        ['DELETE', '/api/admin/information/assets', { url: image }]
    ];
    for (const [method, pathname, body] of retiredRequests) {
        const retired = await app.request(pathname, {
            method,
            headers: {
                Authorization: 'Bearer op-token',
                ...(body === undefined ? {} : { 'Content-Type': 'application/json' })
            },
            body: body === undefined ? undefined : JSON.stringify(body)
        });
        assert.equal(retired.status, 410, `${method} ${pathname}`);
        await contractJson(retired, informationErrorResponseSchema);
    }
});
