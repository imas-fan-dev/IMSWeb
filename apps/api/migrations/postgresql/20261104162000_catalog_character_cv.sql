-- ims:migration-phase: post-data

ALTER TABLE catalog_character_project_profiles ADD COLUMN cv_name TEXT
    CHECK (cv_name IS NULL OR (btrim(cv_name)<>'' AND length(cv_name)<=500));
COMMENT ON COLUMN catalog_character_project_profiles.cv_name IS
    'Project-specific voice actor credit. NULL is unknown; independent of voice_status.';
