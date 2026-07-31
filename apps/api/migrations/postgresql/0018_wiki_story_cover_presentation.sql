-- ims:migration-phase: post-data

ALTER TABLE public.wiki_story_cover_assets
    ADD COLUMN presentation_policy TEXT NOT NULL DEFAULT 'inherit'
        CHECK (presentation_policy IN ('inherit', 'contain'));

COMMENT ON COLUMN public.wiki_story_cover_assets.presentation_policy IS
    'Controls whether story cards inherit their own composition or always show the full shared artwork.';
