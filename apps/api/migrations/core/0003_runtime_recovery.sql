CREATE TABLE IF NOT EXISTS rate_limit_events (
    bucket TEXT NOT NULL,
    client_key TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    operation TEXT NOT NULL,
    event_identity TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (
        bucket,
        client_key,
        window_start,
        operation,
        event_identity
    )
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_events_expiry
    ON rate_limit_events(expires_at);

ALTER TABLE upload_operations ADD COLUMN target_state TEXT
    CHECK (target_state IN ('pending', 'ready', 'deleted'));
ALTER TABLE upload_operations ADD COLUMN byte_size INTEGER
    CHECK (byte_size IS NULL OR byte_size >= 0);
ALTER TABLE upload_operations ADD COLUMN content_type TEXT;
ALTER TABLE upload_operations ADD COLUMN etag TEXT;
ALTER TABLE upload_operations ADD COLUMN previous_object_id TEXT;

CREATE INDEX IF NOT EXISTS idx_upload_operations_stale
    ON upload_operations(state, updated_at);
