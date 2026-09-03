

const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
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

test('released Platform and Fudaba migrations remain byte-for-byte immutable', () => {
    const expected = new Map([
        ['postgresql/0020_platform_accounts.sql',
            'b7a67b066fd49fa3191a3ecc9c05881a753ca8c83950056bc3ac63d0d9e9734f'],
        ['postgresql/0022_fudaba_domain.sql',
            '718e476b3db6828130a75fd4e10933c1ceac765ea203495ba0eb9320b78d905a'],
        ['postgresql/0025_platform_email_verification.sql',
            '987e277a19c4637244737480a28eb8cc04d156039dfe4115855c1b879a6cf2bd'],
        ['postgresql/20260818000000_platform_password_reset.sql',
            'e2d8080805a9f769201e48e196000c38a54f3f47314d579bf47d240492e16524'],
        ['postgresql/20260818010000_platform_oauth_configuration.sql',
            '228603876f6ae11ee45e013c9394d096a4c72a0ce220ccb3eed8f065a538db5c'],
        ['postgresql/20260819000000_namecard_unification_foundation.sql',
            '047f681b92d4fab968ef91245885ce00eb746e6859a75b534212aac397e33e5f'],
        ['postgresql/20260820000000_namecard_guest_profile.sql',
            '7794d905f4e11785b81f6a34067f32580a50a93e31d2853aaf41ac1990ad9070'],
        ['postgresql/20260821000000_namecard_reaction_reconciliation.sql',
            '592f38a3e8b42a0158fc8d916dbdb1803755ecfdc2d4c97dc143e62da4707f05'],
        ['postgresql/20260826130000_namecard_legacy_tables_read_only.sql',
            '059a6e81b65c5abf3db76813b85d0388cdc05d7829f11870d546b97b3fa31213']
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
            { version: '0021_backoffice_persistence_names', phase: 'post-data' },
            { version: '0022_fudaba_domain', phase: 'post-data' },
            { version: '0023_fudaba_public_locations', phase: 'post-data' },
            { version: '0024_fudaba_office_workflows', phase: 'post-data' },
            { version: '0025_platform_email_verification', phase: 'post-data' },
            { version: '0026_platform_email_verification_delivery', phase: 'post-data' },
            { version: '0027_fudaba_agency_catalog', phase: 'post-data' },
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
                version: '20260816193000_namecard_ownership_foundation',
                phase: 'post-data'
            },
            {
                version: '20260818000000_platform_password_reset',
                phase: 'post-data'
            },
            {
                version: '20260818010000_platform_oauth_configuration',
                phase: 'post-data'
            },
            {
                version: '20260818101253_editorial_content_cms',
                phase: 'post-data'
            },
            {
                version: '20260819000000_namecard_unification_foundation',
                phase: 'post-data'
            },
            {
                version: '20260819090000_community_posts_unification',
                phase: 'post-data'
            },
            {
                version: '20260820000000_namecard_guest_profile',
                phase: 'post-data'
            },
            {
                version: '20260821000000_namecard_reaction_reconciliation',
                phase: 'post-data'
            },
            {
                version: '20260822100000_editorial_presentation',
                phase: 'post-data'
            },
            {
                version: '20260826130000_namecard_legacy_tables_read_only',
                phase: 'post-data'
            },
            {
                version: '20260901140000_dynamic_platform_oauth_providers',
                phase: 'post-data'
            },
            {
                version: '20260902120000_platform_session_devices',
                phase: 'post-data'
            },
            {
                version: '20260903110000_editorial_legacy_event_cutover',
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
    const dynamicOAuth = migrations.find(
        ({ version }) => version === '20260901140000_dynamic_platform_oauth_providers'
    );
    assert.match(dynamicOAuth.sql, /ADD COLUMN authorization_endpoint TEXT/);
    assert.match(dynamicOAuth.sql, /ADD COLUMN button_color TEXT/);
    assert.match(dynamicOAuth.sql, /token_auth_method IN \('client_secret_post', 'client_secret_basic'\)/);
    assert.match(dynamicOAuth.sql, /profile_subject_path TEXT NOT NULL/);
    assert.match(dynamicOAuth.sql, /sort_order INTEGER NOT NULL/);
    assert.match(dynamicOAuth.sql, /WHERE code = 'google'/);
    assert.match(dynamicOAuth.sql, /WHERE code = 'github'/);
    const sessionDevices = migrations.find(
        ({ version }) => version === '20260902120000_platform_session_devices'
    );
    assert.match(sessionDevices.sql, /ALTER TABLE public\.platform_refresh_sessions/);
    assert.match(sessionDevices.sql, /ADD COLUMN user_agent TEXT/);
    assert.match(sessionDevices.sql, /ADD COLUMN ip_address TEXT/);
    assert.match(sessionDevices.sql, /ADD COLUMN last_seen_at BIGINT/);
    assert.match(
        sessionDevices.sql,
        /CHECK \(last_seen_at IS NULL OR last_seen_at >= created_at\)/
    );
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
    const fudabaDomain = migrations.find(
        ({ version }) => version === '0022_fudaba_domain'
    );
    for (const table of [
        'fudaba_offices',
        'fudaba_series_tags',
        'fudaba_office_series_tags',
        'fudaba_cards',
        'fudaba_office_cards',
        'fudaba_messages',
        'fudaba_exchange_requests',
        'fudaba_card_likes',
        'fudaba_card_favorites',
        'fudaba_moderation_cases'
    ]) {
        assert.match(fudabaDomain.sql, new RegExp(`CREATE TABLE public\\.${table}`));
    }
    for (const seriesCode of [
        '765as',
        'cinderella',
        'million-live',
        'sidem',
        'shiny-colors',
        'gakuen',
        'valiv'
    ]) {
        assert.match(fudabaDomain.sql, new RegExp(`\\('${seriesCode}',`));
    }
    assert.match(fudabaDomain.sql, /REFERENCES public\.platform_accounts\(id\)/);
    assert.match(fudabaDomain.sql, /REFERENCES public\.backoffice_accounts\(id\)/);
    assert.match(
        fudabaDomain.sql,
        /FOREIGN KEY \(wanted_card_id, recipient_account_id\)[\s\S]+REFERENCES public\.fudaba_cards\(id, owner_account_id\)/
    );
    assert.match(
        fudabaDomain.sql,
        /publication_status <> 'published' OR media_rights_status = 'approved'/
    );
    assert.match(fudabaDomain.sql, /CREATE UNIQUE INDEX fudaba_exchange_requests_pending_idx/);
    assert.match(fudabaDomain.sql, /CREATE FUNCTION public\.fudaba_require_active_office\(\)/);
    assert.match(fudabaDomain.sql, /CREATE FUNCTION public\.fudaba_validate_exchange_ownership\(\)/);
    assert.match(fudabaDomain.sql, /CREATE FUNCTION public\.fudaba_validate_exchange_transition\(\)/);
    assert.match(fudabaDomain.sql, /FUDABA_OFFICE_ARCHIVED/);
    assert.match(fudabaDomain.sql, /FUDABA_OFFERED_CARD_NOT_OWNED/);
    assert.match(fudabaDomain.sql, /FUDABA_EXCHANGE_INVALID_TRANSITION/);
    const publicLocations = migrations.find(
        ({ version }) => version === '0023_fudaba_public_locations'
    );
    assert.match(
        publicLocations.sql,
        /CREATE TABLE public\.fudaba_office_public_locations/
    );
    assert.match(
        publicLocations.sql,
        /office_id TEXT PRIMARY KEY[\s\S]+REFERENCES public\.fudaba_offices\(id\) ON DELETE CASCADE/
    );
    assert.match(publicLocations.sql, /latitude_e1 BETWEEN -600 AND 600/);
    assert.doesNotMatch(publicLocations.sql, /latitude_e1 BETWEEN -900 AND 900/);
    assert.match(publicLocations.sql, /longitude_e1 BETWEEN -1800 AND 1800/);
    assert.match(
        publicLocations.sql,
        /review_state IN \('pending', 'published', 'rejected'\)/
    );
    assert.match(
        publicLocations.sql,
        /REFERENCES public\.backoffice_accounts\(id\) ON DELETE RESTRICT/
    );
    assert.match(publicLocations.sql, /review_audit_id UUID UNIQUE/);
    assert.match(
        publicLocations.sql,
        /reviewed_at IS NULL OR reviewed_at >= submitted_at/
    );
    assert.match(
        publicLocations.sql,
        /review_state = 'pending'[\s\S]+reviewed_at IS NULL[\s\S]+reviewed_by IS NULL[\s\S]+review_audit_id IS NULL[\s\S]+review_note = ''/
    );
    assert.match(
        publicLocations.sql,
        /review_state IN \('published', 'rejected'\)[\s\S]+reviewed_at IS NOT NULL[\s\S]+reviewed_by IS NOT NULL[\s\S]+review_audit_id IS NOT NULL/
    );
    assert.match(publicLocations.sql, /length\(review_note\) <= 1000/);
    assert.match(
        publicLocations.sql,
        /review_state <> 'rejected'[\s\S]+length\(btrim\(review_note, E' \\t\\n\\v\\f\\r'\)\) BETWEEN 1 AND 1000/
    );
    assert.match(
        publicLocations.sql,
        /fudaba_office_public_locations_public_idx[\s\S]+latitude_e1, longitude_e1, office_id[\s\S]+WHERE review_state = 'published'/
    );
    assert.match(
        publicLocations.sql,
        /fudaba_office_public_locations_review_queue_idx[\s\S]+review_state, submitted_at, office_id[\s\S]+\);/
    );
    const reviewQueueIndex = publicLocations.sql.match(
        /CREATE INDEX fudaba_office_public_locations_review_queue_idx[\s\S]+?;/
    )?.[0];
    assert.ok(reviewQueueIndex);
    assert.doesNotMatch(reviewQueueIndex, /WHERE/);
    assert.match(
        publicLocations.sql,
        /fudaba_office_public_locations_reviewer_idx[\s\S]+reviewed_by, reviewed_at DESC, office_id[\s\S]+WHERE reviewed_by IS NOT NULL/
    );
    assert.match(
        publicLocations.sql,
        /CREATE TABLE public\.fudaba_rate_limit_windows \([\s\S]+bucket TEXT NOT NULL[\s\S]+key_hash TEXT NOT NULL[\s\S]+hits INTEGER NOT NULL[\s\S]+window_seconds INTEGER NOT NULL[\s\S]+reset_at BIGINT NOT NULL/
    );
    assert.match(
        publicLocations.sql,
        /length\(bucket\) BETWEEN 1 AND 128[\s\S]+length\(btrim\(bucket, E' \\t\\n\\v\\f\\r'\)\) = length\(bucket\)/
    );
    assert.match(publicLocations.sql, /key_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
    assert.match(publicLocations.sql, /hits INTEGER NOT NULL CHECK \(hits > 0\)/);
    assert.match(
        publicLocations.sql,
        /window_seconds INTEGER NOT NULL CHECK \(window_seconds > 0\)/
    );
    assert.match(publicLocations.sql, /reset_at BIGINT NOT NULL CHECK \(reset_at > 0\)/);
    assert.match(publicLocations.sql, /PRIMARY KEY \(bucket, key_hash\)/);
    assert.match(
        publicLocations.sql,
        /CREATE INDEX fudaba_rate_limit_windows_reset_at_idx[\s\S]+fudaba_rate_limit_windows\(reset_at\)/
    );
    const officeWorkflows = migrations.find(
        ({ version }) => version === '0024_fudaba_office_workflows'
    );
    assert.match(
        officeWorkflows.sql,
        /ADD COLUMN pending_cover_object_key TEXT[\s\S]+pending_cover_submitted_at TIMESTAMPTZ/
    );
    assert.match(
        officeWorkflows.sql,
        /pending_cover_submitted_at >= created_at[\s\S]+pending_cover_object_key IS DISTINCT FROM cover_object_key/
    );
    assert.match(officeWorkflows.sql, /fudaba_offices_pending_cover_idx/);
    assert.match(
        officeWorkflows.sql,
        /ADD COLUMN revision INTEGER NOT NULL DEFAULT 0[\s\S]+ADD COLUMN updated_at TIMESTAMPTZ/
    );
    assert.match(
        officeWorkflows.sql,
        /UPDATE public\.fudaba_office_cards SET updated_at = pinned_at/
    );
    assert.match(
        officeWorkflows.sql,
        /fudaba_validate_placement_transition[\s\S]+NEW\.updated_at := COALESCE\(NEW\.updated_at, NEW\.pinned_at\)[\s\S]+FUDABA_PLACEMENT_STALE_UPDATE/
    );
    assert.match(
        officeWorkflows.sql,
        /hidden_by_account_id TEXT[\s\S]+REFERENCES public\.platform_accounts\(id\) ON DELETE RESTRICT/
    );
    assert.match(
        officeWorkflows.sql,
        /\(hidden_at IS NULL\) = \(hidden_by_account_id IS NULL\)/
    );
    assert.match(
        officeWorkflows.sql,
        /SELECT status INTO office_status[\s\S]+FOR NO KEY UPDATE[\s\S]+office_status IS DISTINCT FROM 'active'/
    );
    assert.match(
        officeWorkflows.sql,
        /CREATE TABLE public\.fudaba_geocoder_cache[\s\S]+PRIMARY KEY \(provider, query_hash\)/
    );
    assert.match(officeWorkflows.sql, /octet_length\(response_json\) BETWEEN 2 AND 65536/);
    assert.match(
        officeWorkflows.sql,
        /CREATE TABLE public\.fudaba_mutation_receipts[\s\S]+PRIMARY KEY \(scope, account_id, key_hash\)/
    );
    assert.match(officeWorkflows.sql, /request_hash ~ '\^\[0-9a-f\]\{64\}\$'/);
    assert.doesNotMatch(officeWorkflows.sql, /raw_(?:query|key|body)/i);
    const emailVerification = migrations.find(
        ({ version }) => version === '0025_platform_email_verification'
    );
    assert.match(
        emailVerification.sql,
        /CREATE TABLE public\.platform_email_verification_codes/
    );
    assert.match(
        emailVerification.sql,
        /normalized_email TEXT PRIMARY KEY[\s\S]+normalized_email = lower\(btrim\(normalized_email\)\)/
    );
    assert.match(
        emailVerification.sql,
        /code_hash TEXT NOT NULL CHECK \(code_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/
    );
    assert.match(emailVerification.sql, /attempts_remaining BETWEEN 0 AND 5/);
    assert.match(
        emailVerification.sql,
        /consumed_token IS NULL OR consumed_token ~ '\^\[a-f0-9\]\{64\}\$'/
    );
    assert.match(emailVerification.sql, /CHECK \(expires_at > created_at\)/);
    assert.match(
        emailVerification.sql,
        /resend_after >= created_at AND resend_after <= expires_at/
    );
    assert.match(
        emailVerification.sql,
        /CREATE INDEX platform_email_verification_expiry_idx[\s\S]+platform_email_verification_codes\(expires_at\)/
    );
    const emailVerificationDelivery = migrations.find(
        ({ version }) => version === '0026_platform_email_verification_delivery'
    );
    assert.match(
        emailVerificationDelivery.sql,
        /ADD COLUMN pending_token TEXT[\s\S]+ADD COLUMN delivery_token TEXT/
    );
    assert.match(
        emailVerificationDelivery.sql,
        /platform_email_verification_pending_candidate_ck[\s\S]+pending_expires_at > pending_created_at/
    );
    assert.match(
        emailVerificationDelivery.sql,
        /delivery_token ~ '\^\[a-f0-9\]\{64\}\$'/
    );
    const fudabaAgencyCatalog = migrations.find(
        ({ version }) => version === '0027_fudaba_agency_catalog'
    );
    assert.match(
        fudabaAgencyCatalog.sql,
        /FUDABA_VALIV_AGENCY_RECONCILIATION_REQUIRED/
    );
    assert.match(
        fudabaAgencyCatalog.sql,
        /FUDABA_CANONICAL_AGENCY_MISSING/
    );
    for (const [sourceCode, agencyCode] of [
        ['765as', '765'],
        ['cinderella', 'cg'],
        ['million-live', 'ml'],
        ['sidem', 'sidem'],
        ['shiny-colors', 'sc'],
        ['gakuen', 'gk']
    ]) {
        assert.match(
            fudabaAgencyCatalog.sql,
            new RegExp(`WHEN '${sourceCode}' THEN '${agencyCode}'`)
        );
    }
    assert.doesNotMatch(
        fudabaAgencyCatalog.sql,
        /WHEN 'valiv' THEN '876'/
    );
    assert.match(
        fudabaAgencyCatalog.sql,
        /REFERENCES public\.agencies\(code\) ON DELETE RESTRICT/
    );
    assert.match(
        fudabaAgencyCatalog.sql,
        /DROP TABLE public\.fudaba_series_tags/
    );
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
    const namecardOwnership = migrations.find(
        ({ version }) => version === '20260816193000_namecard_ownership_foundation'
    );
    assert.match(namecardOwnership.sql, /submission_kind IN \('guest', 'legacy'\)/);
    assert.match(namecardOwnership.sql, /UPDATE public\.cards[\s\S]+submission_kind = 'legacy'/);
    assert.match(namecardOwnership.sql, /CREATE TABLE public\.namecard_idols/);
    assert.match(namecardOwnership.sql, /CREATE TABLE public\.fudaba_card_idols/);
    assert.match(namecardOwnership.sql, /ADD COLUMN legacy_card_id BIGINT/);
    assert.match(namecardOwnership.sql, /length\(favorite_idol\) <= 1000/);
    assert.match(namecardOwnership.sql, /'draft', 'pending', 'approving', 'published'/);
    assert.match(namecardOwnership.sql, /CREATE TABLE public\.fudaba_card_claims/);
    assert.match(namecardOwnership.sql, /CREATE TABLE public\.fudaba_card_claim_idols/);
    assert.match(namecardOwnership.sql, /CREATE TABLE public\.fudaba_claim_envelopes/);
    assert.match(
        namecardOwnership.sql,
        /fudaba_card_claims_one_open_or_approved_legacy_idx[\s\S]+WHERE state IN \('pending', 'approving', 'approved'\)/
    );
    assert.match(
        namecardOwnership.sql,
        /UNIQUE \(recipient_account_id, kind, legacy_card_id\)/
    );
    assert.match(
        namecardOwnership.sql,
        /FOREIGN KEY \(legacy_card_id\) REFERENCES public\.cards\(id\) ON DELETE RESTRICT/
    );
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
    const legacyEventCutover = migrations.find(
        ({ version }) => version === '20260903110000_editorial_legacy_event_cutover'
    );
    assert.match(legacyEventCutover.sql, /WHERE e\.article_id IS NULL/);
    assert.match(legacyEventCutover.sql, /SET article_id = created_article_id/);
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
    assert.equal(catalog.count, 47);
    assert.equal(catalog.migrations[0].version, '0001_initial_compatibility');
    assert.equal(
        catalog.migrations.at(-1).version,
        '20260903110000_editorial_legacy_event_cutover'
    );
    assert.match(catalog.migrations[0].checksum, /^[a-f0-9]{64}$/);
});

test('PostgreSQL migration names keep the frozen sequence and use UTC timestamps after it', () => {
    assert.doesNotThrow(() => validateMigrationFilenames([
        '0027_fudaba_agency_catalog.sql',
        '20260804095901_wiki_idol_url.sql'
    ]));
    assert.throws(
        () => validateMigrationFilenames(['0028_new_change.sql']),
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
        '0020_platform_accounts',
        '0021_backoffice_persistence_names',
        '0022_fudaba_domain',
        '0023_fudaba_public_locations',
        '0024_fudaba_office_workflows',
        '0025_platform_email_verification',
        '0026_platform_email_verification_delivery',
        '0027_fudaba_agency_catalog',
        '20260804095901_wiki_idol_url',
        '20260805090000_wiki_story_content_type_icons',
        '20260811090000_community_experience_consistency',
        '20260811100000_wiki_category_revision',
        '20260813000000_namecard_rejected_at',
        '20260814155304_shared_request_controls',
        '20260814170000_object_deletion_jobs',
        '20260816193000_namecard_ownership_foundation',
        '20260818000000_platform_password_reset',
        '20260818010000_platform_oauth_configuration',
        '20260818101253_editorial_content_cms',
        '20260819000000_namecard_unification_foundation',
        '20260819090000_community_posts_unification',
        '20260820000000_namecard_guest_profile',
        '20260821000000_namecard_reaction_reconciliation',
        '20260822100000_editorial_presentation',
        '20260826130000_namecard_legacy_tables_read_only',
        '20260901140000_dynamic_platform_oauth_providers',
        '20260902120000_platform_session_devices',
        '20260903110000_editorial_legacy_event_cutover'
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
