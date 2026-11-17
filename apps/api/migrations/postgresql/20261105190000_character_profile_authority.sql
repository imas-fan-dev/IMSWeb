-- ims:migration-phase: post-data
-- Character identities retain stable references; all selectable/display data is
-- owned by complete project profiles. Explicit profile names win over legacy
-- defaults; differing legacy names remain searchable aliases.
SET CONSTRAINTS ALL IMMEDIATE;
SET CONSTRAINTS ALL DEFERRED;
DROP TRIGGER catalog_character_default_profile ON catalog_characters;
DROP FUNCTION catalog_ensure_default_profile();
DROP TRIGGER wiki_character_name_integrity ON catalog_characters;

ALTER TABLE catalog_character_project_profiles
    ADD COLUMN aliases TEXT CHECK (aliases IS NULL OR length(aliases)<=4000),
    ADD COLUMN category TEXT NOT NULL DEFAULT 'idol'
        CHECK (category IN ('idol','staff','rival','mascot','chara','other')),
    ADD COLUMN is_fallback BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE catalog_character_project_profiles p SET
    aliases=CASE WHEN (p.name_cn IS NOT NULL AND p.name_cn<>c.name_cn)
        OR (p.name_ja IS NOT NULL AND p.name_ja IS DISTINCT FROM c.name_ja)
        OR (p.name_en IS NOT NULL AND p.name_en IS DISTINCT FROM c.name_en)
      THEN NULLIF(concat_ws(E'\n',NULLIF(c.aliases,''),
        CASE WHEN p.name_cn IS NOT NULL AND p.name_cn<>c.name_cn THEN c.name_cn END,
        CASE WHEN p.name_ja IS NOT NULL AND p.name_ja IS DISTINCT FROM c.name_ja THEN c.name_ja END,
        CASE WHEN p.name_en IS NOT NULL AND p.name_en IS DISTINCT FROM c.name_en THEN c.name_en END),'')
      ELSE c.aliases END,
    name_cn=COALESCE(p.name_cn,c.name_cn),name_ja=COALESCE(p.name_ja,c.name_ja),
    name_en=COALESCE(p.name_en,c.name_en),category=c.category,
    is_fallback=c.is_fallback,
    display_order=CASE WHEN p.id=c.default_profile_id THEN c.display_order ELSE p.display_order END
FROM catalog_characters c WHERE c.id=p.character_id;
-- A cached legacy editor must not overwrite an explicit project name after the
-- authority changes. Only changed directory projections advance their version.
UPDATE catalog_characters c SET revision=c.revision+1
FROM catalog_character_project_profiles p WHERE p.id=c.default_profile_id
    AND (c.name_cn,c.name_ja,c.name_en,c.aliases) IS DISTINCT FROM (p.name_cn,p.name_ja,p.name_en,p.aliases);
SET CONSTRAINTS ALL IMMEDIATE;
ALTER TABLE catalog_character_project_profiles ALTER COLUMN name_cn SET NOT NULL;

CREATE OR REPLACE VIEW namecard_characters AS
SELECT c.id,p.project_id AS agency_id,p.category,p.is_fallback,
       p.name_cn,p.name_ja,p.name_en,p.aliases,p.display_order,c.revision,
       c.created_by,c.updated_by,c.created_at,c.updated_at,c.deleted_at
FROM catalog_characters c JOIN catalog_character_project_profiles p ON p.id=c.default_profile_id;

CREATE OR REPLACE VIEW idols AS
SELECT e.id,e.project_id AS agency_id,
    CASE WHEN cp.id IS NOT NULL THEN cp.name_cn
         WHEN gp.id IS NOT NULL THEN COALESCE(gp.name_cn,g.name_cn) ELSE e.local_name_cn END AS name_cn,
    e.storage_slug AS folder_name,
    CASE WHEN cp.id IS NOT NULL THEN cp.representative_color
         WHEN gp.id IS NOT NULL THEN gp.color ELSE e.local_accent_color END AS color,
    e.is_visible AS wiki_enabled,e.display_order,e.text_color,e.wiki_url,
    CASE WHEN cp.id IS NOT NULL THEN cp.avatar_object_key WHEN gp.id IS NOT NULL THEN gp.image_object_key ELSE e.local_image_object_key END AS avatar_object_key,
    CASE WHEN cp.id IS NOT NULL THEN cp.avatar_fit WHEN gp.id IS NOT NULL THEN gp.image_fit ELSE e.local_image_fit END AS avatar_fit,
    CASE WHEN cp.id IS NOT NULL THEN cp.avatar_focal_x WHEN gp.id IS NOT NULL THEN gp.image_focal_x ELSE e.local_image_focal_x END AS avatar_focal_x,
    CASE WHEN cp.id IS NOT NULL THEN cp.avatar_focal_y WHEN gp.id IS NOT NULL THEN gp.image_focal_y ELSE e.local_image_focal_y END AS avatar_focal_y,
    CASE WHEN cp.id IS NOT NULL THEN cp.avatar_zoom WHEN gp.id IS NOT NULL THEN gp.image_zoom ELSE e.local_image_zoom END AS avatar_zoom,
    CASE WHEN cp.id IS NOT NULL THEN cp.avatar_rotation WHEN gp.id IS NOT NULL THEN gp.image_rotation ELSE e.local_image_rotation END AS avatar_rotation,
    CASE WHEN cp.id IS NOT NULL THEN cp.avatar_media_revision WHEN gp.id IS NOT NULL THEN gp.image_media_revision ELSE e.local_image_media_revision END AS avatar_media_revision,
    e.entry_kind,e.entry_subtype,e.deleted_at
