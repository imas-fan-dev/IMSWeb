-- ims:migration-phase: post-data
-- 认领结果与同号名片提示统一走 `namecard_notifications`，`fudaba_claim_envelopes`
-- 不再是读路径。这里把历史信封整体搬进通知表：已读状态与创建时间原样保留，
-- 重复的 (收件人, 类型, 名片号) 只保留最早的一条。
--
-- 信封表本身不删：它是认领确认动作的审计历史，删除会同时抹掉 claim_id 关联。
INSERT INTO public.namecard_notifications
    (id, recipient_account_id, kind, card_number, title, body, read_at, created_at)
SELECT
    'legacy-envelope-' || envelope.id,
    envelope.recipient_account_id,
    envelope.kind,
    envelope.legacy_card_id,
    envelope.title,
    envelope.body,
    envelope.read_at,
    envelope.created_at
FROM public.fudaba_claim_envelopes envelope
WHERE NOT EXISTS (
    SELECT 1
    FROM public.namecard_notifications existing
    WHERE existing.recipient_account_id = envelope.recipient_account_id
      AND existing.kind = envelope.kind
      AND existing.card_number = envelope.legacy_card_id
);
