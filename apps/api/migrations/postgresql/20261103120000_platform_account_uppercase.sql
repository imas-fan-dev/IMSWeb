-- ims:migration-phase: post-data

-- Game handles are written in capitals; the catalogue now says so explicitly so
-- the editor can upper-case while the visitor types.
ALTER TABLE public.platform_account_kinds
    ADD COLUMN IF NOT EXISTS uppercase BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE public.platform_account_kinds
SET uppercase = TRUE
WHERE id IN ('mirishita', 'shanison', 'gakumas', 'switch');

-- YouTube handles may arrive percent-encoded, so the pattern counts escapes.
UPDATE public.platform_account_kinds
SET pattern = '^(@([A-Za-z0-9._-]|%[0-9A-F]{2}){3,30}|UC[A-Za-z0-9_-]{22})$',
    updated_at = now()::text
WHERE id = 'youtube';
