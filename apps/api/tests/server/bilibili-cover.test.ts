import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
    fetchBilibiliCover,
    normalizeBilibiliCoverUrl
} from '@/utils/media/bilibili-cover';

test('Bilibili cover URLs are normalized and restricted to the image CDN', () => {
    assert.equal(
        normalizeBilibiliCoverUrl('http://i0.hdslb.com/bfs/archive/cover.jpg#preview'),
        'https://i0.hdslb.com/bfs/archive/cover.jpg'
    );
    assert.equal(normalizeBilibiliCoverUrl('https://api.bilibili.com/bfs/cover.jpg'), '');
    assert.equal(normalizeBilibiliCoverUrl('https://i0.hdslb.com/not-bfs/cover.jpg'), '');
    assert.equal(normalizeBilibiliCoverUrl('https://i0.hdslb.com.evil.test/bfs/cover.jpg'), '');
});

test('Bilibili cover download returns an upload-compatible image with bounded fetch options', async () => {
    let requestedUrl = '';
    let requestedInit: RequestInit | undefined;
    const file = await fetchBilibiliCover(
        'https://i0.hdslb.com/bfs/archive/cover.jpg',
        (async (input, init) => {
            requestedUrl = String(input);
            requestedInit = init;
            return new Response(Uint8Array.from([1, 2, 3]), {
                headers: { 'Content-Type': 'image/jpeg' }
            });
        }) as typeof globalThis.fetch
    );

    assert.equal(requestedUrl, 'https://i0.hdslb.com/bfs/archive/cover.jpg');
    assert.equal(requestedInit?.redirect, 'error');
    assert.equal(new Headers(requestedInit?.headers).get('referer'), 'https://www.bilibili.com/');
    assert.deepEqual(file, {
        filename: 'bilibili-cover.jpg',
        contentType: 'image/jpeg',
        body: Uint8Array.from([1, 2, 3])
    });
});

test('Bilibili cover download rejects unsupported and oversized responses', async () => {
    await assert.rejects(
        fetchBilibiliCover(
            'https://i0.hdslb.com/bfs/archive/cover.svg',
            (async () => new Response('<svg/>', {
                headers: { 'Content-Type': 'image/svg+xml' }
            })) as typeof globalThis.fetch
        ),
        /B站封面格式不支持/
    );
    await assert.rejects(
        fetchBilibiliCover(
            'https://i0.hdslb.com/bfs/archive/large.jpg',
            (async () => new Response(Uint8Array.from([1, 2, 3]), {
                headers: {
                    'Content-Length': '3',
                    'Content-Type': 'image/jpeg'
                }
            })) as typeof globalThis.fetch,
            2
        ),
        /B站封面图片过大/
    );
});
