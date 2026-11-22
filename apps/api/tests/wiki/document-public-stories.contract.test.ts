import { postgresTest as test } from '../postgres-test-database';
import assert from 'node:assert/strict';
import { describe } from 'vitest';
import {
    defaultWikiImageTransform,
    wikiHttpErrorResponseSchema,
} from '@imsweb/contracts/wiki';
import {
    adminWikiEntryDocumentPath,
    wikiPath,
} from '@imsweb/contracts/paths';
import { createHonoApp } from '@/app';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlStoryRepository } from '@/infra/db/repositories/story-repository';
import { queryOne } from '@/infra/db/sql/query';
import { readContractJson } from '../contracts/contract-json';
import { createPostgresTestDatabase } from '../postgres-test-database';
import { MemoryObjectStorage } from './fixture';

const CSRF_TOKEN = 'csrf-secret';

function createApp(repository: SqlStoryRepository, storage: MemoryObjectStorage) {
    return createHonoApp(() => ({
        story: repository,
        storage,
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
}

describe('public Wiki stories document payload', () => {
    test('keeps structured entries on the legacy payload and returns the AST for document entries', async () => {
        const database = await createPostgresTestDatabase('wiki-public-documents');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(database, new PostgresqlSchemaStrategy());
        const storage = new MemoryObjectStorage();
        const app = createApp(repository, storage);

        const project = await queryOne<{ id: number }>(
            database,
            `INSERT INTO agencies (code, name_cn, color, wiki_enabled)
             VALUES (?, ?, ?, TRUE) RETURNING id`,
            ['wpub', '公开企划', '#8dbbff']
        );
        const entry = await queryOne<{ id: number }>(
            database,
            `INSERT INTO wiki_entries (project_id, local_name_cn, storage_slug, local_accent_color)
             VALUES (?, ?, ?, ?) RETURNING id`,
            [project!.id, '公开条目', 'entry_pub', '#ffbad6']
        );
        await repository.ensureWikiCategory(project!.id, entry!.id, 'enzaP卡', 'enza_pcard');
        const [cardId] = await repository.insertStoryBatchReturningIds({
            agencyCode: 'wpub',
            idolId: entry!.id,
            category: 'enzaP卡',
            cardName: '【第一话】',
            subtitle: '全话',
            imageFile: null,
            coverAssetId: null,
            imageTransform: defaultWikiImageTransform,
            links: [
                {
                    upName: '投稿者',
                    videoTitle: '第一话',
                    url: 'https://example.test/first',
                    contentTypeId: 1,
                    sourcePlatformId: 2,
                },
            ],
        });

        const publicPath =
            '/api/wiki/stories?agency=' +
            encodeURIComponent('公开企划') +
            '&idol=' +
            encodeURIComponent('公开条目');
        const structured = await app.request(`http://wiki.test${publicPath}`);
        assert.equal(structured.status, 200);
        const structuredBody = await structured.json();
        assert.deepEqual(structuredBody, {
            status: 'success',
            agency: {
                id: project!.id,
                code: 'wpub',
                name: '公开企划',
                color: '#8dbbff',
            },
            idol: {
                id: entry!.id,
                name: '公开条目',
                folderName: 'entry_pub',
                color: '#ffbad6',
                wikiUrl: null,
                imageUrl: '',
                imageFit: 'cover',
                imageTransform: defaultWikiImageTransform,
                textColor: '#ffffff',
                entryKind: 'idol',
                entrySubtype: null,
            },
            contentMode: 'structured',
            document: null,
            categories: [
                {
                    name: 'enzaP卡',
                    cards: [
                        {
                            id: cardId,
                            name: '【第一话】',
                            img: '',
                            subtitle: '全话',
                            imageTransform: defaultWikiImageTransform,
                            links: [
                                {
                                    id: 1,
                                    up: '投稿者',
                                    title: '第一话',
                                    url: 'https://example.test/first',
                                    contentType: '剧情',
                                    contentTypeIcon: 'book-open-text',
                                    sourcePlatform: '其他来源',
                                },
                            ],
                        },
                    ],
                },
            ],
        });

        const saved = await app.request(
            `http://wiki.test${adminWikiEntryDocumentPath(entry!.id)}`,
            {
                method: 'PUT',
                headers: {
                    Cookie: 'ims_admin_access=backoffice-token',
                    'X-CSRFToken': CSRF_TOKEN,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contentMode: 'document',
                    sourceMarkdown: '## 导语\n\n先看 **主线**。\n',
                    expectedRevision: 0,
                }),
            }
        );
        assert.equal(saved.status, 200);

        const documentResponse = await app.request(`http://wiki.test${publicPath}`);
        assert.equal(documentResponse.status, 200);
        const documentBody = await documentResponse.json();
        assert.deepEqual(documentBody.contentMode, 'document');
        assert.deepEqual(documentBody.document, {
            version: 1,
            headings: [{ id: '导语', level: 2, text: '导语' }],
            availableTags: [],
            blocks: [
                {
                    type: 'heading',
                    level: 2,
                    id: '导语',
                    children: [{ type: 'text', value: '导语' }],
                },
                {
                    type: 'paragraph',
                    children: [
                        { type: 'text', value: '先看 ' },
                        { type: 'strong', children: [{ type: 'text', value: '主线' }] },
                        { type: 'text', value: '。' },
                    ],
                },
            ],
        });
        // A document that embeds no `::story-category` renders no structured
        // pool: the public payload narrows `categories` to the embedded ones.
        assert.deepEqual(documentBody.categories, []);
    });
});

describe('public Wiki document media URLs', () => {
    test('falls back to the id-addressed asset routes without exposing object keys', async () => {
        const database = await createPostgresTestDatabase('wiki-document-media-fallback');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(database, new PostgresqlSchemaStrategy());
        // A local development storage has no public read base at all; the public
        // page must still render and serve image bytes without exposing keys.
        const storage = new MemoryObjectStorage();
        const app = createApp(repository, storage);

        const project = await queryOne<{ id: number }>(
            database,
            `INSERT INTO agencies (code, name_cn, color, wiki_enabled)
             VALUES (?, ?, ?, TRUE) RETURNING id`,
            ['wfall', '回退企划', '#8dbbff']
        );
        await queryOne(
            database,
            `INSERT INTO wiki_project_settings (project_id, is_enabled, banner_title)
             VALUES (?, TRUE, ?)
             ON CONFLICT (project_id) DO UPDATE SET is_enabled = TRUE`,
            [project!.id, '回退企划']
        );
        const entry = await queryOne<{ id: number }>(
            database,
            `INSERT INTO wiki_entries (project_id, local_name_cn, storage_slug, local_accent_color)
             VALUES (?, ?, ?, ?) RETURNING id`,
            [project!.id, '回退条目', 'entry_fallback', '#ffbad6']
        );
        const coverKey = 'agencies/wfall/story-cover-assets/objects/abc/cover.webp';
        await storage.put(coverKey, new Uint8Array([1, 2, 3, 4]), {
            contentType: 'image/webp',
        });
        const asset = await queryOne<{ id: number }>(
            database,
            `INSERT INTO wiki_story_cover_assets (agency_id, name, object_key, display_order)
             VALUES (?, ?, ?, 0) RETURNING id`,
            [project!.id, '回退封面', coverKey]
        );
        const docKey = `wiki/projects/wfall/entries/${entry!.id}/document/shot.webp`;
        await storage.put(docKey, new Uint8Array([5, 6, 7, 8]), {
            contentType: 'image/webp',
        });
        const docMedia = await repository.createWikiEntryDocumentMedia({
            entryId: entry!.id,
            projectId: project!.id,
            objectKey: docKey,
            altText: '实景截图',
        });

        const saved = await app.request(
            `http://wiki.test${adminWikiEntryDocumentPath(entry!.id)}`,
            {
                method: 'PUT',
                headers: {
                    Cookie: 'ims_admin_access=backoffice-token',
                    'X-CSRFToken': CSRF_TOKEN,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    contentMode: 'document',
                    sourceMarkdown: [
                        `::media{asset="cover:${asset!.id}" caption="封面"}`,
                        '',
                        `::media{asset="doc:${docMedia.id}" caption="截图"}`,
                        '',
                    ].join('\n'),
                    expectedRevision: 0,
                }),
            }
        );
        assert.equal(saved.status, 200);

        const publicPath =
            '/api/wiki/stories?agency=' +
            encodeURIComponent('回退企划') +
            '&idol=' +
            encodeURIComponent('回退条目');
        const response = await app.request(`http://wiki.test${publicPath}`);
        assert.equal(response.status, 200);
        const body = (await response.json()) as {
            document: { blocks: Array<{ type: string; imageUrl?: string | null }> };
        };
        const mediaUrls = body.document.blocks
            .filter((block) => block.type === 'media')
            .map((block) => block.imageUrl);
        const expectedCoverUrl = wikiPath(`/story-cover-assets/${asset!.id}.webp`);
        const expectedDocUrl = wikiPath(`/document-media/${docMedia.id}.webp`);
        assert.deepEqual(mediaUrls, [expectedCoverUrl, expectedDocUrl]);
        assert.equal(expectedCoverUrl.includes(coverKey), false);
        assert.equal(expectedDocUrl.includes(docKey), false);

        const coverResponse = await app.request(`http://wiki.test${expectedCoverUrl}`);
        assert.equal(coverResponse.status, 200);
        assert.deepEqual(
            new Uint8Array(await coverResponse.arrayBuffer()),
            new Uint8Array([1, 2, 3, 4])
        );

        const docGetResponse = await app.request(`http://wiki.test${expectedDocUrl}`);
        assert.equal(docGetResponse.status, 200);
        assert.equal(docGetResponse.headers.get('content-type'), 'image/webp');
        assert.deepEqual(
            new Uint8Array(await docGetResponse.arrayBuffer()),
            new Uint8Array([5, 6, 7, 8])
        );

        const docHeadResponse = await app.request(`http://wiki.test${expectedDocUrl}`, {
            method: 'HEAD',
        });
        assert.equal(docHeadResponse.status, 200);
        assert.equal((await docHeadResponse.arrayBuffer()).byteLength, 0);

        for (const badPath of [
            wikiPath('/document-media/999999.webp'),
            wikiPath('/document-media/invalid.webp'),
        ]) {
            const missingResponse = await app.request(`http://wiki.test${badPath}`);
            assert.equal(missingResponse.status, 404);
            const errorBody = await readContractJson(
                missingResponse,
                wikiHttpErrorResponseSchema
            );
            assert.deepEqual(errorBody, {
                status: 'error',
                msg: '图片不存在',
            });
        }
    });
});
