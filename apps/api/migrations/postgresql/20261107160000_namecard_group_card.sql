-- ims:migration-phase: post-data
--
-- 团体名片：有些名片不属于某位制作人，而属于一个团体。这类名片不再要求填写
-- 制作人名称，改由团体名称承担展示与检索；交换模式固定为「自动」，因为团体名片
-- 本来就是给所有人领取的。
--
-- `producer_name` 仍然是非空列（`fudaba_cards_owner_layer_check`），所以团体名片
-- 把团体名称写进这一列——检索（后台 ILIKE）与既有读取路径因此不需要任何改动。
-- 该派生由触发器统一维护，改名时也会同步。

ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS is_group_card BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT IF EXISTS fudaba_cards_group_card_exchange_check;

-- 无主名片本来就不能参与交换（交换模式固定 none），团体标记也管不到它。
ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_group_card_exchange_check
        CHECK (
            NOT is_group_card
            OR owner_account_id IS NULL
            OR exchange_mode = 'auto'
        );

CREATE OR REPLACE FUNCTION public.namecard_apply_group_card()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    typed TEXT;
BEGIN
    IF NEW.is_group_card THEN
        -- 制作人名称只是选填（团体可能有自己的吉祥物）：填了就用填的，
        -- 留空时回落到团体名称，让检索与既有读取路径都有值可用。
        typed := NULLIF(btrim(NEW.producer_name), '');
        IF TG_OP = 'UPDATE'
           AND OLD.is_group_card
           AND typed = NULLIF(btrim(OLD.producer_name), '')
           AND NULLIF(btrim(OLD.producer_name), '') = NULLIF(btrim(OLD.group_name), '')
        THEN
            -- 上一次就是回落值；团体改名时让它跟着走。
            typed := NULL;
        END IF;
        NEW.producer_name := COALESCE(typed, NULLIF(btrim(NEW.group_name), ''));
        -- 有主的团体名片只能自动交换；无主名片固定 none，等认领后再切。
        IF NEW.owner_account_id IS NOT NULL THEN
            NEW.exchange_mode := 'auto';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fudaba_cards_group_card ON public.fudaba_cards;
CREATE TRIGGER fudaba_cards_group_card
    BEFORE INSERT OR UPDATE ON public.fudaba_cards
    FOR EACH ROW
    EXECUTE FUNCTION public.namecard_apply_group_card();
