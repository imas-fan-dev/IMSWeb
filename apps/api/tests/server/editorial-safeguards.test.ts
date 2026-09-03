import assert from 'node:assert/strict';
import test from 'node:test';
import { createHonoApp } from '@/app';
import {
    legacyHtmlImageReferences,
    legacyHtmlToArticleDocument
} from '@/domains/content/editorial/article-body';
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

function createApp(repository: EditorialRepository) {
    return createHonoApp(() => ({
        editorial: repository,
        backofficeTokens: {
            async sign() { return 'token'; },
            async verify() {
                return {
                    id: 1,
                    username: 'operator',
                    producername: 'operator',
                    dept: 'op',
                    csrfSecret: 'csrf'
                };
            }
        }
    }));
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

test('legacy HTML images become article assets during editorial migration', () => {
    const sourceUrl = '/uploads/information/poster.webp';
    const document = legacyHtmlToArticleDocument(
        `<p>活动海报 <img src="${sourceUrl}" alt="十周年主视觉"></p>`,
        new Map([[sourceUrl, { assetId: 17, publicPath: '/uploads/articles/42/legacy-poster.webp' }]])
    );
    const serialized = JSON.stringify(document);

    assert.match(serialized, /"type":"image"/);
    assert.match(serialized, /"assetId":17/);
    assert.match(serialized, /"src":"\/uploads\/articles\/42\/legacy-poster\.webp"/);
    assert.deepEqual(legacyHtmlImageReferences(
        `<p>活动海报 <img src="${sourceUrl}" alt="十周年主视觉"></p>`
    ), [{ sourceUrl, altText: '十周年主视觉' }]);
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
    assert.equal((await invalid.json()).error, '报名链接只允许 HTTP(S) 或站内路径');

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
    assert.equal((await response.json()).error, '首页精选只能包含已发布的社区帖子');
});
