-- ims:migration-phase: post-data

CREATE TABLE public.request_idempotency_records (
    scope TEXT NOT NULL,
    idempotency_key TEXT NOT NULL,
    fingerprint TEXT NOT NULL,
    state TEXT NOT NULL CHECK (state IN ('started', 'completed', 'failed')),
    response_status INTEGER,
    response_body JSONB,
    updated_at_ms BIGINT NOT NULL,
    generation INTEGER NOT NULL CHECK (generation > 0),
    PRIMARY KEY (scope, idempotency_key),
    CHECK (
        (state = 'completed' AND response_status BETWEEN 100 AND 599 AND response_body IS NOT NULL)
        OR (state <> 'completed' AND response_status IS NULL AND response_body IS NULL)
    )
);

CREATE INDEX request_idempotency_records_updated_at_idx
    ON public.request_idempotency_records (updated_at_ms);

CREATE TABLE public.rate_limit_windows (
    bucket TEXT NOT NULL,
    limit_key TEXT NOT NULL,
    reset_at_ms BIGINT NOT NULL,
    consumed INTEGER NOT NULL DEFAULT 0 CHECK (consumed >= 0),
    PRIMARY KEY (bucket, limit_key)
);

CREATE INDEX rate_limit_windows_reset_at_idx
    ON public.rate_limit_windows (reset_at_ms);

CREATE TABLE public.rate_limit_identities (
    bucket TEXT NOT NULL,
    limit_key TEXT NOT NULL,
    operation TEXT NOT NULL,
    identity TEXT NOT NULL,
    PRIMARY KEY (bucket, limit_key, operation, identity),
    FOREIGN KEY (bucket, limit_key)
        REFERENCES public.rate_limit_windows (bucket, limit_key)
        ON DELETE CASCADE
);
