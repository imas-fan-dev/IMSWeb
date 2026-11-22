import { postgresTest as test } from '../postgres-test-database';
import assert from 'node:assert/strict';
import { describe } from 'vitest';
import { PostgresqlSchemaStrategy } from '@/infra/db/postgresql/schema-strategy';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';
import { createPostgresTestDatabase } from '../postgres-test-database';

interface ColumnRow {
    column_name: string;
    is_nullable: string;
}

const DOCUMENT_MIGRATION = '20261122120000_wiki_entry_documents';

async function seedEntry(
    database: Awaited<ReturnType<typeof createPostgresTestDatabase>>,
    suffix: string
): Promise<{ projectId: number; entryId: number }> {
    const project = await queryOne<{ id: number }>(
        database,
        `INSERT INTO projects (code, name_cn, color) VALUES (?, ?, ?) RETURNING id`,
        [`wp${suffix}`, `企划${suffix}`, '#112233']
    );
    const entry = await queryOne<{ id: number }>(
        database,
        `INSERT INTO wiki_entries (project_id, local_name_cn, storage_slug)
         VALUES (?, ?, ?) RETURNING id`,
        [project!.id, `条目${suffix}`, `entry_${suffix}`]
    );
    return { projectId: project!.id, entryId: entry!.id };
}

describe('wiki entry document migration', () => {
    test('adds content mode, the document table, and revision snapshots', async () => {
        const database = await createPostgresTestDatabase('wiki-documents-migration');
        await new PostgresqlSchemaStrategy().initializeStory(database);

        const entryColumns = await queryAll<ColumnRow>(
            database,
            `SELECT column_name, is_nullable
               FROM information_schema.columns
              WHERE table_schema='public' AND table_name='wiki_entries'
                AND column_name='content_mode'`
        );
        assert.deepEqual(entryColumns, [
            { column_name: 'content_mode', is_nullable: 'NO' },
        ]);

        const documentColumns = await queryAll<ColumnRow>(
            database,
            `SELECT column_name, is_nullable
               FROM information_schema.columns
              WHERE table_schema='public' AND table_name='wiki_entry_documents'
              ORDER BY ordinal_position`
        );
        assert.deepEqual(documentColumns, [
            { column_name: 'entry_id', is_nullable: 'NO' },
            { column_name: 'project_id', is_nullable: 'NO' },
            { column_name: 'source_markdown', is_nullable: 'NO' },
            { column_name: 'compiled_ast', is_nullable: 'NO' },
            { column_name: 'plain_text', is_nullable: 'NO' },
            { column_name: 'revision', is_nullable: 'NO' },
            { column_name: 'updated_by', is_nullable: 'YES' },
            { column_name: 'updated_at', is_nullable: 'NO' },
        ]);

        const revisionColumns = await queryAll<ColumnRow>(
            database,
            `SELECT column_name, is_nullable
               FROM information_schema.columns
              WHERE table_schema='public' AND table_name='wiki_entry_document_revisions'
              ORDER BY ordinal_position`
        );
        assert.deepEqual(revisionColumns, [
            { column_name: 'id', is_nullable: 'NO' },
            { column_name: 'entry_id', is_nullable: 'NO' },
            { column_name: 'revision', is_nullable: 'NO' },
            { column_name: 'source_markdown', is_nullable: 'NO' },
            { column_name: 'summary', is_nullable: 'NO' },
            { column_name: 'created_by', is_nullable: 'YES' },
            { column_name: 'created_at', is_nullable: 'NO' },
        ]);
    });

    test('refuses to start when the deployment skipped the additive migration', async () => {
        const database = await createPostgresTestDatabase('wiki-documents-guard');
        await executeSql(
            database,
            'DELETE FROM ims_schema_migrations WHERE version=?',
            [DOCUMENT_MIGRATION]
        );
        await assert.rejects(
            () => new PostgresqlSchemaStrategy().initializeStory(database),
            new RegExp(`${DOCUMENT_MIGRATION} is required`)
        );
    });

    test('defaults existing entries to structured and rejects unknown modes', async () => {
        const database = await createPostgresTestDatabase('wiki-documents-mode');
        const { projectId, entryId } = await seedEntry(database, 'mode');

        const entry = await queryOne<{ content_mode: string }>(
            database,
            'SELECT content_mode FROM wiki_entries WHERE id=?',
            [entryId]
        );
        assert.deepEqual(entry, { content_mode: 'structured' });

        await assert.rejects(
            () =>
                executeSql(
                    database,
                    'UPDATE wiki_entries SET content_mode=? WHERE id=?',
                    ['rich-text', entryId]
                ),
            /violates check constraint/
        );

        await executeSql(
            database,
            'UPDATE wiki_entries SET content_mode=? WHERE id=?',
            ['document', entryId]
        );
        const switched = await queryOne<{ content_mode: string }>(
            database,
            'SELECT content_mode FROM wiki_entries WHERE id=?',
            [entryId]
        );
        assert.deepEqual(switched, { content_mode: 'document' });
        assert.equal(projectId > 0, true);
    });

    test('keeps one document per entry and unique revision numbers with cascade delete', async () => {
        const database = await createPostgresTestDatabase('wiki-documents-revisions');
        const { projectId, entryId } = await seedEntry(database, 'rev');

        await executeSql(
            database,
            `INSERT INTO wiki_entry_documents (entry_id, project_id) VALUES (?, ?)`,
            [entryId, projectId]
        );
        const document = await queryOne<{
            revision: number;
            plain_text: string;
            source_markdown: string;
            compiled_ast: { version: number; blocks: unknown[] };
        }>(
            database,
            `SELECT revision, plain_text, source_markdown, compiled_ast
               FROM wiki_entry_documents WHERE entry_id=?`,
            [entryId]
        );
        assert.deepEqual(document, {
            revision: 0,
            plain_text: '',
            source_markdown: '',
            compiled_ast: { version: 1, headings: [], availableTags: [], blocks: [] },
        });

        await assert.rejects(
            () =>
                executeSql(
                    database,
                    `INSERT INTO wiki_entry_documents (entry_id, project_id) VALUES (?, ?)`,
                    [entryId, projectId]
                ),
            /duplicate key/
        );

        await executeSql(
            database,
            `INSERT INTO wiki_entry_document_revisions (entry_id, revision, source_markdown)
             VALUES (?, ?, ?), (?, ?, ?)`,
            [entryId, 0, '## 一', entryId, 1, '## 二']
        );
        await assert.rejects(
            () =>
                executeSql(
                    database,
                    `INSERT INTO wiki_entry_document_revisions (entry_id, revision, source_markdown)
                     VALUES (?, ?, ?)`,
                    [entryId, 1, '## 重复']
                ),
            /duplicate key/
        );

        await executeSql(database, 'DELETE FROM wiki_entries WHERE id=?', [entryId]);
        const remaining = await queryOne<{ count: string }>(
            database,
            `SELECT COUNT(*)::text AS count FROM wiki_entry_document_revisions WHERE entry_id=?`,
            [entryId]
        );
        assert.deepEqual(remaining, { count: '0' });
        const remainingDocument = await queryOne<{ count: string }>(
            database,
            `SELECT COUNT(*)::text AS count FROM wiki_entry_documents WHERE entry_id=?`,
            [entryId]
        );
        assert.deepEqual(remainingDocument, { count: '0' });
    });
});
