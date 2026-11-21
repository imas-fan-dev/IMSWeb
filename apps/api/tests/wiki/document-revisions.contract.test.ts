import { postgresTest as test } from '../postgres-test-database';
import assert from 'node:assert/strict';
import { describe } from 'vitest';
import {
    adminWikiEntryDocumentRevisionSchema,
    adminWikiEntryDocumentRevisionsSchema,
    adminWikiEntryDocumentSchema,
    adminWikiEntryDocumentSaveSchema,
    wikiErrorResponseSchema,
} from '@imsweb/contracts/wiki';
import {
    adminWikiEntryDocumentPath,
    adminWikiEntryDocumentRevisionPath,
    adminWikiEntryDocumentRevisionsPath,
} from '@imsweb/contracts/paths';
import { createHonoApp } from '@/app';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { SqlStoryRepository } from '@/infra/db/repositories/story-repository';
import { queryOne } from '@/infra/db/sql/query';
import { readContractJson } from '../contracts/contract-json';
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
        [`rv${suffix}`, `企划${suffix}`, '#445566']
    );
    const entry = await queryOne<{ id: number }>(
        database,
        `INSERT INTO wiki_entries (project_id, local_name_cn, storage_slug)
         VALUES (?, ?, ?) RETURNING id`,
        [project!.id, `条目${suffix}`, `entry_${suffix}`]
    );
    return { project: project!, entryId: entry!.id };
}

/** Saves `total` sequential document revisions, one HTTP `PUT` per revision. */
async function saveRevisions(
    app: ReturnType<typeof storyRepositoryApp>,
    entryId: number,
    total: number
) {
    for (let index = 0; index < total; index += 1) {
        const response = await request(app, 'PUT', adminWikiEntryDocumentPath(entryId), {
            body: {
                contentMode: 'document',
                sourceMarkdown: `## 第${index + 1}版\n`,
                expectedRevision: index,
                summary: `第${index + 1}版`,
            },
        });
        assert.equal(response.status, 200, `save #${index + 1} must succeed`);
    }
}

