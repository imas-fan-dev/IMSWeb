import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import {
    createWikiFixture,
    formFields,
    postForm,
    postMultipart,
    uploadedPng,
    type WikiFixture
} from './fixture';
import { categoryStorageSlug } from '@/domains/wiki/service';

const WRITE_ENDPOINTS = [
    { method: 'POST', path: '/api/wiki/add_story' },
    { method: 'POST', path: '/api/wiki/edit_story' },
    { method: 'POST', path: '/api/wiki/delete_story' },
    { method: 'POST', path: '/api/wiki/delete_category' },
    { method: 'POST', path: '/api/wiki/parse_bilibili' },
    { method: 'POST', path: '/api/admin/wiki/agencies' },
    { method: 'PATCH', path: '/api/admin/wiki/agencies/6' },
    { method: 'POST', path: '/api/admin/wiki/agencies/6/groups' },
    { method: 'PATCH', path: '/api/admin/wiki/groups/6' },
    { method: 'DELETE', path: '/api/admin/wiki/groups/6' },
    { method: 'POST', path: '/api/admin/wiki/agencies/6/idols' },
    { method: 'PATCH', path: '/api/admin/wiki/idols/6' },
    { method: 'DELETE', path: '/api/admin/wiki/idols/6' },
    { method: 'PUT', path: '/api/admin/wiki/agencies/6/icon' },
    { method: 'PUT', path: '/api/admin/wiki/groups/6/icon' },
    { method: 'PUT', path: '/api/admin/wiki/idols/6/avatar' },
    { method: 'PUT', path: '/api/admin/wiki/agencies/6/layout' },
    { method: 'DELETE', path: '/api/admin/wiki/stories/1' },
    { method: 'PATCH', path: '/api/admin/wiki/categories/1' },
    { method: 'POST', path: '/api/admin/wiki/agencies/6/idols/6/categories' },
    { method: 'PATCH', path: '/api/admin/wiki/cards/1' },
    { method: 'POST', path: '/api/admin/wiki/cards/1/sources' },
    { method: 'POST', path: '/api/admin/wiki/agencies/6/story-cover-assets' },
    { method: 'PATCH', path: '/api/admin/wiki/story-cover-assets/1' },
    { method: 'DELETE', path: '/api/admin/wiki/story-cover-assets/1' },
    { method: 'POST', path: '/api/admin/wiki/story-content-types' },
    { method: 'PATCH', path: '/api/admin/wiki/story-content-types/1' },
    { method: 'DELETE', path: '/api/admin/wiki/story-content-types/1' },
    { method: 'POST', path: '/api/admin/wiki/story-source-platforms' },
    { method: 'PATCH', path: '/api/admin/wiki/story-source-platforms/1' },
    { method: 'DELETE', path: '/api/admin/wiki/story-source-platforms/1' },
    { method: 'POST', path: '/api/wiki/agency-icon' },
    { method: 'DELETE', path: '/api/wiki/agency-icon' },
    { method: 'POST', path: '/api/wiki/idol-media' },
    { method: 'DELETE', path: '/api/wiki/idol-media' }
];

async function json(response: Response) {
    return response.json() as Promise<{ status: string; msg?: string }>;
}

async function putMultipart(
    fixture: WikiFixture,
    path: string,
    upload: Parameters<WikiFixture['setUpload']>[0],
    headers: Record<string, string>
) {
    fixture.setUpload(upload);
    return fixture.app.request(path, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'multipart/form-data; boundary=wiki-fixture' },
        body: '--wiki-fixture--'
    });
}

async function patchMultipart(
    fixture: WikiFixture,
    path: string,
    upload: Parameters<WikiFixture['setUpload']>[0],
    headers: Record<string, string>
) {
    fixture.setUpload(upload);
    return fixture.app.request(path, {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'multipart/form-data; boundary=wiki-fixture' },
        body: '--wiki-fixture--'
    });
}

function seedOriginal(fixture: WikiFixture) {
    const imageFile = 'original/old.webp';
    const key = `wiki/agencies/sc/idols/sc_idol/story-images/${imageFile}`;
    const row = fixture.story.seedStory({
        idol_id: 6,
        category: '测试分类',
        card_name: '【existing】',
        up_name: 'old-up',
        video_title: 'old-title',
        url: 'https://example.invalid/old',
        image_file: imageFile
    });
    fixture.storage.seed(key, new Uint8Array([1, 2, 3]));
    fixture.story.categories.push({
        id: 100,
        agency_id: 6,
        idol_id: 6,
        name: '测试分类',
        storage_slug: categoryStorageSlug('测试分类'),
        background_eligible: false,
        display_order: 1,
        show_when_empty: true
    });
    return { row, key };
}