FROM wiki_entries e
LEFT JOIN catalog_character_project_profiles cp ON cp.id=e.character_profile_id
LEFT JOIN catalog_group_project_profiles gp ON gp.id=e.group_profile_id
LEFT JOIN catalog_groups g ON g.id=gp.group_id;

ALTER TABLE catalog_characters DROP CONSTRAINT catalog_characters_default_profile_fk;
ALTER TABLE catalog_character_project_profiles ADD CONSTRAINT catalog_character_profiles_owner_id_key UNIQUE(id,character_id);
ALTER TABLE catalog_characters ADD CONSTRAINT catalog_characters_default_profile_fk
    FOREIGN KEY(default_profile_id,id) REFERENCES catalog_character_project_profiles(id,character_id)
    DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE catalog_characters
    DROP COLUMN default_project_id,DROP COLUMN name_cn,DROP COLUMN name_ja,DROP COLUMN name_en,
    DROP COLUMN aliases,DROP COLUMN category,DROP COLUMN display_order,DROP COLUMN is_fallback;

CREATE FUNCTION catalog_check_default_selection(owner_id BIGINT) RETURNS VOID LANGUAGE plpgsql AS $$
DECLARE selected catalog_character_project_profiles;
BEGIN
    SELECT p.* INTO selected
      FROM catalog_characters c JOIN catalog_character_project_profiles p ON p.id=c.default_profile_id
      WHERE c.id=owner_id AND c.deleted_at IS NULL;
    IF NOT FOUND THEN RETURN; END IF;
    -- These are the original directory uniqueness scopes, now evaluated from
    -- default profiles rather than a second set of identity business columns.
    PERFORM id FROM projects WHERE id=selected.project_id FOR NO KEY UPDATE;
    IF EXISTS (SELECT 1 FROM catalog_characters c JOIN catalog_character_project_profiles p ON p.id=c.default_profile_id
        WHERE c.deleted_at IS NULL AND c.id<>owner_id AND p.project_id=selected.project_id AND p.name_cn=selected.name_cn) THEN
        RAISE EXCEPTION 'duplicate default character profile name'
            USING ERRCODE='23505',CONSTRAINT='catalog_characters_project_name_key';
    END IF;
    IF selected.is_fallback THEN
        PERFORM pg_advisory_xact_lock(hashtext('catalog-character-fallback-category'));
        IF EXISTS (SELECT 1 FROM catalog_characters c JOIN catalog_character_project_profiles p ON p.id=c.default_profile_id
            WHERE c.deleted_at IS NULL AND c.id<>owner_id AND p.is_fallback AND p.category=selected.category) THEN
            RAISE EXCEPTION 'duplicate fallback character category'
                USING ERRCODE='23505',CONSTRAINT='catalog_characters_fallback_category_key';
        END IF;
    END IF;
END $$;

CREATE FUNCTION catalog_profile_selection_integrity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM catalog_characters WHERE id=NEW.character_id AND default_profile_id=NEW.id) THEN
        PERFORM catalog_check_default_selection(NEW.character_id);
    END IF;
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER catalog_profile_selection_integrity
AFTER INSERT OR UPDATE OF project_id,name_cn,category,is_fallback ON catalog_character_project_profiles
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_profile_selection_integrity();

CREATE FUNCTION catalog_identity_selection_integrity() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM catalog_check_default_selection(NEW.id);
    RETURN NULL;
END $$;
CREATE CONSTRAINT TRIGGER catalog_identity_selection_integrity
AFTER INSERT OR UPDATE OF default_profile_id,deleted_at ON catalog_characters
DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION catalog_identity_selection_integrity();

