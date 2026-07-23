import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { createWikiFixture } from './fixture';

type DomNode = {
    nodeName?: string;
    tagName?: string;
    value?: string;
    attrs?: Array<{ name: string; value: string }>;
    childNodes?: DomNode[];
};

async function parseDocument(html: string): Promise<DomNode> {
    const { parse } = await import('parse5');
    return parse(html) as DomNode;
}

function attributes(node: DomNode) {
    return Object.fromEntries((node.attrs ?? []).map((attribute) => [attribute.name, attribute.value]));
}

function descendants(node: DomNode, predicate: (candidate: DomNode) => boolean): DomNode[] {
    const found: DomNode[] = [];
    const visit = (candidate: DomNode) => {
        if (predicate(candidate)) found.push(candidate);
        for (const child of candidate.childNodes ?? []) visit(child);
    };
    visit(node);
    return found;
}

function byId(document: DomNode, id: string) {
    return descendants(document, (node) => attributes(node).id === id)[0];
}

function hasClass(node: DomNode, className: string) {
    return (attributes(node).class ?? '').split(/\s+/).includes(className);
}

function byClass(document: DomNode, className: string) {
    return descendants(document, (node) => hasClass(node, className));
}

function textContent(node: DomNode): string {
    if (node.nodeName === '#text') return node.value ?? '';
    return (node.childNodes ?? []).map(textContent).join('');
}

function title(document: DomNode) {
    const titleNode = descendants(document, (node) => node.tagName === 'title')[0];
    assert.ok(titleNode, 'document must contain a title');
    return textContent(titleNode);
}

function storyPayload(document: DomNode) {
    const scripts = descendants(document, (node) => node.tagName === 'script');
    const inline = scripts.find((node) => textContent(node).includes('window.storyData = '));
    assert.ok(inline, 'story document must contain the inline storyData script');
    const source = textContent(inline);
    const dataPrefix = 'window.storyData = ';
    const contextPrefix = 'window.storyContext = ';
    const dataStart = source.indexOf(dataPrefix) + dataPrefix.length;
    const dataEnd = source.indexOf(`;\n${contextPrefix}`, dataStart);
    const contextStart = dataEnd + 2 + contextPrefix.length;
    const contextEnd = source.indexOf(';\n(', contextStart);
    assert.ok(dataStart >= dataPrefix.length && dataEnd > dataStart, 'storyData assignment must be delimited');
    assert.ok(contextStart > dataEnd && contextEnd > contextStart, 'storyContext assignment must be delimited');
    return {
        scripts,
        source,
        data: JSON.parse(source.slice(dataStart, dataEnd)),
        context: JSON.parse(source.slice(contextStart, contextEnd))
    };
}

