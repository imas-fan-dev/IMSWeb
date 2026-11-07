-- ims:migration-phase: post-data
--
-- Namecard rows are expected to hold object keys, never public URLs: every
-- reader reverses the key back into `/uploads/namecard/original/...` for the
-- browser, so a row that already stores that URL throws on the way out (the
-- owner's list answered 500) and drops off the wall, which only accepts the
-- `community/namecards/assets/...` layout.
--
-- A guest approval used to keep such URLs untouched, so two published rows
-- ended up with a front image nothing could resolve. Rewrite them into the
-- canonical asset key — the object itself already lives there, because the
-- public URL was always an alias for `community/namecards/assets/<stem>/image.<ext>`.

UPDATE public.fudaba_cards
SET front_object_key = regexp_replace(
        front_object_key,
        '^/uploads/namecard/original/(.+)\.([a-z0-9]+)$',
        'community/namecards/assets/\1/image.\2'
    ),
    back_object_key = CASE
        WHEN back_object_key LIKE '/uploads/namecard/original/%'
            THEN regexp_replace(
                back_object_key,
                '^/uploads/namecard/original/(.+)\.([a-z0-9]+)$',
                'community/namecards/assets/\1/image.\2'
            )
        ELSE back_object_key
    END,
    pending_front_object_key = CASE
        WHEN pending_front_object_key LIKE '/uploads/namecard/original/%'
            THEN regexp_replace(
                pending_front_object_key,
                '^/uploads/namecard/original/(.+)\.([a-z0-9]+)$',
                'community/namecards/assets/\1/image.\2'
            )
        ELSE pending_front_object_key
    END,
    pending_back_object_key = CASE
        WHEN pending_back_object_key LIKE '/uploads/namecard/original/%'
            THEN regexp_replace(
                pending_back_object_key,
                '^/uploads/namecard/original/(.+)\.([a-z0-9]+)$',
                'community/namecards/assets/\1/image.\2'
            )
        ELSE pending_back_object_key
    END,
    pending_middle_object_keys = ARRAY(
        SELECT regexp_replace(
                   entry,
                   '^/uploads/namecard/original/(.+)\.([a-z0-9]+)$',
                   'community/namecards/assets/\1/image.\2'
               )
        FROM unnest(pending_middle_object_keys) AS entry
    )
WHERE front_object_key LIKE '/uploads/namecard/original/%'
   OR back_object_key LIKE '/uploads/namecard/original/%'
   OR pending_front_object_key LIKE '/uploads/namecard/original/%'
   OR pending_back_object_key LIKE '/uploads/namecard/original/%'
   OR EXISTS (
        SELECT 1 FROM unnest(pending_middle_object_keys) AS entry
        WHERE entry LIKE '/uploads/namecard/original/%'
   );

UPDATE public.fudaba_card_media
SET object_key = regexp_replace(
        object_key,
        '^/uploads/namecard/original/(.+)\.([a-z0-9]+)$',
        'community/namecards/assets/\1/image.\2'
    )
WHERE object_key LIKE '/uploads/namecard/original/%';

-- Enforce the same shape on every future write: the column holds an object key,
-- and a legacy public path is just an alias for it. A trigger keeps the
-- invariant in one place instead of every insert site remembering it.
CREATE OR REPLACE FUNCTION public.namecard_media_key(value TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN value LIKE '/uploads/namecard/original/%'
            THEN regexp_replace(
                value,
                '^/uploads/namecard/original/(.+)\.([a-z0-9]+)$',
                'community/namecards/assets/\1/image.\2'
            )
        ELSE value
    END
$$;

CREATE OR REPLACE FUNCTION public.namecard_normalize_card_media()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.front_object_key := public.namecard_media_key(NEW.front_object_key);
    NEW.back_object_key := public.namecard_media_key(NEW.back_object_key);
    NEW.pending_front_object_key := public.namecard_media_key(NEW.pending_front_object_key);
    NEW.pending_back_object_key := public.namecard_media_key(NEW.pending_back_object_key);
    NEW.pending_middle_object_keys := COALESCE(
        (
            SELECT ARRAY(
                SELECT public.namecard_media_key(entry)
                FROM unnest(NEW.pending_middle_object_keys) AS entry
            )
        ),
        '{}'::text[]
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fudaba_cards_normalize_media ON public.fudaba_cards;
CREATE TRIGGER fudaba_cards_normalize_media
    BEFORE INSERT OR UPDATE ON public.fudaba_cards
    FOR EACH ROW
    EXECUTE FUNCTION public.namecard_normalize_card_media();

CREATE OR REPLACE FUNCTION public.namecard_normalize_media_object()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.object_key := public.namecard_media_key(NEW.object_key);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS fudaba_card_media_normalize_key ON public.fudaba_card_media;
CREATE TRIGGER fudaba_card_media_normalize_key
    BEFORE INSERT OR UPDATE ON public.fudaba_card_media
    FOR EACH ROW
    EXECUTE FUNCTION public.namecard_normalize_media_object();
