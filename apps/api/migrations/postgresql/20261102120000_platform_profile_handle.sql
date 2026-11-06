-- ims:migration-phase: pre-data

-- Every producer gets a stable, short handle for their public page, plus an
-- optional vanity slug they can pick themselves.
ALTER TABLE public.platform_profiles
    ADD COLUMN IF NOT EXISTS uid BIGINT,
    ADD COLUMN IF NOT EXISTS page_slug TEXT;

COMMENT ON COLUMN public.platform_profiles.uid IS
    'Short public handle: /user/<uid>. Assigned once and never reused.';
COMMENT ON COLUMN public.platform_profiles.page_slug IS
    'Optional vanity path segment; unique and URL-safe.';

-- Number existing rows in registration order so the value never moves again.
WITH numbered AS (
    SELECT account_id,
           ROW_NUMBER() OVER (ORDER BY updated_at, account_id) AS position
    FROM public.platform_profiles
    WHERE uid IS NULL
)
UPDATE public.platform_profiles profile
SET uid = numbered.position
FROM numbered
WHERE profile.account_id = numbered.account_id;

-- New accounts continue above the highest assigned handle.
CREATE SEQUENCE IF NOT EXISTS public.platform_profiles_uid_seq
    AS BIGINT OWNED BY public.platform_profiles.uid;

SELECT setval(
    'public.platform_profiles_uid_seq',
    GREATEST(COALESCE((SELECT MAX(uid) FROM public.platform_profiles), 0), 1),
    (SELECT COUNT(*) > 0 FROM public.platform_profiles)
);

ALTER TABLE public.platform_profiles
    ALTER COLUMN uid SET DEFAULT nextval('public.platform_profiles_uid_seq'),
    ALTER COLUMN uid SET NOT NULL;

ALTER TABLE public.platform_profiles
    ADD CONSTRAINT platform_profiles_uid_key UNIQUE (uid);

ALTER TABLE public.platform_profiles
    ADD CONSTRAINT platform_profiles_page_slug_key UNIQUE (page_slug);

ALTER TABLE public.platform_profiles
    ADD CONSTRAINT platform_profiles_page_slug_check
    CHECK (page_slug IS NULL OR page_slug ~ '^[a-z0-9][a-z0-9_-]{2,31}$');
