-- ims:migration-phase: post-data
-- 名片状态通知：把审核结果（通过 / 驳回，含驳回理由）与认领结果改为「事件写入」，
-- 取代此前只在读取 `/me/claim-envelopes` 时按 `fudaba_cards.id = cards.id` 派生的同号匹配。
--
-- 保留与上限策略在应用层实现（见 `namecard-notification-repository.ts`）：
--   · 未读保留 90 天、已读保留 30 天，超期在读取时清理；
--   · 每个账号最多 200 条，超限时先删最旧的「已读」，再删最旧的「未读」。
CREATE TABLE IF NOT EXISTS public.namecard_notifications (
    id TEXT PRIMARY KEY,
    recipient_account_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    card_number BIGINT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT namecard_notifications_id_check
        CHECK (length(btrim(id)) BETWEEN 1 AND 64),
    CONSTRAINT namecard_notifications_recipient_account_id_fkey
        FOREIGN KEY (recipient_account_id)
        REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    CONSTRAINT namecard_notifications_kind_check
        CHECK (kind IN ('card-approved', 'card-rejected', 'claim-approved', 'claim-rejected')),
    CONSTRAINT namecard_notifications_card_number_check
        CHECK (card_number IS NULL OR card_number > 0),
    CONSTRAINT namecard_notifications_title_check
        CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    CONSTRAINT namecard_notifications_body_check
        CHECK (length(body) <= 4000)
);

CREATE INDEX IF NOT EXISTS namecard_notifications_recipient_idx
    ON public.namecard_notifications (recipient_account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS namecard_notifications_unread_idx
    ON public.namecard_notifications (recipient_account_id)
    WHERE read_at IS NULL;

-- 驳回理由单独留一份在名片上，便于名片页直接展示「为什么被驳回」。
ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

DO $$
BEGIN
    RAISE NOTICE 'namecard notifications ready';
END
$$;
