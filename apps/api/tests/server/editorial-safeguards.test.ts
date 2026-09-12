import assert from 'node:assert/strict';
import { readContractJson as contractJson } from '../contracts/contract-json';
import test from 'node:test';
import {
    adminEditorialSpotlightSchema,
    editorialArticleAssetListSchema,
    editorialArticleListSchema,
    editorialArticleSchema,
    editorialChroniclePageSchema,
    // pi-lens-ignore: ts:2305
    editorialConflictErrorResponseSchema,
    editorialDraftSchema,
    // pi-lens-ignore: ts:2724
    editorialErrorResponseSchema,
    editorialLegacyInformationSchema,
    // pi-lens-ignore: ts:2305
    editorialMutationResponseSchema,
    editorialRevisionSchema,
    editorialSpotlightSchema,
    editorialStatusChangeSchema
} from '@imsweb/contracts/editorial';
import {
    failureMessageResponseSchema,
    messageErrorResponseSchema
} from '@imsweb/contracts/common';
import { createHonoApp } from '@/app';
import { legacyHtmlToArticleDocument } from '@/domains/content/editorial/article-body';
import type { EditorialRepository } from '@/ports/repositories';

const currentEvent = {
    id: 11,
    article_id: 29,
    title: '测试活动',
    summary: '',
    cover_url: null,
    body_json: { type: 'doc', content: [] },
    revision: 0,
    kind: 'event',
    name: null,
    contact: null,
    start_at: null,
    end_at: null,
    timezone: 'Asia/Shanghai',
    venue_name: null,
    address: null,
    registration_url: null,
    event_status: 'scheduled',
    source_url: null,
    related_links: []
};

function createApp(repository: EditorialRepository, dept: 'op' | 'editor' = 'op') {
    return createHonoApp(() => ({
        editorial: repository,
        backofficeTokens: {
            async sign() { return 'token'; },
            async verify() {
                return {
                    id: 1,
                    username: 'operator',
                    producername: 'operator',
                    dept,
                    csrfSecret: 'csrf'
                };
            }
        }
    }));
}

function bearerRequest(method: string, body?: Record<string, unknown>): RequestInit {
    return {
        method,
        headers: {
            Authorization: 'Bearer token',
            ...(body === undefined ? {} : { 'content-type': 'application/json' })
        },
        body: body === undefined ? undefined : JSON.stringify(body)
    };
}

const articleBody = {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text: '正文' }] }]
};

const editorialRow = {
    id: 1,
    article_id: 1,
    title: '测试内容',
    summary: '',
    cover_url: null,
    body_json: articleBody,
    body_html: '<p>正文</p>',
    revision: 0,
    status: 'draft' as const,
    kind: 'notice' as const,
    related_links: [],
    occurred_on: '2026-01-01',
    source_type: 'official' as const,
    date_precision: 'day' as const,
    timeline_order: 0
};

function editorialRepositoryStub(
    overrides: Record<string, unknown> = {}
): EditorialRepository {
    return {
        listAdminEvents: async () => [editorialRow],
        createEventDraft: async () => ({ id: 1, article_id: 1, revision: 0 }),
        findAdminEvent: async () => editorialRow,
        updateEditorialEvent: async () => ({ status: 'updated', revision: 1 }),
        deleteEditorialEvent: async () => true,
        listAdminChronicle: async () => [editorialRow],
        createChronicleDraft: async () => ({ id: 1, article_id: 1, revision: 0 }),
        findAdminChronicle: async () => editorialRow,
        updateChronicle: async () => ({ status: 'updated', revision: 1 }),
        deleteEditorialChronicle: async () => true,
        setArticleStatus: async () => ({ status: 'updated', revision: 1 }),
        findArticleAsset: async () => null,
        listArticleAssets: async () => [],
        listPublicChronicle: async () => [],
        findPublicChronicle: async () => editorialRow,
        listPublicSpotlightEntries: async () => [],
        listAdminSpotlightEntries: async () => [],
        findLegacyInformationPost: async () => null,
        replaceHomepageSpotlightEntries: async () => ({ status: 'updated' }),
        ...overrides
    } as unknown as EditorialRepository;
}

function requestOptions(body: Record<string, unknown>): RequestInit {
    return {
        method: 'PUT',
        headers: {
            Cookie: 'token=token; csrf_token=csrf',
            'x-csrftoken': 'csrf',
            'content-type': 'application/json'
        },
        body: JSON.stringify(body)
    };
}