describe('Wiki Cookie JWT, role and Header-to-claim CSRF contract', () => {
    test('all writes reject missing Cookie JWT, even with valid Authorization JWT', async () => {
        const fixture = createWikiFixture();
        const bearer = await fixture.auth('op');
        for (const endpoint of WRITE_ENDPOINTS) {
            const missing = await fixture.app.request(endpoint.path, { method: endpoint.method });
            assert.equal(missing.status, 401, `${endpoint.path} must reject an anonymous write`);
            assert.deepEqual(await json(missing), { status: 'error', msg: '未登录，请先登录' });

            const authorizationOnly = await fixture.app.request(endpoint.path, {
                method: endpoint.method,
                headers: {
                    Authorization: `Bearer ${bearer.token}`,
                    'X-CSRFToken': bearer.csrf,
                    'Content-Type': 'application/json'
                },
                body: '{}'
            });
            assert.equal(authorizationOnly.status, 401, `${endpoint.path} must not accept Authorization-only Wiki writes`);
            assert.deepEqual(await json(authorizationOnly), { status: 'error', msg: '未登录，请先登录' });
        }
    });

    test('JWT claim CSRF is required and unapproved roles stay forbidden', async () => {
        const fixture = createWikiFixture();
        const editor = await fixture.auth('editor', 'claim-csrf');
        for (const endpoint of WRITE_ENDPOINTS) {
            const missing = await fixture.app.request(endpoint.path, {
                method: endpoint.method,
                headers: { Cookie: `token=${editor.token}` }
            });
            assert.equal(missing.status, 403, `${endpoint.path} must reject missing CSRF`);
            assert.deepEqual(await json(missing), {
                status: 'error',
                msg: 'CSRF token 无效，请刷新页面重试'
            });

            const wrong = await fixture.app.request(endpoint.path, {
                method: endpoint.method,
                headers: { Cookie: `token=${editor.token}`, 'X-CSRFToken': 'wrong-token' }
            });
            assert.equal(wrong.status, 403, `${endpoint.path} must reject a CSRF/claim mismatch`);
            assert.deepEqual(await json(wrong), {
                status: 'error',
                msg: 'CSRF token 无效，请刷新页面重试'
            });
        }

        const viewer = await fixture.auth('viewer');
        const forbidden = await fixture.app.request('/api/admin/wiki/agencies/6/layout', {
            method: 'PUT',
            headers: { Cookie: `token=${viewer.token}`, 'X-CSRFToken': viewer.csrf }
        });
        assert.equal(forbidden.status, 403);
        assert.deepEqual(await json(forbidden), { status: 'error', msg: '无权限执行此操作' });

        const malformed = await fixture.app.request('/api/admin/wiki/agencies/6/layout', {
            method: 'PUT',
            headers: { Cookie: 'token=not-a-jwt', 'X-CSRFToken': 'anything' }
        });
        assert.equal(malformed.status, 401);
        assert.deepEqual(await json(malformed), { status: 'error', msg: '未登录，请先登录' });
    });

    test('editor and op Cookie JWTs can write with only the matching CSRF header', async () => {
        const fixture = createWikiFixture();
        for (const role of ['editor', 'op']) {
            const headers = await fixture.authHeaders(role);
            assert.match(headers.Cookie, /^token=/);
            assert.doesNotMatch(headers.Cookie, /csrf_token=/);
            const cardName = `【${role}-card】`;
            const response = await postMultipart(fixture, '/api/wiki/add_story', {
                fields: formFields({ card_name: cardName }),
                files: { image: uploadedPng('valid-png', `${role}.png`) }
            }, headers);
            assert.equal(response.status, 200);
            assert.deepEqual(await response.json(), { status: 'success', sourceCount: 1 });
            assert.ok(fixture.story.stories.some((row) => row.card_name === cardName));
        }
        assert.equal(fixture.story.stories.length, 2);
        assert.equal(fixture.storage.objects.size, 2);

        const saveLayout = await fixture.app.request('/api/admin/wiki/agencies/6/layout', {
            method: 'PUT',
            headers: {
                ...await fixture.authHeaders('editor'),
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                expectedRevision: 0,
                groups: [{ id: 6, idolIds: [6] }]
            })
        });
        assert.equal(saveLayout.status, 200);
        assert.deepEqual(await saveLayout.json(), {
            status: 'success',
            layoutRevision: 1
        });
    });
});

describe('Wiki agency icon object storage contract', () => {
    test('upload publishes a versioned catalog icon and delete removes it', async () => {
        const fixture = createWikiFixture();
        const headers = await fixture.authHeaders('editor');

        const initial = await fixture.app.request('/api/wiki/catalog?agency=sc');
        assert.equal(initial.status, 200);
        assert.equal((await initial.json() as any).selection.agency.iconUrl, null);

        const upload = await postMultipart(fixture, '/api/wiki/agency-icon', {
            fields: { agency: '闪耀色彩' },
            files: { image: uploadedPng() }
        }, headers);
        assert.equal(upload.status, 200);
        assert.deepEqual(await upload.json(), {
            status: 'success',
            url: '/icon/agencies/6.webp'
        });
        const key = 'wiki/agencies/sc/branding/icon.webp';
        assert.ok(fixture.storage.objects.has(key));

        const published = await fixture.app.request('/api/wiki/catalog?agency=sc');
        assert.equal(
            (await published.json() as any).selection.agency.iconUrl,
            '/icon/agencies/6.webp'
        );
        const served = await fixture.app.request('/icon/agencies/6.webp');
        assert.equal(served.status, 200);
        assert.equal(served.headers.get('Content-Type'), 'image/webp');

        const deletion = await fixture.app.request('/api/wiki/agency-icon', {
            method: 'DELETE',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ agency: '闪耀色彩' })
        });
        assert.equal(deletion.status, 200);
        assert.deepEqual(await json(deletion), { status: 'success' });
        assert.ok(!fixture.storage.objects.has(key));

        const reverted = await fixture.app.request('/api/wiki/catalog?agency=sc');
        assert.equal((await reverted.json() as any).selection.agency.iconUrl, null);
    });
});

describe('Wiki idol media object storage contract', () => {
    test('upload switches the catalog to object storage and delete clears the association', async () => {
        const fixture = createWikiFixture();
        fixture.story.idols[5]!.folder_name = 'sakuragi_mano';
        const headers = await fixture.authHeaders('editor');

        const initial = await fixture.app.request('/api/wiki/idol-media');
        assert.equal(initial.status, 200);
        const initialBody = await initial.json() as any;
        const initialMano = initialBody.agencies
            .find((agency: any) => agency.code === 'sc').idols
            .find((idol: any) => idol.name === '樱木真乃');
        assert.equal(initialMano.source, 'none');
        assert.equal(initialMano.imageUrl, '');

        const upload = await postMultipart(fixture, '/api/wiki/idol-media', {
            fields: { agency: '闪耀色彩', idol: '樱木真乃' },
            files: { image: uploadedPng() }
        }, headers);
        assert.equal(upload.status, 200);
        assert.equal((await json(upload)).status, 'success');
        const key = 'wiki/agencies/sc/idols/sakuragi_mano/avatar.webp';
        assert.ok(fixture.storage.objects.has(key));

        const stored = await fixture.app.request('/api/wiki/idol-media');
        const storedBody = await stored.json() as any;
        const storedMano = storedBody.agencies
            .find((agency: any) => agency.code === 'sc').idols
            .find((idol: any) => idol.name === '樱木真乃');
        assert.equal(storedMano.source, 'object-storage');
        assert.equal(storedMano.imageUrl, '/image/%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9/%E6%A8%B1%E6%9C%A8%E7%9C%9F%E4%B9%83/icon.webp');

        const deletion = await fixture.app.request('/api/wiki/idol-media', {
            method: 'DELETE',
            headers: { ...headers, 'Content-Type': 'application/json' },
            body: JSON.stringify({ agency: '闪耀色彩', idol: '樱木真乃' })
        });
        assert.equal(deletion.status, 200);
        assert.deepEqual(await json(deletion), { status: 'success' });
        assert.ok(!fixture.storage.objects.has(key));

        const reverted = await fixture.app.request('/api/wiki/idol-media');
        const revertedBody = await reverted.json() as any;
        const revertedMano = revertedBody.agencies
            .find((agency: any) => agency.code === 'sc').idols
            .find((idol: any) => idol.name === '樱木真乃');
        assert.equal(revertedMano.source, 'none');
    });
});

