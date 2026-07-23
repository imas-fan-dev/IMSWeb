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
import { categoryFolder } from '@/domains/wiki/service';

const WRITE_ENDPOINTS = [
    { method: 'POST', path: '/api/wiki/add_story' },
    { method: 'POST', path: '/api/wiki/edit_story' },
    { method: 'POST', path: '/api/wiki/delete_story' },
    { method: 'POST', path: '/api/wiki/delete_category' },
    { method: 'POST', path: '/api/wiki/parse_bilibili' },
    { method: 'POST', path: '/api/wiki/save_story_layout' },
    { method: 'POST', path: '/api/wiki/idol-media' },
    { method: 'POST', path: '/api/wiki/idol-media/import-legacy' },
    { method: 'DELETE', path: '/api/wiki/idol-media' }
];

async function json(response: Response) {
    return response.json() as Promise<{ status: string; msg?: string }>;
}

function seedOriginal(fixture: WikiFixture) {
    const imageFile = 'original/old.webp';
    const key = `Data/sc/sc_idol/${imageFile}`;
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
        const forbidden = await fixture.app.request('/api/wiki/save_story_layout', {
            method: 'POST',
            headers: { Cookie: `token=${viewer.token}`, 'X-CSRFToken': viewer.csrf }
        });
        assert.equal(forbidden.status, 403);
        assert.deepEqual(await json(forbidden), { status: 'error', msg: '无权限执行此操作' });

        const malformed = await fixture.app.request('/api/wiki/save_story_layout', {
            method: 'POST',
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
            assert.deepEqual(await json(response), { status: 'success' });
            assert.ok(fixture.story.stories.some((row) => row.card_name === cardName));
        }
        assert.equal(fixture.story.stories.length, 2);
        assert.equal(fixture.storage.objects.size, 2);

        const saveLayout = await fixture.app.request('/api/wiki/save_story_layout', {
            method: 'POST',
            headers: await fixture.authHeaders('editor')
        });
        assert.equal(saveLayout.status, 200);
        assert.deepEqual(await json(saveLayout), { status: 'success' });
    });
});

describe('Wiki idol media object storage contract', () => {
    test('upload switches the catalog to object storage and delete restores the legacy fallback', async () => {
        const fixture = createWikiFixture();
        fixture.story.idols[5]!.folder_name = 'sakuragi_mano';
        const headers = await fixture.authHeaders('editor');

        const initial = await fixture.app.request('/api/wiki/idol-media');
        assert.equal(initial.status, 200);
        const initialBody = await initial.json() as any;
        const initialMano = initialBody.agencies
            .find((agency: any) => agency.code === 'sc').idols
            .find((idol: any) => idol.name === '樱木真乃');
        assert.equal(initialMano.source, 'legacy-character');
        assert.equal(initialMano.imageUrl, '/assets/images/Production/283Mano.png');

        const upload = await postMultipart(fixture, '/api/wiki/idol-media', {
            fields: { agency: '闪耀色彩', idol: '樱木真乃' },
            files: { image: uploadedPng() }
        }, headers);
        assert.equal(upload.status, 200);
        assert.equal((await json(upload)).status, 'success');
        const key = 'Data/sc/sakuragi_mano/icon.webp';
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
        assert.equal(revertedMano.source, 'legacy-character');
    });

    test('legacy import copies exact character art and skips agency-logo fallbacks', async () => {
        const fixture = createWikiFixture();
        fixture.story.idols[0]!.folder_name = 'amami_haruka';
        fixture.story.idols[5]!.folder_name = 'sakuragi_mano';
        fixture.services.staticAssets = {
            async fetch(request: Request) {
                const path = new URL(request.url).pathname;
                return path.startsWith('/assets/images/')
                    ? new Response(new TextEncoder().encode('valid-png'), { headers: { 'Content-Type': 'image/png' } })
                    : new Response('not found', { status: 404 });
            }
        };

        const response = await fixture.app.request('/api/wiki/idol-media/import-legacy', {
            method: 'POST',
            headers: await fixture.authHeaders('op')
        });
        assert.equal(response.status, 200);
        const body = await response.json() as any;
        assert.equal(body.status, 'success');
        assert.equal(body.imported, 6);
        assert.equal(body.skipped, 0);
        assert.deepEqual(body.failed, []);
        assert.ok(fixture.storage.objects.has('Data/765/amami_haruka/icon.webp'));
        assert.ok(fixture.storage.objects.has('Data/sc/sakuragi_mano/icon.webp'));
        assert.ok(fixture.storage.objects.has('Data/cg/cg_idol/icon.webp'));
        assert.ok(fixture.storage.objects.has('Data/ml/ml_idol/icon.webp'));
        assert.ok(fixture.storage.objects.has('Data/sidem/sidem_idol/icon.webp'));
        assert.ok(fixture.storage.objects.has('Data/gk/gk_idol/icon.webp'));
        assert.equal(fixture.storage.objects.size, 6);
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
        const replacementKey = `Data/sc/sc_idol/${fixture.story.stories[0]!.image_file}`;
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
        const prefix = `Data/sc/sc_idol/${categoryFolder('测试分类')}`;
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
        const fooKey = `Data/sc/sc_idol/${foo.image_file}`;
        const foobarKey = `Data/sc/sc_idol/${foobar.image_file}`;
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
        assert.equal(`Data/sc/sc_idol/${fixture.story.stories[0]!.image_file}`, movedKey);

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
