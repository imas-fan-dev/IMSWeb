CREATE TABLE IF NOT EXISTS rate_limit_windows (
    bucket TEXT NOT NULL,
    client_key TEXT NOT NULL,
    window_start INTEGER NOT NULL,
    count INTEGER NOT NULL CHECK (count >= 0),
    expires_at INTEGER NOT NULL,
    PRIMARY KEY (bucket, client_key, window_start)
);

CREATE TABLE IF NOT EXISTS object_index (
    logical_key TEXT PRIMARY KEY,
    object_id TEXT NOT NULL UNIQUE,
    state TEXT NOT NULL CHECK (state IN ('uploading', 'pending', 'ready', 'deleted')),
    byte_size INTEGER NOT NULL CHECK (byte_size >= 0),
    content_type TEXT NOT NULL,
    sha256 TEXT NOT NULL,
    etag TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_object_index_state_key ON object_index(state, logical_key);

CREATE TABLE IF NOT EXISTS idempotency_keys (
    scope TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response_status INTEGER,
    response_json TEXT,
    state TEXT NOT NULL CHECK (state IN ('started', 'completed', 'failed')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (scope, idempotency_key)
);

CREATE TABLE IF NOT EXISTS compensation_jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    state TEXT NOT NULL DEFAULT 'pending' CHECK (state IN ('pending', 'running', 'completed', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS upload_operations (
    id TEXT PRIMARY KEY,
    scope TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('uploading', 'pending', 'ready', 'deleted')),
    logical_key TEXT NOT NULL,
    object_id TEXT,
    sha256 TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(scope, idempotency_key)
);

CREATE TABLE IF NOT EXISTS chronicle_items (
    id TEXT PRIMARY KEY,
    activity_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    uploader TEXT,
    uploaded_at TEXT,
    status TEXT NOT NULL CHECK (status IN ('uploading', 'pending', 'ready', 'deleted')),
    logical_key TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    UNIQUE(activity_id, filename)
);

CREATE INDEX IF NOT EXISTS idx_chronicle_items_activity_status
    ON chronicle_items(activity_id, status);

CREATE INDEX IF NOT EXISTS idx_chronicle_items_idempotency_key
    ON chronicle_items(idempotency_key);

CREATE TABLE IF NOT EXISTS chronicle_metadata (
    activity_id TEXT PRIMARY KEY,
    document_json TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
