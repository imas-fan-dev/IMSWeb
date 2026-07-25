-- ims:migration-phase: post-data

ALTER TABLE public.s3_object_versions
    ADD COLUMN storage_scope TEXT NOT NULL DEFAULT 'private'
    CHECK (storage_scope IN ('private', 'public'));

ALTER TABLE public.s3_upload_operations
    ADD COLUMN storage_scope TEXT NOT NULL DEFAULT 'private'
    CHECK (storage_scope IN ('private', 'public'));

DROP INDEX public.s3_object_versions_physical_key_idx;
DROP INDEX public.s3_upload_operations_physical_key_idx;

CREATE UNIQUE INDEX s3_object_versions_physical_scope_idx
    ON public.s3_object_versions(storage_scope, physical_key)
    WHERE physical_key IS NOT NULL;

CREATE UNIQUE INDEX s3_upload_operations_physical_scope_idx
    ON public.s3_upload_operations(storage_scope, physical_key)
    WHERE physical_key IS NOT NULL;
