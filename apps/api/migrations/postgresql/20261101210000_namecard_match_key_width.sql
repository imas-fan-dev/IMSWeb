-- ims:migration-phase: pre-data
-- A Japanese or Chinese IME types Ｐ as often as P, so the match key folds the
-- full-width form before dropping the trailing honorific. Without this the two
-- spellings end up in different keys and the same person never matches.

CREATE OR REPLACE FUNCTION namecard_match_key(value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
        WHEN key = '' THEN ''
        WHEN regexp_replace(key, 'p$', '') = '' THEN key
        ELSE regexp_replace(key, 'p$', '')
    END
    FROM (SELECT lower(translate(btrim(value), 'Ｐｐ', 'pp')) AS key) normalised
$$;

COMMENT ON FUNCTION namecard_match_key(text) IS
    'Case-, width- and space-insensitive producer name with the optional trailing P removed.';
