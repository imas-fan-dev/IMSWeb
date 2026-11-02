-- ims:migration-phase: post-data

-- Deleting a card cascades into its series rows, and the deferred trigger used
-- to reject that cascade because the card momentarily looked like a card with
-- no series. The guard only applies to cards that still exist.

CREATE OR REPLACE FUNCTION public.fudaba_card_series_require_one()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM public.fudaba_cards
        WHERE id = COALESCE(NEW.card_id, OLD.card_id)
    ) THEN
        RETURN NULL;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM public.fudaba_card_series
        WHERE card_id = COALESCE(NEW.card_id, OLD.card_id)
    ) THEN
        RAISE EXCEPTION 'card % must keep at least one series',
            COALESCE(NEW.card_id, OLD.card_id)
            USING ERRCODE = 'check_violation';
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;
