-- ims:migration-phase: post-data

-- card_emojis kept receiving writes for every namecard that still has a
-- legacy `cards` counterpart, even after the unification foundation copied
-- its state into namecard_reactions once. The two stores have drifted since,
-- so recompute namecard_reactions from card_emojis's current state before the
-- application read/write path moves onto the unified table exclusively.
--
-- The unified id for a legacy card is its claim's id when one exists,
-- otherwise 'legacy-<id>' -- the same COALESCE the unification foundation
-- migration used, replayed here instead of relying on legacy_card_id (which
-- only ever gets set once a claim happens, not by the original backfill).

DELETE FROM public.namecard_reactions
WHERE card_id IN (
    SELECT COALESCE(claimed.id, 'legacy-' || legacy.id)
    FROM public.cards AS legacy
    LEFT JOIN public.fudaba_cards AS claimed
        ON claimed.legacy_card_id = legacy.id
);

INSERT INTO public.namecard_reactions (card_id, emoji, count)
SELECT mapping.unified_id, reaction.emoji, reaction.count
FROM public.card_emojis AS reaction
JOIN (
    SELECT
        legacy.id AS legacy_id,
        COALESCE(claimed.id, 'legacy-' || legacy.id) AS unified_id
    FROM public.cards AS legacy
    LEFT JOIN public.fudaba_cards AS claimed
        ON claimed.legacy_card_id = legacy.id
) AS mapping ON mapping.legacy_id = reaction.card_id
WHERE reaction.count > 0;

DO $$
DECLARE
    source_total BIGINT;
    unified_total BIGINT;
BEGIN
    SELECT COALESCE(SUM(reaction.count), 0) INTO source_total
    FROM public.card_emojis AS reaction
    JOIN public.cards AS legacy ON legacy.id = reaction.card_id
    WHERE reaction.count > 0;

    SELECT COALESCE(SUM(namecard.count), 0) INTO unified_total
    FROM public.namecard_reactions AS namecard
    JOIN (
        SELECT COALESCE(claimed.id, 'legacy-' || legacy.id) AS unified_id
        FROM public.cards AS legacy
        LEFT JOIN public.fudaba_cards AS claimed
            ON claimed.legacy_card_id = legacy.id
    ) AS mapping ON mapping.unified_id = namecard.card_id;

    IF source_total <> unified_total THEN
        RAISE EXCEPTION
            'namecard reaction reconciliation: % card_emojis total but % unified',
            source_total, unified_total;
    END IF;
END
$$;
