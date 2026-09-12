-- ims:migration-phase: post-data

-- `events` is retained as the compatibility storage for community posts.
-- The application exposes this model as "community posts" while public
-- /events links remain stable.
ALTER TABLE public.events
    ADD COLUMN source_url TEXT,
    ADD COLUMN legacy_information_id TEXT;

ALTER TABLE public.events
    ADD CONSTRAINT events_source_url_check
        CHECK (
            source_url IS NULL
            OR source_url ~ '^(https?://|/(?!/))'
        ),
    ADD CONSTRAINT events_legacy_information_id_unique
        UNIQUE (legacy_information_id);

CREATE TABLE public.homepage_spotlight_entries (
    post_id BIGINT PRIMARY KEY,
    category TEXT NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT homepage_spotlight_entries_post_fkey
        FOREIGN KEY (post_id) REFERENCES public.events(id) ON DELETE CASCADE,
    CONSTRAINT homepage_spotlight_entries_category_check
        CHECK (category IN ('activity', 'fan')),
    CONSTRAINT homepage_spotlight_entries_sort_order_check
        CHECK (sort_order >= 0)
);

CREATE INDEX homepage_spotlight_entries_order_idx
    ON public.homepage_spotlight_entries (sort_order ASC, post_id ASC);
