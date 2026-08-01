'use strict';

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const {
    applyMigrations,
    databaseUrl,
    parseArguments,
    readMigrations
} = require('../../scripts/migration/postgres-migrations');

test('released Platform account migrations remain byte-for-byte immutable', () => {
    const expected = new Map([
        ['core/0011_platform_accounts.sql',
            '26f13cd59482e7d08c97262fc8aa0ec41a03b45a2479d59e3959ca3f10fbd8ad'],
        ['postgresql/0020_platform_accounts.sql',
            'b7a67b066fd49fa3191a3ecc9c05881a753ca8c83950056bc3ac63d0d9e9734f']
    ]);
    for (const [relativePath, checksum] of expected) {
        const contents = fs.readFileSync(
            path.join(__dirname, '../../migrations', relativePath)
        );
        assert.equal(
            crypto.createHash('sha256').update(contents).digest('hex'),
            checksum,
            `${relativePath} changed after its release`
        );
    }
});

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
            { version: '0020_platform_accounts', phase: 'pre-data' },
            { version: '0021_backoffice_persistence_names', phase: 'post-data' }
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
    const platformAccounts = migrations.find(
        ({ version }) => version === '0020_platform_accounts'
    );
    for (const table of [
        'platform_accounts',
        'platform_profiles',
        'platform_oauth_providers',
        'platform_oauth_identities',
        'platform_oauth_states',
        'platform_refresh_sessions',
        'platform_email_credentials',
        'platform_security_events'
    ]) {
        assert.match(platformAccounts.sql, new RegExp(`CREATE TABLE public\\.${table}`));
    }
    assert.match(platformAccounts.sql, /status IN \('active', 'restricted', 'suspended', 'deleted'\)/);
    assert.match(platformAccounts.sql, /\('google', 'Google', TRUE\)/);
    assert.match(platformAccounts.sql, /\('github', 'GitHub', TRUE\)/);
    assert.match(platformAccounts.sql, /UNIQUE \(account_id, provider_code\)/);
    assert.match(platformAccounts.sql, /platform_refresh_sessions_account_idx/);
    assert.match(platformAccounts.sql, /algorithm IN \('pbkdf2-sha256', 'bcrypt'\)/);
    const backofficeNames = migrations.find(
        ({ version }) => version === '0021_backoffice_persistence_names'
    );
    assert.match(backofficeNames.sql, /ALTER TABLE public\.users RENAME TO backoffice_accounts/);
    assert.match(backofficeNames.sql, /RENAME COLUMN user_id TO account_id/);
    assert.match(backofficeNames.sql, /users_id_not_null TO backoffice_accounts_id_not_null/);
    assert.match(
        backofficeNames.sql,
        /auth_refresh_sessions_user_id_not_null[\s\S]+backoffice_refresh_sessions_account_id_not_null/
    );
    assert.match(backofficeNames.sql, /backoffice_refresh_sessions_account_idx/);
    assert.match(backofficeNames.sql, /CREATE VIEW public\.users AS/);
    assert.match(backofficeNames.sql, /CREATE VIEW public\.auth_refresh_sessions AS/);
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
    assert.throws(() => databaseUrl({ DATABASE_URL: 'mysql://localhost/ims' }), /PostgreSQL URL/);
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
        '0017_wiki_entry_types',
        '0018_wiki_story_cover_presentation',
        '0019_homepage_links',
        '0020_platform_accounts',
        '0021_backoffice_persistence_names'
    ]);
    const second = await applyMigrations(client, { migrations });
    assert.deepEqual(second.executed, []);

    const drifted = migrations.map((migration, index) => index === 0
        ? { ...migration, checksum: '0'.repeat(64) }
        : migration
    );
    await assert.rejects(applyMigrations(client, { migrations: drifted }), /drifted/);
});
