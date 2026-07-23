CREATE TABLE IF NOT EXISTS story_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idol_id INTEGER NOT NULL,
    category TEXT NOT NULL,
    card_name TEXT NOT NULL,
    subtitle TEXT,
    image_file TEXT,
    source_table TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    last_seen_run_id TEXT NOT NULL DEFAULT 'runtime',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(source_table, source_id),
    FOREIGN KEY(idol_id) REFERENCES idols(id)
);

CREATE TABLE IF NOT EXISTS story_links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id INTEGER NOT NULL,
    up_name TEXT NOT NULL DEFAULT '',
    video_title TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    source_table TEXT NOT NULL,
    source_id INTEGER NOT NULL,
    source_link_index INTEGER NOT NULL DEFAULT 0,
    last_seen_run_id TEXT NOT NULL DEFAULT 'runtime',
    UNIQUE(source_table, source_id, source_link_index),
    FOREIGN KEY(card_id) REFERENCES story_cards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_story_cards_idol_category
    ON story_cards(idol_id, category);
CREATE INDEX IF NOT EXISTS idx_story_links_card ON story_links(card_id);

CREATE TABLE IF NOT EXISTS story_import_runs (
    run_id TEXT PRIMARY KEY,
    source_sha256 TEXT NOT NULL,
    landing_rows INTEGER NOT NULL,
    card_rows INTEGER NOT NULL,
    link_rows INTEGER NOT NULL,
    completed_at TEXT NOT NULL
);
