import { postgresTest as test } from '../postgres-test-database';
import assert from 'node:assert/strict';
import { describe } from 'vitest';
import { adminWikiEntryDocumentExportStructuredSchema } from '@imsweb/contracts/wiki';
import { adminWikiEntryDocumentExportStructuredPath } from '@imsweb/contracts/paths';
import { createHonoApp } from '@/app';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlStoryRepository } from '@/infra/db/repositories/story-repository';
import { queryOne } from '@/infra/db/sql/query';
import { readContractJson } from '../contracts/contract-json';
import { createPostgresTestDatabase } from '../postgres-test-database';

type PostgresTestDatabase = Awaited<
    ReturnType<typeof createPostgresTestDatabase>
>;
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
        body:
            options.body === undefined
                ? undefined
                : JSON.stringify(options.body),
    });
}

/**
 * One entry with two categories and mixed card shapes, mirroring the audit's
 * 学园偶像大师 S-card gallery (artwork, `出场：` subtitles) and 灰姑娘
 * `#`-placeholder dirty rows.
 */
async function seedEntry(
    database: PostgresTestDatabase,
    suffix: string,
    options: { extraEmptyCategory?: string } = {}
) {
    const project = await queryOne<{ id: number; code: string }>(
        database,
        `INSERT INTO projects (code, name_cn, color) VALUES (?, ?, ?)
         RETURNING id, code`,
        [`wx${suffix}`, `企划${suffix}`, '#334455']
    );
    const entry = await queryOne<{ id: number }>(
        database,
        `INSERT INTO wiki_entries (project_id, local_name_cn, storage_slug)
         VALUES (?, ?, ?) RETURNING id`,
        [project!.id, `S卡${suffix}`, `entry_${suffix}`]
    );
    const entryId = entry!.id;
    const category = await queryOne<{ id: number }>(
        database,
        `INSERT INTO wiki_categories (agency_id, name, storage_slug)
         VALUES (?, ?, ?) RETURNING id`,
        [project!.id, 'S卡', `s_card_${suffix}`]
    );
    await queryOne(
        database,
        `INSERT INTO wiki_entry_categories
             (project_id, entry_id, category_id, display_order)
         VALUES (?, ?, ?, 0)`,
        [project!.id, entryId, category!.id]
    );
    if (options.extraEmptyCategory) {
        // A category assigned to the entry that holds no cards: 24 such category
        // instances exist in the audit.
        const empty = await queryOne<{ id: number }>(
            database,
            `INSERT INTO wiki_categories (agency_id, name, storage_slug)
             VALUES (?, ?, ?) RETURNING id`,
            [project!.id, options.extraEmptyCategory, `empty_${suffix}`]
        );
        await queryOne(
            database,
            `INSERT INTO wiki_entry_categories
                 (project_id, entry_id, category_id, display_order)
             VALUES (?, ?, ?, 1)`,
            [project!.id, entryId, empty!.id]
        );
    }
    const cover = await queryOne<{ id: number }>(
        database,
        `INSERT INTO wiki_story_cover_assets
             (agency_id, name, object_key, display_order)
         VALUES (?, ?, ?, 0) RETURNING id`,
        [project!.id, '共享封面', `wiki/${suffix}/cover.webp`]
    );
    const catalog = await queryOne<{
        content_type_id: number;
        source_platform_id: number;
    }>(
        database,
        `SELECT (SELECT id FROM wiki_story_content_types WHERE name='剧情')
                    AS content_type_id,
                (SELECT id FROM wiki_story_source_platforms WHERE name='Bilibili')
                    AS source_platform_id`
    );
    const card = await queryOne<{ id: number }>(
        database,
        `INSERT INTO wiki_story_cards
             (agency_id, idol_id, category_id, card_name, subtitle,
              cover_asset_id, display_order)
         VALUES (?, ?, ?, ?, ?, ?, 0) RETURNING id`,
        [
            project!.id,
            entryId,
            category!.id,
            '【第1话：第一步】',
            '出场：千奈, 广',
            cover!.id,
        ]
    );
    const legacyCard = await queryOne<{ id: number }>(
        database,
        `INSERT INTO wiki_story_cards
             (agency_id, idol_id, category_id, card_name, subtitle,
              image_file, display_order)
         VALUES (?, ?, ?, ?, ?, ?, 1) RETURNING id`,
        [
            project!.id,
            entryId,
            category!.id,
            '【第2话：并肩】',
            '#',
            'legacy.webp',
        ]
    );
    await queryOne(
        database,
        `INSERT INTO wiki_story_links
             (agency_id, card_id, up_name, video_title, url,
              content_type_id, source_platform_id, display_order)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
        [
            project!.id,
            card!.id,
            '某某UP',
            '【中字】第一话',
            'https://www.bilibili.com/video/BV1aa411c7m1',
            catalog!.content_type_id,
            catalog!.source_platform_id,
        ]
    );
    return {
        project,
        entryId,
        coverId: cover!.id,
        cardId: card!.id,
        legacyCardId: legacyCard!.id,
    };
}

/**
 * Row counts and contents of everything the export must leave untouched.
 *
 * The exporter is a read-only projection over the structured tables, so the test
 * compares a full snapshot before and after instead of trusting the handler.
 */
async function structuredSnapshot(
    database: PostgresTestDatabase,
    projectId: number
) {
    return queryOne<{
        cards: number;
        links: number;
        documents: number;
        card_fingerprint: string;
        link_fingerprint: string;
    }>(
        database,
        `SELECT (SELECT COUNT(*) FROM wiki_story_cards WHERE agency_id=?)::int AS cards,
                (SELECT COUNT(*) FROM wiki_story_links WHERE agency_id=?)::int AS links,
                (SELECT COUNT(*) FROM wiki_entry_documents)::int AS documents,
                (SELECT COALESCE(STRING_AGG(
                            card_name || '|' || COALESCE(subtitle, '') || '|' ||
                            COALESCE(image_file, '') || '|' ||
                            COALESCE(cover_asset_id::text, ''),
                            ';' ORDER BY id), '')
                   FROM wiki_story_cards WHERE agency_id=?) AS card_fingerprint,
                (SELECT COALESCE(STRING_AGG(
                            up_name || '|' || video_title || '|' || url,
                            ';' ORDER BY id), '')
                   FROM wiki_story_links WHERE agency_id=?) AS link_fingerprint`,
        [projectId, projectId, projectId, projectId]
    );
}

describe('wiki structured export API', () => {
    test('exports structured cards as a linted Markdown draft without writing', async () => {
        const database = await createPostgresTestDatabase('wiki-structured-export');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(
            database,
            new PostgresqlSchemaStrategy()
        );
        const app = storyRepositoryApp(repository);
        const { project, entryId, coverId, cardId, legacyCardId } =
            await seedEntry(database, 'export');
        const path = adminWikiEntryDocumentExportStructuredPath(entryId);
        const before = await structuredSnapshot(database, project!.id);

        const response = await request(app, 'POST', path, { body: {} });
        assert.equal(response.status, 200);
        assert.deepEqual(
            await readContractJson(
                response,
                adminWikiEntryDocumentExportStructuredSchema
            ),
            {
                status: 'success',
                markdown: [
                    ':::card-grid{title="S卡" layout="grid" filter="tags"}',
                    `:::card{id="${cardId}" title="【第1话：第一步】" tags="千奈,广" asset="cover:${coverId}"}`,
                    '- [剧情｜Bilibili｜某某UP](https://www.bilibili.com/video/BV1aa411c7m1) 【中字】第一话',
                    ':::',
                    `:::card{id="${legacyCardId}" title="【第2话：并肩】"}`,
                    ':::',
                    ':::',
                ].join('\n'),
                stats: {
                    categories: 1,
                    cards: 2,
                    links: 1,
                    collapsedCategories: 0,
                },
                lintWarnings: [
                    {
                        code: 'placeholder-subtitle',
                        context: 'S卡 / 【第2话：并肩】',
                        message: '副标题只是占位符「#」，草稿中已省略',
                    },
                    {
                        code: 'unmapped-card-image',
                        context: 'S卡 / 【第2话：并肩】',
                        message:
                            '卡片插图只存在于旧版图片文件，文档语法无法引用，草稿中已省略插图',
                    },
                ],
            }
        );

        // Nothing behind the endpoint may change: same rows, same contents,
        // and no document row is created by exporting.
        assert.deepEqual(await structuredSnapshot(database, project!.id), before);
    });

    test('honours the strip and collapse options and rejects bad input', async () => {
        const database = await createPostgresTestDatabase('wiki-structured-export-options');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(
            database,
            new PostgresqlSchemaStrategy()
        );
        const app = storyRepositoryApp(repository);
        const { entryId } = await seedEntry(database, 'opts');
        const path = adminWikiEntryDocumentExportStructuredPath(entryId);

        const stripped = await readContractJson(
            await request(app, 'POST', path, {
                body: { stripBrackets: true, collapseThreshold: 1 },
            }),
            adminWikiEntryDocumentExportStructuredSchema
        );
        assert.match(stripped.markdown, /title="第1话：第一步"/u);
        assert.match(stripped.markdown, /title="第2话：并肩"/u);
        assert.equal(stripped.stats.collapsedCategories, 1);

        const tooManyCategoriesOff = await readContractJson(
            await request(app, 'POST', path, {
                body: { collapseThreshold: 500 },
            }),
            adminWikiEntryDocumentExportStructuredSchema
        );
        assert.equal(tooManyCategoriesOff.stats.collapsedCategories, 0);

        const invalid = await request(app, 'POST', path, {
            body: { collapseThreshold: 0 },
        });
        assert.equal(invalid.status, 400);

        const noCsrf = await request(app, 'POST', path, {
            csrf: false,
            body: {},
        });
        assert.equal(noCsrf.status, 403);
    });

    test('reports a category that holds no cards', async () => {
        const database = await createPostgresTestDatabase(
            'wiki-structured-export-empty-category'
        );
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(
            database,
            new PostgresqlSchemaStrategy()
        );
        const app = storyRepositoryApp(repository);
        const { entryId, cardId } = await seedEntry(database, 'empty', {
            extraEmptyCategory: '活动',
        });
        const path = adminWikiEntryDocumentExportStructuredPath(entryId);

        const body = await readContractJson(
            await request(app, 'POST', path, { body: {} }),
            adminWikiEntryDocumentExportStructuredSchema
        );

        // The card data is unaffected; the empty category is only reported.
        assert.equal(body.stats.categories, 1);
        assert.match(body.markdown, /title="S卡"/u);
        assert.doesNotMatch(body.markdown, /活动/u);
        assert.deepEqual(
            body.lintWarnings.filter(
                (warning) => warning.code === 'empty-category'
            ),
            [
                {
                    code: 'empty-category',
                    context: '活动',
                    message:
                        '分类「活动」在该内容页没有任何卡片，草稿中没有对应区块',
                },
            ]
        );
        assert.match(body.markdown, new RegExp(`id="${cardId}"`, 'u'));
        assert.equal(
            body.markdown.split(':::card{').length - 1,
            2,
            'both cards still export'
        );
    });

    test('ignores entry_kind like the mislabelled 765PRO other pages', async () => {
        const database = await createPostgresTestDatabase(
            'wiki-structured-export-entry-kind'
        );
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(
            database,
            new PostgresqlSchemaStrategy()
        );
        const app = storyRepositoryApp(repository);
        const { entryId } = await seedEntry(database, 'kind');
        const path = adminWikiEntryDocumentExportStructuredPath(entryId);

        const readKind = async () =>
            (await queryOne<{ entry_kind: string }>(
                database,
                `SELECT entry_kind FROM wiki_entries WHERE id=?`,
                [entryId]
            ))!;
        assert.equal((await readKind()).entry_kind, 'idol');
        const asIdol = await readContractJson(
            await request(app, 'POST', path, { body: {} }),
            adminWikiEntryDocumentExportStructuredSchema
        );

        // 765PRO's 18 idol entries are all stored as `other`; the export must not
        // change shape when the label is wrong.
        await queryOne(
            database,
            `UPDATE wiki_entries SET entry_kind='other' WHERE id=?`,
            [entryId]
        );
        assert.equal((await readKind()).entry_kind, 'other');
        const asOther = await readContractJson(
            await request(app, 'POST', path, { body: {} }),
            adminWikiEntryDocumentExportStructuredSchema
        );

        assert.deepEqual(asOther, asIdol);
    });

    test('answers 404 for an unknown entry', async () => {        const database = await createPostgresTestDatabase('wiki-structured-export-missing');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(
            database,
            new PostgresqlSchemaStrategy()
        );
        const app = storyRepositoryApp(repository);

        const response = await request(
            app,
            'POST',
            adminWikiEntryDocumentExportStructuredPath(999999),
            { body: {} }
        );
        assert.equal(response.status, 404);
    });
});
