-- ims:migration-phase: post-data

-- The namecard picker draws from `namecard_characters` from this release on, so
-- the card-side link tables move with it: `idol_id` becomes `character_id`, the
-- foreign key is retargeted, and the tables are renamed from `*_idols` to
-- `*_favorite_characters` — the links hold 担当, which is no longer synonymous
-- with an idol.
--
-- The name is `*_favorite_characters` and not `*_favorites` because
-- `fudaba_card_favorites` already exists: it is the card bookmark table created
-- by 0022_fudaba_domain.sql.
--
-- Existing links still carry `idols.id` values. Rather than truncate them, the
-- Wiki idols they reference are first materialized into the namecard catalog and
-- the link values are remapped by (agency, name). The old foreign keys have to
-- come off before that remap, because the values are moving out of `idols`
-- entirely. The local dataset is empty, so this data step has to be exercised
-- with synthetic rows.

-- 1. Materialize every Wiki idol a live link still points at.
INSERT INTO public.namecard_characters (
    agency_id, category, name_cn, display_order, is_fallback
)
SELECT DISTINCT idol.agency_id, 'idol', idol.name_cn, idol.display_order, false
FROM public.idols idol
WHERE EXISTS (
        SELECT 1 FROM public.fudaba_card_idols link WHERE link.idol_id = idol.id
    )
    OR EXISTS (
        SELECT 1 FROM public.fudaba_card_claim_idols link
        WHERE link.idol_id = idol.id
    )
    OR EXISTS (
        SELECT 1 FROM public.namecard_idols link WHERE link.idol_id = idol.id
    )
ON CONFLICT DO NOTHING;

-- 2. Release the links from `idols` so their values can move.
ALTER TABLE public.fudaba_card_idols
    DROP CONSTRAINT fudaba_card_idols_idol_id_fkey;
ALTER TABLE public.fudaba_card_claim_idols
    DROP CONSTRAINT fudaba_card_claim_idols_idol_id_fkey;
ALTER TABLE public.namecard_idols
    DROP CONSTRAINT namecard_idols_idol_id_fkey;

-- 3. Remap the links onto the catalog rows. `namecard_characters` is unique per
-- live (agency, name), so the join is single-valued.
UPDATE public.fudaba_card_idols link
SET idol_id = character.id
FROM public.idols idol
JOIN public.namecard_characters character
    ON character.agency_id = idol.agency_id
    AND character.name_cn = idol.name_cn
    AND character.deleted_at IS NULL
WHERE idol.id = link.idol_id;

UPDATE public.fudaba_card_claim_idols link
SET idol_id = character.id
FROM public.idols idol
JOIN public.namecard_characters character
    ON character.agency_id = idol.agency_id
    AND character.name_cn = idol.name_cn
    AND character.deleted_at IS NULL
WHERE idol.id = link.idol_id;

UPDATE public.namecard_idols link
SET idol_id = character.id
FROM public.idols idol
JOIN public.namecard_characters character
    ON character.agency_id = idol.agency_id
    AND character.name_cn = idol.name_cn
    AND character.deleted_at IS NULL
WHERE idol.id = link.idol_id;

-- 4. Card 担当 links.
ALTER TABLE public.fudaba_card_idols
    RENAME TO fudaba_card_favorite_characters;
ALTER TABLE public.fudaba_card_favorite_characters
    RENAME COLUMN idol_id TO character_id;
ALTER TABLE public.fudaba_card_favorite_characters
    RENAME CONSTRAINT fudaba_card_idols_pkey
    TO fudaba_card_favorite_characters_pkey;
ALTER TABLE public.fudaba_card_favorite_characters
    RENAME CONSTRAINT fudaba_card_idols_card_order_key
    TO fudaba_card_favorite_characters_card_order_key;
ALTER TABLE public.fudaba_card_favorite_characters
    RENAME CONSTRAINT fudaba_card_idols_display_order_check
    TO fudaba_card_favorite_characters_display_order_check;
ALTER TABLE public.fudaba_card_favorite_characters
    RENAME CONSTRAINT fudaba_card_idols_card_id_fkey
    TO fudaba_card_favorite_characters_card_id_fkey;
ALTER TABLE public.fudaba_card_favorite_characters
    RENAME CONSTRAINT fudaba_card_idols_idol_id_not_null
    TO fudaba_card_favorite_characters_character_id_not_null;
