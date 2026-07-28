import type {
    ManagedSqlDatabase,
    SqlSchemaStrategy
} from '@/infra/db/sql/database';

const STORY_TABLES = [
    '765_stories',
    '876_stories',
    'cg_stories',
    'ml_stories',
    'sidem_stories',
    'sc_stories',
    'gk_stories'
] as const;

const SQLITE_CORE_SCHEMA = `
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS news (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT, image TEXT, thumbnail TEXT, content TEXT, date TEXT, author TEXT
    );
    CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE, password TEXT, dept TEXT, producername TEXT,
        admin_role TEXT CHECK (
            admin_role IS NULL OR (
                dept = 'op' AND admin_role IN ('admin', 'super_admin')
            )
        )
    );
    CREATE TABLE IF NOT EXISTS auth_refresh_sessions (
        id TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL,
        token_hash TEXT NOT NULL UNIQUE CHECK (
            length(token_hash) = 64
            AND token_hash = lower(token_hash)
            AND token_hash NOT GLOB '*[^a-f0-9]*'
        ),
        previous_token_hash TEXT CHECK (
            previous_token_hash IS NULL OR (
                length(previous_token_hash) = 64
                AND previous_token_hash = lower(previous_token_hash)
                AND previous_token_hash NOT GLOB '*[^a-f0-9]*'
            )
        ),
        csrf_hash TEXT NOT NULL CHECK (
            length(csrf_hash) = 64
            AND csrf_hash = lower(csrf_hash)
            AND csrf_hash NOT GLOB '*[^a-f0-9]*'
        ),
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        revoked_at INTEGER,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_previous_token
        ON auth_refresh_sessions(previous_token_hash)
        WHERE previous_token_hash IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_auth_refresh_sessions_expiry
        ON auth_refresh_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT, producername TEXT, action TEXT, target TEXT, ip TEXT, time TEXT
    );
    CREATE TABLE IF NOT EXISTS cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        image1_url TEXT NOT NULL, image2_url TEXT NOT NULL,
        hash1 TEXT, hash2 TEXT, ip TEXT,
        status TEXT DEFAULT 'pending', created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title VARCHAR(255), name VARCHAR(100), contact VARCHAR(100),
        image_url TEXT, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS card_emojis (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        card_id INTEGER NOT NULL, emoji TEXT NOT NULL, count INTEGER DEFAULT 1,
        UNIQUE(card_id, emoji),
        FOREIGN KEY(card_id) REFERENCES cards(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS site_packages (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE CHECK (
            slug <> '' AND slug = lower(slug)
            AND slug NOT GLOB '*[^a-z0-9-]*'
            AND slug NOT GLOB '-*' AND slug NOT GLOB '*-'
            AND slug NOT GLOB '*--*'
        ),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        published_revision_id TEXT,
        created_by INTEGER NOT NULL,
        updated_by INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY(published_revision_id) REFERENCES site_package_revisions(id)
            ON DELETE SET NULL DEFERRABLE INITIALLY DEFERRED,
        FOREIGN KEY(id, published_revision_id)
            REFERENCES site_package_revisions(package_id, id)
            DEFERRABLE INITIALLY DEFERRED
    );
    CREATE TABLE IF NOT EXISTS site_package_revisions (
        id TEXT PRIMARY KEY,
        package_id TEXT NOT NULL,
        revision_number INTEGER NOT NULL CHECK (revision_number > 0),
        entry_path TEXT NOT NULL,
        runtime_mode TEXT NOT NULL CHECK (runtime_mode IN ('safe', 'isolated-script')),
        state TEXT NOT NULL CHECK (state IN ('ready', 'archived')),
        file_count INTEGER NOT NULL CHECK (file_count > 0),
        total_bytes INTEGER NOT NULL CHECK (total_bytes >= 0),
        source_key TEXT NOT NULL UNIQUE,
        source_sha256 TEXT NOT NULL CHECK (
            length(source_sha256) = 64
            AND source_sha256 = lower(source_sha256)
            AND source_sha256 NOT GLOB '*[^a-f0-9]*'
        ),
        manifest_key TEXT NOT NULL UNIQUE,
        manifest_json TEXT NOT NULL,
        preview_token_hash TEXT NOT NULL UNIQUE CHECK (
            length(preview_token_hash) = 64
            AND preview_token_hash = lower(preview_token_hash)
            AND preview_token_hash NOT GLOB '*[^a-f0-9]*'
        ),
        created_by INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        published_at INTEGER,
        UNIQUE(package_id, revision_number),
        UNIQUE(package_id, id),
        FOREIGN KEY(package_id) REFERENCES site_packages(id)
            ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED
    );
    CREATE INDEX IF NOT EXISTS idx_site_packages_updated_at
        ON site_packages(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_site_package_revisions_package_revision
        ON site_package_revisions(package_id, revision_number DESC);
    CREATE TRIGGER IF NOT EXISTS site_packages_slug_insert_check
    BEFORE INSERT ON site_packages
    WHEN NEW.slug = '' OR NEW.slug <> lower(NEW.slug)
        OR NEW.slug GLOB '*[^a-z0-9-]*'
        OR NEW.slug GLOB '-*' OR NEW.slug GLOB '*-'
        OR NEW.slug GLOB '*--*'
    BEGIN
        SELECT RAISE(ABORT, 'site_packages.slug must be lowercase kebab-case');
    END;
    CREATE TRIGGER IF NOT EXISTS site_packages_slug_update_check
    BEFORE UPDATE OF slug ON site_packages
    WHEN NEW.slug = '' OR NEW.slug <> lower(NEW.slug)
        OR NEW.slug GLOB '*[^a-z0-9-]*'
        OR NEW.slug GLOB '-*' OR NEW.slug GLOB '*-'
        OR NEW.slug GLOB '*--*'
    BEGIN
        SELECT RAISE(ABORT, 'site_packages.slug must be lowercase kebab-case');
    END;
    CREATE TRIGGER IF NOT EXISTS site_package_revisions_hash_insert_check
    BEFORE INSERT ON site_package_revisions
    WHEN length(NEW.source_sha256) <> 64
        OR NEW.source_sha256 <> lower(NEW.source_sha256)
        OR NEW.source_sha256 GLOB '*[^a-f0-9]*'
        OR length(NEW.preview_token_hash) <> 64
        OR NEW.preview_token_hash <> lower(NEW.preview_token_hash)
        OR NEW.preview_token_hash GLOB '*[^a-f0-9]*'
    BEGIN
        SELECT RAISE(ABORT, 'site-package hashes must be lowercase hexadecimal SHA-256 values');
    END;
    CREATE TRIGGER IF NOT EXISTS site_package_revisions_hash_update_check
    BEFORE UPDATE OF source_sha256, preview_token_hash ON site_package_revisions
    WHEN length(NEW.source_sha256) <> 64
        OR NEW.source_sha256 <> lower(NEW.source_sha256)
        OR NEW.source_sha256 GLOB '*[^a-f0-9]*'
        OR length(NEW.preview_token_hash) <> 64
        OR NEW.preview_token_hash <> lower(NEW.preview_token_hash)
        OR NEW.preview_token_hash GLOB '*[^a-f0-9]*'
    BEGIN
        SELECT RAISE(ABORT, 'site-package hashes must be lowercase hexadecimal SHA-256 values');
    END;
    CREATE TRIGGER IF NOT EXISTS site_packages_publication_owner_insert_check
    BEFORE INSERT ON site_packages
    WHEN NEW.published_revision_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM site_package_revisions
        WHERE package_id = NEW.id AND id = NEW.published_revision_id
    )
    BEGIN
        SELECT RAISE(ABORT, 'published revision belongs to another site package');
    END;
    CREATE TRIGGER IF NOT EXISTS site_packages_publication_owner_update_check
    BEFORE UPDATE OF published_revision_id, id ON site_packages
    WHEN NEW.published_revision_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM site_package_revisions
        WHERE package_id = NEW.id AND id = NEW.published_revision_id
    )
    BEGIN
        SELECT RAISE(ABORT, 'published revision belongs to another site package');
    END;
`;