describe('wiki entry document revision history API', () => {
    test('lists the latest thirty snapshots newest first and keeps saving forward', async () => {
        const database = await createPostgresTestDatabase('wiki-document-history');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(database, new PostgresqlSchemaStrategy());
        const app = storyRepositoryApp(repository);
        const { entryId } = await seedEntry(database, 'hist');

        const emptyDocument = await readContractJson(
            await request(app, 'GET', adminWikiEntryDocumentPath(entryId)),
            adminWikiEntryDocumentSchema
        );
        assert.deepEqual(emptyDocument.revisionsSummary, {
            count: 0,
            latestRevision: null,
            latestCreatedAt: null,
        });
        const emptyList = await readContractJson(
            await request(app, 'GET', adminWikiEntryDocumentRevisionsPath(entryId)),
            adminWikiEntryDocumentRevisionsSchema
        );
        assert.deepEqual(emptyList, { status: 'success', revisions: [] });

        await saveRevisions(app, entryId, 32);

        const listed = await readContractJson(
            await request(app, 'GET', adminWikiEntryDocumentRevisionsPath(entryId)),
            adminWikiEntryDocumentRevisionsSchema
        );
        assert.equal(listed.revisions.length, 30);
        assert.deepEqual(
            listed.revisions.map((revision) => revision.revision),
            Array.from({ length: 30 }, (_, index) => 32 - index)
        );
        assert.deepEqual(listed.revisions[0], {
            revision: 32,
            summary: '第32版',
            createdBy: 'operator',
            createdAt: listed.revisions[0]!.createdAt,
        });
        assert.match(listed.revisions[0]!.createdAt, /^\d{4}-\d{2}-\d{2}T/);

        const detail = await readContractJson(
            await request(app, 'GET', adminWikiEntryDocumentRevisionPath(entryId, 7)),
            adminWikiEntryDocumentRevisionSchema
        );
        assert.deepEqual(detail, {
            status: 'success',
            revision: 7,
            summary: '第7版',
            createdBy: 'operator',
            createdAt: detail.createdAt,
            sourceMarkdown: '## 第7版\n',
        });

        const summary = await readContractJson(
            await request(app, 'GET', adminWikiEntryDocumentPath(entryId)),
            adminWikiEntryDocumentSchema
        );
        assert.deepEqual(summary.revisionsSummary, {
            count: 30,
            latestRevision: 32,
            latestCreatedAt: listed.revisions[0]!.createdAt,
        });

        // Revision 1 and 2 fell out of the retention window: they are gone,
        // not silently answered from the current document row.
        const pruned = await request(
            app,
            'GET',
            adminWikiEntryDocumentRevisionPath(entryId, 1)
        );
        assert.equal(pruned.status, 404);

        const forwarded = await readContractJson(
            await request(app, 'PUT', adminWikiEntryDocumentPath(entryId), {
                body: {
                    contentMode: 'document',
                    sourceMarkdown: '## 第33版\n',
                    expectedRevision: 32,
                    summary: '第33版',
                },
            }),
            adminWikiEntryDocumentSaveSchema
        );
        assert.equal(forwarded.revision, 33);

        const afterPrune = await readContractJson(
            await request(app, 'GET', adminWikiEntryDocumentRevisionsPath(entryId)),
            adminWikiEntryDocumentRevisionsSchema
        );
        assert.equal(afterPrune.revisions.length, 30);
        assert.equal(afterPrune.revisions[0]?.revision, 33);
        assert.equal(afterPrune.revisions.at(-1)?.revision, 4);
    });

    test('answers 404 for missing, pruned, and other entries revisions', async () => {
        const database = await createPostgresTestDatabase('wiki-document-history-404');
        await new PostgresqlSchemaStrategy().initializeStory(database);
        const repository = new SqlStoryRepository(database, new PostgresqlSchemaStrategy());
        const app = storyRepositoryApp(repository);
        const first = await seedEntry(database, 'one');
        const second = await seedEntry(database, 'two');

        await saveRevisions(app, first.entryId, 2);
        const secondRevision = await readContractJson(
            await request(app, 'PUT', adminWikiEntryDocumentPath(second.entryId), {
                body: {
                    contentMode: 'document',
                    sourceMarkdown: '## 乙页\n',
                    expectedRevision: 0,
                },
            }),
            adminWikiEntryDocumentSaveSchema
        );
        assert.equal(secondRevision.revision, 1);

        // Revision 2 exists for the first entry only: the second entry's path
        // must not reveal it, and both answers must be the same 404 body.
        const foreign = await request(
            app,
            'GET',
            adminWikiEntryDocumentRevisionPath(second.entryId, 2)
        );
        const missing = await request(
            app,
            'GET',
            adminWikiEntryDocumentRevisionPath(first.entryId, 99)
        );
        const unknownEntry = await request(
            app,
            'GET',
            adminWikiEntryDocumentRevisionPath(first.entryId + 9999, 1)
        );
        for (const response of [foreign, missing, unknownEntry]) {
            assert.equal(response.status, 404);
        }
        const bodies = await Promise.all(
            [foreign, missing, unknownEntry].map((response) =>
                readContractJson(response, wikiErrorResponseSchema)
            )
        );
        assert.deepEqual(bodies[0], bodies[1]);
        assert.deepEqual(bodies[1], bodies[2]);

        const own = await request(
            app,
            'GET',
            adminWikiEntryDocumentRevisionPath(second.entryId, 1)
        );
        assert.equal(own.status, 200);
        assert.equal(
            (await readContractJson(own, adminWikiEntryDocumentRevisionSchema)).sourceMarkdown,
            '## 乙页\n'
        );

        const unknownList = await request(
            app,
            'GET',
            adminWikiEntryDocumentRevisionsPath(first.entryId + 9999)
        );
        assert.equal(unknownList.status, 404);

        const anonymous = await app.request(
            `http://wiki.test${adminWikiEntryDocumentRevisionsPath(first.entryId)}`
        );
        assert.equal(anonymous.status, 401);
        const anonymousDetail = await app.request(
            `http://wiki.test${adminWikiEntryDocumentRevisionPath(first.entryId, 1)}`
        );
        assert.equal(anonymousDetail.status, 401);

        const negative = await request(
            app,
            'GET',
            adminWikiEntryDocumentRevisionPath(first.entryId, -1)
        );
        assert.equal(negative.status, 400);
    });
});