CREATE FUNCTION catalog_profile_directory_revision() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF (NEW.name_cn,NEW.name_ja,NEW.name_en,NEW.aliases,NEW.category,NEW.display_order,NEW.is_fallback)
        IS DISTINCT FROM (OLD.name_cn,OLD.name_ja,OLD.name_en,OLD.aliases,OLD.category,OLD.display_order,OLD.is_fallback) THEN
        UPDATE catalog_characters SET revision=revision+1,updated_at=CURRENT_TIMESTAMP
        WHERE id=NEW.character_id AND default_profile_id=NEW.id;
    END IF;
    RETURN NULL;
END $$;
CREATE TRIGGER catalog_profile_directory_revision AFTER UPDATE ON catalog_character_project_profiles
FOR EACH ROW EXECUTE FUNCTION catalog_profile_directory_revision();

CREATE FUNCTION catalog_legacy_character_write() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE identity_id BIGINT; profile_id BIGINT; current_revision INTEGER;
BEGIN
    IF TG_OP='INSERT' THEN
        INSERT INTO catalog_characters(id,revision,created_by,updated_by,created_at,updated_at,deleted_at)
        VALUES(COALESCE(NEW.id,nextval('catalog_characters_id_seq')),COALESCE(NEW.revision,0),NEW.created_by,NEW.updated_by,
            COALESCE(NEW.created_at,CURRENT_TIMESTAMP),COALESCE(NEW.updated_at,CURRENT_TIMESTAMP),NEW.deleted_at)
        RETURNING id INTO identity_id;
        INSERT INTO catalog_character_project_profiles(character_id,project_id,name_cn,name_ja,name_en,aliases,category,is_fallback,display_order)
        VALUES(identity_id,NEW.agency_id,NEW.name_cn,NEW.name_ja,NEW.name_en,NEW.aliases,
            COALESCE(NEW.category,'idol'),COALESCE(NEW.is_fallback,FALSE),COALESCE(NEW.display_order,0)) RETURNING id INTO profile_id;
        UPDATE catalog_characters SET default_profile_id=profile_id WHERE id=identity_id;
        NEW.id=identity_id;
        RETURN NEW;
    END IF;
    SELECT revision,default_profile_id INTO current_revision,profile_id
        FROM catalog_characters WHERE id=OLD.id FOR UPDATE;
    IF NOT FOUND OR current_revision<>OLD.revision THEN RETURN NULL; END IF;
    IF TG_OP='DELETE' THEN
        DELETE FROM catalog_characters WHERE id=OLD.id;
        RETURN OLD;
    END IF;
    IF NEW.agency_id IS DISTINCT FROM OLD.agency_id THEN
        INSERT INTO catalog_character_project_profiles(character_id,project_id,name_cn,name_ja,name_en,aliases,category,is_fallback,display_order)
        VALUES(OLD.id,NEW.agency_id,NEW.name_cn,NEW.name_ja,NEW.name_en,NEW.aliases,NEW.category,NEW.is_fallback,NEW.display_order)
        ON CONFLICT(character_id,project_id) DO UPDATE SET name_cn=EXCLUDED.name_cn,name_ja=EXCLUDED.name_ja,
            name_en=EXCLUDED.name_en,aliases=EXCLUDED.aliases,category=EXCLUDED.category,is_fallback=EXCLUDED.is_fallback,
            display_order=EXCLUDED.display_order,revision=catalog_character_project_profiles.revision+1,updated_at=CURRENT_TIMESTAMP
        RETURNING id INTO profile_id;
    ELSE
        UPDATE catalog_character_project_profiles SET name_cn=NEW.name_cn,name_ja=NEW.name_ja,name_en=NEW.name_en,
            aliases=NEW.aliases,category=NEW.category,is_fallback=NEW.is_fallback,display_order=NEW.display_order,
            revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=profile_id;
    END IF;
    UPDATE catalog_characters SET default_profile_id=profile_id,deleted_at=NEW.deleted_at,
        revision=current_revision+1,updated_by=NEW.updated_by,updated_at=COALESCE(NEW.updated_at,CURRENT_TIMESTAMP)
        WHERE id=OLD.id;
    NEW.revision=current_revision+1;
    RETURN NEW;
END $$;
CREATE TRIGGER catalog_legacy_character_write INSTEAD OF INSERT OR UPDATE OR DELETE ON namecard_characters
FOR EACH ROW EXECUTE FUNCTION catalog_legacy_character_write();

DO $$
DECLARE owner_id BIGINT;
BEGIN
    FOR owner_id IN SELECT id FROM catalog_characters ORDER BY id LOOP
        PERFORM catalog_check_default_selection(owner_id);
    END LOOP;
END $$;
SET CONSTRAINTS ALL DEFERRED;
