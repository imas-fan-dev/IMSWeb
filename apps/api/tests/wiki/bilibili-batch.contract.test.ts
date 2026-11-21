import assert from 'node:assert/strict';
import { describe, test } from 'vitest';
import { adminWikiParseBilibiliBatchPath } from '@imsweb/contracts/paths';
import { adminWikiParseBilibiliBatchResultSchema } from '@imsweb/contracts/wiki';
import { createWikiFixture, type WikiFixture } from './fixture';
import { readContractJson } from '../contracts/contract-json';

interface BilibiliVideoFixture {
    /** Multi-part titles; defaults to the single video title. */
    parts?: string[];
    pic?: string;
    title: string;
    up: string;
}

/**
 * Fake upstream Bilibili API keyed by the `bvid` query parameter.
 *
 * Records every requested URL so a test can assert trimming, de-duplication,
 * and that invalid input never reaches the network.
 */
function installBilibiliFetch(
    fixture: WikiFixture,
    videos: Record<string, BilibiliVideoFixture>
) {
    const requested: string[] = [];
    fixture.setFetch((async (input) => {
        const url = new URL(String(input));
        requested.push(url.toString());
        const bvid = url.searchParams.get('bvid') ?? '';
        const video = videos[bvid];
        if (!video) {
            return new Response(JSON.stringify({ code: -404, message: '啥都木有' }), {
                headers: { 'Content-Type': 'application/json' }
            });
        }
        const pages = (video.parts ?? [video.title]).map((part, index) => ({
            page: index + 1,
            part
        }));
        return new Response(JSON.stringify({
            code: 0,
            data: {
                bvid,
                title: video.title,
                pic: video.pic ?? 'http://i0.hdslb.com/bfs/archive/cover.jpg#fragment',
                owner: { name: video.up },
                pages
            }
        }), { headers: { 'Content-Type': 'application/json' } });
    }) as typeof globalThis.fetch);
    return requested;
}

async function postBatch(
    fixture: WikiFixture,
    urls: unknown,
    options: { csrf?: string | null; role?: string } = {}
) {
    const headers = await fixture.authHeaders(options.role ?? 'editor');
    if (options.csrf === null) delete headers['X-CSRFToken'];
    else if (typeof options.csrf === 'string') headers['X-CSRFToken'] = options.csrf;
    return fixture.app.request(adminWikiParseBilibiliBatchPath(), {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ urls })
    });
}

