-- ims:migration-phase: post-data

-- The picker draws from `namecard_characters` from this release on, and the
-- catalog starts empty, so the candidates the Wiki used to supply would simply
-- disappear. Seed the catalog from the Wiki: every wiki-enabled idol entry
-- becomes an `idol` row.
--
-- The Wiki files the 765PRO roster under `entry_kind = 'other'` instead of
-- 'idol', so both kinds are copied. Filtering on 'idol' alone would drop 天海春香,
-- 如月千早, 星井美希 and the rest of the 765 line-up — 18 of the 19 `other` rows.
--
-- Wiki units and stories stay out: `namecard_units` is a different concept (a
-- group of characters, not a Wiki catalog entry), and story rows are content
-- rather than people. The Wiki keeps a Chinese name only, so `name_ja`,
-- `name_en` and `aliases` stay empty for admins to fill in.
--
-- Only INSERT: an entry that already exists — one materialized from a card link
-- by 20261018160000_namecard_favorite_characters, or edited in the admin UI —
-- keeps its row, and the unique index on (agency_id, name_cn) keeps this
-- statement idempotent.

INSERT INTO public.namecard_characters (
    agency_id, category, name_cn, display_order, is_fallback
)
SELECT idol.agency_id, 'idol', idol.name_cn, idol.display_order, false
FROM public.idols idol
WHERE idol.deleted_at IS NULL
    AND idol.wiki_enabled
    AND idol.entry_kind IN ('idol', 'other')
ON CONFLICT DO NOTHING;
