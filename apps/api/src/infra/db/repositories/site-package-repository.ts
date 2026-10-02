import type {
    DeleteSitePackageRevisionInput,
    NewSitePackageInput,
    NewSitePackageRevisionInput,
    SitePackageRecord,
    SitePackagePublicationResult,
    SitePackageRepository,
    SitePackageRevisionDeletionResult,
    SitePackageRevisionRecord,
    SitePackageWithRevisions,
} from '@/ports/repositories/site-packages';
import type { ManagedSqlDatabase } from '@/infra/db/sql/database';
import {
    executeSql,
    queryAll,
    queryOne,
    sqlStatement,
} from '@/infra/db/sql/query';

export class SqlSitePackageRepository implements SitePackageRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    async listSitePackages(): Promise<SitePackageWithRevisions[]> {
        const packages = await queryAll<SitePackageRecord>(
            this.database,
            'SELECT * FROM site_packages ORDER BY updated_at DESC, slug ASC',
        );
        if (!packages.length) return [];
        const revisions = await queryAll<SitePackageRevisionRecord>(
            this.database,
            `SELECT * FROM site_package_revisions
             ORDER BY package_id ASC, revision_number DESC`,
        );
        const byPackage = new Map<string, SitePackageRevisionRecord[]>();
        for (const revision of revisions) {
            const current = byPackage.get(revision.package_id) || [];
            current.push(revision);
            byPackage.set(revision.package_id, current);
        }
        return packages.map((sitePackage) => ({
            ...sitePackage,
            revisions: byPackage.get(sitePackage.id) || [],
        }));
    }

    findSitePackageById(id: string): Promise<SitePackageRecord | null> {
        return queryOne(
            this.database,
            'SELECT * FROM site_packages WHERE id=?',
            [id],
        );
    }

    findSitePackageBySlug(slug: string): Promise<SitePackageRecord | null> {
        return queryOne(
            this.database,
            'SELECT * FROM site_packages WHERE slug=?',
            [slug],
        );
    }

    findSitePackageRevisionById(
        packageId: string,
        revisionId: string,
    ): Promise<SitePackageRevisionRecord | null> {
        return queryOne(
            this.database,
            'SELECT * FROM site_package_revisions WHERE package_id=? AND id=?',
            [packageId, revisionId],
        );
    }

    findSitePackageRevisionByPreviewTokenHash(
        previewTokenHash: string,
    ): Promise<(SitePackageRevisionRecord & { slug: string }) | null> {
        return queryOne(
            this.database,
            `SELECT r.*, p.slug
             FROM site_package_revisions r
             INNER JOIN site_packages p ON p.id=r.package_id
             WHERE r.preview_token_hash=?`,
            [previewTokenHash],
        );
    }

    async createSitePackageWithRevision(
        sitePackage: NewSitePackageInput,
        revision: NewSitePackageRevisionInput,
    ): Promise<void> {
        if (sitePackage.id !== revision.packageId) {
            throw new Error('Site package revision belongs to another package');
        }
        await this.database.batch([
            sqlStatement(
                this.database,
                `INSERT INTO site_packages
                 (id, slug, title, description, published_revision_id,
                  created_by, updated_by, created_at, updated_at)
                 VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
                [
                    sitePackage.id,
                    sitePackage.slug,
                    sitePackage.title,
                    sitePackage.description,
                    sitePackage.createdBy,
                    sitePackage.createdBy,
                    sitePackage.createdAt,
                    sitePackage.createdAt,
                ],
            ),
            this.sitePackageRevisionStatement(revision, 1),
        ]);
    }

    async createSitePackageRevision(
        revision: NewSitePackageRevisionInput,
    ): Promise<SitePackageRevisionRecord> {
        await this.database.batch([
            sqlStatement(
                this.database,
                'UPDATE site_packages SET updated_by=?, updated_at=? WHERE id=?',
                [revision.createdBy, revision.createdAt, revision.packageId],
            ),
            this.nextSitePackageRevisionStatement(revision),
        ]);
        const created = await this.findSitePackageRevisionById(
            revision.packageId,
            revision.id,
        );
        if (!created) throw new Error('Site package revision insert failed');
        return created;
    }

    async publishSitePackageRevision(
        packageId: string,
        revisionId: string,
        updatedBy: number,
        publishedAt: number,
    ): Promise<SitePackagePublicationResult | null> {
        const results = await this.database.batch([
            sqlStatement(
                this.database,
                `UPDATE site_packages
                 SET published_revision_id=?, updated_by=?, updated_at=?
                 WHERE id=? AND EXISTS (
                     SELECT 1 FROM site_package_revisions AS revision
                     WHERE revision.package_id=? AND revision.id=? AND revision.state='ready'
                       AND (
                           revision.published_at IS NULL
                           OR site_packages.published_revision_id=?
                       )
                 )`,
                [
                    revisionId,
                    updatedBy,
                    publishedAt,
                    packageId,
                    packageId,
                    revisionId,
                    revisionId,
                ],
            ),
            sqlStatement(
                this.database,
                `UPDATE site_packages
                 SET published_revision_id=?, updated_by=?, updated_at=?
                 WHERE id=?
                   AND (published_revision_id IS NULL OR published_revision_id<>?)
                   AND EXISTS (
                     SELECT 1 FROM site_package_revisions AS revision
                     WHERE revision.package_id=? AND revision.id=? AND revision.state='ready'
                       AND revision.published_at IS NOT NULL
                 )`,
                [
                    revisionId,
                    updatedBy,
                    publishedAt,
                    packageId,
                    revisionId,
                    packageId,
                    revisionId,
                ],
            ),
            sqlStatement(
                this.database,
                `UPDATE site_package_revisions SET published_at=COALESCE(published_at, ?)
                 WHERE package_id=? AND id=? AND state='ready'`,
                [publishedAt, packageId, revisionId],
            ),
        ]);
        const operation =
            (results[0]?.meta.changes ?? 0) > 0
                ? 'publish'
                : (results[1]?.meta.changes ?? 0) > 0
                  ? 'rollback'
                  : null;
        const [revision, currentPackage] = await Promise.all([
            this.findSitePackageRevisionById(packageId, revisionId),
            operation
                ? Promise.resolve(null)
                : this.findSitePackageById(packageId),
        ]);
        if (
            !operation &&
            revision?.state === 'ready' &&
            currentPackage?.published_revision_id === revisionId
        ) {
            return { revision, operation: 'noop' };
        }
        if (!operation) return null;
        if (!revision) {
            throw new Error(
                'Published site package revision could not be read',
            );
        }
        return { revision, operation };
    }

    deleteSitePackageRevision(
        input: DeleteSitePackageRevisionInput,
    ): Promise<SitePackageRevisionDeletionResult | null> {
        return this.database.transaction(async (database) => {
            const sitePackage = await queryOne<SitePackageRecord>(
                database,
                'SELECT * FROM site_packages WHERE id=? FOR UPDATE',
                [input.packageId],
            );
            if (!sitePackage) return null;
            const revision = await queryOne<SitePackageRevisionRecord>(
                database,
                'SELECT * FROM site_package_revisions WHERE package_id=? AND id=?',
                [input.packageId, input.revisionId],
            );
            if (!revision) return null;
            if (sitePackage.published_revision_id === revision.id) {
                return {
                    kind: 'published',
                    revision,
                    sitePackage,
                    packageDeleted: false,
                };
            }
            const prefix =
                `site-packages/${input.packageId}/revisions/` +
                `${input.revisionId}/`;
            await database
                .prepare(
                    `INSERT INTO object_deletion_jobs
                        (id, resource_type, resource_id, target_kind, target, state,
                         attempts, next_attempt_at, created_at, updated_at)
                     VALUES (?, 'site-package-revision', ?, 'prefix', ?, 'pending', 0, ?, ?, ?)`,
                )
                .bind(
                    input.deletionJobId,
                    input.revisionId,
                    prefix,
                    input.deletedAt,
                    input.deletedAt,
                    input.deletedAt,
                )
                .run();
            const deleted = await database
                .prepare(
                    `DELETE FROM site_package_revisions
                     WHERE package_id=? AND id=?`,
                )
                .bind(input.packageId, input.revisionId)
                .run();
            if (deleted.meta.changes !== 1) {
                throw new Error('Site package revision delete lost its lock');
            }
            const removedPackage = await database
                .prepare(
                    `DELETE FROM site_packages
                     WHERE id=? AND published_revision_id IS NULL
                       AND NOT EXISTS (
                           SELECT 1 FROM site_package_revisions WHERE package_id=?
                       )`,
                )
                .bind(input.packageId, input.packageId)
                .run();
            const packageDeleted = removedPackage.meta.changes === 1;
            if (!packageDeleted) {
                await database
                    .prepare(
                        `UPDATE site_packages SET updated_by=?, updated_at=? WHERE id=?`,
                    )
                    .bind(input.deletedBy, input.deletedAt, input.packageId)
                    .run();
            }
            return {
                kind: 'deleted',
                revision,
                sitePackage,
                packageDeleted,
            };
        });
    }

    async rotateSitePackagePreviewToken(
        packageId: string,
        revisionId: string,
        previewTokenHash: string,
    ): Promise<boolean> {
        const result = await executeSql(
            this.database,
            `UPDATE site_package_revisions SET preview_token_hash=?
             WHERE package_id=? AND id=?`,
            [previewTokenHash, packageId, revisionId],
        );
        return result.meta.changes > 0;
    }

    private sitePackageRevisionStatement(
        revision: NewSitePackageRevisionInput,
        revisionNumber: number,
    ) {
        return sqlStatement(
            this.database,
            `INSERT INTO site_package_revisions
             (id, package_id, revision_number, entry_path, runtime_mode, state,
              file_count, total_bytes, source_key, source_sha256, manifest_key,
              manifest_json, preview_token_hash, created_by, created_at, published_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
            [
                revision.id,
                revision.packageId,
                revisionNumber,
                revision.entryPath,
                revision.runtimeMode,
                revision.state,
                revision.fileCount,
                revision.totalBytes,
                revision.sourceKey,
                revision.sourceSha256,
                revision.manifestKey,
                revision.manifestJson,
                revision.previewTokenHash,
                revision.createdBy,
                revision.createdAt,
            ],
        );
    }

    private nextSitePackageRevisionStatement(
        revision: NewSitePackageRevisionInput,
    ) {
        return sqlStatement(
            this.database,
            `INSERT INTO site_package_revisions
             (id, package_id, revision_number, entry_path, runtime_mode, state,
              file_count, total_bytes, source_key, source_sha256, manifest_key,
              manifest_json, preview_token_hash, created_by, created_at, published_at)
             SELECT ?, ?, CAST(COALESCE(MAX(revision_number), 0) + 1 AS INTEGER),
                    ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL
             FROM site_package_revisions WHERE package_id=?`,
            [
                revision.id,
                revision.packageId,
                revision.entryPath,
                revision.runtimeMode,
                revision.state,
                revision.fileCount,
                revision.totalBytes,
                revision.sourceKey,
                revision.sourceSha256,
                revision.manifestKey,
                revision.manifestJson,
                revision.previewTokenHash,
                revision.createdBy,
                revision.createdAt,
                revision.packageId,
            ],
        );
    }
}
