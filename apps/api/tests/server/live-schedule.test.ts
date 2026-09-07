import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import {
    liveScheduleErrorResponseSchema,
    liveScheduleListSchema
} from '@imsweb/contracts/live';
import { createHonoApp } from '@/app';
import {
    clearLiveScheduleCache,
    getLiveSchedule,
    normalizeLiveScheduleArticle
} from '@/domains/content/live-schedule/live-schedule-service';

async function contractJson<T>(
    response: Response,
    schema: { parse(value: unknown): T }
): Promise<T> {
    assert.match(response.headers.get('content-type') ?? '', /^application\/json(?:;|$)/);
    const raw = await response.json();
    const parsed = schema.parse(raw);
    assert.deepEqual(parsed, raw, 'response schema must preserve the raw JSON wire body');
    return parsed;
}

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
        event_startdate: Date.UTC(2026, 6, 27, 15) / 1000,
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

test('uses the official Japanese date across the UTC and month boundaries', () => {
    assert.deepEqual(normalizeLiveScheduleArticle(liveArticle({
        _id: '',
        event_startdate: Date.UTC(2026, 6, 31, 15) / 1000
    })), {
        id: [
            'THE IDOLM@STER TEST LIVE',
            '2026-08-01',
            'https://idolmaster-official.jp/live_event/test/'
        ].join('|'),
        year: 2026,
        month: 8,
        day: 1,
        title: 'THE IDOLM@STER TEST LIVE',
        time: '17:00 开演',
        location: '',
        detailUrl: 'https://idolmaster-official.jp/live_event/test/',
        franchises: ['765PRO ALLSTARS'],
        brandCodes: ['IDOLMASTER']
    });
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
    const body = await contractJson(first, liveScheduleListSchema);
    assert.equal(body.length, 1);
    assert.equal(source.calls(), 3);

    const second = await app.request(url);
    assert.equal(second.status, 200);
    assert.equal(source.calls(), 3);

    const invalid = await app.request(
        'http://ims.test/api/live-schedule?months=2020-07'
    );
    assert.equal(invalid.status, 400);
    await contractJson(invalid, liveScheduleErrorResponseSchema);
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