function sqliteStorySchema(): string {
    const tables = STORY_TABLES.map((table) => `
        CREATE TABLE IF NOT EXISTS "${table}" (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            idol_id INTEGER NOT NULL,
            category TEXT NOT NULL,
            card_name TEXT NOT NULL,
            up_name TEXT NOT NULL DEFAULT '',
            video_title TEXT NOT NULL DEFAULT '',
            url TEXT NOT NULL DEFAULT '',
            subtitle TEXT,
            image_file TEXT,
            FOREIGN KEY(idol_id) REFERENCES idols(id)
        );
        CREATE INDEX IF NOT EXISTS "idx_${table}_idol" ON "${table}"(idol_id);
        CREATE INDEX IF NOT EXISTS "idx_${table}_category" ON "${table}"(category);
    `).join('\n');
    return `
        PRAGMA foreign_keys = ON;
        CREATE TABLE IF NOT EXISTS agencies (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            code TEXT UNIQUE NOT NULL,
            name_cn TEXT NOT NULL,
            color TEXT NOT NULL,
            wiki_enabled INTEGER NOT NULL DEFAULT 1,
            display_order INTEGER NOT NULL DEFAULT 0,
            banner_title TEXT NOT NULL DEFAULT '',
            icon_object_key TEXT,
            icon_fit TEXT NOT NULL DEFAULT 'contain' CHECK (icon_fit IN ('cover', 'contain')),
            icon_focal_x REAL NOT NULL DEFAULT 0.5 CHECK (icon_focal_x BETWEEN 0 AND 1),
            icon_focal_y REAL NOT NULL DEFAULT 0.5 CHECK (icon_focal_y BETWEEN 0 AND 1),
            icon_zoom REAL NOT NULL DEFAULT 1 CHECK (icon_zoom BETWEEN 1 AND 3),
            icon_rotation INTEGER NOT NULL DEFAULT 0 CHECK (icon_rotation IN (0, 90, 180, 270)),
            icon_media_revision INTEGER NOT NULL DEFAULT 0 CHECK (icon_media_revision >= 0),
            fallback_artwork_object_key TEXT,
            layout_revision INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS idols (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agency_id INTEGER NOT NULL,
            name_cn TEXT NOT NULL,
            folder_name TEXT NOT NULL,
            color TEXT,
            wiki_enabled INTEGER NOT NULL DEFAULT 1,
            display_order INTEGER NOT NULL DEFAULT 0,
            text_color TEXT NOT NULL DEFAULT '#ffffff',
            avatar_object_key TEXT,
            avatar_fit TEXT NOT NULL DEFAULT 'cover' CHECK (avatar_fit IN ('cover', 'contain')),
            avatar_focal_x REAL NOT NULL DEFAULT 0.5 CHECK (avatar_focal_x BETWEEN 0 AND 1),
            avatar_focal_y REAL NOT NULL DEFAULT 0.5 CHECK (avatar_focal_y BETWEEN 0 AND 1),
            avatar_zoom REAL NOT NULL DEFAULT 1 CHECK (avatar_zoom BETWEEN 1 AND 3),
            avatar_rotation INTEGER NOT NULL DEFAULT 0 CHECK (avatar_rotation IN (0, 90, 180, 270)),
            avatar_media_revision INTEGER NOT NULL DEFAULT 0 CHECK (avatar_media_revision >= 0),
            entry_kind TEXT NOT NULL DEFAULT 'idol'
                CHECK (entry_kind IN ('idol', 'unit', 'story', 'other')),
            entry_subtype TEXT
                CHECK (entry_subtype IS NULL OR entry_subtype IN ('main', 'event', 'special', 'other')),
            CHECK (
                (entry_kind = 'story' AND entry_subtype IS NOT NULL)
                OR (entry_kind <> 'story' AND entry_subtype IS NULL)
            ),
            FOREIGN KEY(agency_id) REFERENCES agencies(id)
        );
        CREATE INDEX IF NOT EXISTS idx_idols_agency ON idols(agency_id);
        CREATE TABLE IF NOT EXISTS theme_colors (
            name TEXT UNIQUE NOT NULL,
            color TEXT NOT NULL
        );
        ${tables}
    `;
}

