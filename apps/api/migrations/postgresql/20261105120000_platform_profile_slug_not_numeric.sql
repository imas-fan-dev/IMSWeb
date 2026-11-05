-- ims:migration-phase: pre-data
-- A pure-digit page slug would collide with the uid namespace: /user/<handle>
-- resolves the uid first, so "12345" could name two different producers. The
-- request schema now rejects it; this constraint keeps older rows and direct
-- writes honest.
--
-- Rows written before the rule existed never resolved (the uid won), so they
-- are cleared instead of failing the deploy; the producer keeps /user/<uid>
-- and can pick a new address from the editor.

ALTER TABLE public.platform_profiles
    DROP CONSTRAINT IF EXISTS platform_profiles_page_slug_check;

UPDATE public.platform_profiles
   SET page_slug = NULL
 WHERE page_slug ~ '^[0-9]+$';

ALTER TABLE public.platform_profiles
    ADD CONSTRAINT platform_profiles_page_slug_check CHECK (
        page_slug IS NULL OR (
            page_slug ~ '^[a-z0-9][a-z0-9_-]{2,31}$'
            AND page_slug !~ '^[0-9]+$'
        )
    );
