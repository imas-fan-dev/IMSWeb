PRAGMA foreign_keys = ON;

DROP TABLE IF EXISTS temp.__ims_site_package_integrity_preflight;
CREATE TEMP TABLE __ims_site_package_integrity_preflight (
    violation_count INTEGER NOT NULL,
    CONSTRAINT site_package_integrity_preflight CHECK (violation_count = 0)
);
INSERT INTO __ims_site_package_integrity_preflight (violation_count)
SELECT
    (SELECT COUNT(*) FROM site_packages
     WHERE slug IS NULL OR slug = '' OR slug <> lower(slug)
        OR slug GLOB '*[^a-z0-9-]*'
        OR slug GLOB '-*' OR slug GLOB '*-'
        OR slug GLOB '*--*')
    +
    (SELECT COUNT(*) FROM site_package_revisions
     WHERE source_sha256 IS NULL OR length(source_sha256) <> 64
        OR source_sha256 <> lower(source_sha256)
        OR source_sha256 GLOB '*[^a-f0-9]*'
        OR preview_token_hash IS NULL OR length(preview_token_hash) <> 64
        OR preview_token_hash <> lower(preview_token_hash)
        OR preview_token_hash GLOB '*[^a-f0-9]*')
    +
    (SELECT COUNT(*) FROM site_packages AS package
     WHERE package.published_revision_id IS NOT NULL AND NOT EXISTS (
         SELECT 1 FROM site_package_revisions AS revision
         WHERE revision.package_id = package.id
           AND revision.id = package.published_revision_id
     ));
DROP TABLE temp.__ims_site_package_integrity_preflight;

CREATE TRIGGER IF NOT EXISTS site_packages_slug_insert_check
BEFORE INSERT ON site_packages
WHEN NEW.slug = '' OR NEW.slug <> lower(NEW.slug)
    OR NEW.slug GLOB '*[^a-z0-9-]*'
    OR NEW.slug GLOB '-*' OR NEW.slug GLOB '*-'
    OR NEW.slug GLOB '*--*'
BEGIN
    SELECT RAISE(ABORT, 'site_packages.slug must be lowercase kebab-case');
END;

CREATE TRIGGER IF NOT EXISTS site_packages_slug_update_check
BEFORE UPDATE OF slug ON site_packages
WHEN NEW.slug = '' OR NEW.slug <> lower(NEW.slug)
    OR NEW.slug GLOB '*[^a-z0-9-]*'
    OR NEW.slug GLOB '-*' OR NEW.slug GLOB '*-'
    OR NEW.slug GLOB '*--*'
BEGIN
    SELECT RAISE(ABORT, 'site_packages.slug must be lowercase kebab-case');
END;

CREATE TRIGGER IF NOT EXISTS site_package_revisions_hash_insert_check
BEFORE INSERT ON site_package_revisions
WHEN length(NEW.source_sha256) <> 64
    OR NEW.source_sha256 <> lower(NEW.source_sha256)
    OR NEW.source_sha256 GLOB '*[^a-f0-9]*'
    OR length(NEW.preview_token_hash) <> 64
    OR NEW.preview_token_hash <> lower(NEW.preview_token_hash)
    OR NEW.preview_token_hash GLOB '*[^a-f0-9]*'
BEGIN
    SELECT RAISE(ABORT, 'site-package hashes must be lowercase hexadecimal SHA-256 values');
END;

CREATE TRIGGER IF NOT EXISTS site_package_revisions_hash_update_check
BEFORE UPDATE OF source_sha256, preview_token_hash ON site_package_revisions
WHEN length(NEW.source_sha256) <> 64
    OR NEW.source_sha256 <> lower(NEW.source_sha256)
    OR NEW.source_sha256 GLOB '*[^a-f0-9]*'
    OR length(NEW.preview_token_hash) <> 64
    OR NEW.preview_token_hash <> lower(NEW.preview_token_hash)
    OR NEW.preview_token_hash GLOB '*[^a-f0-9]*'
BEGIN
    SELECT RAISE(ABORT, 'site-package hashes must be lowercase hexadecimal SHA-256 values');
END;

CREATE TRIGGER IF NOT EXISTS site_packages_publication_owner_insert_check
BEFORE INSERT ON site_packages
WHEN NEW.published_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM site_package_revisions
    WHERE package_id = NEW.id AND id = NEW.published_revision_id
)
BEGIN
    SELECT RAISE(ABORT, 'published revision belongs to another site package');
END;

CREATE TRIGGER IF NOT EXISTS site_packages_publication_owner_update_check
BEFORE UPDATE OF published_revision_id, id ON site_packages
WHEN NEW.published_revision_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM site_package_revisions
    WHERE package_id = NEW.id AND id = NEW.published_revision_id
)
BEGIN
    SELECT RAISE(ABORT, 'published revision belongs to another site package');
END;

CREATE TRIGGER IF NOT EXISTS site_package_revisions_publication_owner_update_check
BEFORE UPDATE OF id, package_id ON site_package_revisions
WHEN EXISTS (
    SELECT 1 FROM site_packages
    WHERE published_revision_id = OLD.id
      AND (id <> NEW.package_id OR OLD.id <> NEW.id)
)
BEGIN
    SELECT RAISE(ABORT, 'published revision must remain with its site package');
END;
