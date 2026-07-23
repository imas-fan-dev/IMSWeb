import { env } from 'cloudflare:workers';
import { applyD1Migrations, reset } from 'cloudflare:test';
import { beforeEach, describe, expect, it } from 'vitest';
import { assertJsonResponse } from '../contracts/runtime-contracts.js';
import { workerApp } from '@/worker';
import { R2ObjectStorage } from '@/adapters/cloudflare/r2-object-storage';
import type { WorkerBindings } from '@/adapters/cloudflare/worker-bindings';
import { categoryFolder } from '@/domains/wiki/service';

const bindings = env as Cloudflare.Env & WorkerBindings;
const VALID_PNG = Uint8Array.from(
    atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='),
    (character) => character.charCodeAt(0)
);

async function applyMigrations(): Promise<void> {
    await applyD1Migrations(bindings.CORE_DB, bindings.TEST_CORE_MIGRATIONS);
    await applyD1Migrations(bindings.STORY_DB, bindings.TEST_STORY_MIGRATIONS);
}

function decodeClaims(token: string): Record<string, unknown> {
    const part = token.split('.')[1];
    if (!part) throw new Error('JWT payload is missing');
    const normalized = part.replaceAll('-', '+').replaceAll('_', '/');
    return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as
        Record<string, unknown>;
}

function storyForm(
    fields: Partial<Record<'category_name' | 'card_name' | 'old_category_name' |
        'old_card_name' | 'up_name' | 'video_title' | 'url', string>>,
    image = false
): FormData {
    const form = new FormData();
    form.append('agency', '闪耀色彩');
    form.append('idol', '测试偶像');
    for (const [name, value] of Object.entries(fields)) {
        if (value !== undefined) form.append(name, value);
    }
    if (image) {
        form.append('image', new File(
            [Uint8Array.from(VALID_PNG).buffer],
            'story.png',
            { type: 'image/png' }
        ));
    }
    return form;
}

async function login(): Promise<{ token: string; headers: Record<string, string> }> {
    const response = await workerApp.request('http://ims.test/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'wiki-worker-op', password: 'worker-password' })
    }, bindings);
    expect(response.status).toBe(200);
    const token = (await response.json<{ token: string }>()).token;
    const csrf = decodeClaims(token).csrfSecret;
    if (typeof csrf !== 'string') throw new Error('JWT CSRF claim is missing');
    return {
        token,
        headers: { Cookie: `token=${token}`, 'X-CSRFToken': csrf }
    };
}

beforeEach(async () => {
    await reset();
});

