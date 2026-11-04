-- ims:migration-phase: post-data

-- The editor groups game ids, then the home page, then every other platform,
-- in the order the product asked for. PSN/NSO/XBOX are platforms, not game ids.
UPDATE public.platform_account_kinds SET group_key = 'game', display_order = 10 WHERE id = 'mirishita';
UPDATE public.platform_account_kinds SET group_key = 'game', display_order = 20 WHERE id = 'deresute';
UPDATE public.platform_account_kinds SET group_key = 'game', display_order = 30 WHERE id = 'shanison';
UPDATE public.platform_account_kinds SET group_key = 'game', display_order = 40 WHERE id = 'gakumas';

UPDATE public.platform_account_kinds SET group_key = 'link', display_order = 50 WHERE id = 'homepage';

UPDATE public.platform_account_kinds SET group_key = 'social', display_order = 110 WHERE id = 'bilibili';
UPDATE public.platform_account_kinds SET group_key = 'social', display_order = 120 WHERE id = 'sinaweibo';
UPDATE public.platform_account_kinds SET group_key = 'social', display_order = 130 WHERE id = 'xiaohongshu';
UPDATE public.platform_account_kinds SET group_key = 'social', display_order = 140 WHERE id = 'x';
UPDATE public.platform_account_kinds SET group_key = 'social', display_order = 150 WHERE id = 'youtube';
UPDATE public.platform_account_kinds SET group_key = 'social', display_order = 160 WHERE id = 'pixiv';
UPDATE public.platform_account_kinds SET group_key = 'social', display_order = 170 WHERE id = 'github';
UPDATE public.platform_account_kinds SET group_key = 'social', display_order = 180 WHERE id = 'steam';
UPDATE public.platform_account_kinds SET group_key = 'social', display_order = 190 WHERE id = 'playstation';
UPDATE public.platform_account_kinds SET group_key = 'social', display_order = 200 WHERE id = 'switch';
UPDATE public.platform_account_kinds SET group_key = 'social', display_order = 210 WHERE id = 'xbox';

-- Brand colours for the platforms that have one.
UPDATE public.platform_account_kinds SET color = '#ff6699' WHERE id = 'bilibili';
UPDATE public.platform_account_kinds SET color = '#e6162d' WHERE id = 'sinaweibo';
UPDATE public.platform_account_kinds SET color = '#ff2442' WHERE id = 'xiaohongshu';
UPDATE public.platform_account_kinds SET color = '#000000' WHERE id = 'x';
UPDATE public.platform_account_kinds SET color = '#ff0000' WHERE id = 'youtube';
UPDATE public.platform_account_kinds SET color = '#0096fa' WHERE id = 'pixiv';
UPDATE public.platform_account_kinds SET color = '#181717' WHERE id = 'github';
UPDATE public.platform_account_kinds SET color = '#0070d1' WHERE id = 'playstation';
