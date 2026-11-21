-- ims:migration-phase: post-data
-- 属主的名片清单布局：分组、组内顺序与默认分组顺序。
--
-- 只存布局，不存卡片本身：卡片以 `card_number` 引用（行生命周期内稳定），
-- 读取侧归一时丢弃已删除/不可见的编号、把新卡补进默认分组，所以这里不建外键。
-- 快速交换清单仍走 `namecard_quick_exchange_cards`，不在布局里重复存。

CREATE TABLE IF NOT EXISTS public.namecard_profile_layouts (
    owner_account_id TEXT PRIMARY KEY
        REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    -- {"groups":[{"id","title","cardNumbers":[]}],"defaultCardNumbers":[]}
    layout JSONB NOT NULL DEFAULT '{"groups":[],"defaultCardNumbers":[]}'::JSONB,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT namecard_profile_layouts_shape
        CHECK (jsonb_typeof(layout) = 'object')
);
