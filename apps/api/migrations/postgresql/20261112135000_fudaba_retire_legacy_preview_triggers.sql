-- ims:migration-phase: post-data
-- The following migration retires the columns referenced by these triggers.
DROP TRIGGER IF EXISTS fudaba_card_front_preview_invalidation ON public.fudaba_cards;
DROP TRIGGER IF EXISTS fudaba_card_back_preview_invalidation ON public.fudaba_cards;
DROP FUNCTION IF EXISTS public.fudaba_invalidate_card_preview();
