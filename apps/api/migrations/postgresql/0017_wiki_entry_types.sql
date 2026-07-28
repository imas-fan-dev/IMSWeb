-- ims:migration-phase: post-data

ALTER TABLE public.idols
    ADD COLUMN entry_kind TEXT NOT NULL DEFAULT 'idol'
        CHECK (entry_kind IN ('idol', 'unit', 'story', 'other')),
    ADD COLUMN entry_subtype TEXT
        CHECK (entry_subtype IS NULL OR entry_subtype IN ('main', 'event', 'special', 'other')),
    ADD CONSTRAINT idols_entry_subtype_kind_check CHECK (
        (entry_kind = 'story' AND entry_subtype IS NOT NULL)
        OR (entry_kind <> 'story' AND entry_subtype IS NULL)
    );

UPDATE public.idols idols
SET entry_kind = 'unit'
FROM public.wiki_group_members members
JOIN public.wiki_groups groups
  ON groups.id = members.group_id AND groups.agency_id = members.agency_id
JOIN public.agencies agencies
  ON agencies.id = groups.agency_id
WHERE idols.id = members.idol_id
  AND idols.agency_id = members.agency_id
  AND agencies.code = 'sidem'
  AND groups.code = 'sidem-units';

UPDATE public.idols idols
SET entry_kind = 'story', entry_subtype = 'special'
FROM public.wiki_group_members members
JOIN public.wiki_groups groups
  ON groups.id = members.group_id AND groups.agency_id = members.agency_id
JOIN public.agencies agencies
  ON agencies.id = groups.agency_id
WHERE idols.id = members.idol_id
  AND idols.agency_id = members.agency_id
  AND agencies.code = 'sidem'
  AND groups.code = 'sidem-special';

COMMENT ON COLUMN public.idols.entry_kind IS
    'Wiki content-page kind; the idols table name is retained for route and storage compatibility.';
COMMENT ON COLUMN public.idols.entry_subtype IS
    'Story-page subtype. Required only when entry_kind is story.';