const SQLITE_WIKI_SCHEMA = `
    CREATE UNIQUE INDEX IF NOT EXISTS idx_idols_id_agency ON idols(id, agency_id);
    CREATE TABLE IF NOT EXISTS wiki_groups (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        name TEXT NOT NULL,
        color TEXT NOT NULL CHECK (color GLOB '#[0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f][0-9A-Fa-f]'),
        icon_object_key TEXT,
        icon_fit TEXT NOT NULL DEFAULT 'contain' CHECK (icon_fit IN ('cover', 'contain')),
        icon_focal_x REAL NOT NULL DEFAULT 0.5 CHECK (icon_focal_x BETWEEN 0 AND 1),
        icon_focal_y REAL NOT NULL DEFAULT 0.5 CHECK (icon_focal_y BETWEEN 0 AND 1),
        icon_zoom REAL NOT NULL DEFAULT 1 CHECK (icon_zoom BETWEEN 1 AND 3),
        icon_rotation INTEGER NOT NULL DEFAULT 0 CHECK (icon_rotation IN (0, 90, 180, 270)),
        icon_media_revision INTEGER NOT NULL DEFAULT 0 CHECK (icon_media_revision >= 0),
        display_order INTEGER NOT NULL CHECK (display_order >= 0),
        is_fallback INTEGER NOT NULL DEFAULT 0 CHECK (is_fallback IN (0, 1)),
        UNIQUE(agency_id, code),
        UNIQUE(agency_id, display_order),
        UNIQUE(id, agency_id),
        FOREIGN KEY(agency_id) REFERENCES agencies(id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_groups_one_fallback
        ON wiki_groups(agency_id) WHERE is_fallback = 1;
    CREATE INDEX IF NOT EXISTS idx_wiki_groups_agency_order
        ON wiki_groups(agency_id, display_order);
    CREATE TABLE IF NOT EXISTS wiki_group_members (
        agency_id INTEGER NOT NULL,
        group_id INTEGER NOT NULL,
        idol_id INTEGER NOT NULL,
        display_order INTEGER NOT NULL CHECK (display_order >= 0),
        PRIMARY KEY(group_id, idol_id),
        UNIQUE(group_id, display_order),
        FOREIGN KEY(group_id, agency_id) REFERENCES wiki_groups(id, agency_id) ON DELETE CASCADE,
        FOREIGN KEY(idol_id, agency_id) REFERENCES idols(id, agency_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_wiki_group_members_agency
        ON wiki_group_members(agency_id);
    CREATE INDEX IF NOT EXISTS idx_wiki_group_members_group_order
        ON wiki_group_members(group_id, display_order);
    CREATE TABLE IF NOT EXISTS wiki_categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        storage_slug TEXT NOT NULL,
        background_eligible INTEGER NOT NULL DEFAULT 0 CHECK (background_eligible IN (0, 1)),
        UNIQUE(agency_id, name),
        UNIQUE(agency_id, storage_slug),
        UNIQUE(id, agency_id),
        FOREIGN KEY(agency_id) REFERENCES agencies(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_wiki_categories_agency ON wiki_categories(agency_id);
    CREATE INDEX IF NOT EXISTS idx_wiki_categories_background
        ON wiki_categories(agency_id, id) WHERE background_eligible = 1;
    CREATE TABLE IF NOT EXISTS wiki_idol_categories (
        agency_id INTEGER NOT NULL,
        idol_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        display_order INTEGER NOT NULL CHECK (display_order >= 0),
        show_when_empty INTEGER NOT NULL DEFAULT 1 CHECK (show_when_empty IN (0, 1)),
        PRIMARY KEY(idol_id, category_id),
        UNIQUE(agency_id, idol_id, category_id),
        UNIQUE(idol_id, display_order),
        FOREIGN KEY(idol_id, agency_id) REFERENCES idols(id, agency_id) ON DELETE CASCADE,
        FOREIGN KEY(category_id, agency_id) REFERENCES wiki_categories(id, agency_id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_wiki_idol_categories_agency
        ON wiki_idol_categories(agency_id);
    CREATE INDEX IF NOT EXISTS idx_wiki_idol_categories_category
        ON wiki_idol_categories(category_id);
    CREATE INDEX IF NOT EXISTS idx_wiki_idol_categories_idol_order
        ON wiki_idol_categories(idol_id, display_order);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_agencies_name_cn
        ON agencies(name_cn);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_idols_agency_name_cn
        ON idols(agency_id, name_cn);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_idols_agency_folder_name
        ON idols(agency_id, folder_name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_groups_agency_name
        ON wiki_groups(agency_id, name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_idol_categories_agency_identity
        ON wiki_idol_categories(agency_id, idol_id, category_id);
`;

