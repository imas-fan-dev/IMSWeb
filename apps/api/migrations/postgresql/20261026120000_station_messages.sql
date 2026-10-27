-- ims:migration-phase: post-data
-- 站内信（后台群发）：把「邮件服务」拆成「发送站内信」与「服务配置」后，站内信不再
-- 复用验证码投递队列，而是直接写入 `namecard_notifications`——收件人在「消息」面板
-- 读取，与名片审核通知共用同一套未读角标、保留策略（未读 90 天 / 已读 30 天 / 每账号
-- 200 条，见 `namecard-notification-repository.ts`）。
--
-- 本迁移只做两件事：
--   1. 放开 `namecard_notifications.kind`，新增 `station-message`；
--   2. 新增群发批次 `station_messages` 与收件人快照 `station_message_recipients`，
--      支撑定时派发、发送历史审计与「同时转发到绑定邮箱」的逐条投递状态。

ALTER TABLE public.namecard_notifications
    DROP CONSTRAINT IF EXISTS namecard_notifications_kind_check;

ALTER TABLE public.namecard_notifications
    ADD CONSTRAINT namecard_notifications_kind_check
        CHECK (kind IN (
            'card-approved',
            'card-rejected',
            'claim-approved',
            'claim-rejected',
            'station-message'
        ));

CREATE TABLE IF NOT EXISTS public.station_messages (
    id TEXT PRIMARY KEY,
    sender_admin_id TEXT NOT NULL,
    sender_admin_name TEXT NOT NULL,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    audience TEXT NOT NULL,
    forward_email BOOLEAN NOT NULL DEFAULT FALSE,
    scheduled_at TIMESTAMPTZ,
    status TEXT NOT NULL,
    recipient_count INTEGER NOT NULL DEFAULT 0,
    delivered_count INTEGER NOT NULL DEFAULT 0,
    email_sent_count INTEGER NOT NULL DEFAULT 0,
    email_failed_count INTEGER NOT NULL DEFAULT 0,
    failure_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    CONSTRAINT station_messages_id_check
        CHECK (length(btrim(id)) BETWEEN 1 AND 64),
    CONSTRAINT station_messages_sender_check
        CHECK (length(btrim(sender_admin_id)) BETWEEN 1 AND 128),
    CONSTRAINT station_messages_sender_name_check
        CHECK (length(btrim(sender_admin_name)) BETWEEN 1 AND 128),
    CONSTRAINT station_messages_title_check
        CHECK (length(btrim(title)) BETWEEN 1 AND 200),
    CONSTRAINT station_messages_body_check
        CHECK (length(btrim(body)) BETWEEN 1 AND 4000),
    CONSTRAINT station_messages_audience_check
        CHECK (audience IN ('all', 'selected')),
    CONSTRAINT station_messages_status_check
        CHECK (status IN ('scheduled', 'sending', 'sent', 'failed', 'canceled')),
    CONSTRAINT station_messages_counts_check
        CHECK (
            recipient_count >= 0
            AND delivered_count >= 0
            AND delivered_count <= recipient_count
            AND email_sent_count >= 0
            AND email_failed_count >= 0
        )
);

CREATE INDEX IF NOT EXISTS station_messages_due_idx
    ON public.station_messages (scheduled_at)
    WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS station_messages_created_idx
    ON public.station_messages (created_at DESC);

CREATE TABLE IF NOT EXISTS public.station_message_recipients (
    message_id TEXT NOT NULL
        REFERENCES public.station_messages(id) ON DELETE CASCADE,
    account_id TEXT NOT NULL
        REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    delivered_at TIMESTAMPTZ,
    email_state TEXT NOT NULL DEFAULT 'skipped',
    email_attempts INTEGER NOT NULL DEFAULT 0,
    email_sent_at TIMESTAMPTZ,
    email_error TEXT,
    PRIMARY KEY (message_id, account_id),
    CONSTRAINT station_message_recipients_email_state_check
        CHECK (email_state IN ('pending', 'sent', 'failed', 'skipped')),
    CONSTRAINT station_message_recipients_email_attempts_check
        CHECK (email_attempts BETWEEN 0 AND 10),
    CONSTRAINT station_message_recipients_email_error_check
        CHECK (email_error IS NULL OR length(email_error) <= 500)
);

-- The dispatcher claims pending email rows for one message at a time.
CREATE INDEX IF NOT EXISTS station_message_recipients_pending_email_idx
    ON public.station_message_recipients (message_id)
    WHERE email_state = 'pending';

DO $$
BEGIN
    RAISE NOTICE 'station messages ready';
END
$$;
