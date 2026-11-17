-- ims:migration-phase: post-data

CREATE TABLE wiki_project_settings (
    project_id BIGINT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    banner_title TEXT NOT NULL DEFAULT '',
    fallback_artwork_object_key TEXT,
    layout_revision BIGINT NOT NULL DEFAULT 0 CHECK (layout_revision >= 0)
);
INSERT INTO wiki_project_settings
SELECT id,wiki_enabled,banner_title,fallback_artwork_object_key,layout_revision FROM projects;
DROP VIEW agencies;
ALTER TABLE projects DROP COLUMN wiki_enabled, DROP COLUMN banner_title,
    DROP COLUMN fallback_artwork_object_key, DROP COLUMN layout_revision;

CREATE FUNCTION wiki_ensure_project_settings() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO wiki_project_settings(project_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
    RETURN NEW;
END $$;
CREATE TRIGGER wiki_project_settings_default AFTER INSERT ON projects
FOR EACH ROW EXECUTE FUNCTION wiki_ensure_project_settings();

CREATE VIEW agencies AS
SELECT p.id,p.code,p.name_cn,p.color,s.is_enabled AS wiki_enabled,p.display_order,s.banner_title,
    p.icon_object_key,p.icon_fit,p.icon_focal_x,p.icon_focal_y,p.icon_zoom,p.icon_rotation,
    p.icon_media_revision,s.fallback_artwork_object_key,s.layout_revision
FROM projects p JOIN wiki_project_settings s ON s.project_id=p.id;

CREATE FUNCTION wiki_legacy_project_write() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE current_layout BIGINT; current_media INTEGER;
BEGIN
    IF TG_OP='INSERT' THEN
        INSERT INTO projects(id,code,name_cn,color,display_order,icon_object_key,
            icon_fit,icon_focal_x,icon_focal_y,icon_zoom,icon_rotation,icon_media_revision)
        VALUES (COALESCE(NEW.id,nextval('projects_id_seq')),NEW.code,NEW.name_cn,NEW.color,
            COALESCE(NEW.display_order,0),NEW.icon_object_key,COALESCE(NEW.icon_fit,'cover'),
            COALESCE(NEW.icon_focal_x,0.5),COALESCE(NEW.icon_focal_y,0.5),COALESCE(NEW.icon_zoom,1),
            COALESCE(NEW.icon_rotation,0),COALESCE(NEW.icon_media_revision,0)) RETURNING id INTO NEW.id;
        UPDATE wiki_project_settings SET is_enabled=COALESCE(NEW.wiki_enabled,TRUE),
            banner_title=COALESCE(NEW.banner_title,''),fallback_artwork_object_key=NEW.fallback_artwork_object_key,
            layout_revision=COALESCE(NEW.layout_revision,0) WHERE project_id=NEW.id;
        RETURN NEW;
    END IF;
    IF TG_OP='DELETE' THEN DELETE FROM projects WHERE id=OLD.id; RETURN OLD; END IF;
    SELECT layout_revision INTO current_layout FROM wiki_project_settings WHERE project_id=OLD.id FOR UPDATE;
    SELECT icon_media_revision INTO current_media FROM projects WHERE id=OLD.id FOR UPDATE;
    IF NEW.layout_revision IS DISTINCT FROM OLD.layout_revision AND current_layout<>OLD.layout_revision THEN RETURN NULL; END IF;
    IF NEW.icon_media_revision IS DISTINCT FROM OLD.icon_media_revision AND current_media<>OLD.icon_media_revision THEN RETURN NULL; END IF;
    UPDATE projects SET code=NEW.code,name_cn=NEW.name_cn,color=NEW.color,display_order=NEW.display_order,
        icon_object_key=CASE WHEN NEW.icon_object_key IS NOT DISTINCT FROM OLD.icon_object_key THEN icon_object_key ELSE NEW.icon_object_key END,
        icon_fit=CASE WHEN NEW.icon_fit IS NOT DISTINCT FROM OLD.icon_fit THEN icon_fit ELSE NEW.icon_fit END,
        icon_focal_x=CASE WHEN NEW.icon_focal_x IS NOT DISTINCT FROM OLD.icon_focal_x THEN icon_focal_x ELSE NEW.icon_focal_x END,
        icon_focal_y=CASE WHEN NEW.icon_focal_y IS NOT DISTINCT FROM OLD.icon_focal_y THEN icon_focal_y ELSE NEW.icon_focal_y END,
        icon_zoom=CASE WHEN NEW.icon_zoom IS NOT DISTINCT FROM OLD.icon_zoom THEN icon_zoom ELSE NEW.icon_zoom END,
        icon_rotation=CASE WHEN NEW.icon_rotation IS NOT DISTINCT FROM OLD.icon_rotation THEN icon_rotation ELSE NEW.icon_rotation END,
        icon_media_revision=CASE WHEN NEW.icon_media_revision IS NOT DISTINCT FROM OLD.icon_media_revision THEN icon_media_revision ELSE NEW.icon_media_revision END
    WHERE id=OLD.id;
    UPDATE wiki_project_settings SET
        is_enabled=CASE WHEN NEW.wiki_enabled IS NOT DISTINCT FROM OLD.wiki_enabled THEN is_enabled ELSE NEW.wiki_enabled END,
        banner_title=CASE WHEN NEW.banner_title IS NOT DISTINCT FROM OLD.banner_title THEN banner_title ELSE NEW.banner_title END,
        fallback_artwork_object_key=CASE WHEN NEW.fallback_artwork_object_key IS NOT DISTINCT FROM OLD.fallback_artwork_object_key THEN fallback_artwork_object_key ELSE NEW.fallback_artwork_object_key END,
        layout_revision=CASE WHEN NEW.layout_revision IS NOT DISTINCT FROM OLD.layout_revision THEN layout_revision ELSE NEW.layout_revision END
    WHERE project_id=OLD.id;
    RETURN NEW;
END $$;
CREATE TRIGGER wiki_legacy_project_write INSTEAD OF INSERT OR UPDATE OR DELETE ON agencies
FOR EACH ROW EXECUTE FUNCTION wiki_legacy_project_write();

-- Rename owned constraints/indexes explicitly. The compatibility DTOs keep the
-- old HTTP vocabulary; database diagnostics use the canonical object names.
DO $$
DECLARE item RECORD; object RECORD; new_name TEXT;
BEGIN
    FOR item IN SELECT * FROM (VALUES
        ('projects','agencies','projects'),
        ('catalog_characters','namecard_characters','catalog_characters'),
        ('catalog_groups','namecard_units','catalog_groups'),
        ('catalog_group_project_profiles','namecard_unit_agencies','catalog_group_project_profiles'),
        ('catalog_group_members','namecard_unit_members','catalog_group_members'),
        ('wiki_entries','idols','wiki_entries'),
        ('wiki_navigation_groups','wiki_groups','wiki_navigation_groups'),
        ('wiki_navigation_group_entries','wiki_group_members','wiki_navigation_group_entries'),
        ('wiki_entry_categories','wiki_idol_categories','wiki_entry_categories')
    ) AS names(table_name,old_prefix,new_prefix) LOOP
        FOR object IN SELECT conname FROM pg_constraint WHERE conrelid=to_regclass('public.'||item.table_name)
            AND starts_with(conname,item.old_prefix) LOOP
            new_name=replace(replace(replace(replace(object.conname,item.old_prefix,item.new_prefix),
                'agency','project'),'unit_id','group_id'),'idol_id','entry_id');
            EXECUTE format('ALTER TABLE public.%I RENAME CONSTRAINT %I TO %I',item.table_name,object.conname,new_name);
        END LOOP;
        FOR object IN SELECT indexname FROM pg_indexes WHERE schemaname='public' AND tablename=item.table_name
            AND starts_with(indexname,item.old_prefix) LOOP
            new_name=replace(replace(replace(replace(object.indexname,item.old_prefix,item.new_prefix),
                'agency','project'),'unit_id','group_id'),'idol_id','entry_id');
            EXECUTE format('ALTER INDEX public.%I RENAME TO %I',object.indexname,new_name);
        END LOOP;
    END LOOP;
END $$;