const SQLITE_NORMALIZED_STORY_SCHEMA = `
    CREATE TABLE IF NOT EXISTS wiki_story_content_types (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL DEFAULT '',
        display_order INTEGER NOT NULL CHECK (display_order >= 0),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
    );
    INSERT OR IGNORE INTO wiki_story_content_types
        (id, name, description, display_order)
    VALUES
        (1, '剧情', '卡片剧情、活动剧情或相关视频内容', 0),
        (2, '语音', '语音、广播或音频内容', 1),
        (3, '电话', '游戏内电话与通话内容', 2),
        (4, '文本专栏', '访谈、专栏、翻译与文字资料', 3);

    CREATE TABLE IF NOT EXISTS wiki_story_source_platforms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        homepage_url TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        display_order INTEGER NOT NULL CHECK (display_order >= 0),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
    );
    INSERT OR IGNORE INTO wiki_story_source_platforms
        (id, name, homepage_url, description, display_order)
    VALUES
        (1, 'Bilibili', 'https://www.bilibili.com', 'Bilibili 视频与专栏', 0),
        (2, '其他来源', '', '尚未归类或没有独立平台目录的来源', 1);

    CREATE TABLE IF NOT EXISTS wiki_story_cover_assets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        object_key TEXT NOT NULL UNIQUE,
        display_order INTEGER NOT NULL CHECK (display_order >= 0),
        is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0),
        UNIQUE(id, agency_id),
        UNIQUE(agency_id, name),
        FOREIGN KEY(agency_id) REFERENCES agencies(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_wiki_story_cover_assets_agency_order
        ON wiki_story_cover_assets(agency_id, display_order, id);

    CREATE TABLE IF NOT EXISTS wiki_story_cards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER NOT NULL,
        idol_id INTEGER NOT NULL,
        category_id INTEGER NOT NULL,
        card_name TEXT NOT NULL,
        subtitle TEXT,
        image_file TEXT,
        cover_asset_id INTEGER,
        image_fit TEXT NOT NULL DEFAULT 'cover' CHECK (image_fit IN ('cover', 'contain')),
        image_focal_x REAL NOT NULL DEFAULT 0.5 CHECK (image_focal_x BETWEEN 0 AND 1),
        image_focal_y REAL NOT NULL DEFAULT 0.5 CHECK (image_focal_y BETWEEN 0 AND 1),
        image_zoom REAL NOT NULL DEFAULT 1 CHECK (image_zoom BETWEEN 1 AND 3),
        image_rotation INTEGER NOT NULL DEFAULT 0 CHECK (image_rotation IN (0, 90, 180, 270)),
        image_media_revision INTEGER NOT NULL DEFAULT 0 CHECK (image_media_revision >= 0),
        deleted_at TEXT,
        display_order INTEGER NOT NULL CHECK (display_order >= 0),
        UNIQUE(id, agency_id),
        UNIQUE(agency_id, idol_id, category_id, card_name),
        CHECK (cover_asset_id IS NULL OR image_file IS NULL),
        FOREIGN KEY(cover_asset_id, agency_id)
            REFERENCES wiki_story_cover_assets(id, agency_id) ON DELETE RESTRICT,
        FOREIGN KEY(agency_id, idol_id, category_id)
            REFERENCES wiki_idol_categories(agency_id, idol_id, category_id)
            ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_wiki_story_cards_agency_idol
        ON wiki_story_cards(agency_id, idol_id, display_order);
    CREATE INDEX IF NOT EXISTS idx_wiki_story_cards_category
        ON wiki_story_cards(category_id);
    CREATE INDEX IF NOT EXISTS idx_wiki_story_cards_background
        ON wiki_story_cards(category_id, id)
        WHERE image_file IS NOT NULL OR cover_asset_id IS NOT NULL;
    CREATE INDEX IF NOT EXISTS idx_wiki_story_cards_cover_asset
        ON wiki_story_cards(cover_asset_id) WHERE cover_asset_id IS NOT NULL;

    CREATE TABLE IF NOT EXISTS wiki_story_links (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agency_id INTEGER NOT NULL,
        card_id INTEGER NOT NULL,
        up_name TEXT,
        video_title TEXT,
        url TEXT,
        content_type_id INTEGER NOT NULL DEFAULT 1,
        source_platform_id INTEGER NOT NULL DEFAULT 2,
        display_order INTEGER NOT NULL CHECK (display_order >= 0),
        legacy_table TEXT,
        legacy_id INTEGER,
        legacy_subtitle TEXT,
        legacy_image_file TEXT,
        deleted_at TEXT,
        UNIQUE(card_id, display_order),
        UNIQUE(legacy_table, legacy_id),
        CHECK ((legacy_table IS NULL) = (legacy_id IS NULL)),
        FOREIGN KEY(content_type_id)
            REFERENCES wiki_story_content_types(id) ON DELETE RESTRICT,
        FOREIGN KEY(source_platform_id)
            REFERENCES wiki_story_source_platforms(id) ON DELETE RESTRICT,
        FOREIGN KEY(card_id, agency_id)
            REFERENCES wiki_story_cards(id, agency_id) ON DELETE CASCADE
    );
    CREATE UNIQUE INDEX IF NOT EXISTS idx_wiki_story_links_agency_api_id
        ON wiki_story_links(agency_id, COALESCE(legacy_id, id));
    CREATE INDEX IF NOT EXISTS idx_wiki_story_links_card
        ON wiki_story_links(card_id, display_order);
`;

