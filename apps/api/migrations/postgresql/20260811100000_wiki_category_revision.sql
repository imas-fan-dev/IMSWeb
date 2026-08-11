-- ims:migration-phase: post-data

ALTER TABLE public.wiki_categories
    ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS wiki_categories_agency_revision_idx
    ON public.wiki_categories (agency_id, revision);
