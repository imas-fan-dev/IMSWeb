PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS agencies (
    id INTEGER PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name_cn TEXT NOT NULL,
    color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS idols (
    id INTEGER PRIMARY KEY,
    agency_id INTEGER NOT NULL,
    name_cn TEXT NOT NULL,
    folder_name TEXT NOT NULL,
    color TEXT,
    UNIQUE(agency_id, name_cn),
    FOREIGN KEY(agency_id) REFERENCES agencies(id)
);

CREATE TABLE IF NOT EXISTS theme_colors (
    name TEXT PRIMARY KEY,
    color TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS story_legacy_rows (
    legacy_table TEXT NOT NULL,
    legacy_id INTEGER NOT NULL,
    row_json TEXT NOT NULL,
    normalized_hash TEXT NOT NULL,
    last_seen_run_id TEXT NOT NULL DEFAULT 'legacy-untracked',
    imported_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (legacy_table, legacy_id)
);
