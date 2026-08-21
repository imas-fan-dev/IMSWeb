'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const {
    applyMigrations,
    databaseUrl,
    migrationCatalog,
    parseArguments,
    readMigrations,
    validateMigrationFilenames
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
            { version: '0017_wiki_entry_types', phase: 'post-data' },
            { version: '0018_wiki_story_cover_presentation', phase: 'post-data' },
            { version: '0019_homepage_links', phase: 'post-data' },
            { version: '20260804095901_wiki_idol_url', phase: 'post-data' },
            {
                version: '20260805090000_wiki_story_content_type_icons',
                phase: 'post-data'
            },
            {
                version: '20260811090000_community_experience_consistency',
                phase: 'post-data'
            },
            {
                version: '20260811100000_wiki_category_revision',
                phase: 'post-data'
            },
            {
                version: '20260813000000_namecard_rejected_at',
                phase: 'post-data'
            },
            {
                version: '20260814155304_shared_request_controls',
                phase: 'post-data'
            },
            {
                version: '20260814170000_object_deletion_jobs',
                phase: 'post-data'
            },
            {
                version: '20260818101253_editorial_content_cms',
                phase: 'post-data'
            },
            {
                version: '20260819090000_community_posts_unification',
                phase: 'post-data'
            },
            {
                version: '20260822100000_editorial_presentation',
                phase: 'post-data'
            }
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
    const coverPresentation = migrations.find(
        ({ version }) => version === '0018_wiki_story_cover_presentation'
    );
    assert.match(coverPresentation.sql, /ADD COLUMN presentation_policy TEXT/);
    assert.match(coverPresentation.sql, /presentation_policy IN \('inherit', 'contain'\)/);
    const homepageLinks = migrations.find(
        ({ version }) => version === '0019_homepage_links'
    );
    assert.match(homepageLinks.sql, /CREATE TABLE public\.homepage_links/);
    assert.match(homepageLinks.sql, /INSERT INTO public\.homepage_links/);
    assert.match(homepageLinks.sql, /'navigation-events'/);
    const idolWikiUrl = migrations.find(
        ({ version }) => version === '20260804095901_wiki_idol_url'
    );
    assert.match(idolWikiUrl.sql, /ADD COLUMN wiki_url TEXT/);
    assert.match(idolWikiUrl.sql, /idols_wiki_url_http_check/);
    assert.match(idolWikiUrl.sql, /length\(wiki_url\) BETWEEN 1 AND 2048/);
    assert.match(idolWikiUrl.sql, /wiki_url ~\* '\^https\?:\/\/'/);
    const storyContentTypeIcons = migrations.find(
        ({ version }) => version === '20260805090000_wiki_story_content_type_icons'
    );
    assert.match(storyContentTypeIcons.sql, /ADD COLUMN icon_name TEXT/);
    assert.match(storyContentTypeIcons.sql, /WHEN '剧情' THEN 'book-open-text'/);
    assert.match(storyContentTypeIcons.sql, /wiki_story_content_types_icon_name_check/);
    const requestControls = migrations.find(
        ({ version }) => version === '20260814155304_shared_request_controls'
    );
    assert.match(requestControls.sql, /CREATE TABLE public\.request_idempotency_records/);
    assert.match(requestControls.sql, /CREATE TABLE public\.rate_limit_windows/);
    assert.match(requestControls.sql, /CREATE TABLE public\.rate_limit_identities/);
    assert.match(requestControls.sql, /ON DELETE CASCADE/);
    const objectDeletions = migrations.find(
        ({ version }) => version === '20260814170000_object_deletion_jobs'
    );
    assert.match(objectDeletions.sql, /CREATE TABLE public\.object_deletion_jobs/);
    assert.match(objectDeletions.sql, /target_kind IN \('prefix'\)/);
    assert.match(objectDeletions.sql, /lease_expires_at BIGINT/);
    assert.match(objectDeletions.sql, /object_deletion_jobs_candidates_idx/);
    assert.match(objectDeletions.sql, /object_deletion_jobs_completed_idx/);
    const editorialContent = migrations.find(
        ({ version }) => version === '20260818101253_editorial_content_cms'
    );
    assert.match(editorialContent.sql, /CREATE TABLE public\.articles/);
    assert.match(editorialContent.sql, /CREATE TABLE public\.article_assets/);
    assert.match(editorialContent.sql, /CREATE TABLE public\.chronicle_entries/);
    assert.match(editorialContent.sql, /ALTER TABLE public\.events/);
    assert.match(editorialContent.sql, /INSERT INTO public\.articles/);
    const communityPosts = migrations.find(
        ({ version }) => version === '20260819090000_community_posts_unification'
    );
    assert.match(communityPosts.sql, /ADD COLUMN source_url TEXT/);
    assert.match(communityPosts.sql, /CREATE TABLE public\.homepage_spotlight_entries/);
    assert.match(communityPosts.sql, /ON DELETE CASCADE/);
    const editorialPresentation = migrations.find(
        ({ version }) => version === '20260822100000_editorial_presentation'
    );
    assert.match(editorialPresentation.sql, /ADD COLUMN cover_focal_x DOUBLE PRECISION/);
    assert.match(editorialPresentation.sql, /ADD COLUMN related_links JSONB/);
    assert.match(editorialPresentation.sql, /registration_url/);
});

