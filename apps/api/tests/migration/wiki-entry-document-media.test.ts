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

const MEDIA_MIGRATION = '20261121140000_wiki_entry_document_media';

async function seedProjectEntry(
    database: Awaited<ReturnType<typeof createPostgresTestDatabase>>,
    suffix: string
): Promise<{ projectId: number; entryId: number }> {
    const project = await queryOne<{ id: number }>(
        database,
        `INSERT INTO projects (code, name_cn, color) VALUES (?, ?, ?) RETURNING id`,
        [`dm${suffix}`, `企划${suffix}`, '#445566']
    );
    const entry = await queryOne<{ id: number }>(
        database,
        `INSERT INTO wiki_entries (project_id, local_name_cn, storage_slug)
         VALUES (?, ?, ?) RETURNING id`,
        [project!.id, `条目${suffix}`, `entry_${suffix}`]
    );
    return { projectId: project!.id, entryId: entry!.id };
}

async function seedCoverAsset(
    database: Awaited<ReturnType<typeof createPostgresTestDatabase>>,
    projectId: number,
    name: string
): Promise<number> {
    const asset = await queryOne<{ id: number }>(
        database,
        `INSERT INTO wiki_story_cover_assets (agency_id, name, object_key, display_order)
         VALUES (?, ?, ?, 0) RETURNING id`,
        [projectId, name, `wiki/agencies/${projectId}/story-cover-assets/${name}.webp`]
    );
    return asset!.id;
}

describe('wiki entry document media migration', () => {
    test('creates entry document media and shared cover reference tables', async () => {
        const database = await createPostgresTestDatabase('wiki-doc-media-schema');
        await new PostgresqlSchemaStrategy().initializeStory(database);

        const mediaColumns = await queryAll<ColumnRow>(
            database,
            `SELECT column_name, is_nullable
               FROM information_schema.columns
              WHERE table_schema='public' AND table_name='wiki_entry_document_media'
              ORDER BY ordinal_position`
        );
        assert.deepEqual(mediaColumns, [
            { column_name: 'id', is_nullable: 'NO' },
            { column_name: 'project_id', is_nullable: 'NO' },
            { column_name: 'entry_id', is_nullable: 'NO' },
            { column_name: 'object_key', is_nullable: 'NO' },
            { column_name: 'alt_text', is_nullable: 'NO' },
            { column_name: 'created_at', is_nullable: 'NO' },
        ]);

        const refColumns = await queryAll<ColumnRow>(
            database,
            `SELECT column_name, is_nullable
               FROM information_schema.columns
              WHERE table_schema='public' AND table_name='wiki_entry_document_cover_refs'
              ORDER BY ordinal_position`
        );
        assert.deepEqual(refColumns, [
            { column_name: 'entry_id', is_nullable: 'NO' },
            { column_name: 'project_id', is_nullable: 'NO' },
            { column_name: 'cover_asset_id', is_nullable: 'NO' },
        ]);
    });

    test('enforces one object key per upload and one cover reference per document', async () => {
        const database = await createPostgresTestDatabase('wiki-doc-media-keys');
        const { projectId, entryId } = await seedProjectEntry(database, 'keys');
        await executeSql(
            database,
            `INSERT INTO wiki_entry_documents (entry_id, project_id) VALUES (?, ?)`,
            [entryId, projectId]
        );
        const assetId = await seedCoverAsset(database, projectId, '唯一封面');
        await executeSql(
            database,
            `INSERT INTO wiki_entry_document_media (project_id, entry_id, object_key)
             VALUES (?, ?, ?)`,
            [projectId, entryId, 'wiki/projects/keys/document/one.webp']
        );

        await assert.rejects(
            () =>
                executeSql(
                    database,
                    `INSERT INTO wiki_entry_document_media (project_id, entry_id, object_key)
                     VALUES (?, ?, ?)`,
                    [projectId, entryId, 'wiki/projects/keys/document/one.webp']
                ),
            /duplicate key value violates unique constraint/
        );

        await executeSql(
            database,
            `INSERT INTO wiki_entry_document_cover_refs
                 (entry_id, project_id, cover_asset_id) VALUES (?, ?, ?)`,
            [entryId, projectId, assetId]
        );
        await assert.rejects(
            () =>
                executeSql(
                    database,
                    `INSERT INTO wiki_entry_document_cover_refs
                         (entry_id, project_id, cover_asset_id) VALUES (?, ?, ?)`,
                    [entryId, projectId, assetId]
                ),
            /duplicate key value violates unique constraint/
        );
        const references = await queryAll<{ cover_asset_id: number }>(
            database,
            `SELECT cover_asset_id FROM wiki_entry_document_cover_refs WHERE entry_id=?`,
            [entryId]
        );
        assert.deepEqual(references, [{ cover_asset_id: assetId }]);
    });

    test('refuses to start when the deployment skipped the media migration', async () => {
        const database = await createPostgresTestDatabase('wiki-doc-media-guard');
        await executeSql(
            database,
            'DELETE FROM ims_schema_migrations WHERE version=?',
            [MEDIA_MIGRATION]
        );
        await assert.rejects(
            () => new PostgresqlSchemaStrategy().initializeStory(database),
            new RegExp(`${MEDIA_MIGRATION} is required`)
        );
    });

    test('rejects a cover reference that points at another project', async () => {
        const database = await createPostgresTestDatabase('wiki-doc-media-cross');
        const own = await seedProjectEntry(database, 'own');
        const other = await seedProjectEntry(database, 'other');
        await executeSql(
            database,
            `INSERT INTO wiki_entry_documents (entry_id, project_id) VALUES (?, ?)`,
            [own.entryId, own.projectId]
        );
        const foreignAsset = await seedCoverAsset(
            database,
            other.projectId,
            '别人家的封面'
        );

        await assert.rejects(
            () =>
                executeSql(
                    database,
                    `INSERT INTO wiki_entry_document_cover_refs
                         (entry_id, project_id, cover_asset_id) VALUES (?, ?, ?)`,
                    [own.entryId, own.projectId, foreignAsset]
                ),
            /violates foreign key constraint/
        );
    });

    test('blocks deleting a shared cover asset that a document still references', async () => {
        const database = await createPostgresTestDatabase('wiki-doc-media-restrict');
        const { projectId, entryId } = await seedProjectEntry(database, 'restrict');
        await executeSql(
            database,
            `INSERT INTO wiki_entry_documents (entry_id, project_id) VALUES (?, ?)`,
            [entryId, projectId]
        );
        const assetId = await seedCoverAsset(database, projectId, '共享封面');
        await executeSql(
            database,
            `INSERT INTO wiki_entry_document_cover_refs
                 (entry_id, project_id, cover_asset_id) VALUES (?, ?, ?)`,
            [entryId, projectId, assetId]
        );

        await assert.rejects(
            () =>
                executeSql(
                    database,
                    'DELETE FROM wiki_story_cover_assets WHERE id=?',
                    [assetId]
                ),
            /violates RESTRICT setting of foreign key constraint/
        );

        await executeSql(
            database,
            'DELETE FROM wiki_entry_document_cover_refs WHERE entry_id=?',
            [entryId]
        );
        await executeSql(
            database,
            'DELETE FROM wiki_story_cover_assets WHERE id=?',
            [assetId]
        );
        const remaining = await queryOne<{ count: string }>(
            database,
            `SELECT COUNT(*)::text AS count FROM wiki_story_cover_assets WHERE id=?`,
            [assetId]
        );
        assert.deepEqual(remaining, { count: '0' });
    });
});
