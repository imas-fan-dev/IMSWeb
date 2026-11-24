-- ims:migration-phase: post-data
ALTER TABLE fudaba_messages
    ADD COLUMN display_height INTEGER NOT NULL DEFAULT 277 CHECK (display_height BETWEEN 160 AND 560),
    ADD COLUMN paper_layout_version INTEGER NOT NULL DEFAULT 1 CHECK (paper_layout_version = 1);

CREATE TABLE fudaba_card_media_previews (
    object_key TEXT PRIMARY KEY,
    asset_sha256 TEXT NOT NULL,
    preview_data_url TEXT NOT NULL CHECK (length(preview_data_url) <= 2048 AND preview_data_url LIKE 'data:image/webp;base64,%'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