ALTER TABLE public.fudaba_card_favorite_characters
    ADD CONSTRAINT fudaba_card_favorite_characters_character_id_fkey
        FOREIGN KEY (character_id) REFERENCES public.namecard_characters(id)
        ON DELETE RESTRICT;
ALTER INDEX public.fudaba_card_idols_idol_id_idx
    RENAME TO fudaba_card_favorite_characters_character_id_idx;

-- 5. Claim 担当 links.
ALTER TABLE public.fudaba_card_claim_idols
    RENAME TO fudaba_card_claim_favorite_characters;
ALTER TABLE public.fudaba_card_claim_favorite_characters
    RENAME COLUMN idol_id TO character_id;
ALTER TABLE public.fudaba_card_claim_favorite_characters
    RENAME CONSTRAINT fudaba_card_claim_idols_pkey
    TO fudaba_card_claim_favorite_characters_pkey;
ALTER TABLE public.fudaba_card_claim_favorite_characters
    RENAME CONSTRAINT fudaba_card_claim_idols_claim_order_key
    TO fudaba_card_claim_favorite_characters_claim_order_key;
ALTER TABLE public.fudaba_card_claim_favorite_characters
    RENAME CONSTRAINT fudaba_card_claim_idols_display_order_check
    TO fudaba_card_claim_favorite_characters_display_order_check;
ALTER TABLE public.fudaba_card_claim_favorite_characters
    RENAME CONSTRAINT fudaba_card_claim_idols_claim_id_fkey
    TO fudaba_card_claim_favorite_characters_claim_id_fkey;
ALTER TABLE public.fudaba_card_claim_favorite_characters
    RENAME CONSTRAINT fudaba_card_claim_idols_idol_id_not_null
    TO fudaba_card_claim_favorite_characters_character_id_not_null;
ALTER TABLE public.fudaba_card_claim_favorite_characters
    ADD CONSTRAINT fudaba_card_claim_favorite_characters_character_id_fkey
        FOREIGN KEY (character_id) REFERENCES public.namecard_characters(id)
        ON DELETE RESTRICT;
ALTER INDEX public.fudaba_card_claim_idols_idol_id_idx
    RENAME TO fudaba_card_claim_favorite_characters_character_id_idx;

-- 6. Legacy guest-card 担当 links. Nothing in `apps/api/src` reads this table
-- any more — migration 20260820000000 copied its rows into the card table and
-- asserted the counts matched — but it is renamed rather than dropped so the
-- release stays non-destructive.
ALTER TABLE public.namecard_idols RENAME TO namecard_favorite_characters;
ALTER TABLE public.namecard_favorite_characters
    RENAME COLUMN idol_id TO character_id;
ALTER TABLE public.namecard_favorite_characters
    RENAME CONSTRAINT namecard_idols_pkey TO namecard_favorite_characters_pkey;
ALTER TABLE public.namecard_favorite_characters
    RENAME CONSTRAINT namecard_idols_card_order_key
    TO namecard_favorite_characters_card_order_key;
ALTER TABLE public.namecard_favorite_characters
    RENAME CONSTRAINT namecard_idols_display_order_check
    TO namecard_favorite_characters_display_order_check;
ALTER TABLE public.namecard_favorite_characters
    RENAME CONSTRAINT namecard_idols_card_id_fkey
    TO namecard_favorite_characters_card_id_fkey;
ALTER TABLE public.namecard_favorite_characters
    RENAME CONSTRAINT namecard_idols_idol_id_not_null
    TO namecard_favorite_characters_character_id_not_null;
ALTER TABLE public.namecard_favorite_characters
    ADD CONSTRAINT namecard_favorite_characters_character_id_fkey
        FOREIGN KEY (character_id) REFERENCES public.namecard_characters(id)
        ON DELETE RESTRICT;
ALTER INDEX public.namecard_idols_idol_id_idx
    RENAME TO namecard_favorite_characters_character_id_idx;

-- 7. The denormalized label that mirrors the link rows. It is a display scalar
-- ("、"-joined names), so only the name moves.
ALTER TABLE public.fudaba_cards RENAME COLUMN favorite_idol TO favorite_character;
ALTER TABLE public.fudaba_cards
    RENAME CONSTRAINT fudaba_cards_favorite_idol_check
    TO fudaba_cards_favorite_character_check;
