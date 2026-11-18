-- ims:migration-phase: pre-data
--
-- 通知详情窗口（R9）：点开「有一笔名片交换在等你确认」要能定位到那笔交换。
-- 只有 `card-exchange-requested/-accepted/-declined` 三类带值，其余通知为 NULL；
-- 交换行被清理时置空而不是删通知（通知本身仍有阅读价值）。
ALTER TABLE public.namecard_notifications
    ADD COLUMN IF NOT EXISTS exchange_id UUID
        REFERENCES public.namecard_exchanges(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS namecard_notifications_exchange_idx
    ON public.namecard_notifications(exchange_id);
