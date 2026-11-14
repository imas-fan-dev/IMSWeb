-- ims:migration-phase: post-data

-- Three groups now: the games people play, the platforms they post on, and the
-- places they only show work at.
ALTER TABLE public.platform_account_kinds
    DROP CONSTRAINT IF EXISTS platform_account_kinds_group_check;

ALTER TABLE public.platform_account_kinds
    ADD CONSTRAINT platform_account_kinds_group_check
    CHECK (group_key IN ('game', 'social', 'showcase', 'link'));

UPDATE public.platform_account_kinds
SET group_key = 'showcase', updated_at = now()::text
WHERE id IN ('pixiv', 'github');

UPDATE public.platform_account_kinds
SET group_key = 'game', updated_at = now()::text
WHERE id IN ('steam', 'playstation', 'switch', 'xbox');

-- A link account may carry the display name it is known by.
ALTER TABLE public.platform_account_entries
    ADD COLUMN IF NOT EXISTS username TEXT;

ALTER TABLE public.platform_account_entries
    ADD CONSTRAINT platform_account_entries_username_check
    CHECK (username IS NULL OR length(username) BETWEEN 1 AND 60);
