-- ims:migration-phase: post-data

CREATE TABLE public.object_deletion_jobs (
    id TEXT PRIMARY KEY,
    resource_type TEXT NOT NULL,
    resource_id TEXT NOT NULL,
    target_kind TEXT NOT NULL CHECK (target_kind IN ('prefix')),
    target TEXT NOT NULL CHECK (target <> ''),
    state TEXT NOT NULL CHECK (state IN ('pending', 'running', 'completed', 'failed')),
    attempts INTEGER NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    last_error TEXT,
    next_attempt_at BIGINT,
    lease_expires_at BIGINT,
    quarantined_at BIGINT,
    completed_at BIGINT,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    UNIQUE (resource_type, resource_id, target_kind, target)
);

CREATE INDEX object_deletion_jobs_candidates_idx
    ON public.object_deletion_jobs (
        state,
        COALESCE(next_attempt_at, created_at),
        COALESCE(lease_expires_at, updated_at)
    )
    WHERE quarantined_at IS NULL AND state IN ('pending', 'running', 'failed');

CREATE INDEX object_deletion_jobs_completed_idx
    ON public.object_deletion_jobs (completed_at)
    WHERE state='completed';
