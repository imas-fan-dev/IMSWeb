import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createWikiFixture,
    formFields,
    postMultipart
} from './fixture';

const COVER_TRANSFORM = {
    fit: 'cover', focalX: 0.5, focalY: 0.5, zoom: 1, rotation: 0
};
const CONTAIN_TRANSFORM = {
    fit: 'contain', focalX: 0.5, focalY: 0.5, zoom: 1, rotation: 0
};

async function cookieFor(fixture: ReturnType<typeof createWikiFixture>, role = 'editor') {
    const auth = await fixture.auth(role);
    return { Cookie: `token=${auth.token}` };
}

describe('Wiki admin dynamic data contract', () => {
    test('catalog and story reads require an editor or operator session', async () => {
        const fixture = createWikiFixture();
        for (const path of [
            '/api/admin/wiki/catalog',
            '/api/admin/wiki/stories',
            '/api/admin/wiki/story-source-catalog'
        ]) {
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

    test('content types and source platforms are managed dynamically and protected in use', async () => {
        const fixture = createWikiFixture();
        const auth = await fixture.auth('editor');
        const headers = {
            Cookie: `token=${auth.token}`,
            'X-CSRFToken': auth.csrf,
            'Content-Type': 'application/json'
        };
        const createType = await fixture.app.request(
            '/api/admin/wiki/story-content-types',
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: '电话',
                    iconName: 'phone',
                    description: '游戏内电话',
                    isActive: true
                })
            }
        );
        assert.equal(createType.status, 201);
        const contentType = (await createType.json() as any).option;
        assert.equal(contentType.name, '电话');
        assert.equal(contentType.iconName, 'phone');

        const createPlatform = await fixture.app.request(
            '/api/admin/wiki/story-source-platforms',
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: 'Rosinea',
                    homepageUrl: 'https://example.test/rosinea',
                    description: '文字整理',
                    isActive: true
                })
            }
        );
        assert.equal(createPlatform.status, 201);
        const sourcePlatform = (await createPlatform.json() as any).option;
        const updatePlatform = await fixture.app.request(
            `/api/admin/wiki/story-source-platforms/${sourcePlatform.id}`,
            {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    name: 'Rosinea',
                    homepageUrl: 'https://example.test/rosinea',
                    description: '文字整理与翻译',
                    isActive: false,
                    expectedRevision: sourcePlatform.revision
                })
            }
        );
        assert.equal(updatePlatform.status, 200);
        assert.equal((await updatePlatform.json() as any).option.isActive, false);

        fixture.story.seedStory({
            idol_id: 6,
            category: 'enzaP卡',
            card_name: '【多媒体】',
            content_type_id: contentType.id,
            content_type_name: contentType.name,
            source_platform_id: sourcePlatform.id,
            source_platform_name: sourcePlatform.name
        });
        const catalog = await fixture.app.request(
            '/api/admin/wiki/story-source-catalog',
            { headers }
        );
        assert.equal(catalog.status, 200);
        const catalogBody = await catalog.json() as any;
        assert.ok(catalogBody.contentTypes.some((option: any) => option.name === '电话'));
        assert.ok(catalogBody.sourcePlatforms.some((option: any) =>
            option.name === 'Rosinea' && option.isActive === false
        ));

        for (const path of [
            `/api/admin/wiki/story-content-types/${contentType.id}`,
            `/api/admin/wiki/story-source-platforms/${sourcePlatform.id}`
        ]) {
            const response = await fixture.app.request(path, { method: 'DELETE', headers });
            assert.equal(response.status, 409);
            assert.match((await response.json() as any).msg, /仍被来源引用/);
        }
    });

    test('catalog is built from repository agencies and idols', async () => {
        const fixture = createWikiFixture();
        fixture.storage.publicReadUrlBase = 'https://cdn.example.test';
        fixture.story.agencies[5]!.icon_object_key = 'wiki/agencies/sc/branding/icon.webp';
        fixture.story.agencies[5]!.icon_media_revision = 2;
        fixture.story.groups[5]!.icon_object_key =
            'wiki/agencies/sc/groups/sc-main/icon.webp';
        fixture.story.groups[5]!.icon_media_revision = 3;
        fixture.story.idols[5]!.avatar_object_key =
            'wiki/agencies/sc/idols/sc_idol/avatar.webp';
        fixture.story.idols[5]!.avatar_media_revision = 4;
        fixture.storage.seed('wiki/agencies/sc/branding/icon.webp');
        fixture.storage.seed('wiki/agencies/sc/groups/sc-main/icon.webp');
        fixture.storage.seed('wiki/agencies/sc/idols/sc_idol/avatar.webp');
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
                icon_fit: 'contain',
                icon_focal_x: 0.5,
                icon_focal_y: 0.5,
                icon_zoom: 1,
                icon_rotation: 0,
                icon_media_revision: 0,
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
                wiki_url: null,
                avatar_object_key: null,
                avatar_fit: 'cover',
                avatar_focal_x: 0.5,
                avatar_focal_y: 0.5,
                avatar_zoom: 1,
                avatar_rotation: 0,
                avatar_media_revision: 0,
                entry_kind: 'other',
                entry_subtype: null
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
            iconUrl: 'https://cdn.example.test/wiki/agencies/sc/branding/icon.webp?v=2',
            imageTransform: CONTAIN_TRANSFORM,
            mediaRevision: 2,
            idols: [{
                id: 6,
                agencyId: 6,
                name: '樱木真乃',
                folderName: 'sc_idol',
                color: '#8dbbff',
                wikiUrl: null,
                wikiEnabled: true,
                textColor: '#ffffff',
                displayOrder: 0,
                imageUrl:
                    'https://cdn.example.test/wiki/agencies/sc/idols/sc_idol/avatar.webp?v=4',
                imageFit: 'cover',
                imageTransform: COVER_TRANSFORM,
                mediaRevision: 4,
                entryKind: 'idol',
                entrySubtype: null,
                groupIds: [6]
            }],
            groups: [{
                id: 6,
                code: 'sc-main',
                name: '闪耀色彩 Main',
                color: '#8dbbff',
                iconUrl:
                    'https://cdn.example.test/wiki/agencies/sc/groups/sc-main/icon.webp?v=3',
                displayOrder: 0,
                isFallback: false,
                imageTransform: CONTAIN_TRANSFORM,
                mediaRevision: 3,
                idolIds: [6],
                idols: [{
                    id: 6,
                    agencyId: 6,
                    name: '樱木真乃',
                    folderName: 'sc_idol',
                    color: '#8dbbff',
                    wikiUrl: null,
                    wikiEnabled: true,
                    textColor: '#ffffff',
                    displayOrder: 0,
                    imageUrl:
                        'https://cdn.example.test/wiki/agencies/sc/idols/sc_idol/avatar.webp?v=4',
                    imageFit: 'cover',
                    imageTransform: COVER_TRANSFORM,
                    mediaRevision: 4,
                    entryKind: 'idol',
                    entrySubtype: null,
                    groupIds: [6]
                }]
            }]
        });
    });

    test('catalog writes create a dynamic agency and keep one idol in multiple groups', async () => {
        const fixture = createWikiFixture();
        const headers = {
            ...(await fixture.authHeaders('editor')),
            'Content-Type': 'application/json'
        };
        const createAgency = await fixture.app.request('/api/admin/wiki/agencies', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                code: 'future',
                name: '未来企划',
                color: '#123456'
            })
        });
        assert.equal(createAgency.status, 201);
        const agencyBody = await createAgency.json() as any;
        const agencyId = agencyBody.agency.id as number;
        const fallback = fixture.story.groups.find((group) =>
            group.agency_id === agencyId && group.is_fallback
        );
        assert.ok(fallback);

        const createGroup = await fixture.app.request(
            `/api/admin/wiki/agencies/${agencyId}/groups`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ code: 'unit-a', name: '组合 A', color: '#abcdef' })
            }
        );
        assert.equal(createGroup.status, 201);
        const group = (await createGroup.json() as any).group;

        const createUngroupedIdol = await fixture.app.request(
            `/api/admin/wiki/agencies/${agencyId}/idols`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: '无组合偶像',
                    folderName: 'no_group',
                    groupIds: []
                })
            }
        );
        assert.equal(createUngroupedIdol.status, 201);
        const ungroupedIdol = (await createUngroupedIdol.json() as any).idol;
        assert.deepEqual(ungroupedIdol.groupIds, []);

        const createIdol = await fixture.app.request(
            `/api/admin/wiki/agencies/${agencyId}/idols`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: '未来偶像',
                    folderName: 'future_idol',
                    color: '#fedcba',
                    wikiUrl: ' https://wiki.example.test/idols/future ',
                    entryKind: 'unit',
                    entrySubtype: null,
                    groupIds: [fallback.id, group.id]
                })
            }
        );
        assert.equal(createIdol.status, 201);
        const idol = (await createIdol.json() as any).idol;
        assert.deepEqual(idol.groupIds, [fallback.id, group.id]);
        assert.equal(idol.entryKind, 'unit');
        assert.equal(idol.entrySubtype, null);
        assert.equal(idol.wikiUrl, 'https://wiki.example.test/idols/future');

        const catalog = await fixture.app.request('/api/admin/wiki/catalog', {
            headers: await cookieFor(fixture)
        });
        const agency = (await catalog.json() as any).agencies.find(
            (candidate: any) => candidate.id === agencyId
        );
        assert.equal(agency.idols.length, 2);
        assert.deepEqual(
            agency.idols.find((candidate: any) => candidate.id === ungroupedIdol.id).groupIds,
            []
        );
        assert.deepEqual(
            agency.idols.find((candidate: any) => candidate.id === idol.id).groupIds,
            [fallback.id, group.id]
        );
        assert.deepEqual(
            agency.groups.filter((candidate: any) => candidate.idolIds.includes(idol.id))
                .map((candidate: any) => candidate.id),
            [fallback.id, group.id]
        );

        const updateIdol = await fixture.app.request(`/api/admin/wiki/idols/${idol.id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
                name: '未来偶像 改',
                wikiUrl: '',
                entryKind: 'story',
                entrySubtype: 'special',
                groupIds: [group.id]
            })
        });
        assert.equal(updateIdol.status, 200);
        const updatedIdol = (await updateIdol.json() as any).idol;
        assert.deepEqual(updatedIdol.groupIds, [group.id]);
        assert.equal(updatedIdol.entryKind, 'story');
        assert.equal(updatedIdol.entrySubtype, 'special');
        assert.equal(updatedIdol.wikiUrl, null);

        const invalidWikiUrl = await fixture.app.request(
            `/api/admin/wiki/agencies/${agencyId}/idols`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    name: '危险链接',
                    folderName: 'unsafe_link',
                    wikiUrl: 'javascript:alert(1)',
                    groupIds: []
                })
            }
        );
        assert.equal(invalidWikiUrl.status, 400);
        assert.match((await invalidWikiUrl.json() as any).msg, /HTTP 或 HTTPS/);

        const updateGroup = await fixture.app.request(`/api/admin/wiki/groups/${group.id}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ name: '组合 A 改' })
        });
        assert.equal(updateGroup.status, 200);
        assert.equal((await updateGroup.json() as any).group.name, '组合 A 改');

        const updateAgency = await fixture.app.request(`/api/admin/wiki/agencies/${agencyId}`, {
            method: 'PATCH',
            headers,
            body: JSON.stringify({ name: '未来企划 改' })
        });
        assert.equal(updateAgency.status, 200);
        assert.equal((await updateAgency.json() as any).agency.name, '未来企划 改');
    });

    test('deleting a group preserves its idols and stories as ungrouped content', async () => {
        const fixture = createWikiFixture();
        const headers = {
            ...(await fixture.authHeaders('editor')),
            'Content-Type': 'application/json'
        };
        const group = fixture.story.groups[5]!;
        const idol = fixture.story.idols[5]!;
        group.icon_object_key = 'wiki/agencies/sc/groups/sc-main/icons/delete-me.webp';
        group.icon_media_revision = 1;
        fixture.storage.seed(group.icon_object_key);
        fixture.story.seedStory({
            idol_id: idol.id,
            category: 'enzaP卡',
            card_name: '【保留剧情】'
        });

        const stale = await fixture.app.request(`/api/admin/wiki/groups/${group.id}`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ expectedRevision: 0 })
        });
        assert.equal(stale.status, 409);
        assert.deepEqual(await stale.json(), {
            status: 'error',
            msg: '栏目图标已被其他编辑更新，请刷新后重试',
            iconMediaRevision: 1
        });
        assert.ok(fixture.story.groups.some((candidate) => candidate.id === group.id));
        assert.ok(fixture.storage.objects.has(group.icon_object_key));

        const response = await fixture.app.request(`/api/admin/wiki/groups/${group.id}`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ expectedRevision: 1 })
        });

        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), { status: 'success' });
        assert.ok(fixture.story.idols.some((candidate) => candidate.id === idol.id));
        assert.ok(fixture.story.stories.some((story) => story.idol_id === idol.id));
        assert.deepEqual(
            fixture.story.members.filter((member) => member.idol_id === idol.id),
            []
        );
        assert.ok(!fixture.storage.objects.has(group.icon_object_key));
    });

    test('deleting an idol soft deletes its cards and sources while retaining media', async () => {
        const fixture = createWikiFixture();
        const headers = {
            ...(await fixture.authHeaders('editor')),
            'Content-Type': 'application/json'
        };
        const idol = fixture.story.idols[5]!;
        idol.avatar_object_key = 'wiki/agencies/sc/idols/sc_idol/avatar.webp';
        idol.avatar_media_revision = 3;
        fixture.storage.seed(idol.avatar_object_key);
        fixture.story.seedStory({
            idol_id: idol.id,
            category: 'enzaP卡',
            card_name: '【卡片一】'
        });
        fixture.story.seedStory({
            idol_id: idol.id,
            category: 'enzaP卡',
            card_name: '【卡片一】'
        });
        fixture.story.seedStory({
            idol_id: idol.id,
            category: 'enzaP卡',
            card_name: '【卡片二】'
        });

        const stale = await fixture.app.request(`/api/admin/wiki/idols/${idol.id}`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ expectedRevision: 2 })
        });
        assert.equal(stale.status, 409);
        assert.equal(fixture.story.deletedIdolIds.has(idol.id), false);

        const response = await fixture.app.request(`/api/admin/wiki/idols/${idol.id}`, {
            method: 'DELETE',
            headers,
            body: JSON.stringify({ expectedRevision: 3 })
        });
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
            status: 'success',
            softDeleted: { cards: 2, stories: 3 }
        });
        assert.equal(fixture.story.deletedIdolIds.has(idol.id), true);
        assert.ok(fixture.story.idols.some((candidate) => candidate.id === idol.id));
        assert.equal(fixture.story.stories.filter((story) => story.idol_id === idol.id).length, 3);
        assert.ok(fixture.storage.objects.has(idol.avatar_object_key));

        const catalog = await fixture.app.request('/api/admin/wiki/catalog', {
            headers: await cookieFor(fixture)
        });
        const agency = (await catalog.json() as any).agencies.find(
            (candidate: any) => candidate.id === idol.agency_id
        );
        assert.ok(!agency.idols.some((candidate: any) => candidate.id === idol.id));
    });

    test('an empty story category can be added explicitly for one idol', async () => {
        const fixture = createWikiFixture();
        const headers = {
            ...(await fixture.authHeaders('editor')),
            'Content-Type': 'application/json'
        };
        const response = await fixture.app.request(
            '/api/admin/wiki/agencies/6/idols/6/categories',
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: '活动剧情' })
            }
        );
        assert.equal(response.status, 201);
        const body = await response.json() as any;
        assert.equal(body.category.name, '活动剧情');
        assert.ok(body.category.storageSlug);
        assert.equal(body.category.showWhenEmpty, true);
        assert.ok((await fixture.story.listWikiCategories(6, 6)).some(
            (category) => category.name === '活动剧情'
        ));

        const duplicate = await fixture.app.request(
            '/api/admin/wiki/agencies/6/idols/6/categories',
            {
                method: 'POST',
                headers,
                body: JSON.stringify({ name: '活动剧情' })
            }
        );
        assert.equal(duplicate.status, 409);
        assert.match((await duplicate.json() as any).msg, /同名分类/);
    });

    test('selected idol stories expose database rows and managed category choices', async () => {
        const fixture = createWikiFixture();
        fixture.storage.publicReadUrlBase = 'https://cdn.example.test';
        fixture.story.idols[5]!.avatar_object_key =
            'wiki/agencies/sc/idols/sc_idol/avatar.webp';
        fixture.story.idols[5]!.avatar_media_revision = 4;
        fixture.storage.seed('wiki/agencies/sc/idols/sc_idol/avatar.webp');
        fixture.storage.seed(
            'wiki/agencies/sc/idols/sc_idol/story-images/custom/story image.webp'
        );
        fixture.story.seedStory({
            idol_id: 6,
            category: '自定义分类',
            card_name: '【动态剧情】',
            up_name: 'fixture-up',
            video_title: 'fixture-title',
            url: 'https://example.invalid/watch',
            subtitle: '第一话',
            image_file: 'custom/story image.webp',
            image_media_revision: 5
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
        assert.equal(
            body.idol.imageUrl,
            'https://cdn.example.test/wiki/agencies/sc/idols/sc_idol/avatar.webp?v=4'
        );
        assert.ok(body.categories.some((category: any) => category.name === 'enzaP卡'));
        assert.ok(body.categories.some((category: any) => category.name === '自定义分类'));
        assert.ok(body.contentTypes.some((option: any) => option.name === '剧情'));
        assert.ok(body.sourcePlatforms.some((option: any) => option.name === 'Bilibili'));
        assert.deepEqual(body.stories, [{
            id: 1,
            cardId: 1,
            category: '自定义分类',
            cardName: '【动态剧情】',
            upName: 'fixture-up',
            videoTitle: 'fixture-title',
            url: 'https://example.invalid/watch',
            contentTypeId: 1,
            contentTypeName: '剧情',
            sourcePlatformId: 1,
            sourcePlatformName: 'Bilibili',
            subtitle: '第一话',
            imageFile: 'custom/story image.webp',
            coverAssetId: null,
            coverAssetName: null,
            imageTransform: COVER_TRANSFORM,
            mediaRevision: 5,
            imageUrl: 'https://cdn.example.test/wiki/agencies/sc/idols/sc_idol/' +
                'story-images/custom/story%20image.webp?v=5'
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