describe('WIKI-01 rendered DOM contract', () => {
    test('the main site and Wiki home are distinct documents and all seven agency layouts render', async () => {
        const fixture = createWikiFixture();
        fixture.story.idols[0]!.folder_name = 'amami_haruka';
        fixture.story.idols[1]!.folder_name = 'hidaka_ai';
        const mainResponse = await fixture.app.request('/');
        const wikiResponse = await fixture.app.request('/wiki/');
        assert.equal(mainResponse.status, 200);
        assert.equal(wikiResponse.status, 200);

        const mainHtml = await mainResponse.text();
        const wikiHtml = await wikiResponse.text();
        const [main, wiki] = await Promise.all([parseDocument(mainHtml), parseDocument(wikiHtml)]);
        assert.equal(title(main), 'IMS Main Site');
        assert.equal(title(wiki), '✨ 剧情导航站 ✨');
        assert.notEqual(mainHtml, wikiHtml);
        assert.ok(byId(main, 'main-site-home'));
        assert.equal(byId(main, 'sidebarContainer'), undefined);
        assert.deepEqual(fixture.staticRequests, ['/index.html']);

        for (const id of [
            'sidebarContainer', 'contentContainer', 'bgLayer1', 'bgLayer2', 'bgSourceBtn',
            'bgSwitchBtn', 'fabSearch', 'searchOverlay', 'searchInput'
        ]) {
            assert.ok(byId(wiki, id), `Wiki home must retain #${id}`);
        }

        const tabs = byClass(wiki, 'tab-btn').filter((node) => 'data-agency' in attributes(node));
        const imageSources = descendants(wiki, (node) => node.tagName === 'img')
            .map((node) => attributes(node).src);
        assert.ok(imageSources.includes('/assets/images/Production/765Haruka.png'));
        assert.ok(imageSources.filter((source) => source === '/icon/876pro.webp').length >= 2);
        const sections = byClass(wiki, 'agency-section').filter((node) => 'data-agency' in attributes(node));
        assert.equal(tabs.length, 7);
        assert.equal(sections.length, 7);
        assert.deepEqual(tabs.map((node) => attributes(node)['data-agency']), [
            '765PRO', '876PRO', '灰姑娘女孩', '百万现场', 'SideM', '闪耀色彩', '学园偶像大师'
        ]);

        for (const marker of [
            'pro765-banner', 'pro876-banner', 'cg-banner', 'ml-banner',
            'sidem-banner', 'sc-banner', 'gk-banner'
        ]) {
            assert.equal(byClass(wiki, marker).length, 1, `agency template marker .${marker} must render once`);
        }
        assert.ok(byClass(wiki, 'cg-nav-bar').length === 1);
        const cgLinks = descendants(wiki, (node) =>
            node.tagName === 'a' && (attributes(node).href ?? '').startsWith('#section-')
        ).map((node) => attributes(node).href);
        assert.deepEqual(cgLinks, ['#section-cute', '#section-cool', '#section-passion']);
        assert.ok(descendants(wiki, (node) =>
            node.tagName === 'a' && (attributes(node).href ?? '').startsWith('/story?agency=')
        ).length > 0, 'agency partials must retain story links');
    });

    test('/story keeps compatibility statuses and the complete legacy DOM surface', async () => {
        const fixture = createWikiFixture();
        const missing = await fixture.app.request('/story');
        assert.equal(missing.status, 400);
        assert.equal(await missing.text(), '参数缺失');
        const missingIdol = await fixture.app.request('/story?agency=闪耀色彩');
        assert.equal(missingIdol.status, 400);
        assert.equal(await missingIdol.text(), '参数缺失');
        const unknownAgency = await fixture.app.request('/story?agency=不存在&idol=不存在');
        assert.equal(unknownAgency.status, 404);
        assert.equal(await unknownAgency.text(), '找不到该企划');
        const unknownIdol = await fixture.app.request('/story?agency=闪耀色彩&idol=不存在');
        assert.equal(unknownIdol.status, 404);
        assert.equal(await unknownIdol.text(), '数据库中未找到该偶像');

        fixture.story.seedStory({
            idol_id: 6,
            category: 'enzaP卡',
            card_name: '【fixture-card】',
            up_name: 'fixture-up',
            video_title: 'fixture-title',
            url: 'https://www.bilibili.com/video/BV1xx411c7mD',
            image_file: 'enza_pcard/fixture.webp'
        });
        const response = await fixture.app.request('/story?agency=闪耀色彩&idol=樱木真乃');
        assert.equal(response.status, 200);
        const document = await parseDocument(await response.text());

        for (const id of [
            'dynamic-desktop-popup', 'global-mobile-popup', 'tabs-bar', 'addStoryModal', 'storyForm',
            'form-old-card-name', 'form-old-category', 'form-old-up-hidden', 'form-old-url-hidden',
            'form-category-select', 'form-category-new', 'form-card-name', 'form-comment-container',
            'form-comment', 'form-url', 'btn-fetch-bili', 'form-up', 'form-title',
            'form-image-container', 'form-image', 'btn-delete-card', 'btn-delete-category', 'modal-submit-btn'
        ]) {
            assert.ok(byId(document, id), `story document must retain #${id}`);
        }

        assert.ok(byClass(document, 'category-section').some((node) => attributes(node)['data-category'] === 'enzaP卡'));
        assert.ok(byClass(document, 'idol-card').some((node) => attributes(node)['data-card-name'] === '【fixture-card】'));
        assert.equal(attributes(byClass(document, 'profile-img')[0]!).src, '/assets/images/Production/283Mano.png');
        const payload = storyPayload(document);
        const category = payload.data.find((entry: { name: string }) => entry.name === 'enzaP卡');
        assert.ok(category);
        assert.equal(category.cards[0].name, '【fixture-card】');
        assert.equal(category.cards[0].links[0].up, 'fixture-up');
        assert.deepEqual(payload.context, { agency: '闪耀色彩', idol: '樱木真乃' });
        const nameShim = payload.source.indexOf('((__name) =>');
        assert.ok(nameShim > -1, 'serialized story client must define the build-time function name shim');
        assert.ok(
            payload.source.indexOf('__name(', nameShim + '((__name) =>'.length) > nameShim,
            'the name shim must wrap the serialized story client before its first helper call'
        );
    });

    test('storyData escapes script terminators, HTML and quotes without creating executable DOM', async () => {
        const fixture = createWikiFixture();
        const agencyName = '企划"</script><section id="injected-agency">&';
        const idolName = '偶像\'</script><img id="injected-idol" src=x>';
        const categoryName = '分类"</script><div id="injected-category">';
        const cardName = '卡"</script><script id="injected-script">globalThis.pwned=1</script>';
        const upName = 'UP <b id="injected-up">"quoted"</b>';
        const videoTitle = '标题 \'</script><iframe id="injected-frame">';
        const url = 'https://example.invalid/watch?q="</script><script id="injected-link">';
        fixture.story.addAgencyWithIdol(
            { id: 99, code: 'sc', name_cn: agencyName, color: '#112233' },
            {
                id: 99,
                agency_id: 99,
                agency_code: 'sc',
                agency_name: agencyName,
                agency_color: '#112233',
                name_cn: idolName,
                folder_name: 'injection_fixture',
                color: '#112233'
            }
        );
        fixture.story.seedStory({
            idol_id: 99,
            category: categoryName,
            card_name: cardName,
            up_name: upName,
            video_title: videoTitle,
            url
        });

        const response = await fixture.app.request(`/story?agency=${encodeURIComponent(agencyName)}&idol=${encodeURIComponent(idolName)}`);
        assert.equal(response.status, 200);
        const document = await parseDocument(await response.text());
        for (const injectedId of [
            'injected-agency', 'injected-idol', 'injected-category', 'injected-script',
            'injected-up', 'injected-frame', 'injected-link'
        ]) {
            assert.equal(byId(document, injectedId), undefined, `untrusted value must not create #${injectedId}`);
        }

        const payload = storyPayload(document);
        assert.equal(payload.scripts.length, 3, 'only two external scripts and the intended inline script may exist');
        assert.deepEqual(payload.context, { agency: agencyName, idol: idolName });
        const category = payload.data.find((entry: { name: string }) => entry.name === categoryName);
        assert.ok(category);
        assert.equal(category.cards[0].name, cardName);
        assert.equal(category.cards[0].links[0].up, upName);
        assert.equal(category.cards[0].links[0].title, videoTitle);
        assert.equal(category.cards[0].links[0].url, url);
        const card = byClass(document, 'idol-card').find((node) => attributes(node)['data-card-name'] === cardName);
        assert.ok(card, 'card name must round-trip through an HTML attribute');
        assert.ok(textContent(document).includes(idolName), 'idol text must round-trip through escaped HTML text');
        assert.ok(textContent(document).includes(cardName), 'card text must round-trip through escaped HTML text');
    });
});

