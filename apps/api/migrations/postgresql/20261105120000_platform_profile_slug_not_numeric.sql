-- ims:migration-phase: pre-data
-- A pure-digit page slug would collide with the uid namespace: /user/<handle>
-- resolves the uid first, so "12345" could name two different producers. The
-- request schema now rejects it; this constraint keeps older rows and direct
-- writes honest.

ALTER TABLE public.platform_profiles
    DROP CONSTRAINT IF EXISTS platform_profiles_page_slug_check;

ALTER TABLE public.platform_profiles
    ADD CONSTRAINT platform_profiles_page_slug_check CHECK (
        page_slug IS NULL OR (
            page_slug ~ '^[a-z0-9][a-z0-9_-]{2,31}$'
            AND page_slug !~ '^[0-9]+$'
        )
    );