const SQLITE_WIKI_SEED = `
    UPDATE agencies
    SET display_order = id, banner_title = CASE WHEN banner_title = '' THEN name_cn ELSE banner_title END;
    UPDATE idols
    SET display_order = (
        SELECT COUNT(*) FROM idols preceding
        WHERE preceding.agency_id = idols.agency_id AND preceding.id < idols.id
    );
    INSERT OR IGNORE INTO wiki_groups
        (agency_id, code, name, color, display_order, is_fallback)
    SELECT id, 'other', '事务所人员与其他', '#777777', 0, 1 FROM agencies;
    INSERT OR IGNORE INTO wiki_group_members(agency_id, group_id, idol_id, display_order)
    SELECT i.agency_id, g.id, i.id, i.display_order
    FROM idols i
    JOIN wiki_groups g ON g.agency_id = i.agency_id AND g.is_fallback = 1;
    WITH story_categories(agency_code, name) AS (
        SELECT '765', category FROM "765_stories"
        UNION SELECT '876', category FROM "876_stories"
        UNION SELECT 'cg', category FROM cg_stories
        UNION SELECT 'ml', category FROM ml_stories
        UNION SELECT 'sidem', category FROM sidem_stories
        UNION SELECT 'sc', category FROM sc_stories
        UNION SELECT 'gk', category FROM gk_stories
    )
    INSERT OR IGNORE INTO wiki_categories(agency_id, name, storage_slug)
    SELECT a.id, story_categories.name,
           'category_' || lower(hex(CAST(story_categories.name AS BLOB)))
    FROM story_categories JOIN agencies a ON a.code = story_categories.agency_code;
    WITH story_categories(agency_code, idol_id, name) AS (
        SELECT '765', idol_id, category FROM "765_stories"
        UNION SELECT '876', idol_id, category FROM "876_stories"
        UNION SELECT 'cg', idol_id, category FROM cg_stories
        UNION SELECT 'ml', idol_id, category FROM ml_stories
        UNION SELECT 'sidem', idol_id, category FROM sidem_stories
        UNION SELECT 'sc', idol_id, category FROM sc_stories
        UNION SELECT 'gk', idol_id, category FROM gk_stories
    ), missing AS (
        SELECT a.id AS agency_id, stories.idol_id, c.id AS category_id,
               ROW_NUMBER() OVER (PARTITION BY stories.idol_id ORDER BY c.name, c.id) - 1 AS display_order
        FROM story_categories stories
        JOIN agencies a ON a.code = stories.agency_code
        JOIN wiki_categories c ON c.agency_id = a.id AND c.name = stories.name
        LEFT JOIN wiki_idol_categories existing
            ON existing.idol_id = stories.idol_id AND existing.category_id = c.id
        WHERE existing.category_id IS NULL
    )
    INSERT OR IGNORE INTO wiki_idol_categories
        (agency_id, idol_id, category_id, display_order, show_when_empty)
    SELECT agency_id, idol_id, category_id, display_order, 0 FROM missing;
    UPDATE wiki_categories
    SET background_eligible = 1
    WHERE (agency_id, name) IN (
        SELECT id, '卡剧情' FROM agencies WHERE code = 'cg'
        UNION ALL SELECT id, 'enzaP卡' FROM agencies WHERE code = 'sc'
        UNION ALL SELECT id, 'enzaS卡' FROM agencies WHERE code = 'sc'
        UNION ALL SELECT id, 'P卡' FROM agencies WHERE code = 'gk'
        UNION ALL SELECT id, 'S卡' FROM agencies WHERE code = 'gk'
        UNION ALL SELECT id, '横卡' FROM agencies WHERE code = 'ml'
    );
`;

