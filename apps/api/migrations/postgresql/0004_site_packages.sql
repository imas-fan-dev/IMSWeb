-- ims:migration-phase: pre-data

CREATE TABLE public.site_packages (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE CHECK (
        slug = lower(slug) AND slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    ),
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    published_revision_id TEXT,
    created_by BIGINT NOT NULL,
    updated_by BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL
);

CREATE TABLE public.site_package_revisions (
    id TEXT PRIMARY KEY,
    package_id TEXT NOT NULL REFERENCES public.site_packages(id)
        ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    revision_number INTEGER NOT NULL CHECK (revision_number > 0),
    entry_path TEXT NOT NULL,
    runtime_mode TEXT NOT NULL CHECK (runtime_mode IN ('safe', 'isolated-script')),
    state TEXT NOT NULL CHECK (state IN ('ready', 'archived')),
    file_count INTEGER NOT NULL CHECK (file_count > 0),
    total_bytes BIGINT NOT NULL CHECK (total_bytes >= 0),
    source_key TEXT NOT NULL UNIQUE,
    source_sha256 TEXT NOT NULL CHECK (source_sha256 ~ '^[a-f0-9]{64}$'),
    manifest_key TEXT NOT NULL UNIQUE,
    manifest_json TEXT NOT NULL,
    preview_token_hash TEXT NOT NULL UNIQUE CHECK (preview_token_hash ~ '^[a-f0-9]{64}$'),
    created_by BIGINT NOT NULL,
    created_at BIGINT NOT NULL,
    published_at BIGINT,
    UNIQUE(package_id, revision_number)
);

ALTER TABLE public.site_packages
    ADD CONSTRAINT site_packages_published_revision_fkey
    FOREIGN KEY (published_revision_id)
    REFERENCES public.site_package_revisions(id)
    ON DELETE SET NULL
    DEFERRABLE INITIALLY DEFERRED;

CREATE INDEX site_packages_updated_at_idx
    ON public.site_packages(updated_at DESC);
CREATE INDEX site_package_revisions_package_revision_idx
    ON public.site_package_revisions(package_id, revision_number DESC);
