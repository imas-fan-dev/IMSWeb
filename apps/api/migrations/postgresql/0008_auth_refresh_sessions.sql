-- ims:migration-phase: pre-data

CREATE TABLE public.auth_refresh_sessions (
    id TEXT PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE CHECK (
        token_hash ~ '^[a-f0-9]{64}$'
    ),
    previous_token_hash TEXT CHECK (
        previous_token_hash IS NULL OR (
            previous_token_hash ~ '^[a-f0-9]{64}$'
        )
    ),
    csrf_hash TEXT NOT NULL CHECK (
        csrf_hash ~ '^[a-f0-9]{64}$'
    ),
    expires_at BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    revoked_at BIGINT
);

CREATE INDEX idx_auth_refresh_sessions_previous_token
    ON public.auth_refresh_sessions(previous_token_hash)
    WHERE previous_token_hash IS NOT NULL;

CREATE INDEX idx_auth_refresh_sessions_expiry
    ON public.auth_refresh_sessions(expires_at);
