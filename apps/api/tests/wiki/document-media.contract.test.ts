import { postgresTest as test } from '../postgres-test-database';
import assert from 'node:assert/strict';
import { describe } from 'vitest';
import { defaultWikiImageTransform } from '@imsweb/contracts/wiki';
import {
    adminWikiEntryDocumentMediaUploadSchema,
    adminWikiEntryDocumentSaveSchema,
    adminWikiEntryDocumentSchema,
} from '@imsweb/contracts/wiki';
import {
    adminWikiEntryDocumentMediaPath,
    adminWikiEntryDocumentPath,
    adminWikiPath,
    wikiPath,
} from '@imsweb/contracts/paths';
import { createHonoApp } from '@/app';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlStoryRepository } from '@/infra/db/repositories/story-repository';
import { queryAll, queryOne } from '@/infra/db/sql/query';
import { readContractJson } from '../contracts/contract-json';
import { createPostgresTestDatabase } from '../postgres-test-database';
import {
    FixtureImageProcessor,
    FixtureUploadParser,
    MemoryObjectStorage,
} from './fixture';

const CSRF_TOKEN = 'csrf-secret';
const ACCESS_COOKIE = 'ims_admin_access=backoffice-token';
const PUBLIC_MEDIA_BASE = 'https://media.test';

type TestDatabase = Awaited<ReturnType<typeof createPostgresTestDatabase>>;

function createServices(repository: SqlStoryRepository, storage: MemoryObjectStorage) {
    storage.publicReadUrlBase = PUBLIC_MEDIA_BASE;
    const images = new FixtureImageProcessor();
    const uploads = new FixtureUploadParser();
    const app = createHonoApp(() => ({
        story: repository,
        storage,
        images,
        uploads,
        backofficeTokens: {
            sign: async () => 'backoffice-token',
            verify: async () => ({
                id: 1,
                username: 'operator',
                producername: 'Operator',
                dept: 'op' as const,
                adminRole: 'admin' as const,
                csrfSecret: CSRF_TOKEN,
            }),
        },
    }));
    return { app, images, uploads };
}

function uploadImage(
    uploads: FixtureUploadParser,
    filename = 'shot.png',
    body = 'valid-png'
) {
    uploads.next = {
        fields: { alt_text: '剧情截图' },
        files: {
            image: {
                filename,
                contentType: 'image/png',
                body: new TextEncoder().encode(body),
            },
        },
    };
}