describe('WIKI-05 batch Bilibili parsing contract', () => {
    test('resolves trimmed de-duplicated URLs and returns exact per-item results', async () => {
        const fixture = createWikiFixture();
        const requested = installBilibiliFetch(fixture, {
            BV1xx411c7mD: {
                title: '合集标题',
                up: '测试UP',
                parts: ['第一话', '第二话']
            },
            BV1yy411c7mE: {
                title: '语音合集',
                up: '语音UP',
                pic: 'https://i0.hdslb.com/bfs/archive/voice.webp'
            }
        });

        const response = await postBatch(fixture, [
            '  https://www.bilibili.com/video/BV1xx411c7mD?p=2  ',
            'https://www.bilibili.com/video/BV1yy411c7mE',
            '   ',
            'https://www.bilibili.com/video/BV1xx411c7mD?p=2'
        ]);

        assert.equal(response.status, 200);
        assert.deepEqual(
            await readContractJson(response, adminWikiParseBilibiliBatchResultSchema),
            {
                status: 'success',
                items: [
                    {
                        inputUrl: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
                        ok: true,
                        title: '第二话',
                        up: '测试UP',
                        stdUrl: 'https://www.bilibili.com/video/BV1xx411c7mD?p=2',
                        coverUrl: 'https://i0.hdslb.com/bfs/archive/cover.jpg'
                    },
                    {
                        inputUrl: 'https://www.bilibili.com/video/BV1yy411c7mE',
                        ok: true,
                        title: '语音合集',
                        up: '语音UP',
                        stdUrl: 'https://www.bilibili.com/video/BV1yy411c7mE',
                        coverUrl: 'https://i0.hdslb.com/bfs/archive/voice.webp'
                    }
                ]
            }
        );
        assert.deepEqual(requested, [
            'https://api.bilibili.com/x/web-interface/view?bvid=BV1xx411c7mD',
            'https://api.bilibili.com/x/web-interface/view?bvid=BV1yy411c7mE'
        ]);
    });

    test('keeps per-item failures while the rest of the batch succeeds', async () => {
        const fixture = createWikiFixture();
        const requested = installBilibiliFetch(fixture, {
            BV1xx411c7mD: { title: '第一话', up: '成功UP' }
        });

        const response = await postBatch(fixture, [
            'BV1xx411c7mD',
            'https://www.bilibili.com/video/BV1zz411c7mF',
            '这不是 B 站链接'
        ]);

        assert.equal(response.status, 200);
        assert.deepEqual(
            await readContractJson(response, adminWikiParseBilibiliBatchResultSchema),
            {
                status: 'success',
                items: [
                    {
                        inputUrl: 'BV1xx411c7mD',
                        ok: true,
                        title: '第一话',
                        up: '成功UP',
                        stdUrl: 'https://www.bilibili.com/video/BV1xx411c7mD',
                        coverUrl: 'https://i0.hdslb.com/bfs/archive/cover.jpg'
                    },
                    {
                        inputUrl: 'https://www.bilibili.com/video/BV1zz411c7mF',
                        ok: false,
                        error: '啥都木有'
                    },
                    {
                        inputUrl: '这不是 B 站链接',
                        ok: false,
                        error: '未检测到有效的 BV号/av号/收藏夹链接'
                    }
                ]
            }
        );
        // The invalid identifier never spends an upstream request.
        assert.deepEqual(requested, [
            'https://api.bilibili.com/x/web-interface/view?bvid=BV1xx411c7mD',
            'https://api.bilibili.com/x/web-interface/view?bvid=BV1zz411c7mF'
        ]);
    });

    test('rejects more than twenty URLs without touching the network', async () => {
        const fixture = createWikiFixture();
        const requested = installBilibiliFetch(fixture, {});

        const response = await postBatch(
            fixture,
            Array.from({ length: 21 }, (_, index) => `BV1xx411c7${String(index).padStart(2, '0')}`)
        );

        assert.equal(response.status, 400);
        const body = await response.json() as { msg: string; status: string };
        assert.equal(body.status, 'error');
        assert.equal(typeof body.msg, 'string');
        assert.deepEqual(requested, []);
    });

    test('requires an authenticated editor with a valid CSRF token', async () => {
        const fixture = createWikiFixture();
        const requested = installBilibiliFetch(fixture, {});

        const anonymous = await fixture.app.request(adminWikiParseBilibiliBatchPath(), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ urls: ['BV1xx411c7mD'] })
        });
        assert.equal(anonymous.status, 401);

        const missingCsrf = await postBatch(fixture, ['BV1xx411c7mD'], { csrf: null });
        assert.equal(missingCsrf.status, 403);
        assert.deepEqual(await missingCsrf.json(), {
            status: 'error',
            msg: 'CSRF token 无效，请刷新页面重试'
        });

        const wrongCsrf = await postBatch(fixture, ['BV1xx411c7mD'], { csrf: 'forged-secret' });
        assert.equal(wrongCsrf.status, 403);

        const wrongRole = await postBatch(fixture, ['BV1xx411c7mD'], { role: 'user' });
        assert.equal(wrongRole.status, 403);

        assert.deepEqual(requested, []);
    });

    test('parses in flight with a bounded concurrency instead of one huge burst', async () => {
        const fixture = createWikiFixture();
        const bvids = Array.from(
            { length: 8 },
            (_, index) => `BV1concur${String(index).padStart(3, '0')}`
        );
        let inFlight = 0;
        let maxInFlight = 0;
        fixture.setFetch((async (input) => {
            const bvid = new URL(String(input)).searchParams.get('bvid') ?? '';
            inFlight += 1;
            maxInFlight = Math.max(maxInFlight, inFlight);
            await new Promise((resolve) => setTimeout(resolve, 5));
            inFlight -= 1;
            return new Response(JSON.stringify({
                code: 0,
                data: {
                    bvid,
                    title: `并发 ${bvid}`,
                    pic: 'https://i0.hdslb.com/bfs/archive/cover.jpg',
                    owner: { name: '并发UP' }
                }
            }), { headers: { 'Content-Type': 'application/json' } });
        }) as typeof globalThis.fetch);

        const response = await postBatch(fixture, bvids);

        assert.equal(response.status, 200);
        const body = await readContractJson(
            response,
            adminWikiParseBilibiliBatchResultSchema
        ) as { items: Array<{ inputUrl: string; ok: boolean }> };
        assert.deepEqual(
            body.items.map((item) => item.inputUrl),
            bvids
        );
        assert.ok(body.items.every((item) => item.ok));
        assert.ok(maxInFlight > 1, 'batch must parse concurrently');
        assert.ok(maxInFlight <= 4, `concurrency must stay bounded, saw ${maxInFlight}`);
    });
});
