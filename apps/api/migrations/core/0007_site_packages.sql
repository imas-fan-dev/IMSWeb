PRAGMA foreign_keys = ON;

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