function adminRequest(
    app: ReturnType<typeof createHonoApp>,
    method: string,
    pathname: string,
    body?: unknown
) {
    return app.request(`http://wiki.test${pathname}`, {
        method,
        headers: {
            Cookie: ACCESS_COOKIE,
            'X-CSRFToken': CSRF_TOKEN,
            'Content-Type': 'application/json',
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
}

function publicStoriesPath(agency: string, idol: string) {
    return `${wikiPath('/stories')}?agency=${encodeURIComponent(agency)}&idol=${encodeURIComponent(idol)}`;
}

async function seedProject(database: TestDatabase, suffix: string) {
    const project = await queryOne<{ id: number; code: string; name_cn: string }>(
        database,
        `INSERT INTO projects (code, name_cn, color) VALUES (?, ?, ?)
         RETURNING id, code, name_cn`,
        [`dm${suffix}`, `文档媒体${suffix}`, '#336699']
    );
    await queryOne<{ project_id: number }>(
        database,
        'UPDATE wiki_project_settings SET is_enabled=TRUE WHERE project_id=? RETURNING project_id',
        [project!.id]
    );
    const entry = await queryOne<{ id: number }>(
        database,
        `INSERT INTO wiki_entries (project_id, local_name_cn, storage_slug)
         VALUES (?, ?, ?) RETURNING id`,
        [project!.id, `条目${suffix}`, `entry_${suffix}`]
    );
    return { project: project!, entryId: entry!.id };
}

async function seedCoverAsset(
    database: TestDatabase,
    storage: MemoryObjectStorage,
    projectId: number,
    name: string
) {
    const objectKey = `wiki/projects/${projectId}/story-cover-assets/${encodeURIComponent(name)}.webp`;
    storage.seed(objectKey, new Uint8Array([9, 9, 9]), 'image/webp');
    const asset = await queryOne<{ id: number }>(
        database,
        `INSERT INTO wiki_story_cover_assets (agency_id, name, object_key, display_order)
         VALUES (?, ?, ?, 0) RETURNING id`,
        [projectId, name, objectKey]
    );
    return { id: asset!.id, objectKey };
}

describe('wiki document media and embedded categories', () => {
    test('uploads media, embeds it with a shared cover, and renders it publicly', async () => {
        const database = await createPostgresTestDatabase('wiki-doc-media-api');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(database, new PostgresqlSchemaStrategy());
        const storage = new MemoryObjectStorage();
        const { app, uploads } = createServices(repository, storage);
        const { project, entryId } = await seedProject(database, 'media');
        await repository.ensureWikiCategory(project.id, entryId, 'enzaP卡', 'enza_pcard');
        await repository.insertStoryBatchReturningIds({
            agencyCode: project.code,
            idolId: entryId,
            category: 'enzaP卡',
            cardName: '【第一话】',
            subtitle: '全话',
            imageFile: null,
            coverAssetId: null,
            imageTransform: defaultWikiImageTransform,
            links: [],
        });
        const cover = await seedCoverAsset(database, storage, project.id, 'shared-cover');

        // 1. Upload one document image; the response carries a public URL only.
        uploadImage(uploads);
        const uploaded = await app.request(
            `http://wiki.test${adminWikiEntryDocumentMediaPath(entryId)}`,
            {
                method: 'POST',
                headers: { Cookie: ACCESS_COOKIE, 'X-CSRFToken': CSRF_TOKEN },
            }
        );
        assert.equal(uploaded.status, 200);
        const uploadBody = await readContractJson(
            uploaded,
            adminWikiEntryDocumentMediaUploadSchema
        );
        const mediaId = uploadBody.media.id;
        assert.equal(uploadBody.media.altText, '剧情截图');
        const mediaRows = await queryAll<{ object_key: string; entry_id: number }>(
            database,
            'SELECT object_key, entry_id FROM wiki_entry_document_media WHERE id=?',
            [mediaId]
        );
        const objectKey = mediaRows[0]!.object_key;
        assert.equal(mediaRows[0]!.entry_id, entryId);
        assert.equal(
            uploadBody.media.imageUrl,
            `${PUBLIC_MEDIA_BASE}/${objectKey.split('/').map(encodeURIComponent).join('/')}`
        );
        assert.equal(uploadBody.media.imageUrl.includes('/api/wiki/'), false);

        // 2. The admin read lists the upload so the workbench can pick it.
        const read = await readContractJson(
            await adminRequest(app, 'GET', adminWikiEntryDocumentPath(entryId)),
            adminWikiEntryDocumentSchema
        );
        assert.deepEqual(read.media, [uploadBody.media]);

        // 3. Save a document embedding both the upload and the shared cover.
        const sourceMarkdown = [
            '## 视觉图',
            '',
            `::media{asset="doc:${mediaId}" caption="剧情截图" fit="contain"}`,
            '',
            `::media{asset="cover:${cover.id}"}`,
            '',
            '::story-category{name="enzaP卡"}',
            '',
        ].join('\n');
        const saved = await adminRequest(
            app,
            'PUT',
            adminWikiEntryDocumentPath(entryId),
            { contentMode: 'document', sourceMarkdown, expectedRevision: 0 }
        );
        assert.equal(saved.status, 200);
        const savedBody = await readContractJson(saved, adminWikiEntryDocumentSaveSchema);
        assert.deepEqual(savedBody.warnings, []);
        assert.deepEqual(
            savedBody.document.blocks.map((block) => block.type),
            ['heading', 'media', 'media', 'storyCategory']
        );

        // 4. The reference table mirrors the document inside the save transaction.
        const references = await queryAll<{ cover_asset_id: number; project_id: number }>(
            database,
            `SELECT cover_asset_id, project_id FROM wiki_entry_document_cover_refs
              WHERE entry_id=? ORDER BY cover_asset_id`,
            [entryId]
        );
        assert.deepEqual(references, [
            { cover_asset_id: cover.id, project_id: project.id },
        ]);

        // 5. Public read resolves live storage URLs and the embedded category.
        const publicStories = await app.request(
            `http://wiki.test${publicStoriesPath(project.name_cn, '条目media')}`
        );
        assert.equal(publicStories.status, 200);
        const publicBody = (await publicStories.json()) as {
            categories: Array<{ name: string; cards: unknown[] }>;
            document: {
                blocks: Array<{
                    type: string;
                    asset?: { kind: string; id: number };
                    imageUrl?: string | null;
                    categoryName?: string | null;
                }>;
            };
        };
        const publicMedia = publicBody.document.blocks.filter(
            (block) => block.type === 'media'
        );
        assert.deepEqual(
            publicMedia.map((block) => [block.asset, block.imageUrl]),
            [
                [
                    { kind: 'doc', id: mediaId },
                    uploadBody.media.imageUrl,
                ],
                [
                    { kind: 'cover', id: cover.id },
                    `${PUBLIC_MEDIA_BASE}/wiki/projects/${project.id}/story-cover-assets/shared-cover.webp`,
                ],
            ]
        );
        assert.deepEqual(
            publicBody.document.blocks
                .filter((block) => block.type === 'storyCategory')
                .map((block) => block.categoryName),
            ['enzaP卡']
        );
        assert.deepEqual(
            publicBody.categories.map((category) => category.name),
            ['enzaP卡']
        );

        // 6. A shared cover referenced only by a document counts and blocks delete.
        const listed = await adminRequest(
            app,
            'GET',
            adminWikiPath(`/agencies/${project.id}/story-cover-assets`)
        );
        assert.equal(listed.status, 200);
        const listedBody = (await listed.json()) as {
            assets: Array<{ id: number; usageCount: number }>;
        };
        assert.deepEqual(
            listedBody.assets.map((asset) => [asset.id, asset.usageCount]),
            [[cover.id, 1]]
        );

        const blocked = await adminRequest(
            app,
            'DELETE',
            adminWikiPath(`/story-cover-assets/${cover.id}`)
        );
        assert.equal(blocked.status, 409);
        assert.deepEqual(await blocked.json(), {
            status: 'error',
            msg: '仍有 1 处引用使用该素材，无法删除',
        });
    });

    test('flags cross-project cover assets and stale document uploads', async () => {
        const database = await createPostgresTestDatabase('wiki-doc-media-cross');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(database, new PostgresqlSchemaStrategy());
        const storage = new MemoryObjectStorage();
        const { app } = createServices(repository, storage);
        const own = await seedProject(database, 'own');
        const other = await seedProject(database, 'other');
        const foreignCover = await seedCoverAsset(
            database,
            storage,
            other.project.id,
            'other-cover'
        );

        const preview = await adminRequest(
            app,
            'POST',
            `${adminWikiEntryDocumentPath(own.entryId)}/preview`,
            {
                sourceMarkdown: [
                    '## 一',
                    '',
                    `::media{asset="cover:${foreignCover.id}"}`,
                    '',
                    '::media{asset="doc:999"}',
                    '',
                    '::story-category{name="不存在的分类"}',
                    '',
                ].join('\n'),
            }
        );
        assert.equal(preview.status, 200);
        const previewBody = (await preview.json()) as {
            warnings: Array<{ line: number; code: string }>;
        };
        assert.deepEqual(
            previewBody.warnings.map((warning) => [warning.line, warning.code]),
            [
                [3, 'asset-cross-project'],
                [5, 'asset-not-found'],
                [7, 'unknown-category'],
            ]
        );

        const saved = await adminRequest(
            app,
            'PUT',
            adminWikiEntryDocumentPath(own.entryId),
            {
                contentMode: 'document',
                sourceMarkdown: `::media{asset="cover:${foreignCover.id}"}\n`,
                expectedRevision: 0,
            }
        );
        assert.equal(saved.status, 200);
        const savedBody = await readContractJson(saved, adminWikiEntryDocumentSaveSchema);
        assert.deepEqual(savedBody.warnings, [
            {
                line: 1,
                code: 'asset-cross-project',
                message: `共享封面素材 cover:${foreignCover.id} 不属于当前企划`,
            },
        ]);
        // The rejected reference never reaches the reference table, so the other
        // project can still delete its own asset.
        const references = await queryAll<{ cover_asset_id: number }>(
            database,
            'SELECT cover_asset_id FROM wiki_entry_document_cover_refs WHERE entry_id=?',
            [own.entryId]
        );
        assert.deepEqual(references, []);
        const deleted = await adminRequest(
            app,
            'DELETE',
            adminWikiPath(`/story-cover-assets/${foreignCover.id}`)
        );
        assert.equal(deleted.status, 200);
    });

    test('replaces a shared cover asset and updates every embedding', async () => {
        const database = await createPostgresTestDatabase('wiki-doc-media-replace');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(database, new PostgresqlSchemaStrategy());
        const storage = new MemoryObjectStorage();
        const { app, uploads } = createServices(repository, storage);
        const { project, entryId } = await seedProject(database, 'replace');
        const cover = await seedCoverAsset(database, storage, project.id, 'replace-cover');

        const save = (sourceMarkdown: string, expectedRevision: number) =>
            adminRequest(app, 'PUT', adminWikiEntryDocumentPath(entryId), {
                contentMode: 'document',
                sourceMarkdown,
                expectedRevision,
            });
        assert.equal((await save(`::media{asset="cover:${cover.id}"}\n`, 0)).status, 200);

        const publicPath = publicStoriesPath(project.name_cn, '条目replace');
        const before = (await (await app.request(`http://wiki.test${publicPath}`)).json()) as {
            document: { blocks: Array<{ imageUrl?: string | null }> };
        };
        assert.equal(
            before.document.blocks[0]?.imageUrl,
            `${PUBLIC_MEDIA_BASE}/wiki/projects/${project.id}/story-cover-assets/replace-cover.webp`
        );

        // Replace the artwork: the newest object wins for existing documents.
        uploadImage(uploads, 'new-cover.png', 'valid-png');
        uploads.next.fields.expected_revision = '0';
        const replaced = await app.request(
            `http://wiki.test${adminWikiPath(`/story-cover-assets/${cover.id}`)}`,
            {
                method: 'PATCH',
                headers: { Cookie: ACCESS_COOKIE, 'X-CSRFToken': CSRF_TOKEN },
            }
        );
        assert.equal(replaced.status, 200);
        const replacedBody = (await replaced.json()) as {
            asset: { revision: number; imageUrl: string };
        };
        assert.equal(replacedBody.asset.revision, 1);
        const after = (await (await app.request(`http://wiki.test${publicPath}`)).json()) as {
            document: { blocks: Array<{ imageUrl?: string | null }> };
        };
        assert.notEqual(after.document.blocks[0]?.imageUrl, before.document.blocks[0]?.imageUrl);
        const replacedKey = await queryOne<{ object_key: string }>(
            database,
            'SELECT object_key FROM wiki_story_cover_assets WHERE id=?',
            [cover.id]
        );
        assert.notEqual(replacedKey!.object_key, cover.objectKey);
        assert.equal(
            after.document.blocks[0]?.imageUrl,
            `${PUBLIC_MEDIA_BASE}/${replacedKey!.object_key
                .split('/')
                .map(encodeURIComponent)
                .join('/')}`
        );

        // Dropping the embedding releases the reference and the asset.
        assert.equal((await save('## 没有封面\n', 1)).status, 200);
        const references = await queryAll<{ cover_asset_id: number }>(
            database,
            'SELECT cover_asset_id FROM wiki_entry_document_cover_refs WHERE entry_id=?',
            [entryId]
        );
        assert.deepEqual(references, []);
        const deleted = await adminRequest(
            app,
            'DELETE',
            adminWikiPath(`/story-cover-assets/${cover.id}`)
        );
        assert.equal(deleted.status, 200);
    });

    test('embeds every category and refuses another entry upload', async () => {
        const database = await createPostgresTestDatabase('wiki-doc-media-siblings');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(database, new PostgresqlSchemaStrategy());
        const storage = new MemoryObjectStorage();
        const { app } = createServices(repository, storage);
        const own = await seedProject(database, 'sibling');
        const sibling = await seedProject(database, 'siblingsrc');
        await repository.ensureWikiCategory(own.project.id, own.entryId, '主线', 'main');
        await repository.ensureWikiCategory(own.project.id, own.entryId, '活动', 'event');
        for (const [category, cardName] of [
            ['主线', '第一话'],
            ['活动', '夏日祭'],
        ] as const) {
            await repository.insertStoryBatchReturningIds({
                agencyCode: own.project.code,
                idolId: own.entryId,
                category,
                cardName,
                subtitle: '',
                imageFile: null,
                coverAssetId: null,
                imageTransform: defaultWikiImageTransform,
                links: [],
            });
        }
        // An upload that belongs to a different entry of the same agency.
        const foreignKey = `wiki/projects/${sibling.project.id}/entries/${sibling.entryId}/document/shot.webp`;
        storage.seed(foreignKey, new Uint8Array([1, 2, 3]), 'image/webp');
        const foreignMedia = await queryOne<{ id: number }>(
            database,
            `INSERT INTO wiki_entry_document_media (project_id, entry_id, object_key, alt_text)
             VALUES (?, ?, ?, '别处截图') RETURNING id`,
            [sibling.project.id, sibling.entryId, foreignKey]
        );

        const preview = await adminRequest(
            app,
            'POST',
            `${adminWikiEntryDocumentPath(own.entryId)}/preview`,
            {
                sourceMarkdown: [
                    `::media{asset="doc:${foreignMedia!.id}"}`,
                    '',
                    '::story-categories',
                    '',
                ].join('\n'),
            }
        );
        assert.equal(preview.status, 200);
        const previewBody = (await preview.json()) as {
            warnings: Array<{ line: number; code: string }>;
            document: { blocks: Array<{ type: string; imageUrl?: string | null }> };
        };
        assert.deepEqual(
            previewBody.warnings.map((warning) => [warning.line, warning.code]),
            [[1, 'asset-not-in-entry']]
        );
        assert.deepEqual(
            previewBody.document.blocks.map((block) => [block.type, block.imageUrl ?? null]),
            [
                ['media', null],
                ['storyCategory', null],
            ]
        );

        const saved = await adminRequest(
            app,
            'PUT',
            adminWikiEntryDocumentPath(own.entryId),
            {
                contentMode: 'document',
                sourceMarkdown: '::story-categories\n',
                expectedRevision: 0,
            }
        );
        assert.equal(saved.status, 200);
        const publicBody = (await (
            await app.request(
                `http://wiki.test${publicStoriesPath(own.project.name_cn, '条目sibling')}`
            )
        ).json()) as { categories: Array<{ name: string }> };
        assert.deepEqual(
            publicBody.categories.map((category) => category.name),
            ['主线', '活动']
        );
    });

    test('rejects document media for unknown entries and unauthenticated uploads', async () => {
        const database = await createPostgresTestDatabase('wiki-doc-media-errors');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(database, new PostgresqlSchemaStrategy());
        const storage = new MemoryObjectStorage();
        const { app, uploads } = createServices(repository, storage);
        const { entryId } = await seedProject(database, 'errors');

        uploadImage(uploads);
        const anonymous = await app.request(
            `http://wiki.test${adminWikiEntryDocumentMediaPath(entryId)}`,
            { method: 'POST' }
        );
        assert.equal(anonymous.status, 401);
        assert.deepEqual(await anonymous.json(), {
            status: 'error',
            msg: '未登录，请先登录',
        });

        const missing = await app.request(
            `http://wiki.test${adminWikiEntryDocumentMediaPath(entryId + 999)}`,
            {
                method: 'POST',
                headers: { Cookie: ACCESS_COOKIE, 'X-CSRFToken': CSRF_TOKEN },
            }
        );
        assert.equal(missing.status, 404);

        uploads.next = { fields: {}, files: {} };
        const noImage = await app.request(
            `http://wiki.test${adminWikiEntryDocumentMediaPath(entryId)}`,
            {
                method: 'POST',
                headers: { Cookie: ACCESS_COOKIE, 'X-CSRFToken': CSRF_TOKEN },
            }
        );
        assert.equal(noImage.status, 400);
        assert.deepEqual(await noImage.json(), {
            status: 'error',
            msg: '请选择要上传的图片',
        });
    });
});