test('PostgreSQL migration arguments require one PostgreSQL database URL', () => {
    assert.deepEqual(
        parseArguments(['--', '--migrations', '/tmp/migrations'], {
            DATABASE_URL: 'postgresql://imsweb:secret@localhost:5432/imsweb'
        }),
        {
            command: 'migrate',
            connectionString: 'postgresql://imsweb:secret@localhost:5432/imsweb',
            migrationsPath: '/tmp/migrations'
        }
    );
    assert.deepEqual(parseArguments(['--list'], {}), {
        command: 'list',
        migrationsPath: path.resolve(__dirname, '../../migrations/postgresql')
    });
    assert.throws(() => databaseUrl({}), /DATABASE_URL is required/);
    assert.throws(() => databaseUrl({ DATABASE_URL: 'mysql://localhost/ims' }), /PostgreSQL URL/);
});

test('PostgreSQL migration catalog is available without a database connection', () => {
    const catalog = migrationCatalog();
    assert.equal(catalog.count, 29);
    assert.equal(catalog.migrations[0].version, '0001_initial_compatibility');
    assert.equal(
        catalog.migrations.at(-1).version,
        '20260822100000_editorial_presentation'
    );
    assert.match(catalog.migrations[0].checksum, /^[a-f0-9]{64}$/);
});

test('PostgreSQL migration names keep the frozen sequence and use UTC timestamps after it', () => {
    assert.doesNotThrow(() => validateMigrationFilenames([
        '0019_homepage_links.sql',
        '20260804095901_wiki_idol_url.sql'
    ]));
    assert.throws(
        () => validateMigrationFilenames(['0020_new_change.sql']),
        /14-digit UTC timestamp/
    );
    assert.throws(
        () => validateMigrationFilenames(['20261301000000_invalid_month.sql']),
        /Invalid PostgreSQL migration timestamp/
    );
    assert.throws(
        () => validateMigrationFilenames([
            '20260810010000_first.sql',
            '20260810010000_second.sql'
        ]),
        /Duplicate PostgreSQL migration prefix/
    );
});

function migrationClient(initialRows = []) {
    const rows = initialRows.map(({ version, filename, phase, checksum }) => ({
        version,
        filename,
        phase,
        checksum
    }));
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
        '0017_wiki_entry_types',
        '0018_wiki_story_cover_presentation',
        '0019_homepage_links',
        '20260804095901_wiki_idol_url',
        '20260805090000_wiki_story_content_type_icons',
        '20260811090000_community_experience_consistency',
        '20260811100000_wiki_category_revision',
        '20260813000000_namecard_rejected_at',
        '20260814155304_shared_request_controls',
        '20260814170000_object_deletion_jobs',
        '20260818101253_editorial_content_cms',
        '20260819090000_community_posts_unification',
        '20260822100000_editorial_presentation'
    ]);
    const second = await applyMigrations(client, { migrations });
    assert.deepEqual(second.executed, []);

    const drifted = migrations.map((migration, index) => index === 0
        ? { ...migration, checksum: '0'.repeat(64) }
        : migration
    );
    await assert.rejects(applyMigrations(client, { migrations: drifted }), /drifted/);
});

test('PostgreSQL migration runner rejects an applied migration deleted from the catalog', async () => {
    const [deleted, ...migrations] = readMigrations();
    const client = migrationClient([deleted]);

    await assert.rejects(
        applyMigrations(client, { migrations, phase: 'post-data' }),
        /Applied PostgreSQL migration drifted from catalog: 0001_initial_compatibility/
    );
    assert.equal(client.rows.length, 1);
});

test('PostgreSQL migration runner rejects an applied migration renamed in the catalog', async () => {
    const [applied, ...migrations] = readMigrations();
    const renamed = {
        ...applied,
        version: '20260811000000_initial_compatibility',
        filename: '20260811000000_initial_compatibility.sql'
    };
    const client = migrationClient([applied]);

    await assert.rejects(
        applyMigrations(client, { migrations: [...migrations, renamed] }),
        /Applied PostgreSQL migration drifted from catalog: 0001_initial_compatibility/
    );
    assert.equal(client.rows.length, 1);
});
