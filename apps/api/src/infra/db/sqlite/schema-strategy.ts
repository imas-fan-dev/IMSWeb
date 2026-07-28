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
        idol_id INTEGER NOT NULL UNIQUE,
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
        await this.ensureColumn(database, 'agencies', 'wiki_enabled', 'INTEGER NOT NULL DEFAULT 1');
        await this.ensureColumn(database, 'agencies', 'display_order', 'INTEGER NOT NULL DEFAULT 0');
        await this.ensureColumn(database, 'agencies', 'banner_title', "TEXT NOT NULL DEFAULT ''");
        await this.ensureColumn(database, 'agencies', 'icon_object_key', 'TEXT');
        await this.ensureColumn(database, 'agencies', 'fallback_artwork_object_key', 'TEXT');
        await this.ensureColumn(database, 'agencies', 'layout_revision', 'INTEGER NOT NULL DEFAULT 0');
        await this.ensureColumn(database, 'idols', 'wiki_enabled', 'INTEGER NOT NULL DEFAULT 1');
        await this.ensureColumn(database, 'idols', 'display_order', 'INTEGER NOT NULL DEFAULT 0');
        await this.ensureColumn(database, 'idols', 'text_color', "TEXT NOT NULL DEFAULT '#ffffff'");
        await this.ensureColumn(database, 'idols', 'avatar_object_key', 'TEXT');
        await this.ensureColumn(database, 'idols', 'avatar_fit', "TEXT NOT NULL DEFAULT 'cover'");
        await database.executeScript(SQLITE_WIKI_SCHEMA);
        await database.executeScript(SQLITE_WIKI_SEED);
    }

    private async ensureColumn(
        database: ManagedSqlDatabase,
        table: string,
        column: string,
        definition: string
    ): Promise<void> {
        const rows = await database.prepare(`PRAGMA table_info(${table})`)
            .all<{ name: string }>();
        if (rows.results.some((row) => row.name === column)) return;
        await database.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    }
}
