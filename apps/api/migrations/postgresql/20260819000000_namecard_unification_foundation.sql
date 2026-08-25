-- ims:migration-phase: post-data

-- Namecards become one table with two layers. Every card carries the base
-- layer: a numeric card number for the anonymous URLs, an origin, a series
-- code, two image object keys, a status and a revision. Cards that belong to a
-- platform account additionally carry the exchange layer: owner, producer name,
-- display name, favourite idol, accent, bio and trade note.
--
-- Anonymous submission stays a first-class flow, so the hashes, submitter IP
-- and withdrawal token move to a side table instead of the row that public
-- reads touch. Emoji reactions move to a table keyed by the unified card id so
-- legacy cards and exchange cards share one reaction store.

-- 1. Base layer columns.

CREATE SEQUENCE IF NOT EXISTS public.namecard_number_seq AS BIGINT;

ALTER TABLE public.fudaba_cards
    ADD COLUMN card_number BIGINT,
    ADD COLUMN origin TEXT NOT NULL DEFAULT 'exchange';

ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_origin_check
        CHECK (origin IN ('exchange', 'guest', 'legacy'));

-- 2. The exchange layer becomes optional so a base-only card can exist.

ALTER TABLE public.fudaba_cards
    ALTER COLUMN owner_account_id DROP NOT NULL,
    ALTER COLUMN producer_name DROP NOT NULL,
    ALTER COLUMN display_name DROP NOT NULL,
    ALTER COLUMN favorite_idol DROP NOT NULL,
    ALTER COLUMN accent DROP NOT NULL,
    ALTER COLUMN bio DROP NOT NULL,
    ALTER COLUMN trade_note DROP NOT NULL,
    ALTER COLUMN series_code DROP NOT NULL;

