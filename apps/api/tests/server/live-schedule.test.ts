import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { createHonoApp } from '@/app';
import {
    clearLiveScheduleCache,
    getLiveSchedule,
    normalizeLiveScheduleArticle
} from '@/domains/live-schedule/live-schedule-service';

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json' }
    });
}

function liveArticle(overrides: Record<string, unknown> = {}) {
    return {
        _id: 'live-1',
        title: 'THE IDOLM@STER TEST LIVE',
        event_startdate: Date.UTC(2026, 6, 28) / 1000,
        event_dspdate: '17:00 开演',
        event_url: '/live_event/test/',
        brand: [{ code: 'IDOLMASTER' }],
        categories: {
            subcategory: [{ name: 'ライブ・イベント' }]
        },
        ...overrides
    };
}

function cmsFetcher(articles: unknown[]) {
    let calls = 0;
    const fetcher: typeof fetch = async (input) => {
        calls += 1;
        const url = new URL(String(input));
        if (url.pathname.endsWith('/cmsbase/Token/get')) {
            return jsonResponse({ data: { token: 'test-token' } });
        }
        assert.equal(url.searchParams.get('token'), 'test-token');
        assert.equal(url.searchParams.get('limit'), '200');
        return jsonResponse({ data: { article_list: articles } });
    };
    return { fetcher, calls: () => calls };
}

afterEach(() => clearLiveScheduleCache());

test('normalizes only live events and preserves brand identity', () => {
    assert.deepEqual(normalizeLiveScheduleArticle(liveArticle()), {
        id: 'live-1',
        year: 2026,
        month: 7,
        day: 28,
        title: 'THE IDOLM@STER TEST LIVE',
        time: '17:00 开演',
        location: '',
        detailUrl: 'https://idolmaster-official.jp/live_event/test/',
        franchises: ['765PRO ALLSTARS'],
        brandCodes: ['IDOLMASTER']
    });
    assert.equal(normalizeLiveScheduleArticle(liveArticle({
        categories: { subcategory: [{ name: 'グッズ' }] }
    })), null);
    assert.deepEqual(normalizeLiveScheduleArticle(liveArticle({
        brand: [{ code: 'OTHER' }],
        title: 'VA-LIV EVENT'
    }))?.brandCodes, ['VA-LIV']);
    assert.equal(normalizeLiveScheduleArticle(liveArticle({
        event_startdate: Date.UTC(2026, 6, 27, 15) / 1000
    }))?.day, 28);
});

test('loads requested months, deduplicates records, and caches each month', async () => {
    const source = cmsFetcher([
        liveArticle(),
        liveArticle(),
        liveArticle({
            _id: 'goods-1',
            categories: { subcategory: [{ name: 'グッズ' }] }
        })
    ]);
    const app = createHonoApp(() => ({ fetch: source.fetcher }));

    const url = 'http://ims.test/api/live-schedule?months=2026-07,2026-08';
    const first = await app.request(url);
    assert.equal(first.status, 200);
    assert.equal(first.headers.get('cache-control'), 'public, max-age=300');
    const body = await first.json() as unknown[];
    assert.equal(body.length, 1);
    assert.equal(source.calls(), 3);

    const second = await app.request(url);
    assert.equal(second.status, 200);
    assert.equal(source.calls(), 3);

    const invalid = await app.request(
        'http://ims.test/api/live-schedule?months=2020-07'
    );
    assert.equal(invalid.status, 400);
});

test('returns stale data when a refresh fails', async () => {
    const source = cmsFetcher([liveArticle()]);
    const cached = await getLiveSchedule(source.fetcher, ['2026-07'], 0);
    assert.equal(cached.length, 1);

    const stale = await getLiveSchedule(
        async () => { throw new Error('offline'); },
        ['2026-07'],
        7 * 60 * 60 * 1000
    );
    assert.deepEqual(stale, cached);
});