const SQLITE_NORMALIZED_STORY_SEED = `
    WITH legacy_rows AS (
        SELECT '765' AS agency_code, '765_stories' AS legacy_table, * FROM "765_stories"
        UNION ALL SELECT '876', '876_stories', * FROM "876_stories"
        UNION ALL SELECT 'cg', 'cg_stories', * FROM cg_stories
        UNION ALL SELECT 'ml', 'ml_stories', * FROM ml_stories
        UNION ALL SELECT 'sidem', 'sidem_stories', * FROM sidem_stories
        UNION ALL SELECT 'sc', 'sc_stories', * FROM sc_stories
        UNION ALL SELECT 'gk', 'gk_stories', * FROM gk_stories
    ), resolved AS (
        SELECT a.id AS agency_id, rows.id AS legacy_id, rows.idol_id,
               c.id AS category_id, rows.card_name, rows.subtitle, rows.image_file
        FROM legacy_rows rows
        JOIN agencies a ON a.code = rows.agency_code
        JOIN idols i ON i.id = rows.idol_id AND i.agency_id = a.id
        JOIN wiki_categories c ON c.agency_id = a.id AND c.name = rows.category
    ), ranked AS (
        SELECT resolved.*,
               ROW_NUMBER() OVER (
                   PARTITION BY agency_id, idol_id, category_id, card_name
                   ORDER BY legacy_id
               ) AS canonical_order
        FROM resolved
    ), canonical AS (
        SELECT * FROM ranked WHERE canonical_order = 1
    ), ordered AS (
        SELECT canonical.*,
               ROW_NUMBER() OVER (
                   PARTITION BY idol_id, category_id ORDER BY legacy_id, card_name
               ) - 1 AS display_order
        FROM canonical
    )
    INSERT OR IGNORE INTO wiki_story_cards
        (agency_id, idol_id, category_id, card_name, subtitle, image_file, display_order)
    SELECT agency_id, idol_id, category_id, card_name, subtitle, image_file, display_order
    FROM ordered;

    WITH legacy_rows AS (
        SELECT '765' AS agency_code, '765_stories' AS legacy_table, * FROM "765_stories"
        UNION ALL SELECT '876', '876_stories', * FROM "876_stories"
        UNION ALL SELECT 'cg', 'cg_stories', * FROM cg_stories
        UNION ALL SELECT 'ml', 'ml_stories', * FROM ml_stories
        UNION ALL SELECT 'sidem', 'sidem_stories', * FROM sidem_stories
        UNION ALL SELECT 'sc', 'sc_stories', * FROM sc_stories
        UNION ALL SELECT 'gk', 'gk_stories', * FROM gk_stories
    ), resolved AS (
        SELECT a.id AS agency_id, rows.legacy_table, rows.id AS legacy_id,
               rows.idol_id, c.id AS category_id, rows.card_name,
               rows.up_name, rows.video_title, rows.url, rows.subtitle, rows.image_file
        FROM legacy_rows rows
        JOIN agencies a ON a.code = rows.agency_code
        JOIN idols i ON i.id = rows.idol_id AND i.agency_id = a.id
        JOIN wiki_categories c ON c.agency_id = a.id AND c.name = rows.category
    ), linked AS (
        SELECT resolved.*, cards.id AS card_id,
               ROW_NUMBER() OVER (
                   PARTITION BY cards.id ORDER BY resolved.legacy_id
               ) - 1 AS display_order
        FROM resolved
        JOIN wiki_story_cards cards
          ON cards.agency_id = resolved.agency_id
         AND cards.idol_id = resolved.idol_id
         AND cards.category_id = resolved.category_id
         AND cards.card_name = resolved.card_name
    )
    INSERT OR IGNORE INTO wiki_story_links
        (agency_id, card_id, up_name, video_title, url, display_order,
         legacy_table, legacy_id, legacy_subtitle, legacy_image_file)
    SELECT agency_id, card_id, up_name, video_title, url, display_order,
           legacy_table, legacy_id, subtitle, image_file
    FROM linked;

    UPDATE sqlite_sequence
    SET seq = MAX(
        seq,
        COALESCE((SELECT MAX(legacy_id) FROM wiki_story_links), 0)
    )
    WHERE name = 'wiki_story_links';
`;

export class SqliteSchemaStrategy implements SqlSchemaStrategy {
    async initializeCore(database: ManagedSqlDatabase): Promise<void> {
        await database.executeScript(SQLITE_CORE_SCHEMA);
        await this.ensureColumn(database, 'users', 'admin_role', 'TEXT');
        await database.prepare(
            "UPDATE users SET admin_role='admin' WHERE dept='op' AND admin_role IS NULL"
        ).run();
        await database.executeScript(`
            CREATE TRIGGER IF NOT EXISTS users_admin_role_insert_check
            BEFORE INSERT ON users
            WHEN (NEW.dept = 'op' AND (
                    NEW.admin_role IS NULL OR
                    NEW.admin_role NOT IN ('admin', 'super_admin')
                )) OR (
                    COALESCE(NEW.dept, '') <> 'op' AND NEW.admin_role IS NOT NULL
                )
            BEGIN
                SELECT RAISE(ABORT, 'users.admin_role does not match dept');
            END;
            CREATE TRIGGER IF NOT EXISTS users_admin_role_update_check
            BEFORE UPDATE OF dept, admin_role ON users
            WHEN (NEW.dept = 'op' AND (
                    NEW.admin_role IS NULL OR
                    NEW.admin_role NOT IN ('admin', 'super_admin')
                )) OR (
                    COALESCE(NEW.dept, '') <> 'op' AND NEW.admin_role IS NOT NULL
                )
            BEGIN
                SELECT RAISE(ABORT, 'users.admin_role does not match dept');
            END;
            CREATE UNIQUE INDEX IF NOT EXISTS users_one_super_admin_idx
                ON users(admin_role) WHERE admin_role='super_admin';
        `);
    }

