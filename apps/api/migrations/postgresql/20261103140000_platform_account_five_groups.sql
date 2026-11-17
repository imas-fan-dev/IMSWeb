-- ims:migration-phase: post-data

-- Five groups for the backoffice: link, game id, social, showcase and the
-- consoles people play on. The public page shows the latter three as one block.
ALTER TABLE public.platform_account_kinds
    DROP CONSTRAINT IF EXISTS platform_account_kinds_group_check;
ALTER TABLE public.platform_account_kinds
    ADD CONSTRAINT platform_account_kinds_group_check
    CHECK (group_key IN ('link', 'game', 'social', 'showcase', 'game-platform'));

UPDATE public.platform_account_kinds
SET group_key = 'game-platform', updated_at = now()::text
WHERE id IN ('steam', 'playstation', 'switch', 'xbox');
