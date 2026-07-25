-- ims:migration-phase: post-data

ALTER TABLE public.s3_object_versions
    ADD COLUMN physical_key TEXT;

ALTER TABLE public.s3_upload_operations
    ADD COLUMN physical_key TEXT;

CREATE UNIQUE INDEX s3_object_versions_physical_key_idx
    ON public.s3_object_versions(physical_key)
    WHERE physical_key IS NOT NULL;

CREATE UNIQUE INDEX s3_upload_operations_physical_key_idx
    ON public.s3_upload_operations(physical_key)
    WHERE physical_key IS NOT NULL;
