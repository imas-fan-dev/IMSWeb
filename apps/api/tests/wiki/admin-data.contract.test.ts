import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createWikiFixture,
    formFields,
    postMultipart
} from './fixture';

async function cookieFor(fixture: ReturnType<typeof createWikiFixture>, role = 'editor') {
    const auth = await fixture.auth(role);
    return { Cookie: `token=${auth.token}` };
}

describe('Wiki admin dynamic data contract', () => {
    test('catalog and story reads require an editor or operator session', async () => {
        const fixture = createWikiFixture();
        for (const path of ['/api/admin/wiki/catalog', '/api/admin/wiki/stories']) {
            const anonymous = await fixture.app.request(path);
            assert.equal(anonymous.status, 401);
            assert.deepEqual(await anonymous.json(), {
                status: 'error',
                msg: '未登录，请先登录'
            });

            const viewer = await fixture.app.request(path, {
                headers: await cookieFor(fixture, 'viewer')
            });
            assert.equal(viewer.status, 403);
            assert.deepEqual(await viewer.json(), {
                status: 'error',
                msg: '无权限执行此操作'
            });
        }
    });

    test('catalog is built from repository agencies and idols', async () => {
        const fixture = createWikiFixture();
        fixture.story.agencies[5]!.icon_object_key = 'wiki/agencies/sc/branding/icon.webp';
        fixture.story.addAgencyWithIdol(
            {
                id: 88,
                code: 'future',
                name_cn: '未支持企划',
                color: '#000000',
                wiki_enabled: false,
                display_order: 88,
                banner_title: '未来企划',
                icon_object_key: null,
                fallback_artwork_object_key: null,
                layout_revision: 0
            },
            {
                id: 88,
                agency_id: 88,
                agency_code: 'future',
                agency_name: '未支持企划',
                agency_color: '#000000',
                name_cn: '未支持角色',
                folder_name: 'unsupported',
                color: null,
                wiki_enabled: false,
                display_order: 0,
                text_color: '#ffffff',
                avatar_object_key: null,
                avatar_fit: 'cover'
            }
        );
        const response = await fixture.app.request('/api/admin/wiki/catalog', {
            headers: await cookieFor(fixture)
        });
        assert.equal(response.status, 200);
        const body = await response.json() as any;
        assert.equal(body.status, 'success');
        assert.equal(body.agencies.length, 8);
        assert.deepEqual(body.agencies[5], {
            id: 6,
            code: 'sc',
            name: '闪耀色彩',
            color: '#8dbbff',
            wikiEnabled: true,
            bannerTitle: '闪耀色彩 Banner',
            displayOrder: 5,
            layoutRevision: 0,
            iconUrl: '/icon/agencies/6.webp',
            groups: [{
                id: 6,
                code: 'sc-main',
                name: '闪耀色彩 Main',
                color: '#8dbbff',
                iconUrl: null,
                displayOrder: 0,
                isFallback: true,
                idols: [{
                    id: 6,
                    name: '樱木真乃',
                    folderName: 'sc_idol',
                    color: '#8dbbff',
                    textColor: '#ffffff',
                    displayOrder: 0,
                    imageUrl: '',
                    imageFit: 'cover'
                }]
            }]
        });
    });

    test('selected idol stories expose database rows and managed category choices', async () => {
        const fixture = createWikiFixture();
        fixture.story.seedStory({
            idol_id: 6,
            category: '自定义分类',
            card_name: '【动态剧情】',
            up_name: 'fixture-up',
            video_title: 'fixture-title',
            url: 'https://example.invalid/watch',
            subtitle: '第一话',
            image_file: 'custom/story image.webp'
        });
        await fixture.story.ensureWikiCategory(6, 6, '自定义分类', 'custom');
        const response = await fixture.app.request(
            `/api/admin/wiki/stories?agency=${encodeURIComponent('闪耀色彩')}` +
            `&idol=${encodeURIComponent('樱木真乃')}`,
            { headers: await cookieFor(fixture, 'op') }
        );
        assert.equal(response.status, 200);
        const body = await response.json() as any;
        assert.equal(body.status, 'success');
        assert.equal(body.agency.code, 'sc');
        assert.equal(body.idol.name, '樱木真乃');
        assert.ok(body.categories.some((category: any) => category.name === 'enzaP卡'));
        assert.ok(body.categories.some((category: any) => category.name === '自定义分类'));
        assert.deepEqual(body.stories, [{
            id: 1,
            category: '自定义分类',
            cardName: '【动态剧情】',
            upName: 'fixture-up',
            videoTitle: 'fixture-title',
            url: 'https://example.invalid/watch',
            subtitle: '第一话',
            imageFile: 'custom/story image.webp',
            imageUrl: `/image/${encodeURIComponent('闪耀色彩')}/` +
                `${encodeURIComponent('樱木真乃')}/custom/story%20image.webp`
        }]);
    });

    test('story reads validate target parameters without leaking unrelated data', async () => {
        const fixture = createWikiFixture();
        const headers = await cookieFor(fixture);
        const missing = await fixture.app.request('/api/admin/wiki/stories', { headers });
        assert.equal(missing.status, 400);
        const unknown = await fixture.app.request(
            `/api/admin/wiki/stories?agency=${encodeURIComponent('不存在')}&idol=x`,
            { headers }
        );
        assert.equal(unknown.status, 404);
    });

    test('story_id edits the selected link while legacy group lookup remains compatible', async () => {
        const fixture = createWikiFixture();
        const first = fixture.story.seedStory({
            idol_id: 6,
            category: '测试分类',
            card_name: '【多链接】',
            up_name: 'first'
        });
        const second = fixture.story.seedStory({
            idol_id: 6,
            category: '测试分类',
            card_name: '【多链接】',
            up_name: 'second'
        });
        const response = await postMultipart(fixture, '/api/wiki/edit_story', {
            fields: formFields({
                story_id: String(second.id),
                category_name: '测试分类',
                old_category_name: '测试分类',
                card_name: '【多链接】',
                old_card_name: '【多链接】',
                up_name: 'selected-link'
            }),
            files: {}
        }, await fixture.authHeaders('editor'));
        assert.equal(response.status, 200);
        assert.equal(fixture.story.stories.find((row) => row.id === first.id)?.up_name, 'first');
        assert.equal(fixture.story.stories.find((row) => row.id === second.id)?.up_name, 'selected-link');
    });

    test('story_id derives the old group from the stored row and rejects malformed IDs', async () => {
        const fixture = createWikiFixture();
        const selected = fixture.story.seedStory({
            idol_id: 6,
            category: '实际分类',
            card_name: '【实际卡片】',
            up_name: 'selected'
        });
        const unrelated = fixture.story.seedStory({
            idol_id: 6,
            category: '伪造分类',
            card_name: '【伪造卡片】',
            up_name: 'unrelated'
        });
        const response = await postMultipart(fixture, '/api/wiki/edit_story', {
            fields: formFields({
                story_id: String(selected.id),
                category_name: '新分类',
                old_category_name: '伪造分类',
                card_name: '【新卡片】',
                old_card_name: '【伪造卡片】'
            }),
            files: {}
        }, await fixture.authHeaders('editor'));
        assert.equal(response.status, 200);
        assert.equal(fixture.story.stories.find((row) => row.id === selected.id)?.category, '新分类');
        assert.equal(fixture.story.stories.find((row) => row.id === unrelated.id)?.category, '伪造分类');

        const malformed = await postMultipart(fixture, '/api/wiki/edit_story', {
            fields: formFields({ story_id: '1.5' }),
            files: {}
        }, await fixture.authHeaders('editor'));
        assert.equal(malformed.status, 400);
        assert.deepEqual(await malformed.json(), {
            status: 'error',
            msg: '剧情 ID 无效'
        });
    });
});
