/**
 * 分享页 OGP 注入的纯函数单测：标签替换、转义、无图与畸形空壳都只在这里对着字符串跑。
 * 路由级的注入（真库 + 真 slug）在 `namecard-exchange.test.ts` 里。
 */
import assert from 'node:assert/strict';
import { test } from 'vitest';
import { injectShareMeta } from '@/domains/community/namecards/exchange/handlers/share-page-html';

/** 与构建产物同形的空壳：站点默认 title 与 description 都在，且没有图形标签。 */
const SHELL =
    '<!DOCTYPE html><html lang="zh-CN"><head><meta charSet="utf-8"/><meta name="viewport" content="width=device-width, initial-scale=1"/>' +
    '<title>IMSWeb | 偶像大师交流站</title><meta name="description" content="默认简介"/></head><body id="root"></body></html>';

const WITH_IMAGE = {
    title: '制作人的名片 · IMS',
    description: '分享人分享的制作人名片，打开可预览正面。',
    url: 'https://ims.example/exchange/card/abcdefghijkl',
    siteName: 'IMSWeb',
    image: {
        url: 'https://ims.example/api/community/exchange/cards/card-1/media/front?w=400&v=1',
        width: 400,
        height: 400,
    },
} as const;

test('the injected block replaces the shell title and description exactly once', () => {
    const html = injectShareMeta(SHELL, WITH_IMAGE);
    assert.equal((html.match(/<title/g) ?? []).length, 1);
    assert.ok(html.includes('<title>制作人的名片 · IMS</title>'));
    assert.ok(!html.includes('偶像大师交流站'));
    assert.ok(html.includes('<meta name="description" content="分享人分享的制作人名片，打开可预览正面。">'));
    assert.ok(!html.includes('默认简介'));
    // 标签落在 `<head>` 里、`<body>` 之前。
    assert.ok(html.indexOf('og:title') > html.indexOf('<head'));
    assert.ok(html.indexOf('og:title') < html.indexOf('<body'));
});

test('a front image is reported as an absolute 400 square', () => {
    const html = injectShareMeta(SHELL, WITH_IMAGE);
    assert.ok(
        html.includes(
            '<meta property="og:image" content="https://ims.example/api/community/exchange/cards/card-1/media/front?w=400&amp;v=1">',
        ),
    );
    assert.ok(html.includes('<meta property="og:image:width" content="400">'));
    assert.ok(html.includes('<meta property="og:image:height" content="400">'));
    assert.ok(html.includes('<meta name="twitter:card" content="summary">'));
    assert.ok(html.includes('<meta name="twitter:image" content="https://ims.example/api/community/exchange/cards/card-1/media/front?w=400&amp;v=1">'));
    assert.ok(html.includes('<meta property="og:url" content="https://ims.example/exchange/card/abcdefghijkl">'));
});

test('a card without a front page omits every image tag', () => {
    const html = injectShareMeta(SHELL, {
        title: '制作人的名片 · IMS',
        description: '说明',
        url: 'https://ims.example/exchange/card/abcdefghijkl',
        siteName: 'IMSWeb',
    });
    assert.ok(!html.includes('og:image'));
    assert.ok(!html.includes('twitter:image'));
    assert.ok(html.includes('og:title'));
});

test('every injected value is html escaped', () => {
    const html = injectShareMeta(SHELL, {
        title: 'a<b>"c"</title>',
        description: "d'e&f",
        url: 'https://ims.example/x?a=1&b=2',
        siteName: 'IMS<Web>',
    });
    assert.ok(html.includes('<title>a&lt;b&gt;&quot;c&quot;&lt;/title&gt;</title>'));
    assert.ok(html.includes('content="d&#39;e&amp;f"'));
    assert.ok(html.includes('content="https://ims.example/x?a=1&amp;b=2"'));
    assert.ok(html.includes('content="IMS&lt;Web&gt;"'));
    // 注入块之外没有留下未转义的原文。
    assert.ok(!html.includes('a<b>"c"'));
});

test('a shell without a title keeps working', () => {
    const bare = '<!DOCTYPE html><html><head></head><body id="root"></body></html>';
    const html = injectShareMeta(bare, WITH_IMAGE);
    assert.ok(html.startsWith('<!DOCTYPE html><html><head>'));
    assert.ok(html.includes('<title>制作人的名片 · IMS</title>'));
    assert.ok(html.includes('<body id="root">'));
});

test('a shell without a head element still gets the tags', () => {
    const html = injectShareMeta('<body id="root"></body>', WITH_IMAGE);
    assert.ok(html.includes('og:title'));
    assert.ok(html.endsWith('<body id="root"></body>'));
});
