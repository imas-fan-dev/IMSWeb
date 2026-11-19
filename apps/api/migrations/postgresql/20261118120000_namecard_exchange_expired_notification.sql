-- ims:migration-phase: pre-data
--
-- 手动交换多一种结果：请求超过一周没人处理时，发起方收到一条超时通知。
-- 该通知带 `exchange_id`（同请求通知），收件箱可据此打开详情。
ALTER TABLE public.namecard_notifications
    DROP CONSTRAINT IF EXISTS namecard_notifications_kind_check;

ALTER TABLE public.namecard_notifications
    ADD CONSTRAINT namecard_notifications_kind_check
        CHECK (kind IN (
            'card-approved', 'card-rejected', 'claim-approved', 'claim-rejected',
            'station-message', 'card-locked', 'card-unlocked',
            'card-admin-edited', 'card-transferred-in', 'card-transferred-out',
            'card-feedback-accepted', 'card-feedback-rejected',
            'card-supplement-approved', 'card-supplement-rejected',
            'legacy-card-match',
            -- 手动交换：待确认与三种结果（同意 / 拒绝 / 超时）各通知一次。
            'card-exchange-requested',
            'card-exchange-accepted',
            'card-exchange-declined',
            'card-exchange-expired'
        ));