describe('Wiki agency story cover asset contract', () => {
    test('one uploaded asset can back a card and cannot be deleted while referenced', async () => {
        const fixture = createWikiFixture();
        fixture.storage.publicReadUrlBase = 'https://cdn.example.test';
        const headers = await fixture.authHeaders('editor');
        const upload = await postMultipart(
            fixture,
            '/api/admin/wiki/agencies/6/story-cover-assets',
            {
                fields: { name: '共用主线封面' },
                files: { image: uploadedPng('shared-cover', 'shared.png') }
            },
            headers
        );
        assert.equal(upload.status, 200);
        const uploaded = await upload.json() as any;
        assert.equal(uploaded.asset.name, '共用主线封面');
        assert.match(uploaded.asset.imageUrl, /^https:\/\/cdn\.example\.test\//);
        assert.doesNotMatch(uploaded.asset.imageUrl, /\/api\/wiki\/story-cover-assets\//);
        assert.match(
            fixture.story.coverAssets[0]!.object_key,
            /^wiki\/agencies\/sc\/story-cover-assets\/[0-9a-f-]+\.webp$/
        );

        const created = await postMultipart(fixture, '/api/wiki/add_story', {
            fields: {
                agency: '闪耀色彩',
                idol: '樱木真乃',
                category_name: 'enzaP卡',
                card_name: '【共享素材卡片】',
                up_name: '来源',
                video_title: '标题',
                url: 'https://example.test/shared',
                content_type_id: '1',
                source_platform_id: '2',
                cover_asset_id: String(uploaded.asset.id)
            },
            files: {}
        }, headers);
        assert.equal(created.status, 200);

        const stories = await fixture.app.request(
            `/api/admin/wiki/stories?agency=${encodeURIComponent('闪耀色彩')}` +
            `&idol=${encodeURIComponent('樱木真乃')}`,
            { headers }
        );
        const story = (await stories.json() as any).stories[0];
        assert.equal(story.coverAssetId, uploaded.asset.id);
        assert.equal(story.coverAssetName, '共用主线封面');
        assert.match(story.imageUrl, /^https:\/\/cdn\.example\.test\//);
        assert.doesNotMatch(story.imageUrl, /\/api\/wiki\/story-cover-assets\//);

        const publicStories = await fixture.app.request(
            `/api/wiki/stories?agency=${encodeURIComponent('闪耀色彩')}` +
            `&idol=${encodeURIComponent('樱木真乃')}`
        );
        assert.equal(publicStories.status, 200);
        const publicCard = (await publicStories.json() as any).categories
            .flatMap((category: any) => category.cards)
            .find((card: any) => card.name === '【共享素材卡片】');
        assert.ok(publicCard);
        assert.match(publicCard.img, /^https:\/\/cdn\.example\.test\//);
        assert.doesNotMatch(publicCard.img, /\/api\/wiki\/story-cover-assets\//);

        const inUse = await fixture.app.request(
            `/api/admin/wiki/story-cover-assets/${uploaded.asset.id}`,
            { method: 'DELETE', headers }
        );
        assert.equal(inUse.status, 409);

        const unbind = await patchMultipart(
            fixture,
            `/api/admin/wiki/cards/${story.cardId}`,
            {
                fields: {
                    agency: '闪耀色彩',
                    idol: '樱木真乃',
                    category_id: '6',
                    card_name: '【共享素材卡片】',
                    subtitle: '',
                    expected_revision: '0',
                    cover_asset_id: '',
                    remove_image: 'true'
                },
                files: {}
            },
            headers
        );
        assert.equal(unbind.status, 200);
        const deleted = await fixture.app.request(
            `/api/admin/wiki/story-cover-assets/${uploaded.asset.id}`,
            { method: 'DELETE', headers }
        );
        assert.equal(deleted.status, 200);
        assert.equal(fixture.story.coverAssets.length, 0);
        assert.equal(fixture.storage.objects.size, 0);
    });

    test('asset upload fails cleanly when a direct public read URL is unavailable', async () => {
        const fixture = createWikiFixture();
        const response = await postMultipart(
            fixture,
            '/api/admin/wiki/agencies/6/story-cover-assets',
            {
                fields: { name: '不可直读素材' },
                files: { image: uploadedPng('shared-cover', 'shared.png') }
            },
            await fixture.authHeaders('editor')
        );

        assert.equal(response.status, 503);
        assert.match((await response.json() as any).msg, /公开对象读取地址/);
        assert.equal(fixture.story.coverAssets.length, 0);
        assert.equal(fixture.storage.objects.size, 0);
    });
});

describe('Wiki entity media revision and transform contract', () => {
    const transformFields = {
        image_fit: 'cover',
        image_focal_x: '0.25',
        image_focal_y: '0.75',
        image_zoom: '1.5',
        image_rotation: '90',
        expected_revision: '0'
    };

    test('agency, group and idol uploads use unique objects and persist transforms', async () => {
        const cases = [
            {
                path: '/api/admin/wiki/agencies/6/icon',
                objectPrefix: 'wiki/agencies/sc/branding/icons/',
                objectKey: (fixture: WikiFixture) => fixture.story.agencies[5]!.icon_object_key,
                revision: (fixture: WikiFixture) =>
                    fixture.story.agencies[5]!.icon_media_revision
            },
            {
                path: '/api/admin/wiki/groups/6/icon',
                objectPrefix: 'wiki/agencies/sc/groups/sc-main/icons/',
                objectKey: (fixture: WikiFixture) => fixture.story.groups[5]!.icon_object_key,
                revision: (fixture: WikiFixture) =>
                    fixture.story.groups[5]!.icon_media_revision
            },
            {
                path: '/api/admin/wiki/idols/6/avatar',
                objectPrefix: 'wiki/agencies/sc/idols/sc_idol/avatars/',
                objectKey: (fixture: WikiFixture) => fixture.story.idols[5]!.avatar_object_key,
                revision: (fixture: WikiFixture) =>
                    fixture.story.idols[5]!.avatar_media_revision
            }
        ] as const;

        for (const item of cases) {
            const fixture = createWikiFixture();
            const response = await putMultipart(fixture, item.path, {
                fields: transformFields,
                files: { image: uploadedPng() }
            }, await fixture.authHeaders('editor'));

            assert.equal(response.status, 200, item.path);
            const body = await response.json() as any;
            assert.equal(body.status, 'success');
            assert.equal(body.mediaRevision, 1);
            assert.match(body.url, /\?v=1$/);
            assert.deepEqual(body.imageTransform, {
                fit: 'cover',
                focalX: 0.25,
                focalY: 0.75,
                zoom: 1.5,
                rotation: 90
            });
            const objectKey = item.objectKey(fixture);
            assert.equal(typeof objectKey, 'string');
            assert.match(objectKey!, new RegExp(`^${item.objectPrefix}[0-9a-f-]+\\.webp$`));
            assert.ok(fixture.storage.objects.has(objectKey!));
            assert.equal(item.revision(fixture), 1);
        }
    });

    test('transform-only save increments the revision without rewriting the object', async () => {
        const fixture = createWikiFixture();
        const idol = fixture.story.idols[5]!;
        idol.avatar_object_key = 'wiki/agencies/sc/idols/sc_idol/avatars/existing.webp';
        fixture.storage.seed(idol.avatar_object_key);

        const response = await putMultipart(fixture, '/api/admin/wiki/idols/6/avatar', {
            fields: transformFields,
            files: {}
        }, await fixture.authHeaders('editor'));

        assert.equal(response.status, 200);
        assert.equal((await response.json() as any).mediaRevision, 1);
        assert.equal(idol.avatar_object_key, 'wiki/agencies/sc/idols/sc_idol/avatars/existing.webp');
        assert.equal(idol.avatar_zoom, 1.5);
        assert.deepEqual(fixture.storage.puts, []);
        assert.deepEqual(fixture.storage.deletes, []);
    });

    test('stale upload is rejected and its uncommitted object is cleaned', async () => {
        const fixture = createWikiFixture();
        fixture.story.groups[5]!.icon_media_revision = 2;

        const response = await putMultipart(fixture, '/api/admin/wiki/groups/6/icon', {
            fields: transformFields,
            files: { image: uploadedPng() }
        }, await fixture.authHeaders('op'));

        assert.equal(response.status, 409);
        assert.deepEqual(await response.json(), {
            status: 'error',
            msg: '媒体已被其他编辑更新，请刷新后重试',
            mediaRevision: 2
        });
        assert.equal(fixture.storage.puts.length, 1);
        assert.deepEqual(fixture.storage.deletes, fixture.storage.puts);
        assert.equal(fixture.storage.objects.size, 0);
        assert.equal(fixture.story.groups[5]!.icon_object_key, null);
    });

    test('invalid transform fails before object and repository writes', async () => {
        const fixture = createWikiFixture();
        const response = await putMultipart(fixture, '/api/admin/wiki/agencies/6/icon', {
            fields: { ...transformFields, image_zoom: '3.1' },
            files: { image: uploadedPng() }
        }, await fixture.authHeaders('editor'));

        assert.equal(response.status, 400);
        assert.deepEqual(await json(response), { status: 'error', msg: '图片缩放无效' });
        assert.equal(fixture.story.agencies[5]!.icon_media_revision, 0);
        assert.equal(fixture.storage.objects.size, 0);
        assert.deepEqual(fixture.storage.puts, []);
    });
});

describe('Wiki upload validation and compensation contract', () => {
    test('invalid, MIME-mismatched, forged and undecodable images fail before database/object writes', async () => {
        const cases = [
            {
                name: 'unsupported extension',
                file: { filename: 'payload.txt', contentType: 'text/plain', body: new TextEncoder().encode('not-image') },
                message: '图片格式不支持'
            },
            {
                name: 'extension and MIME mismatch',
                file: { filename: 'payload.png', contentType: 'image/jpeg', body: new TextEncoder().encode('valid-png') },
                message: '图片扩展名与 MIME 类型不匹配'
            },
            {
                name: 'forged image bytes',
                file: uploadedPng('forged-png', 'payload.png'),
                message: '图片内容与文件格式不匹配'
            },
            {
                name: 'undecodable image bytes',
                file: uploadedPng('broken', 'payload.png'),
                message: '图片内容损坏或无法解码'
            }
        ];
        for (const item of cases) {
            const fixture = createWikiFixture();
            const response = await postMultipart(fixture, '/api/wiki/add_story', {
                fields: formFields({ card_name: `【${item.name}】` }),
                files: { image: item.file }
            }, await fixture.authHeaders('op'));
            assert.equal(response.status, 400, item.name);
            assert.deepEqual(await json(response), { status: 'error', msg: item.message });
            assert.equal(fixture.story.stories.length, 0, `${item.name} must not write a row`);
            assert.equal(fixture.storage.objects.size, 0, `${item.name} must not write an object`);
        }
    });

    test('oversized multipart is rejected before the upload parser', async () => {
        const fixture = createWikiFixture();
        const response = await fixture.app.request('/api/wiki/add_story', {
            method: 'POST',
            headers: {
                ...await fixture.authHeaders('op'),
                'Content-Type': 'multipart/form-data; boundary=wiki-fixture',
                'Content-Length': '1025'
            },
            body: 'x'
        });
        assert.equal(response.status, 413);
        assert.deepEqual(await json(response), { status: 'error', msg: '上传文件超过大小限制' });
        assert.equal(fixture.uploads.calls.length, 0);
        assert.equal(fixture.story.stories.length, 0);
        assert.equal(fixture.storage.objects.size, 0);
    });

    test('partial object write and insert commit failure both clean the new object', async () => {
        for (const failure of ['partial-put', 'insert-commit'] as const) {
            const fixture = createWikiFixture();
            if (failure === 'partial-put') fixture.storage.failNextPutAfterWrite = true;
            else fixture.story.failNextInsert = true;
            const response = await postMultipart(fixture, '/api/wiki/add_story', {
                fields: formFields({ card_name: `【${failure}】` }),
                files: { image: uploadedPng() }
            }, await fixture.authHeaders('op'));
            assert.equal(response.status, 500, failure);
            assert.deepEqual(await json(response), { status: 'error', msg: '保存剧情失败' });
            assert.equal(fixture.story.stories.length, 0);
            assert.equal(fixture.storage.objects.size, 0, `${failure} must compensate the new object`);
            assert.equal(fixture.storage.puts.length, 1);
            assert.deepEqual(fixture.storage.deletes, fixture.storage.puts);
        }
    });

    test('conflicting add keeps the winning card and cleans the uncommitted upload', async () => {
        const fixture = createWikiFixture();
        const original = seedOriginal(fixture);
        const response = await postMultipart(fixture, '/api/wiki/add_story', {
            fields: formFields({
                category_name: '测试分类',
                card_name: '【existing】'
            }),
            files: { image: uploadedPng() }
        }, await fixture.authHeaders('editor'));

        assert.equal(response.status, 409);
        assert.deepEqual(await json(response), {
            status: 'error',
            msg: '该卡片已存在，请在卡片编辑中更新图片或副标题'
        });
        assert.equal(fixture.story.stories.length, 1);
        assert.equal(fixture.story.stories[0]!.image_file, original.row.image_file);
        assert.ok(fixture.storage.objects.has(original.key));
        assert.equal(fixture.storage.objects.size, 1);
        assert.equal(fixture.storage.puts.length, 1);
        assert.deepEqual(fixture.storage.deletes, fixture.storage.puts);
    });

    test('edit commit failure removes the replacement and preserves the old row/object', async () => {
        const fixture = createWikiFixture();
        const original = seedOriginal(fixture);
        fixture.story.failNextUpdate = true;
        const response = await postMultipart(fixture, '/api/wiki/edit_story', {
            fields: formFields({
                category_name: '测试分类',
                card_name: '【updated】',
                old_category_name: '测试分类',
                old_card_name: '【existing】'
            }),
            files: { image: uploadedPng() }
        }, await fixture.authHeaders('editor'));
        assert.equal(response.status, 500);
        assert.deepEqual(await json(response), { status: 'error', msg: '修改剧情失败' });
        assert.equal(fixture.story.stories.length, 1);
        assert.equal(fixture.story.stories[0]!.card_name, '【existing】');
        assert.equal(fixture.story.stories[0]!.image_file, 'original/old.webp');
        assert.ok(fixture.storage.objects.has(original.key));
        assert.equal(fixture.storage.objects.size, 1);
        assert.equal(fixture.storage.puts.length, 1);
        assert.ok(fixture.storage.deletes.includes(fixture.storage.puts[0]!));
        assert.ok(!fixture.storage.deletes.includes(original.key));
    });
});

describe('Wiki CRUD ordering and media cleanup contract', () => {
    test('a card can be created, read, and retained without source entries', async () => {
        const fixture = createWikiFixture();
        const headers = await fixture.authHeaders('editor');
        const create = await postMultipart(fixture, '/api/wiki/add_story', {
            fields: formFields({
                card_name: '【待补来源】',
                subtitle: '仅卡片资料',
                sources_json: '[]'
            }),
            files: {}
        }, headers);

        assert.equal(create.status, 200);
        assert.deepEqual(await create.json(), { status: 'success', sourceCount: 0 });
        assert.equal(fixture.story.stories.length, 0);
        assert.equal(fixture.story.cards.length, 1);

        const admin = await fixture.app.request(
            `/api/admin/wiki/stories?agency=${encodeURIComponent('闪耀色彩')}` +
            `&idol=${encodeURIComponent('樱木真乃')}`,
            { headers }
        );
        assert.equal(admin.status, 200);
        const adminBody = await admin.json() as any;
        assert.equal(adminBody.stories.length, 0);
        assert.deepEqual(adminBody.cards.map((card: any) => ({
            cardName: card.cardName,
            subtitle: card.subtitle
        })), [{ cardName: '【待补来源】', subtitle: '仅卡片资料' }]);

        const publicResponse = await fixture.app.request(
            `/api/wiki/stories?agency=${encodeURIComponent('闪耀色彩')}` +
            `&idol=${encodeURIComponent('樱木真乃')}`
        );
        assert.equal(publicResponse.status, 200);
        const publicBody = await publicResponse.json() as any;
        const card = publicBody.categories
            .flatMap((category: any) => category.cards)
            .find((candidate: any) => candidate.name === '【待补来源】');
        assert.ok(card);
        assert.deepEqual(card.links, []);
    });

    test('one card request creates multiple sources and source deletion retains the empty card', async () => {
        const fixture = createWikiFixture();
        const headers = await fixture.authHeaders('editor');
        const sources = [
            {
                upName: '来源一',
                videoTitle: '第一视角',
                url: 'https://example.invalid/source-1'
            },
            {
                upName: '来源二',
                videoTitle: '第二视角',
                url: 'https://example.invalid/source-2'
            }
        ];
        const create = await postMultipart(fixture, '/api/wiki/add_story', {
            fields: formFields({
                card_name: '【批量来源】',
                subtitle: '卡片备注',
                sources_json: JSON.stringify(sources)
            }),
            files: { image: uploadedPng() }
        }, headers);

        assert.equal(create.status, 200);
        assert.deepEqual(await create.json(), { status: 'success', sourceCount: 2 });
        assert.equal(fixture.story.stories.length, 2);
        assert.equal(fixture.story.stories[0]!.card_id, fixture.story.stories[1]!.card_id);
        assert.deepEqual(
            fixture.story.stories.map((story) => ({
                upName: story.up_name,
                videoTitle: story.video_title,
                url: story.url,
                subtitle: story.subtitle
            })),
            sources.map((source) => ({ ...source, subtitle: '卡片备注' }))
        );
        const imageFile = fixture.story.stories[0]!.image_file!;
        const imageKey = `wiki/agencies/sc/idols/sc_idol/story-images/${imageFile}`;
        assert.ok(fixture.storage.objects.has(imageKey));

        const firstDelete = await fixture.app.request(
            `/api/admin/wiki/stories/${fixture.story.stories[0]!.id}` +
            `?agency=${encodeURIComponent('闪耀色彩')}` +
            `&idol=${encodeURIComponent('樱木真乃')}&expectedRevision=0`,
            { method: 'DELETE', headers }
        );
        assert.equal(firstDelete.status, 200);
        assert.deepEqual(await firstDelete.json(), {
            status: 'success',
            cardDeleted: false,
            mediaRevision: 0
        });
        assert.equal(fixture.story.stories.length, 1);
        assert.ok(fixture.storage.objects.has(imageKey));

        const lastDelete = await fixture.app.request(
            `/api/admin/wiki/stories/${fixture.story.stories[0]!.id}` +
            `?agency=${encodeURIComponent('闪耀色彩')}` +
            `&idol=${encodeURIComponent('樱木真乃')}&expectedRevision=0`,
            {
                method: 'DELETE',
                headers: { ...headers, 'Content-Type': 'application/json' }
            }
        );
        assert.equal(lastDelete.status, 200);
        assert.deepEqual(await lastDelete.json(), {
            status: 'success',
            cardDeleted: false,
            mediaRevision: 0
        });
        assert.equal(fixture.story.stories.length, 0);
        assert.equal(fixture.story.cards.length, 1);
        assert.ok(fixture.storage.objects.has(imageKey));
    });

    test('source deletion guards media revision and cleans exact unreferenced legacy images', async () => {
        const fixture = createWikiFixture();
        const first = fixture.story.seedStory({
            idol_id: 6,
            category: '测试分类',
            card_name: '【迁移卡片】',
            image_file: 'runtime/current.webp',
            image_media_revision: 2,
            legacy_image_file: 'legacy/first.webp'
        });
        const second = fixture.story.seedStory({
            idol_id: 6,
            category: '测试分类',
            card_name: '【迁移卡片】',
            image_file: 'runtime/current.webp',
            image_media_revision: 2,
            legacy_image_file: 'legacy/second.webp'
        });
        const keyOf = (imageFile: string) =>
            `wiki/agencies/sc/idols/sc_idol/story-images/${imageFile}`;
        const currentKey = keyOf('runtime/current.webp');
        const firstLegacyKey = keyOf('legacy/first.webp');
        const secondLegacyKey = keyOf('legacy/second.webp');
        fixture.storage.seed(currentKey);
        fixture.storage.seed(firstLegacyKey);
        fixture.storage.seed(secondLegacyKey);
        const headers = {
            ...await fixture.authHeaders('editor'),
            'Content-Type': 'application/json'
        };
        const request = (storyId: number, expectedRevision: number) => fixture.app.request(
            `/api/admin/wiki/stories/${storyId}`,
            {
                method: 'DELETE',
                headers,
                body: JSON.stringify({
                    agency: '闪耀色彩',
                    idol: '樱木真乃',
                    expectedRevision
                })
            }
        );

        const stale = await request(first.id, 1);
        assert.equal(stale.status, 409);
        assert.deepEqual(await stale.json(), {
            status: 'error',
            msg: '卡片已被其他编辑更新，请刷新后重试',
            mediaRevision: 2
        });
        assert.deepEqual(fixture.storage.deletes, []);

        const firstDelete = await request(first.id, 2);
        assert.equal(firstDelete.status, 200);
        assert.deepEqual(await firstDelete.json(), {
            status: 'success',
            cardDeleted: false,
            mediaRevision: 2
        });
        assert.ok(!fixture.storage.objects.has(firstLegacyKey));
        assert.ok(fixture.storage.objects.has(currentKey));
        assert.ok(fixture.storage.objects.has(secondLegacyKey));

        const lastDelete = await request(second.id, 2);
        assert.equal(lastDelete.status, 200);
        assert.deepEqual(await lastDelete.json(), {
            status: 'success',
            cardDeleted: false,
            mediaRevision: 2
        });
        assert.ok(fixture.storage.objects.has(currentKey));
        assert.ok(!fixture.storage.objects.has(secondLegacyKey));
    });

    test('successful replacement edit deletes the old object, then delete_story removes the replacement', async () => {
        const fixture = createWikiFixture();
        const original = seedOriginal(fixture);
        const headers = await fixture.authHeaders('editor');
        const edit = await postMultipart(fixture, '/api/wiki/edit_story', {
            fields: formFields({
                category_name: '测试分类',
                card_name: '【updated】',
                old_category_name: '测试分类',
                old_card_name: '【existing】'
            }),
            files: { image: uploadedPng() }
        }, headers);
        assert.equal(edit.status, 200);
        assert.deepEqual(await json(edit), { status: 'success' });
        assert.equal(fixture.story.stories.length, 1);
        assert.equal(fixture.story.stories[0]!.card_name, '【updated】');
        assert.ok(!fixture.storage.objects.has(original.key));
        const replacementKey = `wiki/agencies/sc/idols/sc_idol/story-images/${fixture.story.stories[0]!.image_file}`;
        assert.ok(fixture.storage.objects.has(replacementKey));

        const deletion = await postForm(fixture, '/api/wiki/delete_story', formFields({
            category_name: '测试分类',
            card_name: '【updated】'
        }), headers);
        assert.equal(deletion.status, 200);
        assert.deepEqual(await json(deletion), { status: 'success' });
        assert.equal(fixture.story.stories.length, 0);
        assert.ok(!fixture.storage.objects.has(replacementKey));
    });

    test('delete_story and delete_category commit failures preserve their old rows and objects', async () => {
        for (const operation of ['story', 'category'] as const) {
            const fixture = createWikiFixture();
            const original = seedOriginal(fixture);
            if (operation === 'story') fixture.story.failNextDeleteStory = true;
            else fixture.story.failNextDeleteCategory = true;
            const path = operation === 'story' ? '/api/wiki/delete_story' : '/api/wiki/delete_category';
            const response = await postForm(fixture, path, formFields({
                category_name: '测试分类',
                card_name: '【existing】'
            }), await fixture.authHeaders('op'));
            assert.equal(response.status, 500, operation);
            assert.equal(fixture.story.stories.length, 1, `${operation} commit failure must preserve the row`);
            assert.ok(fixture.storage.objects.has(original.key), `${operation} commit failure must preserve the object`);
            assert.deepEqual(fixture.storage.deletes, []);
        }
    });

    test('cleanup failure after a successful database delete does not resurrect the row', async (t) => {
        const logged = t.mock.method(console, 'error', () => undefined);
        const fixture = createWikiFixture();
        const original = seedOriginal(fixture);
        fixture.storage.failDeleteKeys.add(original.key);
        const response = await postForm(fixture, '/api/wiki/delete_story', formFields({
            category_name: '测试分类',
            card_name: '【existing】'
        }), await fixture.authHeaders('op'));
        assert.equal(response.status, 200);
        assert.deepEqual(await json(response), { status: 'success' });
        assert.equal(fixture.story.stories.length, 0);
        assert.ok(fixture.storage.objects.has(original.key), 'failed retryable cleanup may leave the old object');
        assert.deepEqual(fixture.storage.deletes, [original.key]);
        assert.equal(logged.mock.callCount(), 1);
    });

    test('post-commit cleanup still succeeds when object deletion and compensation enqueue both fail', async (t) => {
        const logged = t.mock.method(console, 'error', () => undefined);
        const fixture = createWikiFixture();
        const original = seedOriginal(fixture);
        const jobs: Array<{ kind: string; payload: unknown }> = [];
        fixture.storage.failDeleteKeys.add(original.key);
        fixture.services.compensation = {
            async enqueue(kind, payload) {
                jobs.push({ kind, payload });
                throw new Error('injected compensation journal failure');
            },
            async run() {}
        };

        const response = await postForm(fixture, '/api/wiki/delete_story', formFields({
            category_name: '测试分类',
            card_name: '【existing】'
        }), await fixture.authHeaders('op'));

        assert.equal(response.status, 200);
        assert.deepEqual(await json(response), { status: 'success' });
        assert.equal(fixture.story.stories.length, 0);
        assert.ok(fixture.storage.objects.has(original.key));
        assert.deepEqual(jobs, [{ kind: 'delete-object', payload: { key: original.key } }]);
        assert.equal(logged.mock.callCount(), 1);
        assert.match(String(logged.mock.calls[0]?.arguments[0]), /committed Wiki object/);
    });

    test('category cleanup enumerates unreferenced prefix objects and compensates each failed key', async () => {
        const fixture = createWikiFixture();
        const original = seedOriginal(fixture);
        const prefix = `wiki/agencies/sc/idols/sc_idol/story-images/${categoryStorageSlug('测试分类')}`;
        const orphanKey = `${prefix}/unreferenced.webp`;
        const jobs: Array<{ kind: string; payload: unknown }> = [];
        fixture.storage.seed(orphanKey);
        fixture.storage.failDeleteKeys.add(orphanKey);
        fixture.services.compensation = {
            async enqueue(kind, payload) {
                jobs.push({ kind, payload });
                return `job-${jobs.length}`;
            },
            async run() {}
        };

        const response = await postForm(fixture, '/api/wiki/delete_category', formFields({
            category_name: '测试分类'
        }), await fixture.authHeaders('op'));

        assert.equal(response.status, 200);
        assert.deepEqual(await json(response), { status: 'success' });
        assert.equal(fixture.story.stories.length, 0);
        assert.ok(!fixture.storage.objects.has(original.key));
        assert.ok(fixture.storage.objects.has(orphanKey));
        assert.ok(fixture.storage.deletes.includes(orphanKey));
        assert.deepEqual(jobs, [{ kind: 'delete-object', payload: { key: orphanKey } }]);
    });

    test('category cleanup does not cross a sibling directory prefix', async () => {
        const fixture = createWikiFixture();
        const foo = fixture.story.seedStory({
            idol_id: 6,
            category: 'foo',
            card_name: '【foo】',
            image_file: 'foo/foo.webp'
        });
        const foobar = fixture.story.seedStory({
            idol_id: 6,
            category: 'foobar',
            card_name: '【foobar】',
            image_file: 'foobar/foobar.webp'
        });
        const fooKey = `wiki/agencies/sc/idols/sc_idol/story-images/${foo.image_file}`;
        const foobarKey = `wiki/agencies/sc/idols/sc_idol/story-images/${foobar.image_file}`;
        fixture.storage.seed(fooKey);
        fixture.storage.seed(foobarKey);

        const response = await postForm(fixture, '/api/wiki/delete_category', formFields({
            category_name: 'foo'
        }), await fixture.authHeaders('op'));

        assert.equal(response.status, 200);
        assert.deepEqual(await json(response), { status: 'success' });
        assert.deepEqual(fixture.story.stories.map((story) => story.category), ['foobar']);
        assert.ok(!fixture.storage.objects.has(fooKey));
        assert.ok(fixture.storage.objects.has(foobarKey));
        assert.ok(!fixture.storage.deletes.includes(foobarKey));
    });

    test('category move copies before commit, deletes old after commit, and category delete cleans the copy', async () => {
        const fixture = createWikiFixture();
        const original = seedOriginal(fixture);
        const headers = await fixture.authHeaders('editor');
        const edit = await postMultipart(fixture, '/api/wiki/edit_story', {
            fields: formFields({
                category_name: '新分类',
                card_name: '【moved】',
                old_category_name: '测试分类',
                old_card_name: '【existing】'
            }),
            files: {}
        }, headers);
        assert.equal(edit.status, 200);
        assert.equal(fixture.storage.copies.length, 1);
        assert.equal(fixture.storage.copies[0]!.source, original.key);
        const movedKey = fixture.storage.copies[0]!.destination;
        const prefix = movedKey.slice(0, movedKey.lastIndexOf('/'));
        const orphanKey = `${prefix}/unreferenced.webp`;
        fixture.storage.seed(orphanKey);
        assert.ok(!fixture.storage.objects.has(original.key));
        assert.ok(fixture.storage.objects.has(movedKey));
        assert.equal(fixture.story.stories[0]!.category, '新分类');
        assert.equal(
            `wiki/agencies/sc/idols/sc_idol/story-images/${fixture.story.stories[0]!.image_file}`,
            movedKey
        );

        const deletion = await postForm(fixture, '/api/wiki/delete_category', formFields({
            category_name: '新分类'
        }), headers);
        assert.equal(deletion.status, 200);
        assert.equal(fixture.story.stories.length, 0);
        assert.ok(!fixture.storage.objects.has(movedKey));
        assert.ok(!fixture.storage.objects.has(orphanKey));
        assert.ok(fixture.storage.deletes.includes(orphanKey));
    });

    test('category-move commit failure cleans the copy and preserves the original', async () => {
        const fixture = createWikiFixture();
        const original = seedOriginal(fixture);
        fixture.story.failNextUpdate = true;
        const edit = await postMultipart(fixture, '/api/wiki/edit_story', {
            fields: formFields({
                category_name: '新分类',
                card_name: '【moved】',
                old_category_name: '测试分类',
                old_card_name: '【existing】'
            }),
            files: {}
        }, await fixture.authHeaders('editor'));
        assert.equal(edit.status, 500);
        assert.equal(fixture.storage.copies.length, 1);
        assert.ok(fixture.storage.objects.has(original.key));
        assert.ok(!fixture.storage.objects.has(fixture.storage.copies[0]!.destination));
        assert.equal(fixture.story.stories[0]!.category, '测试分类');
        assert.equal(fixture.story.stories[0]!.card_name, '【existing】');
    });
});

describe('Wiki category and card secondary edit contract', () => {
    test('dedicated source append targets only an existing card at its current revision', async () => {
        const fixture = createWikiFixture();
        const original = seedOriginal(fixture);
        const headers = {
            ...await fixture.authHeaders('editor'),
            'Content-Type': 'application/json'
        };
        const sources = [
            { upName: '追加一', videoTitle: '追加标题一', url: 'https://example.invalid/add-1' },
            { upName: '追加二', videoTitle: '追加标题二', url: 'https://example.invalid/add-2' }
        ];
        const append = await fixture.app.request(
            `/api/admin/wiki/cards/${original.row.card_id}/sources`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    agency: '闪耀色彩',
                    idol: '樱木真乃',
                    expectedRevision: 0,
                    sources
                })
            }
        );
        assert.equal(append.status, 200);
        assert.deepEqual(await append.json(), {
            status: 'success',
            sourceCount: 2,
            mediaRevision: 0
        });
        assert.equal(fixture.story.stories.length, 3);
        assert.ok(fixture.story.stories.every((story) =>
            story.card_id === original.row.card_id
        ));

        const missing = await fixture.app.request('/api/admin/wiki/cards/99999/sources', {
            method: 'POST',
            headers,
            body: JSON.stringify({
                agency: '闪耀色彩',
                idol: '樱木真乃',
                expectedRevision: 0,
                sources: [sources[0]]
            })
        });
        assert.equal(missing.status, 404);
        assert.equal(fixture.story.stories.length, 3);

        await fixture.story.setStoryImage('sc', original.row.id, 'replacement/current.webp');
        const stale = await fixture.app.request(
            `/api/admin/wiki/cards/${original.row.card_id}/sources`,
            {
                method: 'POST',
                headers,
                body: JSON.stringify({
                    agency: '闪耀色彩',
                    idol: '樱木真乃',
                    expectedRevision: 0,
                    sources: [sources[0]]
                })
            }
        );
        assert.equal(stale.status, 409);
        assert.deepEqual(await stale.json(), {
            status: 'error',
            msg: '卡片已被其他编辑更新，请刷新后重试',
            mediaRevision: 1
        });
        assert.equal(fixture.story.stories.length, 3);
    });

    test('category rename validates the selected idol and preserves its storage slug', async () => {
        const fixture = createWikiFixture();
        const category = fixture.story.categories[5]!;
        const originalName = category.name;
        const originalSlug = category.storage_slug;
        fixture.story.categories.push({
            ...category,
            idol_id: 66,
            display_order: 0
        });
        const headers = {
            ...await fixture.authHeaders('editor'),
            'Content-Type': 'application/json'
        };
        const response = await fixture.app.request(
            `/api/admin/wiki/categories/${category.id}`,
            {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    agencyId: 6,
                    idolId: 6,
                    name: '重命名分类',
                    expectedName: originalName
                })
            }
        );

        assert.equal(response.status, 200);
        const body = await response.json() as any;
        assert.equal(body.category.name, '重命名分类');
        assert.equal(body.category.storageSlug, originalSlug);
        assert.deepEqual(
            fixture.story.categories
                .filter((candidate) => candidate.id === category.id)
                .map((candidate) => candidate.name),
            ['重命名分类', '重命名分类']
        );

        const stale = await fixture.app.request(
            `/api/admin/wiki/categories/${category.id}`,
            {
                method: 'PATCH',
                headers,
                body: JSON.stringify({
                    agencyId: 6,
                    idolId: 6,
                    name: '过期分类名',
                    expectedName: originalName
                })
            }
        );
        assert.equal(stale.status, 409);
        assert.deepEqual(await stale.json(), {
            status: 'error',
            msg: '分类已被其他编辑更新，请刷新后重试',
            currentName: '重命名分类'
        });
        assert.ok(fixture.story.categories
            .filter((candidate) => candidate.id === category.id)
            .every((candidate) =>
                candidate.name === '重命名分类' && candidate.storage_slug === originalSlug
            ));

        const unrelated = await fixture.app.request('/api/admin/wiki/categories/1', {
            method: 'PATCH',
            headers,
            body: JSON.stringify({
                agencyId: 6,
                idolId: 6,
                name: '越权分类',
                expectedName: '不存在分类'
            })
        });
        assert.equal(unrelated.status, 404);
        assert.deepEqual(await unrelated.json(), {
            status: 'error',
            msg: '分类不属于所选内容页'
        });
    });

    test('card edit moves its image and metadata while preserving every source', async () => {
        const fixture = createWikiFixture();
        const original = seedOriginal(fixture);
        const second = fixture.story.seedStory({
            idol_id: 6,
            category: '测试分类',
            card_name: '【existing】',
            up_name: 'second-up',
            video_title: 'second-title',
            url: 'https://example.invalid/second'
        });
        fixture.story.categories.push({
            id: 101,
            agency_id: 6,
            idol_id: 6,
            name: '目标分类',
            storage_slug: 'target_category',
            background_eligible: false,
            display_order: 2,
            show_when_empty: true
        });
        const response = await patchMultipart(
            fixture,
            `/api/admin/wiki/cards/${original.row.card_id}`,
            {
                fields: formFields({
                    category_id: '101',
                    card_name: '【二次编辑】',
                    subtitle: '卡片级副标题',
                    expected_revision: '0',
                    image_fit: 'contain',
                    image_focal_x: '0.25',
                    image_focal_y: '0.75',
                    image_zoom: '1.5',
                    image_rotation: '90'
                }),
                files: {}
            },
            await fixture.authHeaders('editor')
        );

        assert.equal(response.status, 200);
        assert.equal(fixture.storage.copies.length, 1);
        assert.equal(fixture.storage.copies[0]!.source, original.key);
        const copiedKey = fixture.storage.copies[0]!.destination;
        assert.match(copiedKey, /\/story-images\/target_category\//);
        assert.ok(!fixture.storage.objects.has(original.key));
        assert.ok(fixture.storage.objects.has(copiedKey));
        assert.deepEqual(
            fixture.story.stories.map((story) => ({
                id: story.id,
                up: story.up_name,
                title: story.video_title,
                url: story.url,
                category: story.category,
                cardName: story.card_name,
                subtitle: story.subtitle,
                revision: story.image_media_revision
            })),
            [
                {
                    id: original.row.id,
                    up: 'old-up',
                    title: 'old-title',
                    url: 'https://example.invalid/old',
                    category: '目标分类',
                    cardName: '【二次编辑】',
                    subtitle: '卡片级副标题',
                    revision: 1
                },
                {
                    id: second.id,
                    up: 'second-up',
                    title: 'second-title',
                    url: 'https://example.invalid/second',
                    category: '目标分类',
                    cardName: '【二次编辑】',
                    subtitle: '卡片级副标题',
                    revision: 1
                }
            ]
        );

        const stale = await patchMultipart(
            fixture,
            `/api/admin/wiki/cards/${original.row.card_id}`,
            {
                fields: formFields({
                    category_id: '101',
                    card_name: '【过期写入】',
                    expected_revision: '0'
                }),
                files: {}
            },
            await fixture.authHeaders('op')
        );
        assert.equal(stale.status, 409);
        assert.deepEqual(await stale.json(), {
            status: 'error',
            msg: '卡片已被其他编辑更新，请刷新后重试',
            mediaRevision: 1
        });
        assert.ok(fixture.story.stories.every((story) =>
            story.card_name === '【二次编辑】'
        ));
    });

    test('card image replacement and failed category move preserve object consistency', async () => {
        const replacementFixture = createWikiFixture();
        const replacement = seedOriginal(replacementFixture);
        const replaced = await patchMultipart(
            replacementFixture,
            `/api/admin/wiki/cards/${replacement.row.card_id}`,
            {
                fields: formFields({
                    category_id: '100',
                    expected_revision: '0',
                    image_zoom: '2'
                }),
                files: { image: uploadedPng() }
            },
            await replacementFixture.authHeaders('editor')
        );
        assert.equal(replaced.status, 200);
        assert.ok(!replacementFixture.storage.objects.has(replacement.key));
        assert.equal(replacementFixture.storage.puts.length, 1);
        assert.ok(replacementFixture.storage.objects.has(
            replacementFixture.storage.puts[0]!
        ));
        assert.equal(replacementFixture.story.stories[0]!.image_zoom, 2);

        const failedFixture = createWikiFixture();
        const failed = seedOriginal(failedFixture);
        failedFixture.story.categories.push({
            id: 101,
            agency_id: 6,
            idol_id: 6,
            name: '目标分类',
            storage_slug: 'target_category',
            background_eligible: false,
            display_order: 2,
            show_when_empty: true
        });
        failedFixture.story.failNextUpdate = true;
        const failure = await patchMultipart(
            failedFixture,
            `/api/admin/wiki/cards/${failed.row.card_id}`,
            {
                fields: formFields({
                    category_id: '101',
                    expected_revision: '0'
                }),
                files: {}
            },
            await failedFixture.authHeaders('editor')
        );
        assert.equal(failure.status, 500);
        assert.equal(failedFixture.storage.copies.length, 1);
        assert.ok(failedFixture.storage.objects.has(failed.key));
        assert.ok(!failedFixture.storage.objects.has(
            failedFixture.storage.copies[0]!.destination
        ));
        assert.equal(failedFixture.story.stories[0]!.category, '测试分类');
    });
});
