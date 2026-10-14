-- ims:migration-phase: post-data
--
-- Anonymous namecards may describe themselves.
--
-- The unification foundation tied every profile field to an owner account, so
-- an ownerless card could only be two images. Guest submissions now accept the
-- same descriptive fields an owner writes: producer name, card name, favourite
-- idol, accent and bio, plus idol selections. What stays owner-only is the
-- exchange management layer, because a trade note and an availability flag
-- assume someone can answer for them.

-- 1. Split the owner layer into content anyone may write and management that
-- needs an account behind it.

ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT fudaba_cards_owner_layer_check;
ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_owner_layer_check CHECK (
        (
            owner_account_id IS NULL
            AND trade_note IS NULL
            AND available = FALSE
        )
        OR (
            owner_account_id IS NOT NULL
            AND producer_name IS NOT NULL
            AND display_name IS NOT NULL
            AND favorite_idol IS NOT NULL
            AND accent IS NOT NULL
            AND bio IS NOT NULL
            AND trade_note IS NOT NULL
            AND series_code IS NOT NULL
        )
    );

-- 2. Idol selections follow the cards. The legacy table keys on the old BIGINT
-- id, so rows are mapped through the same claimed-or-legacy id resolution the
-- foundation migration used.

INSERT INTO public.fudaba_card_idols (card_id, idol_id, display_order)
SELECT unified.id, legacy_idol.idol_id, legacy_idol.display_order
FROM public.namecard_idols legacy_idol
JOIN public.cards legacy ON legacy.id = legacy_idol.card_id
JOIN LATERAL (
    SELECT COALESCE(claimed.id, 'legacy-' || legacy.id::TEXT) AS id
    FROM (SELECT 1) AS anchor
    LEFT JOIN public.fudaba_cards claimed
      ON claimed.legacy_card_id = legacy.id
) AS unified ON TRUE
WHERE EXISTS (
    SELECT 1 FROM public.fudaba_cards card WHERE card.id = unified.id
)
ON CONFLICT DO NOTHING;

-- 3. Verify the selections survived the mapping.

DO $$
DECLARE
    legacy_selections BIGINT;
    unified_selections BIGINT;
BEGIN
    SELECT COUNT(*) INTO legacy_selections
    FROM public.namecard_idols legacy_idol
    JOIN public.cards legacy ON legacy.id = legacy_idol.card_id;

    SELECT COUNT(*) INTO unified_selections
    FROM public.namecard_idols legacy_idol
    JOIN public.cards legacy ON legacy.id = legacy_idol.card_id
    JOIN public.fudaba_cards card
      ON card.id = COALESCE(
             (SELECT claimed.id FROM public.fudaba_cards claimed
              WHERE claimed.legacy_card_id = legacy.id),
             'legacy-' || legacy.id::TEXT
         )
    JOIN public.fudaba_card_idols selection
      ON selection.card_id = card.id AND selection.idol_id = legacy_idol.idol_id;

    IF legacy_selections <> unified_selections THEN
        RAISE EXCEPTION
            'namecard guest profile: % legacy idol selection(s) but % unified',
            legacy_selections, unified_selections;
    END IF;
END $$;
