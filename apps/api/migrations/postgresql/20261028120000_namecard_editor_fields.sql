-- ims:migration-phase: post-data
--
-- Namecard editor metadata. The submitter-owned content is reshaped for the
-- shared editor window: titles go away, middle pages / production date / group /
-- creator credits / originality / AI flags / a display switch arrive, `available`
-- becomes a three-way exchange mode, the back image turns optional and the
-- legacy 担当角色 text survives as a read-only fallback.
--
-- `accent` stays: it is no longer submitted, it is derived from the artwork.

ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS made_on TEXT,
    ADD COLUMN IF NOT EXISTS group_name TEXT,
    ADD COLUMN IF NOT EXISTS is_original BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS made_with_ai BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS visible BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS exchange_mode TEXT NOT NULL DEFAULT 'manual';

-- An exchangeable card still required the recipient to accept each request, so
-- `available = true` is `manual`; `auto` is a new mode no existing card opted into.
UPDATE public.fudaba_cards
   SET exchange_mode = CASE WHEN available THEN 'manual' ELSE 'none' END;

-- Single-sided cards are allowed from now on.
-- 制作人名读法: kana or Latin letters only, used as the sort key for 制作人名.
ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS producer_reading TEXT;

ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT IF EXISTS fudaba_cards_producer_reading_check;

ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_producer_reading_check CHECK (
        producer_reading IS NULL
        OR (
            length(btrim(producer_reading)) BETWEEN 1 AND 80
            AND producer_reading ~ '^[ぁ-ゖァ-ヺーA-Za-z ]+$'
        )
    );

ALTER TABLE public.fudaba_cards
    ALTER COLUMN back_object_key DROP NOT NULL;

-- A staged revision carries its own middle pages until it goes live.
ALTER TABLE public.fudaba_cards
    ADD COLUMN IF NOT EXISTS pending_middle_object_keys TEXT[] NOT NULL DEFAULT '{}';

-- Fold the compatibility text into structured rows before it stops being written.
INSERT INTO public.fudaba_card_favorite_characters (card_id, character_id, display_order)
SELECT ranked.card_id, character.id, ranked.position::integer
  FROM (
        SELECT card.id AS card_id,
               btrim(split.name) AS raw_name,
               row_number() OVER (PARTITION BY card.id ORDER BY split.ordinality) AS position
          FROM public.fudaba_cards card
          CROSS JOIN LATERAL unnest(
                   string_to_array(replace(replace(card.favorite_character, '，', ','), '、', ','), ','))
                   WITH ORDINALITY AS split(name, ordinality)
         WHERE card.favorite_character IS NOT NULL
           AND btrim(card.favorite_character) <> ''
           AND NOT EXISTS (
               SELECT 1
                 FROM public.fudaba_card_favorite_characters existing
                WHERE existing.card_id = card.id)
       ) ranked
  JOIN public.namecard_characters character
    ON character.deleted_at IS NULL
   AND character.name_cn = ranked.raw_name
 ON CONFLICT (card_id, character_id) DO NOTHING;

-- Middle pages of multi-page cards, ordered by the submitter. Front and back
-- images are not stored here.
CREATE TABLE IF NOT EXISTS public.fudaba_card_media (
    card_id TEXT NOT NULL
        REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL
        CHECK (display_order BETWEEN 1 AND 18),
    object_key TEXT NOT NULL
        CHECK (length(object_key) BETWEEN 1 AND 1024),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (card_id, display_order),
    UNIQUE (object_key)
);

CREATE INDEX IF NOT EXISTS fudaba_card_media_card_idx
    ON public.fudaba_card_media(card_id, display_order);

-- Designers / illustrators credited for the artwork. A site member is stored as
-- an account reference; everyone else just needs a name, the profile URL is
-- optional. One person can hold several roles.
CREATE TABLE IF NOT EXISTS public.fudaba_card_credits (
    card_id TEXT NOT NULL
        REFERENCES public.fudaba_cards(id) ON DELETE CASCADE,
    display_order INTEGER NOT NULL
        CHECK (display_order BETWEEN 1 AND 8),
    account_id TEXT
        REFERENCES public.platform_accounts(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL
        CHECK (length(btrim(display_name)) BETWEEN 1 AND 80),
    url TEXT
        CHECK (url IS NULL OR length(url) BETWEEN 1 AND 300),
    roles TEXT[] NOT NULL
        CHECK (array_length(roles, 1) BETWEEN 1 AND 3
               AND roles <@ ARRAY['design', 'illustration', 'other']::TEXT[]),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (card_id, display_order)
);

CREATE INDEX IF NOT EXISTS fudaba_card_credits_card_idx
    ON public.fudaba_card_credits(card_id, display_order);

CREATE INDEX IF NOT EXISTS fudaba_card_credits_account_idx
    ON public.fudaba_card_credits(account_id)
    WHERE account_id IS NOT NULL;

ALTER TABLE public.fudaba_cards
    DROP CONSTRAINT IF EXISTS fudaba_cards_owner_layer_check,
    DROP CONSTRAINT IF EXISTS fudaba_cards_display_name_check,
    DROP CONSTRAINT IF EXISTS fudaba_cards_source_label_check,
    DROP CONSTRAINT IF EXISTS fudaba_cards_source_credit_check,
    DROP CONSTRAINT IF EXISTS fudaba_cards_check,
    DROP COLUMN IF EXISTS display_name,
    DROP COLUMN IF EXISTS source_url,
    DROP COLUMN IF EXISTS source_label,
    DROP COLUMN IF EXISTS source_credit,
    DROP COLUMN IF EXISTS available,
    DROP COLUMN IF EXISTS favorite_character;

ALTER TABLE public.fudaba_cards
    ADD CONSTRAINT fudaba_cards_check CHECK (
        back_object_key IS NULL OR front_object_key <> back_object_key
    ),
    ADD CONSTRAINT fudaba_cards_made_on_check CHECK (
        made_on IS NULL
        OR (made_on ~ '^[0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?$'
            AND left(made_on, 4)::INTEGER BETWEEN 2002 AND 2099)
    ),
    ADD CONSTRAINT fudaba_cards_group_name_check CHECK (
        group_name IS NULL OR length(btrim(group_name)) BETWEEN 1 AND 80
    ),
    ADD CONSTRAINT fudaba_cards_exchange_mode_check CHECK (
        exchange_mode IN ('auto', 'manual', 'none')
    ),
    ADD CONSTRAINT fudaba_cards_owner_layer_check CHECK (
        (owner_account_id IS NULL AND trade_note IS NULL AND exchange_mode = 'none')
        OR (owner_account_id IS NOT NULL
            AND producer_name IS NOT NULL
            AND series_code IS NOT NULL
            AND trade_note IS NOT NULL)
    );

CREATE INDEX IF NOT EXISTS fudaba_cards_visible_idx
    ON public.fudaba_cards(publication_status)
    WHERE visible;