    async initializeStory(database: ManagedSqlDatabase): Promise<void> {
        await database.executeScript(sqliteStorySchema());
        const hadNormalizedStorySchema = await this.tableExists(database, 'wiki_story_cards');
        await this.ensureColumn(database, 'agencies', 'wiki_enabled', 'INTEGER NOT NULL DEFAULT 1');
        await this.ensureColumn(database, 'agencies', 'display_order', 'INTEGER NOT NULL DEFAULT 0');
        await this.ensureColumn(database, 'agencies', 'banner_title', "TEXT NOT NULL DEFAULT ''");
        await this.ensureColumn(database, 'agencies', 'icon_object_key', 'TEXT');
        await this.ensureColumn(database, 'agencies', 'icon_fit',
            "TEXT NOT NULL DEFAULT 'contain' CHECK (icon_fit IN ('cover', 'contain'))");
        await this.ensureColumn(database, 'agencies', 'icon_focal_x',
            'REAL NOT NULL DEFAULT 0.5 CHECK (icon_focal_x BETWEEN 0 AND 1)');
        await this.ensureColumn(database, 'agencies', 'icon_focal_y',
            'REAL NOT NULL DEFAULT 0.5 CHECK (icon_focal_y BETWEEN 0 AND 1)');
        await this.ensureColumn(database, 'agencies', 'icon_zoom',
            'REAL NOT NULL DEFAULT 1 CHECK (icon_zoom BETWEEN 1 AND 3)');
        await this.ensureColumn(database, 'agencies', 'icon_rotation',
            'INTEGER NOT NULL DEFAULT 0 CHECK (icon_rotation IN (0, 90, 180, 270))');
        await this.ensureColumn(database, 'agencies', 'icon_media_revision',
            'INTEGER NOT NULL DEFAULT 0 CHECK (icon_media_revision >= 0)');
        await this.ensureColumn(database, 'agencies', 'fallback_artwork_object_key', 'TEXT');
        await this.ensureColumn(database, 'agencies', 'layout_revision', 'INTEGER NOT NULL DEFAULT 0');
        await this.ensureColumn(database, 'idols', 'wiki_enabled', 'INTEGER NOT NULL DEFAULT 1');
        await this.ensureColumn(database, 'idols', 'display_order', 'INTEGER NOT NULL DEFAULT 0');
        await this.ensureColumn(database, 'idols', 'text_color', "TEXT NOT NULL DEFAULT '#ffffff'");
        await this.ensureColumn(database, 'idols', 'avatar_object_key', 'TEXT');
        await this.ensureColumn(database, 'idols', 'avatar_fit', "TEXT NOT NULL DEFAULT 'cover'");
        await this.ensureColumn(database, 'idols', 'avatar_focal_x',
            'REAL NOT NULL DEFAULT 0.5 CHECK (avatar_focal_x BETWEEN 0 AND 1)');
        await this.ensureColumn(database, 'idols', 'avatar_focal_y',
            'REAL NOT NULL DEFAULT 0.5 CHECK (avatar_focal_y BETWEEN 0 AND 1)');
        await this.ensureColumn(database, 'idols', 'avatar_zoom',
            'REAL NOT NULL DEFAULT 1 CHECK (avatar_zoom BETWEEN 1 AND 3)');
        await this.ensureColumn(database, 'idols', 'avatar_rotation',
            'INTEGER NOT NULL DEFAULT 0 CHECK (avatar_rotation IN (0, 90, 180, 270))');
        await this.ensureColumn(database, 'idols', 'avatar_media_revision',
            'INTEGER NOT NULL DEFAULT 0 CHECK (avatar_media_revision >= 0)');
        await this.ensureColumn(database, 'idols', 'deleted_at', 'TEXT');
        const entryKindAdded = await this.ensureColumn(database, 'idols', 'entry_kind',
            "TEXT NOT NULL DEFAULT 'idol' CHECK (entry_kind IN ('idol', 'unit', 'story', 'other'))");
        await this.ensureColumn(database, 'idols', 'entry_subtype',
            "TEXT CHECK (entry_subtype IS NULL OR entry_subtype IN ('main', 'event', 'special', 'other'))");
        await database.executeScript(SQLITE_WIKI_SCHEMA);
        await this.ensureColumn(database, 'wiki_groups', 'icon_fit',
            "TEXT NOT NULL DEFAULT 'contain' CHECK (icon_fit IN ('cover', 'contain'))");
        await this.ensureColumn(database, 'wiki_groups', 'icon_focal_x',
            'REAL NOT NULL DEFAULT 0.5 CHECK (icon_focal_x BETWEEN 0 AND 1)');
        await this.ensureColumn(database, 'wiki_groups', 'icon_focal_y',
            'REAL NOT NULL DEFAULT 0.5 CHECK (icon_focal_y BETWEEN 0 AND 1)');
        await this.ensureColumn(database, 'wiki_groups', 'icon_zoom',
            'REAL NOT NULL DEFAULT 1 CHECK (icon_zoom BETWEEN 1 AND 3)');
        await this.ensureColumn(database, 'wiki_groups', 'icon_rotation',
            'INTEGER NOT NULL DEFAULT 0 CHECK (icon_rotation IN (0, 90, 180, 270))');
        await this.ensureColumn(database, 'wiki_groups', 'icon_media_revision',
            'INTEGER NOT NULL DEFAULT 0 CHECK (icon_media_revision >= 0)');
        await this.removeExclusiveWikiGroupMembership(database);
        if (hadNormalizedStorySchema) {
            await database.executeScript(SQLITE_NORMALIZED_STORY_SCHEMA);
        } else {
            await database.executeScript(`
                BEGIN IMMEDIATE;
                ${SQLITE_WIKI_SEED}
                ${SQLITE_NORMALIZED_STORY_SCHEMA}
                ${SQLITE_NORMALIZED_STORY_SEED}
                COMMIT;
            `);
        }
        if (entryKindAdded || !hadNormalizedStorySchema) {
            await database.executeScript(`
                UPDATE idols
                SET entry_kind='unit', entry_subtype=NULL
                WHERE id IN (
                    SELECT members.idol_id
                    FROM wiki_group_members members
                    JOIN wiki_groups groups
                      ON groups.id=members.group_id
                     AND groups.agency_id=members.agency_id
                    JOIN agencies agencies ON agencies.id=groups.agency_id
                    WHERE agencies.code='sidem' AND groups.code='sidem-units'
                );
                UPDATE idols
                SET entry_kind='story', entry_subtype='special'
                WHERE id IN (
                    SELECT members.idol_id
                    FROM wiki_group_members members
                    JOIN wiki_groups groups
                      ON groups.id=members.group_id
                     AND groups.agency_id=members.agency_id
                    JOIN agencies agencies ON agencies.id=groups.agency_id
                    WHERE agencies.code='sidem' AND groups.code='sidem-special'
                );
            `);
        }
        await this.ensureColumn(database, 'wiki_story_cards', 'image_fit',
            "TEXT NOT NULL DEFAULT 'cover' CHECK (image_fit IN ('cover', 'contain'))");
        await this.ensureColumn(database, 'wiki_story_cards', 'image_focal_x',
            'REAL NOT NULL DEFAULT 0.5 CHECK (image_focal_x BETWEEN 0 AND 1)');
        await this.ensureColumn(database, 'wiki_story_cards', 'image_focal_y',
            'REAL NOT NULL DEFAULT 0.5 CHECK (image_focal_y BETWEEN 0 AND 1)');
        await this.ensureColumn(database, 'wiki_story_cards', 'image_zoom',
            'REAL NOT NULL DEFAULT 1 CHECK (image_zoom BETWEEN 1 AND 3)');
        await this.ensureColumn(database, 'wiki_story_cards', 'image_rotation',
            'INTEGER NOT NULL DEFAULT 0 CHECK (image_rotation IN (0, 90, 180, 270))');
        await this.ensureColumn(database, 'wiki_story_cards', 'image_media_revision',
            'INTEGER NOT NULL DEFAULT 0 CHECK (image_media_revision >= 0)');
        await this.ensureColumn(database, 'wiki_story_cards', 'cover_asset_id', 'INTEGER');
        await this.ensureColumn(database, 'wiki_story_cards', 'deleted_at', 'TEXT');
        await this.ensureColumn(database, 'wiki_story_links', 'content_type_id',
            'INTEGER NOT NULL DEFAULT 1');
        await this.ensureColumn(database, 'wiki_story_links', 'source_platform_id',
            'INTEGER NOT NULL DEFAULT 2');
        await this.ensureColumn(database, 'wiki_story_links', 'deleted_at', 'TEXT');
        await database.prepare(
            `UPDATE wiki_story_links SET source_platform_id=1
             WHERE source_platform_id=2 AND (
                 LOWER(COALESCE(url, '')) LIKE '%bilibili.com/%'
                 OR LOWER(COALESCE(url, '')) LIKE '%b23.tv/%'
             )`
        ).run();
        await database.executeScript(`
            CREATE INDEX IF NOT EXISTS idx_wiki_story_links_content_type
                ON wiki_story_links(content_type_id, card_id);
            CREATE INDEX IF NOT EXISTS idx_wiki_story_links_source_platform
                ON wiki_story_links(source_platform_id, card_id);
            CREATE INDEX IF NOT EXISTS idx_idols_active_agency_order
                ON idols(agency_id, display_order, id) WHERE deleted_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_wiki_story_cards_active_idol_order
                ON wiki_story_cards(agency_id, idol_id, display_order, id)
                WHERE deleted_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_wiki_story_links_active_card_order
                ON wiki_story_links(card_id, display_order, id)
                WHERE deleted_at IS NULL;
        `);
    }

