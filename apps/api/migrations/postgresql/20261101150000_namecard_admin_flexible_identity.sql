-- ims:migration-phase: pre-data
-- The backoffice has to be able to save a card whose producer name or series
-- list is still empty (legacy imports and half-filled submissions). The owner
-- editor keeps requiring both, so the API still rejects them from users.

ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT IF EXISTS fudaba_cards_producer_name_check;

ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_producer_name_check
    CHECK (producer_name IS NULL OR length(btrim(producer_name)) <= 80);

DROP TRIGGER IF EXISTS fudaba_card_series_required
    ON public.fudaba_card_series;
