-- ims:migration-phase: pre-data
-- Comparing a wall card's 制作人名称 with a platform display name turns up the
-- same person written both ways: 深蓝白 and 深蓝白P. The trailing P is an
-- honorific, so matching ignores it on either side while leaving the stored
-- names untouched.

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
    FROM (SELECT lower(btrim(value)) AS key) normalised
$$;

COMMENT ON FUNCTION namecard_match_key(text) IS
    'Case- and space-insensitive producer name with the optional trailing P removed.';