    private async tableExists(database: ManagedSqlDatabase, table: string): Promise<boolean> {
        const row = await database.prepare(
            "SELECT 1 AS present FROM sqlite_master WHERE type='table' AND name=?"
        ).bind(table).first<{ present: number }>();
        return row !== null;
    }

    private async removeExclusiveWikiGroupMembership(database: ManagedSqlDatabase): Promise<void> {
        const indexes = await database.prepare('PRAGMA index_list(wiki_group_members)')
            .all<{ name: string; unique: number }>();
        let hasExclusiveIdolIndex = false;
        for (const index of indexes.results.filter((candidate) => candidate.unique === 1)) {
            const columns = await database.prepare(`PRAGMA index_info("${index.name}")`)
                .all<{ name: string }>();
            if (columns.results.length === 1 && columns.results[0]?.name === 'idol_id') {
                hasExclusiveIdolIndex = true;
                break;
            }
        }
        if (!hasExclusiveIdolIndex) return;
        await database.executeScript(`
            PRAGMA foreign_keys = OFF;
            BEGIN IMMEDIATE;
            ALTER TABLE wiki_group_members RENAME TO wiki_group_members_exclusive;
            CREATE TABLE wiki_group_members (
                agency_id INTEGER NOT NULL,
                group_id INTEGER NOT NULL,
                idol_id INTEGER NOT NULL,
                display_order INTEGER NOT NULL CHECK (display_order >= 0),
                PRIMARY KEY(group_id, idol_id),
                UNIQUE(group_id, display_order),
                FOREIGN KEY(group_id, agency_id)
                    REFERENCES wiki_groups(id, agency_id) ON DELETE CASCADE,
                FOREIGN KEY(idol_id, agency_id)
                    REFERENCES idols(id, agency_id) ON DELETE CASCADE
            );
            INSERT INTO wiki_group_members(agency_id, group_id, idol_id, display_order)
            SELECT agency_id, group_id, idol_id, display_order
            FROM wiki_group_members_exclusive;
            DROP TABLE wiki_group_members_exclusive;
            CREATE INDEX idx_wiki_group_members_agency
                ON wiki_group_members(agency_id);
            CREATE INDEX idx_wiki_group_members_group_order
                ON wiki_group_members(group_id, display_order);
            CREATE INDEX idx_wiki_group_members_idol
                ON wiki_group_members(idol_id);
            COMMIT;
            PRAGMA foreign_keys = ON;
        `);
    }

    private async ensureColumn(
        database: ManagedSqlDatabase,
        table: string,
        column: string,
        definition: string
    ): Promise<boolean> {
        const rows = await database.prepare(`PRAGMA table_info(${table})`)
            .all<{ name: string }>();
        if (rows.results.some((row) => row.name === column)) return false;
        await database.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
        return true;
    }
}
