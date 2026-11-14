-- ims:migration-phase: post-data
--
-- P4: fudaba_card_media is a legacy compatibility cache. Page rows are canonical.
DROP TABLE IF EXISTS public.fudaba_card_media;