test('legacy HTML images become readable links during editorial migration', () => {
    const document = legacyHtmlToArticleDocument(
        '<p>活动海报 <img src="/uploads/information/poster.webp" alt="十周年主视觉"></p>'
    );
    const serialized = JSON.stringify(document);

    assert.doesNotMatch(serialized, /"type":"image"/);
    assert.match(serialized, /"href":"\/uploads\/information\/poster\.webp"/);
    assert.match(serialized, /查看图片：十周年主视觉/);
});

test('event registration URLs only accept public HTTP(S) or local paths', async () => {
    let updatedRegistrationUrl: string | null = null;
    const repository = {
        async findAdminEvent() { return currentEvent; },
        async findArticleAsset() { return null; },
        async updateEditorialEvent(_id: number, input: { registrationUrl: string | null }) {
            updatedRegistrationUrl = input.registrationUrl;
            return { status: 'updated', revision: 1 } as const;
        }
    } as unknown as EditorialRepository;
    const app = createApp(repository);

    const invalid = await app.request('/api/admin/community-posts/11', requestOptions({
        ...currentEvent,
        registrationUrl: 'javascript:alert(1)'
    }));
    assert.equal(invalid.status, 400);
    assert.equal(
        // pi-lens-ignore: ts:2571
        (await contractJson(invalid, editorialErrorResponseSchema)).error,
        '报名链接只允许 HTTP(S) 或站内路径'
    );

    const valid = await app.request('/api/admin/community-posts/11', requestOptions({
        ...currentEvent,
        registrationUrl: '/events/signup'
    }));
    assert.equal(valid.status, 200);
    assert.equal(updatedRegistrationUrl, '/events/signup');
});

test('invalid spotlight entries are rejected without reporting success', async () => {
    const repository = {
        async replaceHomepageSpotlightEntries() {
            return { status: 'invalid' } as const;
        }
    } as unknown as EditorialRepository;
    const app = createApp(repository);

    const response = await app.request('/api/admin/community-posts/spotlight', requestOptions({
        items: [{ postId: 99, category: 'activity' }]
    }));

    assert.equal(response.status, 400);
    assert.equal(
        // pi-lens-ignore: ts:2571
        (await contractJson(response, editorialErrorResponseSchema)).error,
        '首页精选只能包含已发布的社区帖子'
    );
});

test('Editorial mounted reads, assets, and spotlight responses preserve their raw JSON', async () => {
    const app = createApp(editorialRepositoryStub({
        listArticleAssets: async () => [{
            id: 1,
            article_id: 1,
            public_path: '/uploads/articles/1/test.webp',
            asset_usage: 'body',
            alt_text: ''
        }]
    }));

    const cases: Array<[string, string, RequestInit | undefined, { parse(value: unknown): unknown }]> = [
        ['community post list', '/api/admin/community-posts', bearerRequest('GET'), editorialArticleListSchema],
        ['event alias list', '/api/admin/events', bearerRequest('GET'), editorialArticleListSchema],
        ['community post detail', '/api/admin/community-posts/1', bearerRequest('GET'), editorialArticleSchema],
        ['event alias detail', '/api/admin/events/1', bearerRequest('GET'), editorialArticleSchema],
        ['public chronicle list', '/api/chronicle', undefined, editorialChroniclePageSchema],
        ['public chronicle detail', '/api/chronicle/1', undefined, editorialArticleSchema],
        ['admin chronicle list', '/api/admin/chronicle', bearerRequest('GET'), editorialArticleListSchema],
        ['admin chronicle detail', '/api/admin/chronicle/1', bearerRequest('GET'), editorialArticleSchema],
        ['article asset list', '/api/admin/articles/1/assets', bearerRequest('GET'), editorialArticleAssetListSchema],
        ['public spotlight', '/api/community-posts/spotlight', undefined, editorialSpotlightSchema],
        ['admin spotlight', '/api/admin/community-posts/spotlight', bearerRequest('GET'), adminEditorialSpotlightSchema],
        ['legacy information', '/api/community-posts/legacy-information/old-id', undefined, editorialLegacyInformationSchema]
    ];
    for (const [label, path, options, schema] of cases) {
        const response = await app.request(path, options);
        assert.equal(response.status, 200, label);
        await contractJson(response, schema);
    }

    const spotlightUpdate = await app.request(
        '/api/admin/community-posts/spotlight',
        bearerRequest('PUT', { items: [] })
    );
    assert.equal(spotlightUpdate.status, 200);
    await contractJson(spotlightUpdate, editorialMutationResponseSchema);

    const invalidAsset = await app.request(
        '/api/admin/articles/invalid/assets',
        bearerRequest('GET')
    );
    assert.equal(invalidAsset.status, 400);
    await contractJson(invalidAsset, editorialErrorResponseSchema);
});

