PRAGMA foreign_keys = ON;

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
