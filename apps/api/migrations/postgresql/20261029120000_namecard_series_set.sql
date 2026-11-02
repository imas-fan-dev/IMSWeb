-- ims:migration-phase: post-data

-- A card may belong to several series at once (an office can already do so via
-- `fudaba_office_series_tags`). The set is ordered for display; every filter
-- reads the set, so no "primary series" is stored anywhere.

CREATE TABLE IF NOT EXISTS public.fudaba_card_series (
    card_id TEXT NOT NULL
        REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    series_code TEXT NOT NULL
        REFERENCES public.agencies(code) ON DELETE RESTRICT,
    display_order INTEGER NOT NULL CHECK (display_order BETWEEN 1 AND 64),
    PRIMARY KEY (card_id, series_code),
    UNIQUE (card_id, display_order)
);

CREATE INDEX IF NOT EXISTS fudaba_card_series_code_idx
    ON public.fudaba_card_series(series_code);

INSERT INTO public.fudaba_card_series (card_id, series_code, display_order)
SELECT card.id, card.series_code, 1
FROM public.fudaba_cards card
WHERE card.series_code IS NOT NULL
ON CONFLICT (card_id, series_code) DO NOTHING;

-- Every card must keep at least one series. A deferred constraint trigger checks
-- the child table instead of a denormalised column, so reordering inside one
-- transaction never trips it.
CREATE OR REPLACE FUNCTION public.fudaba_card_series_require_one()
RETURNS TRIGGER AS $$
BEGIN
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

DROP TRIGGER IF EXISTS fudaba_card_series_required ON public.fudaba_card_series;
CREATE CONSTRAINT TRIGGER fudaba_card_series_required
    AFTER INSERT OR UPDATE OR DELETE
    ON public.fudaba_card_series
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION public.fudaba_card_series_require_one();

-- `series_code` was the guest-submission shortcut (one series, no owner). Guest
-- submissions are gone, so the column has no consumer left; the set replaces it
-- everywhere, including the wall filters and the claim fallback.
ALTER TABLE public.fudaba_cards
    DROP COLUMN IF EXISTS series_code;

ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT IF EXISTS fudaba_cards_owner_layer_check;
ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_owner_layer_check CHECK (
        (owner_account_id IS NULL AND trade_note IS NULL AND exchange_mode = 'none')
        OR (owner_account_id IS NOT NULL AND producer_name IS NOT NULL AND trade_note IS NOT NULL)
    );