-- Ownership is what separates the two layers: an owned card must be complete,
-- an unowned card must carry no owner-only field. Claiming a legacy card fills
-- these columns in place and keeps origin as provenance.
ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_owner_layer_check CHECK (
        (
            owner_account_id IS NULL
            AND producer_name IS NULL
            AND display_name IS NULL
            AND favorite_idol IS NULL
            AND accent IS NULL
            AND bio IS NULL
            AND trade_note IS NULL
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

-- 3. One status vocabulary. Legacy `approved` becomes `published`; the
-- anonymous withdrawal state joins the publication states.

ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT fudaba_cards_publication_status_check;
ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_publication_status_check
        CHECK (publication_status IN (
            'draft', 'pending', 'approving', 'published',
            'hidden', 'rejected', 'withdrawn'
        ));

-- 4. Anonymous submission attributes live beside the card, not inside it.

CREATE TABLE public.namecard_guest_attributes (
    card_id TEXT PRIMARY KEY
        REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    hash1 TEXT NOT NULL
        CHECK (length(hash1) BETWEEN 1 AND 128),
    hash2 TEXT NOT NULL
        CHECK (length(hash2) BETWEEN 1 AND 128),
    submitted_ip TEXT
        CHECK (submitted_ip IS NULL OR length(submitted_ip) <= 64),
    withdrawal_token_hash TEXT
        CHECK (withdrawal_token_hash IS NULL OR length(withdrawal_token_hash) <= 128),
    withdrawn_at TIMESTAMPTZ,
    rejected_at TIMESTAMPTZ
);

CREATE INDEX namecard_guest_attributes_hash_idx
    ON public.namecard_guest_attributes(hash1, hash2);

-- 5. Emoji reactions keyed by the unified card id, so the exchange wall and the
-- compatibility pages count the same reactions.

CREATE TABLE public.namecard_reactions (
    card_id TEXT NOT NULL
        REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL
        CHECK (length(emoji) BETWEEN 1 AND 32),
    count INTEGER NOT NULL DEFAULT 0
        CHECK (count >= 0),
    PRIMARY KEY (card_id, emoji)
);

CREATE INDEX namecard_reactions_card_idx
    ON public.namecard_reactions(card_id);

-- 6. Legacy media addresses become object keys with the same transform the
-- application uses (`namecardImageObjectKey`). A path outside the canonical
-- upload directory keeps its stored form so the row stays unique and the media
-- reconciliation report can pick it up instead of blocking the migration.

CREATE FUNCTION pg_temp.namecard_media_key(media_url TEXT) RETURNS TEXT AS $$
    SELECT CASE
        WHEN $1 ~ '^/uploads/namecard/original/[^/]+\.[A-Za-z0-9]+$' THEN
            'community/namecards/assets/'
            || regexp_replace(split_part($1, '/', 5), '\.[^.]*$', '')
            || '/image.'
            || lower(regexp_replace(split_part($1, '/', 5), '^.*\.', ''))
        ELSE regexp_replace($1, '^/+', '')
    END;
$$ LANGUAGE SQL IMMUTABLE;

-- 7. Backfill the existing cards into the unified table. A card that was
-- already claimed keeps its exchange row; everything else arrives as a
-- base-only row whose id encodes the legacy number.

INSERT INTO public.fudaba_cards (
    id,
    card_number,
    origin,
    series_code,
    producer_name,
    display_name,
    favorite_idol,
    accent,
    bio,
    trade_note,
    front_object_key,
    back_object_key,
    available,
    media_rights_status,
    publication_status,
    revision,
    created_at,
    updated_at
)
SELECT
    'legacy-' || legacy.id,
    legacy.id,
    legacy.submission_kind,
    legacy.series_code,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    pg_temp.namecard_media_key(legacy.image1_url),
    pg_temp.namecard_media_key(legacy.image2_url),
    FALSE,
    'approved',
    CASE legacy.status WHEN 'approved' THEN 'published' ELSE legacy.status END,
    legacy.revision,
    COALESCE(legacy.created_at, CURRENT_TIMESTAMP),
    COALESCE(legacy.created_at, CURRENT_TIMESTAMP)
FROM public.cards AS legacy
WHERE NOT EXISTS (
    SELECT 1 FROM public.fudaba_cards AS unified
    WHERE unified.legacy_card_id = legacy.id
);

WITH mapping AS (
    SELECT
        legacy.*,
        COALESCE(claimed.id, 'legacy-' || legacy.id) AS unified_id
    FROM public.cards AS legacy
    LEFT JOIN public.fudaba_cards AS claimed
        ON claimed.legacy_card_id = legacy.id
)
INSERT INTO public.namecard_guest_attributes (
    card_id,
    hash1,
    hash2,
    submitted_ip,
    withdrawal_token_hash,
    withdrawn_at,
    rejected_at
)
SELECT
    mapping.unified_id,
    COALESCE(mapping.hash1, ''),
    COALESCE(mapping.hash2, ''),
    mapping.ip,
    mapping.withdrawal_token_hash,
    mapping.withdrawn_at,
    mapping.rejected_at
FROM mapping;

-- Orphaned reaction rows predate the legacy foreign key and stay behind in
-- card_emojis; the join drops them instead of failing the migration.
WITH mapping AS (
    SELECT
        legacy.id AS legacy_id,
        COALESCE(claimed.id, 'legacy-' || legacy.id) AS unified_id
    FROM public.cards AS legacy
    LEFT JOIN public.fudaba_cards AS claimed
        ON claimed.legacy_card_id = legacy.id
)
INSERT INTO public.namecard_reactions (card_id, emoji, count)
SELECT
    mapping.unified_id,
    reaction.emoji,
    GREATEST(COALESCE(reaction.count, 0), 0)
FROM public.card_emojis AS reaction
JOIN mapping ON mapping.legacy_id = reaction.card_id
ON CONFLICT (card_id, emoji) DO NOTHING;

-- 8. Number the rows that predate the sequence, starting past the legacy ids so
-- the compatibility URLs never collide.

SELECT setval(
    'public.namecard_number_seq',
    GREATEST(COALESCE((SELECT max(id) FROM public.cards), 0), 1)
);

UPDATE public.fudaba_cards
SET card_number = nextval('public.namecard_number_seq')
WHERE card_number IS NULL;

ALTER TABLE public.fudaba_cards
    ALTER COLUMN card_number SET DEFAULT nextval('public.namecard_number_seq'),
    ALTER COLUMN card_number SET NOT NULL,
    ADD CONSTRAINT fudaba_cards_card_number_key UNIQUE (card_number),
    ADD CONSTRAINT fudaba_cards_card_number_check CHECK (card_number > 0);

ALTER SEQUENCE public.namecard_number_seq OWNED BY public.fudaba_cards.card_number;

-- 9. Verify the backfill before the migration commits.

DO $$
DECLARE
    legacy_total BIGINT;
    mapped_total BIGINT;
    guest_total BIGINT;
    reaction_source BIGINT;
    reaction_total BIGINT;
BEGIN
    SELECT count(*) INTO legacy_total FROM public.cards;
    SELECT count(*) INTO mapped_total
    FROM public.fudaba_cards
    WHERE origin IN ('guest', 'legacy') OR legacy_card_id IS NOT NULL;
    IF legacy_total <> mapped_total THEN
        RAISE EXCEPTION
            'namecard unification: % legacy card(s) but % unified row(s)',
            legacy_total, mapped_total;
    END IF;

    SELECT count(*) INTO guest_total FROM public.namecard_guest_attributes;
    IF legacy_total <> guest_total THEN
        RAISE EXCEPTION
            'namecard unification: % legacy card(s) but % guest attribute row(s)',
            legacy_total, guest_total;
    END IF;

    SELECT count(*) INTO reaction_source
    FROM public.card_emojis AS reaction
    JOIN public.cards AS legacy ON legacy.id = reaction.card_id;
    SELECT count(*) INTO reaction_total FROM public.namecard_reactions;
    IF reaction_source <> reaction_total THEN
        RAISE EXCEPTION
            'namecard unification: % attached reaction(s) but % migrated row(s)',
            reaction_source, reaction_total;
    END IF;
END
$$;
