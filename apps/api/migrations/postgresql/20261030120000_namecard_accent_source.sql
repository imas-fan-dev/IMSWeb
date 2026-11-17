-- ims:migration-phase: post-data

-- `accent` comes either from the front artwork (sampled dominant colour) or
-- from the series set (single series -> agency colour, several -> neutral
-- fallback). The source is recorded so a later series edit cannot repaint a
-- colour that was sampled from the artwork.

ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS accent_source TEXT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fudaba_cards_accent_source_check'
          AND conrelid = 'public.fudaba_cards'::regclass
    ) THEN
        ALTER TABLE public.fudaba_cards
            ADD CONSTRAINT fudaba_cards_accent_source_check
            CHECK (accent_source IS NULL OR accent_source IN ('image', 'series', 'fallback'));
    END IF;
END;
$$;

-- Cards that already carry a sampled colour stay untouched; the rest let the
-- next series write decide. Nothing is backfilled because the old rows never
-- recorded where the colour came from.