test('all 17 Editorial passthrough JSON entrypoints accept one unknown top-level field', async () => {
    const app = createApp(editorialRepositoryStub());
    const unknown = { migrationProbe: { retainedAtBoundary: true } };
    const cases: Array<[string, string, Record<string, unknown>, { parse(value: unknown): unknown } | undefined]> = [
        ['community post create', '/api/admin/community-posts', { title: '帖子', kind: 'notice', ...unknown }, editorialDraftSchema],
        ['event create', '/api/admin/events', { title: '活动', kind: 'notice', ...unknown }, editorialDraftSchema],
        ['community post update', '/api/admin/community-posts/1', unknown, editorialRevisionSchema],
        ['event update', '/api/admin/events/1', unknown, editorialRevisionSchema],
        ['community post preview', '/api/admin/community-posts/1/preview', unknown, editorialArticleSchema],
        ['event preview', '/api/admin/events/1/preview', unknown, editorialArticleSchema],
        ['community post publish', '/api/admin/community-posts/1/publish', unknown, editorialStatusChangeSchema],
        ['community post unpublish', '/api/admin/community-posts/1/unpublish', unknown, editorialStatusChangeSchema],
        ['community post archive', '/api/admin/community-posts/1/archive', unknown, editorialStatusChangeSchema],
        ['event publish', '/api/admin/events/1/publish', unknown, editorialStatusChangeSchema],
        ['event unpublish', '/api/admin/events/1/unpublish', unknown, editorialStatusChangeSchema],
        ['event archive', '/api/admin/events/1/archive', unknown, editorialStatusChangeSchema],
        ['chronicle create', '/api/admin/chronicle', { title: '编年史', sourceType: 'official', ...unknown }, editorialDraftSchema],
        ['chronicle update', '/api/admin/chronicle/1', unknown, editorialRevisionSchema],
        ['chronicle publish', '/api/admin/chronicle/1/publish', unknown, editorialStatusChangeSchema],
        ['chronicle unpublish', '/api/admin/chronicle/1/unpublish', unknown, editorialStatusChangeSchema],
        ['chronicle archive', '/api/admin/chronicle/1/archive', unknown, editorialStatusChangeSchema]
    ];
    for (const [label, path, body, schema] of cases) {
        const response = await app.request(path, bearerRequest(
            path.includes('/update') ? 'PUT' : path.endsWith('/1') ? 'PUT' : 'POST',
            body
        ));
        assert.equal(response.status, path.endsWith('/community-posts') || path.endsWith('/events') || path === '/api/admin/chronicle' ? 201 : 200, label);
        if (schema) await contractJson(response, schema);
    }
});

test('Editorial admin middleware and conflict boundaries preserve exact JSON errors', async () => {
    const repository = editorialRepositoryStub({
        updateEditorialEvent: async () => ({ status: 'conflict', revision: 3 })
    });
    const app = createApp(repository);

    const unauthenticated = await app.request('/api/admin/community-posts');
    assert.equal(unauthenticated.status, 401);
    await contractJson(unauthenticated, failureMessageResponseSchema);

    const denied = await createApp(repository, 'editor').request(
        '/api/admin/community-posts',
        bearerRequest('GET')
    );
    assert.equal(denied.status, 403);
    await contractJson(denied, messageErrorResponseSchema);

    const csrf = await app.request('/api/admin/community-posts', {
        method: 'POST',
        headers: {
            Cookie: 'token=token; csrf_token=wrong',
            'x-csrftoken': 'wrong',
            'content-type': 'application/json'
        },
        body: JSON.stringify({ title: '帖子', kind: 'notice' })
    });
    assert.equal(csrf.status, 403);
    await contractJson(csrf, failureMessageResponseSchema);

    const conflict = await app.request(
        '/api/admin/community-posts/1',
        bearerRequest('PUT', { migrationProbe: true })
    );
    assert.equal(conflict.status, 409);
    await contractJson(conflict, editorialConflictErrorResponseSchema);
});
