-- ims:migration-phase: pre-data

ALTER TABLE public.site_package_revisions
    ADD CONSTRAINT site_package_revisions_package_id_id_key
    UNIQUE (package_id, id);

ALTER TABLE public.site_packages
    ADD CONSTRAINT site_packages_published_revision_owner_fkey
    FOREIGN KEY (id, published_revision_id)
    REFERENCES public.site_package_revisions(package_id, id)
    DEFERRABLE INITIALLY DEFERRED;