describe('WIKI-01 static and story object paths', () => {
    test('icon/css routes work while encoded traversal and sensitive paths are rejected before assets/storage', async () => {
        const fixture = createWikiFixture();
        fixture.storage.seed(
            'Wiki/static/icon/cg/cute.webp',
            new TextEncoder().encode('object-icon'),
            'image/webp'
        );
        const icon = await fixture.app.request('/icon/cg/cute.webp');
        assert.equal(icon.status, 200);
        assert.equal(await icon.text(), 'object-icon');
        const css = await fixture.app.request('/css/story.css');
        assert.equal(css.status, 200);
        assert.equal(await css.text(), 'fixture-css');

        const callsBefore = fixture.staticRequests.length;
        const storageGetsBefore = [...fixture.storage.gets];
        for (const path of [
            '/icon/%252e%252e/app.py',
            '/css/%252e%252e/templates/story.html',
            '/image/闪耀色彩/樱木真乃/%252e%252e/secret.webp',
            '/image/闪耀色彩/樱木真乃/%255c..%255csecret.webp'
        ]) {
            const response = await fixture.app.request(path);
            assert.equal(response.status, 403, `${path} must be forbidden`);
        }
        assert.equal(fixture.staticRequests.length, callsBefore, 'forbidden paths must not reach Assets');
        assert.deepEqual(
            fixture.storage.gets,
            storageGetsBefore,
            'forbidden paths must not reach object storage'
        );
    });

    test('image GET/HEAD preserve body and metadata while unknown targets remain 404', async () => {
        const fixture = createWikiFixture();
        const key = 'Data/sc/sc_idol/cards/fixture.webp';
        fixture.storage.seed(key, new Uint8Array([9, 8, 7]), 'image/webp');
        const path = '/image/闪耀色彩/樱木真乃/cards/fixture.webp';
        const get = await fixture.app.request(path);
        assert.equal(get.status, 200);
        assert.equal(get.headers.get('content-type'), 'image/webp');
        assert.equal(get.headers.get('content-length'), '3');
        assert.equal(get.headers.get('etag'), '"fixture-3"');
        assert.deepEqual(new Uint8Array(await get.arrayBuffer()), new Uint8Array([9, 8, 7]));
        const head = await fixture.app.request(path, { method: 'HEAD' });
        assert.equal(head.status, 200);
        assert.equal(head.headers.get('content-length'), '3');
        assert.equal((await head.arrayBuffer()).byteLength, 0);
        assert.equal((await fixture.app.request('/image/不存在/樱木真乃/cards/fixture.webp')).status, 404);
        assert.equal((await fixture.app.request('/image/闪耀色彩/不存在/cards/fixture.webp')).status, 404);
        assert.equal((await fixture.app.request('/image/闪耀色彩/樱木真乃/cards/missing.webp')).status, 404);
    });

    test('health and random background reads remain public and compatible', async () => {
        const fixture = createWikiFixture();
        const health = await fixture.app.request('/api/wiki/test');
        assert.equal(health.status, 200);
        assert.deepEqual(await health.json(), { status: 'ok' });
        fixture.story.samples.set('cg', {
            id: 501,
            idol_id: 3,
            category: '卡剧情',
            card_name: '【背景】',
            up_name: 'up',
            video_title: 'title',
            url: '#',
            subtitle: '',
            image_file: 'card/bg.webp',
            idol_name: '岛村卯月',
            agency_name: '灰姑娘女孩'
        });
        const fallback = await fixture.app.request('/api/wiki/random_bg');
        assert.equal(fallback.status, 200);
        assert.deepEqual(await fallback.json(), {
            url: '/assets/images/Production/Cinderellaintro.png',
            card_name: '企划视觉素材',
            idol_name: '岛村卯月',
            agency_name: '灰姑娘女孩'
        });

        fixture.storage.seed('Data/cg/cg_idol/card/bg.webp');
        const background = await fixture.app.request('/api/wiki/random_bg');
        assert.equal(background.status, 200);
        assert.deepEqual(await background.json(), {
            url: '/image/灰姑娘女孩/岛村卯月/card/bg.webp',
            card_name: '【背景】',
            idol_name: '岛村卯月',
            agency_name: '灰姑娘女孩'
        });
    });
});
