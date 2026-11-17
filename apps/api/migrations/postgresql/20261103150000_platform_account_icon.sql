-- ims:migration-phase: post-data

-- An uploaded mark lives next to the catalogue row; when it is missing the
-- frontend falls back to the bundled mark or the simple-icons CDN slug.
ALTER TABLE public.platform_account_kinds
    ADD COLUMN IF NOT EXISTS icon_object_key TEXT;

COMMENT ON COLUMN public.platform_account_kinds.icon_object_key IS
    'Private object key of the uploaded platform mark, replaced on re-upload.';
