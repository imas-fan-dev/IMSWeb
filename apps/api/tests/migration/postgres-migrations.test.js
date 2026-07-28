'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const {
    applyMigrations,
    databaseUrl,
    parseArguments,
    readMigrations
} = require('../../scripts/migration/postgres-migrations');

test('PostgreSQL migrations are ordered and split around the data import', () => {
    const migrations = readMigrations();
    assert.deepEqual(
        migrations.map(({ version, phase }) => ({ version, phase })),
        [
            { version: '0001_initial_compatibility', phase: 'pre-data' },
            { version: '0002_legacy_card_emojis_fk', phase: 'post-data' },
            { version: '0003_s3_object_lifecycle', phase: 'post-data' },
            { version: '0004_site_packages', phase: 'pre-data' },
            { version: '0005_site_package_publication_owner', phase: 'pre-data' },
            { version: '0006_s3_semantic_physical_keys', phase: 'post-data' },
            { version: '0007_wiki_catalog_metadata', phase: 'post-data' },
            { version: '0008_auth_refresh_sessions', phase: 'pre-data' },
            { version: '0009_s3_public_storage_scope', phase: 'post-data' },
            { version: '0010_admin_roles', phase: 'post-data' },
            { version: '0011_wiki_dynamic_catalog', phase: 'post-data' },
            { version: '0012_wiki_normalized_stories', phase: 'post-data' },
            { version: '0013_wiki_image_transforms', phase: 'post-data' },
            { version: '0014_wiki_story_source_catalogs', phase: 'post-data' },
            { version: '0015_wiki_story_cover_assets', phase: 'post-data' },
            { version: '0016_wiki_soft_deletion', phase: 'post-data' },
            { version: '0017_wiki_entry_types', phase: 'post-data' }
        ]
    );
    for (const migration of migrations) assert.match(migration.checksum, /^[a-f0-9]{64}$/);
    const ownership = migrations.find(
        ({ version }) => version === '0005_site_package_publication_owner'
    );
    assert.match(ownership.sql, /UNIQUE \(package_id, id\)/);
    assert.match(ownership.sql, /FOREIGN KEY \(id, published_revision_id\)/);
    const catalog = migrations.find(
        ({ version }) => version === '0011_wiki_dynamic_catalog'
    );
    assert.match(catalog.sql, /DROP CONSTRAINT wiki_group_members_idol_id_key/);
    assert.match(catalog.sql, /UNIQUE \(agency_id, folder_name\)/);
    const stories = migrations.find(
        ({ version }) => version === '0012_wiki_normalized_stories'
    );
    assert.match(stories.sql, /CREATE TABLE public\.wiki_story_cards/);
    assert.match(stories.sql, /CREATE TABLE public\.wiki_story_links/);
    assert.match(stories.sql, /legacy_subtitle TEXT/);
    assert.match(stories.sql, /legacy_image_file TEXT/);
    assert.match(stories.sql, /legacy_projection EXCEPT SELECT \* FROM normalized_projection/);
    assert.match(stories.sql, /normalized_projection EXCEPT SELECT \* FROM legacy_projection/);
    assert.match(stories.sql, /GREATEST\([\s\S]+MAX\(legacy_id\)/);
    assert.doesNotMatch(stories.sql, /DROP TABLE public\.(?:"765_stories"|cg_stories)/);
    const imageTransforms = migrations.find(
        ({ version }) => version === '0013_wiki_image_transforms'
    );
    assert.match(imageTransforms.sql, /ALTER TABLE public\.wiki_story_cards/);
    assert.match(imageTransforms.sql, /ALTER COLUMN color DROP NOT NULL/);
    assert.match(imageTransforms.sql, /image_focal_x DOUBLE PRECISION/);
    assert.match(imageTransforms.sql, /icon_media_revision INTEGER/);
    const sourceCatalogs = migrations.find(
        ({ version }) => version === '0014_wiki_story_source_catalogs'
    );
    assert.match(sourceCatalogs.sql, /CREATE TABLE public\.wiki_story_content_types/);
    assert.match(sourceCatalogs.sql, /CREATE TABLE public\.wiki_story_source_platforms/);
    assert.match(sourceCatalogs.sql, /ADD COLUMN content_type_id BIGINT/);
    assert.match(sourceCatalogs.sql, /ADD COLUMN source_platform_id BIGINT/);
    assert.match(sourceCatalogs.sql, /ON DELETE RESTRICT/);
    const coverAssets = migrations.find(
        ({ version }) => version === '0015_wiki_story_cover_assets'
    );
    assert.match(coverAssets.sql, /CREATE TABLE public\.wiki_story_cover_assets/);
    assert.match(coverAssets.sql, /ADD COLUMN cover_asset_id BIGINT/);
    assert.match(coverAssets.sql, /cover_asset_id IS NULL OR image_file IS NULL/);
    assert.match(coverAssets.sql, /ON DELETE RESTRICT/);
    const softDeletion = migrations.find(
        ({ version }) => version === '0016_wiki_soft_deletion'
    );
    assert.match(softDeletion.sql, /ALTER TABLE public\.idols/);
    assert.match(softDeletion.sql, /ALTER TABLE public\.wiki_story_cards/);
    assert.match(softDeletion.sql, /ALTER TABLE public\.wiki_story_links/);
    assert.match(softDeletion.sql, /deleted_at TIMESTAMPTZ/);
    assert.match(softDeletion.sql, /WHERE deleted_at IS NULL/);
    const entryTypes = migrations.find(
        ({ version }) => version === '0017_wiki_entry_types'
    );
    assert.match(entryTypes.sql, /ADD COLUMN entry_kind TEXT/);
    assert.match(entryTypes.sql, /ADD COLUMN entry_subtype TEXT/);
    assert.match(entryTypes.sql, /groups\.code = 'sidem-units'/);
    assert.match(entryTypes.sql, /groups\.code = 'sidem-special'/);
});

test('PostgreSQL migration arguments require one PostgreSQL database URL', () => {
    assert.deepEqual(
        parseArguments(['--', '--migrations', '/tmp/migrations'], {
            DATABASE_URL: 'postgresql://imsweb:secret@localhost:5432/imsweb'
        }),
        {
            connectionString: 'postgresql://imsweb:secret@localhost:5432/imsweb',
            migrationsPath: '/tmp/migrations'
        }
    );
    assert.throws(() => databaseUrl({}), /DATABASE_URL is required/);
    assert.throws(() => databaseUrl({ DATABASE_URL: 'sqlite:///tmp/ims.db' }), /PostgreSQL URL/);
});

function migrationClient() {
    const rows = [];
    return {
        rows,
        async query(sql, values = []) {
            if (/SELECT version, filename, phase, checksum/.test(sql)) {
                return { rows: rows.map((row) => ({ ...row })) };
            }
            if (/INSERT INTO public\.ims_schema_migrations/.test(sql)) {
                rows.push({
                    version: values[0],
                    filename: values[1],
                    phase: values[2],
                    checksum: values[3]
                });
            }
            return { rows: [] };
        }
    };
}

test('PostgreSQL migration runner is repeatable and rejects checksum drift', async () => {
    const client = migrationClient();
    const migrations = readMigrations();
    const first = await applyMigrations(client, { migrations });
    assert.deepEqual(first.executed, [
        '0001_initial_compatibility',
        '0002_legacy_card_emojis_fk',
        '0003_s3_object_lifecycle',
        '0004_site_packages',
        '0005_site_package_publication_owner',
        '0006_s3_semantic_physical_keys',
        '0007_wiki_catalog_metadata',
        '0008_auth_refresh_sessions',
        '0009_s3_public_storage_scope',
        '0010_admin_roles',
        '0011_wiki_dynamic_catalog',
        '0012_wiki_normalized_stories',
        '0013_wiki_image_transforms',
        '0014_wiki_story_source_catalogs',
        '0015_wiki_story_cover_assets',
        '0016_wiki_soft_deletion',
        '0017_wiki_entry_types'
    ]);
    const second = await applyMigrations(client, { migrations });
    assert.deepEqual(second.executed, []);

    const drifted = migrations.map((migration, index) => index === 0
        ? { ...migration, checksum: '0'.repeat(64) }
        : migration
    );
    await assert.rejects(applyMigrations(client, { migrations: drifted }), /drifted/);
});
