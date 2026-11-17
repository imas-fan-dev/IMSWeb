-- ims:migration-phase: post-data

-- The catalogue is data, not code: the backoffice edits rows here and the
-- profile page renders whatever is enabled.
CREATE TABLE IF NOT EXISTS public.platform_account_kinds (
    id TEXT NOT NULL,
    name TEXT NOT NULL,
    group_key TEXT NOT NULL,
    pattern TEXT NOT NULL,
    base_url TEXT,
    color TEXT,
    icon TEXT,
    display_order INTEGER NOT NULL DEFAULT 0,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT platform_account_kinds_pkey PRIMARY KEY (id),
    CONSTRAINT platform_account_kinds_group_check
        CHECK (group_key IN ('game', 'social', 'link')),
    CONSTRAINT platform_account_kinds_order_check CHECK (display_order >= 0)
);

CREATE TABLE IF NOT EXISTS public.platform_account_entries (
    account_id TEXT NOT NULL,
    kind_id TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    CONSTRAINT platform_account_entries_pkey PRIMARY KEY (account_id, kind_id),
    CONSTRAINT platform_account_entries_account_fkey
        FOREIGN KEY (account_id) REFERENCES public.platform_accounts(id)
        ON DELETE CASCADE,
    CONSTRAINT platform_account_entries_kind_fkey
        FOREIGN KEY (kind_id) REFERENCES public.platform_account_kinds(id)
        ON DELETE CASCADE,
    CONSTRAINT platform_account_entries_value_check
        CHECK (length(value) BETWEEN 1 AND 200)
);

CREATE INDEX IF NOT EXISTS platform_account_entries_account_idx
    ON public.platform_account_entries (account_id);

-- Seed the catalogue the product spec fixed. Patterns validate the normalized
-- identifier, not the raw input: the editor parses URLs down to this first.
INSERT INTO public.platform_account_kinds
    (id, name, group_key, pattern, base_url, color, icon, display_order, enabled, created_at, updated_at)
VALUES
    ('mirishita', '百万现场！剧场时光', 'game', '^[A-Z0-9]{8}$', NULL, '#ffc30b', 'million', 10, TRUE, now()::text, now()::text),
    ('deresute', '灰姑娘女孩 星光舞台', 'game', '^[0-9]{8,9}$', NULL, '#2681c8', 'deremas', 20, TRUE, now()::text, now()::text),
    ('shanison', '闪耀色彩 棱镜之歌', 'game', '^[A-Z0-9]{9}$', NULL, '#8dbbff', 'shanimas', 30, TRUE, now()::text, now()::text),
    ('gakumas', '学园偶像大师', 'game', '^[A-Z0-9]{8}$', NULL, '#f39800', 'gakumas', 40, TRUE, now()::text, now()::text),
    ('switch', 'NSO', 'game', '^SW-[0-9]{4}-[0-9]{4}-[0-9]{4}$', NULL, '#E70009', 'switch', 50, TRUE, now()::text, now()::text),
    ('playstation', 'PSN', 'game', '^[A-Za-z0-9_-]{5,16}$', NULL, NULL, 'playstation', 60, TRUE, now()::text, now()::text),
    ('xbox', 'Xbox', 'game', '^([A-Za-z0-9]{15}|.{12})$', NULL, '#0e7a0d', 'xbox', 70, TRUE, now()::text, now()::text),
    ('homepage', '个人主页', 'link', '^https://[^\s]+$', NULL, NULL, NULL, 5, TRUE, now()::text, now()::text),
    ('bilibili', '哔哩哔哩', 'social', '^[0-9]{1,20}$', 'https://space.bilibili.com/{value}', NULL, 'bilibili', 110, TRUE, now()::text, now()::text),
    ('sinaweibo', '微博', 'social', '^([0-9]{1,20}|[A-Za-z0-9_-]{4,20})$', 'https://weibo.com/u/{value}', NULL, 'sinaweibo', 120, TRUE, now()::text, now()::text),
    ('xiaohongshu', '小红书', 'social', '^[A-Za-z0-9_-]{1,32}$', 'https://www.xiaohongshu.com/user/profile/{value}', NULL, 'xiaohongshu', 130, TRUE, now()::text, now()::text),
    ('x', 'X', 'social', '^[A-Za-z0-9_]{4,15}$', 'https://x.com/{value}', NULL, 'x', 140, TRUE, now()::text, now()::text),
    ('youtube', 'YouTube', 'social', '^(@[A-Za-z0-9._-]{3,30}|UC[A-Za-z0-9_-]{22})$', 'https://www.youtube.com/{value}', NULL, 'youtube', 150, TRUE, now()::text, now()::text),
    ('pixiv', 'pixiv', 'social', '^[0-9]{1,20}$', 'https://www.pixiv.net/users/{value}', NULL, 'pixiv', 160, TRUE, now()::text, now()::text),
    ('github', 'GitHub', 'social', '^[a-z0-9-]{1,39}$', 'https://github.com/{value}', NULL, 'github', 170, TRUE, now()::text, now()::text),
    ('steam', 'Steam', 'social', '^[A-Za-z0-9_-]{3,32}$', 'https://steamcommunity.com/id/{value}', '#1778ac', 'steam', 180, TRUE, now()::text, now()::text)
ON CONFLICT (id) DO NOTHING;
