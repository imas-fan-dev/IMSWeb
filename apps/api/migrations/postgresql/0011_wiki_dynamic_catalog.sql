-- ims:migration-phase: post-data

ALTER TABLE public.agencies
    ADD CONSTRAINT agencies_name_cn_key UNIQUE (name_cn);

ALTER TABLE public.idols
    ADD CONSTRAINT idols_agency_name_cn_key UNIQUE (agency_id, name_cn),
    ADD CONSTRAINT idols_agency_folder_name_key UNIQUE (agency_id, folder_name);

ALTER TABLE public.wiki_groups
    ADD CONSTRAINT wiki_groups_agency_name_key UNIQUE (agency_id, name);

ALTER TABLE public.wiki_group_members
    DROP CONSTRAINT wiki_group_members_idol_id_key;

CREATE INDEX wiki_group_members_idol_idx
    ON public.wiki_group_members(idol_id);

ALTER TABLE public.wiki_idol_categories
    ADD CONSTRAINT wiki_idol_categories_agency_idol_category_key
        UNIQUE (agency_id, idol_id, category_id);

ALTER TABLE public.agencies
    ADD CONSTRAINT agencies_catalog_code_check
        CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$'),
    ADD CONSTRAINT agencies_catalog_name_check
        CHECK (btrim(name_cn) <> ''),
    ADD CONSTRAINT agencies_catalog_color_check
        CHECK (color ~ '^#[0-9A-Fa-f]{6}$');

ALTER TABLE public.idols
    ADD CONSTRAINT idols_catalog_name_check
        CHECK (btrim(name_cn) <> ''),
    ADD CONSTRAINT idols_catalog_folder_check
        CHECK (folder_name ~ '^[a-z0-9][a-z0-9_-]*$');

ALTER TABLE public.wiki_groups
    ADD CONSTRAINT wiki_groups_catalog_code_check
        CHECK (code ~ '^[a-z0-9][a-z0-9_-]*$'),
    ADD CONSTRAINT wiki_groups_catalog_name_check
        CHECK (btrim(name) <> '');
