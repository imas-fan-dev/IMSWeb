-- ims:migration-phase: post-data
--
-- P4: `fudaba_card_pages` is the only artwork source. The five key columns on
-- `fudaba_cards` (`front_object_key`, `back_object_key`,
-- `pending_front_object_key`, `pending_back_object_key`,
-- `pending_middle_object_keys`) are dead weight, so retire them together with
-- the trigger that rewrote their legacy `/uploads/namecard/original/...` values.
-- Dropping the columns also removes the unique and check constraints that
-- referenced them.

DROP TRIGGER IF EXISTS fudaba_cards_normalize_media ON public.fudaba_cards;
DROP FUNCTION IF EXISTS public.namecard_normalize_card_media();
DROP FUNCTION IF EXISTS public.namecard_normalize_media_object();
DROP FUNCTION IF EXISTS public.namecard_media_key(TEXT);

ALTER TABLE public.fudaba_cards
    DROP COLUMN IF EXISTS front_object_key,
    DROP COLUMN IF EXISTS back_object_key,
    DROP COLUMN IF EXISTS pending_front_object_key,
    DROP COLUMN IF EXISTS pending_back_object_key,
    DROP COLUMN IF EXISTS pending_middle_object_keys;
