-- ims:migration-phase: post-data

CREATE TABLE public.s3_object_versions (
    object_id TEXT PRIMARY KEY,
    byte_size BIGINT NOT NULL CHECK (byte_size >= 0),
    content_type TEXT NOT NULL,
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    etag TEXT NOT NULL,
    owner_token TEXT,
    created_at BIGINT NOT NULL
);

CREATE TABLE public.s3_object_index (
    logical_key TEXT PRIMARY KEY,
    object_id TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('uploading', 'pending', 'ready', 'deleted')),
    incarnation BIGINT NOT NULL CHECK (incarnation >= 1),
    operation_id TEXT,
    updated_at BIGINT NOT NULL
);

CREATE INDEX idx_s3_object_index_state_key
    ON public.s3_object_index(state, logical_key);

CREATE TABLE public.s3_upload_operations (
    id TEXT PRIMARY KEY,
    state TEXT NOT NULL CHECK (state IN ('uploading', 'pending', 'ready', 'deleted')),
    logical_key TEXT NOT NULL,
    object_id TEXT NOT NULL UNIQUE,
    target_state TEXT NOT NULL CHECK (target_state IN ('pending', 'ready')),
    previous_object_id TEXT,
    previous_state TEXT CHECK (
        previous_state IS NULL OR previous_state IN ('uploading', 'pending', 'ready', 'deleted')
    ),
    previous_operation_id TEXT,
    previous_incarnation BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE INDEX idx_s3_upload_operations_stale
    ON public.s3_upload_operations(state, updated_at);

CREATE TABLE public.s3_compensation_jobs (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL,
    payload_json TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'completed', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    next_attempt_at BIGINT,
    lease_expires_at BIGINT,
    quarantined_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE INDEX idx_s3_compensation_jobs_schedule
    ON public.s3_compensation_jobs(
        quarantined_at,
        state,
        next_attempt_at,
        attempts,
        created_at
    );
