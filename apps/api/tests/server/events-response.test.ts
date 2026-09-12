import assert from 'node:assert/strict';
import test from 'node:test';
import { toEditorialEventResponse } from '@/domains/content/events/response';

test('editorial event responses serialize PostgreSQL timestamps', () => {
    const createdAt = new Date('2026-08-20T01:02:03.000Z');
    const startAt = new Date('2026-09-01T10:00:00.000Z');
    const publishedAt = new Date('2026-08-20T02:03:04.000Z');

    const response = toEditorialEventResponse({
        id: 36,
        title: '测试帖子',
        name: null,
        contact: null,
        image_url: null,
        created_at: createdAt,
        article_id: 36,
        cover_url: null,
        summary: '',
        body_json: { type: 'doc', content: [] },
        body_html: '',
        status: 'published',
        revision: 1,
        kind: 'notice',
        start_at: startAt,
        end_at: null,
        timezone: null,
        venue_name: null,
        address: null,
        registration_url: null,
        event_status: null,
        source_url: null,
        related_links: [{ label: '活动报名', url: 'https://example.test/register' }],
        cover_transform: { focalX: 0.25, focalY: 0.75, zoom: 1.5 },
        published_at: publishedAt
    });

    assert.equal(response.created_at, createdAt.toJSON());
    assert.equal(response.start_at, startAt.toJSON());
    assert.equal(response.end_at, null);
    assert.equal(response.published_at, publishedAt.toJSON());
    assert.deepEqual(response.related_links, [
        { label: '活动报名', url: 'https://example.test/register' }
    ]);
    assert.deepEqual(response.cover_transform, { focalX: 0.25, focalY: 0.75, zoom: 1.5 });
});
