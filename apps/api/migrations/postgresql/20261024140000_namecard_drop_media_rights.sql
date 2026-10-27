-- ims:migration-phase: post-data
-- 素材授权（media_rights_status）不再作为名片上墙或审核的条件：
-- 运营确认该字段没有实际意义，因此连同相关校验一并删除。
ALTER TABLE public.fudaba_cards DROP CONSTRAINT IF EXISTS fudaba_cards_check1;
ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT IF EXISTS fudaba_cards_media_rights_status_check;
ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT IF EXISTS fudaba_cards_media_rights_status_not_null;
ALTER TABLE public.fudaba_cards DROP COLUMN IF EXISTS media_rights_status;

DO $$
BEGIN
    RAISE NOTICE 'namecard media rights retired';
END $$;
