import { postgresTest as test } from '../postgres-test-database';
import assert from 'node:assert/strict';
import { describe } from 'vitest';
import {
    adminWikiEntryDocumentPreviewSchema,
    adminWikiEntryDocumentSaveSchema,
    adminWikiEntryDocumentSchema,
    wikiRevisionConflictResponseSchema,
} from '@imsweb/contracts/wiki';
import { adminWikiEntryDocumentPath } from '@imsweb/contracts/paths';
import { createHonoApp } from '@/app';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlStoryRepository } from '@/infra/db/repositories/story-repository';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';
import {
    readContractJson,
} from '../contracts/contract-json';
import { createPostgresTestDatabase } from '../postgres-test-database';
import { MemoryObjectStorage } from './fixture';

const CSRF_TOKEN = 'csrf-secret';
const ACCESS_COOKIE = 'ims_admin_access=backoffice-token';

function storyRepositoryApp(
    repository: SqlStoryRepository,
    storage = new MemoryObjectStorage()
) {
    storage.publicReadUrlBase = 'https://media.test';
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

function request(
    app: ReturnType<typeof storyRepositoryApp>,
    method: string,
    pathname: string,
    options: { body?: unknown; csrf?: boolean } = {}
) {
    const headers: Record<string, string> = { Cookie: ACCESS_COOKIE };
    if (options.csrf !== false) headers['X-CSRFToken'] = CSRF_TOKEN;
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    return app.request(`http://wiki.test${pathname}`, {
        method,
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });
}

async function seedEntry(
    database: Awaited<ReturnType<typeof createPostgresTestDatabase>>,
    suffix: string
) {
    const project = await queryOne<{ id: number; code: string; name_cn: string }>(
        database,
        `INSERT INTO projects (code, name_cn, color) VALUES (?, ?, ?)
         RETURNING id, code, name_cn`,
        [`wd${suffix}`, `企划${suffix}`, '#334455']
    );
    const entry = await queryOne<{ id: number }>(
        database,
        `INSERT INTO wiki_entries (project_id, local_name_cn, storage_slug)
         VALUES (?, ?, ?) RETURNING id`,
        [project!.id, `条目${suffix}`, `entry_${suffix}`]
    );
    return { project: project!, entryId: entry!.id };
}

async function revisionRows(
    database: Awaited<ReturnType<typeof createPostgresTestDatabase>>,
    entryId: number
) {
    return queryAll<{
        revision: number;
        summary: string;
        source_markdown: string;
        created_by: string | null;
    }>(
        database,
        `SELECT revision, summary, source_markdown, created_by
           FROM wiki_entry_document_revisions
          WHERE entry_id=? ORDER BY revision`,
        [entryId]
    );
}

describe('wiki entry document API', () => {
    test('reads, previews, and saves Enhanced Markdown with optimistic locking', async () => {
        const database = await createPostgresTestDatabase('wiki-document-api');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(database, new PostgresqlSchemaStrategy());
        const app = storyRepositoryApp(repository);
        const { project, entryId } = await seedEntry(database, 'doc');
        const documentPath = adminWikiEntryDocumentPath(entryId);

        const initial = await request(app, 'GET', documentPath);
        assert.equal(initial.status, 200);
        assert.deepEqual(await readContractJson(initial, adminWikiEntryDocumentSchema), {
            status: 'success',
            entry: {
                id: entryId,
                projectId: project.id,
                projectCode: project.code,
                projectName: project.name_cn,
                name: '条目doc',
                folderName: 'entry_doc',
                entryKind: 'idol',
            },
            contentMode: 'structured',
            sourceMarkdown: '',
            revision: 0,
            document: { version: 1, headings: [], availableTags: [], blocks: [] },
            warnings: [],
            media: [],
        });

        const preview = await request(app, 'POST', `${documentPath}/preview`, {
            body: { sourceMarkdown: '## 观看顺序\n\n先看 **主线**。\n' },
        });
        assert.equal(preview.status, 200);
        assert.deepEqual(
            await readContractJson(preview, adminWikiEntryDocumentPreviewSchema),
            {
                status: 'success',
                document: {
                    version: 1,
                    headings: [{ id: '观看顺序', level: 2, text: '观看顺序' }],
                    availableTags: [],
                    blocks: [
                        {
                            type: 'heading',
                            level: 2,
                            id: '观看顺序',
                            children: [{ type: 'text', value: '观看顺序' }],
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
                },
                warnings: [],
            }
        );

        const noCsrf = await request(app, 'PUT', documentPath, {
            csrf: false,
            body: {
                contentMode: 'document',
                sourceMarkdown: '## 一\n',
                expectedRevision: 0,
            },
        });
        assert.equal(noCsrf.status, 403);

        const saved = await request(app, 'PUT', documentPath, {
            body: {
                contentMode: 'document',
                sourceMarkdown: '## 一\n\n正文。\n',
                expectedRevision: 0,
                summary: '首次保存',
            },
        });
        assert.equal(saved.status, 200);
        const savedBody = await readContractJson(saved, adminWikiEntryDocumentSaveSchema);
        assert.equal(savedBody.contentMode, 'document');
        assert.equal(savedBody.revision, 1);
        assert.deepEqual(savedBody.document.headings, [
            { id: '一', level: 2, text: '一' },
        ]);

        const staleSave = await request(app, 'PUT', documentPath, {
            body: {
                contentMode: 'structured',
                sourceMarkdown: '## 覆盖\n',
                expectedRevision: 0,
            },
        });
        assert.equal(staleSave.status, 409);
        const conflict = await readContractJson(staleSave, wikiRevisionConflictResponseSchema);
        assert.equal(conflict.revision, 1);

        const reread = await readContractJson(
            await request(app, 'GET', documentPath),
            adminWikiEntryDocumentSchema
        );
        assert.equal(reread.contentMode, 'document');
        assert.equal(reread.revision, 1);
        assert.equal(reread.sourceMarkdown, '## 一\n\n正文。\n');
        assert.equal(reread.document.blocks.length, 2);

        const stored = await queryOne<{
            content_mode: string;
            plain_text: string;
            updated_by: string | null;
        }>(
            database,
            `SELECT e.content_mode, d.plain_text, d.updated_by
               FROM wiki_entries e JOIN wiki_entry_documents d ON d.entry_id=e.id
              WHERE e.id=?`,
            [entryId]
        );
        assert.deepEqual(stored, {
            content_mode: 'document',
            plain_text: '一\n正文。',
            updated_by: 'operator',
        });
        assert.deepEqual(await revisionRows(database, entryId), [
            {
                revision: 1,
                summary: '首次保存',
                source_markdown: '## 一\n\n正文。\n',
                created_by: 'operator',
            },
        ]);
    });

    test('caps document revision snapshots at the latest 30 per entry', async () => {
        const database = await createPostgresTestDatabase('wiki-document-revisions');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(database, new PostgresqlSchemaStrategy());
        const app = storyRepositoryApp(repository);
        const { entryId } = await seedEntry(database, 'rev');
        const documentPath = adminWikiEntryDocumentPath(entryId);

        for (let revision = 0; revision < 32; revision += 1) {
            const response = await request(app, 'PUT', documentPath, {
                body: {
                    contentMode: 'document',
                    sourceMarkdown: `## 第${revision + 1}版\n`,
                    expectedRevision: revision,
                    summary: `第${revision + 1}版`,
                },
            });
            assert.equal(response.status, 200);
        }

        const rows = await revisionRows(database, entryId);
        assert.equal(rows.length, 30);
        assert.equal(rows[0]?.revision, 3);
        assert.equal(rows.at(-1)?.revision, 32);

        const beyond = await request(app, 'PUT', documentPath, {
            body: {
                contentMode: 'document',
                sourceMarkdown: '## 过期\n',
                expectedRevision: 1,
            },
        });
        assert.equal(beyond.status, 409);
        assert.equal(
            (await readContractJson(beyond, wikiRevisionConflictResponseSchema)).revision,
            32
        );
        assert.equal((await revisionRows(database, entryId)).length, 30);
    });

    test('rejects unknown entries, malformed bodies, and unauthenticated reads', async () => {
        const database = await createPostgresTestDatabase('wiki-document-errors');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(database, new PostgresqlSchemaStrategy());
        const app = storyRepositoryApp(repository);
        const { entryId } = await seedEntry(database, 'err');

        assert.equal((await request(app, 'GET', adminWikiEntryDocumentPath(entryId + 999))).status, 404);

        const malformed = await request(app, 'PUT', adminWikiEntryDocumentPath(entryId), {
            body: { contentMode: 'document', sourceMarkdown: '## 一\n' },
        });
        assert.equal(malformed.status, 400);

        const unknownKey = await request(app, 'PUT', adminWikiEntryDocumentPath(entryId), {
            body: {
                contentMode: 'document',
                sourceMarkdown: '## 一\n',
                expectedRevision: 0,
                surprise: true,
            },
        });
        assert.equal(unknownKey.status, 400);

        const anonymous = await app.request(
            `http://wiki.test${adminWikiEntryDocumentPath(entryId)}`
        );
        assert.equal(anonymous.status, 401);

        await executeSql(database, 'DELETE FROM wiki_entries WHERE id=?', [entryId]);
    });
});