describe('WIKI-01 Worker D1/R2 integration', () => {
    it('executes Cookie-authenticated add, edit, media read, story delete, and category delete', async () => {
        await applyMigrations();
        await bindings.CORE_DB.prepare(
            `INSERT INTO users (id, username, password, dept, producername)
             VALUES (71, 'wiki-worker-op', ?, 'op', 'Wiki Worker')`
        ).bind('$2b$04$1RWQGTyc2pruYfMggRdx7e2v3mef7H9H/hvipHXY9EF/S5VBPcYyK').run();
        await bindings.STORY_DB.batch([
            bindings.STORY_DB.prepare(
                `INSERT INTO agencies (id, code, name_cn, color)
                 VALUES (6, 'sc', '闪耀色彩', '#8dbbff')`
            ),
            bindings.STORY_DB.prepare(
                `INSERT INTO idols (id, agency_id, name_cn, folder_name, color)
                 VALUES (61, 6, '测试偶像', 'worker_idol', '#8dbbff')`
            )
        ]);
        const session = await login();
        const objectStorage = new R2ObjectStorage(bindings.CORE_DB, bindings.MEDIA_BUCKET);

        await objectStorage.put(
            'Wiki/static/icon/sc.webp',
            Uint8Array.of(82, 50),
            { contentType: 'image/webp' }
        );
        const staticIcon = await workerApp.request(
            'http://ims.test/icon/sc.webp',
            undefined,
            bindings
        );
        expect(staticIcon.status).toBe(200);
        expect(staticIcon.headers.get('content-type')).toBe('image/webp');
        expect(new Uint8Array(await staticIcon.arrayBuffer())).toEqual(Uint8Array.of(82, 50));

        await assertJsonResponse(
            await workerApp.request('http://ims.test/api/wiki/save_story_layout', {
                method: 'POST',
                headers: session.headers
            }, bindings),
            200,
            { status: 'success' },
            'Worker Wiki authenticated layout write'
        );
        await assertJsonResponse(
            await workerApp.request('http://ims.test/api/wiki/save_story_layout', {
                method: 'POST',
                headers: { Authorization: session.token, 'X-CSRFToken': session.headers['X-CSRFToken']! }
            }, bindings),
            401,
            { status: 'error', msg: '未登录，请先登录' },
            'Worker Wiki rejects Authorization-only write'
        );
        await assertJsonResponse(
            await workerApp.request('http://ims.test/api/wiki/save_story_layout', {
                method: 'POST',
                headers: { Cookie: `token=${session.token}`, 'X-CSRFToken': 'wrong' }
            }, bindings),
            403,
            { status: 'error', msg: 'CSRF token 无效，请刷新页面重试' },
            'Worker Wiki rejects CSRF mismatch'
        );

        const idolMedia = new FormData();
        idolMedia.append('agency', '闪耀色彩');
        idolMedia.append('idol', '测试偶像');
        idolMedia.append('image', new File(
            [Uint8Array.from(VALID_PNG).buffer],
            'idol.png',
            { type: 'image/png' }
        ));
        const idolMediaUpload = await workerApp.request('http://ims.test/api/wiki/idol-media', {
            method: 'POST',
            headers: session.headers,
            body: idolMedia
        }, bindings);
        expect(idolMediaUpload.status).toBe(200);
        expect(await idolMediaUpload.json()).toMatchObject({
            status: 'success',
            url: expect.stringContaining('/image/')
        });
        const idolMediaKey = 'Data/sc/worker_idol/icon.webp';
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM object_index WHERE logical_key=?'
        ).bind(idolMediaKey).first<string>('state')).toBe('ready');

        const mediaCatalog = await workerApp.request(
            'http://ims.test/api/wiki/idol-media',
            undefined,
            bindings
        );
        expect(mediaCatalog.status).toBe(200);
        const mediaCatalogBody = await mediaCatalog.json<{
            agencies: Array<{ code: string; idols: Array<{ name: string; source: string }> }>;
        }>();
        expect(mediaCatalogBody.agencies.find((agency) => agency.code === 'sc')?.idols).toContainEqual({
            name: '测试偶像',
            imageFit: 'cover',
            imageUrl: '/image/%E9%97%AA%E8%80%80%E8%89%B2%E5%BD%A9/%E6%B5%8B%E8%AF%95%E5%81%B6%E5%83%8F/icon.webp',
            source: 'object-storage'
        });

        const idolMediaRead = await workerApp.request(
            `http://ims.test/image/${encodeURIComponent('闪耀色彩')}/${encodeURIComponent('测试偶像')}/icon.webp`,
            undefined,
            bindings
        );
        expect(idolMediaRead.status).toBe(200);
        expect(idolMediaRead.headers.get('content-type')).toBe('image/webp');

        await assertJsonResponse(
            await workerApp.request('http://ims.test/api/wiki/idol-media', {
                method: 'DELETE',
                headers: { ...session.headers, 'Content-Type': 'application/json' },
                body: JSON.stringify({ agency: '闪耀色彩', idol: '测试偶像' })
            }, bindings),
            200,
            { status: 'success' },
            'Worker Wiki delete idol media'
        );
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM object_index WHERE logical_key=?'
        ).bind(idolMediaKey).first<string>('state')).toBe('deleted');

        const add = await workerApp.request('http://ims.test/api/wiki/add_story', {
            method: 'POST',
            headers: session.headers,
            body: storyForm({
                category_name: '测试分类',
                card_name: '【Worker 原始】',
                up_name: 'Worker UP',
                video_title: 'Worker Video',
                url: 'https://example.com/original | 原始副标题'
            }, true)
        }, bindings);
        await assertJsonResponse(add, 200, { status: 'success' }, 'Worker Wiki add story');

        const inserted = await bindings.STORY_DB.prepare(
            `SELECT id, category, card_name, image_file
             FROM story_cards WHERE idol_id=61`
        ).first<{ id: number; category: string; card_name: string; image_file: string }>();
        expect(inserted).toMatchObject({ category: '测试分类', card_name: '【Worker 原始】' });
        expect(inserted?.image_file).toMatch(/\.webp$/);
        const originalKey = `Data/sc/worker_idol/${inserted!.image_file}`;
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM object_index WHERE logical_key=?'
        ).bind(originalKey).first<string>('state')).toBe('ready');

        const imagePath = `/image/${encodeURIComponent('闪耀色彩')}/${encodeURIComponent('测试偶像')}/${
            inserted!.image_file.split('/').map(encodeURIComponent).join('/')}`;
        const image = await workerApp.request(`http://ims.test${imagePath}`, undefined, bindings);
        expect(image.status).toBe(200);
        expect(image.headers.get('content-type')).toBe('image/webp');
        const imageLength = Number(image.headers.get('content-length'));
        expect(imageLength).toBeGreaterThan(0);
        const head = await workerApp.request(`http://ims.test${imagePath}`, { method: 'HEAD' }, bindings);
        expect(head.status).toBe(200);
        expect(head.headers.get('content-length')).toBe(String(imageLength));
        expect((await head.arrayBuffer()).byteLength).toBe(0);

        const edit = await workerApp.request('http://ims.test/api/wiki/edit_story', {
            method: 'POST',
            headers: session.headers,
            body: storyForm({
                old_category_name: '测试分类',
                old_card_name: '【Worker 原始】',
                category_name: '移动分类',
                card_name: '【Worker 修改】',
                up_name: 'Updated UP',
                video_title: 'Updated Video',
                url: 'https://example.com/updated | 更新副标题'
            })
        }, bindings);
        await assertJsonResponse(edit, 200, { status: 'success' }, 'Worker Wiki edit story');

        const edited = await bindings.STORY_DB.prepare(
            `SELECT category, card_name, image_file FROM story_cards WHERE id=?`
        ).bind(inserted!.id).first<{ category: string; card_name: string; image_file: string }>();
        expect(edited).toMatchObject({ category: '移动分类', card_name: '【Worker 修改】' });
        expect(edited?.image_file).not.toBe(inserted!.image_file);
        const movedKey = `Data/sc/worker_idol/${edited!.image_file}`;
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM object_index WHERE logical_key=?'
        ).bind(originalKey).first<string>('state')).toBe('deleted');
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM object_index WHERE logical_key=?'
        ).bind(movedKey).first<string>('state')).toBe('ready');

        await assertJsonResponse(
            await workerApp.request('http://ims.test/api/wiki/delete_story', {
                method: 'POST',
                headers: session.headers,
                body: storyForm({ category_name: '移动分类', card_name: '【Worker 修改】' })
            }, bindings),
            200,
            { status: 'success' },
            'Worker Wiki delete story'
        );
        expect(await bindings.STORY_DB.prepare(
            'SELECT COUNT(*) AS count FROM story_cards'
        ).first<number>('count')).toBe(0);
        expect(await bindings.STORY_DB.prepare(
            'SELECT COUNT(*) AS count FROM story_links'
        ).first<number>('count')).toBe(0);
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM object_index WHERE logical_key=?'
        ).bind(movedKey).first<string>('state')).toBe('deleted');

        for (const category of ['foo', 'foobar']) {
            await assertJsonResponse(
                await workerApp.request('http://ims.test/api/wiki/add_story', {
                    method: 'POST',
                    headers: session.headers,
                    body: storyForm({ category_name: category, card_name: `【${category}】` }, true)
                }, bindings),
                200,
                { status: 'success' },
                `Worker Wiki ${category} category fixture add`
            );
        }
        const categoryRows = await bindings.STORY_DB.prepare(
            `SELECT category, image_file FROM story_cards
             WHERE category IN ('foo', 'foobar') ORDER BY category`
        ).all<{ category: string; image_file: string }>();
        const imageFiles = new Map(categoryRows.results.map((row) => [row.category, row.image_file]));
        const fooKey = `Data/sc/worker_idol/${imageFiles.get('foo')}`;
        const foobarKey = `Data/sc/worker_idol/${imageFiles.get('foobar')}`;
        const categoryPrefix = `Data/sc/worker_idol/${categoryFolder('foo')}`;
        const orphanKey = `${categoryPrefix}/unreferenced.webp`;
        await objectStorage.put(
            orphanKey,
            Uint8Array.of(1, 2, 3),
            { contentType: 'image/webp' }
        );
        await assertJsonResponse(
            await workerApp.request('http://ims.test/api/wiki/delete_category', {
                method: 'POST',
                headers: session.headers,
                body: storyForm({ category_name: 'foo' })
            }, bindings),
            200,
            { status: 'success' },
            'Worker Wiki delete category'
        );
        expect(await bindings.STORY_DB.prepare(
            "SELECT COUNT(*) AS count FROM story_cards WHERE category='foo'"
        ).first<number>('count')).toBe(0);
        expect(await bindings.STORY_DB.prepare(
            "SELECT COUNT(*) AS count FROM story_cards WHERE category='foobar'"
        ).first<number>('count')).toBe(1);
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM object_index WHERE logical_key=?'
        ).bind(fooKey).first<string>('state')).toBe('deleted');
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM object_index WHERE logical_key=?'
        ).bind(orphanKey).first<string>('state')).toBe('deleted');
        expect(await bindings.CORE_DB.prepare(
            'SELECT state FROM object_index WHERE logical_key=?'
        ).bind(foobarKey).first<string>('state')).toBe('ready');

        const wiki = await workerApp.request('http://ims.test/wiki/', undefined, bindings);
        expect(wiki.status).toBe(200);
        expect(await wiki.text()).toContain('闪耀色彩');
        const story = await workerApp.request(
            `http://ims.test/story?agency=${encodeURIComponent('闪耀色彩')}&idol=${encodeURIComponent('测试偶像')}`,
            undefined,
            bindings
        );
        expect(story.status).toBe(200);
        expect(await story.text()).toContain('测试偶像');
    });
});
