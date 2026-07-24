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
        username TEXT UNIQUE, password TEXT, dept TEXT, producername TEXT
    );
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
            color TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS idols (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            agency_id INTEGER NOT NULL,
            name_cn TEXT NOT NULL,
            folder_name TEXT NOT NULL,
            color TEXT,
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

export class SqliteSchemaStrategy implements SqlSchemaStrategy {
    initializeCore(database: ManagedSqlDatabase): Promise<void> {
        return database.executeScript(SQLITE_CORE_SCHEMA);
    }

    initializeStory(database: ManagedSqlDatabase): Promise<void> {
        return database.executeScript(sqliteStorySchema());
    }
}
